#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

ARCHIVE_LIMIT = 500
STALE_DAYS = 30


def now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def today_key():
    return date.today().isoformat()


def _parse_time(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def _age_days(value, now=None):
    d = _parse_time(value)
    if not d:
        return 0
    now_dt = _parse_time(now) if now else datetime.now(timezone.utc).astimezone()
    if not now_dt:
        now_dt = datetime.now(timezone.utc).astimezone()
    if d.tzinfo is None:
        d = d.replace(tzinfo=now_dt.tzinfo)
    if now_dt.tzinfo is None:
        now_dt = now_dt.replace(tzinfo=d.tzinfo)
    return max(0, (now_dt - d).total_seconds() / 86400)


def _is_date(value):
    s = str(value or "").strip()
    if len(s) != 10 or s[4] != "-" or s[7] != "-":
        return False
    try:
        date.fromisoformat(s)
        return True
    except Exception:
        return False


def _retire_state(row, kind, today):
    if not isinstance(row, dict):
        return ("invalid", "資料格式無效")
    if row.get("available") is False:
        return ("disabled", "來源標示不可用")
    if row.get("kind") == "reference" or row.get("reference") is True:
        return None
    deadline = str(row.get("deadline") or "").strip()
    event_date = str(row.get("date") or "").strip()
    if _is_date(deadline) and deadline < today:
        return ("expired", "截止日已過")
    if kind == "activity" and not deadline and _is_date(event_date) and event_date < today:
        return ("expired_event", "活動日期已過")
    if kind == "scholarship" and row.get("auto") is True and not (_is_date(deadline) or _is_date(event_date)):
        return ("undated", "無可驗證截止日")
    return None


def _archive_item(row, reason_code, reason_text, now, kind):
    out = dict(row)
    out["archiveKind"] = kind
    out["retiredAt"] = now
    out["retireCode"] = reason_code
    out["retireReason"] = reason_text
    out["lastActiveAt"] = out.get("lastSeen") or out.get("fetchedAt") or out.get("updatedAt") or now
    return out


def _ordered_unique(rows):
    out = []
    pos = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        key = str(row.get("id") or "")
        if not key:
            continue
        if key in pos:
            out[pos[key]] = row
        else:
            pos[key] = len(out)
            out.append(row)
    return out


def _archive_map(rows):
    out = {}
    order = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        key = str(row.get("id") or "")
        if not key:
            continue
        if key not in out:
            order.append(key)
        out[key] = dict(row)
    return out, order


def _archive_finalize(archive_map, order, active_ids):
    rows = []
    seen = set()
    # Newly archived / updated entries are added to the front by callers through order.
    for key in order:
        if key in seen or key in active_ids or key not in archive_map:
            continue
        seen.add(key)
        rows.append(archive_map[key])
    # Safety: include any map entries not present in order.
    for key, row in archive_map.items():
        if key in seen or key in active_ids:
            continue
        seen.add(key)
        rows.append(row)
    rows.sort(key=lambda x: str(x.get("retiredAt") or ""), reverse=True)
    return rows[:ARCHIVE_LIMIT]


def _freshen(new_row, previous, archived, now):
    base = {}
    if isinstance(archived, dict):
        base.update(archived)
    if isinstance(previous, dict):
        base.update(previous)
    base.update(new_row)
    base["firstSeen"] = base.get("firstSeen") or base.get("fetchedAt") or now
    base["lastSeen"] = now
    base["missCount"] = 0
    base["needsReview"] = False
    if archived:
        base["revivedAt"] = now
    for k in ("retiredAt", "retireReason", "retireCode", "archiveKind", "lastActiveAt"):
        base.pop(k, None)
    return base


def reconcile_activity_catalog(*, old_rows, candidate_rows, source_results, archive_rows, now=None, today=None):
    now = now or now_iso()
    today = today or today_key()
    old_rows = [dict(x) for x in old_rows if isinstance(x, dict)]
    candidate_rows = [dict(x) for x in candidate_rows if isinstance(x, dict)]
    old_by = {str(x.get("id") or ""): x for x in old_rows if x.get("id")}
    archive_map, archive_order = _archive_map(archive_rows)

    source_info = []
    for r in source_results if isinstance(source_results, list) else []:
        prefix = str(r.get("prefix") or "")
        if not prefix:
            continue
        source_info.append((prefix, bool(r.get("healthy")), str(r.get("sourceId") or prefix)))

    def owner(row):
        rid = str(row.get("id") or "")
        for prefix, healthy, sid in source_info:
            if rid.startswith(prefix):
                return prefix, healthy, sid
        return None

    stats = {
        "retiredThisRun": 0,
        "revivedThisRun": 0,
        "carriedMissing": 0,
        "retainedOnFailure": 0,
        "needsReview": 0,
        "archiveCount": 0,
    }

    active = []
    active_ids = set()
    fresh_ids = set()

    # Candidate rows already contain all fresh healthy-source rows and all preserved failed-source rows.
    for row in candidate_rows:
        rid = str(row.get("id") or "")
        if not rid:
            continue
        own = owner(row)
        if not own:
            active.append(row)
            active_ids.add(rid)
            continue
        prefix, healthy, _sid = own
        state = _retire_state(row, "activity", today)
        if state:
            archive_map[rid] = _archive_item(row, state[0], state[1], now, "activity")
            archive_order.insert(0, rid)
            stats["retiredThisRun"] += 1
            continue
        if healthy:
            fresh_ids.add(rid)
            archived = archive_map.pop(rid, None)
            prev = old_by.get(rid)
            row = _freshen(row, prev, archived, now)
            if archived:
                stats["revivedThisRun"] += 1
        else:
            # Source failure does not count as a miss. Known valid data remains available.
            stats["retainedOnFailure"] += 1
        active.append(row)
        active_ids.add(rid)

    # Healthy source records missing from this run: immediate expiry if deadline is known,
    # otherwise use the same two-miss + 30-day stale rule as the Chiayi system.
    for old in old_rows:
        rid = str(old.get("id") or "")
        if not rid or rid in active_ids:
            continue
        own = owner(old)
        if not own:
            # Current provisional candidate set should already contain manual rows; preserve defensively.
            active.append(old)
            active_ids.add(rid)
            continue
        _prefix, healthy, _sid = own
        if not healthy:
            active.append(old)
            active_ids.add(rid)
            stats["retainedOnFailure"] += 1
            continue
        state = _retire_state(old, "activity", today)
        if state:
            archive_map[rid] = _archive_item(old, state[0], state[1], now, "activity")
            archive_order.insert(0, rid)
            stats["retiredThisRun"] += 1
            continue
        carried = dict(old)
        carried["missCount"] = max(0, int(carried.get("missCount") or 0)) + 1
        carried["needsReview"] = carried["missCount"] >= 2
        last_seen = carried.get("lastSeen") or carried.get("fetchedAt") or carried.get("updatedAt") or now
        carried["lastSeen"] = last_seen
        if carried["needsReview"] and _age_days(last_seen, now) >= STALE_DAYS:
            archive_map[rid] = _archive_item(carried, "stale_source", "來源連續未出現且超過 30 日", now, "activity")
            archive_order.insert(0, rid)
            stats["retiredThisRun"] += 1
            continue
        stats["carriedMissing"] += 1
        if carried["needsReview"]:
            stats["needsReview"] += 1
        active.append(carried)
        active_ids.add(rid)

    active = _ordered_unique(active)
    active_ids = {str(x.get("id")) for x in active}
    archive = _archive_finalize(archive_map, archive_order, active_ids)
    stats["archiveCount"] = len(archive)
    return active, archive, stats


def reconcile_scholarship_catalog(*, old_rows, candidate_rows, healthy_categories, archive_rows, source_id, now=None, today=None):
    now = now or now_iso()
    today = today or today_key()
    healthy_categories = {str(x) for x in (healthy_categories or set())}
    old_rows = [dict(x) for x in old_rows if isinstance(x, dict)]
    candidate_rows = [dict(x) for x in candidate_rows if isinstance(x, dict)]
    old_by = {str(x.get("id") or ""): x for x in old_rows if x.get("id")}
    archive_map, archive_order = _archive_map(archive_rows)

    def managed(row):
        return row.get("sourceId") == source_id and row.get("auto") is True

    stats = {
        "retiredThisRun": 0,
        "revivedThisRun": 0,
        "carriedMissing": 0,
        "retainedOnFailure": 0,
        "needsReview": 0,
        "archiveCount": 0,
    }

    active = []
    active_ids = set()

    for row in candidate_rows:
        rid = str(row.get("id") or "")
        if not rid:
            continue
        if not managed(row):
            active.append(row)
            active_ids.add(rid)
            continue
        sub = str(row.get("sourceSubId") or "")
        state = _retire_state(row, "scholarship", today)
        if state:
            archive_map[rid] = _archive_item(row, state[0], state[1], now, "scholarship")
            archive_order.insert(0, rid)
            stats["retiredThisRun"] += 1
            continue
        if sub in healthy_categories:
            archived = archive_map.pop(rid, None)
            prev = old_by.get(rid)
            row = _freshen(row, prev, archived, now)
            if archived:
                stats["revivedThisRun"] += 1
        else:
            stats["retainedOnFailure"] += 1
        active.append(row)
        active_ids.add(rid)

    for old in old_rows:
        rid = str(old.get("id") or "")
        if not rid or rid in active_ids:
            continue
        if not managed(old):
            active.append(old)
            active_ids.add(rid)
            continue
        sub = str(old.get("sourceSubId") or "")
        if sub not in healthy_categories:
            active.append(old)
            active_ids.add(rid)
            stats["retainedOnFailure"] += 1
            continue
        state = _retire_state(old, "scholarship", today)
        if state:
            archive_map[rid] = _archive_item(old, state[0], state[1], now, "scholarship")
            archive_order.insert(0, rid)
            stats["retiredThisRun"] += 1
            continue
        carried = dict(old)
        carried["missCount"] = max(0, int(carried.get("missCount") or 0)) + 1
        carried["needsReview"] = carried["missCount"] >= 2
        last_seen = carried.get("lastSeen") or carried.get("fetchedAt") or carried.get("updatedAt") or now
        carried["lastSeen"] = last_seen
        if carried["needsReview"] and _age_days(last_seen, now) >= STALE_DAYS:
            archive_map[rid] = _archive_item(carried, "stale_source", "來源連續未出現且超過 30 日", now, "scholarship")
            archive_order.insert(0, rid)
            stats["retiredThisRun"] += 1
            continue
        stats["carriedMissing"] += 1
        if carried["needsReview"]:
            stats["needsReview"] += 1
        active.append(carried)
        active_ids.add(rid)

    active = _ordered_unique(active)
    active_ids = {str(x.get("id")) for x in active}
    archive = _archive_finalize(archive_map, archive_order, active_ids)
    stats["archiveCount"] = len(archive)
    return active, archive, stats


def archive_document(existing_payload, archive_rows, lifecycle_stats, kind, now=None):
    now = now or now_iso()
    old_meta = existing_payload.get("meta", {}) if isinstance(existing_payload, dict) else {}
    retired_total = int(old_meta.get("retiredTotal") or 0) + int(lifecycle_stats.get("retiredThisRun") or 0)
    revived_total = int(old_meta.get("revivedTotal") or 0) + int(lifecycle_stats.get("revivedThisRun") or 0)
    return {
        "schemaVersion": 1,
        "meta": {
            "kind": kind,
            "updatedAt": now,
            "count": len(archive_rows),
            "retiredThisRun": int(lifecycle_stats.get("retiredThisRun") or 0),
            "revivedThisRun": int(lifecycle_stats.get("revivedThisRun") or 0),
            "retiredTotal": retired_total,
            "revivedTotal": revived_total,
            "retainedOnFailure": int(lifecycle_stats.get("retainedOnFailure") or 0),
            "carriedMissing": int(lifecycle_stats.get("carriedMissing") or 0),
            "needsReview": int(lifecycle_stats.get("needsReview") or 0),
            "policy": "expired-immediate; missing-two-hits-plus-30-days; failed-source-no-miss; source-reappearance-auto-revive",
        },
        "archive": archive_rows,
    }


def atomic_write_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    os.close(fd)
    p = Path(tmp)
    try:
        p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        json.loads(p.read_text(encoding="utf-8"))
        p.replace(path)
    finally:
        p.unlink(missing_ok=True)

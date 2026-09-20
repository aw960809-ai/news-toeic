#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from datetime import datetime, timezone
from pathlib import Path

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def read_json(p):
    return json.loads(Path(p).read_text(encoding='utf-8'))

def write_json(p, obj):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def find_repo(start):
    p = Path(start).expanduser().resolve()
    for q in [p, *p.parents]:
        if (q/'data/activities.json').exists() and (q/'data/activity-sources.json').exists():
            return q
    raise SystemExit('找不到 repository；請用 --repo 指定')

def source_id_of(event):
    if not isinstance(event, dict):
        return ''
    if event.get('sourceId'):
        return str(event['sourceId'])
    auto = event.get('autofetch')
    if isinstance(auto, dict) and auto.get('sourceId'):
        return str(auto['sourceId'])
    return ''

def uniq(values):
    seen, out = set(), []
    for v in values:
        s = str(v or '').strip()
        if not s:
            continue
        k = s.casefold()
        if k not in seen:
            seen.add(k)
            out.append(s)
    return out

def enrich(event, meta):
    out = dict(event)
    sid = str(meta.get('id') or source_id_of(event))
    out['sourceId'] = sid
    out.setdefault('scope', meta.get('scope') or '')
    out.setdefault('sourceCategories', list(meta.get('categories') or []))
    out['sourceTrust'] = meta.get('trustLevel') or 'official'
    out['sourcePriority'] = meta.get('priority')
    out['sourceProfileMatch'] = meta.get('profileMatch') or {}
    pm = meta.get('profileMatch') or {}
    if not out.get('country') and pm.get('country'):
        out['country'] = pm['country']
    cities = pm.get('cities') or []
    if not out.get('city') and cities:
        out['city'] = cities[0]
    schools = pm.get('schoolNames') or []
    if not out.get('schoolName') and schools:
        out['schoolName'] = schools[0]
    if not out.get('category'):
        cats = meta.get('categories') or []
        if cats:
            out['category'] = cats[0]
    return out

def build_coverage(sources):
    school_groups, city_groups, scopes, public_sources = [], [], {}, []

    def merge_group(groups, aliases, sid):
        aliases = uniq(aliases)
        if not aliases:
            return
        alias_keys = {a.casefold() for a in aliases}
        for row in groups:
            row_keys = {a.casefold() for a in row['aliases']}
            if alias_keys & row_keys:
                row['aliases'] = uniq(row['aliases'] + aliases)
                row['sourceIds'] = uniq(row['sourceIds'] + [sid])
                return
        groups.append({'canonical': aliases[0], 'aliases': aliases, 'sourceIds': [sid]})

    for src in sources:
        if not isinstance(src, dict) or not src.get('id'):
            continue
        sid = str(src['id'])
        enabled = src.get('enabled') is True
        scope = str(src.get('scope') or '')
        pm = src.get('profileMatch') or {}
        schools = uniq(pm.get('schoolNames') or [])
        cities = uniq(pm.get('cities') or [])
        public_sources.append({
            'id': sid,
            'name': src.get('name') or sid,
            'enabled': enabled,
            'scope': scope,
            'categories': list(src.get('categories') or []),
            'profileMatch': {'country': pm.get('country') or '', 'cities': cities, 'schoolNames': schools},
        })
        if not enabled:
            continue
        scopes.setdefault(scope or 'unknown', []).append(sid)
        merge_group(school_groups, schools, sid)
        merge_group(city_groups, cities, sid)

    return {
        'schemaVersion': '7B.2-coverage-1',
        'generatedAt': now_iso(),
        'policy': {
            'localCoverageMustMatchUserProfile': True,
            'uncoveredLocalScopeFailClosed': True,
            'browserDirectCrossSiteFetch': False,
            'sourceExpansionViaRegistry': True,
        },
        'schools': school_groups,
        'cities': city_groups,
        'scopes': {k: uniq(v) for k, v in scopes.items()},
        'sources': public_sources,
    }

def run(repo, apply):
    registry = read_json(repo/'data/activity-sources.json')
    payload = read_json(repo/'data/activities.json')
    sources = registry.get('sources', [])
    if not isinstance(sources, list):
        raise SystemExit('sources 必須為 list')
    by_id = {str(x.get('id')): x for x in sources if isinstance(x, dict) and x.get('id')}

    coverage = build_coverage(sources)
    write_json(repo/'data/activity-source-coverage.json', coverage)

    events = payload.get('events', [])
    if not isinstance(events, list):
        raise SystemExit('events 必須為 list')
    enriched, changed, unknown, auto_count = [], 0, {}, 0
    for event in events:
        if not isinstance(event, dict):
            enriched.append(event)
            continue
        sid = source_id_of(event)
        if not sid:
            enriched.append(event)
            continue
        auto_count += 1
        meta = by_id.get(sid)
        if not meta:
            unknown[sid] = unknown.get(sid, 0) + 1
            enriched.append(event)
            continue
        nxt = enrich(event, meta)
        if nxt != event:
            changed += 1
        enriched.append(nxt)

    write_json(repo/'data/staging/activity-source-registry-report.json', {
        'schemaVersion': '7B.2-report-1',
        'generatedAt': now_iso(),
        'mode': 'apply' if apply else 'check',
        'summary': {
            'events': len(events), 'autoEvents': auto_count, 'enrichedEvents': changed,
            'registeredSources': len(by_id), 'unknownSourceIds': unknown,
            'coveredSchools': len(coverage['schools']), 'coveredCities': len(coverage['cities'])
        }
    })

    if apply:
        out = dict(payload)
        out['events'] = enriched
        write_json(repo/'data/activities.json', out)

    print(f"REGISTRY_BRIDGE_OK events={len(events)} auto={auto_count} enriched={changed} "
          f"sources={len(by_id)} unknown={len(unknown)} schools={len(coverage['schools'])} "
          f"cities={len(coverage['cities'])} mode={'apply' if apply else 'check'}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', type=Path)
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    repo = args.repo.expanduser().resolve() if args.repo else find_repo(Path.cwd())
    run(repo, args.apply)

if __name__ == '__main__':
    main()

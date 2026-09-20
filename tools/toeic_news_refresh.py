#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "news.json"

FEEDS = [
    ("Business", "company business employee customer service retail delivery logistics"),
    ("Travel", "airline airport hotel reservation travel passenger rail schedule"),
    ("Technology", "software technology payment app business customer"),
    ("Daily Life", "store restaurant service delivery customer schedule"),
]

ALLOWED_CATEGORIES = {x[0] for x in FEEDS}
EXCLUDE = re.compile(
    r"\b(war|missile|election|murder|shooting|celebrity|football|basketball|baseball|soccer)\b",
    re.I,
)
TAG = re.compile(r"<[^>]+>")
SPACE = re.compile(r"\s+")

def clean(value: str | None) -> str:
    return SPACE.sub(" ", TAG.sub(" ", unescape(value or ""))).strip()

def stable_id(category: str, title: str) -> str:
    digest = hashlib.sha256(f"{category}\n{title}".encode("utf-8")).hexdigest()[:20]
    return f"rss-{category.lower().replace(' ', '-')}-{digest}"

def iso_date(raw: str) -> str:
    raw = clean(raw)
    if not raw:
        return ""
    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return raw

def google_news_url(query: str) -> str:
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"}
    )

def fetch(category: str, query: str) -> list[dict]:
    req = urllib.request.Request(
        google_news_url(query),
        headers={
            "User-Agent": "News-TOEIC-GitHub/2.2 (+https://github.com/aw960809-ai/news-toeic)"
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        xml = response.read()

    root = ET.fromstring(xml)
    rows: list[dict] = []

    for i, item in enumerate(root.findall(".//item")):
        title = clean(item.findtext("title"))
        if not title or EXCLUDE.search(title):
            continue

        link = clean(item.findtext("link"))
        description = clean(item.findtext("description"))
        source_node = item.find("source")
        source = clean(source_node.text if source_node is not None else "")
        published = iso_date(item.findtext("pubDate") or "")

        rows.append({
            "id": stable_id(category, title),
            "category": category,
            "source": source or "News source",
            "title": title,
            "url": link,
            "publishedAt": published,
            "summary": description[:420],
            "toeicScore": 78 - (i % 5),
        })
        if len(rows) >= 10:
            break

    return rows

def validate(payload: dict) -> None:
    rows = payload.get("articles")
    if not isinstance(rows, list) or len(rows) < 8:
        raise ValueError(f"Too few news rows: {len(rows) if isinstance(rows, list) else 'invalid'}")

    ids = [row.get("id") for row in rows]
    titles = [clean(row.get("title")) for row in rows]

    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate article IDs")
    if len(titles) != len(set(titles)):
        raise ValueError("Duplicate article titles")
    if any(str(x).startswith("seed-") for x in ids):
        raise ValueError("Seed rows are not allowed in refreshed output")
    if any(row.get("category") not in ALLOWED_CATEGORIES for row in rows):
        raise ValueError("Unexpected category")
    if any(not clean(row.get("source")) for row in rows):
        raise ValueError("Missing source")
    if any(not clean(row.get("title")) for row in rows):
        raise ValueError("Missing title")
    if any(not str(row.get("url", "")).startswith("http") for row in rows):
        raise ValueError("Missing/invalid source URL")

articles: list[dict] = []
seen_titles: set[str] = set()

for category, query in FEEDS:
    try:
        rows = fetch(category, query)
        print(f"FETCH_OK category={category} rows={len(rows)}")
        for row in rows:
            key = re.sub(r"[^a-z0-9]", "", row["title"].lower())[:120]
            if not key or key in seen_titles:
                continue
            seen_titles.add(key)
            articles.append(row)
    except Exception as exc:
        print(f"WARN category={category} error={exc!r}")

if not articles:
    raise SystemExit("No news rows fetched; existing news.json preserved")

payload = {
    "updatedAt": datetime.now(timezone.utc).isoformat(),
    "articles": articles[:32],
}
validate(payload)

tmp = OUT.with_suffix(".json.tmp")
tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
json.loads(tmp.read_text(encoding="utf-8"))
tmp.replace(OUT)

counts: dict[str, int] = {}
for row in payload["articles"]:
    counts[row["category"]] = counts.get(row["category"], 0) + 1

print(
    "TOEIC_NEWS_OK "
    f"articles={len(payload['articles'])} "
    f"categories={json.dumps(counts, ensure_ascii=False, sort_keys=True)}"
)

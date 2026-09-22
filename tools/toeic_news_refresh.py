#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "news.json"

MAX_NEWS = 60
LIMITS = {
    "Business": 20,
    "Travel": 15,
    "Technology": 15,
    "Daily Life": 10,
}

FEEDS = [
    ("Business", "retail OR company OR workplace OR customer service OR logistics OR hiring OR sales OR delivery when:3d"),
    ("Travel", "airline OR hotel OR airport OR reservation OR tourism OR train when:3d"),
    ("Technology", "technology company OR app OR software OR online service OR payment OR device when:3d"),
    ("Daily Life", "consumer OR shopping OR transportation OR restaurant OR public service OR store OR service when:3d"),
]

TERMS = [
    "company","business","employee","customer","service","retail","store","office","manager",
    "sales","order","delivery","shipment","supplier","schedule","meeting","training","hire",
    "travel","airline","airport","hotel","reservation","ticket","route","passenger","product",
    "launch","expand","price","market","online","application","technology","software","payment",
    "restaurant","transportation","logistics"
]

EXCLUDE = [
    "war","missile","military","election","president","parliament","murder","shooting","crime",
    "celebrity","football","basketball","baseball","soccer","earthquake","hurricane","cancer",
    "quantum","particle"
]

FALLBACK_SEED = [
    ("Business","Retailer Expands Regional Delivery Network","A retail company is expanding its regional delivery service to handle increased online orders."),
    ("Business","Company Adds Customer Support Training","A service company has introduced additional training for customer support employees."),
    ("Business","Logistics Firm Opens Distribution Center","A logistics provider has opened a new distribution facility to shorten delivery times."),
    ("Travel","Airline Adds Seasonal Regional Routes","An airline has announced additional regional routes for the upcoming travel season."),
    ("Travel","Hotel Introduces Faster Digital Check-In","A hotel group is expanding digital check-in options for guests."),
    ("Travel","Rail Operator Revises Weekend Schedule","A passenger rail operator has revised selected weekend schedules."),
    ("Technology","Software Provider Launches Business Training","A software company has added online training for small-business customers."),
    ("Technology","Payment App Adds Receipt Features","A payment application has introduced new digital receipt and account tools."),
    ("Technology","Transit Agency Tests Contactless Payment","A transit agency is testing card and mobile payments on selected routes."),
    ("Daily Life","Cafe Chain Expands Mobile Ordering","A cafe company is expanding mobile ordering after a successful trial."),
    ("Daily Life","Supermarket Adds Evening Delivery Windows","A supermarket chain has added later delivery times for online grocery orders."),
    ("Daily Life","Service Center Extends Weekday Hours","A public service center has extended selected weekday service hours."),
]

TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")

def strip(value: str | None) -> str:
    return SPACE_RE.sub(" ", TAG_RE.sub(" ", unescape(value or ""))).strip()

def fingerprint(value: str) -> str:
    cleaned = value.lower()
    cleaned = re.sub(r"[^a-z0-9\s]", " ", cleaned)
    cleaned = re.sub(r"\b(the|a|an|to|of|and|for|in|on|with|from|at|by)\b", " ", cleaned)
    cleaned = SPACE_RE.sub(" ", cleaned).strip()
    return "-".join(cleaned.split(" ")[:10])

def score(title: str, summary: str) -> int:
    text = f"{title} {summary}".lower()
    s = 56.0
    hits = 0
    for term in TERMS:
        if term in text:
            hits += 1
            s += 2.2
    s += min(18, hits * 1.2)
    for term in EXCLUDE:
        if term in text:
            s -= 18
    return max(0, min(100, round(s)))

def google_news_url(query: str) -> str:
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"}
    )

def parse_source(item: ET.Element) -> tuple[str, str]:
    node = item.find("source")
    if node is None:
        return "", ""
    source = strip(node.text)
    source_url = strip(node.attrib.get("url", ""))
    return source, source_url

def iso_date(raw: str) -> str:
    raw = strip(raw)
    if not raw:
        return datetime.now(timezone.utc).isoformat()
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()

def fetch_feed(category: str, query: str) -> list[dict]:
    req = urllib.request.Request(
        google_news_url(query),
        headers={"User-Agent": "News-TOEIC/1.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        xml = response.read()

    root = ET.fromstring(xml)
    rows: list[dict] = []

    for item in root.findall(".//item"):
        source, source_url = parse_source(item)
        raw_title = strip(item.findtext("title"))
        suffix = f" - {source}" if source else ""
        title = raw_title
        if suffix and raw_title.lower().endswith(suffix.lower()):
            title = raw_title[:-len(suffix)].strip()

        url = strip(item.findtext("link")) or strip(item.findtext("guid"))
        summary = strip(item.findtext("description"))[:700]
        toeic_score = score(title, summary)

        rows.append({
            "id": f"rss-{fingerprint(title)}",
            "origin": "live",
            "articleType": "Live News",
            "category": category,
            "source": source or "News source",
            "sourceUrl": source_url,
            "title": title,
            "url": url,
            "publishedAt": iso_date(item.findtext("pubDate") or ""),
            "summary": summary,
            "toeicScore": toeic_score,
        })

    return rows

def fallback_rows() -> list[dict]:
    now = datetime.now(timezone.utc).isoformat()
    out = []
    for i, (category, title, summary) in enumerate(FALLBACK_SEED):
        out.append({
            "id": f"fallback-{i+1}",
            "origin": "practice",
            "articleType": "Practice Topic",
            "category": category,
            "source": "Practice News Feed",
            "sourceUrl": "",
            "title": title,
            "url": "",
            "publishedAt": now,
            "summary": summary,
            "toeicScore": 82 - (i % 5),
        })
    return out

merged: list[dict] = []

for category, query in FEEDS:
    try:
        rows = fetch_feed(category, query)
        print(f"FETCH_OK category={category} raw={len(rows)}")
        merged.extend(rows)
    except Exception as exc:
        print(f"WARN category={category} error={exc!r}")

seen: set[str] = set()
filtered: list[dict] = []

for row in sorted(merged, key=lambda x: x["toeicScore"], reverse=True):
    if not row["title"] or not row["url"] or row["toeicScore"] < 62:
        continue
    key = fingerprint(row["title"])
    if key in seen:
        continue
    seen.add(key)
    filtered.append(row)

balanced: list[dict] = []

for category, limit in LIMITS.items():
    balanced.extend([x for x in filtered if x["category"] == category][:limit])

picked = {x["id"] for x in balanced}

for row in filtered:
    if len(balanced) >= MAX_NEWS:
        break
    if row["id"] not in picked:
        balanced.append(row)
        picked.add(row["id"])

if not balanced:
    raise SystemExit("No eligible RSS articles; existing news.json preserved")

if len(balanced) < 12:
    for row in fallback_rows():
        if len(balanced) >= 12:
            break
        if row["id"] not in picked:
            balanced.append(row)
            picked.add(row["id"])

payload = {
    "updatedAt": datetime.now(timezone.utc).isoformat(),
    "articles": balanced[:MAX_NEWS],
}

if len(payload["articles"]) < 12:
    raise SystemExit("AppDeploy parity check failed: fewer than 12 news items")

ids = [x["id"] for x in payload["articles"]]
fps = [fingerprint(x["title"]) for x in payload["articles"] if not x["id"].startswith("fallback-")]

if len(ids) != len(set(ids)):
    raise SystemExit("Duplicate IDs detected")
if len(fps) != len(set(fps)):
    raise SystemExit("Duplicate title fingerprints detected")

tmp = OUT.with_suffix(".json.tmp")
tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
json.loads(tmp.read_text(encoding="utf-8"))
tmp.replace(OUT)

counts = {}
for row in payload["articles"]:
    counts[row["category"]] = counts.get(row["category"], 0) + 1

rss_count = sum(1 for x in payload["articles"] if x["id"].startswith("rss-"))
fallback_count = sum(1 for x in payload["articles"] if x["id"].startswith("fallback-"))

print(
    "APPDEPLOY_NEWS_PARITY_OK "
    f"articles={len(payload['articles'])} "
    f"rss={rss_count} fallback={fallback_count} "
    f"categories={json.dumps(counts, ensure_ascii=False, sort_keys=True)}"
)

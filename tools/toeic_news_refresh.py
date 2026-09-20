#!/usr/bin/env python3
from __future__ import annotations
import json, re, urllib.parse, urllib.request
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"apps"/"toeic"/"data"/"news.json"
FEEDS=[
 ("Business","company business employee customer service retail delivery logistics"),
 ("Travel","airline airport hotel reservation travel passenger rail schedule"),
 ("Technology","software technology payment app business customer"),
 ("Daily Life","store restaurant service delivery customer schedule")
]
EXCLUDE=re.compile(r"\b(war|missile|election|murder|shooting|celebrity|football|basketball|baseball|soccer)\b",re.I)
TAG=re.compile(r"<[^>]+>")
SPACE=re.compile(r"\s+")

def clean(v):
    return SPACE.sub(" ",TAG.sub(" ",unescape(v or ""))).strip()

def fetch(cat,q):
    url="https://news.google.com/rss/search?"+urllib.parse.urlencode({"q":q,"hl":"en-US","gl":"US","ceid":"US:en"})
    req=urllib.request.Request(url,headers={"User-Agent":"News-TOEIC-GitHub/2.0"})
    with urllib.request.urlopen(req,timeout=25) as r:
        xml=r.read()
    root=ET.fromstring(xml)
    rows=[]
    for i,item in enumerate(root.findall(".//item")):
        title=clean(item.findtext("title") or "")
        if not title or EXCLUDE.search(title): continue
        link=clean(item.findtext("link") or "")
        desc=clean(item.findtext("description") or "")
        source=""
        node=item.find("source")
        if node is not None and node.text: source=clean(node.text)
        pub=clean(item.findtext("pubDate") or "")
        rows.append({
          "id":f"rss-{cat.lower().replace(' ','-')}-{abs(hash(title))}",
          "category":cat,"source":source or "News source","title":title,
          "url":link,"publishedAt":pub,"summary":desc[:420],"toeicScore":78-(i%5)
        })
        if len(rows)>=10: break
    return rows

articles=[]
seen=set()
for cat,q in FEEDS:
    try:
        for row in fetch(cat,q):
            key=re.sub(r"[^a-z0-9]","",row["title"].lower())[:90]
            if key in seen: continue
            seen.add(key);articles.append(row)
    except Exception as e:
        print(f"WARN {cat}: {e}")

if not articles:
    raise SystemExit("No news rows fetched; existing news.json preserved")

payload={"updatedAt":datetime.now(timezone.utc).isoformat(),"articles":articles[:32]}
tmp=OUT.with_suffix(".json.tmp")
tmp.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
json.loads(tmp.read_text(encoding="utf-8"))
tmp.replace(OUT)
print(f"TOEIC_NEWS_OK articles={len(payload['articles'])}")

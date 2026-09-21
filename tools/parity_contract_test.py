#!/usr/bin/env python3
from pathlib import Path
import json, re, sys

ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/"app.js").read_text(encoding="utf-8")
parity=(ROOT/"appdeploy-parity-runtime.js").read_text(encoding="utf-8")
voice=(ROOT/"voice-image-upgrade.js").read_text(encoding="utf-8")
analysis=(ROOT/"analysis-appdeploy-parity.js").read_text(encoding="utf-8")
pwa=(ROOT/"pwa-runtime.js").read_text(encoding="utf-8")
news_py=(ROOT/"tools/toeic_news_refresh.py").read_text(encoding="utf-8")
wf=(ROOT/".github/workflows/toeic-news.yml").read_text(encoding="utf-8")
data=json.loads((ROOT/"data/news.json").read_text(encoding="utf-8"))

checks = [
 ("daily_three_candidate_roles", all(x in parity for x in ["最佳推薦","最新新聞","能力適配","KEYS.dailyPool"]) and "dailyMainCandidatePool" in app),
 ("daily_selection_lock", "selectedByUser:true" in parity),
 ("daily_self_repair", "ensureDailyCandidates" in parity),
 ("wpm_guard", "wpm>=40&&wpm<=450" in app or ">=40&&x<=450" in app),
 ("article_context_snapshot", "saveReviewSnapshot" in parity and "toeicArticleReviewSnapshotsV1" in app),
 ("review_1_3_7", all(x in app for x in ["86400000","3:7"])),
 ("analysis_six_categories", all(x in analysis for x in ["Core Meaning","Sentence Structure","Chunk / Collocation","Logic / Connection","Reference / Context","Key Expression"])),
 ("analysis_audio_toggle", "toeicToggleSpeech" in analysis and "speechSynthesis.pause" in voice and "speechSynthesis.resume" in voice),
 ("practice_modes", all(x in parity for x in ["quick:{1:1","standard:{1:3","mock:{1:6"])),
 ("practice_block_sizes", "BLOCK_SIZE = {1:1,2:10,3:3,4:3,5:10,6:4,7:5}" in parity),
 ("blueprint_threshold", "QUALITY_THRESHOLD = 82" in parity),
 ("part1_visual_gate", "imageScore:part===1" in parity),
 ("listening_max_two", "最多播放 2 次" in parity),
 ("part3_multi_accent", "speakerVoice" in parity and "plannedAccents" in parity),
 ("accent_analytics", "accentExposure" in parity),
 ("full_mock_counts", "FULL_COUNTS = {1:6,2:25,3:39,4:30,5:30,6:16,7:54}" in parity),
 ("full_mock_resume", "resumeFullMock" in parity),
 ("full_mock_discard", "discardFullMock" in parity),
 ("strict_one_play", "a.mode==='strict'?1:2" in parity),
 ("reading_75_minutes", "READING_SECONDS = 75 * 60" in parity),
 ("mock_hidden_answers", "模考作答中不顯示正解與解析" in parity),
 ("auto_update_30m", "30*60*1000" in pwa or "30 * 60 * 1000" in pwa),
 ("auto_update_mock_guard", "toeicFullMockActive" in pwa),
 ("news_when_3d", "when:3d" in news_py),
 ("news_score_threshold", "toeic_score < 62" in news_py or '["toeicScore"] < 62' in news_py),
 ("news_max_60", "MAX_NEWS = 60" in news_py),
 ("news_category_limits", all(x in news_py for x in ['"Business": 20','"Travel": 15','"Technology": 15','"Daily Life": 10'])),
 ("news_six_hour_schedule", '20 21,3,9,15 * * *' in wf),
 ("news_data_bounds", 12 <= len(data.get("articles",[])) <= 60),
 ("news_no_duplicate_ids", len({x["id"] for x in data.get("articles",[])}) == len(data.get("articles",[]))),
]

failed=[]
for name,ok in checks:
    print(("PASS" if ok else "FAIL"), name)
    if not ok: failed.append(name)

print(f"\nPARITY_CONTRACT {len(checks)-len(failed)}/{len(checks)} PASS")
if failed:
    print("FAILED:", ", ".join(failed))
    sys.exit(1)

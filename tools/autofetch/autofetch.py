#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlparse
from lifecycle_archive import archive_document, atomic_write_json, reconcile_activity_catalog

USER_AGENT = 'GoalManager-AutoFetch/96.6.11.1 (+https://github.com/aw960809-ai/my-goal-manager)'
MAX_BYTES = 2_000_000
AUTO_PREFIX = 'auto-yda-'
THU_AUTO_PREFIX = 'auto-thu-'
TAICHUNG_AUTO_PREFIX = 'auto-tcjob-'
PATHFINDER_AUTO_PREFIX = 'auto-tgpi-'
MOFA_WH_AUTO_PREFIX = 'auto-mofa-wh-'

YDA_LIST = 'https://www.yda.gov.tw/EventList.aspx?pid=56&uid=101'
THU_LIST = 'https://tevent.thu.edu.tw/tEvent_front/index.php'
TAICHUNG_LIST = 'https://1catchjob.taichung.gov.tw/more.aspx?cat=new'
PATHFINDER_DOWNLOADS = 'https://twpathfinder.yda.gov.tw/downloads'
PATHFINDER_OVERVIEW = 'https://twpathfinder.yda.gov.tw/overview1830'
MOFA_WORKING_HOLIDAY = 'https://youthtaiwan.mofa.gov.tw/WorkingHoliday/'

DEADLINE_SIGNAL = re.compile(r'報名截止|截止日期|申請截止|收件截止|徵件期間|報名期間|申請期間|投件期間|額滿提早截止|截止')
DATE_SECTION_SIGNAL = re.compile(r'活動日期及地點|活動時間及地點|活動日期|活動時間|活動期間|辦理日期|體驗期間|展出資訊')
DATE_CONTEXT_SIGNAL = re.compile(r'日期[：:｜|]|時間[：:｜|]|期間[：:｜|]|場次|說明會|宣導會|培訓|展出|體驗')
LOCATION_SIGNAL = re.compile(r'活動地點|體驗地點|辦理地點|說明會場地|地址|地點|場地')
TIME_RE = re.compile(r'(?<!\d)(\d{1,2})[：:](\d{2})(?:\s*[-–~至]\s*(\d{1,2})[：:](\d{2}))?')
FULL_DATE_RE = re.compile(r'(?<!\d)(20\d{2}|\d{3})[./\-年]\s*(\d{1,2})[./\-月]\s*(\d{1,2})日?')
PARTIAL_DATE_RE = re.compile(r'(?<![\d./\-年])(\d{1,2})[./\-月]\s*(\d{1,2})日?')
MAJOR_SECTION_RE = re.compile(r'^[壹貳參肆伍陸柒捌玖拾一二三四五六七八九十]+[、.]')

WORKFLOW = """name: V96.6 Production Activity Radar AutoFetch

on:
  schedule:
    # 09:17 Asia/Taipei (UTC+8)
    - cron: "17 1 * * *"
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: activity-radar-production
  cancel-in-progress: false

jobs:
  autofetch-build-deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Set up Python
        uses: actions/setup-python@v6
        with:
          python-version: "3.12"

      - name: Confirm production branch
        shell: bash
        run: |
          set -euo pipefail
          DEFAULT_BRANCH="${{ github.event.repository.default_branch }}"
          echo "default_branch=$DEFAULT_BRANCH"
          echo "ref_name=$GITHUB_REF_NAME"
          if [ "$GITHUB_REF_NAME" != "$DEFAULT_BRANCH" ]; then
            echo "::error::Production AutoFetch may only run on the default branch."
            exit 1
          fi

      - name: Snapshot production data
        shell: bash
        run: |
          set -euo pipefail
          cp data/activities.json "$RUNNER_TEMP/activities-before.json"
          python -m json.tool "$RUNNER_TEMP/activities-before.json" >/dev/null

      - name: AutoFetch and apply
        shell: bash
        run: |
          set -euo pipefail
          python tools/autofetch/autofetch.py --apply --limit 30
          python -m json.tool data/activities.json >/dev/null

      - name: Production integrity guard
        shell: bash
        run: |
          set -euo pipefail
          python - <<'PY'
          import json
          import os
          from pathlib import Path

          before = json.loads(
              (Path(os.environ["RUNNER_TEMP"]) / "activities-before.json")
              .read_text(encoding="utf-8")
          )
          after = json.loads(
              Path("data/activities.json").read_text(encoding="utf-8")
          )

          old = before.get("events", [])
          new = after.get("events", [])

          if not isinstance(old, list) or not isinstance(new, list):
              raise SystemExit("INTEGRITY_FAIL events must be lists")

          ids = [str(x.get("id", "")) for x in new]
          if any(not x for x in ids):
              raise SystemExit("INTEGRITY_FAIL empty event id")
          if len(ids) != len(set(ids)):
              raise SystemExit("INTEGRITY_FAIL duplicate event ids")

          manual_before = [
              x for x in old if not str(x.get("id", "")).startswith("auto-")
          ]
          manual_after = [
              x for x in new if not str(x.get("id", "")).startswith("auto-")
          ]
          mb = {str(x.get("id", "")): x for x in manual_before}
          ma = {str(x.get("id", "")): x for x in manual_after}

          # AutoFetch is never allowed to delete or mutate manually maintained events.
          if mb != ma:
              removed = sorted(set(mb) - set(ma))
              changed = sorted(k for k in set(mb) & set(ma) if mb[k] != ma[k])
              raise SystemExit(
                  "INTEGRITY_FAIL manual events changed "
                  f"removed={removed[:10]} changed={changed[:10]}"
              )

          old_count = len(old)
          new_count = len(new)
          removed_count = max(0, old_count - new_count)

          # Conservative destructive-change fuse. Small normal expirations are allowed.
          if old_count >= 20 and removed_count >= 10 and new_count < old_count * 0.40:
              raise SystemExit(
                  "INTEGRITY_FAIL destructive shrink "
                  f"before={old_count} after={new_count}"
              )

          print(
              "INTEGRITY_OK "
              f"before={old_count} after={new_count} "
              f"manual={len(manual_after)} "
              f"auto={sum(str(x.get('id','')).startswith('auto-') for x in new)}"
          )
          PY

      - name: Existing QA
        shell: bash
        run: |
          set -euo pipefail
          if [ -f qa_static.py ]; then python qa_static.py; fi
          git diff --check

      - name: Detect production-data change
        id: data_change
        shell: bash
        run: |
          set -euo pipefail
          if git diff --quiet -- data/activities.json; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
            echo "DATA_UNCHANGED"
          else
            echo "changed=true" >> "$GITHUB_OUTPUT"
            echo "DATA_CHANGED"
            git diff --stat -- data/activities.json
          fi

      - name: Persist updated activity data
        if: steps.data_change.outputs.changed == 'true'
        shell: bash
        run: |
          set -euo pipefail
          git config user.name "goal-manager-autofetch[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data/activities.json
          git commit -m "chore(activity-radar): daily autofetch ${GITHUB_RUN_ID} [skip ci]"
          git push origin "HEAD:${GITHUB_REF_NAME}"

      - name: Build site
        shell: bash
        run: |
          set -euo pipefail
          if [ -f tools_build_preview.py ]; then
            python tools_build_preview.py
          fi

          if [ -d _site ]; then
            echo "SITE_DIR=_site" >> "$GITHUB_ENV"
          elif [ -d dist ]; then
            echo "SITE_DIR=dist" >> "$GITHUB_ENV"
          else
            # Package the repository without copying the destination into itself.
            rm -rf _autofetch_site
            mkdir -p _autofetch_site/repo
            tar \
              --exclude='./.git' \
              --exclude='./.github' \
              --exclude='./data/staging' \
              --exclude='./_autofetch_site' \
              -cf - . | tar -xf - -C _autofetch_site/repo
            test -f _autofetch_site/repo/index.html
            echo "SITE_DIR=_autofetch_site/repo" >> "$GITHUB_ENV"
          fi

      - name: Upload AutoFetch audit report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: autofetch-audit-${{ github.run_id }}
          path: |
            data/staging/autofetch-report.json
            data/staging/autofetch-candidates.json
          if-no-files-found: ignore
          retention-days: 14

      - name: Configure GitHub Pages
        uses: actions/configure-pages@v5

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: ${{ env.SITE_DIR }}

      - name: Deploy GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4

      - name: Verify deployed site
        shell: bash
        env:
          PAGE_URL: ${{ steps.deployment.outputs.page_url }}
        run: |
          set -euo pipefail
          echo "Verifying $PAGE_URL"
          curl -fL \
            --retry 6 \
            --retry-delay 5 \
            --retry-all-errors \
            --max-time 30 \
            "$PAGE_URL" >/dev/null
          echo "PRODUCTION_DEPLOY_VERIFY_OK"
"""


SOURCES = {
    'version': '96.6.11.1',
    'mode': 'whitelist',
    'default_enabled': False,
    'sources': [
        {
            'id': 'thu_official',
            'name': '東海大學活動報名系統',
            'scope': 'campus',
            'priority': 1,
            'domain_allowlist': ['thu.edu.tw'],
            'enabled': True,
            'start_urls': [THU_LIST],
            'fetch_type': 'html',
            'trust_level': 'official',
            'notes': 'V96.6.11.1.1 東海大學 tEvent 專用結構化 adapter。',
        },
        {
            'id': 'taichung_job',
            'name': '臺中市就業服務一鍵Catch',
            'scope': 'city',
            'priority': 2,
            'domain_allowlist': ['1catchjob.taichung.gov.tw'],
            'enabled': True,
            'start_urls': [TAICHUNG_LIST],
            'fetch_type': 'html',
            'trust_level': 'official',
            'notes': 'V96.6.11.1.1 臺中市就業服務處活動專用結構化 adapter；排除明確中高齡/銀髮與雇主專屬項目。',
        },
        {
            'id': 'pathfinder_official',
            'name': '青年百億海外圓夢基金計畫',
            'scope': 'overseas',
            'priority': 4,
            'domain_allowlist': ['twpathfinder.yda.gov.tw'],
            'enabled': True,
            'start_urls': [PATHFINDER_DOWNLOADS, PATHFINDER_OVERVIEW],
            'fetch_type': 'html',
            'trust_level': 'official',
            'notes': 'V96.6.11.1.1 海外翱翔組官方申請窗口 adapter。',
        },
        {
            'id': 'mofa_working_holiday',
            'name': '外交部青年度假打工',
            'scope': 'overseas',
            'priority': 4,
            'domain_allowlist': ['youthtaiwan.mofa.gov.tw'],
            'enabled': True,
            'start_urls': [MOFA_WORKING_HOLIDAY],
            'fetch_type': 'html',
            'trust_level': 'official',
            'notes': 'V96.6.11.1.1 外交部青年度假打工常設官方入口。',
        },
        {
            'id': 'yda_official',
            'name': '教育部青年發展署',
            'scope': 'national',
            'priority': 3,
            'domain_allowlist': ['yda.gov.tw'],
            'enabled': True,
            'start_urls': [YDA_LIST],
            'fetch_type': 'html',
            'trust_level': 'official',
            'notes': 'V96.6.11.1.1 青年署專用結構化 adapter。',
        },
    ],
}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def log(message):
    print(message, flush=True)


def find_repo(start: Path) -> Path:
    p = start.expanduser().resolve()
    for q in [p, *p.parents]:
        if (q / '.git').exists() and (q / 'data/activities.json').exists():
            return q
    raise SystemExit('找不到 repository；請用 --repo 指定 ~/goal-manager-work/github-v96.5')


def install(repo: Path, src: Path):
    branch = subprocess.run(
        ['git', 'branch', '--show-current'], cwd=repo, text=True, capture_output=True
    ).stdout.strip()
    if branch == 'main':
        raise SystemExit('安全保護：拒絕直接安裝到 main，請先切到 v96.6-auto-fetch')

    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = repo / 'data/staging' / f'installer-backup-{stamp}'
    backup.mkdir(parents=True, exist_ok=True)

    dest = repo / 'tools/autofetch/autofetch.py'
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        shutil.copy2(dest, backup / 'autofetch.py')
    shutil.copy2(src, dest)

    write_json(repo / 'tools/autofetch/sources.json', SOURCES)
    wf = repo / '.github/workflows/autofetch.yml'
    wf.parent.mkdir(parents=True, exist_ok=True)
    wf.write_text(WORKFLOW, encoding='utf-8')

    staging = repo / 'data/staging'
    staging.mkdir(parents=True, exist_ok=True)
    (staging / '.gitkeep').touch()
    (staging / '.gitignore').write_text('*\n!.gitignore\n!.gitkeep\n', encoding='utf-8')

    subprocess.run([sys.executable, '-m', 'py_compile', str(dest)], check=True)
    read_json(repo / 'data/activities.json')
    log('INSTALL_OK version=96.6.11.1')
    log('下一步： python tools/autofetch/autofetch.py --check --limit 12  （五來源安全檢查；正式排程僅於 default branch 套用、保存、部署）')


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in {'script', 'style', 'noscript'}:
            self.skip += 1
        if tag == 'a':
            href = dict(attrs).get('href')
            if href:
                self.links.append(href)

    def handle_endtag(self, tag):
        if tag.lower() in {'script', 'style', 'noscript'} and self.skip:
            self.skip -= 1


class YDADetailParser(HTMLParser):
    """Extract only the activity article between its real heading and '更多活動'."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.heading_tag = None
        self.heading_parts = []
        self.section_seen = False
        self.started = False
        self.ended = False
        self.title = None
        self.lines = []
        self.fallback = []

    @staticmethod
    def clean(value):
        return re.sub(r'\s+', ' ', value.replace('\u3000', ' ')).strip()

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in {'script', 'style', 'noscript'}:
            self.skip += 1
        if tag in {'h1', 'h2', 'h3', 'h4'}:
            self.heading_tag = tag
            self.heading_parts = []

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in {'script', 'style', 'noscript'} and self.skip:
            self.skip -= 1
        if self.heading_tag == tag:
            heading = self.clean(' '.join(self.heading_parts))
            self.heading_tag = None
            self.heading_parts = []
            if not heading:
                return
            if heading == '活動專區':
                self.section_seen = True
                return
            if self.section_seen and not self.started and heading not in {'活動列表', '成果分享'}:
                self.title = heading
                self.started = True
                self.lines.append(heading)
                return
            if self.started and not self.ended:
                if '更多活動' in heading:
                    self.ended = True
                else:
                    self.lines.append(heading)

    def handle_data(self, data):
        if self.skip:
            return
        text = self.clean(data)
        if not text:
            return
        self.fallback.append(text)
        if self.heading_tag:
            self.heading_parts.append(text)
            return
        if self.started and not self.ended:
            if '更多活動' in text:
                self.ended = True
                return
            self.lines.append(text)



class PlainTextParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.lines = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() in {'script', 'style', 'noscript'}:
            self.skip += 1

    def handle_endtag(self, tag):
        if tag.lower() in {'script', 'style', 'noscript'} and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if self.skip:
            return
        value = re.sub(r'\s+', ' ', data.replace('\u3000', ' ')).strip()
        if value:
            self.lines.append(value)


def parse_plain_lines(body):
    p = PlainTextParser()
    p.feed(decode_body(body))
    out = []
    for line in p.lines:
        if out and out[-1] == line:
            continue
        out.append(line)
    return out


def allowed(host, allowlist):
    host = (host or '').lower().strip('.')
    return any(host == a or host.endswith('.' + a) for a in [x.lower().strip('.') for x in allowlist])


def fetch(url, allowlist):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not allowed(parsed.hostname, allowlist):
        raise RuntimeError('URL 白名單拒絕')
    cmd = [
        'curl', '--fail', '--location', '--silent', '--show-error',
        '--connect-timeout', '10', '--max-time', '30',
        '--proto', '=https', '--proto-redir', '=https',
        '--user-agent', USER_AGENT,
        '--write-out', '\n__META__%{url_effective}\t%{http_code}',
        url,
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(result.stderr.decode('utf-8', 'replace').strip())
    marker = b'\n__META__'
    pos = result.stdout.rfind(marker)
    if pos < 0:
        raise RuntimeError('curl metadata missing')
    body = result.stdout[:pos]
    meta = result.stdout[pos + len(marker):].decode('utf-8', 'replace').split('\t')
    final, status = meta[0].strip(), meta[1].strip()
    final_p = urlparse(final)
    if status != '200' or final_p.scheme != 'https' or not allowed(final_p.hostname, allowlist):
        raise RuntimeError(f'HTTP/redirect 驗證失敗 {status}')
    if len(body) > MAX_BYTES:
        raise RuntimeError('頁面過大')
    return final, body


def decode_body(body: bytes) -> str:
    # YDA is UTF-8. Keep a conservative fallback for malformed responses.
    text = body.decode('utf-8', 'replace')
    if text.count('\ufffd') > max(10, len(text) // 200):
        try:
            alt = body.decode('cp950')
            if alt.count('\ufffd') < text.count('\ufffd'):
                return alt
        except Exception:
            pass
    return text


def discover_links(body: bytes, base: str):
    parser = LinkParser()
    parser.feed(decode_body(body))
    seen = set()
    output = []
    for href in parser.links:
        u = urlparse(urljoin(base, href))._replace(fragment='').geturl()
        if u not in seen:
            seen.add(u)
            output.append(u)
    return output


def fallback_detail(parser: YDADetailParser):
    lines = parser.fallback
    start = None
    for i, line in enumerate(lines):
        if ('Ctrl+P' in line or 'ctrl+P' in line) and ('列印' in line or '鍵盤' in line):
            start = i + 1
    if start is None:
        return None, []
    body = lines[start:]
    for i, line in enumerate(body):
        if '更多活動' in line:
            body = body[:i]
            break
    ignored = {'活動專區', '活動列表', '小', '中', '大', '分享', 'Facebook', 'Line', 'Twitter', ':::'}
    body = [x for x in body if x not in ignored]
    title = None
    for x in body[:12]:
        if 4 <= len(x) <= 180 and x not in ignored:
            title = x
            break
    return title, body


def parse_yda_detail(body: bytes):
    parser = YDADetailParser()
    parser.feed(decode_body(body))
    title = parser.title
    lines = parser.lines
    if not title or len(lines) < 2:
        title, lines = fallback_detail(parser)
    # Normalize duplicates caused by nested inline elements while preserving order.
    out = []
    for line in lines:
        line = re.sub(r'\s+', ' ', line).strip()
        if not line:
            continue
        if out and line == out[-1]:
            continue
        out.append(line)
    return title, out


def is_detail(url):
    p = urlparse(url)
    q = parse_qs(p.query)
    return (
        p.scheme == 'https'
        and p.hostname in {'yda.gov.tw', 'www.yda.gov.tw'}
        and p.path.lower().endswith('/eventdoc.aspx')
        and bool(q.get('eid') and q['eid'][0].isdigit())
    )


def eid(url):
    return parse_qs(urlparse(url).query).get('eid', [''])[0]


def roc(year):
    year = int(year)
    return year + 1911 if year < 1911 else year


def mkdate(year, month, day):
    try:
        return date(int(year), int(month), int(day)).isoformat()
    except Exception:
        return None


def context_year(title, lines):
    for line in [title or '', *lines[:40]]:
        m = re.search(r'(?<!\d)(20\d{2})年?', line)
        if m:
            return int(m.group(1))
        m = re.search(r'(?<!\d)(\d{3})年', line)
        if m:
            return roc(m.group(1))
    return None


WEEKDAY_MAP = {
    '一': 0, '二': 1, '三': 2, '四': 3,
    '五': 4, '六': 5, '日': 6, '天': 6,
}


def year_from_weekday(line, match, context):
    """Resolve partial M/D dates using a nearby Chinese weekday.

    Weekday evidence overrides a plan/program year from the title.
    Example: "115年...計畫" can describe a briefing held
    on 2025-11-26（週三）for the 2026 plan year.
    """
    tail = line[match.end():match.end() + 18]
    wm = re.search(r'[（(]?\s*(?:週|星期)\s*([一二三四五六日天])', tail)
    if not wm:
        return None

    target = WEEKDAY_MAP[wm.group(1)]
    month = int(match.group(1))
    day = int(match.group(2))
    base = int(context or date.today().year)

    candidates = [
        base, base - 1, base + 1, base - 2, base + 2,
        date.today().year, date.today().year - 1, date.today().year + 1,
    ]

    seen = set()
    for y in candidates:
        if y in seen:
            continue
        seen.add(y)
        try:
            d = date(y, month, day)
        except ValueError:
            continue
        if d.weekday() == target:
            return y
    return None


def dates_in_line(line, year):
    values = []
    spans = []

    for m in FULL_DATE_RE.finditer(line):
        value = mkdate(roc(m.group(1)), m.group(2), m.group(3))
        if value:
            values.append(value)
            spans.append(m.span())

    for m in PARTIAL_DATE_RE.finditer(line):
        if any(a <= m.start() < b for a, b in spans):
            continue

        resolved_year = year_from_weekday(line, m, year)
        if resolved_year is None:
            resolved_year = year

        if resolved_year:
            value = mkdate(resolved_year, m.group(1), m.group(2))
            if value:
                values.append(value)

    return list(dict.fromkeys(values))


def deadline_of(lines, year):
    for line in lines:
        if DEADLINE_SIGNAL.search(line):
            ds = dates_in_line(line, year)
            if ds:
                return ds[-1]
    return None


def section_event_dates(lines, year, deadline):
    """Prefer dates inside a named activity-date section."""
    collected = []
    active = False
    for i, line in enumerate(lines):
        if DATE_SECTION_SIGNAL.search(line):
            active = True
            ds = dates_in_line(line, year)
            collected.extend(ds)
            continue
        if active:
            if DEADLINE_SIGNAL.search(line) or '重要時程' in line or '報名方式' in line or '報名連結' in line:
                break
            if MAJOR_SECTION_RE.match(line) and not DATE_CONTEXT_SIGNAL.search(line):
                break
            ds = dates_in_line(line, year)
            collected.extend(ds)
            if len(collected) >= 12:
                break
    collected = [d for d in dict.fromkeys(collected) if d != deadline]
    if collected:
        return collected[0], (collected[-1] if len(collected) > 1 else None)
    return None, None


def scored_event_dates(lines, year, deadline):
    candidates = []
    for i, line in enumerate(lines):
        ds = dates_in_line(line, year)
        if not ds:
            continue
        score = 0
        if DATE_CONTEXT_SIGNAL.search(line):
            score += 8
        if TIME_RE.search(line):
            score += 6
        if any(k in line for k in ['活動', '體驗', '展出', '培訓', '宣導會', '說明會', '課程場', '實作場']):
            score += 4
        if DEADLINE_SIGNAL.search(line):
            score -= 12
        if any(k in line for k in ['公告', '發布', '更新', '敬啟']):
            score -= 10
        if re.fullmatch(r'\s*(?:20\d{2}|\d{3})年\d{1,2}月\d{1,2}日\s*', line):
            score -= 8
        candidates.append((score, -i, ds))
    if not candidates:
        return None, None
    candidates.sort(reverse=True)
    best = candidates[0][0]
    selected = []
    for score, _, ds in candidates:
        if score < max(1, best - 2):
            continue
        for d in ds:
            if d != deadline and d not in selected:
                selected.append(d)
    if selected:
        return selected[0], (selected[-1] if len(selected) > 1 else None)
    return None, None


def event_dates(lines, year, deadline):
    start, end = section_event_dates(lines, year, deadline)
    if start:
        return start, end
    return scored_event_dates(lines, year, deadline)


def location_of(lines):
    for line in lines:
        if not LOCATION_SIGNAL.search(line):
            continue
        value = re.split(r'活動地點|體驗地點|辦理地點|說明會場地|地址|地點|場地', line, maxsplit=1)[-1]
        value = value.lstrip('：:｜|◎●• -–—').strip()
        if value and len(value) <= 300:
            return value
    return None


def time_of(lines):
    for line in lines:
        if DATE_CONTEXT_SIGNAL.search(line) or '場次' in line:
            m = TIME_RE.search(line)
            if m:
                return f'{int(m.group(1)):02d}:{m.group(2)}' + (
                    f'–{int(m.group(3)):02d}:{m.group(4)}' if m.group(3) else ''
                )
    return ''


def classify(title, body, location):
    s = f'{title} {body[:2500]} {location or ""}'
    scope = '線上／海外' if re.search(r'海外|國際|度假打工|交換|全球|Webex|Google Meet|線上', s, re.I) else '全臺'
    if re.search(r'法律|憲法|民法|刑法|學術', s):
        typ = '法律／學術'
    elif re.search(r'英語|日語|語言|國際|海外|交換|度假打工', s):
        typ = '語言／國際'
    elif re.search(r'工作|實習|職涯|履歷|創業|職場|培訓', s):
        typ = '職涯／實習'
    elif re.search(r'青少年|教育|教學|課程|營隊', s):
        typ = '教育／青少年'
    else:
        typ = '公共參與'
    return scope, typ


def build_candidate(url, body):
    title, lines = parse_yda_detail(body)
    if not title:
        return None, 'no_activity_heading'
    if title in {'活動專區', '活動列表'} or '活動列表 - 教育部青年發展署' in title:
        return None, 'generic_heading'
    if len(title) < 4 or len(title) > 180:
        return None, 'invalid_heading_length'
    if len(lines) < 2:
        return None, 'article_too_short'

    year = context_year(title, lines)
    deadline = deadline_of(lines, year)
    start, end = event_dates(lines, year, deadline)
    location = location_of(lines)
    time_value = time_of(lines)
    scope, typ = classify(title, '\n'.join(lines), location)

    action_date = start or deadline or ''
    status = ['教育部青年發展署官方活動']
    if start:
        status.append('活動日 ' + start + (('–' + end) if end else ''))
    if deadline:
        status.append('截止 ' + deadline)

    candidate = {
        'id': AUTO_PREFIX + eid(url),
        'title': title,
        'date': action_date,
        'time': time_value,
        'scope': scope,
        'type': typ,
        'kind': 'event',
        'url': url,
        'keywords': f'{title} 青年 教育部 青年發展署 {typ} {scope}',
        'direct': True,
        'team': False,
        'available': True,
        'source': '教育部青年發展署',
        'statusText': '；'.join(status),
        'government': True,
        'deadline': deadline or '',
        'eventEndDate': end or '',
        'location': location or '',
        'autofetch': {
            'engine': 'V96.6.11.1.1',
            'sourceId': 'yda_official',
            'eid': eid(url),
            'fetchedAt': now_iso(),
        },
    }
    return candidate, None



class THUDetailParser(HTMLParser):
    """Lightweight parser for Tunghai tEvent detail pages."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.in_h1 = False
        self.h1_parts = []
        self.title = None
        self.lines = []

    @staticmethod
    def clean(value):
        return re.sub(r'\s+', ' ', value.replace('\u3000', ' ')).strip()

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in {'script', 'style', 'noscript'}:
            self.skip += 1
        if tag == 'h1':
            self.in_h1 = True
            self.h1_parts = []

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in {'script', 'style', 'noscript'} and self.skip:
            self.skip -= 1
        if tag == 'h1' and self.in_h1:
            title = self.clean(' '.join(self.h1_parts))
            if title:
                self.title = title
            self.in_h1 = False
            self.h1_parts = []

    def handle_data(self, data):
        if self.skip:
            return
        value = self.clean(data)
        if not value:
            return
        if self.in_h1:
            self.h1_parts.append(value)
        self.lines.append(value)


def parse_thu_detail(body: bytes):
    parser = THUDetailParser()
    parser.feed(decode_body(body))
    out = []
    for line in parser.lines:
        line = re.sub(r'\s+', ' ', line).strip()
        if not line:
            continue
        if out and line == out[-1]:
            continue
        out.append(line)
    return parser.title, out


def is_thu_detail(url):
    p = urlparse(url)
    q = parse_qs(p.query)
    code = q.get('conference_code', [''])[0]
    return (
        p.scheme == 'https'
        and p.hostname == 'tevent.thu.edu.tw'
        and p.path.lower().endswith('/tevent_front/tevent.php')
        and bool(re.fullmatch(r'\d{8,14}', code))
    )


def thu_code(url):
    return parse_qs(urlparse(url).query).get('conference_code', [''])[0]


REG_RANGE_RE = re.compile(
    r'報名起迄\s*'
    r'(\d{4}-\d{2}-\d{2})\s+\d{1,2}:\d{2}\s*~\s*'
    r'(\d{4}-\d{2}-\d{2})\s+\d{1,2}:\d{2}'
)

SESSION_RE = re.compile(
    r'(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})'
    r'(?:\s+(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2}))?'
)


def field_after(lines, label):
    for i, line in enumerate(lines):
        if line == label:
            if i + 1 < len(lines):
                value = lines[i + 1].strip()
                if value and value != label:
                    return value
        if line.startswith(label):
            value = line[len(label):].lstrip('：:｜| ').strip()
            if value:
                return value
    return None



def thu_audience(lines):
    """Extract the Open Audience section from THU tEvent pages."""
    start = None
    end_labels = {
        '承辦單位', '承辦人員', '活動簡介', '活動詳情',
        '附加檔案', '相關連結', '活動備註', '活動報名',
    }

    for i, line in enumerate(lines):
        if line == '開放對象' or line.startswith('開放對象'):
            start = i
            break

    if start is None:
        return ''

    parts = []
    first = lines[start]
    inline = first[len('開放對象'):].lstrip('：:｜| ').strip()
    if inline:
        parts.append(inline)

    for line in lines[start + 1:start + 10]:
        if line in end_labels:
            break
        if any(line.startswith(label) for label in end_labels):
            break
        if line not in {'說明：', '說明:', '費用：0', '費用:0'}:
            parts.append(line)

    value = '；'.join(parts)
    value = re.sub(r'\s+', ' ', value).strip('； ')
    return value


def thu_registration_deadline(lines):
    joined = '\n'.join(lines)
    m = REG_RANGE_RE.search(joined)
    return m.group(2) if m else None


def thu_session(lines):
    """Return (start, end, time, location) from the registration-session table."""
    start_index = 0
    for i, line in enumerate(lines):
        if '報名場次' in line or line == '活動 報名' or line == '活動報名':
            start_index = i

    for i in range(start_index, len(lines)):
        m = SESSION_RE.search(lines[i])
        if not m:
            continue
        start, end = m.group(1), m.group(2)
        time_value = ''
        if m.group(3):
            time_value = m.group(3) + (('–' + m.group(4)) if m.group(4) else '')

        location = None
        for candidate in reversed(lines[max(start_index, i - 7):i]):
            c = candidate.strip()
            if not c or c in {'地 點', '日期', '日 期', '時間', '時 間', '場次名稱'}:
                continue
            if c.startswith('加入Google') or c == lines[0]:
                continue
            if re.search(r'東海|臺中|台中|教室|大樓|館|廳|中心|線上|Teams|Meet|Zoom|校區|聚落|室', c):
                location = c[:300]
                break
        return start, end, time_value, location

    return None, None, '', None


def thu_body_event_date(title, lines, deadline):
    year = context_year(title, lines)
    start, end = event_dates(lines, year, deadline)
    return start, end, time_of(lines), location_of(lines)


def build_thu_candidate(url, body):
    title, lines = parse_thu_detail(body)
    if not title or len(title) < 4 or len(title) > 200:
        return None, 'invalid_heading'
    if len(lines) < 3:
        return None, 'article_too_short'

    deadline = thu_registration_deadline(lines)
    start, end, time_value, location = thu_session(lines)

    if not start:
        b_start, b_end, b_time, b_location = thu_body_event_date(title, lines, deadline)
        start, end = b_start, b_end
        time_value = time_value or b_time
        location = location or b_location

    organizer = field_after(lines, '承辦單位') or ''
    audience = thu_audience(lines)
    category = ''
    title_idx = lines.index(title) if title in lines else 0
    for candidate in reversed(lines[max(0, title_idx - 4):title_idx]):
        if candidate in {'教育活動', '學術活動', '藝文活動', '育樂活動', '其他活動', '教師專業成長活動', '導師知能研習課程'}:
            category = candidate
            break

    scope, typ = classify(title, '\n'.join(lines), location)
    scope = '東海校內'

    if category == '學術活動':
        typ = '法律／學術' if re.search(r'法律|憲法|民法|刑法|法學', '\n'.join(lines)) else '學術／講座'
    elif category == '教育活動' and typ == '公共參與':
        typ = '教育／青少年'

    status = ['東海大學官方活動']
    if organizer:
        status.append('承辦 ' + organizer)
    if start:
        status.append('活動日 ' + start + (('–' + end) if end and end != start else ''))
    if deadline:
        status.append('截止 ' + deadline)

    action_date = start or deadline or ''
    code = thu_code(url)

    return {
        'id': THU_AUTO_PREFIX + code,
        'title': title,
        'date': action_date,
        'time': time_value,
        'scope': scope,
        'type': typ,
        'kind': 'event',
        'url': url,
        'keywords': f'{title} 東海大學 {organizer} {category} {audience} {typ} 校內',
        'direct': True,
        'team': False,
        'available': True,
        'source': '東海大學活動報名系統',
        'statusText': '；'.join(status),
        'government': False,
        'deadline': deadline or '',
        'eventEndDate': end or '',
        'location': location or '',
        'organizer': organizer,
        'audience': audience,
        'autofetch': {
            'engine': 'V96.6.11.1.1',
            'sourceId': 'thu_official',
            'conferenceCode': code,
            'fetchedAt': now_iso(),
        },
    }, None


def source_health(discovered, parsed_ok, fetch_failed):
    if discovered <= 0:
        return False
    return (
        parsed_ok >= max(1, (discovered * 7) // 10)
        and fetch_failed <= max(1, discovered // 5)
    )


def run_yda_source(limit):
    src = next(x for x in SOURCES['sources'] if x['id'] == 'yda_official')
    allowlist = src['domain_allowlist']
    final, body = fetch(YDA_LIST, allowlist)
    links = discover_links(body, final)

    details = []
    seen = set()
    for url in links:
        if is_detail(url) and eid(url) not in seen:
            seen.add(eid(url))
            details.append(url)
        if len(details) >= limit:
            break

    accepted = []
    skipped_past = 0
    rejected = []
    fetch_failed = []
    parsed_ok = 0

    for i, url in enumerate(details, 1):
        try:
            _, detail_body = fetch(url, allowlist)
            candidate, reason = build_candidate(url, detail_body)
            if candidate is None:
                rejected.append({'url': url, 'reason': reason})
                log(f'YDA {i:02d}/{len(details):02d} REJECT reason={reason}')
                continue
            parsed_ok += 1
            actionable, action_reason = actionable_status(candidate)
            if actionable:
                accepted.append(candidate)
                log(
                    f'YDA {i:02d}/{len(details):02d} ACCEPT '
                    f'reason={action_reason} date={candidate["date"] or "-"} '
                    f'deadline={candidate["deadline"] or "-"} '
                    f'title={candidate["title"]}'
                )
            else:
                skipped_past += 1
                label = 'SKIP_DEADLINE' if action_reason == 'deadline_passed' else 'SKIP_PAST'
                log(
                    f'YDA {i:02d}/{len(details):02d} {label} '
                    f'date={candidate["date"] or "-"} '
                    f'deadline={candidate["deadline"] or "-"} '
                    f'title={candidate["title"]}'
                )
        except Exception as exc:
            fetch_failed.append({'url': url, 'reason': str(exc)})
            log(f'YDA {i:02d}/{len(details):02d} FAIL {exc}')

    accepted = list({c['id']: c for c in accepted}.values())
    return {
        'sourceId': 'yda_official',
        'prefix': AUTO_PREFIX,
        'discovered': len(details),
        'parsedOk': parsed_ok,
        'accepted': accepted,
        'skippedPast': skipped_past,
        'rejected': rejected,
        'fetchFailures': fetch_failed,
        'healthy': source_health(len(details), parsed_ok, len(fetch_failed)),
    }


def run_thu_source(limit):
    src = next(x for x in SOURCES['sources'] if x['id'] == 'thu_official')
    allowlist = src['domain_allowlist']

    details = []
    seen = set()
    list_failures = []

    # Current tEvent listing is paginated; stop once the requested detail limit is reached.
    for page in range(1, 6):
        list_url = THU_LIST if page == 1 else f'{THU_LIST}?page={page}'
        try:
            final, body = fetch(list_url, allowlist)
        except Exception as exc:
            list_failures.append({'url': list_url, 'reason': str(exc)})
            log(f'THU LIST page={page} FAIL {exc}')
            continue

        page_new = 0
        for url in discover_links(body, final):
            if is_thu_detail(url):
                code = thu_code(url)
                if code and code not in seen:
                    seen.add(code)
                    details.append(url)
                    page_new += 1
                    if len(details) >= limit:
                        break
        if len(details) >= limit:
            break
        if page > 1 and page_new == 0:
            break

    accepted = []
    skipped_past = 0
    rejected = []
    fetch_failed = list(list_failures)
    parsed_ok = 0

    for i, url in enumerate(details, 1):
        try:
            _, detail_body = fetch(url, allowlist)
            candidate, reason = build_thu_candidate(url, detail_body)
            if candidate is None:
                rejected.append({'url': url, 'reason': reason})
                log(f'THU {i:02d}/{len(details):02d} REJECT reason={reason}')
                continue
            parsed_ok += 1
            actionable, action_reason = actionable_status(candidate)
            if actionable:
                accepted.append(candidate)
                log(
                    f'THU {i:02d}/{len(details):02d} ACCEPT '
                    f'reason={action_reason} date={candidate["date"] or "-"} '
                    f'deadline={candidate["deadline"] or "-"} '
                    f'title={candidate["title"]}'
                )
            else:
                skipped_past += 1
                label = 'SKIP_DEADLINE' if action_reason == 'deadline_passed' else 'SKIP_PAST'
                log(
                    f'THU {i:02d}/{len(details):02d} {label} '
                    f'date={candidate["date"] or "-"} '
                    f'deadline={candidate["deadline"] or "-"} '
                    f'title={candidate["title"]}'
                )
        except Exception as exc:
            fetch_failed.append({'url': url, 'reason': str(exc)})
            log(f'THU {i:02d}/{len(details):02d} FAIL {exc}')

    accepted = list({c['id']: c for c in accepted}.values())
    return {
        'sourceId': 'thu_official',
        'prefix': THU_AUTO_PREFIX,
        'discovered': len(details),
        'parsedOk': parsed_ok,
        'accepted': accepted,
        'skippedPast': skipped_past,
        'rejected': rejected,
        'fetchFailures': fetch_failed,
        'healthy': source_health(len(details), parsed_ok, len(fetch_failed)),
    }



class TaichungDetailParser(HTMLParser):
    """Parser for 1catchjob.taichung.gov.tw detail.aspx pages."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.heading_tag = None
        self.heading_parts = []
        self.title = None
        self.lines = []

    @staticmethod
    def clean(value):
        return re.sub(r'\s+', ' ', value.replace('\u3000', ' ')).strip()

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in {'script', 'style', 'noscript'}:
            self.skip += 1
        if tag in {'h1', 'h2'}:
            self.heading_tag = tag
            self.heading_parts = []

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in {'script', 'style', 'noscript'} and self.skip:
            self.skip -= 1
        if self.heading_tag == tag:
            heading = self.clean(' '.join(self.heading_parts))
            if heading and '就業服務一鍵Catch報名網' not in heading:
                self.title = heading
            self.heading_tag = None
            self.heading_parts = []

    def handle_data(self, data):
        if self.skip:
            return
        value = self.clean(data)
        if not value:
            return
        if self.heading_tag:
            self.heading_parts.append(value)
        self.lines.append(value)


def parse_taichung_detail(body):
    parser = TaichungDetailParser()
    parser.feed(decode_body(body))

    output = []
    for line in parser.lines:
        line = re.sub(r'\s+', ' ', line).strip()
        if not line:
            continue
        if output and output[-1] == line:
            continue
        output.append(line)

    return parser.title, output


def is_taichung_detail(url):
    p = urlparse(url)
    q = parse_qs(p.query)
    act = q.get('act', [''])[0]
    return (
        p.scheme == 'https'
        and p.hostname == '1catchjob.taichung.gov.tw'
        and p.path.lower().endswith('/detail.aspx')
        and bool(re.fullmatch(r'\d{1,8}', act))
    )


def taichung_act(url):
    return parse_qs(urlparse(url).query).get('act', [''])[0]


def labelled_value(lines, label):
    """Read both '標籤 : 值' and label/value split across adjacent text nodes."""
    normalized_label = re.sub(r'\s+', '', label)
    for i, line in enumerate(lines):
        compact = re.sub(r'\s+', '', line)
        if compact == normalized_label:
            if i + 1 < len(lines):
                nxt = lines[i + 1].lstrip('：:｜| ').strip()
                if nxt:
                    return nxt
        if compact.startswith(normalized_label):
            value = re.sub(r'^\s*' + re.escape(label) + r'\s*[：:]?\s*', '', line).strip()
            if value and value != line:
                return value
            # compact labels can include spaces in HTML
            m = re.match(r'^.*?[：:]\s*(.+)$', line)
            if m:
                return m.group(1).strip()
    return None


TAICHUNG_EVENT_DATE_RE = re.compile(
    r'活動日期\s*[：:]\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})'
    r'(?:\s+(\d{1,2}):(\d{2}))?'
)
TAICHUNG_REG_RE = re.compile(
    r'報名日期\s*[：:]\s*'
    r'(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})\s+\d{1,2}:\d{2}'
    r'\s*~\s*'
    r'(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})\s+(\d{1,2}):(\d{2})'
)


def taichung_dates(lines):
    joined = '\n'.join(lines)
    event_date = None
    time_value = ''
    deadline = None

    m = TAICHUNG_EVENT_DATE_RE.search(joined)
    if m:
        event_date = mkdate(m.group(1), m.group(2), m.group(3))
        if m.group(4):
            time_value = f'{int(m.group(4)):02d}:{m.group(5)}'

    m = TAICHUNG_REG_RE.search(joined)
    if m:
        deadline = mkdate(m.group(4), m.group(5), m.group(6))

    return event_date, time_value, deadline


def taichung_location(lines):
    for line in lines:
        if not re.search(r'活動地點|活動地址|地點[｜：:]|地址[｜：:]', line):
            continue
        value = re.split(r'活動地點|活動地址|地點|地址', line, maxsplit=1)[-1]
        value = value.lstrip('：:｜|▲●• -–—').strip()
        if value and len(value) <= 300:
            return value
    return None



def taichung_audience(lines):
    """Extract likely participation/identity restrictions from Taichung pages."""
    labels = (
        '參加對象', '活動對象', '適用對象', '報名資格',
        '資格條件', '參加資格', '對象'
    )
    for label in labels:
        value = labelled_value(lines, label)
        if value and len(value) <= 300:
            return value

    joined = '\n'.join(lines[:160])

    patterns = [
        r'(?:參加對象|活動對象|適用對象|報名資格|資格條件|參加資格)\s*[：:]\s*([^\n]{2,300})',
        r'(?:限|僅限)\s*([^\n。；]{2,120})',
    ]
    for pattern in patterns:
        m = re.search(pattern, joined)
        if m:
            return m.group(1).strip()

    return ''


def taichung_organizer(lines):
    for key in ('主辦單位', '承辦單位', '承辦機關', '主辦機關'):
        value = labelled_value(lines, key)
        if value and len(value) <= 200:
            return value
    joined = '\n'.join(lines)
    m = re.search(r'本活動由(.{2,100}?)主辦', joined)
    if m:
        return m.group(1).strip()
    return '臺中市就業服務處'


def taichung_relevance(title, lines):
    """Keep useful student/youth/general career activities; reject clear audience mismatches.

    This is intentionally conservative. It does NOT require the word 青年, because
    general career workshops and workplace-experience events can still be useful
    to university students.
    """
    body = '\n'.join(lines[:120])
    combined = f'{title}\n{body}'

    hard_exclude = (
        r'中高齡|銀髮|高齡者|雇主座談|企業雇主|人資代表|'
        r'單一徵才|聯合徵才|徵才活動'
    )
    if re.search(hard_exclude, combined):
        return False, 'audience_mismatch'

    # A page is useful if it signals youth/student participation, self-improvement,
    # career exploration, internship/work experience, language/law, or a public
    # workshop/course.
    useful = (
        r'青年|青少年|學生|大學生|高中職|職涯|工作坊|講座|課程|'
        r'實境體驗|職場體驗|實習|培訓|履歷|面試|創業|創生|'
        r'法律|通譯|翻譯|語言|國際|海外|就業促進|生涯'
    )
    if re.search(useful, combined):
        return True, 'relevant'

    return False, 'low_relevance'


def build_taichung_candidate(url, body):
    title, lines = parse_taichung_detail(body)
    if not title or len(title) < 4 or len(title) > 200:
        return None, 'invalid_heading'

    # Audience mismatch is a semantic hard-stop and should be checked before
    # minimum-content length. This prevents a short but clearly irrelevant page
    # (e.g. silver-age-only activity) from being misclassified as a parser error.
    relevant, why = taichung_relevance(title, lines)
    if not relevant:
        return None, why

    if len(lines) < 5:
        return None, 'article_too_short'

    event_date, time_value, deadline = taichung_dates(lines)
    location = taichung_location(lines)
    organizer = taichung_organizer(lines)
    audience = taichung_audience(lines)

    # If structured top metadata was absent, use the common body rules as fallback.
    if not event_date:
        year = context_year(title, lines)
        event_date, _ = event_dates(lines, year, deadline)
    if not deadline:
        year = context_year(title, lines)
        deadline = deadline_of(lines, year)
    if not time_value:
        time_value = time_of(lines)

    scope, typ = classify(title, '\n'.join(lines), location)
    scope = '台中'

    if re.search(r'職涯|工作|就業|職場|實習|履歷|面試|創業|創生|實境體驗', title + '\n' + '\n'.join(lines[:100])):
        typ = '職涯／實習'
    if re.search(r'法律|通譯|翻譯', title + '\n' + '\n'.join(lines[:100])):
        typ = '法律／學術'
    elif re.search(r'語言|國際|海外', title + '\n' + '\n'.join(lines[:100])):
        typ = '語言／國際'
    elif re.search(r'青年|青少年|學生|教育|親子', title + '\n' + '\n'.join(lines[:100])) and typ == '公共參與':
        typ = '教育／青少年'

    act = taichung_act(url)
    status = ['臺中市就業服務處官方活動']
    if event_date:
        status.append('活動日 ' + event_date)
    if deadline:
        status.append('截止 ' + deadline)

    return {
        'id': TAICHUNG_AUTO_PREFIX + act,
        'title': title,
        'date': event_date or deadline or '',
        'time': time_value,
        'scope': scope,
        'type': typ,
        'kind': 'event',
        'url': url,
        'keywords': f'{title} 台中 臺中市 青年 職涯 {typ}',
        'direct': True,
        'team': False,
        'available': True,
        'source': '臺中市就業服務一鍵Catch',
        'statusText': '；'.join(status),
        'government': True,
        'deadline': deadline or '',
        'eventEndDate': '',
        'location': location or '',
        'organizer': organizer or '',
        'audience': audience,
        'autofetch': {
            'engine': 'V96.6.11.1.1',
            'sourceId': 'taichung_job',
            'act': act,
            'fetchedAt': now_iso(),
        },
    }, None


def run_taichung_source(limit):
    src = next(x for x in SOURCES['sources'] if x['id'] == 'taichung_job')
    allowlist = src['domain_allowlist']

    # Fetch more list candidates than the final per-source limit because the
    # official latest list also includes employer-only and older-worker items.
    details = []
    seen = set()
    list_urls = [
        TAICHUNG_LIST,
        'https://1catchjob.taichung.gov.tw/more.aspx?cat=help',
    ]

    fetch_failed = []
    for list_url in list_urls:
        try:
            final, body = fetch(list_url, allowlist)
            for url in discover_links(body, final):
                if not is_taichung_detail(url):
                    continue
                act = taichung_act(url)
                if not act or act in seen:
                    continue
                seen.add(act)
                details.append(url)
                if len(details) >= max(limit * 4, 30):
                    break
        except Exception as exc:
            fetch_failed.append({'url': list_url, 'reason': str(exc)})
            log(f'TAICHUNG LIST FAIL {list_url} {exc}')

    accepted = []
    skipped_past = 0
    rejected = []
    parsed_ok = 0
    inspected = 0

    for url in details:
        if len(accepted) >= limit:
            break
        inspected += 1
        try:
            _, detail_body = fetch(url, allowlist)
            candidate, reason = build_taichung_candidate(url, detail_body)

            if candidate is None:
                # Audience/relevance filtering is an intentional skip, not a parser error.
                if reason in {'audience_mismatch', 'low_relevance'}:
                    log(
                        f'TAICHUNG {inspected:02d}/{len(details):02d} FILTER '
                        f'reason={reason} act={taichung_act(url)}'
                    )
                    continue
                rejected.append({'url': url, 'reason': reason})
                log(
                    f'TAICHUNG {inspected:02d}/{len(details):02d} REJECT '
                    f'reason={reason}'
                )
                continue

            parsed_ok += 1
            actionable, action_reason = actionable_status(candidate)
            if actionable:
                accepted.append(candidate)
                log(
                    f'TAICHUNG {inspected:02d}/{len(details):02d} ACCEPT '
                    f'reason={action_reason} date={candidate["date"] or "-"} '
                    f'deadline={candidate["deadline"] or "-"} '
                    f'title={candidate["title"]}'
                )
            else:
                skipped_past += 1
                label = 'SKIP_DEADLINE' if action_reason == 'deadline_passed' else 'SKIP_PAST'
                log(
                    f'TAICHUNG {inspected:02d}/{len(details):02d} {label} '
                    f'date={candidate["date"] or "-"} '
                    f'deadline={candidate["deadline"] or "-"} '
                    f'title={candidate["title"]}'
                )

        except Exception as exc:
            fetch_failed.append({'url': url, 'reason': str(exc)})
            log(f'TAICHUNG {inspected:02d}/{len(details):02d} FAIL {exc}')

    accepted = list({c['id']: c for c in accepted}.values())

    # Health is based on actual relevant parsed items plus successful filtering.
    # A source with zero accepted can still be healthy when its pages were parsed
    # and merely filtered/expired; require at least one relevant parsed item or
    # a non-empty inspected set with no systemic failures.
    healthy = (
        inspected > 0
        and len(fetch_failed) <= max(2, inspected // 4)
        and len(rejected) <= max(2, inspected // 4)
    )

    return {
        'sourceId': 'taichung_job',
        'prefix': TAICHUNG_AUTO_PREFIX,
        'discovered': inspected,
        'parsedOk': parsed_ok,
        'accepted': accepted,
        'skippedPast': skipped_past,
        'rejected': rejected,
        'fetchFailures': fetch_failed,
        'healthy': healthy,
    }




# ---------------------------------------------------------------------------
# V96.6.11.1.1 Fourth circle — overseas / international
# ---------------------------------------------------------------------------

def pathfinder_deadline(lines):
    joined = '\n'.join(lines)

    # Prefer an explicit Gregorian date near "截止/關閉".
    for m in re.finditer(r'(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日', joined):
        context = joined[max(0, m.start() - 100):m.end() + 100]
        if re.search(r'截止|關閉|報名至|申請至|受理', context):
            value = mkdate(m.group(1), m.group(2), m.group(3))
            if value:
                return value

    # ROC-year fallback.
    for m in re.finditer(r'(\d{3})年\s*(\d{1,2})月\s*(\d{1,2})日', joined):
        context = joined[max(0, m.start() - 100):m.end() + 100]
        if re.search(r'截止|關閉|報名至|申請至|受理', context):
            value = mkdate(roc(m.group(1)), m.group(2), m.group(3))
            if value:
                return value

    return None


def build_pathfinder_candidate(body):
    lines = parse_plain_lines(body)
    if len(lines) < 2:
        return None, 'article_too_short'

    joined = '\n'.join(lines)
    if '海外翱翔' not in joined:
        return None, 'overseas_program_missing'

    deadline = pathfinder_deadline(lines)
    if not deadline:
        return None, 'deadline_not_found'

    if not re.search(r'報名|申請|受理|截止|系統將關閉', joined):
        return None, 'no_application_signal'

    return {
        'id': PATHFINDER_AUTO_PREFIX + 'overseas1830',
        'title': '青年百億海外圓夢基金計畫｜海外翱翔組18–30歲',
        'date': deadline,
        'time': '',
        'scope': '海外／國際',
        'type': '語言／國際',
        'kind': 'program',
        'url': PATHFINDER_OVERVIEW,
        'keywords': '青年 海外圓夢 海外翱翔 國際組織 智庫見習 青年議會 國際交流 海外服務 職能培訓',
        'direct': True,
        'team': False,
        'available': True,
        'source': '教育部青年發展署｜青年百億海外圓夢基金計畫',
        'statusText': f'海外翱翔組官方申請窗口；本輪截止 {deadline}',
        'government': True,
        'deadline': deadline,
        'eventEndDate': '',
        'location': '海外／依各圓夢機會',
        'organizer': '教育部青年發展署',
        'audience': '18–30歲青年；實際資格、語言及個別條件依官方簡章',
        'openEnded': False,
        'autofetch': {
            'engine': 'V96.6.11.1.1',
            'sourceId': 'pathfinder_official',
            'fetchedAt': now_iso(),
        },
    }, None


def run_pathfinder_source(limit):
    src = next(x for x in SOURCES['sources'] if x['id'] == 'pathfinder_official')
    accepted, rejected, failures = [], [], []
    skipped_past = 0
    parsed_ok = 0

    try:
        _, body = fetch(PATHFINDER_DOWNLOADS, src['domain_allowlist'])
        candidate, reason = build_pathfinder_candidate(body)

        if candidate is None:
            # Between rounds is a healthy zero-result state.
            if reason in {'deadline_not_found', 'no_application_signal'}:
                log(f'PATHFINDER FILTER reason={reason}')
            else:
                rejected.append({'url': PATHFINDER_DOWNLOADS, 'reason': reason})
                log(f'PATHFINDER REJECT reason={reason}')
        else:
            parsed_ok = 1
            actionable, action_reason = actionable_status(candidate)
            if actionable:
                accepted.append(candidate)
                log(f'PATHFINDER ACCEPT reason={action_reason} deadline={candidate["deadline"]}')
            else:
                skipped_past = 1
                log(f'PATHFINDER SKIP_DEADLINE deadline={candidate["deadline"]}')

    except Exception as exc:
        failures.append({'url': PATHFINDER_DOWNLOADS, 'reason': str(exc)})
        log(f'PATHFINDER FAIL {exc}')

    return {
        'sourceId': 'pathfinder_official',
        'prefix': PATHFINDER_AUTO_PREFIX,
        'discovered': 1,
        'parsedOk': parsed_ok,
        'accepted': accepted,
        'skippedPast': skipped_past,
        'rejected': rejected,
        'fetchFailures': failures,
        'healthy': not rejected and not failures,
    }


def build_mofa_working_holiday_candidate(body):
    lines = parse_plain_lines(body)
    joined = '\n'.join(lines)

    if '青年度假打工' not in joined and not ('青年' in joined and '度假打工' in joined):
        return None, 'working_holiday_content_missing'

    return {
        'id': MOFA_WH_AUTO_PREFIX + 'portal',
        'title': '青年度假打工｜外交部官方計畫入口',
        'date': '',
        'time': '',
        'scope': '海外／國際',
        'type': '語言／國際',
        'kind': 'program',
        'url': MOFA_WORKING_HOLIDAY,
        'keywords': '青年度假打工 海外工作 國際交流 海外生活 外語 澳洲 日本 加拿大 紐西蘭 英國 德國 韓國',
        'direct': True,
        'team': False,
        'available': True,
        'source': '中華民國外交部｜臺灣青年FUN眼世界',
        'statusText': '外交部常設青年度假打工官方入口；各國年齡、名額、簽證與保險條件依官方國別資訊',
        'government': True,
        'deadline': '',
        'eventEndDate': '',
        'location': '海外／依度假打工協定國',
        'organizer': '中華民國外交部',
        'audience': '青年；實際年齡與簽證資格依各協定國規定',
        'openEnded': True,
        'autofetch': {
            'engine': 'V96.6.11.1.1',
            'sourceId': 'mofa_working_holiday',
            'fetchedAt': now_iso(),
        },
    }, None


def run_mofa_working_holiday_source(limit):
    src = next(x for x in SOURCES['sources'] if x['id'] == 'mofa_working_holiday')
    accepted, rejected, failures = [], [], []
    parsed_ok = 0

    try:
        _, body = fetch(MOFA_WORKING_HOLIDAY, src['domain_allowlist'])
        candidate, reason = build_mofa_working_holiday_candidate(body)

        if candidate is None:
            rejected.append({'url': MOFA_WORKING_HOLIDAY, 'reason': reason})
            log(f'MOFA_WH REJECT reason={reason}')
        else:
            parsed_ok = 1
            actionable, action_reason = actionable_status(candidate)
            if actionable:
                accepted.append(candidate)
                log(f'MOFA_WH ACCEPT reason={action_reason}')
            else:
                rejected.append({'url': MOFA_WORKING_HOLIDAY, 'reason': 'not_actionable'})

    except Exception as exc:
        failures.append({'url': MOFA_WORKING_HOLIDAY, 'reason': str(exc)})
        log(f'MOFA_WH FAIL {exc}')

    return {
        'sourceId': 'mofa_working_holiday',
        'prefix': MOFA_WH_AUTO_PREFIX,
        'discovered': 1,
        'parsedOk': parsed_ok,
        'accepted': accepted,
        'skippedPast': 0,
        'rejected': rejected,
        'fetchFailures': failures,
        'healthy': parsed_ok == 1 and not rejected and not failures,
    }


# ---------------------------------------------------------------------------
# V96.6.11.1.1 Goal-fit engine
# ---------------------------------------------------------------------------
# Scoring is intentionally task-oriented rather than "all events are useful".
# It encodes the current Activity Radar design:
#   1) legal/transfer preparation
#   2) language + international / overseas opportunities
#   3) youth/camp/teaching/leadership experience
#   4) career + self-improvement
# and combines that with the concentric-circle distance:
#   THU -> Taichung -> National -> Overseas/online
#
# This metadata is written into each auto-fetched event so the UI can later
# filter/sort without re-parsing event text.

FIT_TASKS = {
    # Core long-term goals: strongest influence.
    '法律／轉學考': {
        'title': r'法律|法學|憲法|民法|刑法|行政法|人權|司法|法院|法官|律師|法治|法律系',
        'body': r'法律|法學|憲法|民法|刑法|行政法|人權|司法|法院|法官|律師|法治',
        'weight': 42,
    },
    '語言／國際／海外': {
        'title': r'英語|英文|日語|日文|語言|國際|海外|交換|留學|度假打工|國際交流|外語',
        'body': r'英語|英文|日語|日文|語言|國際|海外|交換|留學|度假打工|國際交流|外語',
        'weight': 40,
    },
    '青少年／營隊／教學': {
        'title': r'青年|青少年|營隊|領導力|社團|志工|服務學習|高中生|學生培訓|演辯|辯論',
        'body': r'青年|青少年|營隊|領導力|社團|志工|服務學習|高中生|學生培訓|演辯|辯論',
        'weight': 34,
    },

    # Useful but secondary: should not outrank a direct core-goal activity merely
    # because it is nearby.
    '職涯／實習': {
        'title': r'職涯|實習|履歷|面試|創業|創生|職場體驗|產業探索|生涯',
        'body': r'職涯|實習|履歷|面試|創業|創生|職場體驗|產業探索|生涯',
        'weight': 20,
    },
    '通用能力／AI工具': {
        'title': r'AI|人工智慧|Gemini|NotebookLM|Claude|GPT|簡報|溝通|時間管理|筆記|社群媒體',
        'body': r'AI|人工智慧|Gemini|NotebookLM|Claude|GPT|簡報|溝通|時間管理|筆記|社群媒體',
        'weight': 14,
    },
}


CIRCLE_META = {
    # Geography is deliberately a small bonus. Goal fit must dominate.
    'thu_official': (1, '東海校內', 8),
    'taichung_job': (2, '台中', 4),
    'yda_official': (3, '全國', 2),
    'pathfinder_official': (4, '海外／國際', 0),
    'mofa_working_holiday': (4, '海外／國際', 0),
}

LOW_VALUE_PATTERNS = [
    (r'適性就業輔導促進就業計畫', -24, '一般就業輔導，與目前學生目標連結較弱'),
    (r'就業博覽會|聯合徵才|單一徵才|徵才活動', -22, '以徵才媒合為主，非目前優先自我精進項目'),
    (r'就業服務站|就業促進', -10, '一般就業服務，降低目標適配度'),
]

STRONG_BONUS_PATTERNS = [
    (r'度假打工|海外工作|海外實習|國際青年|國際交流', 18, '直接連結海外／國際經驗目標'),
    (r'法律|憲法|民法|刑法|人權|法治', 15, '直接連結法律學習目標'),
    (r'大學生|學生增能|學生學習', 7, '明確以大學生／學生為對象'),
    (r'職場體驗|產業探索|實習', 8, '具體職涯體驗，可轉化為行動'),
]


def event_text(candidate):
    return ' '.join([
        str(candidate.get('title', '')),
        str(candidate.get('keywords', '')),
        str(candidate.get('statusText', '')),
        str(candidate.get('location', '')),
        str(candidate.get('organizer', '')),
        str(candidate.get('type', '')),
    ])


def normalize_candidate_type(candidate):
    """Prefer title semantics over incidental words buried in the page body."""
    title = candidate.get('title', '')
    current = candidate.get('type', '')

    if re.search(r'法律|法學|憲法|民法|刑法|人權|司法|法治', title):
        return '法律／學術'
    if re.search(r'英語|英文|日語|日文|語言|國際|海外|交換|留學|度假打工', title):
        return '語言／國際'
    if re.search(r'職涯|實習|職場|工作坊|產業|就業|履歷|面試|創業|創生|體驗', title):
        return '職涯／實習'
    if re.search(r'青年|青少年|營隊|教育|教學|領導力|學生', title):
        return '教育／青少年'

    # Keep a reliable source-specific type only if title doesn't give a better cue.
    return current or '公共參與'



IDENTITY_RESTRICTIONS = [
    (r'國際生|境外生|外籍生|僑生', 'international_student_only', '特定身分：國際生／境外生'),
    (r'新住民', 'new_immigrant_only', '特定身分：新住民'),
    (r'原住民|原住民族', 'indigenous_only', '特定身分：原住民'),
    (r'身心障礙|身障', 'disability_only', '特定身分：身心障礙者'),
]

OPEN_AUDIENCE_SIGNAL = re.compile(
    r'不限身分|不限資格|一般民眾|社會大眾|皆可參加|均可參加|'
    r'全體學生|本校學生|大學生|學生皆可|學生均可|公開報名'
)


def eligibility_status(candidate):
    """Return (eligible_for_main_radar, reason_code, reason_text).

    We do not assume the user's identity. If an activity appears limited to a
    particular status (international student, new immigrant, indigenous, etc.),
    it stays in staging for audit but is excluded from the main radar until
    eligibility is explicitly confirmed elsewhere.
    """
    source_id = candidate.get('autofetch', {}).get('sourceId', '')
    title = str(candidate.get('title', ''))
    audience = str(candidate.get('audience', ''))
    combined = f'{title}\n{audience}\n{event_text(candidate)}'

    # Existing THU teacher-only gate.
    if (
        source_id == 'thu_official'
        and audience
        and re.search(r'教職員|教師|導師', audience)
        and not re.search(r'學生|校外人士|一般民眾', audience)
    ):
        return False, 'faculty_only', '僅教師／教職員可參加'

    # Explicit general/open language can override a keyword appearing only in
    # subject matter, but not a restriction explicitly stated in the title.
    open_signal = bool(OPEN_AUDIENCE_SIGNAL.search(audience))

    for pattern, code, label in IDENTITY_RESTRICTIONS:
        title_hit = bool(re.search(pattern, title))
        audience_hit = bool(re.search(pattern, audience))

        if title_hit or audience_hit:
            if open_signal and not title_hit:
                continue
            return False, code, f'{label}；資格未確認'

    return True, '', ''


def fit_candidate(candidate):
    source_id = candidate.get('autofetch', {}).get('sourceId', '')
    circle_level, circle_label, circle_bonus = CIRCLE_META.get(
        source_id, (4, '海外／其他', 0)
    )

    candidate['type'] = normalize_candidate_type(candidate)

    title = candidate.get('title', '')
    body = event_text(candidate)

    score = circle_bonus
    reasons = [f'同心圓第{circle_level}圈：{circle_label}+{circle_bonus}']
    matches = []

    for task, cfg in FIT_TASKS.items():
        title_hit = bool(re.search(cfg['title'], title, re.I))
        body_hit = bool(re.search(cfg['body'], body, re.I))

        if title_hit:
            add = cfg['weight']
        elif body_hit:
            add = max(4, cfg['weight'] // 4)
        else:
            add = 0

        if add:
            score += add
            matches.append(task)
            reasons.append(f'{task}+{add}')

    for pattern, add, reason in STRONG_BONUS_PATTERNS:
        if re.search(pattern, title + ' ' + body, re.I):
            score += add
            reasons.append(f'{reason}+{add}')

    for pattern, delta, reason in LOW_VALUE_PATTERNS:
        if re.search(pattern, title + ' ' + body, re.I):
            score += delta
            reasons.append(f'{reason}{delta}')

    if re.search(r'教師增能|教師專業成長|導師知能|新進教師', title):
        score -= 8
        reasons.append('教師增能取向-8')

    if candidate.get('deadline'):
        score += 4
        reasons.append('有明確截止日+4')
    if candidate.get('location'):
        score += 2
        reasons.append('有明確地點+2')

    score = max(0, min(100, score))

    status_ok, hard_filter, eligibility_reason = eligibility_status(candidate)

    if not status_ok:
        tier = '資格待確認' if hard_filter != 'faculty_only' else '不適用'
        eligible = False
        reasons.append(eligibility_reason)
    else:
        if score >= 72:
            tier = '高適配'
        elif score >= 52:
            tier = '中適配'
        elif score >= 38:
            tier = '探索'
        else:
            tier = '低適配'
        eligible = score >= 38

    candidate['fitScore'] = score
    candidate['fitTier'] = tier
    candidate['fitReasons'] = reasons[:12]
    candidate['goalMatches'] = list(dict.fromkeys(matches))
    candidate['circleLevel'] = circle_level
    candidate['circleLabel'] = circle_label
    candidate['radarEligible'] = eligible
    candidate['hardFilterReason'] = hard_filter
    candidate['eligibilityReason'] = eligibility_reason

    return candidate



def normalize_event_title(value):
    value = str(value or '').lower()
    value = re.sub(r'[\u3000\s]+', '', value)
    value = re.sub(r'[【】〖〗「」『』（）()［］\[\]<>《》]', '', value)
    value = re.sub(r'[×x✕✖•●◎○★☆✨📍📅🎯｜|：:，,。.!！?？~～_\-—–/\\\\]+', '', value)
    # Remove date fragments and session labels that often create duplicate IDs
    # for the same underlying activity.
    value = re.sub(r'20\d{2}\d{1,2}\d{1,2}', '', value)
    value = re.sub(r'\d{1,2}月\d{1,2}日', '', value)
    value = re.sub(r'\d{1,2}[/-]\d{1,2}', '', value)
    value = re.sub(r'第?[一二三四五六七八九十0-9]+場|上午場|下午場|晚間場', '', value)
    return value


def normalize_location(value):
    value = str(value or '').lower()
    value = re.sub(r'[\u3000\s]+', '', value)
    value = value.replace('臺', '台')
    value = re.sub(r'[（）()［］\[\]｜|：:，,。.!！?？~～_\-—–/\\\\]+', '', value)
    return value


def semantic_duplicate(a, b):
    """Detect duplicate activity records across different source IDs.

    Primary identity is normalized title + event date.
    Location is intentionally *not* a hard blocker because the same official
    activity is often published once with a venue name and once with a full
    postal address. Distinct same-day sessions remain separate when both records
    contain different explicit times.
    """
    if normalize_event_title(a.get('title')) != normalize_event_title(b.get('title')):
        return False

    if (a.get('date') or '') != (b.get('date') or ''):
        return False

    ta = str(a.get('time') or '').strip()
    tb = str(b.get('time') or '').strip()

    # Explicitly different times indicate separate sessions on the same day.
    if ta and tb and ta != tb:
        return False

    return True


def dedupe_radar_candidates(results):
    """Mark semantic duplicates and rebuild per-source radarEligible lists.

    Winner priority:
      1) higher fitScore
      2) closer concentric circle
      3) richer metadata (location/deadline/audience)
      4) stable ID
    """
    pool = []
    for result in results:
        pool.extend(result.get('radarEligible', []))

    def quality(c):
        richness = sum(bool(c.get(k)) for k in ('location', 'deadline', 'audience', 'organizer'))
        return (
            int(c.get('fitScore', 0)),
            -int(c.get('circleLevel', 9)),
            richness,
            str(c.get('id', '')),
        )

    ordered = sorted(pool, key=quality, reverse=True)
    winners = []

    for candidate in ordered:
        duplicate_of = None
        for winner in winners:
            if semantic_duplicate(candidate, winner):
                duplicate_of = winner
                break

        if duplicate_of is None:
            winners.append(candidate)
            candidate['semanticDuplicateOf'] = ''
        else:
            candidate['radarEligible'] = False
            candidate['fitTier'] = '重複'
            candidate['hardFilterReason'] = 'semantic_duplicate'
            candidate['eligibilityReason'] = ''
            candidate['semanticDuplicateOf'] = duplicate_of.get('id', '')
            candidate.setdefault('fitReasons', []).append(
                f'與 {duplicate_of.get("title","")} 同標題／日期／地點，保留較高品質版本'
            )

    winner_ids = {c.get('id') for c in winners}

    for result in results:
        result['radarEligible'] = [
            c for c in result.get('accepted', [])
            if c.get('radarEligible') and c.get('id') in winner_ids
        ]
        result['semanticDuplicates'] = sum(
            1 for c in result.get('accepted', [])
            if c.get('hardFilterReason') == 'semantic_duplicate'
        )
        result['fitFiltered'] = len(result.get('accepted', [])) - len(result['radarEligible'])

    return results, winners


def apply_fit_to_result(result):
    fitted = [fit_candidate(c) for c in result.get('accepted', [])]
    result['accepted'] = fitted
    result['radarEligible'] = [c for c in fitted if c.get('radarEligible')]
    result['fitFiltered'] = len(fitted) - len(result['radarEligible'])
    return result


def actionable_status(candidate):
    """Return (is_actionable, reason).

    Policy for the main Activity Radar:
    - If a machine-readable registration/application deadline exists and it is
      already past, the item is NOT actionable even when the event itself is
      still in the future.
    - If there is no deadline, a future event date/end date can remain visible.
    - If all relevant dates are in the past or missing, it is not actionable.
    """
    today = date.today().isoformat()
    deadline = candidate.get('deadline', '')
    start = candidate.get('date', '')
    end = candidate.get('eventEndDate', '')

    if deadline and deadline < today:
        return False, 'deadline_passed'

    if deadline and deadline >= today:
        return True, 'deadline_open'

    if candidate.get('openEnded'):
        return True, 'open_ended_official'

    if end and end >= today:
        return True, 'event_future'

    if start and start >= today:
        return True, 'event_future'

    return False, 'past_or_undated'


def run(repo, limit, apply):
    enabled = {s['id'] for s in SOURCES['sources'] if s.get('enabled')}
    results = []

    if 'thu_official' in enabled:
        results.append(run_thu_source(limit))
    if 'taichung_job' in enabled:
        results.append(run_taichung_source(limit))
    if 'yda_official' in enabled:
        results.append(run_yda_source(limit))
    if 'pathfinder_official' in enabled:
        results.append(run_pathfinder_source(limit))
    if 'mofa_working_holiday' in enabled:
        results.append(run_mofa_working_holiday_source(limit))

    if not results:
        raise RuntimeError('沒有啟用任何 AutoFetch 來源')

    results = [apply_fit_to_result(r) for r in results]
    results, deduped_winners = dedupe_radar_candidates(results)

    # Staging keeps all actionable candidates, including low-fit items, so the
    # user can audit what was filtered. Production receives radarEligible only.
    all_candidates = []
    radar_candidates = []
    for result in results:
        all_candidates.extend(result['accepted'])
        radar_candidates.extend(result['radarEligible'])

    all_candidates = list({c['id']: c for c in all_candidates}.values())
    radar_candidates = list({c['id']: c for c in radar_candidates}.values())

    all_candidates.sort(
        key=lambda x: (
            -int(x.get('fitScore', 0)),
            int(x.get('circleLevel', 9)),
            x.get('date') or '9999-12-31',
            x['title'],
        )
    )
    radar_candidates.sort(
        key=lambda x: (
            -int(x.get('fitScore', 0)),
            int(x.get('circleLevel', 9)),
            x.get('date') or '9999-12-31',
            x['title'],
        )
    )

    totals = {
        'sources': len(results),
        'healthySources': sum(1 for r in results if r['healthy']),
        'discovered': sum(r['discovered'] for r in results),
        'parsedOk': sum(r['parsedOk'] for r in results),
        'accepted': len(all_candidates),
        'radarEligible': len(radar_candidates),
        'fitFiltered': sum(r.get('fitFiltered', 0) for r in results),
        'semanticDuplicates': sum(r.get('semanticDuplicates', 0) for r in results),
        'skippedPast': sum(r['skippedPast'] for r in results),
        'rejected': sum(len(r['rejected']) for r in results),
        'fetchFailed': sum(len(r['fetchFailures']) for r in results),
    }

    staging = repo / 'data/staging'
    write_json(
        staging / 'autofetch-candidates.json',
        {
            'events': all_candidates,
            'radarEvents': radar_candidates,
            'meta': {
                'accepted': len(all_candidates),
                'radarEligible': len(radar_candidates),
                'fitFiltered': totals['fitFiltered'],
                'semanticDuplicates': totals['semanticDuplicates'],
                'ranking': 'fitScore DESC, circleLevel ASC, date ASC',
            },
        },
    )
    write_json(
        staging / 'autofetch-report.json',
        {
            'schemaVersion': '96.6.11.1-report-1',
            'generatedAt': now_iso(),
            'mode': 'apply' if apply else 'check',
            'summary': totals,
            'sources': [
                {
                    'sourceId': r['sourceId'],
                    'healthy': r['healthy'],
                    'discovered': r['discovered'],
                    'parsedOk': r['parsedOk'],
                    'accepted': len(r['accepted']),
                    'radarEligible': len(r.get('radarEligible', [])),
                    'fitFiltered': r.get('fitFiltered', 0),
                    'semanticDuplicates': r.get('semanticDuplicates', 0),
                    'skippedPast': r['skippedPast'],
                    'rejected': len(r['rejected']),
                    'fetchFailed': len(r['fetchFailures']),
                    'rejectedItems': r['rejected'],
                    'fetchFailures': r['fetchFailures'],
                }
                for r in results
            ],
        },
    )

    for r in results:
        log(
            f'SOURCE_SUMMARY source={r["sourceId"]} healthy={str(r["healthy"]).lower()} '
            f'discovered={r["discovered"]} parsed={r["parsedOk"]} '
            f'accepted={len(r["accepted"])} radarEligible={len(r.get("radarEligible", []))} '
            f'fitFiltered={r.get("fitFiltered", 0)} semanticDuplicates={r.get("semanticDuplicates", 0)} '
            f'skippedPast={r["skippedPast"]} rejected={len(r["rejected"])} '
            f'fetchFailed={len(r["fetchFailures"])}'
        )

    if apply:
        if totals['healthySources'] == 0:
            raise RuntimeError('fail-closed：所有來源健康度不足，不覆蓋正式資料')

        activities_file = repo / 'data/activities.json'
        payload = read_json(activities_file)
        merged = list(payload.get('events', []))

        # Per-source fail-closed behavior:
        # healthy source -> replace only that source's auto-owned records
        # unhealthy source -> preserve its previous production records
        for r in results:
            if not r['healthy']:
                log(f'SOURCE_PRESERVED source={r["sourceId"]} reason=unhealthy')
                continue
            prefix = r['prefix']
            merged = [e for e in merged if not str(e.get('id', '')).startswith(prefix)]
            merged.extend(r.get('radarEligible', []))

        merged = list({str(e.get('id', '')): e for e in merged}.values())

        activity_archive_file = repo / 'data/activity-archive.json'
        activity_archive_payload = read_json(activity_archive_file) if activity_archive_file.exists() else {'meta': {}, 'archive': []}
        merged, activity_archive_rows, lifecycle_meta = reconcile_activity_catalog(
            old_rows=list(payload.get('events', [])),
            candidate_rows=merged,
            source_results=results,
            archive_rows=activity_archive_payload.get('archive', []) if isinstance(activity_archive_payload, dict) else [],
            now=now_iso(),
        )

        backup_dir = staging / 'backups'
        backup_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(
            activities_file,
            backup_dir / f'activities-{datetime.now().strftime("%Y%m%d-%H%M%S")}.json',
        )

        meta = dict(payload.get('meta', {}))
        meta.update({
            'updatedAt': now_iso(),
            'events': len(merged),

            # Backward-compatible legacy fields.
            'sources': totals['healthySources'],
            'ok': totals['radarEligible'],
            'failed': totals['rejected'] + totals['fetchFailed'],

            # V96.8.2.3 explicit health/lifecycle metrics.
            'totalSources': totals['sources'],
            'healthySources': totals['healthySources'],
            'failedSources': totals['sources'] - totals['healthySources'],
            'rejectedItems': totals['rejected'],
            'fetchFailedItems': totals['fetchFailed'],
            'skippedPast': totals['skippedPast'],
            'fitFiltered': totals['fitFiltered'],
            'semanticDuplicates': totals['semanticDuplicates'],
            'errors': [
                x['reason']
                for r in results
                for x in (r['rejected'] + r['fetchFailures'])
            ][:20],
            'generator': 'V96.6.11.1.1 Multi-Source AutoFetch + Activity Radar',
            'retiredThisRun': lifecycle_meta['retiredThisRun'],
            'revivedThisRun': lifecycle_meta['revivedThisRun'],
            'archiveCount': lifecycle_meta['archiveCount'],
            'retainedOnFailure': lifecycle_meta['retainedOnFailure'],
            'carriedMissing': lifecycle_meta['carriedMissing'],
            'needsReview': lifecycle_meta['needsReview'],
            'lifecyclePolicy': 'expired-immediate; missing-two-hits-plus-30-days; failed-source-no-miss; source-reappearance-auto-revive',
        })
        atomic_write_json(activities_file, {'meta': meta, 'events': merged})
        atomic_write_json(
            activity_archive_file,
            archive_document(activity_archive_payload, activity_archive_rows, lifecycle_meta, 'activity', now=meta['updatedAt']),
        )
        log(
            f'AUTOFETCH_APPLY_OK sources={totals["sources"]} healthySources={totals["healthySources"]} '
            f'discovered={totals["discovered"]} parsed={totals["parsedOk"]} '
            f'accepted={totals["accepted"]} radarEligible={totals["radarEligible"]} '
            f'fitFiltered={totals["fitFiltered"]} semanticDuplicates={totals["semanticDuplicates"]} '
            f'skippedPast={totals["skippedPast"]} rejected={totals["rejected"]} '
            f'fetchFailed={totals["fetchFailed"]}'
        )
    else:
        log(
            f'AUTOFETCH_CHECK_OK sources={totals["sources"]} healthySources={totals["healthySources"]} '
            f'discovered={totals["discovered"]} parsed={totals["parsedOk"]} '
            f'accepted={totals["accepted"]} radarEligible={totals["radarEligible"]} '
            f'fitFiltered={totals["fitFiltered"]} semanticDuplicates={totals["semanticDuplicates"]} '
            f'skippedPast={totals["skippedPast"]} rejected={totals["rejected"]} '
            f'fetchFailed={totals["fetchFailed"]}'
        )
        log('production data was NOT changed')



def self_test():
    fixture = '''<!doctype html><html><body>
    <h2>活動專區</h2><div>小 中 大</div><div>請使用鍵盤按住Ctrl+P列印</div>
    <h2>115年U-start創創展示會「U-start創新創業主題專區」</h2>
    <p>📍 展出資訊</p><p>日期｜115年11月19日（四） 至 115年11月21日（六）</p>
    <p>地點｜臺北圓山花博園區（台北市中山區玉門街1號）</p>
    <p>📅 重要時程</p><p>徵件期間｜即日起至115年9月4日（五）止</p>
    <h3>更多活動</h3><p>活動日期：2021-07-09 ~ 2021-08-20</p>
    </body></html>'''.encode('utf-8')
    c, reason = build_candidate('https://www.yda.gov.tw/eventDoc.aspx?eid=119&pid=56&uid=101', fixture)
    assert reason is None and c
    assert c['title'].startswith('115年U-start')
    assert c['date'] == '2026-11-19', c
    assert c['eventEndDate'] == '2026-11-21', c
    assert c['deadline'] == '2026-09-04', c
    assert not c['date'].startswith('2021-')

    fixture2 = '''<html><body><h2>活動專區</h2><h2>〖115年青年海外度假打工宣導會〗開始報名！</h2>
    <p>教育部青年發展署敬啟</p><p>115年6月30日</p><h3>參、活動日期及地點</h3>
    <p>一、日期：7月17日（五）13：30-16：45</p><p>二、地址：臺大醫院國際會議中心301廳</p>
    <p>伍、 報名方式</p><p>報名期間自即日起至額滿為止</p><div>更多活動</div><p>活動日期：2021-07-09</p></body></html>'''.encode('utf-8')
    c2, reason2 = build_candidate('https://www.yda.gov.tw/eventDoc.aspx?eid=118&pid=56&uid=101', fixture2)
    assert reason2 is None and c2
    assert c2['date'] == '2026-07-17', c2
    assert c2['location'].startswith('臺大醫院'), c2
    wd = dates_in_line('場次1：11月26日（週三）19:00-20:30', 2026)
    assert wd == ['2025-11-26'], wd

    # Actionability policy regression:
    # event in the future but deadline already passed -> exclude from main radar
    action, why = actionable_status({
        'date': '2099-11-19',
        'eventEndDate': '2099-11-21',
        'deadline': '2000-09-04',
    })
    assert action is False and why == 'deadline_passed', (action, why)

    # no deadline + future event -> still actionable
    action2, why2 = actionable_status({
        'date': '2099-07-17',
        'eventEndDate': '',
        'deadline': '',
    })
    assert action2 is True and why2 == 'event_future', (action2, why2)

    thu_fixture = '''<html><body>
    <div>教育活動</div>
    <h1>〖學生增能工作坊X勵學基金〗商務簡報與溝通訓練工作坊</h1>
    <div>報名起迄</div><div>2026-09-03 12:00 ~ 2026-10-02 12:00</div>
    <div>開放對象</div><div>學生，費用：0</div><div>承辦單位</div><div>教學發展中心</div>
    <h3>活動 報名</h3>
    <div>場次名稱</div><div>地 點</div><div>日 期</div><div>時 間</div>
    <div>商務簡報與溝通訓練工作坊</div>
    <div>東海大學學習共享空間</div>
    <div>2026-10-05 ~ 2026-10-05 12:30 ~ 15:30</div>
    </body></html>'''.encode('utf-8')
    tc, tr = build_thu_candidate(
        'https://tevent.thu.edu.tw/tEvent_front/tEvent.php?conference_code=2026090001&page=1&type=0',
        thu_fixture,
    )
    assert tr is None and tc, (tr, tc)
    assert tc['id'] == 'auto-thu-2026090001', tc
    assert tc['deadline'] == '2026-10-02', tc
    assert tc['date'] == '2026-10-05', tc
    assert tc['eventEndDate'] == '2026-10-05', tc
    assert tc['time'] == '12:30–15:30', tc
    assert tc['scope'] == '東海校內', tc
    assert tc['organizer'] == '教學發展中心', tc
    assert '東海大學' in tc['location'], tc

    taichung_fixture = '''<html><body>
    <h2>115年度『親子未來職涯對話工作坊』</h2>
    <div>活動編號 : A260608005</div>
    <div>活動日期 : 2026-09-12 13:00</div>
    <div>報名日期 : 2026/06/10 00:00 ~ 2026/09/10 00:00</div>
    <div>活動說明 :</div>
    <p>陪伴高中職以上學生及家長一起探索職涯。</p>
    <p>活動地點｜思享空間－201大教室（臺中市東區公園東路130號2樓）</p>
    <p>主辦單位：臺中市就業服務處</p>
    </body></html>'''.encode('utf-8')
    cc, cr = build_taichung_candidate(
        'https://1catchjob.taichung.gov.tw/detail.aspx?act=5387',
        taichung_fixture,
    )
    assert cr is None and cc, (cr, cc)
    assert cc['id'] == 'auto-tcjob-5387', cc
    assert cc['date'] == '2026-09-12', cc
    assert cc['deadline'] == '2026-09-10', cc
    assert cc['time'] == '13:00', cc
    assert cc['scope'] == '台中', cc
    assert cc['type'] in {'職涯／實習', '教育／青少年'}, cc
    assert '臺中市東區' in cc['location'], cc

    excluded_fixture = '''<html><body>
    <h2>115年度銀髮就業促進課程</h2>
    <div>活動日期 : 2026-10-07 00:00</div>
    <div>報名日期 : 2026/04/28 00:00 ~ 2026/10/06 00:00</div>
    <p>中高齡及銀髮人才服務。</p>
    </body></html>'''.encode('utf-8')
    ec, er = build_taichung_candidate(
        'https://1catchjob.taichung.gov.tw/detail.aspx?act=9999',
        excluded_fixture,
    )
    assert ec is None and er == 'audience_mismatch', (ec, er)

    # Fit engine regressions.
    generic_job = fit_candidate({
        'id': 'auto-tcjob-test1',
        'title': '適性就業輔導促進就業計畫-臺中站-線上-職涯講座',
        'date': '2099-09-30',
        'deadline': '2099-09-23',
        'location': '',
        'type': '職涯／實習',
        'keywords': '',
        'statusText': '',
        'organizer': '臺中市就業服務處',
        'autofetch': {'sourceId': 'taichung_job'},
    })
    assert generic_job['radarEligible'] is False, generic_job
    assert generic_job['fitTier'] == '低適配', generic_job

    hotel_exp = fit_candidate({
        'id': 'auto-tcjob-test2',
        'title': '裕元花園酒店 × 旅宿業職場體驗',
        'date': '2099-09-21',
        'deadline': '2099-09-18',
        'location': '臺中市西屯區',
        'type': '職涯／實習',
        'keywords': '',
        'statusText': '',
        'organizer': '臺中市就業服務處',
        'autofetch': {'sourceId': 'taichung_job'},
    })
    assert hotel_exp['radarEligible'] is True, hotel_exp
    assert hotel_exp['fitScore'] >= 35, hotel_exp

    legal_thu = fit_candidate({
        'id': 'auto-thu-test3',
        'title': '大學生常見法律問題暨防制詐騙講座',
        'date': '2099-10-07',
        'deadline': '2099-10-05',
        'location': '東海大學',
        'type': '教育／青少年',
        'keywords': '',
        'statusText': '',
        'organizer': '東海大學',
        'autofetch': {'sourceId': 'thu_official'},
    })
    assert legal_thu['fitTier'] in {'高適配', '中適配'}, legal_thu
    assert '法律／轉學考' in legal_thu['goalMatches'], legal_thu

    immigrant = fit_candidate({
        'id': 'auto-tcjob-test4',
        'title': '新住民產業鏈工作坊-多元服務產業探索',
        'date': '2099-09-20',
        'deadline': '2099-09-17',
        'location': '',
        'type': '法律／學術',
        'keywords': '',
        'statusText': '',
        'organizer': '臺中市就業服務處',
        'autofetch': {'sourceId': 'taichung_job'},
    })
    assert immigrant['type'] == '職涯／實習', immigrant

    # Audience-aware THU filtering.
    faculty = fit_candidate({
        'id': 'auto-thu-faculty',
        'title': '【教師增能活動】AI 教學實踐工作坊',
        'date': '2099-10-01',
        'deadline': '2099-09-30',
        'location': '東海大學',
        'type': '通用能力／AI工具',
        'keywords': '',
        'statusText': '',
        'organizer': '教學發展中心',
        'audience': '教職員，費用：0',
        'autofetch': {'sourceId': 'thu_official'},
    })
    assert faculty['radarEligible'] is False, faculty
    assert faculty['fitTier'] == '不適用', faculty
    assert faculty['hardFilterReason'] == 'faculty_only', faculty

    student_ai = fit_candidate({
        'id': 'auto-thu-ai-student',
        'title': '【學生增能工作坊】大學生的第一堂 AI 使喚術',
        'date': '2099-10-21',
        'deadline': '2099-10-20',
        'location': '線上',
        'type': '通用能力／AI工具',
        'keywords': '',
        'statusText': '',
        'organizer': '教學發展中心',
        'audience': '學生，費用：0',
        'autofetch': {'sourceId': 'thu_official'},
    })
    assert student_ai['radarEligible'] is True, student_ai
    assert student_ai['fitScore'] < 72, student_ai

    # Identity-restricted activities stay in staging but not main radar.
    intl_only = fit_candidate({
        'id': 'auto-thu-intl',
        'title': '國際生留臺就業輔導計畫說明會',
        'date': '2099-09-15',
        'deadline': '2099-09-14',
        'location': '東海大學',
        'type': '語言／國際',
        'keywords': '',
        'statusText': '',
        'organizer': '國際處',
        'audience': '',
        'autofetch': {'sourceId': 'thu_official'},
    })
    assert intl_only['radarEligible'] is False, intl_only
    assert intl_only['hardFilterReason'] == 'international_student_only', intl_only
    assert intl_only['fitTier'] == '資格待確認', intl_only

    immigrant_only = fit_candidate({
        'id': 'auto-tcjob-immigrant',
        'title': '新住民產業鏈工作坊-多元服務產業探索',
        'date': '2099-09-20',
        'deadline': '2099-09-17',
        'location': '臺中市',
        'type': '職涯／實習',
        'keywords': '',
        'statusText': '',
        'organizer': '臺中市就業服務處',
        'audience': '',
        'autofetch': {'sourceId': 'taichung_job'},
    })
    assert immigrant_only['radarEligible'] is False, immigrant_only
    assert immigrant_only['hardFilterReason'] == 'new_immigrant_only', immigrant_only

    # Semantic duplicate: same title + date + compatible location keeps one.
    d1 = fit_candidate({
        'id': 'auto-tcjob-dup1',
        'title': '裕元花園酒店 × 旅宿業職場體驗',
        'date': '2099-09-21',
        'deadline': '2099-09-18',
        'location': '裕元花園酒店（臺中市西屯區）',
        'type': '職涯／實習',
        'keywords': '',
        'statusText': '',
        'organizer': '臺中市就業服務處',
        'autofetch': {'sourceId': 'taichung_job'},
    })
    d2 = fit_candidate({
        'id': 'auto-tcjob-dup2',
        'title': '◎裕元花園酒店 × 旅宿業職場體驗 ◎',
        'date': '2099-09-21',
        'deadline': '2099-09-18',
        'location': '裕元花園酒店（台中市西屯區福安里台灣大道四段610號）',
        'type': '職涯／實習',
        'keywords': '',
        'statusText': '',
        'organizer': '臺中市就業服務處',
        'autofetch': {'sourceId': 'taichung_job'},
    })
    rr = [{
        'sourceId': 'taichung_job',
        'prefix': TAICHUNG_AUTO_PREFIX,
        'accepted': [d1, d2],
        'radarEligible': [d1, d2],
        'fitFiltered': 0,
        'semanticDuplicates': 0,
    }]
    rr, winners = dedupe_radar_candidates(rr)
    assert len(winners) == 1, winners
    assert rr[0]['semanticDuplicates'] == 1, rr
    assert len(rr[0]['radarEligible']) == 1, rr

    # Same title/date but explicitly different times are separate sessions.
    s1 = {
        'title': '同名活動',
        'date': '2099-10-01',
        'time': '10:00–12:00',
        'location': 'A教室',
    }
    s2 = {
        'title': '同名活動',
        'date': '2099-10-01',
        'time': '14:00–16:00',
        'location': 'B教室',
    }
    assert semantic_duplicate(s1, s2) is False, (s1, s2)

    pf_fixture = '''<html><body>
    <h2>簡章下載</h2>
    <p>116年第二梯次海外翱翔組受理報名，預計將於 2099年5月15日中午12:00截止，其後系統將關閉。</p>
    <p>海外翱翔組18-30歲。</p>
    </body></html>'''.encode('utf-8')
    pf, reason = build_pathfinder_candidate(pf_fixture)
    assert reason is None and pf, (reason, pf)
    assert pf['deadline'] == '2099-05-15', pf
    assert actionable_status(pf) == (True, 'deadline_open'), pf

    pf_old_fixture = '''<html><body>
    <p>115年第二梯次海外翱翔組受理報名，預計將於 2000年5月15日中午12:00截止，其後系統將關閉。</p>
    <p>海外翱翔組18-30歲。</p>
    </body></html>'''.encode('utf-8')
    pf_old, reason_old = build_pathfinder_candidate(pf_old_fixture)
    assert reason_old is None and pf_old, (reason_old, pf_old)
    assert actionable_status(pf_old)[0] is False, pf_old

    wh_fixture = '''<html><body>
    <h1>青年度假打工</h1>
    <p>外交部為擴大我國青年與國際接軌，積極推動度假打工計畫。</p>
    </body></html>'''.encode('utf-8')
    wh, wh_reason = build_mofa_working_holiday_candidate(wh_fixture)
    assert wh_reason is None and wh, (wh_reason, wh)
    assert actionable_status(wh) == (True, 'open_ended_official'), wh
    wh_fit = fit_candidate(wh)
    assert wh_fit['radarEligible'] is True, wh_fit
    assert '語言／國際／海外' in wh_fit['goalMatches'], wh_fit

    # V96.6.11.1.1 production workflow regression guards.
    assert 'contents: write' in WORKFLOW
    assert 'schedule:' in WORKFLOW and '17 1 * * *' in WORKFLOW
    assert 'Production integrity guard' in WORKFLOW
    assert 'manual events changed' in WORKFLOW
    assert 'Persist updated activity data' in WORKFLOW
    assert 'git push origin "HEAD:${GITHUB_REF_NAME}"' in WORKFLOW
    assert 'Upload AutoFetch audit report' in WORKFLOW
    assert 'Deploy GitHub Pages' in WORKFLOW
    assert 'Verify deployed site' in WORKFLOW

    # V96.6.11.1 regression: no recursive copy into child output dir.
    assert "\n            cp -a . _autofetch_site/repo/" not in WORKFLOW
    assert "--exclude='./_autofetch_site'" in WORKFLOW
    assert 'test -f _autofetch_site/repo/index.html' in WORKFLOW

    log('SELF_TEST_OK version=96.6.11.1')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    ap.add_argument('--install', action='store_true')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--self-test', action='store_true')
    ap.add_argument('--limit', type=int, default=12)
    args = ap.parse_args()

    if args.self_test:
        self_test()
        return

    repo = find_repo(Path(args.repo))
    if args.install:
        install(repo, Path(__file__).resolve())
        return
    run(repo, max(1, min(args.limit, 50)), args.apply)


if __name__ == '__main__':
    main()

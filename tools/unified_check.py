#!/usr/bin/env python3
from pathlib import Path
import hashlib,json,re,subprocess,sys
R=Path(__file__).resolve().parents[1]
def must(test,msg):
 if not test:raise SystemExit('FAIL '+msg)
 print('PASS',msg)
h=(R/'index.html').read_text()
refs=re.findall(r'<script[^>]+src=[\"\']\./([^\"\']+)',h)
must(len(refs)==len(set(refs)), 'no duplicate script loads')
expected=['app.js','toeic-random-engine.js','voice-image-upgrade.js','analysis-appdeploy-parity.js','reading-question-bank.js','appdeploy-parity-runtime.js','headline-lesson-generator.js','lesson-flow-parity.js','vocab-goal-sync.js','study-workbench.js','ui-feedback.js','pwa-runtime.js']
must(refs==expected,'verified module load order')
for f in refs+['sw.js']:
 must((R/f).exists(),f+' exists');subprocess.run(['node','--check',str(R/f)],check=True,stdout=subprocess.DEVNULL)
for f in ['manifest-original.webmanifest','data/part1-bank.json','audio/manifest.json']:
 json.loads((R/f).read_text());print('PASS JSON',f)
for f in (R/'tools').glob('*.py'):compile(f.read_text(),str(f),'exec')
versions=[re.search(r"const VERSION='([^']+)'",(R/f).read_text()).group(1).replace('-github','') for f in ['app.js','sw.js']]
must(versions[0]==versions[1]=='2.6.3','application/service-worker version match')
shell=json.loads(re.search(r'const SHELL=(\[.*?\]);',(R/'sw.js').read_text()).group(1))
for f in shell:
 if f=='./':continue
 must((R/f).is_file(), 'precache file '+f)
for scene in json.loads((R/'data/part1-bank.json').read_text())['scenes']:
 must((R/scene['image']).is_file(),'Part 1 image '+scene['id'])
for f in refs:
 text=(R/f).read_text()
 must('localStorage.clear(' not in text,'no wholesale data clear: '+f)
release=json.loads((R/'release.json').read_text())
must(release['version']==versions[0],'release and runtime version match')
for name,digest in release['runtimeSha256'].items():
 must(hashlib.sha256((R/name).read_bytes()).hexdigest()==digest,'runtime fingerprint '+name)
print('UNIFIED_STATIC_CHECK_PASS')

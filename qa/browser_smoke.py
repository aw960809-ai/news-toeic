import asyncio,json,mimetypes,re
from urllib.parse import urlparse
from pathlib import Path
from playwright.async_api import async_playwright
R=Path(__file__).resolve().parents[1]
REPORT=[]
AUDIO=r'''(()=>{
 class U{constructor(text){this.text=text;this.lang='en-US'}}
 window.SpeechSynthesisUtterance=U;
 let current=null;const synth={speaking:false,paused:false,getVoices:()=>['en-US','en-GB','en-CA','en-AU'].map(lang=>({lang,name:lang,voiceURI:lang})),speak(u){current=u;this.speaking=true;this.paused=false;u.onstart?.({})},cancel(){const old=current;current=null;this.speaking=false;this.paused=false;old?.onerror?.({error:'canceled'})},pause(){this.paused=true;current?.onpause?.({})},resume(){this.paused=false},addEventListener(){}};
 Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});
 window.__audio={get text(){return current?.text},end(){const u=current;current=null;synth.speaking=false;u?.onend?.({})},endAll(){let n=0;while(current&&n++<150)this.end();return n}};
})();'''
def ok(name,details=None):
 REPORT.append({'test':name,'status':'PASS','details':details});print('PASS',name)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  ctx=await browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True,service_workers='block')
  errors=[]
  async def prepare(snapshot=None):
   page=await ctx.new_page()
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('dialog',lambda d:asyncio.create_task(d.accept()))
   h=(R/'index.html').read_text()
   scripts=re.findall(r'<script[^>]+src="\./([^"]+)"',h)
   h=re.sub(r'<script[^>]*>.*?</script>','',h,flags=re.S)
   h=re.sub(r'<link[^>]+>','',h)
   await page.set_content(h)
   await page.add_style_tag(content=(R/'styles.css').read_text())
   data={str(f.relative_to(R)):json.loads(f.read_text()) for f in [R/'data/news.json',R/'data/part1-bank.json',R/'audio/manifest.json']}
   for scene in data['data/part1-bank.json']['scenes']:
    import base64
    image=R/scene['image']
    if image.is_file():scene['image']='data:image/svg+xml;base64,'+base64.b64encode(image.read_bytes()).decode()
   storage=snapshot or {'ledger-sentinel':'keep-existing-money'}
   shim="(()=>{const m=new Map(Object.entries(__STORAGE__));const s={getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),key:i=>[...m.keys()][i]??null,get length(){return m.size}};Object.defineProperty(window,'localStorage',{value:s,configurable:true});window.__dumpStorage=()=>Object.fromEntries(m);const data=__DATA__;window.fetch=async url=>{const key=String(url).split('?')[0].replace(/^\\.\\//,'');return new Response(JSON.stringify(data[key]||{}),{status:data[key]?200:404,headers:{'Content-Type':'application/json'}})};window.AppPWA={check:async()=>true};})();"
   shim=shim.replace('__STORAGE__',json.dumps(storage)).replace('__DATA__',json.dumps(data))
   await page.add_script_tag(content=shim)
   await page.add_script_tag(content=AUDIO)
   for name in scripts:
    if name!='pwa-runtime.js':await page.add_script_tag(content=(R/name).read_text())
   await page.wait_for_timeout(180)
   return page
  page=await prepare()
  assert not errors, errors
  await page.wait_for_selector('.choose-main')
  assert await page.locator('.choose-main').count()==3
  ok('home renders exactly three selectable candidate cards')
  for route in ['news','practice','review','progress','settings']:
   await page.locator(f'.nav-btn[data-route={route}]').click();await page.wait_for_timeout(80)
  assert not errors,errors
  ok('six navigation routes load with no browser exceptions')
  for part in [3,4,6,7]:
   x=await page.evaluate('''p=>{const n=p===7?5:p===6?4:3;const s=ToeicPracticeBlocks.makeValidatedBlock(p,n,'browser-fixture','quick');return {n:s.questions.length,contexts:new Set(s.questions.map(q=>q.stimulus)).size,prompts:new Set(s.questions.map(q=>q.q)).size,audio:s.audioText,same:s.questions.every(q=>q.stimulus===s.questions[0].stimulus)}}''',part)
   assert x['contexts']==1 and x['same'] and x['n']==x['prompts'],x
  ok('Part 3/4/6/7 keep one shared context and distinct questions')
  await page.evaluate('''()=>{const q={part:'Part 7',q:'What will employees receive?',skill:'Detail',options:['Training','Lunch','Travel','Nothing'],answer:0,explain:'Training is stated.'};localStorage.setItem('mistakes',JSON.stringify([{id:'test-due',question:q,choice:1,sourceId:'offline-retail-github',status:'unmastered',reviewStage:0,nextReviewAt:new Date(Date.now()-1000).toISOString()},{id:'test-later',question:q,choice:2,sourceId:'offline-retail-github',status:'unmastered',reviewStage:0,nextReviewAt:new Date(Date.now()+86400000).toISOString()}]));}''')
  await page.locator('.nav-btn[data-route=review]').click()
  assert await page.locator('.retry-review').count()==1
  await page.locator('.retry-review').click();await page.wait_for_selector('dialog[open] .retry-answer')
  assert await page.locator('#reviewFeedback').inner_text()==''
  await page.locator('.retry-answer[data-i="0"]').click()
  row=await page.evaluate("JSON.parse(localStorage.getItem('mistakes'))[0]")
  assert row['reviewStage']==1 and row['choice']==0
  ok('due review opens, hides explanation before answering and advances once')
  await page.locator('#doneReview').click()
  await page.locator('.nav-btn[data-route=practice]').click()
  await page.locator('.part-start[data-part="3"]').click();await page.wait_for_selector('#playPracticeAudio')
  await page.locator('#playPracticeAudio').click();await page.locator('#playPracticeAudio').click()
  assert await page.evaluate('toeicAudio.state().paused')
  await page.locator('#playPracticeAudio').click();assert not await page.evaluate('toeicAudio.state().paused')
  n=await page.evaluate('__audio.endAll()');assert n>=2
  await page.locator('#playPracticeAudio').click();assert await page.evaluate('!!toeicAudio.state()')
  await page.evaluate('__audio.endAll()')
  await page.locator('#playPracticeAudio').click();assert await page.evaluate('toeicAudio.state()') is None
  ok('practice pause/resume does not consume a second play; replay cap is enforced')
  await page.locator('#dialogClose').click()
  await page.locator('#startFullMockStrict').click();await page.wait_for_selector('#playFullMockAudio')
  a=await page.evaluate("JSON.parse(localStorage.getItem('toeicFullMockActive'))")
  assert a['mode']=='strict'
  assert await page.locator('.full-mock-answer:disabled').count()==4
  await page.locator('#playFullMockAudio').click()
  assert await page.locator('.full-mock-answer:disabled').count()==4
  await page.locator('#playFullMockAudio').click();await page.locator('#playFullMockAudio').click()
  assert await page.evaluate("JSON.parse(localStorage.getItem('toeicFullMockActive')).plays")==1
  await page.evaluate('__audio.endAll()');await page.wait_for_timeout(40)
  assert await page.locator('.full-mock-answer:disabled').count()==0
  await page.locator('.full-mock-answer').first.click()
  assert await page.evaluate("JSON.parse(localStorage.getItem('toeicFullMockActive')).answers.length")==0
  await page.locator('#confirmFullMockAnswer').click()
  assert await page.evaluate("JSON.parse(localStorage.getItem('toeicFullMockActive')).answers.length")==1
  ok('strict mock locks answers until audio ends and requires explicit confirmation')
  await page.locator('#dialogClose').click();await page.locator('.nav-btn[data-route=practice]').click();await page.locator('#resumeFullMock').click()
  saved=await page.evaluate("JSON.parse(localStorage.getItem('toeicFullMockActive'))")
  await page.locator('#dialogClose').click();snapshot=await page.evaluate('__dumpStorage()');await page.close();page=await prepare(snapshot);await page.locator('.nav-btn[data-route=practice]').click();await page.locator('#resumeFullMock').click()
  resumed=await page.evaluate("JSON.parse(localStorage.getItem('toeicFullMockActive'))")
  assert resumed['answers']==saved['answers'] and resumed['currentSet']==saved['currentSet']
  ok('reload/resume preserves mock question options and previous answers')
  await page.locator('#dialogClose').click()
  await page.evaluate('''()=>{const a=JSON.parse(localStorage.getItem('toeicFullMockActive'));a.currentPart=5;a.currentSet=null;a.readingStartedAt=Date.now()-4600000;a.readingDeadline=Date.now()-1000;localStorage.setItem('toeicFullMockActive',JSON.stringify(a));resumeFullMock()}''')
  assert await page.evaluate("localStorage.getItem('toeicFullMockActive')") is None
  assert await page.evaluate("JSON.parse(localStorage.getItem('toeicFullMockHistory')).at(-1).timedOut") is True
  ok('expired strict Reading deadline submits on resume and retains history')
  await page.locator('#doneMock').click()
  await page.evaluate("openLesson('offline-retail-github')")
  await page.wait_for_selector('button.nextStep')
  assert 'STEP 1' in await page.locator('#lessonBody').inner_text()
  await page.locator('.nextStep').click();assert 'TIMED READING' in await page.locator('#lessonBody').inner_text()
  await page.evaluate('readingStarted=Date.now()-60000');await page.locator('#readDone').click();await page.locator('.nextStep').click();await page.locator('.nextStep').click();await page.locator('.nextStep').click()
  await page.wait_for_selector('#analysisSentences');assert await page.locator('.analysis-filter').count()==7
  await page.locator('.analysis-mark').first.click();assert await page.locator('#analysisDetail').is_visible()
  await page.locator('#analysisDetailClose').click();await page.locator('#analysisContinue').click()
  for i in range(5):
   correct=await page.evaluate('activeLesson.questions[qIndex].answer')
   await page.locator(f'.lesson-option[data-i="{correct}"]').click();await page.locator('#nextQ').click()
  assert 'SESSION COMPLETE' in await page.locator('#lessonBody').inner_text()
  count=await page.evaluate("JSON.parse(localStorage.getItem('sessions')).length")
  await page.evaluate('finishLesson()');assert await page.evaluate("JSON.parse(localStorage.getItem('sessions')).length")==count
  ok('full article step flow, analysis, questions and idempotent completion')
  await page.locator('#lessonDone').click()
  await page.evaluate("openLesson('offline-retail-github')")
  assert '閱覽' in await page.locator('#lessonBody').inner_text()
  await page.evaluate('finishLesson()');assert await page.evaluate("JSON.parse(localStorage.getItem('sessions')).length")==count
  await page.locator('#closeReadOnly').click()
  ok('completed article revisits do not add a second learning record')
  await page.evaluate("localStorage.setItem('toeicVocabBankV2',JSON.stringify([{id:'v:demand',word:'demand',meaning:'需求',collocation:'customer demand',stage:0,status:'learning',dueAt:'2020-01-01'}]));localStorage.setItem('toeicPatternBankV1',JSON.stringify([{id:'p:by',title:'By + V-ing',example:'By reviewing data, we can improve.',stage:0,status:'learning',dueAt:'2020-01-01'}]));")
  await page.locator('.nav-btn[data-route=review]').click();await page.locator('[data-study-tab=vocab]').click();await page.locator('#startVocabQuiz').click()
  await page.locator('#vocabAnswer').fill('demand');await page.locator('#vocabAnswer').press('Enter')
  await page.evaluate("document.querySelector('#vocabAnswer').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}))")
  v=await page.evaluate("JSON.parse(localStorage.getItem('toeicVocabBankV2'))[0]");assert v['reviews']==1 and v['stage']==1
  await page.locator('#nextVocab').click();await page.locator('#doneVocab').click()
  ok('vocabulary typing/Enter grades only once and saves SRS stage')
  await page.locator('[data-study-tab=writing]').click();await page.locator('[data-writing-mode=sentence]').click()
  await page.locator('#writingText').fill('By monitoring demand, managers can adjust staffing.')
  await page.locator('#submitWriting').click();assert '目標與格式檢查' in await page.locator('#writingFeedback').inner_text()
  assert await page.evaluate("JSON.parse(localStorage.getItem('toeicVocabBankV2'))[0].stage")==1
  await page.locator('#reviseWriting').click();assert await page.locator('#writingText').is_enabled()
  await page.locator('#writingText').fill('By reviewing demand, the team can prepare a better plan.');await page.locator('#submitWriting').click();await page.locator('#finishWriting').click()
  ok('writing checks and revisions save separately without falsely granting vocabulary mastery')
  await page.screenshot(path=str(R/'qa/workbench-mobile.png'),full_page=True)
  await page.locator('.nav-btn[data-route=settings]').click();await page.screenshot(path=str(R/'qa/settings-mobile.png'),full_page=True)
  assert await page.evaluate("localStorage.getItem('ledger-sentinel')")=='keep-existing-money'
  assert not errors, errors
  ok('other application storage sentinel preserved; no uncaught browser exceptions')
  (R/'qa/browser-report.json').write_text(json.dumps({'checks':len(REPORT),'browser':'Chromium mobile viewport 390x844','audio':'simulated SpeechSynthesis events; not physical-device audio','serviceWorker':'not exercised in DOM test','storage':'in-memory localStorage-compatible adapter; serialized across simulated page reloads','network':'local fixture Responses; no online requests' ,'status':'PASS','tests':REPORT},ensure_ascii=False,indent=2))
  await browser.close()
asyncio.run(main())

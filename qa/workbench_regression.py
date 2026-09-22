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
  async def reload_fixture(page):
   snapshot=await page.evaluate('__dumpStorage()');await page.close();return await prepare(snapshot)
  page=await prepare()
  async def review(tab):
   await page.locator('.nav-btn[data-route=review]').click()
   await page.locator(f'[data-study-tab={tab}]').click()
  # A legacy user snapshot is synthetic and remains byte-identical on reload.
  await page.evaluate('''()=>{
    localStorage.setItem('other-app-fixture','preserve unrelated data');
    localStorage.setItem('sessions',JSON.stringify(Array.from({length:603},(_,i)=>({id:'legacy-'+i,articleId:'legacy-article-'+i,date:'2026-09-01',title:'Legacy fixture',correct:3,total:5,wpm:101,durationMinutes:4}))));
    localStorage.setItem('toeicFullMockHistory',JSON.stringify([{id:'old-mock',correct:44,total:60,marker:'keep'}]));
  }''')
  saved=await page.evaluate("({s:localStorage.getItem('sessions'),m:localStorage.getItem('toeicFullMockHistory')})")
  page=await reload_fixture(page)
  assert await page.evaluate("({s:localStorage.getItem('sessions'),m:localStorage.getItem('toeicFullMockHistory')})")==saved
  ok('603 old article results and legacy mock history survive fixture reload byte-for-byte')
  await review('writing'); await page.locator('[data-writing-mode=sentence]').click()
  sentence='Although the delivery was delayed, our team plans to expand the service.'
  await page.locator('#writingText').fill(sentence)
  d1=await page.evaluate("JSON.parse(localStorage.getItem('toeicWritingDraftsV2')).sentence")
  page=await reload_fixture(page);await review('writing');await page.locator('[data-writing-mode=sentence]').click()
  assert await page.locator('#writingText').input_value()==sentence
  d2=await page.evaluate("JSON.parse(localStorage.getItem('toeicWritingDraftsV2')).sentence")
  assert d1['id']==d2['id'] and d1['words']==d2['words'] and d1['patterns']==d2['patterns']
  ok('fixture reload restores sentence text and EXACT vocabulary / pattern targets')
  await page.locator('#dialogClose').click();await page.locator('[data-writing-mode=paragraph]').click()
  await page.locator('#writingText').fill('This is the separate paragraph draft. It must not replace my sentence.')
  await page.locator('#dialogClose').click();await page.locator('[data-writing-mode=sentence]').click()
  assert await page.locator('#writingText').input_value()==sentence
  await page.locator('#submitWriting').click();await page.locator('#reviseWriting').click()
  await page.locator('#writingText').fill(sentence.replace('delayed','late'))
  await page.locator('#submitWriting').click();await page.locator('#dialogClose').click()
  history=await page.evaluate("JSON.parse(localStorage.getItem('toeicWritingSessionsV1'))")
  assert len(history)==2 and history[0]['draftId']==history[1]['draftId'] and history[-1]['revision']==2
  await page.locator('[data-writing-mode=paragraph]').click()
  assert 'separate paragraph' in await page.locator('#writingText').input_value()
  ok('sentence/paragraph drafts remain separate; revision history retains both submissions')
  await page.locator('#dialogClose').click();await review('vocab')
  await page.locator('#startVocabContext').click()
  quiz=await page.evaluate("JSON.parse(localStorage.getItem('toeicVocabQuizActiveV1'))")
  assert quiz['mode']=='context' and '_____' in await page.locator('.vocab-prompt').inner_text()
  word=quiz['set'][0]['word'];rid=quiz['set'][0]['id']
  await page.locator('#vocabAnswer').fill(word.upper());await page.locator('#vocabAnswer').press('Enter')
  before=await page.evaluate("id=>JSON.parse(localStorage.getItem('toeicVocabBankV2')).find(r=>r.id===id)",rid)
  page=await reload_fixture(page);await review('vocab');await page.locator('#startVocabQuiz').click()
  assert await page.locator('#vocabAnswer').is_disabled()
  q2=await page.evaluate("JSON.parse(localStorage.getItem('toeicVocabQuizActiveV1'))")
  assert q2['set']==quiz['set'] and q2['mode']=='context'
  assert await page.evaluate("id=>JSON.parse(localStorage.getItem('toeicVocabBankV2')).find(r=>r.id===id)",rid)==before
  await page.locator('#nextVocab').click(); await page.locator('#dialogClose').click()
  ok('context quiz resumes same set/options and feedback; reload does not advance SRS twice')
  await page.evaluate("openLesson('offline-retail-github')");await page.locator('.nextStep').click()
  await page.evaluate('readingStarted=Date.now()-60000');await page.locator('#readDone').click()
  for _ in range(3):await page.locator('.nextStep').click()
  await page.locator('#analysisContinue').click()
  correct=await page.evaluate('activeLesson.questions[qIndex].answer')
  await page.locator(f'.lesson-option[data-i="{(correct+1)%4}"]').click()
  pr1=await page.evaluate("JSON.parse(localStorage.getItem('toeicArticleProgressV1'))['offline-retail-github']")
  mistakes=await page.evaluate("localStorage.getItem('mistakes')")
  page=await reload_fixture(page);await page.evaluate("openLesson('offline-retail-github')")
  await page.wait_for_selector('#nextQ')
  pr2=await page.evaluate("JSON.parse(localStorage.getItem('toeicArticleProgressV1'))['offline-retail-github']")
  assert pr1['answers']==pr2['answers'] and pr1['lesson']==pr2['lesson'] and pr1['readingMs']==pr2['readingMs']
  assert pr1['sessionId']==pr2['sessionId'] and await page.evaluate("localStorage.getItem('mistakes')")==mistakes
  assert await page.locator('.lesson-option:disabled').count()==4
  ok('unfinished article restores paragraph, option order, prior answers, reading time and session ID')
  await page.locator('#nextQ').click()
  for _ in range(4):
   c=await page.evaluate('activeLesson.questions[qIndex].answer');await page.locator(f'.lesson-option[data-i="{c}"]').click();await page.locator('#nextQ').click()
  assert 'SESSION COMPLETE' in await page.locator('#lessonBody').inner_text()
  ss=await page.evaluate("JSON.parse(localStorage.getItem('sessions'))")
  assert len(ss)==604 and ss[:-1]==json.loads(saved['s'])
  assert await page.evaluate("JSON.parse(localStorage.getItem('toeicArticleProgressV1'))['offline-retail-github']||null") is None
  await page.locator('#dialogClose').click()
  await page.evaluate("openLesson('offline-retail-github')");assert '已完成教材閱覽' in await page.locator('#lessonBody').inner_text()
  await page.locator('#dialogClose').click()
  assert len(await page.evaluate("JSON.parse(localStorage.getItem('sessions'))"))==604
  ok('completion adds one result without a 500-row cap; revisits preserve histories')
  assert await page.evaluate("localStorage.getItem('other-app-fixture')")=='preserve unrelated data'
  ok('unrelated application localStorage remains unchanged')
  for width in [360,390,430]:
   await page.set_viewport_size({'width':width,'height':844})
   for tab in ['mistakes','vocab','writing']:
    await review(tab)
    assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'), (width,tab)
  await page.screenshot(path=str(R/'qa/workbench-regression-mobile.png'),full_page=True)
  assert not errors,errors
  ok('three mobile widths and review tabs have no horizontal page overflow or uncaught exceptions')
  assert not errors,errors
  await browser.close()
 (R/'qa/workbench-regression-report.json').write_text(json.dumps({'status':'PASS','checks':len(REPORT),'browser':'Chromium 360/390/430 px, DOM fixture tests','storage':'localStorage-compatible adapter; snapshot serialized across newly built page fixtures','serviceWorker':'not tested; browser policy blocked HTTP/HTTPS navigation','audio':'not physically tested; simulated SpeechSynthesis','tests':REPORT},ensure_ascii=False,indent=2))
asyncio.run(main())

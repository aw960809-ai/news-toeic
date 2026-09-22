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
  assert not errors,errors
  await page.evaluate("startPractice(6,4)")
  await page.wait_for_selector('.current-gap')
  text=await page.locator('.practice-passage').inner_text()
  assert all('['+str(n)+'] _____' in text for n in range(1,5))
  assert 'Why should employees use the newest version?' not in await page.locator('#lessonBody').inner_text()
  assert await page.locator('.practice-answer').count()==4
  first=await page.locator('.reading-bank-note strong').inner_text()
  assert await page.evaluate("document.documentElement.scrollWidth<=innerWidth")
  await page.screenshot(path=str(R/'qa/part6-fixed-mobile.png'),full_page=True)
  ok('Part 6 mobile view shows four real numbered blanks, a highlighted current gap and four choices')
  for i in range(4):
   assert '['+str(i+1)+']' in await page.locator('.current-gap').inner_text()
   await page.locator('.practice-answer').nth(0).click()
   assert await page.locator('#practiceFeedback').inner_text()
   await page.locator('#practiceNext').click()
  assert await page.locator('#doneP').count()==1
  rows=await page.evaluate("JSON.parse(localStorage.getItem('toeicPartSessions'))")
  assert rows[-1]['total']==4
  await page.locator('#doneP').click()
  ok('all four blanks can be answered in order and the complete round is saved')
  await page.evaluate("startPractice(6,4)")
  second=await page.locator('.reading-bank-note strong').inner_text()
  assert first!=second
  snap=await page.evaluate('__dumpStorage()')
  await page.close()
  page=await prepare(snap)
  await page.evaluate("startPractice(6,4)")
  third=await page.locator('.reading-bank-note strong').inner_text()
  assert third not in [first,second]
  ok('starting another Part 6 round and reloading use different contexts, not different labels on the same text')
  await page.locator('#dialogClose').click()
  await page.evaluate("startPractice(7,4)")
  assert await page.locator('.reading-gap').count()==0
  assert await page.locator('.practice-answer').count()==4
  assert 'The company will test a new' not in await page.locator('.practice-passage').inner_text()
  await page.screenshot(path=str(R/'qa/part7-fixed-mobile.png'),full_page=True)
  ok('Part 7 remains reading comprehension and uses a separate original passage')
  await page.locator('#dialogClose').click()
  await page.evaluate("startPractice(6,8)")
  for i in range(4):
   await page.locator('.practice-answer').nth(0).click()
   if i==3:
    await page.evaluate("() => {window.__originalReadingDraw=ToeicReadingBank.draw;ToeicReadingBank.draw=()=>{throw new Error('simulated next-block failure')}}")
   await page.locator('#practiceNext').click()
  assert await page.locator('#practiceCloseError').count()==1
  await page.locator('#practiceCloseError').click()
  partial=await page.evaluate("JSON.parse(localStorage.getItem('toeicPartSessions')).at(-1)")
  assert partial['total']==4
  await page.locator('#doneP').click()
  await page.evaluate('() => {ToeicReadingBank.draw=window.__originalReadingDraw}')
  ok('a failed next block offers to save already-answered practice questions instead of discarding them')
  result=await page.evaluate("""()=>{
   const details={};for(const p of [6,7]){
    const qs=[],used=[],n=p===6?16:54;let block=0;
    while(qs.length<n){const s=ToeicPracticeBlocks.makeValidatedBlock(p,Math.min(p===6?4:5,n-qs.length),'browser-full-'+p,'mock',block++,null,used);used.push(s.questions[0].contextFingerprint);qs.push(...s.questions)}
    details[p]={questions:qs.length,contexts:used.length,unique:new Set(used).size,questionIds:new Set(qs.map(q=>q.id)).size};
   }return details;
  }""")
  assert result['6']=={'questions':16,'contexts':4,'unique':4,'questionIds':16}
  assert result['7']=={'questions':54,'contexts':11,'unique':11,'questionIds':54}
  ok('actual runtime builds all 70 Part 6/7 mock questions without repeating a context within either Part',result)
  await page.evaluate("""()=>{
   const set=ToeicPracticeBlocks.makeValidatedBlock(6,4,'saved-browser-mock','mock',0);
   const a={id:'saved-browser-mock',mode:'training',startedAt:Date.now(),currentPart:6,currentSet:set,currentIndex:1,blockNumbers:{'6':1},answers:[{part:6,q:set.questions[0],choice:0,correct:0===set.questions[0].answer}],validationScores:{'6':[100]},plays:0,audioComplete:true,currentAccents:[],currentVoiceResults:[],seed:12,readingStartedAt:Date.now()};
   localStorage.setItem('toeicFullMockActive',JSON.stringify(a));resumeFullMock();
  }""")
  before=await page.locator('#lessonBody').inner_text()
  assert '[2]' in await page.locator('.current-gap').inner_text()
  assert await page.locator('.full-mock-answer').count()==4
  snap=await page.evaluate('__dumpStorage()')
  await page.close();page=await prepare(snap)
  await page.evaluate('resumeFullMock()')
  after=await page.locator('#lessonBody').inner_text()
  assert before==after
  assert len((await page.evaluate("JSON.parse(localStorage.getItem('toeicFullMockActive'))"))['answers'])==1
  ok('reloading and resuming a new reading mock preserves article, gap, option order and prior answer')
  await page.locator('#dialogClose').click()
  await page.evaluate("""()=>{
   const q={id:'old-legacy-p6',part:6,q:'Why should employees use the newest version?',stimulus:'LEGACY SNAPSHOT: The document was revised this morning.',options:['A revised document','A closed office','A lost file','A holiday'],answer:0,explain:'Old explanation'};
   const a={id:'legacy-mock',mode:'training',startedAt:Date.now(),currentPart:6,currentSet:{id:'legacy-set',part:6,validation:{score:100},questions:[q]},currentIndex:0,blockNumbers:{},answers:[],validationScores:{},plays:0,audioComplete:true,currentAccents:[],readingStartedAt:Date.now()};localStorage.setItem('toeicFullMockActive',JSON.stringify(a));resumeFullMock();
  }""")
  assert 'LEGACY SNAPSHOT' in await page.locator('.practice-passage').inner_text()
  assert 'Why should employees use the newest version?' in await page.locator('#lessonBody').inner_text()
  assert await page.locator('.reading-gap').count()==0
  ok('an already-saved legacy mock is not silently rewritten by the upgrade')
  assert await page.evaluate("localStorage.getItem('ledger-sentinel')")=='keep-existing-money'
  assert not errors,errors
  ok('no uncaught browser exceptions or horizontal overflow; unrelated application sentinel is retained')
  (R/'qa/reading-browser-report.json').write_text(json.dumps({'checks':len(REPORT),'status':'PASS','tests':REPORT,'browser':'Chromium 390x844 mobile viewport','storage':'in-memory compatible adapter, serialized across page recreation','audio':'simulated','serviceWorker':'not exercised','physicalDevice':'not tested'},ensure_ascii=False,indent=2)+'\n')
  await browser.close()
asyncio.run(main())

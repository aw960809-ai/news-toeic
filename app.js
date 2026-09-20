'use strict';

const VERSION='2.2.7-github';
const KEYS={
 generated:'generated',sessions:'sessions',mistakes:'mistakes',settings:'settings',
 daily:'dailyMainAssignment',dailyHistory:'dailyMainHistory',dailyPool:'dailyMainCandidatePool',
 articleReviews:'toeicArticleReviewSnapshotsV1',reviewEvents:'toeicReviewEvents',
 partSessions:'toeicPartSessions',partMistakes:'toeicPartMistakes',practiceMode:'toeicPracticeMode',
 accent:'toeicAccentCursor',mockActive:'toeicFullMockActive',mockHistory:'toeicFullMockHistory',
 goalQueue:'goalSyncQueue',goalStatus:'goalSyncStatus',goalChannel:'goalSyncChannel',
 analysis:'toeicArticleAnalysisCacheV1',hub:'GoalManagerToeicEventHubV2'
};
const load=(k,f)=>{try{const r=localStorage.getItem(k);return r?JSON.parse(r):f}catch{return f}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const now=()=>new Date().toISOString();
const main=document.getElementById('appMain'),dialog=document.getElementById('lessonDialog'),dialogTitle=document.getElementById('lessonTitle'),body=document.getElementById('lessonBody');
let route='today',news=[],newsUpdatedAt='',activeLesson=null,lessonStarted=0,readingStarted=0,answers=[],qIndex=0;
let settings={currentLevel:600,targetScore:750,dailyMinutes:30,category:'Balanced',...load(KEYS.settings,{})};

const offlineLesson={
 id:'offline-retail-github',origin:'offline',articleType:'Main Article',category:'Business',
 source:'Offline Practice',publishedAt:'2026-09-18',toeicScore:82,
 title:'Retail Team Expands Delivery Options',
 text:`A regional retailer plans to expand its delivery options after customers asked for more flexible service. The company will add evening delivery windows and more pickup locations next month.

Managers said the change is intended to reduce missed deliveries and give customers more control over their schedules. Employees at selected stores will receive additional route-planning and customer-service training.

The retailer will review delivery times, customer comments, and failed delivery attempts every week. Local teams may adjust staffing when demand increases.

Some large products will still require standard delivery. The company will evaluate the program later in the year before deciding whether to expand it further.`,
 vocabulary:[['expand','擴大','expand a service'],['flexible','彈性的','flexible service'],['delivery window','配送時段','evening delivery window'],['adjust','調整','adjust staffing'],['evaluate','評估','evaluate a program']],
 grammar:[['plan to + V','The company plans to expand its service.'],['may + V','Local teams may adjust staffing.']],
 questions:[
  q('n1','Part 7','Main Idea','What is the passage mainly about?',['A retailer expanding delivery options','A store closing all pickup locations','A company ending online sales','A supplier changing its name'],0,'The passage focuses on expanding delivery options.'),
  q('n2','Part 7','Detail','What will some employees receive?',['Route-planning training','Free furniture','New company names','Hotel reservations'],0,'Selected employees will receive training.'),
  q('n3','Part 7','Inference','Why will managers review weekly data?',['To adjust operations when needed','To stop all deliveries','To reduce customer feedback','To close stores immediately'],0,'The data helps local teams adjust staffing and service.'),
  q('n4','Part 5','Grammar','The company plans to _____ its service.',['expands','expand','expanded','expanding'],1,'plan to + base verb'),
  q('n5','Part 5','Vocabulary','The company will _____ the program later.',['evaluate','deliver','reserve','cancelled'],0,'evaluate means assess.')
 ]
};

function q(id,part,skill,text,options,answer,explain){return{id,part,skill,q:text,options,answer,explain}}
function toast(message){const host=document.getElementById('toastHost'),e=document.createElement('div');e.className='toast';e.textContent=message;host.appendChild(e);setTimeout(()=>e.remove(),2200)}
function wordCount(t=''){return(t.match(/\b[\w'-]+\b/g)||[]).length}
function speech(text,lang='en-US'){if(!('speechSynthesis'in window))return toast('此裝置不支援語音播放');speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=.94;speechSynthesis.speak(u)}
function generated(){return load(KEYS.generated,[])}
function sessions(){return load(KEYS.sessions,[])}
function analyticsSessions(){
 const rows=sessions(),seen=new Set();
 return rows.filter(row=>{const id=String(row?.id||'');if(!id)return true;if(seen.has(id))return false;seen.add(id);return true});
}
function displayWpm(value){const n=Number(value);return n>=40&&n<=450?`${Math.round(n)} WPM`:'未計入'}
function newsMistakes(){return load(KEYS.mistakes,[])}
function partSessions(){return load(KEYS.partSessions,[])}
function partMistakes(){return load(KEYS.partMistakes,[])}
function mockHistory(){return load(KEYS.mockHistory,[])}
function allLessons(){return[offlineLesson,...generated()]}
function accuracy(){const ss=analyticsSessions(),t=ss.reduce((n,s)=>n+(Number(s.total)||0),0);return t?Math.round(ss.reduce((n,s)=>n+(Number(s.correct)||0),0)/t*100):0}
function avgWpm(){const v=analyticsSessions().map(s=>Number(s.wpm)).filter(x=>x>=40&&x<=450);return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):0}
function targetWords(){const a=accuracy(),w=avgWpm();if(!w)return'250–400';if(w<95||a<65)return'180–250';if(w<120||a<75)return'250–350';if(w<140||a<85)return'300–450';return'450–650'}

async function loadNews(manual=false){
 const button=manual?document.querySelector('#reloadNews'):null;
 const beforeStamp=newsUpdatedAt;
 const beforeCount=news.length;
 if(button){
  button.disabled=true;
  button.textContent='讀取中…';
 }
 try{
  const r=await fetch(`./data/news.json?ts=${Date.now()}`,{cache:'no-store'});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  const d=await r.json();
  if(!Array.isArray(d.articles))throw new Error('news.json articles 格式錯誤');
  news=d.articles;
  newsUpdatedAt=String(d.updatedAt||'');
  localStorage.setItem('toeicGithubNewsUpdatedAt',newsUpdatedAt);
  localStorage.setItem('toeicGithubNewsLastLoadedAt',new Date().toISOString());
  if(manual){
   const changed=Boolean(newsUpdatedAt&&newsUpdatedAt!==beforeStamp)||news.length!==beforeCount;
   const when=newsUpdatedAt?new Date(newsUpdatedAt).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'未知時間';
   toast(changed?`已載入最新新聞 · ${news.length} 篇 · ${when}`:`目前已是最新新聞 · ${news.length} 篇`);
  }
 }catch(error){
  console.error('News reload failed',error);
  if(manual)toast('新聞讀取失敗；已保留目前新聞，稍後會再自動嘗試');
 }
 render();
}

function practiceParagraph(item){
 const topic=esc(item.title||'Current workplace news');
 const source=esc(item.source||'news source');
 const category=item.category||'Business';
 const intros={
  Business:'A company is reviewing a new service plan after receiving feedback from customers and employees.',
  Travel:'A travel service is adjusting its schedule to make reservations and transportation more convenient.',
  Technology:'A technology provider is introducing a new tool designed to make routine work easier for customers.',
  'Daily Life':'A local service is changing its daily operations to respond to customer demand.'
 };
 return `${intros[category]||intros.Business} The practice topic was inspired by the headline “${topic}” from ${source}, but the passage below is an original TOEIC-style learning adaptation rather than a factual reproduction of the article.

Managers have asked staff members to prepare clear instructions for customers before the change begins. They will also review common questions and provide additional training when necessary.

The organization plans to monitor response times, customer comments, and operational problems during the first few weeks. If the new process works well, it may be expanded to additional locations.

Employees are encouraged to report unclear procedures early so that managers can make adjustments. The final decision will be based on service quality, cost, and customer feedback.`;
}

function buildNewsLesson(item){
 const text=practiceParagraph(item);
 const id=`lesson-${String(item.id||Date.now()).replace(/[^a-zA-Z0-9-]/g,'-')}`;
 return{id,origin:'generated',articleType:'Main Article',category:item.category||'Business',source:item.source||'News source',publishedAt:item.publishedAt||now(),toeicScore:item.toeicScore||75,title:`Practice adaptation: ${item.title}`,url:item.url||'',text,
 vocabulary:[['procedure','程序','follow a procedure'],['monitor','監測','monitor performance'],['adjustment','調整','make an adjustment'],['feedback','回饋','customer feedback'],['expand','擴大','expand to more locations']],
 grammar:[['plan to + V','The organization plans to monitor results.'],['If + present, may + V','If the process works well, it may be expanded.']],
 questions:[
  q(`${id}-1`,'Part 7','Main Idea','What is the practice passage mainly about?',['Preparing and evaluating a service change','Closing every office immediately','Changing a company name','Cancelling customer support'],0,'The passage is about preparing and evaluating a service change.'),
  q(`${id}-2`,'Part 7','Detail','What will managers review?',['Customer comments','Employee passports','Hotel menus','Advertising slogans only'],0,'Customer comments are one of the measures.'),
  q(`${id}-3`,'Part 7','Inference','What may happen if the process works well?',['It may expand to more locations','All training will stop','Customers will lose access','The organization will close'],0,'The passage says it may expand.'),
  q(`${id}-4`,'Part 5','Grammar','Managers asked staff _____ clear instructions.',['prepare','to prepare','prepared','preparing'],1,'ask + object + to-infinitive'),
  q(`${id}-5`,'Part 5','Vocabulary','The word “monitor” is closest in meaning to:',['observe','cancel','deliver','purchase'],0,'monitor = observe/check regularly')
 ]};
}

function articleAnalysis(text){
 const sentences=(text.replace(/\n+/g,' ').match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[]).map(x=>x.trim()).filter(Boolean).slice(0,40);
 const connectors=['because','however','therefore','if','when','before','after','so that','although','while','as a result','but','and'];
 return sentences.map((sentence,index)=>{
  const found=connectors.filter(c=>sentence.toLowerCase().includes(c));
  let highlighted=esc(sentence);
  found.forEach(c=>{const re=new RegExp(`\\b(${c.replace(' ','\\s+')})\\b`,'ig');highlighted=highlighted.replace(re,'<mark class="analysis-mark">$1</mark>')});
  return{index,sentence,highlighted,simple:sentence.replace(/\([^)]*\)/g,'').replace(/\s+/g,' ').trim(),structure:found.length?`MAIN IDEA → ${found.join(' / ').toUpperCase()} → DETAIL`:'SUBJECT → ACTION → DETAIL',expression:(sentence.match(/\b(?:plan to|asked .*? to|in order to|as a result|be based on|encouraged to)\b/i)||[])[0]||'key sentence'};
 });
}

function saveAnalysisCache(article,analysis){
 const rows=load(KEYS.analysis,[]).filter(x=>x.articleId!==article.id);
 rows.push({articleId:article.id,fingerprint:`${article.text.length}:${article.text.slice(0,24)}`,savedAt:now(),analysis});
 save(KEYS.analysis,rows.slice(-20));
}
function cachedAnalysis(article){
 const fp=`${article.text.length}:${article.text.slice(0,24)}`;
 return load(KEYS.analysis,[]).find(x=>x.articleId===article.id&&x.fingerprint===fp)?.analysis||null;
}

function hubEvents(){const x=load(KEYS.hub,{updatedAt:'',events:[]});return Array.isArray(x.events)?x.events:[]}
function publishGoalEvent(event){
 const events=hubEvents();
 if(!events.some(x=>x.eventId===event.eventId))events.unshift(event);
 save(KEYS.hub,{updatedAt:now(),events:events.slice(0,400)});
 window.dispatchEvent(new StorageEvent('storage',{key:KEYS.hub,newValue:localStorage.getItem(KEYS.hub)}));
}
function migrateQueuedGoalEvents(){
 const queue=load(KEYS.goalQueue,[]);
 if(!Array.isArray(queue)||!queue.length)return;
 queue.forEach(publishGoalEvent);
 save(KEYS.goalQueue,[]);
 save(KEYS.goalStatus,`GitHub 直連已接收 ${queue.length} 筆舊待傳紀錄`);
}
function makeGoalEvent(title,duration,total,correct,wrongSkills=[],extra={}){
 const end=now(),start=new Date(Date.now()-Math.max(1,duration)*60000).toISOString();
 return{eventId:`toeic-github-${Date.now()}-${Math.random().toString(36).slice(2)}`,channelId:localStorage.getItem(KEYS.goalChannel)||'github-direct',source:'news-toeic',activity:'toeic-news-training',goalKey:'foreign-language-preparation',goalLabels:['語言能力準備'],startedAt:start,endedAt:end,durationMinutes:Math.max(1,Math.round(duration)),articleId:extra.articleId||'',articleTitle:title,category:extra.category||'Practice',articlesCompleted:extra.articlesCompleted||0,wordCount:extra.wordCount||0,questionsAnswered:total,correctAnswers:correct,accuracy:total?Math.round(correct/total*100):0,readingWpm:extra.readingWpm||0,part1Answered:extra.part1Answered||0,part1Correct:extra.part1Correct||0,part2Answered:extra.part2Answered||0,part2Correct:extra.part2Correct||0,part3Answered:extra.part3Answered||0,part3Correct:extra.part3Correct||0,part4Answered:extra.part4Answered||0,part4Correct:extra.part4Correct||0,part5Answered:extra.part5Answered||0,part5Correct:extra.part5Correct||0,part6Answered:extra.part6Answered||0,part6Correct:extra.part6Correct||0,part7Answered:extra.part7Answered||0,part7Correct:extra.part7Correct||0,wrongSkills};
}

function todayPage(){
 const ss=sessions(),done=ss.some(s=>s.date===dayKey());
 const assigned=load(KEYS.daily,null);
 let lesson=assigned?allLessons().find(x=>x.id===assigned.articleId):null;
 if(!lesson)lesson=allLessons()[0];
 return`<section class="hero"><p class="eyebrow">TODAY</p><h2>${done?'今日主訓練已完成':'今日主訓練'}</h2><p>目前 ${settings.currentLevel} → 目標 ${settings.targetScore}。建議文章長度 ${targetWords()} 字；GitHub 版即使 AI 服務不可用仍可完整開啟、複習與模考。</p></section><div class="section-head"><h3>主文章</h3><span class="badge">${done?'已完成':'待完成'}</span></div><section class="card"><h3>${esc(lesson.title)}</h3><p class="muted">${esc(lesson.source)} · ${lesson.category}</p><div class="actions"><button class="primary" id="startDaily" data-id="${esc(lesson.id)}">開始訓練</button><button class="secondary" id="chooseNews">從新聞池挑題材</button></div></section><div class="section-head"><h3>今天的狀態</h3></div><section class="grid2"><div class="card kpi"><span class="muted">閱讀平均</span><strong>${avgWpm()||'—'}</strong><small>WPM</small></div><div class="card kpi"><span class="muted">新聞正確率</span><strong>${accuracy()||'—'}${accuracy()?'%':''}</strong></div></section>`}
function newsPage(){
 return`<section class="hero"><p class="eyebrow">LIVE TOPICS</p><h2>新聞教材池</h2><p>GitHub Actions 每 6 小時更新新聞標題與來源。按「建立教材」會在手機本機建立原創 TOEIC 練習改寫，不把新聞全文複製進系統。</p></section><div class="section-head"><h3>目前題材</h3><button id="reloadNews" class="secondary">重新讀取</button></div><section class="grid">${news.length?news.map(n=>`<article class="card news-card"><div class="news-meta"><span class="badge">${esc(n.category||'Business')}</span><span class="badge">${esc(n.source||'News')}</span></div><h3>${esc(n.title)}</h3><p class="muted">${esc(n.summary||'')}</p><div class="actions"><button class="primary make-lesson" data-id="${esc(n.id)}">建立原創 TOEIC 教材</button>${n.url?`<a class="secondary" href="${esc(n.url)}" target="_blank" rel="noopener">來源</a>`:''}</div></article>`).join(''):'<div class="card"><p class="muted">新聞池暫無資料；離線文章與題型訓練仍可使用。</p></div>'}</section>`}

const PART_INFO={
 1:['照片描述','Listening'],2:['應答問題','Listening'],3:['簡短對話','Listening'],4:['簡短獨白','Listening'],
 5:['句子填空','Reading'],6:['段落填空','Reading'],7:['閱讀理解','Reading']
};
function practicePage(){
 return`<section class="hero"><p class="eyebrow">PARTS 1–7</p><h2>完整題型訓練</h2><p>GitHub 版改用本機原創題庫生成器，因此不會因 AppDeploy 額度用完而停用。題目不是 ETS 官方題。</p></section><div class="section-head"><h3>選擇 Part</h3><button id="startMock" class="secondary">完整 200 題模考</button></div><section class="practice-parts">${Object.entries(PART_INFO).map(([p,[name,fam]])=>`<button data-part="${p}"><strong>Part ${p} · ${name}</strong><small>${fam}</small></button>`).join('')}</section>`}

function reviewPage(){
 const nm=newsMistakes(),pm=partMistakes(),all=[...nm.map(x=>({...x,_kind:'news'})),...pm.map(x=>({...x,_kind:'part'}))];
 const active=all.filter(x=>x.status!=='mastered');
 return`<section class="hero"><p class="eyebrow">SPACED REVIEW</p><h2>錯題與複習</h2><p>既有 AppDeploy 錯題匯入後會保留狀態。GitHub 版新錯題同樣採 1 → 3 → 7 日複習節奏。</p></section><div class="section-head"><h3>待處理</h3><span class="badge">${active.length} 題</span></div><section class="grid">${active.length?active.slice(-30).reverse().map((m,i)=>`<article class="card review-row"><div><span class="badge">${esc(m.question?.part||`Part ${m.part||''}`)}</span> <span class="badge">${esc(m.status||'unmastered')}</span></div><strong>${esc(m.question?.q||'錯題')}</strong><button class="secondary review-mark" data-kind="${m._kind}" data-id="${esc(m.id)}">本次已複習並答對</button></article>`).join(''):'<div class="card"><p class="muted">目前沒有待複習錯題。</p></div>'}</section>`}
function progressPage(){
 const ss=analyticsSessions(),ps=partSessions(),mh=mockHistory();
 const mins=ss.reduce((a,b)=>a+(Number(b.durationMinutes)||0),0)+ps.reduce((a,b)=>a+(Number(b.durationMinutes)||0),0);
 return`<section class="hero"><p class="eyebrow">PROGRESS</p><h2>${settings.currentLevel} → ${settings.targetScore}</h2><p>所有歷史資料都保存在此 GitHub 網域的瀏覽器儲存空間。</p></section><section class="kpis"><div class="card kpi"><small>新聞訓練</small><strong>${ss.length}</strong></div><div class="card kpi"><small>Part 練習</small><strong>${ps.length}</strong></div><div class="card kpi"><small>模考</small><strong>${mh.length}</strong></div></section><div class="section-head"><h3>近期新聞訓練</h3><span class="badge">${Math.round(mins)} 分</span></div><section class="grid">${ss.length?ss.slice(-8).reverse().map(s=>`<div class="card"><strong>${esc(s.title||'訓練')}</strong><p class="muted">${esc(s.date||'')} · ${s.correct||0}/${s.total||0} · ${displayWpm(s.wpm)}</p></div>`).join(''):'<div class="card"><p class="muted">尚無紀錄。</p></div>'}</section>`}

const MIGRATION_PREFIXES=['toeic','dailyMain','goalSync'];
const MIGRATION_EXACT=new Set(['generated','sessions','mistakes','settings']);
function exportBackup(){
 const keys={};
 for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k)continue;if(MIGRATION_EXACT.has(k)||MIGRATION_PREFIXES.some(p=>k.startsWith(p))||k===KEYS.analysis||k===KEYS.articleReviews||k===KEYS.reviewEvents)keys[k]=localStorage.getItem(k)}
 const obj={schema:'news-toeic-github-backup-v1',version:VERSION,exportedAt:now(),keys};
 const a=document.createElement('a'),blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});a.href=URL.createObjectURL(blob);a.download=`news-toeic-backup-${dayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function importBackup(file){
 const r=new FileReader();r.onload=()=>{try{
  const obj=JSON.parse(String(r.result||'')),keys=obj.keys;
  if(!keys||typeof keys!=='object')throw new Error('備份格式不符');
  const snap={at:now(),keys:{}};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&(MIGRATION_EXACT.has(k)||MIGRATION_PREFIXES.some(p=>k.startsWith(p))))snap.keys[k]=localStorage.getItem(k)}
  const snaps=load('toeicGithubMigrationSnapshotsV1',[]);snaps.push(snap);save('toeicGithubMigrationSnapshotsV1',snaps.slice(-5));
  let count=0;Object.entries(keys).forEach(([k,v])=>{if(MIGRATION_EXACT.has(k)||MIGRATION_PREFIXES.some(p=>k.startsWith(p))||k===KEYS.analysis||k===KEYS.articleReviews||k===KEYS.reviewEvents){localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v));count++}});
  settings={currentLevel:600,targetScore:750,dailyMinutes:30,category:'Balanced',...load(KEYS.settings,{})};
  migrateQueuedGoalEvents();toast(`匯入完成 · ${count} 個資料鍵`);render();
 }catch(e){console.error(e);toast(`匯入失敗：${e.message||e}`)}};r.readAsText(file)
}
function settingsPage(){
 return`<div class="section-head"><h2>設定</h2><span class="badge">v${VERSION}</span></div><section class="card"><h3>個人學習設定</h3><label class="setting"><span>目前 TOEIC 基準</span><input class="settings-input" id="cur" type="number" value="${settings.currentLevel}"></label><label class="setting"><span>目標分數</span><input class="settings-input" id="goal" type="number" value="${settings.targetScore}"></label><label class="setting"><span>每日分鐘</span><input class="settings-input" id="mins" type="number" value="${settings.dailyMinutes}"></label><button id="saveSettings" class="primary wide">儲存設定</button></section><section class="card"><div class="section-head" style="margin-top:0"><h3>GitHub 直連 Goal Manager</h3><span class="badge ok">同網域</span></div><p class="muted">完成新聞訓練、Part 練習或模考後，事件會寫入同一 GitHub Pages 網域的共享儲存區，不需要 AppDeploy iframe 或同步碼。</p><button id="flushQueue" class="secondary wide">搬移舊 Goal Sync 待傳紀錄</button></section><section class="card"><h3>完整遷移備份</h3><p class="muted">匯入前會先保存目前 GitHub TOEIC 本機資料快照。AppDeploy 匯出的 localStorage keys 可直接匯入。</p><div class="actions"><button id="exportBackup" class="primary">匯出 GitHub 備份</button></div><input id="importFile" class="file-input" type="file" accept=".json,application/json"><button id="importBackup" class="secondary wide">匯入 AppDeploy／GitHub 備份</button></section><section class="card"><h3>系統模式</h3><p class="muted">新聞題材：GitHub Actions。教材／題型／解析：本機原創生成器。語音：裝置 Speech Synthesis。此版本沒有 AppDeploy 點數依賴。</p></section>`}

function render(){
 main.innerHTML=({today:todayPage,news:newsPage,practice:practicePage,review:reviewPage,progress:progressPage,settings:settingsPage})[route]();
 bind();
}
function bind(){
 document.querySelector('#startDaily')?.addEventListener('click',e=>openLesson(e.currentTarget.dataset.id));
 document.querySelector('#chooseNews')?.addEventListener('click',()=>switchRoute('news'));
 document.querySelector('#reloadNews')?.addEventListener('click',()=>void loadNews(true));
 document.querySelectorAll('.make-lesson').forEach(b=>b.onclick=()=>{const n=news.find(x=>String(x.id)===String(b.dataset.id));if(!n)return;const lesson=buildNewsLesson(n),rows=generated().filter(x=>x.id!==lesson.id);rows.push(lesson);save(KEYS.generated,rows.slice(-60));save(KEYS.daily,{date:dayKey(),articleId:lesson.id,completed:false,selectedByUser:true});toast('已建立本機原創教材');openLesson(lesson.id)});
 document.querySelectorAll('[data-part]').forEach(b=>b.onclick=()=>startPractice(Number(b.dataset.part),practiceCount(Number(b.dataset.part))));
 document.querySelector('#startMock')?.addEventListener('click',startFullMock);
 document.querySelectorAll('.retry-review').forEach(b=>b.onclick=()=>appdeployRetryReview(b.dataset.kind,b.dataset.id));
 document.querySelector('#saveSettings')?.addEventListener('click',()=>{settings.currentLevel=Number(document.querySelector('#cur').value)||600;settings.targetScore=Number(document.querySelector('#goal').value)||750;settings.dailyMinutes=Number(document.querySelector('#mins').value)||30;save(KEYS.settings,settings);toast('設定已儲存');render()});
 document.querySelector('#exportBackup')?.addEventListener('click',exportBackup);
 document.querySelector('#importBackup')?.addEventListener('click',()=>{const f=document.querySelector('#importFile').files?.[0];if(!f)return toast('請先選擇 JSON');importBackup(f)});
 document.querySelector('#flushQueue')?.addEventListener('click',()=>{migrateQueuedGoalEvents();toast('舊待傳紀錄已搬到 GitHub 直連同步中心')});
}

function switchRoute(next){route=next;document.querySelectorAll('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.route===next));render();window.scrollTo({top:0,left:0,behavior:'instant'})}

function openLesson(id){
 const a=allLessons().find(x=>x.id===id);if(!a)return;
 activeLesson=a;lessonStarted=Date.now();readingStarted=Date.now();answers=[];qIndex=0;dialogTitle.textContent=a.title;renderLessonIntro();dialog.showModal();
}
function renderLessonIntro(){
 body.innerHTML=`<section class="grid"><div class="card"><p class="eyebrow">READING</p><p style="white-space:pre-line;line-height:1.75">${esc(activeLesson.text)}</p><div class="actions"><button id="speakArticle" class="secondary">🔊 播放全文</button><button id="analysisStep" class="primary">文章英文解構</button></div></div><div class="card"><h3>Vocabulary</h3>${(activeLesson.vocabulary||[]).map(v=>`<p><b>${esc(v[0]||v.word)}</b> · ${esc(v[1]||v.meaning)} <span class="muted">${esc(v[2]||v.collocation)}</span></p>`).join('')}</div></section>`;
 const articleAudioButton=document.querySelector('#speakArticle');
 articleAudioButton.onclick=()=>window.toeicToggleSpeech ? window.toeicToggleSpeech(activeLesson.text,`article:${activeLesson.id}`,articleAudioButton) : speech(activeLesson.text);
 document.querySelector('#analysisStep').onclick=renderAnalysisStep;
}
function renderAnalysisStep(){
 const analysis=cachedAnalysis(activeLesson)||articleAnalysis(activeLesson.text);if(!cachedAnalysis(activeLesson))saveAnalysisCache(activeLesson,analysis);
 body.innerHTML=`<section><p class="eyebrow">ENGLISH DECONSTRUCTION</p><div class="notice">黃色標記主要顯示因果、轉折、條件與時間連接詞。這一版在本機解析，不呼叫外部 AI。</div><div class="analysis-grid">${analysis.map(s=>`<article class="analysis-sentence"><div class="actions" style="justify-content:space-between"><span class="badge">Sentence ${s.index+1}</span><button class="ghost speak-sentence" data-i="${s.index}">🔊</button></div><p>${s.highlighted}</p><details><summary>SIMPLER ENGLISH / STRUCTURE</summary><p>${esc(s.simple)}</p><p class="muted">${esc(s.structure)}</p><p class="muted">Reusable expression: ${esc(s.expression)}</p></details></article>`).join('')}</div><button id="startQuiz" class="primary wide">開始作答</button></section>`;
 document.querySelectorAll('.speak-sentence').forEach(b=>b.onclick=()=>speech(analysis[Number(b.dataset.i)].sentence));
 document.querySelector('#startQuiz').onclick=()=>{readingStarted=Date.now();renderLessonQuestion()};
}
function renderLessonQuestion(){
 const qs=activeLesson.questions||[];if(qIndex>=qs.length)return finishLesson();
 const item=qs[qIndex];
 body.innerHTML=`<section><div class="section-head"><span class="badge">${esc(item.part)}</span><span class="badge">${qIndex+1}/${qs.length}</span></div><h3>${esc(item.q)}</h3><div class="option-grid">${item.options.map((o,i)=>`<button class="option lesson-option" data-i="${i}">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}</div></section>`;
 document.querySelectorAll('.lesson-option').forEach(b=>b.onclick=()=>{const choice=Number(b.dataset.i),correct=choice===item.answer;answers.push({q:item,choice,correct});if(!correct)registerNewsMistake(item,choice,activeLesson);document.querySelectorAll('.lesson-option').forEach((x,i)=>{x.disabled=true;if(i===item.answer)x.classList.add('correct');else if(i===choice)x.classList.add('wrong')});const note=document.createElement('div');note.className='card';note.innerHTML=`<b>${correct?'答對':'答錯'}</b><p class="muted">${esc(item.explain)}</p><button class="primary" id="nextQ">${qIndex+1===qs.length?'完成':'下一題'}</button>`;body.appendChild(note);document.querySelector('#nextQ').onclick=()=>{qIndex++;renderLessonQuestion()}})
}
function registerNewsMistake(question,choice,article){
 const rows=newsMistakes(),t=now();let m=rows.find(x=>x.sourceId===article.id&&x.question?.q===question.q);
 if(!m){m={id:`m-${Date.now()}-${Math.random().toString(36).slice(2)}`,question,choice,sourceId:article.id,source:'news'};rows.push(m)}
 Object.assign(m,{question,choice,status:'unmastered',reviewStage:0,correctStreak:0,firstWrongAt:m.firstWrongAt||t,lastWrongAt:t,lastReviewedAt:t,nextReviewAt:new Date(Date.now()+86400000).toISOString(),masteredAt:undefined});
 save(KEYS.mistakes,rows);
}
function finishLesson(){
 const qs=activeLesson.questions||[],correct=answers.filter(x=>x.correct).length,duration=Math.max(1,Math.round((Date.now()-lessonStarted)/60000)),readingMs=Math.max(1000,Date.now()-readingStarted),wpm=Math.round(wordCount(activeLesson.text)/(readingMs/60000));
 const rows=sessions();rows.push({id:`session-${Date.now()}`,articleId:activeLesson.id,date:dayKey(),title:activeLesson.title,startedAt:new Date(lessonStarted).toISOString(),endedAt:now(),durationMinutes:duration,wpm:wpm>=40&&wpm<=450?wpm:0,correct,total:qs.length});save(KEYS.sessions,rows.slice(-500));
 const d=load(KEYS.daily,null);if(d?.date===dayKey()&&d.articleId===activeLesson.id)save(KEYS.daily,{...d,completed:true});
 const ev=makeGoalEvent(activeLesson.title,duration,qs.length,correct,answers.filter(x=>!x.correct).map(x=>x.q.skill),{articleId:activeLesson.id,category:activeLesson.category,articlesCompleted:1,wordCount:wordCount(activeLesson.text),readingWpm:wpm>=40&&wpm<=450?wpm:0,part5Answered:qs.filter(x=>x.part==='Part 5').length,part5Correct:answers.filter(x=>x.q.part==='Part 5'&&x.correct).length,part7Answered:qs.filter(x=>x.part==='Part 7').length,part7Correct:answers.filter(x=>x.q.part==='Part 7'&&x.correct).length});publishGoalEvent(ev);
 body.innerHTML=`<section class="hero"><p class="eyebrow">COMPLETE</p><h2>${correct}/${qs.length}</h2><p>本次 ${duration} 分鐘${wpm>=40&&wpm<=450?` · 約 ${wpm} WPM`:''}。已寫入 GitHub 同網域 Goal Sync。</p><button id="lessonDone" class="primary wide">完成</button></section>`;document.querySelector('#lessonDone').onclick=()=>{dialog.close();render()}
}

function practiceCount(part){return part<=2?5:part<=4?6:part===5?10:part===6?8:10}
function sceneSvg(seed){
 const scenes=[
  ['A woman is writing notes at a desk.','woman writing notes','Two people are loading a truck.','Several boxes are stacked near a wall.','A man is opening a window.'],
  ['Several boxes are stacked near a wall.','boxes stacked','A woman is driving a bus.','People are swimming outside.','A computer is hanging from the ceiling.'],
  ['Two people are seated at a table.','people seated','A man is carrying a bicycle upstairs.','A shelf is empty.','A truck is parked in a kitchen.'],
  ['A man is carrying a box.','man carrying box','A woman is painting a road.','All chairs are upside down.','A train is inside an office.']
 ];const s=scenes[seed%scenes.length],labels=s[1].split(' ');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 420"><rect width="800" height="420" fill="#eef4f1"/><rect x="90" y="70" width="620" height="280" rx="24" fill="#fff" stroke="#b8cbc4" stroke-width="4"/><circle cx="280" cy="170" r="45" fill="#6aa58f"/><rect x="245" y="215" width="70" height="90" rx="20" fill="#8bbcab"/><rect x="390" y="150" width="190" height="100" rx="12" fill="#d8e6e1"/><rect x="370" y="260" width="235" height="18" rx="9" fill="#8b9f97"/><text x="400" y="330" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#426259">${esc(labels.join(' '))}</text></svg>`;
 return`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function makeQuestion(part,i,seed=0){
 const n=i+1,tag=`p${part}-${seed}-${i}`;
 if(part===1){const sets=[
  ['A woman is writing notes at a desk.','Two people are loading a truck.','Several boxes are stacked near a wall.','A man is opening a window.'],
  ['Several boxes are stacked near a wall.','A woman is driving a bus.','People are swimming outside.','A computer is hanging from the ceiling.'],
  ['Two people are seated at a table.','A man is carrying a bicycle upstairs.','A shelf is empty.','A truck is parked in a kitchen.'],
  ['A man is carrying a box.','A woman is painting a road.','All chairs are upside down.','A train is inside an office.']
 ];return{id:tag,part:1,skill:'Photo description',q:'Choose the statement that best describes the picture.',options:sets[(i+seed)%sets.length],answer:0,explain:'The first statement matches the illustrated scene.',image:sceneSvg(i+seed)}}
 if(part===2){const bank=[
  ['When will the report be ready?',['By Friday afternoon.','At the front desk.','Because it was expensive.'],0],
  ['Where is the training session?',['In Conference Room B.','For about two hours.','Yes, I trained yesterday.'],0],
  ['Who approved the new schedule?',['Ms. Chen did.','At nine o’clock.','The blue folder.'],0],
  ['Could you send me the revised file?',['Sure, I’ll email it now.','The meeting was revised.','On the third floor.'],0]
 ];const b=bank[(i+seed)%bank.length];return{id:tag,part:2,skill:'Best response',q:b[0],options:b[1],answer:b[2],explain:'Choose the response that directly answers the speaker.'}}
 if(part===3){
  const scenarios=[
   {
    stimulus:`M: The delivery truck will arrive at the warehouse at 3 p.m.\nW: Great. I’ll ask receiving to clear the loading area.\nM: Please check the item count before signing the form.`,
    questions:[
     ['What does the man ask the woman to do?',['Check the item count','Change the delivery date','Call a customer','Reserve a hotel'],'He asks her to check the item count.','Conversation detail'],
     ['Where will the delivery arrive?',['At the warehouse','At a restaurant','At a bank','At a train station'],'The man says the truck will arrive at the warehouse.','Conversation detail'],
     ['What will the woman ask receiving to do?',['Clear the loading area','Prepare a meeting room','Print a receipt','Contact a hotel'],'She will ask receiving to clear the loading area.','Conversation detail'],
     ['When will the truck arrive?',['At 3 p.m.','At 9 a.m.','At noon','At 6 p.m.'],'The man says the truck will arrive at 3 p.m.','Conversation detail']
    ]
   },
   {
    stimulus:`W: The client meeting has been moved to Conference Room B.\nM: I’ll update the calendar and bring the sales figures.\nW: Thanks. Please arrive ten minutes early so we can test the projector.`,
    questions:[
     ['Why should the man arrive early?',['To test the projector','To meet a delivery driver','To make a hotel reservation','To order lunch'],'The woman wants to test the projector before the meeting.','Conversation purpose'],
     ['Where will the meeting take place?',['In Conference Room B','In the lobby','At a restaurant','At the airport'],'The meeting was moved to Conference Room B.','Conversation detail'],
     ['What will the man bring?',['The sales figures','A new projector','A train ticket','A customer survey'],'He says he will bring the sales figures.','Conversation detail'],
     ['What will the man update?',['The calendar','The company website','The invoice','The room key'],'He says he will update the calendar.','Conversation detail']
    ]
   },
   {
    stimulus:`M: A guest wants to extend her hotel stay by one night.\nW: Room 508 is available, but the rate changes on Friday.\nM: Okay. Please confirm the new rate with her before updating the reservation.`,
    questions:[
     ['What does the man ask the woman to do first?',['Confirm the new rate','Clean Room 508','Call a taxi','Prepare breakfast'],'He asks her to confirm the new rate before changing the reservation.','Conversation sequence'],
     ['Why does the woman mention Friday?',['The room rate changes then','The hotel closes then','The guest checks in then','The staff meeting is then'],'She says the rate changes on Friday.','Conversation inference'],
     ['Which room is available?',['Room 508','Room 205','Room 315','Room 701'],'The woman says Room 508 is available.','Conversation detail'],
     ['What does the guest want to do?',['Stay one more night','Cancel the reservation','Change hotels','Reserve a meeting room'],'The guest wants to extend her stay by one night.','Conversation detail']
    ]
   },
   {
    stimulus:`W: The airport shuttle leaves from the east entrance every thirty minutes.\nM: Good. My flight boards at 6:20, so I should take the 5 o’clock shuttle.\nW: Yes, and you can buy a ticket from the machine beside the entrance.`,
    questions:[
     ['Which shuttle does the man plan to take?',['The 5 o’clock shuttle','The 4 o’clock shuttle','The 6:20 shuttle','The 7 o’clock shuttle'],'He says he should take the 5 o’clock shuttle.','Conversation detail'],
     ['Where can the man buy a ticket?',['From a machine by the entrance','At the hotel front desk','On the airplane','At a restaurant'],'The woman says a machine is beside the entrance.','Conversation detail'],
     ['Why is the man concerned about the shuttle time?',['He has a flight to catch','He needs to meet a client downtown','He has a dinner reservation','He is picking up a package'],'He mentions that his flight boards at 6:20.','Conversation inference'],
     ['How often does the shuttle leave?',['Every thirty minutes','Every ten minutes','Once an hour','Twice a day'],'The woman says it leaves every thirty minutes.','Conversation detail']
    ]
   },
   {
    stimulus:`M: The accounting software still won’t open on my computer.\nW: Did you install the update that was sent yesterday?\nM: Not yet. I’ll do that now, and if it still fails, I’ll contact technical support.`,
    questions:[
     ['What will the man do first?',['Install the update','Buy a new computer','Call a customer','Print the report'],'He says he will install the update now.','Conversation sequence'],
     ['What problem does the man have?',['The software will not open','The printer is out of paper','The internet bill is late','The office door is locked'],'He says the accounting software will not open.','Conversation detail'],
     ['When was the update sent?',['Yesterday','This morning','Last week','Next Monday'],'The woman says the update was sent yesterday.','Conversation detail'],
     ['Who may the man contact later?',['Technical support','A travel agent','A delivery driver','The hotel manager'],'He says he will contact technical support if the update does not solve the problem.','Conversation inference']
    ]
   },
   {
    stimulus:`W: This invoice is due on the fifteenth, but the purchase order number is missing.\nM: I’ll ask the supplier to send a corrected copy this afternoon.\nW: Great. Once we receive it, I can schedule the payment.`,
    questions:[
     ['Why can’t the woman schedule the payment yet?',['The purchase order number is missing','The supplier changed its address','The bank is closed','The invoice total is too low'],'The invoice is missing the purchase order number.','Conversation detail'],
     ['What will the man ask the supplier to do?',['Send a corrected invoice','Delay the shipment','Cancel the order','Change the payment date'],'He will ask for a corrected copy.','Conversation detail'],
     ['When is the invoice due?',['On the fifteenth','On the first','At the end of next year','Tomorrow morning'],'The woman says it is due on the fifteenth.','Conversation detail'],
     ['What will happen after the corrected copy arrives?',['The payment can be scheduled','The order will be canceled','A meeting will begin','The supplier will visit the office'],'The woman says she can schedule the payment once the corrected copy arrives.','Conversation sequence']
    ]
   },
   {
    stimulus:`M: We have a reservation for six people at 7 p.m., but two more colleagues are joining us.\nW: I’ll call the restaurant and ask whether they can move us to a larger table.\nM: Thanks. Please let everyone know if the time changes.`,
    questions:[
     ['Why will the woman call the restaurant?',['To request a larger table','To cancel dinner','To order a taxi','To ask for a refund'],'Two more people are joining the group, so she will request a larger table.','Conversation purpose'],
     ['How many people were in the original reservation?',['Six','Two','Eight','Ten'],'The man says the reservation is for six people.','Conversation detail'],
     ['What does the man ask the woman to do if the time changes?',['Notify everyone','Order more food','Call the hotel','Change the meeting room'],'He asks her to let everyone know.','Conversation detail'],
     ['What time is the current reservation?',['7 p.m.','5 p.m.','6 p.m.','8:30 p.m.'],'The reservation is currently for 7 p.m.','Conversation detail']
    ]
   },
   {
    stimulus:`W: Tomorrow’s training session will be on the third floor instead of the main auditorium.\nM: Should I send a message to the new employees?\nW: Yes, and remind them to bring their identification badges.`,
    questions:[
     ['Where will the training session be held?',['On the third floor','In the main auditorium','At a hotel','In the parking garage'],'The woman says it will be on the third floor.','Conversation detail'],
     ['Who will the man contact?',['The new employees','The delivery drivers','The customers','The hotel guests'],'He asks whether he should message the new employees.','Conversation detail'],
     ['What should the employees bring?',['Identification badges','Sales reports','Luggage','Restaurant coupons'],'The woman asks him to remind them to bring identification badges.','Conversation detail'],
     ['Why does the man need to send a message?',['The training location changed','The training was canceled','The company hired a new manager','The employees need to pay a fee'],'The location changed from the auditorium to the third floor.','Conversation inference']
    ]
   },
   {
    stimulus:`M: The inventory report shows only twelve monitors, but I counted fifteen in the storage room.\nW: I probably forgot to enter yesterday’s shipment.\nM: Please update the system before the purchasing team places another order.`,
    questions:[
     ['What does the man ask the woman to do?',['Update the inventory system','Order more monitors immediately','Move the monitors upstairs','Return the shipment'],'He asks her to update the system.','Conversation detail'],
     ['How many monitors did the man count?',['Fifteen','Twelve','Twenty','Five'],'He says he counted fifteen monitors.','Conversation detail'],
     ['Why might the report be incorrect?',['A shipment was not entered','The monitors were damaged','The supplier sent an invoice twice','The storage room was closed'],'The woman says she may have forgotten to enter yesterday’s shipment.','Conversation inference'],
     ['Who is expected to place another order?',['The purchasing team','The training team','The front desk','The hotel staff'],'The man mentions the purchasing team.','Conversation detail']
    ]
   },
   {
    stimulus:`W: The client presentation starts at 2 p.m., and the updated charts are in the shared folder.\nM: I’ll download them and print three copies for the conference room.\nW: Perfect. I’ll check the video connection before the client arrives.`,
    questions:[
     ['What will the man print?',['Three copies of the charts','New employee badges','Restaurant menus','Shipping labels'],'He says he will print three copies of the updated charts.','Conversation detail'],
     ['What will the woman check?',['The video connection','The inventory count','The hotel rate','The delivery address'],'She says she will check the video connection.','Conversation detail'],
     ['When does the presentation begin?',['At 2 p.m.','At 3 p.m.','At noon','At 5 p.m.'],'The woman says it starts at 2 p.m.','Conversation detail'],
     ['Where are the updated charts?',['In the shared folder','At the front desk','In a delivery box','On the restaurant table'],'The updated charts are in the shared folder.','Conversation detail']
    ]
   }
  ];
  const n=i+seed, scenario=scenarios[n%scenarios.length], question=scenario.questions[Math.floor(n/scenarios.length)%4];
  const shift=n%4, baseOptions=question[1], options=baseOptions.slice(4-shift).concat(baseOptions.slice(0,4-shift));
  return{id:tag,part:3,skill:question[3],stimulus:scenario.stimulus,q:question[0],options,answer:shift,explain:question[2]}
 }
 if(part===4){
  const talks=[
   [`Good morning. The employee workshop will begin at 10 a.m. in Room 204. Please bring your identification badge and arrive ten minutes early.`,
    [['What is the purpose of the announcement?',['To remind employees about a workshop','To advertise a product','To cancel a reservation','To announce a store closing'],'It reminds employees about a workshop.'],
     ['Where will the workshop take place?',['In Room 204','In the lobby','At a hotel','At the airport'],'The announcement says Room 204.'],
     ['What should employees bring?',['An identification badge','A sales invoice','A train ticket','A restaurant menu'],'Employees should bring their identification badges.'],
     ['When should employees arrive?',['Ten minutes early','One hour late','At noon','After the workshop'],'They are asked to arrive ten minutes early.']]],
   [`Attention passengers. The 8:15 train to Lakeside will depart from Platform 6 instead of Platform 4. Please check the display boards for additional updates.`,
    [['What is the announcement mainly about?',['A platform change','A ticket refund','A restaurant opening','A hotel reservation'],'The train will depart from a different platform.'],
     ['Which platform should passengers use?',['Platform 6','Platform 4','Platform 2','Platform 8'],'Passengers should use Platform 6.'],
     ['What time is the train scheduled to leave?',['8:15','7:45','9:30','10:15'],'The announcement refers to the 8:15 train.'],
     ['What are passengers advised to check?',['The display boards','Their hotel keys','A restaurant menu','An invoice'],'Passengers are asked to check the display boards.']]],
   [`This is a message for all office staff. The building's west entrance will be closed tomorrow morning for maintenance. Please use the main entrance until noon.`,
    [['Why will the west entrance be closed?',['For maintenance','For a company party','For a delivery','For employee training'],'The entrance will be closed for maintenance.'],
     ['Which entrance should staff use?',['The main entrance','The west entrance','The loading dock','The parking exit'],'Staff should use the main entrance.'],
     ['When will the west entrance be closed?',['Tomorrow morning','This evening','Next week','All month'],'It will be closed tomorrow morning.'],
     ['Until what time should staff use the main entrance?',['Until noon','Until 8 a.m.','Until 6 p.m.','Until midnight'],'The announcement says to use it until noon.']]],
   [`Customers are reminded that the service desk will close at 6 p.m. today, one hour earlier than usual. Returns can still be left at the automated kiosk near the exit.`,
    [['What is the purpose of the message?',['To announce an early closing time','To advertise a new product','To explain a delivery delay','To invite customers to a meeting'],'It announces that the service desk will close early.'],
     ['When will the service desk close?',['At 6 p.m.','At 5 p.m.','At 7 p.m.','At 8 p.m.'],'It will close at 6 p.m.'],
     ['Where can customers leave returns?',['At the automated kiosk','At the hotel desk','At a restaurant','At the loading dock'],'Returns can be left at the automated kiosk.'],
     ['Where is the kiosk located?',['Near the exit','On the roof','Beside the train platform','Inside the conference room'],'The kiosk is near the exit.']]],
   [`Welcome to the Riverside Hotel. Breakfast is served from 6:30 to 10 a.m. on the second floor. Guests who need an earlier meal can request a breakfast box at the front desk.`,
    [['What service is being described?',['Breakfast service','Airport transportation','Room cleaning','Conference registration'],'The message explains breakfast service.'],
     ['Where is breakfast served?',['On the second floor','In the lobby','On the roof','At the airport'],'Breakfast is served on the second floor.'],
     ['What can guests request at the front desk?',['A breakfast box','A train ticket','A sales report','A shipping label'],'Guests can request a breakfast box.'],
     ['What time does breakfast begin?',['At 6:30 a.m.','At 5 a.m.','At 8 a.m.','At 10 a.m.'],'Breakfast begins at 6:30 a.m.']]],
   [`Please note that the software update will begin at 9 p.m. tonight. The customer portal may be unavailable for about thirty minutes. Save your work before the update starts.`,
    [['Why might the customer portal be unavailable?',['A software update is scheduled','The office is moving','A meeting is in progress','A delivery is late'],'The portal may be unavailable during the software update.'],
     ['When will the update begin?',['At 9 p.m.','At 7 p.m.','At noon','At 10 a.m.'],'It begins at 9 p.m.'],
     ['How long may the portal be unavailable?',['About thirty minutes','About two hours','All day','One week'],'The announcement says about thirty minutes.'],
     ['What should users do before the update?',['Save their work','Print a ticket','Call a restaurant','Reserve a hotel'],'Users should save their work.']]],
   [`The museum shuttle will leave the visitor center every twenty minutes from 9 a.m. to 5 p.m. Tickets can be purchased online or from the driver.`,
    [['How often does the shuttle leave?',['Every twenty minutes','Every hour','Twice a day','Every five minutes'],'The shuttle leaves every twenty minutes.'],
     ['Where does the shuttle depart from?',['The visitor center','The airport terminal','A hotel lobby','The train station'],'It leaves from the visitor center.'],
     ['Where can tickets be purchased?',['Online or from the driver','Only at a bank','Only at a restaurant','Only by mail'],'Tickets can be bought online or from the driver.'],
     ['When does shuttle service end?',['At 5 p.m.','At 9 a.m.','At noon','At 8 p.m.'],'Service runs until 5 p.m.']]],
   [`Attention warehouse staff. Inventory counting will begin at 4 p.m. today. Please finish all outgoing shipments by 3:30 and bring your scanners to Section C.`,
    [['What will begin at 4 p.m.?',['Inventory counting','Employee training','A customer meeting','A hotel inspection'],'Inventory counting starts at 4 p.m.'],
     ['By what time should outgoing shipments be finished?',['By 3:30','By 4:30','By noon','By 5 p.m.'],'They should be completed by 3:30.'],
     ['What should employees bring?',['Their scanners','Their passports','Restaurant coupons','Projectors'],'Staff should bring their scanners.'],
     ['Where should staff go?',['Section C','Conference Room B','The front desk','Platform 6'],'They should bring scanners to Section C.']]],
   [`This afternoon's marketing presentation has been moved from 1 p.m. to 2:30 p.m. The location remains Conference Room A. Updated materials are available in the shared drive.`,
    [['What changed about the presentation?',['The starting time','The location','The presenter','The topic'],'The start time changed.'],
     ['Where will the presentation take place?',['Conference Room A','The lobby','A hotel ballroom','The warehouse'],'The location remains Conference Room A.'],
     ['Where are the updated materials?',['In the shared drive','At the front desk','On a train','In the cafeteria'],'They are in the shared drive.'],
     ['What is the new starting time?',['2:30 p.m.','1 p.m.','3:30 p.m.','Noon'],'The presentation now starts at 2:30 p.m.']]],
   [`Passengers on Flight 418 should proceed to Gate 12 for boarding. Boarding will begin at 7:05 p.m. Please have your passport and boarding pass ready.`,
    [['Where should passengers go?',['Gate 12','Gate 4','The baggage office','The hotel lobby'],'Passengers should proceed to Gate 12.'],
     ['When will boarding begin?',['At 7:05 p.m.','At 6 p.m.','At 8:15 p.m.','At 9 p.m.'],'Boarding begins at 7:05 p.m.'],
     ['What documents should passengers have ready?',['A passport and boarding pass','A sales report and invoice','A hotel key and receipt','A menu and coupon'],'They should have their passport and boarding pass ready.'],
     ['Which flight is being discussed?',['Flight 418','Flight 204','Flight 815','Flight 630'],'The announcement is for Flight 418.']]]
  ];
  const n=i+seed, talk=talks[n%talks.length], question=talk[1][Math.floor(n/talks.length)%4];
  const shift=n%4, baseOptions=question[1], options=baseOptions.slice(4-shift).concat(baseOptions.slice(0,4-shift));
  return{id:tag,part:4,skill:'Announcement comprehension',stimulus:talk[0],q:question[0],options,answer:shift,explain:question[2]}
 }
 if(part===5){const bank=[
  ['The manager _____ the final report yesterday.',['approve','approved','approving','approval'],1,'Past time marker yesterday requires approved.'],
  ['Please submit the form _____ Friday.',['by','among','during','through'],0,'by Friday means no later than Friday.'],
  ['The new software is easy to use and highly _____.',['rely','reliable','reliably','reliance'],1,'An adjective is needed after highly.'],
  ['Employees are asked _____ their badges at all times.',['wear','to wear','wore','wearing'],1,'ask + object + to-infinitive.']
 ];const b=bank[(i+seed)%bank.length];return{id:tag,part:5,skill:'Grammar/Vocabulary',q:b[0],options:b[1],answer:b[2],explain:b[3]}}
 if(part===6){const names=['inventory','training','schedule','reservation'];const x=names[(i+seed)%names.length];return{id:tag,part:6,skill:'Text completion',stimulus:`To: All Staff\nSubject: ${x} update\n\nPlease review the updated ${x} information before tomorrow’s meeting. The document was revised this morning, so everyone should use the newest version. If you have questions, contact the operations team before 4 p.m.`,q:'Why should employees use the newest version?',options:['The document was revised','The meeting was cancelled','The office moved','The team is on vacation'],answer:0,explain:'The message says the document was revised this morning.'}}
 const topics=['delivery service','training program','reservation system','customer survey'];const t=topics[(i+seed)%topics.length];return{id:tag,part:7,skill:'Reading detail',stimulus:`NOTICE\n\nThe company will test a new ${t} next month. Employees at two locations will participate first. Managers will collect feedback for four weeks before deciding whether to expand the program.`,q:'What will managers do before expanding the program?',options:['Collect feedback','Close both locations','Cancel the test','Hire a new director'],answer:0,explain:'Managers will collect feedback for four weeks.'}
}
function makeSet(part,count,seed=Date.now()%1000){return Array.from({length:count},(_,i)=>makeQuestion(part,i,seed))}
function listeningTranscriptHtml(item){
 if(item.part===1)return `<div class="practice-transcript"><strong>聽力文字</strong><p style="white-space:pre-line">${item.options.map((o,i)=>`${String.fromCharCode(65+i)}. ${esc(o)}`).join('\n')}</p></div>`;
 if(item.part===2)return `<div class="practice-transcript"><strong>聽力文字</strong><p style="white-space:pre-line">${esc(item.q)}\n${item.options.map((o,i)=>`${String.fromCharCode(65+i)}. ${esc(o)}`).join('\n')}</p></div>`;
 if((item.part===3||item.part===4)&&item.stimulus)return `<div class="practice-transcript"><strong>聽力文字</strong><p style="white-space:pre-line">${esc(item.stimulus)}</p></div>`;
 return '';
}
function speakQuestion(item){
 const button=document.querySelector('#playQ,#mockAudio');
 const key=`question:${item.id||item.q}`;
 const text=item.part===1?item.options.join('. '):item.part===2?`${item.q}. ${item.options.join('. ')}`:item.stimulus||item.q;
 if(window.toeicToggleSpeech)return window.toeicToggleSpeech(text,key,button);
 return speech(text);
}
function startPractice(part,count){const set=makeSet(part,count),started=Date.now(),ans=[];let idx=0;dialogTitle.textContent=`Part ${part} · ${PART_INFO[part][0]}`;dialog.showModal();
 const show=()=>{if(idx>=set.length)return finish();if(window.toeicStopAudio)window.toeicStopAudio();const item=set[idx];body.innerHTML=`<section><div class="section-head"><span class="badge">Part ${part}</span><span class="badge">${idx+1}/${set.length}</span></div>${item.image?`<img class="photo" src="${item.image}" alt="Part 1 illustration">`:''}${item.stimulus&&part>=5?`<div class="card"><p style="white-space:pre-line">${esc(item.stimulus)}</p></div>`:''}${part<=4?'<button id="playQ" class="secondary wide">🔊 播放音檔</button>':''}<h3>${part<=2?'請先聆聽，再選擇答案。':esc(item.q)}</h3><div class="option-grid">${item.options.map((o,i)=>`<button class="option p-opt" data-i="${i}">${String.fromCharCode(65+i)}. ${part<=2?'':esc(o)}</button>`).join('')}</div><div id="practiceFeedback"></div></section>`;document.querySelector('#playQ')?.addEventListener('click',()=>speakQuestion(item));document.querySelectorAll('.p-opt').forEach(b=>b.onclick=()=>{const choice=Number(b.dataset.i),correct=choice===item.answer;ans.push({item,choice,correct});if(window.toeicStopAudio)window.toeicStopAudio();if(!correct)registerPartMistake(part,item,choice);document.querySelectorAll('.p-opt').forEach((x,i)=>{x.disabled=true;if(i===item.answer)x.classList.add('correct');else if(i===choice)x.classList.add('wrong')});document.querySelector('#practiceFeedback').innerHTML=`<div class="card practice-feedback"><b>${correct?'答對':'答錯'}</b><p class="muted">${esc(item.explain)}</p>${part<=4?listeningTranscriptHtml(item):''}<button id="nextP" class="primary">${idx+1===set.length?'完成':'下一題'}</button></div>`;document.querySelector('#nextP').onclick=()=>{idx++;show()}})};
 const finish=()=>{const correct=ans.filter(x=>x.correct).length,duration=Math.max(1,Math.round((Date.now()-started)/60000)),rows=partSessions();rows.push({id:`part-${Date.now()}`,date:dayKey(),part,title:`Part ${part}`,correct,total:set.length,durationMinutes:duration,skills:[...new Set(set.map(x=>x.skill))]});save(KEYS.partSessions,rows.slice(-500));const extra={};extra[`part${part}Answered`]=set.length;extra[`part${part}Correct`]=correct;publishGoalEvent(makeGoalEvent(`Part ${part} 訓練`,duration,set.length,correct,ans.filter(x=>!x.correct).map(x=>x.item.skill),extra));body.innerHTML=`<section class="hero"><p class="eyebrow">PART ${part} COMPLETE</p><h2>${correct}/${set.length}</h2><p>${duration} 分鐘 · 已寫入 GitHub Goal Sync。</p><button id="doneP" class="primary wide">完成</button></section>`;document.querySelector('#doneP').onclick=()=>{dialog.close();render()}};
 show()
}
function registerPartMistake(part,item,choice){const rows=partMistakes(),t=now();let m=rows.find(x=>Number(x.part)===part&&x.question?.q===item.q);if(!m){m={id:`part-m-${Date.now()}-${Math.random().toString(36).slice(2)}`,part,question:item,choice,source:'practice'};rows.push(m)}Object.assign(m,{choice,status:'unmastered',reviewStage:0,correctStreak:0,firstWrongAt:m.firstWrongAt||t,lastWrongAt:t,lastReviewedAt:t,nextReviewAt:new Date(Date.now()+86400000).toISOString(),masteredAt:undefined});save(KEYS.partMistakes,rows.slice(-500))}
function markReview(kind,id){const key=kind==='news'?KEYS.mistakes:KEYS.partMistakes,rows=load(key,[]),m=rows.find(x=>x.id===id);if(!m)return;const stage=Number(m.reviewStage)||0;m.correctStreak=(Number(m.correctStreak)||0)+1;m.lastReviewedAt=now();if(stage>=2){m.status='mastered';m.reviewStage=3;m.masteredAt=now();delete m.nextReviewAt}else{m.reviewStage=stage+1;m.status=m.reviewStage===1?'reviewing':'confirming';m.nextReviewAt=new Date(Date.now()+(m.reviewStage===1?3:7)*86400000).toISOString()}save(key,rows);toast('複習狀態已更新');render()}

function startFullMock(){
 const counts={1:6,2:25,3:39,4:30,5:30,6:16,7:54},items=[];for(let p=1;p<=7;p++)items.push(...makeSet(p,counts[p],p*97));
 const started=Date.now(),result=[],active={id:`mock-${Date.now()}`,mode:'training',startedAt:started,index:0,answers:[]};save(KEYS.mockActive,active);dialogTitle.textContent='完整 TOEIC-style 200 題模考';dialog.showModal();
 const show=()=>{const idx=active.index;if(idx>=items.length)return finish();if(window.toeicStopAudio)window.toeicStopAudio();const item=items[idx],part=item.part;body.innerHTML=`<section><div class="section-head"><span class="badge">Part ${part}</span><span class="badge">${idx+1}/200</span></div><div class="progressbar"><i style="width:${(idx/200*100).toFixed(1)}%"></i></div>${idx===100?'<div class="notice">Reading Section 開始。正式 TOEIC Reading 為 75 分鐘；此 GitHub 訓練版會保留你的作答進度。</div>':''}${item.image?`<img class="photo" src="${item.image}" alt="Part 1 illustration">`:''}${item.stimulus&&part>=5?`<div class="card"><p style="white-space:pre-line">${esc(item.stimulus)}</p></div>`:''}${part<=4?'<button id="mockAudio" class="secondary wide">🔊 播放音檔</button>':''}<h3>${part<=2?'請聆聽後作答':esc(item.q)}</h3><div class="option-grid">${item.options.map((o,i)=>`<button class="option mock-opt" data-i="${i}">${String.fromCharCode(65+i)}. ${part<=2?'':esc(o)}</button>`).join('')}</div></section>`;document.querySelector('#mockAudio')?.addEventListener('click',()=>speakQuestion(item));document.querySelectorAll('.mock-opt').forEach(b=>b.onclick=()=>{const choice=Number(b.dataset.i),correct=choice===item.answer;if(window.toeicStopAudio)window.toeicStopAudio();active.answers.push({part,question:item,choice,correct});if(!correct)registerPartMistake(part,item,choice);active.index++;save(KEYS.mockActive,active);show()})};
 const finish=()=>{const correct=active.answers.filter(x=>x.correct).length,listening=active.answers.filter(x=>x.part<=4&&x.correct).length,reading=active.answers.filter(x=>x.part>=5&&x.correct).length,duration=Math.max(1,Math.round((Date.now()-started)/60000)),history=mockHistory();history.push({id:active.id,date:dayKey(),mode:'training',correct,listeningCorrect:listening,readingCorrect:reading,durationMinutes:duration,estimatedMin:Math.max(10,Math.round(correct/200*990)-40),estimatedMax:Math.min(990,Math.round(correct/200*990)+40),estimatedCenter:Math.round(correct/200*990),timedOut:false});save(KEYS.mockHistory,history.slice(-50));localStorage.removeItem(KEYS.mockActive);const extra={};for(let p=1;p<=7;p++){extra[`part${p}Answered`]=active.answers.filter(x=>x.part===p).length;extra[`part${p}Correct`]=active.answers.filter(x=>x.part===p&&x.correct).length}publishGoalEvent(makeGoalEvent('完整 TOEIC-style 200 題模考',duration,200,correct,active.answers.filter(x=>!x.correct).map(x=>x.question.skill),extra));body.innerHTML=`<section class="hero"><p class="eyebrow">FULL MOCK COMPLETE</p><h2>${correct}/200</h2><p>Listening ${listening}/100 · Reading ${reading}/100 · 約 ${duration} 分鐘</p><button id="doneMock" class="primary wide">完成</button></section>`;document.querySelector('#doneMock').onclick=()=>{dialog.close();render()}};
 show()
}

/* APPDEPLOY_LAYOUT_PARITY_START */
var appdeployNewsCategory='All';
var appdeployNewsPage=1;
var appdeployPracticeMode=(()=>{
  const v=localStorage.getItem(KEYS.practiceMode)||'quick';
  return ['quick','standard','mock'].includes(v)?v:'quick';
})();

function appdeployTargetLength(){
  if(settings.lengthMode==='Manual'&&/^\d{2,3}-\d{2,3}$/.test(String(settings.manualLength||'')))return settings.manualLength;
  return targetWords();
}
function appdeployCompletedIds(){
  return new Set(analyticsSessions().map(x=>String(x.articleId||'')).filter(Boolean));
}
function appdeployArticleCard(a,featured=false){
  const full=!!(a?.text&&a?.questions?.length);
  const live=!full;
  const summary=String(a?.summary||'').trim();
  return `<article class="card article-card">
    <div class="article-meta">
      <span class="badge">${live?'Live News':esc(a.articleType||'Main Article')}</span>
      <span class="badge">${esc(a.category||'Business')}</span>
      ${full?`<span class="badge">${wordCount(a.text)} words</span>`:''}
      <span class="badge score">TOEIC ${Number(a.toeicScore||75)}</span>
    </div>
    <h3>${esc(a.title||'TOEIC practice')}</h3>
    ${summary?`<p class="article-summary">${esc(summary)}</p>`:''}
    ${live?`<p class="muted">來源：${esc(a.source||'News source')} · ${a.publishedAt?new Date(a.publishedAt).toLocaleDateString('zh-TW'):''}</p>`:`<p class="muted">${esc(a.source||'Offline Practice')}</p>`}
    <div class="actions">
      <button class="primary ${live?'make-lesson':'library-start'}" data-id="${esc(a.id)}">${live?'生成 TOEIC 教材':featured?'開始主文章訓練':'開始學習'}</button>
      ${a.url?`<a class="ghost source-link" href="${esc(a.url)}" target="_blank" rel="noopener">原新聞</a>`:''}
    </div>
  </article>`;
}
function appdeployTodayCandidates(){
  const completed=appdeployCompletedIds();
  const live=news.filter(a=>!completed.has(`lesson-${String(a.id||'').replace(/[^a-zA-Z0-9-]/g,'-')}`)).slice(0,3);
  if(live.length)return live.map(a=>appdeployArticleCard(a,false)).join('');
  return appdeployArticleCard(allLessons()[0],true);
}
function todayPage(){
  const rows=analyticsSessions();
  const todayDone=rows.some(x=>x.date===dayKey());
  const assigned=load(KEYS.daily,null);
  const assignedLesson=assigned?.articleId?allLessons().find(x=>x.id===assigned.articleId):null;
  const mainBlock=todayDone
    ? `<div class="card empty"><strong>今日主文章已完成 ✓</strong><p>今天的主文章已收起，WPM、正確率與錯題紀錄都已保存。明天會重新提供候選。</p></div>`
    : assignedLesson
      ? appdeployArticleCard(assignedLesson,true)
      : `<div class="list">${appdeployTodayCandidates()}</div>`;
  return `<section class="hero">
      <div class="hero-kicker"><p class="eyebrow">TODAY</p><span class="hero-chip">${appdeployTargetLength()} words</span></div>
      <h2>新聞閱讀＋Part 1–7。</h2>
      <p>每天先完成主文章，再依錯題與題型表現安排 Part 1–7 練習；完成後不重複計入。</p>
    </section>
    <section class="grid stats">
      <div class="card stat"><small>完成篇數</small><strong>${rows.length}</strong></div>
      <div class="card stat"><small>平均 WPM</small><strong>${avgWpm()||'—'}</strong></div>
      <div class="card stat"><small>平均正確率</small><strong>${accuracy()}%</strong></div>
    </section>
    <div class="section-head"><h3>${assignedLesson?'今日主文章':'今日主文章候選'}</h3><span class="badge">${assignedLesson?'15–25 分鐘':'3 選 1'}</span></div>
    ${mainBlock}`;
}
function appdeployCompletedArchive(){
  const completed=appdeployCompletedIds();
  const rows=allLessons().filter(a=>completed.has(a.id));
  if(!rows.length)return'';
  return `<details class="card review-archive completed-library-archive">
    <summary><strong>已完成教材 · ${rows.length} 篇</strong></summary>
    <p class="muted">完成後會從待學習教材庫移出，但文章、錯題與學習紀錄都保留。</p>
    <div class="list">${rows.slice(-12).reverse().map(a=>`<div class="card"><div class="article-meta"><span class="badge">已完成</span><span class="badge">${esc(a.category||'Business')}</span></div><strong>${esc(a.title)}</strong><button class="secondary library-start" data-id="${esc(a.id)}">查看已完成教材</button></div>`).join('')}</div>
  </details>`;
}
function newsPage(){
  const completed=appdeployCompletedIds();
  const generatedActive=allLessons().filter(a=>!completed.has(a.id));
  const liveActive=news.filter(a=>!completed.has(`lesson-${String(a.id||'').replace(/[^a-zA-Z0-9-]/g,'-')}`));
  const all=[...liveActive,...generatedActive];
  const cats=[['All','All'],['Business','Business'],['Travel','Travel'],['Technology','Tech'],['Daily Life','Life']];
  let list=appdeployNewsCategory==='All'?all:all.filter(a=>(a.category||'Business')===appdeployNewsCategory);
  const pages=Math.max(1,Math.ceil(list.length/10));
  appdeployNewsPage=Math.min(appdeployNewsPage,pages);
  list=list.slice((appdeployNewsPage-1)*10,appdeployNewsPage*10);
  const categoryCount=c=>all.filter(a=>(a.category||'Business')===c).length;
  return `<div class="section-head"><h3>新聞教材庫</h3><span class="badge">${all.length} 篇待學習</span></div>
    <div class="card sync-box">
      <div><strong><span class="live-dot"></span>Live News Radar</strong>
      <div class="sync-status">${liveActive.length} 則未完成即時候選 · ${newsUpdatedAt?`資料發布 ${new Date(newsUpdatedAt).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}`:'等待新聞資料'}</div></div>
      <button class="secondary" id="reloadNews">檢查最新新聞</button>
    </div>
    <div class="library-summary">
      ${['Business','Travel','Technology','Daily Life'].map(c=>`<div><strong>${categoryCount(c)}</strong><span>${c==='Technology'?'Tech':c==='Daily Life'?'Life':c}</span></div>`).join('')}
    </div>
    <div class="filters">${cats.map(([value,label])=>`<button class="ghost filter ${appdeployNewsCategory===value?'active':''}" data-cat="${value}">${label}</button>`).join('')}</div>
    <div class="list">${list.map(a=>appdeployArticleCard(a,false)).join('')||'<div class="card empty">此分類暫無待學習文章。</div>'}</div>
    <div class="pager"><button class="ghost" id="prevNews" ${appdeployNewsPage<=1?'disabled':''}>上一頁</button><span>${appdeployNewsPage} / ${pages}</span><button class="ghost" id="nextNews" ${appdeployNewsPage>=pages?'disabled':''}>下一頁</button></div>
    ${appdeployCompletedArchive()}`;
}

function appdeployModeInfo(mode){
  return {
    quick:{label:'快速練習',short:'快速',description:'3–8 分鐘短回合，適合每天暖身。'},
    standard:{label:'標準練習',short:'標準',description:'每個 Part 約 8–10 題，聽力依題組完整出題。'},
    mock:{label:'單 Part 模擬考',short:'單 Part',description:'單獨練指定 Part，題數採正式 TOEIC 配比。'}
  }[mode]||{label:'快速練習',short:'快速',description:''};
}
function appdeployPartCount(part,mode=appdeployPracticeMode){
  const table={
    quick:{1:1,2:1,3:3,4:3,5:4,6:4,7:4},
    standard:{1:3,2:10,3:9,4:9,5:10,6:8,7:10},
    mock:{1:6,2:25,3:39,4:30,5:30,6:16,7:54}
  };
  return table[mode][part];
}
function appdeployPartAccuracy(part){
  const rows=partSessions().filter(x=>Number(x.part)===Number(part));
  const total=rows.reduce((s,x)=>s+(Number(x.total)||0),0);
  const correct=rows.reduce((s,x)=>s+(Number(x.correct)||0),0);
  return total?Math.round(correct/total*100):null;
}
function appdeployFullMockPanel(){
  const rows=mockHistory().slice(-3).reverse();
  const history=rows.length?`<div class="full-mock-recent"><div class="section-head"><h3>最近完整模考</h3><span class="badge">${rows.length}</span></div>${rows.map(r=>`<article class="card full-mock-result"><div class="article-meta"><span class="badge">${esc(r.mode||'training')}</span><span class="badge">${esc(r.date||'')}</span></div><strong>${Number(r.correct||0)}/200</strong><p>Listening ${Number(r.listeningCorrect||0)}/100 · Reading ${Number(r.readingCorrect||0)}/100</p><p class="muted">預估 TOEIC ${Number(r.estimatedMin||0)}–${Number(r.estimatedMax||0)} · ${Number(r.durationMinutes||0)} 分鐘</p></article>`).join('')}</div>`:'';
  return `<section id="fullMockPanel" class="card full-mock-card">
    <div class="full-mock-head"><div><span class="part-number">FULL MOCK · 200 QUESTIONS</span><h3>完整 TOEIC-style 模考</h3></div><span class="badge">P1–P7</span></div>
    <p>Listening 100 題＋Reading 100 題。GitHub 版保留完整 200 題本機作答與歷史紀錄。</p>
    <div class="full-mock-spec"><span>Listening 100 題</span><span>Reading 100 題</span><span>共 200 題</span></div>
    <div class="full-mock-mode-grid">
      <button class="primary full-mock-start" id="startFullMockStrict"><strong>開始全真模式</strong><span>完整 200 題流程</span></button>
      <button class="secondary full-mock-start" id="startFullMockTraining"><strong>開始訓練模考</strong><span>完整 200 題 · 可做訓練追蹤</span></button>
    </div>
    <p class="muted full-mock-note">分數為訓練估算，不是 ETS 官方換算成績。</p>
  </section>${history}`;
}
function practicePage(){
  const parts=[
    {part:1,family:'Listening',name:'照片描述',description:'看圖後聆聽四個敘述，選出最符合圖片者。',skills:'人物動作 · 物品位置 · 場景'},
    {part:2,family:'Listening',name:'應答問題',description:'聆聽問題或陳述，從三個回應中選出最佳答案。',skills:'WH · Yes/No · 間接回應'},
    {part:3,family:'Listening',name:'簡短對話',description:'聆聽雙人或多人對話，回答目的、細節與推論。',skills:'目的 · 細節 · 推論 · 資訊整合'},
    {part:4,family:'Listening',name:'簡短獨白',description:'聆聽公告、電話、廣告或簡報，回答理解題。',skills:'主旨 · 細節 · 下一步 · 資訊整合'},
    {part:5,family:'Reading',name:'句子填空',description:'從四個選項中完成句子，訓練字彙與文法。',skills:'詞性 · 時態 · 介系詞 · 字彙'},
    {part:6,family:'Reading',name:'段落填空',description:'完成電子郵件、通知或文章段落。',skills:'文法 · 語意 · 連貫 · 句子插入'},
    {part:7,family:'Reading',name:'閱讀理解',description:'閱讀單篇、雙篇或多篇文本並回答理解題。',skills:'細節 · 推論 · 目的 · 多文本整合'}
  ];
  const family=(title,items)=>`<section class="practice-family"><div class="section-head"><h3>${title}</h3><span class="badge">${items.length} Parts</span></div><div class="practice-grid">${items.map(item=>{const acc=appdeployPartAccuracy(item.part);return`<article class="card practice-part-card"><div class="practice-part-head"><span class="part-number">Part ${item.part}</span><span class="badge">${item.family}</span></div><h3>${item.name}</h3><p>${item.description}</p><small>${item.skills}</small><div class="practice-count">${appdeployModeInfo(appdeployPracticeMode).short} · ${appdeployPartCount(item.part)} 題</div><div class="practice-part-foot"><span>${acc===null?'尚無紀錄':`正確率 ${acc}%`}</span><button class="primary part-start" data-part="${item.part}">開始練習</button></div></article>`}).join('')}</div></section>`;
  return `<section class="hero practice-hero"><div class="hero-kicker"><p class="eyebrow">TOEIC PARTS 1–7</p><span class="hero-chip">全題型</span></div><h2>七大題型完整訓練。</h2><p>保留 Part 1–7 完整題型、錯題追蹤與模考紀錄；題目為原創 TOEIC-style 訓練題。</p></section>
    ${appdeployFullMockPanel()}
    <section class="card quality-system-card"><div><span class="part-number">QUALITY GATE</span><h3>TOEIC-style 題型結構</h3></div><p>維持各 Part 的職場情境、唯一答案、干擾項與閱讀／聽力題型結構。</p></section>
    <section class="card accent-engine-card"><div><span class="part-number">ACCENT ENGINE</span><h3>四區英語口音</h3></div><p>Part 1–4 可使用 US、UK、Canada、AU/NZ；隨機模式會在不同題目間切換，同一題重播維持同一口音。</p><div class="voice-status">裝置 voice 不支援指定地區時會退回可用英文 TTS。</div></section>
    <section class="card practice-mode-card"><div class="practice-mode-head"><div><span class="part-number">QUESTION VOLUME</span><h3>選擇本次練習量</h3></div><span class="badge">${appdeployModeInfo(appdeployPracticeMode).label}</span></div><div class="practice-mode-grid">${['quick','standard','mock'].map(mode=>{const info=appdeployModeInfo(mode);return`<button class="practice-mode-btn ${appdeployPracticeMode===mode?'active':''}" data-practice-mode="${mode}"><strong>${info.label}</strong><span>${info.description}</span></button>`}).join('')}</div><p class="practice-mode-counts">P1 ${appdeployPartCount(1)} · P2 ${appdeployPartCount(2)} · P3 ${appdeployPartCount(3)} · P4 ${appdeployPartCount(4)} · P5 ${appdeployPartCount(5)} · P6 ${appdeployPartCount(6)} · P7 ${appdeployPartCount(7)}</p><p class="muted">正式配比：P1 6、P2 25、P3 39、P4 30、P5 30、P6 16、P7 54。</p></section>
    ${family('Listening · 聽力',parts.filter(x=>x.family==='Listening'))}
    ${family('Reading · 閱讀',parts.filter(x=>x.family==='Reading'))}`;
}
function appdeployReviewStatus(m){
  return m.status==='reviewing'?'複習中':m.status==='confirming'?'待確認':m.status==='mastered'?'已掌握':'未掌握';
}
function appdeployReviewDue(m){
  return m.status!=='mastered'&&(!m.nextReviewAt||Date.parse(m.nextReviewAt)<=Date.now());
}
function appdeployReviewDate(m){
  return m.nextReviewAt?new Date(m.nextReviewAt).toLocaleDateString('zh-TW',{month:'numeric',day:'numeric'}):'現在';
}
function appdeployReviewContext(kind,m){
  if(kind==='news'){
    if(m.question?.part==='Part 5')return'';
    const a=allLessons().find(x=>x.id===m.sourceId);
    return a?.text||'';
  }
  return m.question?.stimulus||m.stimulus||'';
}
function appdeployAdvanceReview(kind,m,correct){
  const key=kind==='news'?KEYS.mistakes:KEYS.partMistakes;
  const rows=load(key,[]);
  const row=rows.find(x=>x.id===m.id);
  if(!row)return null;
  const t=now();
  row.reviewCount=(Number(row.reviewCount)||0)+1;
  row.lastReviewedAt=t;
  if(!correct){
    row.status='unmastered';
    row.reviewStage=0;
    row.correctStreak=0;
    row.lastWrongAt=t;
    row.nextReviewAt=new Date(Date.now()+86400000).toISOString();
    delete row.masteredAt;
  }else{
    const stage=Number(row.reviewStage)||0;
    row.correctStreak=(Number(row.correctStreak)||0)+1;
    if(stage>=2){
      row.status='mastered';
      row.reviewStage=3;
      row.masteredAt=t;
      delete row.nextReviewAt;
    }else{
      const nextStage=stage+1;
      row.reviewStage=nextStage;
      row.status=nextStage===1?'reviewing':'confirming';
      row.nextReviewAt=new Date(Date.now()+(nextStage===1?3:7)*86400000).toISOString();
    }
  }
  save(key,rows);
  return row;
}
function appdeployRetryReview(kind,id){
  const rows=kind==='news'?newsMistakes():partMistakes();
  const m=rows.find(x=>x.id===id);
  if(!m||m.status==='mastered')return;
  if(!appdeployReviewDue(m)){toast(`尚未到複習時間：${appdeployReviewDate(m)}`);return;}
  const q=m.question||{};
  const context=appdeployReviewContext(kind,m);
  dialogTitle.textContent='間隔錯題重測';
  body.innerHTML=`<section class="lesson-step">
    <div class="article-meta">
      <span class="badge">${esc(q.part||`Part ${Number(m.part)||''}`)}</span>
      <span class="badge">${esc(q.skill||'Review')}</span>
      <span class="badge">${appdeployReviewStatus(m)}</span>
      ${context?'<span class="badge review-context-badge">文章語境</span>':''}
    </div>
    ${context?`<div class="card review-context"><div class="review-context-head"><strong>作答語境</strong><span>作答前不提供解析或答案</span></div><p class="review-context-text" style="white-space:pre-line">${esc(context)}</p></div>`:''}
    <h3>${esc(q.q||'錯題')}</h3>
    <div class="option-grid">${(q.options||[]).map((o,i)=>`<button class="option retry-answer" data-i="${i}">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}</div>
    <div id="reviewFeedback"></div>
  </section>`;
  dialog.showModal();
  document.querySelectorAll('.retry-answer').forEach(btn=>btn.onclick=()=>{
    const choice=Number(btn.dataset.i);
    const correct=choice===Number(q.answer);
    document.querySelectorAll('.retry-answer').forEach((x,i)=>{
      x.disabled=true;
      if(i===Number(q.answer))x.classList.add('correct');
      else if(i===choice)x.classList.add('wrong');
    });
    const updated=appdeployAdvanceReview(kind,m,correct);
    const message=!correct?'仍未掌握；1 天後重新測驗'
      :updated?.status==='mastered'?'連續跨期答對，已移入「已掌握」歷史'
      :updated?.status==='reviewing'?'第一次確認成功；3 天後再測'
      :'第二次確認成功；7 天後最後確認';
    document.querySelector('#reviewFeedback').innerHTML=`<div class="card">
      <strong>${message}</strong>
      <p>正確答案：${esc((q.options||[])[Number(q.answer)]||'')}</p>
      <p class="muted">${esc(q.explain||'')}</p>
      <button class="primary" id="doneReview">完成</button>
    </div>`;
    document.querySelector('#doneReview').onclick=()=>{dialog.close();render()};
  });
}
function reviewPage(){
  const nm=newsMistakes(),pm=partMistakes();
  const activeNews=nm.filter(x=>x.status!=='mastered');
  const activePart=pm.filter(x=>x.status!=='mastered');
  const masteredNews=nm.filter(x=>x.status==='mastered');
  const masteredPart=pm.filter(x=>x.status==='mastered');
  const total=activeNews.length+activePart.length;
  const card=(kind,m)=>{const q=m.question||{};const context=appdeployReviewContext(kind,m);return`<div class="card">
    <div class="article-meta">
      <span class="badge">${esc(q.part||`Part ${Number(m.part)||''}`)}</span>
      <span class="badge">${esc(q.skill||'Review')}</span>
      <span class="badge">${appdeployReviewStatus(m)}</span>
      ${context?'<span class="badge review-context-badge">文章語境</span>':''}
    </div>
    <h3>${esc(q.q||'錯題')}</h3>
    <p class="muted">上次答案：${esc((q.options||[])[Number(m.choice)]||'—')}${context?'<br>重測時會附上原始作答語境；正解在作答後才顯示。':''}</p>
    ${appdeployReviewDue(m)?`<button class="secondary retry-review" data-kind="${kind}" data-id="${esc(m.id)}">開始間隔重測</button>`:`<button class="secondary" disabled>下次重測 ${appdeployReviewDate(m)}</button>`}
  </div>`};
  return `<div class="section-head"><h3>錯題與複習</h3><span class="badge">${total} 題待處理</span></div>
    <div class="card"><strong>間隔複習規則</strong><p class="muted">答錯後 1 天重測 → 答對後 3 天再測 → 再答對後 7 天確認 → 第三次跨期答對才標示已掌握；文章型錯題會帶回原始作答語境，解析與正解在作答後才開放。</p></div>
    ${!total?`<div class="card empty review-empty"><strong>目前沒有待複習錯題</strong><p>已掌握的題目不會刪除歷史；之後若再次答錯，會自動重新進入複習循環。</p><button class="primary" id="startFromReview">開始今日訓練</button></div>`:''}
    ${activeNews.length?`<div class="section-head"><h3>新聞教材錯題</h3><span class="badge">${activeNews.length} 題</span></div><div class="list">${activeNews.map(m=>card('news',m)).join('')}</div>`:''}
    ${activePart.length?`<div class="section-head"><h3>Part 1–7 題型錯題</h3><span class="badge">${activePart.length} 題</span></div><div class="list">${activePart.map(m=>card('part',m)).join('')}</div>`:''}
    ${(masteredNews.length+masteredPart.length)?`<details class="card review-archive"><summary><strong>已掌握 · ${masteredNews.length+masteredPart.length} 題</strong></summary><div class="list">${[...masteredNews,...masteredPart].slice(-12).reverse().map(m=>`<div><span class="badge">${esc(m.question?.part||`Part ${Number(m.part)||''}`)}</span> ${esc(m.question?.skill||'Review')} · ${esc(m.question?.q||'錯題')}</div>`).join('')}</div></details>`:''}`;
}
function appdeployMockSummary(){
  const rows=mockHistory().slice(-5).reverse();
  if(!rows.length)return'';
  const r=rows[0];
  return `<div class="section-head"><h3>完整模考紀錄</h3><span class="badge">${mockHistory().length} 次</span></div>
    <div class="card full-mock-summary"><div><small>最近答對</small><strong>${Number(r.correct||0)}/200</strong></div><div><small>最近預估</small><strong>${Number(r.estimatedMin||0)}–${Number(r.estimatedMax||0)}</strong></div><div><small>Listening</small><strong>${Number(r.listeningCorrect||0)}/100</strong></div><div><small>Reading</small><strong>${Number(r.readingCorrect||0)}/100</strong></div></div>`;
}
function progressPage(){
  const ps=partSessions();
  return `<section class="hero"><p class="eyebrow">PROGRESS</p><h2>${settings.currentLevel} → ${settings.targetScore}</h2><p>平均閱讀速度 <strong>${avgWpm()||'尚無資料'}${avgWpm()?' WPM':''}</strong>，下一篇建議 ${appdeployTargetLength()} 字。</p></section>
    ${appdeployMockSummary()}
    <div class="section-head"><h3>Part 1–7 題型表現</h3><span class="badge">${ps.length} 次</span></div>
    <div class="practice-performance-grid">${[1,2,3,4,5,6,7].map(part=>{const acc=appdeployPartAccuracy(part);const count=ps.filter(x=>Number(x.part)===part).length;return`<div class="card practice-performance"><small>Part ${part}</small><strong>${acc===null?'—':`${acc}%`}</strong><span>${count} 次</span></div>`}).join('')}</div>
    <div class="section-head"><h3>最近新聞閱讀</h3></div>
    <div class="list">${analyticsSessions().length?analyticsSessions().slice(-5).reverse().map(s=>`<div class="card"><div class="article-meta"><span class="badge">${displayWpm(s.wpm)}</span><span class="badge">${Number(s.correct||0)}/${Number(s.total||0)}</span></div><strong>${esc(s.title||'訓練')}</strong><p class="muted">${esc(s.date||'')}</p></div>`).join(''):'<div class="card empty progress-empty"><strong>尚無新聞閱讀紀錄</strong><p>完成主文章後，這裡會建立 WPM、正確率與近期閱讀趨勢。</p><button class="primary" id="startFromProgress">開始今日訓練</button></div>'}</div>`;
}
function settingsPage(){
  settings.lengthMode=settings.lengthMode||'Auto';
  settings.manualLength=settings.manualLength||'250-400';
  return `<div class="settings-page">
    <div class="section-head"><h3>個人學習設定</h3></div>
    <div class="card settings-card">
      <div class="setting"><label>目前 TOEIC 基準</label><input id="cur" type="number" value="${Number(settings.currentLevel)||600}"></div>
      <div class="setting"><label>目標分數</label><input id="goal" type="number" value="${Number(settings.targetScore)||750}"></div>
      <div class="setting"><label>每日分鐘</label><input id="mins" type="number" value="${Number(settings.dailyMinutes)||30}"></div>
      <div class="setting"><label>內容偏好</label><select id="cat">${['Balanced','Business','Travel','Technology','Daily Life'].map(v=>`<option ${settings.category===v?'selected':''}>${v}</option>`).join('')}</select></div>
      <div class="setting"><label>文章長度</label><select id="mode"><option ${settings.lengthMode==='Auto'?'selected':''}>Auto</option><option ${settings.lengthMode==='Manual'?'selected':''}>Manual</option></select></div>
      <div id="manualLengthWrap" class="setting manual-length-setting ${settings.lengthMode==='Manual'?'':'is-hidden'}"><label>手動範圍（words）</label><input id="manualLength" inputmode="numeric" value="${esc(settings.manualLength)}"></div>
      <button class="primary" id="saveSettings">儲存設定</button>
    </div>
    <div class="section-head"><h3>目標系統連動</h3><span class="badge">Goal Sync</span></div>
    <div class="card goal-sync-card">
      <div class="article-meta"><span class="badge">已啟用</span><span class="badge">GitHub 直連</span></div>
      <p class="muted">完成教材、Part 練習或模考後，學習分鐘、正確率與 Part 表現寫入同一 GitHub 網域同步中心。</p>
      <div class="sync-state">狀態：${esc(load(KEYS.goalStatus,'GitHub 直連已啟用'))}</div>
      <div class="actions"><button class="primary" id="flushQueue">搬移舊待傳紀錄</button></div>
    </div>
    <div class="section-head"><h3>系統更新</h3></div>
    <div class="card system-card" id="appdeploySystemUpdateCard">
      <div class="article-meta"><span class="badge">目前 v${VERSION}</span><span class="badge">自動更新 已啟用</span></div>
      <p class="muted" id="pwaRuntimeStatus">啟動、每 30 分鐘、回到前景與網路恢復時自動檢查；訓練進行中不強制重載。</p>
      <button class="secondary" id="pwaRuntimeCheck">立即檢查更新</button>
    </div>
    <div class="section-head"><h3>遷移備份</h3><span class="badge">本機</span></div>
    <div class="card system-card"><p class="muted">匯出／匯入會保留目前 GitHub TOEIC 本機資料；匯入前先保存快照。</p><div class="actions"><button id="exportBackup" class="primary">匯出 GitHub 備份</button></div><input id="importFile" class="file-input" type="file" accept=".json,application/json"><button id="importBackup" class="secondary wide">匯入 AppDeploy／GitHub 備份</button></div>
    <div class="section-head"><h3>線上服務</h3></div>
    <div class="card system-card"><p class="muted">新聞題材由 GitHub Actions 更新；教材、題型、解析、語音與複習在本機運作，不依賴 AppDeploy 額度。</p></div>
  </div>`;
}
function render(){
  main.innerHTML=({today:todayPage,news:newsPage,practice:practicePage,review:reviewPage,progress:progressPage,settings:settingsPage})[route]();
  bind();
}
function bind(){
  document.querySelectorAll('.library-start').forEach(b=>b.onclick=()=>openLesson(b.dataset.id));
  document.querySelectorAll('.make-lesson').forEach(b=>b.onclick=()=>{const n=news.find(x=>String(x.id)===String(b.dataset.id));if(!n)return;const lesson=buildNewsLesson(n),rows=generated().filter(x=>x.id!==lesson.id);rows.push(lesson);save(KEYS.generated,rows.slice(-60));save(KEYS.daily,{date:dayKey(),articleId:lesson.id,completed:false,selectedByUser:true});toast('已建立本機原創教材');openLesson(lesson.id)});
  document.querySelector('#reloadNews')?.addEventListener('click',()=>void loadNews(true));
  document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{appdeployNewsCategory=b.dataset.cat||'All';appdeployNewsPage=1;render()});
  document.querySelector('#prevNews')?.addEventListener('click',()=>{appdeployNewsPage=Math.max(1,appdeployNewsPage-1);render();window.scrollTo(0,0)});
  document.querySelector('#nextNews')?.addEventListener('click',()=>{appdeployNewsPage++;render();window.scrollTo(0,0)});
  document.querySelectorAll('[data-practice-mode]').forEach(b=>b.onclick=()=>{appdeployPracticeMode=b.dataset.practiceMode;localStorage.setItem(KEYS.practiceMode,appdeployPracticeMode);render()});
  document.querySelectorAll('.part-start').forEach(b=>b.onclick=()=>startPractice(Number(b.dataset.part),appdeployPartCount(Number(b.dataset.part))));
  document.querySelector('#startFullMockStrict')?.addEventListener('click',()=>{toast('開始完整 200 題模考');startFullMock()});
  document.querySelector('#startFullMockTraining')?.addEventListener('click',startFullMock);
  document.querySelectorAll('.review-mark').forEach(b=>b.onclick=()=>markReview(b.dataset.kind,b.dataset.id));
  document.querySelector('#startFromProgress')?.addEventListener('click',()=>switchRoute('today'));
  document.querySelector('#startFromReview')?.addEventListener('click',()=>switchRoute('today'));
  document.querySelector('#mode')?.addEventListener('change',e=>document.querySelector('#manualLengthWrap')?.classList.toggle('is-hidden',e.target.value!=='Manual'));
  document.querySelector('#saveSettings')?.addEventListener('click',()=>{
    settings.currentLevel=Number(document.querySelector('#cur').value)||600;
    settings.targetScore=Number(document.querySelector('#goal').value)||750;
    settings.dailyMinutes=Number(document.querySelector('#mins').value)||30;
    settings.category=document.querySelector('#cat').value;
    settings.lengthMode=document.querySelector('#mode').value;
    const manual=document.querySelector('#manualLength')?.value.trim()||'250-400';
    if(settings.lengthMode==='Manual'&&!/^\d{2,3}-\d{2,3}$/.test(manual))return toast('手動範圍請使用 250-400 格式');
    settings.manualLength=manual;
    save(KEYS.settings,settings);toast('設定已儲存');render();
  });
  document.querySelector('#exportBackup')?.addEventListener('click',exportBackup);
  document.querySelector('#importBackup')?.addEventListener('click',()=>{const f=document.querySelector('#importFile').files?.[0];if(!f)return toast('請先選擇 JSON');importBackup(f)});
  document.querySelector('#flushQueue')?.addEventListener('click',()=>{migrateQueuedGoalEvents();toast('舊待傳紀錄已搬到 GitHub 直連同步中心');render()});
  document.querySelector('#pwaRuntimeCheck')?.addEventListener('click',()=>window.AppPWA?.check(true));
}
function switchRoute(next){
  route=next;
  document.querySelectorAll('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.route===next));
  render();
  window.scrollTo({top:0,left:0,behavior:'instant'});
}
/* APPDEPLOY_LAYOUT_PARITY_END */
document.querySelector('#dialogClose').onclick=()=>dialog.close();
document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>switchRoute(b.dataset.route));
migrateQueuedGoalEvents();
render();
void loadNews(false);

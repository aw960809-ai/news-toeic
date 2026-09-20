'use strict';

const VERSION='2.0.0-github';
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
let route='today',news=[],activeLesson=null,lessonStarted=0,readingStarted=0,answers=[],qIndex=0;
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

async function loadNews(){
 try{
  const r=await fetch(`./data/news.json?ts=${Date.now()}`,{cache:'no-store'});
  if(!r.ok)throw new Error();
  const d=await r.json();
  news=Array.isArray(d.articles)?d.articles:[];
 }catch{news=[]}
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
 return`<section class="hero"><p class="eyebrow">LIVE TOPICS</p><h2>新聞教材池</h2><p>GitHub Actions 每日更新新聞標題與來源。按「建立教材」會在手機本機建立原創 TOEIC 練習改寫，不把新聞全文複製進系統。</p></section><div class="section-head"><h3>目前題材</h3><button id="reloadNews" class="secondary">重新讀取</button></div><section class="grid">${news.length?news.map(n=>`<article class="card news-card"><div class="news-meta"><span class="badge">${esc(n.category||'Business')}</span><span class="badge">${esc(n.source||'News')}</span></div><h3>${esc(n.title)}</h3><p class="muted">${esc(n.summary||'')}</p><div class="actions"><button class="primary make-lesson" data-id="${esc(n.id)}">建立原創 TOEIC 教材</button>${n.url?`<a class="secondary" href="${esc(n.url)}" target="_blank" rel="noopener">來源</a>`:''}</div></article>`).join(''):'<div class="card"><p class="muted">新聞池暫無資料；離線文章與題型訓練仍可使用。</p></div>'}</section>`}

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
 document.querySelector('#reloadNews')?.addEventListener('click',()=>void loadNews());
 document.querySelectorAll('.make-lesson').forEach(b=>b.onclick=()=>{const n=news.find(x=>String(x.id)===String(b.dataset.id));if(!n)return;const lesson=buildNewsLesson(n),rows=generated().filter(x=>x.id!==lesson.id);rows.push(lesson);save(KEYS.generated,rows.slice(-60));save(KEYS.daily,{date:dayKey(),articleId:lesson.id,completed:false,selectedByUser:true});toast('已建立本機原創教材');openLesson(lesson.id)});
 document.querySelectorAll('[data-part]').forEach(b=>b.onclick=()=>startPractice(Number(b.dataset.part),practiceCount(Number(b.dataset.part))));
 document.querySelector('#startMock')?.addEventListener('click',startFullMock);
 document.querySelectorAll('.review-mark').forEach(b=>b.onclick=()=>markReview(b.dataset.kind,b.dataset.id));
 document.querySelector('#saveSettings')?.addEventListener('click',()=>{settings.currentLevel=Number(document.querySelector('#cur').value)||600;settings.targetScore=Number(document.querySelector('#goal').value)||750;settings.dailyMinutes=Number(document.querySelector('#mins').value)||30;save(KEYS.settings,settings);toast('設定已儲存');render()});
 document.querySelector('#exportBackup')?.addEventListener('click',exportBackup);
 document.querySelector('#importBackup')?.addEventListener('click',()=>{const f=document.querySelector('#importFile').files?.[0];if(!f)return toast('請先選擇 JSON');importBackup(f)});
 document.querySelector('#flushQueue')?.addEventListener('click',()=>{migrateQueuedGoalEvents();toast('舊待傳紀錄已搬到 GitHub 直連同步中心')});
}

function switchRoute(next){route=next;document.querySelectorAll('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.route===next));render()}

function openLesson(id){
 const a=allLessons().find(x=>x.id===id);if(!a)return;
 activeLesson=a;lessonStarted=Date.now();readingStarted=Date.now();answers=[];qIndex=0;dialogTitle.textContent=a.title;renderLessonIntro();dialog.showModal();
}
function renderLessonIntro(){
 body.innerHTML=`<section class="grid"><div class="card"><p class="eyebrow">READING</p><p style="white-space:pre-line;line-height:1.75">${esc(activeLesson.text)}</p><div class="actions"><button id="speakArticle" class="secondary">🔊 播放全文</button><button id="analysisStep" class="primary">文章英文解構</button></div></div><div class="card"><h3>Vocabulary</h3>${(activeLesson.vocabulary||[]).map(v=>`<p><b>${esc(v[0]||v.word)}</b> · ${esc(v[1]||v.meaning)} <span class="muted">${esc(v[2]||v.collocation)}</span></p>`).join('')}</div></section>`;
 document.querySelector('#speakArticle').onclick=()=>speech(activeLesson.text);
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
 if(part===3){const loc=['office','hotel','warehouse','airport'];const place=loc[(i+seed)%loc.length];return{id:tag,part:3,skill:'Conversation detail',stimulus:`M: The delivery for the ${place} will arrive at 3 p.m.\nW: Great. I’ll ask the front desk to call us when it arrives.\nM: Please check the item count before signing the form.`,q:'What does the man ask the woman to do?',options:['Check the item count','Change the delivery date','Call a customer','Reserve a hotel'],answer:0,explain:'He asks her to check the item count.'}}
 if(part===4){return{id:tag,part:4,skill:'Announcement purpose',stimulus:`Good morning. This is a reminder that the employee workshop will begin at 10 a.m. in Room ${100+(i%5)}. Please bring your identification card and arrive ten minutes early.`,q:'What is the purpose of the announcement?',options:['To remind employees about a workshop','To advertise a new product','To cancel a reservation','To announce a store closing'],answer:0,explain:'It reminds employees about the workshop.'}}
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
function speakQuestion(item){if(item.part===1)return speech(item.options.join('. '));if(item.part===2)return speech(`${item.q}. ${item.options.join('. ')}`);if(item.stimulus)return speech(item.stimulus);speech(item.q)}
function startPractice(part,count){const set=makeSet(part,count),started=Date.now(),ans=[];let idx=0;dialogTitle.textContent=`Part ${part} · ${PART_INFO[part][0]}`;dialog.showModal();
 const show=()=>{if(idx>=set.length)return finish();const item=set[idx];body.innerHTML=`<section><div class="section-head"><span class="badge">Part ${part}</span><span class="badge">${idx+1}/${set.length}</span></div>${item.image?`<img class="photo" src="${item.image}" alt="Part 1 illustration">`:''}${item.stimulus?`<div class="card"><p style="white-space:pre-line">${esc(item.stimulus)}</p></div>`:''}${part<=4?'<button id="playQ" class="secondary wide">🔊 播放題目／音檔</button>':''}<h3>${part<=2?'請先聆聽，再選擇答案。':esc(item.q)}</h3><div class="option-grid">${item.options.map((o,i)=>`<button class="option p-opt" data-i="${i}">${String.fromCharCode(65+i)}. ${part<=2?'':esc(o)}</button>`).join('')}</div></section>`;document.querySelector('#playQ')?.addEventListener('click',()=>speakQuestion(item));document.querySelectorAll('.p-opt').forEach(b=>b.onclick=()=>{const choice=Number(b.dataset.i),correct=choice===item.answer;ans.push({item,choice,correct});if(!correct)registerPartMistake(part,item,choice);document.querySelectorAll('.p-opt').forEach((x,i)=>{x.disabled=true;if(i===item.answer)x.classList.add('correct');else if(i===choice)x.classList.add('wrong')});body.insertAdjacentHTML('beforeend',`<div class="card"><b>${correct?'答對':'答錯'}</b><p class="muted">${esc(item.explain)}</p><button id="nextP" class="primary">${idx+1===set.length?'完成':'下一題'}</button></div>`);document.querySelector('#nextP').onclick=()=>{idx++;show()}})};
 const finish=()=>{const correct=ans.filter(x=>x.correct).length,duration=Math.max(1,Math.round((Date.now()-started)/60000)),rows=partSessions();rows.push({id:`part-${Date.now()}`,date:dayKey(),part,title:`Part ${part}`,correct,total:set.length,durationMinutes:duration,skills:[...new Set(set.map(x=>x.skill))]});save(KEYS.partSessions,rows.slice(-500));const extra={};extra[`part${part}Answered`]=set.length;extra[`part${part}Correct`]=correct;publishGoalEvent(makeGoalEvent(`Part ${part} 訓練`,duration,set.length,correct,ans.filter(x=>!x.correct).map(x=>x.item.skill),extra));body.innerHTML=`<section class="hero"><p class="eyebrow">PART ${part} COMPLETE</p><h2>${correct}/${set.length}</h2><p>${duration} 分鐘 · 已寫入 GitHub Goal Sync。</p><button id="doneP" class="primary wide">完成</button></section>`;document.querySelector('#doneP').onclick=()=>{dialog.close();render()}};
 show()
}
function registerPartMistake(part,item,choice){const rows=partMistakes(),t=now();let m=rows.find(x=>Number(x.part)===part&&x.question?.q===item.q);if(!m){m={id:`part-m-${Date.now()}-${Math.random().toString(36).slice(2)}`,part,question:item,choice,source:'practice'};rows.push(m)}Object.assign(m,{choice,status:'unmastered',reviewStage:0,correctStreak:0,firstWrongAt:m.firstWrongAt||t,lastWrongAt:t,lastReviewedAt:t,nextReviewAt:new Date(Date.now()+86400000).toISOString(),masteredAt:undefined});save(KEYS.partMistakes,rows.slice(-500))}
function markReview(kind,id){const key=kind==='news'?KEYS.mistakes:KEYS.partMistakes,rows=load(key,[]),m=rows.find(x=>x.id===id);if(!m)return;const stage=Number(m.reviewStage)||0;m.correctStreak=(Number(m.correctStreak)||0)+1;m.lastReviewedAt=now();if(stage>=2){m.status='mastered';m.reviewStage=3;m.masteredAt=now();delete m.nextReviewAt}else{m.reviewStage=stage+1;m.status=m.reviewStage===1?'reviewing':'confirming';m.nextReviewAt=new Date(Date.now()+(m.reviewStage===1?3:7)*86400000).toISOString()}save(key,rows);toast('複習狀態已更新');render()}

function startFullMock(){
 const counts={1:6,2:25,3:39,4:30,5:30,6:16,7:54},items=[];for(let p=1;p<=7;p++)items.push(...makeSet(p,counts[p],p*97));
 const started=Date.now(),result=[],active={id:`mock-${Date.now()}`,mode:'training',startedAt:started,index:0,answers:[]};save(KEYS.mockActive,active);dialogTitle.textContent='完整 TOEIC-style 200 題模考';dialog.showModal();
 const show=()=>{const idx=active.index;if(idx>=items.length)return finish();const item=items[idx],part=item.part;body.innerHTML=`<section><div class="section-head"><span class="badge">Part ${part}</span><span class="badge">${idx+1}/200</span></div><div class="progressbar"><i style="width:${(idx/200*100).toFixed(1)}%"></i></div>${idx===100?'<div class="notice">Reading Section 開始。正式 TOEIC Reading 為 75 分鐘；此 GitHub 訓練版會保留你的作答進度。</div>':''}${item.image?`<img class="photo" src="${item.image}" alt="Part 1 illustration">`:''}${item.stimulus?`<div class="card"><p style="white-space:pre-line">${esc(item.stimulus)}</p></div>`:''}${part<=4?'<button id="mockAudio" class="secondary wide">🔊 播放</button>':''}<h3>${part<=2?'請聆聽後作答':esc(item.q)}</h3><div class="option-grid">${item.options.map((o,i)=>`<button class="option mock-opt" data-i="${i}">${String.fromCharCode(65+i)}. ${part<=2?'':esc(o)}</button>`).join('')}</div></section>`;document.querySelector('#mockAudio')?.addEventListener('click',()=>speakQuestion(item));document.querySelectorAll('.mock-opt').forEach(b=>b.onclick=()=>{const choice=Number(b.dataset.i),correct=choice===item.answer;active.answers.push({part,question:item,choice,correct});if(!correct)registerPartMistake(part,item,choice);active.index++;save(KEYS.mockActive,active);show()})};
 const finish=()=>{const correct=active.answers.filter(x=>x.correct).length,listening=active.answers.filter(x=>x.part<=4&&x.correct).length,reading=active.answers.filter(x=>x.part>=5&&x.correct).length,duration=Math.max(1,Math.round((Date.now()-started)/60000)),history=mockHistory();history.push({id:active.id,date:dayKey(),mode:'training',correct,listeningCorrect:listening,readingCorrect:reading,durationMinutes:duration,estimatedMin:Math.max(10,Math.round(correct/200*990)-40),estimatedMax:Math.min(990,Math.round(correct/200*990)+40),estimatedCenter:Math.round(correct/200*990),timedOut:false});save(KEYS.mockHistory,history.slice(-50));localStorage.removeItem(KEYS.mockActive);const extra={};for(let p=1;p<=7;p++){extra[`part${p}Answered`]=active.answers.filter(x=>x.part===p).length;extra[`part${p}Correct`]=active.answers.filter(x=>x.part===p&&x.correct).length}publishGoalEvent(makeGoalEvent('完整 TOEIC-style 200 題模考',duration,200,correct,active.answers.filter(x=>!x.correct).map(x=>x.question.skill),extra));body.innerHTML=`<section class="hero"><p class="eyebrow">FULL MOCK COMPLETE</p><h2>${correct}/200</h2><p>Listening ${listening}/100 · Reading ${reading}/100 · 約 ${duration} 分鐘</p><button id="doneMock" class="primary wide">完成</button></section>`;document.querySelector('#doneMock').onclick=()=>{dialog.close();render()}};
 show()
}

document.querySelector('#dialogClose').onclick=()=>dialog.close();
document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>switchRoute(b.dataset.route));
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
migrateQueuedGoalEvents();
render();
void loadNews();

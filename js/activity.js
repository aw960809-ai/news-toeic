/* V96 Activity module: independent catalog, matching, ranking and UI */
const ACTIVITY_SEED=[
{id:'thu-official',title:'東海大學官方活動／公告入口',date:'',time:'持續更新',scope:'東海校內',type:'教育／青少年',kind:'reference',url:'https://activity.thu.edu.tw/web/news/list.php',keywords:'東海大學 官方 活動 公告 講座 學術 職涯 實習 國際 校內活動 校外活動',direct:true,team:false,available:true,source:'東海大學學生事務處課外活動暨學生發展組',statusText:'東海官方活動入口',government:false,sourcePriority:'core'},
{id:'g01',title:'青年第一讚 Youth First｜政府青年資源總入口',date:'',time:'持續更新',scope:'全臺',type:'公共參與',kind:'reference',url:'https://youthfirst.yda.gov.tw/',keywords:'政府 青年 職涯 實習 就業 訓練 升學 地方創生 公共參與 國際連結 活動 獎補助',direct:true,team:false,available:true,source:'教育部青年發展署',statusText:'政府資訊彙整平台'},
{id:'g02',title:'青年百億海外圓夢基金計畫',date:'',time:'依各梯次徵件期程',scope:'線上／海外',type:'職涯／實習',kind:'plan',url:'https://twpathfinder.yda.gov.tw/',keywords:'青年 海外 圓夢 實習 見習 培訓 交流 國際 教育部 青年發展署',direct:true,team:false,available:true,source:'教育部青年發展署',statusText:'依各梯次公告'},
{id:'g03',title:'法國企業國際實習 VIE',date:'',time:'依企業職缺公告',scope:'線上／海外',type:'職涯／實習',kind:'plan',url:'https://www.mofa.gov.tw/cl.aspx?n=2493',keywords:'法國 VIE 海外 實習 工作 法律 金融 行銷 管理 會計 資訊 人力資源 國際職涯',direct:true,team:false,available:true,source:'外交部',statusText:'持續依參與企業職缺公告'},
{id:'g04',title:'青年度假打工',date:'',time:'依目的國申請期程',scope:'線上／海外',type:'語言／國際',kind:'plan',url:'https://youthtaiwan.mofa.gov.tw/WorkingHoliday/',keywords:'青年 海外 度假打工 工作 日本 澳洲 紐西蘭 加拿大 英國 德國 法國 國際 文化',direct:true,team:false,available:true,source:'外交部',statusText:'依各國簽證與名額規定申請'},
{id:'g05',title:'教育部學海系列計畫',date:'',time:'依年度及學校甄選期程',scope:'線上／海外',type:'職涯／實習',kind:'reference',url:'https://www.studyabroad.moe.gov.tw/new/',keywords:'學海飛颺 學海惜珠 學海築夢 新南向學海築夢 海外研修 實習 補助 教育部',direct:false,team:false,available:true,source:'教育部',statusText:'需依學校校內甄選與教育部期程辦理'}
];

function mergeActivityCatalog(existing){
 const old=(Array.isArray(existing)?existing:[]).filter(a=>!['a5','a6','a7','a8','a9'].includes(String(a.id))&&!a.scholarship&&a.type!=='獎學金／助學金'&&a.kind!=='scholarship');
 const byId=new Map(old.map(a=>[String(a.id),a]));
 ACTIVITY_SEED.forEach(a=>byId.set(String(a.id),{...(byId.get(String(a.id))||{}),...a}));
 return [...byId.values()].filter(a=>!/^a[1-4]$/.test(String(a.id))||ACTIVITY_SEED.some(x=>x.id===a.id));
}
function mergeScholarshipCatalog(existing){
 const old=Array.isArray(existing)?existing:[];
 const byId=new Map(old.map(a=>[String(a.id),a]));
 SCHOLARSHIP_SEED.forEach(a=>byId.set(String(a.id),{...(byId.get(String(a.id))||{}),...a,kind:'scholarship',scholarship:true,type:'獎學金／助學金'}));
 return [...byId.values()].filter(a=>a&&(a.scholarship||a.type==='獎學金／助學金'||a.kind==='scholarship')&&String(a.id));
}
function activityStore(){return Array.isArray(db.activities)?db.activities.filter(a=>!a.scholarship&&a.type!=='獎學金／助學金'&&a.kind!=='scholarship'):[]}
function scholarshipStore(){return Array.isArray(db.scholarships)?db.scholarships:[]}
function catalogItemById(id){
 const key=String(id);
 return activityStore().find(x=>String(x.id)===key)||scholarshipStore().find(x=>String(x.id)===key)||null;
}

/* V96.7 Activity Radar UI: backend fit/circle aware */
function activityCircleInfo(a){
  const raw=String(a?.circleLabel||a?.scope||'').trim().replace('臺','台');
  const explicit=Number(a?.circleLevel||0);
  if(explicit>=1&&explicit<=4){
    const label=explicit===1?'東海校內':explicit===2?'台中':explicit===3?'全國':'海外／國際';
    return {level:explicit,label,key:'circle'+explicit};
  }
  if(/東海|校內/.test(raw))return {level:1,label:'東海校內',key:'circle1'};
  if(/西屯|沙鹿|台中/.test(raw))return {level:2,label:'台中',key:'circle2'};
  if(/海外|國際|線上/.test(raw))return {level:4,label:'海外／國際',key:'circle4'};
  return {level:3,label:'全國',key:'circle3'};
}
function activityDistance(scope){return activityCircleInfo({scope}).level}
function activityDeadlineInfo(a){
  const today=todayKey(),deadline=String(a?.deadline||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(deadline))return {deadline:'',closed:false,days:null,label:a?.openEnded?'常設開放':'依公告／無單一截止日'};
  const days=Math.round((new Date(deadline+'T00:00:00')-new Date(today+'T00:00:00'))/86400000);
  if(days<0)return {deadline,closed:true,days,label:`已截止 ${deadline}`};
  if(days===0)return {deadline,closed:false,days,label:'今天截止'};
  if(days<=7)return {deadline,closed:false,days,label:`${days} 天內截止 · ${deadline}`};
  return {deadline,closed:false,days,label:`截止 ${deadline}`};
}
function activityFitTier(score){
  const n=Number(score||0);if(n>=72)return '高適配';if(n>=52)return '中適配';if(n>=38)return '探索';return '低適配';
}
function activityFitClass(tier){return tier==='高適配'?'fit-high':tier==='中適配'?'fit-mid':tier==='探索'?'fit-explore':'fit-low'}
function activityReasonLabel(reason){
  const s=String(reason||'').replace(/[+-]\d+$/,'').trim();if(!s)return '';
  if(/^同心圓/.test(s))return s.replace(/^同心圓第\d+圈：/,'位置：');
  if(s==='法律／轉學考')return '直接連結法律／轉學考目標';
  if(s==='語言／國際／海外')return '直接連結語言／海外／國際目標';
  if(s==='青少年／營隊／教學')return '連結青少年營隊／教學目標';
  if(s==='職涯／實習')return '具職涯／實習行動價值';
  if(s==='通用能力／AI工具')return '可提升通用能力／AI工具能力';
  if(/有明確截止日/.test(s))return '有明確截止日，可直接安排';
  if(/有明確地點/.test(s))return '有明確地點，執行成本可判斷';
  if(/直接連結海外/.test(s))return '直接連結海外／國際經驗';
  if(/直接連結法律/.test(s))return '直接連結法律學習';
  if(/大學生/.test(s))return '活動對象與大學生身分相符';
  if(/職場體驗|產業探索|實習/.test(s))return '具體職涯體驗，可轉化為行動';
  return s;
}
function activityGoalLabels(a,fit){
  const result=[];(Array.isArray(a?.goalMatches)?a.goalMatches:[]).forEach(x=>{if(x&&!result.includes(x))result.push(x)});
  if(fit?.task?.name&&!result.includes(fit.task.name))result.unshift(fit.task.name);return result.slice(0,3);
}
function activityAutoClass(a){
 const allowed=['法律／學術','語言／國際','教育／青少年','職涯／實習','公共參與'];
 if(allowed.includes(a.type))return a.type;
 const s=(a.title+' '+(a.keywords||'')).toLowerCase();
 if(/法律|憲法|民法|刑法|學術/.test(s))return'法律／學術';
 if(/英語|日語|語言|國際|海外|交換/.test(s))return'語言／國際';
 if(/青少年|教育|教學|課程|帶領/.test(s))return'教育／青少年';
 if(/工作|實習|打工|履歷|職涯/.test(s))return'職涯／實習';
 return a.type||'公共參與';
}
function activityMatchDetails(a){
 const tasks=db.tasks.filter(t=>Number(t.level)>=1&&Number(t.level)<=4&&t.status!=='已封存');
 const text=(String(a.title||'')+' '+String(a.keywords||'')+' '+String(a.type||'')).toLowerCase();
 let best=null,bestScore=0;
 tasks.forEach(t=>{
   const chain=ancestors(t.id),path=chain.map(x=>String(x.name||'')).join(' ').toLowerCase(),name=String(t.name||'').toLowerCase();
   const corpus=name+' '+path;if(!corpus.trim())return;
   const weight={1:2,2:4,3:7,4:10}[Number(t.level)]||2;let z=0;
   const words=[...new Set(corpus.split(/[／/、，,\s+｜·]+/).filter(w=>w.length>=2))];
   words.forEach(w=>{if(text.includes(w))z+=weight});
   if(/海外|國際|實習|工作|打工|青年/.test(text)&&/青年計畫|海外活動|語言能力準備|海外|國際|實習|工作/.test(corpus))z+=weight*2;
   if(t.level===1&&t.id==='g2'&&/海外|國際|實習|工作|打工|青年|計畫/.test(text))z+=15;
   if(t.level===1&&t.id==='g3'&&a.type==='語言／國際'&&/語言|英語|日語/.test(text))z+=8;
   if(a.type==='職涯／實習'&&/海外|實習|工作|職涯|青年/.test(corpus))z+=weight*2;
   if(a.type==='語言／國際'&&/海外|國際|語言|交換|青年/.test(corpus))z+=weight*2;
   if(z>bestScore){bestScore=z;best=t}
 });
 return {task:best,matchScore:bestScore};
}
function activityTimeState(a){
  const today=todayKey(),date=String(a.date||'').trim(),duration=Number(a.durationMinutes||a.duration||0)||0,deadline=activityDeadlineInfo(a);
  if(a.radarEligible===false)return {eligible:false,state:'已排除',reason:a.eligibilityReason||a.hardFilterReason||'後端雷達判斷為不適用'};
  if(a.available===false)return {eligible:false,state:'停用',reason:'資料標示不可用'};
  if(a.kind==='reference')return {eligible:false,state:'參考',reason:'資訊入口，不列入可直接參加清單'};
  if(deadline.closed)return {eligible:false,state:'已截止',reason:deadline.label};
  if(date&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<today)return {eligible:false,state:'已過期',reason:'活動日期已經過去'};
  if(duration>0&&duration<(window.ActivityRules?.minimumDurationMinutes||30))return {eligible:false,state:'過短',reason:'活動時間少於 30 分鐘，暫不列入行動推薦'};
  if(deadline.deadline)return {eligible:true,state:'可報名',reason:deadline.label};
  if(a.openEnded)return {eligible:true,state:'常設',reason:'官方常設計畫／入口'};
  if(date)return {eligible:true,state:'可安排',reason:'已有明確日期'};
  return {eligible:true,state:'持續資訊',reason:'未提供單一日期，依公告／梯次判斷'};
}
function activityFit(a){
  const rel=activityMatchDetails(a),circle=activityCircleInfo(a),backendScore=Number(a.fitScore),hasBackend=Number.isFinite(backendScore)&&String(a.id||'').startsWith('auto-');
  if(hasBackend){
    const score=Math.max(0,Math.min(100,Math.round(backendScore))),tier=String(a.fitTier||activityFitTier(score)),time=activityTimeState(a);
    return {score,priority:score,tier,matchPercent:score,task:rel.task,eligible:time.eligible,timeState:time.state,timeReason:time.reason,circleLevel:circle.level,circleLabel:circle.label,circleKey:circle.key,reasons:Array.isArray(a.fitReasons)?a.fitReasons:[],goalMatches:Array.isArray(a.goalMatches)?a.goalMatches:[],sourceMode:'backend'};
  }
  const d=circle.level,text=(a.title+' '+(a.keywords||'')+' '+(a.type||'')).toLowerCase(),goal=Math.min(45,Math.round(rel.matchScore*3)),direct=a.direct===true&&!a.team;
  const knowledge=/實習|工作|打工|職涯|學術|法律|教育|語言|國際|技能|培訓|講座|見習|證照/.test(text)?(window.ActivityRules?.weights?.knowledge||15):8;
  const proximity={1:8,2:4,3:2,4:0}[d]||0,freshness=a.available===false?0:(a.date?5:3),action=direct?(window.ActivityRules?.weights?.direct||20):10,institutional=(circle.level===1&&a.sourcePriority==='core')?(window.ActivityRules?.institutionalBonus||5):0;
  const score=Math.max(0,Math.min(100,goal+action+knowledge+proximity+freshness+institutional)),tier=activityFitTier(score),time=activityTimeState(a);
  return {score,priority:score,tier,matchPercent:Math.max(0,Math.min(100,Math.round((goal/45)*100))),task:rel.task,eligible:time.eligible,timeState:time.state,timeReason:time.reason,circleLevel:circle.level,circleLabel:circle.label,circleKey:circle.key,reasons:[],goalMatches:[],sourceMode:'local'};
}
function activityCircleLabel(level){return ({1:'① 東海校內',2:'② 台中',3:'③ 全國',4:'④ 海外／國際'})[Number(level)]||'③ 全國'}
function activitySort(a,b){return (b.fit.score-a.fit.score)||(a.fit.circleLevel-b.fit.circleLevel)||((a.date||'9999-12-31').localeCompare(b.date||'9999-12-31'))||a.title.localeCompare(b.title,'zh-Hant')}
let activityPage=1;
const ACTIVITY_PAGE_SIZE=window.ActivityRules?.pageSize||4;
function clearActivitySearch(){const input=document.getElementById('activitySearch');if(input)input.value='';activityPage=1;updateActivitySearchUI();renderActivities();toast('已清除搜尋')}
function bindActivitySearch(){const e=document.getElementById('activitySearch');if(e&&!e.dataset.bound){e.dataset.bound='1';e.addEventListener('input',()=>{activityPage=1;updateActivitySearchUI()})}}
function applyActivitySearch(){bindActivitySearch();activityPage=1;const b=document.getElementById('activitySearchButton');if(b){b.classList.add('searching');setTimeout(()=>b.classList.remove('searching'),180)}renderActivities();updateActivitySearchUI();toast('已套用活動搜尋')}
function activityIsEligible(a){return activityTimeState(a).eligible}
function activityExternalUrl(a){return String(a?.url||a?.externalUrl||a?.sourceUrl||'').trim()}
let remoteActivityCatalog=[];
let activityAutoMeta={updatedAt:'',sources:0,events:0,ok:0,failed:0};
function normalizeRemoteActivity(a,i){
  const x={...(a||{})};x.id=String(x.id||('auto-'+i+'-'+Math.abs(hashCode(String(x.title||'activity')+String(x.date||'')))));
  x.title=String(x.title||'未命名活動').trim();x.date=String(x.date||'').trim();x.time=String(x.time||'').trim();x.deadline=String(x.deadline||'').trim();x.scope=String(x.scope||x.circleLabel||'全國').trim();x.type=String(x.type||'公共參與').trim();x.kind=x.kind||'event';
  x.scholarship=!!x.scholarship;x.url=String(x.url||x.externalUrl||'').trim();x.keywords=String(x.keywords||'').trim();x.source=String(x.source||'自動活動資料').trim();x.statusText=String(x.statusText||'自動抓取').trim();x.direct=x.direct!==false;x.team=!!x.team;x.available=x.available!==false;
  x.fitScore=(x.fitScore===null||x.fitScore===undefined||x.fitScore==='')?null:Number(x.fitScore);x.fitTier=String(x.fitTier||'').trim();x.circleLabel=String(x.circleLabel||'').trim();x.circleLevel=Number(x.circleLevel||0)||0;
  x.fitReasons=Array.isArray(x.fitReasons)?x.fitReasons.filter(Boolean):[];x.goalMatches=Array.isArray(x.goalMatches)?x.goalMatches.filter(Boolean):[];x.radarEligible=x.radarEligible!==false;x.audience=String(x.audience||'').trim();x.organizer=String(x.organizer||'').trim();x.durationMinutes=Number(x.durationMinutes||x.duration||0)||0;if(x.scholarship)x.type='獎學金／助學金';return x;
}
function hashCode(str){let h=0;for(let i=0;i<str.length;i++)h=((h<<5)-h)+str.charCodeAt(i)|0;return h}
async function loadRemoteActivities(){
 try{
  // Standalone preview mode: local content:// / file:// pages cannot reliably fetch sibling JSON.
  // The production GitHub Pages build still uses the external JSON files below.
  if(window.__PREVIEW_CATALOG){
   const payload=window.__PREVIEW_CATALOG||{};
   const items=Array.isArray(payload.activities)?payload.activities:[];
   const scholarshipItems=Array.isArray(payload.scholarships)?payload.scholarships:[];
   remoteActivityCatalog=items.map(normalizeRemoteActivity).filter(x=>!x.scholarship&&x.type!=='獎學金／助學金'&&x.kind!=='scholarship');
   activityAutoMeta=payload.meta||{mode:'standalone-preview'};
   db.scholarships=mergeScholarshipCatalog([...(Array.isArray(db.scholarships)?db.scholarships:[]),...scholarshipItems.map(normalizeRemoteActivity)]);
   db.activities=mergeActivityCatalog([...(Array.isArray(db.activities)?db.activities:[]),...remoteActivityCatalog]);
   activityPage=1;renderActivities();renderScholarships();
   const box=document.getElementById('activityAutoStatus');
   if(box){box.style.display='block';const u=document.getElementById('activityAutoUpdated'),m=document.getElementById('activityAutoMeta');if(u)u.textContent='獨立預覽資料';if(m)m.textContent=`預覽模式 · 活動 ${remoteActivityCatalog.length} · 獎學金 ${scholarshipItems.length}`}
   return;
  }
  const activityUrl=window.AppConfig?.data?.activities||'./data/activities.json';
  const scholarshipUrl=window.AppConfig?.data?.scholarships||'./data/scholarships.json';
  let payload={};
  const r=await fetch(activityUrl+'?ts='+Date.now(),{cache:'no-store'});
  if(r.ok) payload=await r.json();
  else { const legacy=await fetch((window.AppConfig?.data?.legacyCombined||'./data/events.json')+'?ts='+Date.now(),{cache:'no-store'}); if(!legacy.ok)throw new Error('activity data unavailable'); payload=await legacy.json(); }
  const items=Array.isArray(payload)?payload:(Array.isArray(payload.events)?payload.events:[]);
  let scholarshipItems=Array.isArray(payload.scholarships)?payload.scholarships:[];
  if(!scholarshipItems.length){try{const sr=await fetch(scholarshipUrl+'?ts='+Date.now(),{cache:'no-store'});if(sr.ok){const sp=await sr.json();scholarshipItems=Array.isArray(sp)?sp:(Array.isArray(sp.scholarships)?sp.scholarships:[]);}}catch(_){} }
  const normalizedItems=validateCatalogBoundary(items.map(normalizeRemoteActivity),'活動'),normalizedScholarships=validateCatalogBoundary(scholarshipItems.map(normalizeRemoteActivity),'獎學金');
  const remoteScholarships=[...normalizedItems.filter(x=>x.scholarship||x.type==='獎學金／助學金'||x.kind==='scholarship'),...normalizedScholarships];
  remoteActivityCatalog=normalizedItems.filter(x=>!x.scholarship&&x.type!=='獎學金／助學金'&&x.kind!=='scholarship');activityAutoMeta=payload.meta||{};
  db.scholarships=mergeScholarshipCatalog([...(Array.isArray(db.scholarships)?db.scholarships:[]),...remoteScholarships]);db.activities=mergeActivityCatalog([...(Array.isArray(db.activities)?db.activities:[]),...remoteActivityCatalog]);
  activityPage=1;renderActivities();renderScholarships();
  const box=document.getElementById('activityAutoStatus');if(box){box.style.display='block';const u=document.getElementById('activityAutoUpdated'),m=document.getElementById('activityAutoMeta');if(u)u.textContent=activityAutoMeta.updatedAt?('更新 '+new Date(activityAutoMeta.updatedAt).toLocaleString('zh-TW',{hour12:false})):'自動資料';if(m)m.textContent=`來源 ${activityAutoMeta.sources||0} · 活動 ${items.length} · 獎學金 ${scholarshipItems.length} · 成功 ${activityAutoMeta.ok||0} · 失敗 ${activityAutoMeta.failed||0}`}
 }catch(e){const box=document.getElementById('activityAutoStatus');if(box){box.style.display='block';const u=document.getElementById('activityAutoUpdated'),m=document.getElementById('activityAutoMeta');if(u)u.textContent='自動資料暫不可用';if(m)m.textContent='目前使用內建活動資料；下次更新會再嘗試。'}}
}
function activityCardHTML(a,today){
  const f=a.fit,tierClass=activityFitClass(f.tier),deadline=activityDeadlineInfo(a),goals=activityGoalLabels(a,f);
  const goalHTML=goals.length?goals.map(g=>`<span class="activity-goal-chip">${esc(g)}</span>`).join(''):'<span class="muted">尚無直接目標連結</span>';
  const reasons=(Array.isArray(f.reasons)?f.reasons:[]).map(activityReasonLabel).filter(Boolean).filter((x,i,arr)=>arr.indexOf(x)===i).slice(0,5);
  const localReason=f.task?`與「${f.task.name}」直接相關`:'依活動內容與目標地圖進行匹配',reasonHTML=(reasons.length?reasons:[localReason]).map(r=>`<li>${esc(r)}</li>`).join('');
  const dateText=a.date?`${esc(a.date)}${a.time?' · '+esc(a.time):''}`:esc(a.time||'依公告'),sourceText=[a.organizer||a.source,a.audience].filter(Boolean).map(esc).join(' · ');
  return `<article class="activity-card ${tierClass}"><div class="activity-head"><div class="activity-title-block"><div class="activity-eyebrow">${esc(activityCircleLabel(f.circleLevel))}</div><h3>${esc(a.title)}</h3><div class="muted">${dateText}</div></div><div class="activity-score-block ${tierClass}"><span class="activity-score">${f.score}</span><small>${esc(f.tier)}</small></div></div><div class="activity-meta"><span class="activity-chip circle-chip">${esc(f.circleLabel)}</span><span class="activity-chip tier-chip ${tierClass}">${esc(f.tier)}</span><span class="activity-chip">${esc(a.type)}</span><span class="activity-chip">${esc(f.timeState)}</span></div><div class="activity-decision-grid"><div><small>報名／時效</small><b>${esc(deadline.label)}</b></div><div><small>目標關聯</small><div class="activity-goals">${goalHTML}</div></div></div><details class="activity-reasons"><summary>為什麼推薦</summary><ul>${reasonHTML}</ul>${sourceText?`<div class="activity-source">來源／資格：${sourceText}</div>`:''}</details><div class="activity-actions">${activityExternalUrl(a)?`<a class="btn" href="${esc(safeExternalUrl(activityExternalUrl(a)))}" target="_blank" rel="noopener noreferrer">官方資訊</a>`:''}${((a.kind==='event'||a.kind==='plan')&&a.date)?`<button class="btn gold" type="button" onclick="addActivityToCalendar('${String(a.id).replace(/'/g,"\\'")}')">加入行事曆</button>`:''}</div></article>`;
}
function renderActivityPagination(total){
 const el=document.getElementById('activityPagination');if(!el)return;const pages=Math.max(1,Math.ceil(total/ACTIVITY_PAGE_SIZE));activityPage=Math.min(Math.max(1,activityPage),pages);
 el.innerHTML=total>ACTIVITY_PAGE_SIZE?`<button class="btn" type="button" onclick="activityPrevPage()" ${activityPage===1?'disabled':''}>‹</button><span class="activity-page-info">第 ${activityPage} / ${pages} 頁</span><button class="btn" type="button" onclick="activityNextPage()" ${activityPage===pages?'disabled':''}>›</button>`:'';
}
function activityPrevPage(){if(activityPage>1){activityPage--;renderActivities();window.scrollTo({top:0,behavior:'smooth'})}}
function activityNextPage(){activityPage++;renderActivities();window.scrollTo({top:0,behavior:'smooth'})}
function renderActivities(){
  ensureActivities();bindActivitySearch();const q=(document.getElementById('activitySearch')?.value||'').trim().toLowerCase(),circleFilter=document.getElementById('activityScope')?.value||'全部',type=document.getElementById('activityType')?.value||'全部',tierFilter=document.getElementById('activityFitTier')?.value||'全部',today=todayKey();
  let arr=activityStore().filter(activityIsEligible).map(a=>({...a,type:activityAutoClass(a),fit:activityFit(a)})).filter(a=>{const hay=[a.title,a.keywords,a.scope,a.source,a.organizer,...(a.goalMatches||[])].join(' ').toLowerCase();return (!q||hay.includes(q))&&(circleFilter==='全部'||a.fit.circleLabel===circleFilter)&&(type==='全部'||a.type===type)&&(tierFilter==='全部'||a.fit.tier===tierFilter)});
  arr.sort(activitySort);const tierCounts={high:arr.filter(a=>a.fit.tier==='高適配').length,mid:arr.filter(a=>a.fit.tier==='中適配').length,explore:arr.filter(a=>a.fit.tier==='探索').length},pages=Math.max(1,Math.ceil(arr.length/ACTIVITY_PAGE_SIZE));activityPage=Math.min(Math.max(1,activityPage),pages);const pageItems=arr.slice((activityPage-1)*ACTIVITY_PAGE_SIZE,activityPage*ACTIVITY_PAGE_SIZE);
  const stats=document.getElementById('activityStats');if(stats)stats.innerHTML=`目前 <b>${arr.length}</b> 項 · 高適配 ${tierCounts.high} · 中適配 ${tierCounts.mid} · 探索 ${tierCounts.explore} · 每日自動更新後僅保留仍可行動項目。`;
  const st=document.getElementById('activitySearchStatus');if(st)st.textContent=q?`搜尋「${q}」：找到 ${arr.length} 項`:`依適配度排序；同分時優先較近的同心圓`;
  const list=document.getElementById('activityList');if(!pageItems.length){list.innerHTML='<div class="empty">目前沒有符合條件的活動。可調整搜尋、圈層、類型或適配度。</div>';renderActivityPagination(0);renderActivityReferences();return}
  const pageGroups={1:[],2:[],3:[],4:[]};pageItems.forEach(a=>(pageGroups[a.fit.circleLevel]||pageGroups[3]).push(a));
  list.innerHTML=Object.entries(pageGroups).filter(([,items])=>items.length).map(([level,items])=>`<section class="activity-group circle${level}"><div class="activity-group-head"><div class="activity-group-title"><i></i>${activityCircleLabel(level)}</div><small>${level==='1'?'最低執行成本':level==='2'?'台中可直接行動':level==='3'?'全國機會':'海外／國際長期目標'}</small></div><div class="list">${items.map(a=>activityCardHTML(a,today)).join('')}</div></section>`).join('');
  renderActivityPagination(arr.length);renderActivityReferences();
}
function renderActivityReferences(){
 const box=document.getElementById('activityReferences');if(!box)return;const refs=activityStore().filter(a=>a.kind==='reference'&&activityExternalUrl(a));box.innerHTML=refs.length?`<div class="reference-title">📚 相關計畫資料（不列入可直接參加活動）</div>`+refs.map(a=>`<div class="reference-item"><div><b>${esc(a.title)}</b><small>${esc(a.statusText||'參考資料')} · ${esc(a.source||'官方來源')}</small></div><a class="btn" href="${esc(safeExternalUrl(activityExternalUrl(a)))}" target="_blank" rel="noopener noreferrer">查看官方資訊</a></div>`).join(''):'';
}
function activityResetFilters(){['activitySearch'].forEach(id=>{const e=document.getElementById(id);if(e)e.value=''});['activityScope','activityType','activityFitTier'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='全部'});activityPage=1;renderActivities()}

/* V96.8 Goal Map <-> Activity Radar bridge */
function activityActiveSubtasks(){
  return (Array.isArray(db?.tasks)?db.tasks:[]).filter(t=>Number(t.level)===3&&t.status!=='已封存').sort((a,b)=>activityGoalPathText(a).localeCompare(activityGoalPathText(b),'zh-Hant'));
}
function activityGoalPathText(t){if(!t)return '';try{return ancestors(t.id).map(x=>String(x.name||'')).join(' → ')}catch(_){return String(t.name||'')}}
function activitySubtaskForTask(t){
  if(!t)return null;if(Number(t.level)===3)return t;
  if(Number(t.level)===4){const p=(db.tasks||[]).find(x=>String(x.id)===String(t.parent));return p&&Number(p.level)===3?p:null}
  return null;
}
function activityGoalCategorySet(text){
  const s=String(text||'').toLowerCase(),out=new Set();
  if(/法律|法學|刑法|民法|憲法|行政法|轉學考|國考|司法/.test(s))out.add('法律／轉學考');
  if(/英語|英文|日語|日文|語言|toeic|toefl|ielts|jlpt|檢定|國際|海外|交換/.test(s))out.add('語言／國際／海外');
  if(/青少年|營隊|教學|社課|演辯|辯論|高中|帶領|教育/.test(s))out.add('青少年／營隊／教學');
  if(/實習|工作|職涯|履歷|就業|打工|產業|職場/.test(s))out.add('職涯／實習');
  if(/ai|人工智慧|gpt|claude|gemini|notebooklm|簡報|溝通|數位|工具/.test(s))out.add('通用能力／AI工具');
  return out;
}
function activityGoalTokens(text){
  const stop=new Set(['目標','任務','子任務','具體','實現','方式','學習','準備','複習','建立','計畫','規劃','能力','上學期','下學期','年度','階段','課程']);
  return [...new Set(String(text||'').toLowerCase().split(/[／/、，,\s+｜·：:（）()【】\[\]「」『』_-]+/).map(x=>x.trim()).filter(x=>x.length>=2&&!stop.has(x)))];
}
function activityGoalCorpus(subtask){
  const children=(db.tasks||[]).filter(t=>Number(t.level)===4&&String(t.parent)===String(subtask?.id)&&t.status!=='已封存');
  return {path:activityGoalPathText(subtask),children,text:[activityGoalPathText(subtask),...children.map(x=>x.name)].join(' ')};
}
function activityGoalAffinity(a,subtask){
  if(!a||!subtask)return {score:0,evidence:[],concrete:[]};
  const goal=activityGoalCorpus(subtask),activityText=[a.title,a.keywords,a.type,a.scope,a.source,a.organizer,a.audience,...(a.goalMatches||[]),...(a.fitReasons||[])].filter(Boolean).join(' ').toLowerCase();
  let score=0;const evidence=[],goalCats=activityGoalCategorySet(goal.text),activityCats=activityGoalCategorySet(activityText),backendCats=new Set(Array.isArray(a.goalMatches)?a.goalMatches:[]);
  [...goalCats].forEach(cat=>{if(activityCats.has(cat)||backendCats.has(cat)){score+=28;evidence.push(cat)}});
  let hits=0;activityGoalTokens(goal.path).forEach(token=>{if(activityText.includes(token)){hits++;score+=10}});if(hits>=2)score+=8;
  const concrete=[];goal.children.forEach(child=>{const cc=activityGoalCategorySet(child.name),ct=activityGoalTokens(child.name),catHit=[...cc].some(x=>activityCats.has(x)||backendCats.has(x)),wordHits=ct.filter(x=>activityText.includes(x)).length;if(catHit||wordHits){score+=Math.min(18,(catHit?8:0)+wordHits*5);concrete.push(child)}});
  if(a.type==='法律／學術'&&goalCats.has('法律／轉學考'))score+=8;if(a.type==='語言／國際'&&goalCats.has('語言／國際／海外'))score+=8;if(a.type==='教育／青少年'&&goalCats.has('青少年／營隊／教學'))score+=8;if(a.type==='職涯／實習'&&(goalCats.has('職涯／實習')||goalCats.has('語言／國際／海外')))score+=6;
  return {score:Math.max(0,Math.min(100,Math.round(score))),evidence:[...new Set(evidence)],concrete:concrete.slice(0,3)};
}
function activitySelectedSubtask(){const id=document.getElementById('activityGoalFilter')?.value||'全部';return id==='全部'?null:activityActiveSubtasks().find(t=>String(t.id)===String(id))||null}
function activityEnsureGoalFilter(){
  const sel=document.getElementById('activityGoalFilter');if(!sel)return;const before=sel.value||'全部',tasks=activityActiveSubtasks();
  sel.innerHTML='<option value="全部">全部子任務</option>'+tasks.map(t=>{const p=activityGoalPathText(t).split(' → ').slice(-2,-1)[0]||'';return `<option value="${esc(String(t.id))}">${esc(t.name)}${p?' · '+esc(p):''}</option>`}).join('');
  sel.value=tasks.some(t=>String(t.id)===String(before))?before:'全部';
}
function activityGoalLinkFor(a){
  const selected=activitySelectedSubtask();if(selected){const affinity=activityGoalAffinity(a,selected);return affinity.score>=20?{subtask:selected,affinity}:null}
  let best=null;activityActiveSubtasks().forEach(t=>{const affinity=activityGoalAffinity(a,t);if(!best||affinity.score>best.affinity.score)best={subtask:t,affinity}});return best&&best.affinity.score>=20?best:null;
}
function activityMatchesGoalFilter(a){const s=activitySelectedSubtask();return !s||activityGoalAffinity(a,s).score>=20}
function activityRenderGoalContext(){
  const box=document.getElementById('activityGoalContext');if(!box)return;const s=activitySelectedSubtask();if(!s){box.style.display='none';box.innerHTML='';return}
  const count=activityStore().filter(a=>activityIsEligibleBaseV968(a)&&activityMatchesGoalFilter(a)).length;box.style.display='flex';box.innerHTML=`<div><small>🎯 目前活動目標</small><b>${esc(s.name)}</b><span>${esc(activityGoalPathText(s))}</span><em>${count?`目前約 ${count} 項活動符合此子任務`:'目前沒有達到關聯門檻的活動'}；Level 4 具體實現方式只作適配參考，不作為篩選層級。</em></div><button class="btn" type="button" onclick="activityOpenGoal('${String(s.id)}')">查看目標</button>`;
}
function activityOpenGoal(taskId){
  const t=typeof getTask==='function'?getTask(taskId):null,sub=activitySubtaskForTask(t)||t;if(!sub){toast('找不到對應子任務');return}
  try{const chain=ancestors(sub.id);chain.forEach(x=>{if(Number(x.level)<4)storeSet('o'+x.id,'1')});const q=document.getElementById('q'),sf=document.getElementById('sf'),lf=document.getElementById('lf');if(q)q.value='';if(sf)sf.value='all';if(lf)lf.value='all';selected=sub.id;goalPath={long:chain.find(x=>x.level===1)?.id||null,mid:chain.find(x=>x.level===2)?.id||null,short:sub.id,exec:null};go('goals');renderTree();setTimeout(()=>{document.getElementById('task-'+sub.id)?.scrollIntoView({behavior:'smooth',block:'center'});if(typeof openGoalInfoModal==='function')openGoalInfoModal(sub.id)},100)}catch(e){console.error(e);toast('目標定位失敗')}
}
function activityOpenFromGoal(taskId){
  const t=typeof getTask==='function'?getTask(taskId):null,sub=activitySubtaskForTask(t);if(!sub){toast('活動雷達只以子任務層級篩選');return}
  go('activity');activityEnsureGoalFilter();const sel=document.getElementById('activityGoalFilter');if(sel)sel.value=String(sub.id);activityPage=1;renderActivities();setTimeout(()=>document.getElementById('activityGoalContext')?.scrollIntoView({behavior:'smooth',block:'center'}),80);toast('已依子任務「'+sub.name+'」篩選活動');
}
const activityIsEligibleBaseV968=activityIsEligible;
activityIsEligible=function(a){return activityIsEligibleBaseV968(a)&&activityMatchesGoalFilter(a)};
const activityCardHTMLBaseV968=activityCardHTML;
activityCardHTML=function(a,today){
  let html=activityCardHTMLBaseV968(a,today),link=activityGoalLinkFor(a);if(!link)return html;
  const concrete=link.affinity.concrete.length?`<div class="activity-concrete-evidence"><em>具體實現參考</em>${link.affinity.concrete.map(x=>`<span>${esc(x.name)}</span>`).join('')}</div>`:'';
  const bridge=`<div class="activity-goal-bridge-card"><button type="button" onclick="activityOpenGoal('${String(link.subtask.id)}')"><span>🎯 ${esc(link.subtask.name)}</span><b>${link.affinity.score}%</b></button><small>${esc(activityGoalPathText(link.subtask))}</small>${concrete}</div>`;
  html=html.replace('<details class="activity-reasons">',bridge+'<details class="activity-reasons">');
  html=html.replace('<ul>',`<ul><li>目標地圖：與子任務「${esc(link.subtask.name)}」關聯 ${link.affinity.score}%</li>`);
  html=html.replace('<div class="activity-actions">',`<div class="activity-actions"><button class="btn" type="button" onclick="activityOpenGoal('${String(link.subtask.id)}')">查看目標</button>`);
  return html;
};
const renderActivitiesBaseV968=renderActivities;
renderActivities=function(){activityEnsureGoalFilter();renderActivitiesBaseV968();activityRenderGoalContext()};
const activityResetFiltersBaseV968=activityResetFilters;
activityResetFilters=function(){const e=document.getElementById('activityGoalFilter');if(e)e.value='全部';activityResetFiltersBaseV968();activityRenderGoalContext()};
function installActivityGoalBridge(){
  const original=window.openGoalInfoModal;if(typeof original!=='function'||original.__v968GoalBridge)return;
  function wrapped(id,...args){const result=original.call(this,id,...args);try{const t=typeof getTask==='function'?getTask(id):null,sub=activitySubtaskForTask(t);if(sub){const body=document.getElementById('goalInfoBody');if(body&&!body.querySelector('.goal-activity-bridge')){const note=Number(t?.level)===4?`目前具體實現「${esc(t.name)}」只作活動適配參考；雷達篩選回到子任務「${esc(sub.name)}」。`:`活動雷達以此子任務作為篩選層級，並參考其 Level 4 具體實現方式。`;body.insertAdjacentHTML('beforeend',`<div class="goal-activity-bridge"><div><small>活動雷達連動</small><b>${esc(sub.name)}</b><span>${note}</span></div><button class="btn gold" type="button" onclick="activityOpenFromGoal('${String(sub.id)}')">查看相關活動 →</button></div>`)}}}catch(e){console.error(e)}return result}
  wrapped.__v968GoalBridge=true;window.openGoalInfoModal=wrapped;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(installActivityGoalBridge,0),{once:true});else setTimeout(installActivityGoalBridge,0);

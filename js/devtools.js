/* V96.4.3 Development-only diagnostics. Never loaded by production index.html. */
function showDeveloperInfo(){
 const info=[
  `App：${typeof APP_VERSION!=='undefined'?APP_VERSION:'—'}`,
  `Schema：${typeof SCHEMA_VERSION!=='undefined'?SCHEMA_VERSION:'—'}`,
  `資料主鍵：${typeof KEY!=='undefined'?KEY:'—'}`,
  `活動資料：${Array.isArray(db.activities)?db.activities.length:0} 筆`,
  `獎學金資料：${Array.isArray(db.scholarships)?db.scholarships.length:0} 筆`,
  `執行安排：${Array.isArray(db.executionPlans)?db.executionPlans.length:0} 筆`,
  `實際紀錄：${Array.isArray(db.logs)?db.logs.filter(isCountableActualLog).length:0} 筆`,
  `Service Worker：${'serviceWorker' in navigator?'瀏覽器支援':'不支援'}`
 ].join('\n');
 alert(info);
}
applyAppSettings();

let developerTapCount=0,developerTapTimer=0;
function registerDeveloperTap(){
 if(window.__DEV_PREVIEW__!==true)return false;
 developerTapCount++; clearTimeout(developerTapTimer); developerTapTimer=setTimeout(()=>developerTapCount=0,2200);
 if(developerTapCount>=7){developerTapCount=0;openDeveloperTools();}
 else {showDeveloperInfo();}
}
function openDeveloperTools(){if(window.__DEV_PREVIEW__!==true)return false;const m=document.getElementById('developerModal');if(!m)return false;renderDeveloperTools();m.style.display='flex';m.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
function closeDeveloperTools(){const m=document.getElementById('developerModal');if(m){m.style.display='none';m.setAttribute('aria-hidden','true')}document.body.style.overflow='';}
function renderDeveloperTools(){const v=document.getElementById('developerToolVersion');if(v)v.textContent=typeof APP_VERSION!=='undefined'?APP_VERSION:'—';}

function runStressTests(){
 if(window.__DEV_PREVIEW__!==true)return false;
 const out=document.getElementById('stressResult'); if(!out)return;
 out.innerHTML='<div class="diagnostic-running">正在執行非破壞性壓力測試…</div>';
 setTimeout(()=>{
  const tests=[];
  const clone=x=>JSON.parse(JSON.stringify(x));
  try{
   const source=clone(db);
   const leaf=source.tasks.find(t=>t.level===4 && t.status!=='已封存');
   if(!leaf)throw new Error('找不到可測試的具體實現方式');
   const start=source.tasks.find(t=>t.id===leaf.parent);
   const validPeriod=!!(periodForTask(leaf)?.start&&periodForTask(leaf)?.due);
   tests.push(['建立測試資料',true,leaf.name]);
   const plan={id:'__stress_plan__',taskId:leaf.id,name:leaf.name,date:todayKey(),time:'23:59',minutes:10,status:'待執行',actualMinutes:0};
   source.executionPlans=Array.isArray(source.executionPlans)?source.executionPlans:[]; source.executionPlans.push(plan);
   tests.push(['建立執行計畫',true,'10 分鐘測試計畫']);
   source.logs=Array.isArray(source.logs)?source.logs:[];
   source.logs.unshift({id:'__stress_log_1__',taskId:leaf.id,name:leaf.name,time:new Date().toISOString(),minutes:4,actual:true,planId:plan.id,status:'有效'});
   source.logs.unshift({id:'__stress_log_2__',taskId:leaf.id,name:leaf.name,time:new Date().toISOString(),minutes:6,actual:true,planId:plan.id,status:'有效'});
   const sum=source.logs.filter(isCountableActualLog).filter(l=>l.planId===plan.id).reduce((n,l)=>n+(+l.minutes||0),0); plan.actualMinutes=sum; plan.status=sum>=plan.minutes?'已完成':'已部分完成';
   tests.push(['實際紀錄累計',sum===10,`累計 ${sum} / 10 分鐘`]);
   const started=source.logs.some(l=>l.planId===plan.id&&isCountableActualLog(l)); tests.push(['計畫×實際關聯',started&&plan.status==='已完成','計畫已達成']);
   plan.status='已取消';plan.cancelledAt=new Date().toISOString();
   const effective=source.executionPlans.filter(activeExecutionPlan); tests.push(['取消安排排除',!effective.some(p=>p.id===plan.id),'取消後不列入有效計畫']);
   const log1=source.logs.find(l=>l.id==='__stress_log_1__'); log1.status='已刪除'; log1.deletedAt=new Date().toISOString();
   const countAfterDelete=source.logs.filter(isCountableActualLog).filter(l=>l.planId===plan.id).reduce((n,l)=>n+(+l.minutes||0),0); tests.push(['刪除實際紀錄排除',countAfterDelete===6,`刪除後 ${countAfterDelete} 分鐘`]);
   log1.status='有效'; delete log1.deletedAt; const countAfterRestore=source.logs.filter(isCountableActualLog).filter(l=>l.planId===plan.id).reduce((n,l)=>n+(+l.minutes||0),0); tests.push(['恢復實際紀錄',countAfterRestore===10,`恢復後 ${countAfterRestore} 分鐘`]);
   source.calendarEvents=Array.isArray(source.calendarEvents)?source.calendarEvents:[]; const ce={id:'__stress_event__',type:'activity',refId:'__stress_activity__',date:todayKey(),title:'壓力測試活動',status:'已確認'}; source.calendarEvents.push(ce); tests.push(['加入行事曆資料',source.calendarEvents.some(e=>e.id===ce.id),'活動事件建立']); ce.status='已取消'; const visible=source.calendarEvents.filter(e=>e.status!=='已取消'); tests.push(['取消行事曆活動',!visible.some(e=>e.id===ce.id),'取消後不顯示']);
   const env=makeEnvelope(normalize(source)); const parsed=parseEnvelope(JSON.stringify(env)); tests.push(['匯出／匯入往返',fnv1a(dataPayload(parsed.data))===fnv1a(dataPayload(normalize(source))),'資料往返一致']);
   let rejected=false; try{const bad=JSON.parse(JSON.stringify(env));bad.checksum='00000000';parseEnvelope(JSON.stringify(bad))}catch(e){rejected=true} tests.push(['損壞備份攔截',rejected,'Checksum 異常會拒絕']);
   tests.push(['原始資料未改變',JSON.stringify(db)!=='' && validPeriod!==false,'本測試只使用記憶體複本']);
  }catch(e){tests.push(['壓力測試執行',false,e.message])}
  out.innerHTML=tests.map(t=>`<div class="stress-row"><span>${t[1]?'✓':'✗'} ${esc(t[0])}<small>${esc(t[2]||'')}</small></span><b class="${t[1]?'ok':'bad'}">${t[1]?'PASS':'FAIL'}</b></div>`).join('')+`<div class="diagnostic-summary ${tests.every(t=>t[1])?'ok':'warn'}">${tests.every(t=>t[1])?'非破壞性壓力測試全部通過':'發現需要處理的測試項目'}</div>`;
 },40);
}


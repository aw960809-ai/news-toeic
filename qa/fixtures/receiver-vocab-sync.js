/* THU Goal Manager - GitHub same-origin TOEIC sync */
(function(){
  "use strict";
  const VERSION="98.0.1-github";
  const HUB_KEY="GoalManagerToeicEventHubV2";
  const PROCESSED_KEY="GoalManagerToeicSync::processed";
  const STATUS_KEY="GoalManagerToeicSync::status";
  const ROUND_PREFIX="toeicVocabGoalRoundV1:";
  const RECEIPT_PREFIX="GoalManagerToeicVocabReceiptV1:";
  const VOCAB_TARGET_KEY="GoalManagerToeicSync::vocabularyTargetV1";
  const state={running:false,last:null,error:"",again:false};
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const load=(k,f)=>{try{const x=JSON.parse(localStorage.getItem(k)||"");return x??f}catch(_){return f}};
  const saveLocal=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(_){return false}};
  const getProcessed=()=>{const raw=localStorage.getItem(PROCESSED_KEY),x=raw?JSON.parse(raw):[];if(!Array.isArray(x))throw Error("同步去重紀錄格式異常，未覆寫原資料");return x.map(String)};
  const saveProcessed=a=>saveLocal(PROCESSED_KEY,[...new Set(a.map(String))]);
  const eventDate=e=>String(e?.endedAt||e?.startedAt||"").slice(0,10);
  function activeTask(id,date){try{const t=typeof getTask==="function"?getTask(id):null;if(!t||t.level!==4||t.status==="已封存")return null;const p=typeof periodForTask==="function"?periodForTask(t):null;if(!p?.start||!p?.due||date<p.start||date>p.due)return null;return t}catch(_){return null}}
  function split(total,pairs){total=Math.max(1,Math.round(Number(total)||1));const usable=pairs.filter(x=>x.task&&x.weight>0);if(!usable.length)return[];if(total<usable.length)return[{task:usable[0].task,minutes:total}];let left=total;return usable.map((x,i)=>{let minutes=i===usable.length-1?left:Math.max(1,Math.floor(total*x.weight));minutes=Math.min(minutes,left-(usable.length-i-1));left-=minutes;return{task:x.task,minutes}}).filter(x=>x.minutes>0)}
  function allocationsFor(e){const date=eventDate(e),mins=Math.max(1,Math.round(Number(e?.durationMinutes)||1));if(!date)return[];const v=activeTask("g3-1-1-1",date),g=activeTask("g3-1-1-2",date);if(v||g)return split(mins,[{task:v,weight:.55},{task:g,weight:.45}]);const p56=activeTask("g3-2-2-1",date),p7=activeTask("g3-2-2-2",date);if(p56||p7)return split(mins,[{task:p56,weight:.25},{task:p7,weight:.75}]);const keep=activeTask("g3-3-1-1",date),err=activeTask("g3-3-1-2",date);if(keep||err)return split(mins,[{task:keep,weight:.6},{task:err,weight:.4}]);const timed=activeTask("g3-4-1-2",date);if(timed)return[{task:timed,minutes:mins}];const speed=activeTask("g3-5-1-2",date);if(speed)return[{task:speed,minutes:mins}];return[]}
  function pairExists(eventId,taskId){try{return Array.isArray(db?.logs)&&db.logs.some(l=>String(l?.sourceEventId||"")===String(eventId)&&String(l?.taskId||"")===String(taskId))}catch(_){return false}}
  function makeLog(e,a,index){return{id:`toeic-sync-${String(e.eventId).replace(/[^a-zA-Z0-9_-]/g,"-")}-${a.task.id}-${index}`,taskId:a.task.id,name:a.task.name,time:e.endedAt||e.startedAt||new Date().toISOString(),minutes:a.minutes,actual:true,planId:null,source:"news-toeic-github",sourceEventId:e.eventId,sourceArticleId:e.articleId||"",sourceArticleTitle:e.articleTitle||"",sourceAccuracy:Number(e.accuracy||0),sourceReadingWpm:Number(e.readingWpm||0),sourceQuestions:Number(e.questionsAnswered||0),sourceCorrect:Number(e.correctAnswers||0),sourceWrongSkills:Array.isArray(e.wrongSkills)?e.wrongSkills.slice(0,12):[]}}
  function underToeic(t){
    let guard=0;
    while(t&&guard++<10){if(t.status==="已封存")return false;if(t.id==="g3")return true;t=getTask(t.parent)}
    return false;
  }
  function vocabularyTask(date){
    const preferred=localStorage.getItem(VOCAB_TARGET_KEY)||"auto";
    if(preferred!=="auto"){const t=activeTask(preferred,date);return t&&underToeic(t)?t:null}
    const ids=["g3-1-1-1","g3-3-1-1",...db.tasks.filter(t=>t.level===4&&/字彙|單字|詞彙|vocab/i.test(t.name||"")).map(t=>t.id)];
    for(const id of new Set(ids)){const t=activeTask(id,date);if(t&&underToeic(t))return t}
    return null;
  }
  function vocabDays(e){
    if(e.source!=="news-toeic"||!String(e.eventId).startsWith("toeic-vocab-")||!Number.isInteger(e.questionsAnswered)||e.questionsAnswered<1||!Number.isInteger(e.correctAnswers)||e.correctAnswers<0||e.correctAnswers>e.questionsAnswered)throw Error("單字同步紀錄欄位異常");
    if(!Array.isArray(e.dailyDurations)||!e.dailyDurations.length)throw Error("單字紀錄缺少實際計時，未補造時間");
    const seen=new Set(),days=e.dailyDurations;
    for(const d of days){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||new Date(d.date+"T12:00:00Z").toISOString().slice(0,10)!==d.date||seen.has(d.date)||!Number.isFinite(d.durationSeconds)||d.durationSeconds<=0||d.durationSeconds>86400)throw Error("單字分日計時資料異常");
      seen.add(d.date);
    }
    const seconds=days.reduce((n,d)=>n+d.durationSeconds,0);
    if(!Number.isFinite(e.durationSeconds)||Math.abs(seconds-e.durationSeconds)>.02)throw Error("單字總時間與分日時間不一致");
    return days;
  }
  function vocabularyLog(e,d,task){
    const minutes=Math.round(d.durationSeconds/60*10000)/10000;
    return {...makeLog(e,{task,minutes},d.date),time:d.lastStudiedAt||d.date+"T12:00:00",sourceTimePrecision:d.lastStudiedAt?"timestamp":"date",sourceActivity:e.activity,sourceDate:d.date,
      sourceDurationSeconds:d.durationSeconds,sourceRoundDurationSeconds:e.durationSeconds,sourceRoundQuestions:e.questionsAnswered,sourceRoundCorrect:e.correctAnswers,
      sourceQuestions:Number(d.questionsAnswered)||0,sourceCorrect:Number(d.correctAnswers)||0,sourceEndedAt:e.endedAt,
      sourceAllocationKey:`${e.eventId}::${d.date}`};
  }
  function collectedEvents(){
    const raw=localStorage.getItem(HUB_KEY),hub=raw?JSON.parse(raw):{events:[]};
    if(!hub||!Array.isArray(hub.events))throw Error("原 Goal Sync 中心格式異常，請先匯出備份");
    const byId=new Map(hub.events.filter(e=>e?.eventId).map(e=>[String(e.eventId),e]));let invalid=0;
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(!key?.startsWith(ROUND_PREFIX))continue;
      try{const row=JSON.parse(localStorage.getItem(key));if(row?.schemaVersion===1&&row.event)byId.set(String(row.event.eventId),row.event)}catch{invalid++}
    }
    return {events:[...byId.values()],invalid};
  }
  function refreshPersistedDb(){
    if(typeof storeGet!=="function"||typeof tryReadCandidate!=="function"||typeof KEY==="undefined")return;
    const raw=storeGet(KEY);if(!raw)throw Error("目標管理資料尚未保存");
    const fresh=tryReadCandidate(raw,"toeic-sync");if(!fresh)throw Error("目標管理資料無法驗證，未執行同步");
    db=fresh;
  }
  function syncOnce(){
    refreshPersistedDb();
    if(!Array.isArray(db?.logs)||!Array.isArray(db?.tasks))throw Error("目標管理資料尚未載入");
    const {events,invalid:broken}=collectedEvents(),done=new Set(getProcessed()),beforeLogs=db.logs.slice(),beforeTasks=JSON.parse(JSON.stringify(db.tasks)),receipts=[];
    let imported=0,minutes=0,deferred=0,duplicate=0,invalid=broken,changed=false;
    try{
      for(const e of events){
        const id=String(e?.eventId||"");if(!id){invalid++;continue}
        if(e.activity==="toeic-vocabulary-training"){
          let days;try{days=vocabDays(e)}catch{invalid++;continue}
          let seconds=0,wrote=0,pending=0;const targets=new Set();
          for(const d of days){
            const marker=`vocab-day:${id}:${d.date}`;
            const existing=db.logs.find(l=>String(l.sourceEventId||"")===id&&(l.sourceDate===d.date||l.sourceAllocationKey===`${id}::${d.date}`));
            if(done.has(id)||done.has(marker)||existing){seconds+=d.durationSeconds;done.add(marker);if(existing?.name)targets.add(existing.name);continue}
            const task=vocabularyTask(d.date);
            if(!task){pending++;continue}
            const log=vocabularyLog(e,d,task);
            if(log.minutes<=0){pending++;continue}
            db.logs.unshift(log);changed=true;done.add(marker);seconds+=d.durationSeconds;wrote+=log.minutes;targets.add(task.name);
          }
          if(pending)deferred++;else done.add(id);
          if(wrote>0){imported++;minutes+=wrote}else if(!pending)duplicate++;
          const previous=load(RECEIPT_PREFIX+id,{});
          receipts.push({key:RECEIPT_PREFIX+id,value:{eventId:id,at:new Date().toISOString(),status:pending?(seconds>0?"partial":"deferred"):"counted",seconds:Math.round(seconds*1000)/1000,targets:targets.size?[...targets]:(previous.targets||[]),pendingDays:pending}});
          continue;
        }
        if(done.has(id)){duplicate++;continue}
        const allocations=allocationsFor(e);if(!allocations.length){deferred++;continue}
        let wrote=0;
        allocations.forEach((a,i)=>{if(!a?.task||a.minutes<=0||pairExists(id,a.task.id))return;db.logs.unshift(makeLog(e,a,i));changed=true;wrote+=a.minutes});
        done.add(id);if(wrote){imported++;minutes+=wrote}else duplicate++;
      }
      if(changed){
        if(typeof recalcAllStatuses==="function")recalcAllStatuses();
        if(typeof window.save!=="function"||!window.save({backup:false}))throw Error("Goal Manager 儲存失敗，尚未確認匯入；保留待傳紀錄");
      }
    }catch(e){db.logs=beforeLogs;db.tasks=beforeTasks;throw e}
    // Acknowledgements follow durable goal logs, never precede them.
    if(!saveProcessed([...done]))throw Error("投入紀錄已保存，但去重標記寫入失敗；請先備份並釋出空間");
    let receiptErrors=0;for(const r of receipts)if(!saveLocal(r.key,r.value))receiptErrors++;
    if(changed&&typeof renderAll==="function")renderAll();
    const total=Math.round(minutes*10000)/10000;
    return {at:new Date().toISOString(),imported,minutes:total,deferred,duplicate,invalid,receiptErrors,available:events.length,
      message:`GitHub 直連：本次新增 ${imported} 筆／${Number(total.toFixed(2))} 分鐘${deferred?`；${deferred} 筆沒有期間內的對應行動，保留待處理`:""}${invalid?`；${invalid} 筆格式異常，未修改`:""}${receiptErrors?"；部分狀態回條尚未保存":""}`};
  }
  async function sync(options={}){
    const silent=options.silent===true;
    if(state.running){state.again=true;return state.last}
    state.running=true;state.error="";
    try{
      const summary=typeof navigator!=="undefined"&&navigator.locks?.request?await navigator.locks.request("goal-manager-toeic-sync-writer",syncOnce):syncOnce();
      state.last=summary;saveLocal(STATUS_KEY,summary);if(!silent&&typeof toast==="function")toast(summary.message);inject();return summary;
    }catch(e){state.error=String(e?.message||e);saveLocal(STATUS_KEY,{at:new Date().toISOString(),error:state.error});if(!silent&&typeof toast==="function")toast("TOEIC 同步失敗："+state.error);inject();return null}
    finally{state.running=false;if(state.again){state.again=false;setTimeout(()=>sync({silent:true}),50)}}
  }
  function vocabSettingsHTML(){
    const selected=localStorage.getItem(VOCAB_TARGET_KEY)||"auto";
    const tasks=Array.isArray(db?.tasks)?db.tasks.filter(t=>t.level===4&&underToeic(t)&&!/^g3-6/.test(t.id)):[];
    const options=[`<option value="auto" ${selected==="auto"?"selected":""}>自動：期間內的字彙行動</option>`,...tasks.map(t=>{const p=periodForTask(t)||{};return `<option value="${esc(t.id)}" ${selected===t.id?"selected":""}>${esc(t.name)}（${esc(p.start)}～${esc(p.due)}）</option>`})];
    if(selected!=="auto"&&!tasks.some(t=>t.id===selected))options.push(`<option value="${esc(selected)}" selected>原指定行動目前不可用；尚未變更設定</option>`);
    return `<p>單字同步 v2.6.2：按實際練習日期與秒數計入，不分攤給文法；期間外不計入。</p><label>單字訓練計入 <select id="gmVocabSyncTarget" style="max-width:100%;width:100%">${options.join("")}</select></label>`;
  }

  function panelHTML(){const s=load(STATUS_KEY,null)||state.last||{},status=s?.error?`同步異常：${s.error}`:s?.message||"尚無同步紀錄";return`<section id="gmToeicGoalSync" class="gm-toeic-sync"><div class="gm-toeic-head"><div><h3>News × TOEIC GitHub 直連</h3><p>同一 GitHub Pages 網域直接同步，不再使用 AppDeploy iframe。</p></div><span class="ok">已啟用</span></div>${vocabSettingsHTML()}<div class="gm-toeic-actions"><button type="button" class="btn gold" onclick="window.GoalManagerToeicSync.sync()">立即同步</button></div><div class="gm-toeic-status">${esc(status)}</div></section>`}
  function styles(){if(document.getElementById("gmToeicGoalSyncStyle"))return;const s=document.createElement("style");s.id="gmToeicGoalSyncStyle";s.textContent='.gm-toeic-sync{margin-top:16px;padding:16px;border:1px solid #dce5e1;border-radius:18px;background:#fff}.gm-toeic-head{display:flex;justify-content:space-between;gap:12px}.gm-toeic-head h3{margin:0;color:#075c42}.gm-toeic-head p{margin:5px 0 0;color:#77827e;font-size:13px}.gm-toeic-head .ok{color:#08764f;font-weight:800}.gm-toeic-actions{margin-top:10px}.gm-toeic-status{margin-top:11px;padding:9px 11px;border-radius:12px;background:#f6f9f8;color:#29473e;font-size:12px}';document.head.appendChild(s)}
  function inject(){styles();const host=document.getElementById("settingsBody");if(!host)return;document.getElementById("gmToeicGoalSync")?.remove();host.insertAdjacentHTML("beforeend",panelHTML());const select=document.getElementById("gmVocabSyncTarget");if(select)select.onchange=()=>{try{localStorage.setItem(VOCAB_TARGET_KEY,select.value);sync()}catch{if(typeof toast==="function")toast("設定無法保存，請先匯出備份")}}}
  function hook(){if(typeof window.renderSettings!=="function"||window.renderSettings.__gmToeicSyncGithub)return;const original=window.renderSettings,wrapped=function(){const r=original.apply(this,arguments);setTimeout(inject,0);return r};wrapped.__gmToeicSyncGithub=true;window.renderSettings=wrapped}
  function boot(){styles();hook();inject();sync({silent:true});window.addEventListener("storage",e=>{if(e.key===HUB_KEY||e.key?.startsWith(ROUND_PREFIX))sync({silent:true})});document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")sync({silent:true})});setInterval(()=>sync({silent:true}),10*60*1000)}
  window.GoalManagerToeicSync=Object.freeze({version:VERSION,sync,allocationsFor,vocabularyTask,vocabDays,syncOnce,status:()=>({last:load(STATUS_KEY,null),running:state.running})});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();

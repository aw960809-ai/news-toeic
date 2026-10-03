/* News × TOEIC v2.8.2 review-time bridge to integrated Goal Manager. */
(() => {
  'use strict';

  if(window.ToeicIntegratedGoalRuntimeV282)return;
  const POLICY=window.ToeicIntegratedGoalPolicyV282;
  if(!POLICY)throw new Error('ToeicIntegratedGoalPolicyV282 is required');

  const VERSION='2.8.2';
  const TIMER_KEY='toeicIntegratedReviewTimerV282';
  const EVENTS_KEY='toeicIntegratedReviewEventsV282';
  const TAB_KEY='toeicReviewWorkbenchTabV1';
  const previousReviewPage=window.reviewPage;
  const previousBind=window.bind;

  const read=(key,fallback=null)=>{
    try{
      const raw=localStorage.getItem(key);
      return raw===null?fallback:JSON.parse(raw);
    }catch(_){return fallback}
  };
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));

  function timerState(){return read(TIMER_KEY,null)}
  function elapsedSeconds(){
    const state=timerState();
    const started=new Date(state?.startedAt||'').getTime();
    return Number.isFinite(started)?Math.max(0,(Date.now()-started)/1000):0;
  }

  function panel(){
    const state=timerState();
    if(state){
      const mins=Math.max(1,Math.round(elapsedSeconds()/60));
      return `<section class="card v282-review-timer">
        <div><strong>錯題複習計時中</strong>
        <p class="muted">約 ${mins} 分鐘。日常手機任務建議在 20 分鐘內結束；實際時間會完整記錄。</p></div>
        <button id="finishIntegratedReviewV282" class="primary">結束並計入目標</button>
      </section>`;
    }
    return `<section class="card v282-review-timer">
      <div><strong>短時間複習</strong>
      <p class="muted">需要做錯題時再開始計時；建議 5–20 分鐘，不另外製造一堂長課。</p></div>
      <button id="startIntegratedReviewV282" class="secondary">開始複習計時</button>
    </section>`;
  }

  function inject(html){
    if(typeof html!=='string'||html.includes('v282-review-timer'))return html;
    const tabs=/<div class="study-tabs">[\s\S]*?<\/div>/;
    return tabs.test(html)?html.replace(tabs,m=>m+panel()):panel()+html;
  }

  window.reviewPage=function(){
    const html=typeof previousReviewPage==='function'?previousReviewPage():'';
    const tab=localStorage.getItem(TAB_KEY)||'mistakes';
    return tab==='mistakes'?inject(html):html;
  };

  function start(){
    if(timerState()?.startedAt){
      try{toast('複習計時已在進行')}catch(_){}
      return;
    }
    write(TIMER_KEY,{startedAt:new Date().toISOString()});
    try{toast('已開始錯題複習計時')}catch(_){}
    try{render()}catch(_){}
  }

  function finish(){
    const state=timerState();
    if(!state?.startedAt)return;
    const endedAt=new Date().toISOString(),seconds=elapsedSeconds();
    localStorage.removeItem(TIMER_KEY);

    if(seconds>0){
      const event=POLICY.makeReviewEvent({startedAt:state.startedAt,endedAt,durationSeconds:seconds});
      if(typeof publishGoalEvent==='function')publishGoalEvent(event);

      const rows=read(EVENTS_KEY,[]);
      if(Array.isArray(rows)){
        rows.push({
          id:event.eventId,date:dayKey(),
          startedAt:state.startedAt,endedAt,
          durationSeconds:Math.round(seconds*1000)/1000
        });
        write(EVENTS_KEY,rows.slice(-300));
      }
      try{toast(`複習完成 · ${Number((seconds/60).toFixed(1))} 分鐘已送往 Goal Sync`)}catch(_){}
    }
    try{render()}catch(_){}
  }

  window.bind=function(){
    if(typeof previousBind==='function')previousBind();
    document.querySelector('#startIntegratedReviewV282')?.addEventListener('click',start);
    document.querySelector('#finishIntegratedReviewV282')?.addEventListener('click',finish);
  };

  window.ToeicIntegratedGoalRuntimeV282=Object.freeze({
    version:VERSION,keys:{TIMER_KEY,EVENTS_KEY,TAB_KEY},
    timerState,elapsedSeconds,start,finish
  });
})();

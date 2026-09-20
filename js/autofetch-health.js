/* Goal Manager V96.3.8 — AutoFetch Health Monitor
   Additive, read-only runtime monitor. It reads public catalog metadata only. */
(function(){
  "use strict";

  const VERSION="96.8.2.3";
  const STALE_HOURS=36;
  const state={
    checkedAt:"",
    activities:null,
    scholarships:null,
    overall:"unknown",
    error:""
  };

  function autofetchHealthEsc(v){
    return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function n(v,fallback=0){
    const x=Number(v);
    return Number.isFinite(x)?x:fallback;
  }
  function first(...xs){
    for(const x of xs) if(x!==undefined&&x!==null&&x!=="") return x;
    return null;
  }
  function rowsOf(payload){
    if(Array.isArray(payload)) return payload;
    if(!payload||typeof payload!=="object") return [];
    for(const k of ["events","items","activities","scholarships"]){
      if(Array.isArray(payload[k])) return payload[k];
    }
    return [];
  }
  function metaOf(payload){
    return payload&&typeof payload==="object"&&!Array.isArray(payload)
      ? (payload.meta&&typeof payload.meta==="object"?payload.meta:{})
      : {};
  }
  function parseTime(v){
    if(!v)return null;
    const d=new Date(v);
    return Number.isNaN(d.getTime())?null:d;
  }
  function ageHours(v){
    const d=parseTime(v);
    return d?Math.max(0,(Date.now()-d.getTime())/36e5):null;
  }
  function fmtTime(v){
    const d=parseTime(v);
    if(!d)return "未提供";
    try{return d.toLocaleString("zh-TW",{hour12:false})}catch(_){return d.toISOString()}
  }
  function healthLabel(ok,stale){
    if(!ok)return {text:"異常",cls:"bad"};
    if(stale)return {text:"需要注意",cls:"warn"};
    return {text:"正常",cls:"ok"};
  }
  function activityInfo(payload){
    const meta=metaOf(payload),summary=meta.summary||{},quality=meta.quality||{};
    const updated=first(meta.updatedAt,payload?.updatedAt,summary.updatedAt);
    const explicitTotal=first(meta.totalSources,summary.totalSources);
    const explicitHealthy=first(meta.healthySources,summary.healthySources);
    const explicitFailed=first(meta.failedSources,summary.failedSources);
    const legacyHealthy=first(meta.sources,summary.sources);
    const total=explicitTotal!==null?n(explicitTotal,0):n(legacyHealthy,0);
    const healthy=explicitHealthy!==null?n(explicitHealthy,0):n(legacyHealthy,0);
    const failed=explicitFailed!==null?n(explicitFailed,0):Math.max(0,total-healthy);
    const prunedRaw=first(meta.skippedPast,summary.skippedPast,meta.expiredPruned,summary.expiredPruned,quality.expiredPruned);
    const pruned=prunedRaw===null?null:n(prunedRaw,0);
    const retained=n(first(meta.retainedOnFailure,summary.retainedOnFailure,meta.preservedOnFailure),0);
    const count=rowsOf(payload).length;
    const age=ageHours(updated),stale=age!==null&&age>STALE_HOURS;
    const warning=failed>0;
    const ok=total>0 ? healthy>0 : count>=0;
    return {kind:"activity",updated,sources:total,healthy,failed,pruned,retained,count,age,stale,warning,ok};
  }
  function scholarshipInfo(payload){
    const meta=metaOf(payload),summary=meta.summary||{};
    const updated=first(meta.updatedAt,payload?.updatedAt,summary.updatedAt);
    const healthy=n(first(meta.healthyCategories,summary.healthyCategories,meta.ok,summary.ok),0);
    const failed=n(first(meta.failedCategories,summary.failedCategories,meta.failed,summary.failed),0);
    const sources=n(first(meta.categories,summary.categories),healthy+failed);
    const activeAuto=n(first(meta.activeAuto,summary.activeAuto),rowsOf(payload).filter(x=>x?.auto).length);
    const retained=n(first(meta.preservedFailedAuto,summary.preservedFailedAuto,meta.retainedOnFailure),0);
    const lifecycle=window.GoalManagerScholarshipLifecycle?.status?.()||{};
    const pruned=n(first(meta.retiredThisRun,summary.retiredThisRun),n(lifecycle.expired,0)+n(lifecycle.undated,0)+n(lifecycle.disabled,0));
    const duplicates=n(lifecycle.duplicates,0);
    const count=rowsOf(payload).length;
    const age=ageHours(updated),stale=age!==null&&age>STALE_HOURS;
    const ok=count>=0 && !(sources>0&&healthy===0);
    return {kind:"scholarship",updated,sources,healthy,failed,activeAuto,retained,pruned,duplicates,count,age,stale,ok};
  }
  async function getJson(url){
    const join=url.includes("?")?"&":"?";
    const r=await fetch(url+join+"ts="+Date.now(),{cache:"no-store"});
    if(!r.ok)throw new Error(`${url} HTTP ${r.status}`);
    return r.json();
  }
  async function refresh(){
    state.checkedAt=new Date().toISOString();
    state.error="";
    const activityUrl=window.AppConfig?.data?.activities||"./data/activities.json";
    const scholarshipUrl=window.AppConfig?.data?.scholarships||"./data/scholarships.json";
    const [a,s]=await Promise.allSettled([getJson(activityUrl),getJson(scholarshipUrl)]);
    state.activities=a.status==="fulfilled"?activityInfo(a.value):{ok:false,error:String(a.reason||"activities")};
    state.scholarships=s.status==="fulfilled"?scholarshipInfo(s.value):{ok:false,error:String(s.reason||"scholarships")};
    const both=state.activities.ok&&state.scholarships.ok;
    const stale=!!state.activities.stale||!!state.scholarships.stale;
    state.overall=both?(stale?"warning":"healthy"):"error";
    if(!both)state.error=[state.activities.error,state.scholarships.error].filter(Boolean).join("；");
    renderEverywhere();
    return snapshot();
  }
  function snapshot(){
    return JSON.parse(JSON.stringify(state));
  }
  function card(title,info,extra){
    if(!info||info.error){
      return `<div class="gm-health-card"><div class="gm-health-head"><b>${autofetchHealthEsc(title)}</b><span class="gm-health-pill bad">無法讀取</span></div><div class="gm-health-muted">${autofetchHealthEsc(info?.error||"尚未檢查")}</div></div>`;
    }
    const badge=healthLabel(info.ok,info.stale||info.warning);
    return `<div class="gm-health-card">
      <div class="gm-health-head"><b>${autofetchHealthEsc(title)}</b><span class="gm-health-pill ${badge.cls}">${badge.text}</span></div>
      <div class="gm-health-grid">
        <span>最後更新<b>${autofetchHealthEsc(fmtTime(info.updated))}</b></span>
        <span>資料筆數<b>${info.count}</b></span>
        <span>來源健康<b>${info.healthy}/${info.sources||info.healthy+info.failed||0}</b></span>
        <span>來源失敗<b>${info.failed}</b></span>
        ${extra(info)}
      </div>
      ${info.retained?`<div class="gm-health-note">來源失敗時已保留 ${info.retained} 筆上一輪可信資料。</div>`:""}
      ${info.stale?`<div class="gm-health-note warn">超過 ${STALE_HOURS} 小時未更新，請檢查排程或網路。</div>`:""}
    </div>`;
  }
  function panelHTML(){
    const overall=state.overall==="healthy"
      ?{t:"系統正常",c:"ok"}
      :state.overall==="warning"
        ?{t:"資料可能過舊",c:"warn"}
        :state.overall==="error"
          ?{t:"需要檢查",c:"bad"}
          :{t:"尚未檢查",c:"muted"};
    return `<section class="settings-section gm-health-section" id="gmAutoFetchHealth">
      <div class="settings-section-head">
        <div><h3>自動資料健康監測</h3><p>活動雷達與獎學金｜只讀狀態，不會修改個人資料</p></div>
        <span class="gm-health-pill ${overall.c}">${overall.t}</span>
      </div>
      <div class="gm-health-stack">
        ${card("活動雷達",state.activities,info=>`
          <span>本輪汰除<b>${info.pruned===null?'未提供':info.pruned}</b></span>
          <span>失敗保留<b>${info.retained}</b></span>`)}
        ${card("獎學金",state.scholarships,info=>`
          <span>官方自動資料<b>${info.activeAuto}</b></span>
          <span>前端汰除<b>${info.pruned}</b></span>
          <span>重複合併<b>${info.duplicates}</b></span>
          <span>失敗保留<b>${info.retained}</b></span>`)}
      </div>
      <div class="gm-health-actions">
        <button class="btn" type="button" onclick="GoalManagerAutoFetchHealth.refresh()">重新讀取狀態</button>
        <span class="gm-health-muted">檢查：${autofetchHealthEsc(fmtTime(state.checkedAt))}${navigator.onLine?"":" · 目前離線，可能顯示快取"}</span>
      </div>
    </section>`;
  }
  function ensureStyles(){
    if(document.getElementById("gmHealthStyle"))return;
    const s=document.createElement("style");s.id="gmHealthStyle";
    s.textContent=`
      .gm-health-section{margin-top:16px}
      .gm-health-stack{display:grid;gap:10px}
      .gm-health-card{border:1px solid rgba(15,86,65,.16);border-radius:18px;padding:14px;background:rgba(255,255,255,.72)}
      .gm-health-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .gm-health-pill{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:800;background:#eef3f1;color:#50615b}
      .gm-health-pill.ok{background:#e8f5ef;color:#08734f}.gm-health-pill.warn{background:#fff5dc;color:#946b00}.gm-health-pill.bad{background:#fdecec;color:#a02d2d}
      .gm-health-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .gm-health-grid span{display:flex;flex-direction:column;gap:2px;padding:9px 10px;border-radius:13px;background:rgba(4,104,75,.055);font-size:12px;color:#65736f}
      .gm-health-grid b{font-size:15px;color:inherit}
      .gm-health-note{margin-top:9px;font-size:12px;color:#586862}.gm-health-note.warn{color:#946b00}
      .gm-health-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px}
      .gm-health-muted{font-size:12px;color:#7b8783}
      html.app-dark .gm-health-card{background:rgba(20,31,28,.88);border-color:#34433e}
      html.app-dark .gm-health-grid span{background:#17211e}
      @media(max-width:520px){.gm-health-grid{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(s);
  }
  function injectSettings(){
    document.getElementById('gmAutoFetchHealth')?.remove();
    if(window.GoalManagerAutoFetchStatus?.render)setTimeout(()=>window.GoalManagerAutoFetchStatus.render(),0);
  }
  function compactHTML(){
    const a=state.activities,s=state.scholarships;
    if(state.overall==="unknown")return "";
    const cls=state.overall==="healthy"?"ok":state.overall==="warning"?"warn":"bad";
    const text=state.overall==="healthy"?"自動資料正常":state.overall==="warning"?"自動資料需注意":"自動資料異常";
    return `<div id="gmAutoFetchCompact" class="gm-health-note"><span class="gm-health-pill ${cls}">${text}</span> 活動 ${a?.healthy??0}/${a?.sources??0} · 獎學金 ${s?.healthy??0}/${s?.sources??0}</div>`;
  }
  function injectCompact(){
    ensureStyles();
    const host=document.getElementById("activityAutoStatus");
    if(!host)return;
    document.getElementById("gmAutoFetchCompact")?.remove();
    host.insertAdjacentHTML("beforeend",compactHTML());
  }
  function renderEverywhere(){
    injectSettings();
    injectCompact();
  }

  const originalRenderSettings=window.renderSettings;
  if(typeof originalRenderSettings==="function"){
    window.renderSettings=function(...args){
      const out=originalRenderSettings.apply(this,args);
      setTimeout(injectSettings,0);
      return out;
    };
  }

  function autofetchHealthBoot(){
    ensureStyles();
    // V96.8.2.1: renderSettings wrapper is sufficient.
    // Do not observe settingsBody/subtree: injecting the health panel itself would
    // retrigger the observer and create an infinite render loop.
    refresh().catch(e=>{
      state.error=String(e?.message||e);state.overall="error";renderEverywhere();
    });
    window.addEventListener("online",()=>refresh().catch(()=>{}));
  }

  window.GoalManagerAutoFetchHealth=Object.freeze({
    version:VERSION,
    refresh,
    status:snapshot,
    render:renderEverywhere
  });

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",autofetchHealthBoot,{once:true});
  else autofetchHealthBoot();
})();
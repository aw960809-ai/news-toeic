/* THU personal catalog lifecycle archive viewer */
(function(){
  "use strict";
  const CATALOG_LIFECYCLE_VERSION="97.4.0";
  const catalogLifecycleState={checkedAt:"",activity:null,scholarship:null,error:""};

  const catalogLifecycleEsc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const catalogLifecycleRows=p=>Array.isArray(p)?p:(Array.isArray(p?.archive)?p.archive:[]);
  const catalogLifecycleMeta=p=>p&&typeof p==="object"&&!Array.isArray(p)?(p.meta||{}):{};
  const catalogLifecycleTime=v=>{try{return v?new Date(v).toLocaleString("zh-TW",{hour12:false}):"未提供"}catch(_){return String(v||"未提供")}};
  const catalogLifecycleJson=async url=>{const sep=url.includes("?")?"&":"?",r=await fetch(url+sep+"ts="+Date.now(),{cache:"no-store"});if(!r.ok)throw new Error(url+" HTTP "+r.status);return r.json()};

  const catalogLifecycleNormalize=(payload,kind)=>{
    const rows=catalogLifecycleRows(payload),meta=catalogLifecycleMeta(payload);
    return {kind,rows,meta,count:rows.length,retiredTotal:Number(meta.retiredTotal||0),revivedTotal:Number(meta.revivedTotal||0),retiredThisRun:Number(meta.retiredThisRun||0),revivedThisRun:Number(meta.revivedThisRun||0),updatedAt:meta.updatedAt||""};
  };

  const catalogLifecycleSnapshot=()=>JSON.parse(JSON.stringify(catalogLifecycleState));

  async function catalogLifecycleRefresh(){
    catalogLifecycleState.checkedAt=new Date().toISOString();catalogLifecycleState.error="";
    const aUrl=window.AppConfig?.data?.activityArchive||"./data/activity-archive.json";
    const sUrl=window.AppConfig?.data?.scholarshipArchive||"./data/scholarship-archive.json";
    const [a,s]=await Promise.allSettled([catalogLifecycleJson(aUrl),catalogLifecycleJson(sUrl)]);
    catalogLifecycleState.activity=a.status==="fulfilled"?catalogLifecycleNormalize(a.value,"activity"):{kind:"activity",rows:[],meta:{},count:0,error:String(a.reason||"activity archive")};
    catalogLifecycleState.scholarship=s.status==="fulfilled"?catalogLifecycleNormalize(s.value,"scholarship"):{kind:"scholarship",rows:[],meta:{},count:0,error:String(s.reason||"scholarship archive")};
    catalogLifecycleState.error=[catalogLifecycleState.activity.error,catalogLifecycleState.scholarship.error].filter(Boolean).join("；");
    catalogLifecycleInjectSettings();
    return catalogLifecycleSnapshot();
  }

  const catalogLifecycleCombined=()=>[
    ...(catalogLifecycleState.activity?.rows||[]).map(x=>({...x,__kind:"活動"})),
    ...(catalogLifecycleState.scholarship?.rows||[]).map(x=>({...x,__kind:"獎學金"}))
  ].sort((a,b)=>String(b.retiredAt||"").localeCompare(String(a.retiredAt||"")));

  function catalogLifecyclePanelHTML(){
    const a=catalogLifecycleState.activity||{count:0,meta:{}},s=catalogLifecycleState.scholarship||{count:0,meta:{}},rows=catalogLifecycleCombined().slice(0,20);
    const total=a.count+s.count,revived=(a.revivedTotal||0)+(s.revivedTotal||0);
    const list=rows.length?rows.map(x=>`<div class="gm-life-row"><div><b><span class="gm-life-kind">${catalogLifecycleEsc(x.__kind)}</span>${catalogLifecycleEsc(x.title||"未命名")}</b><small>${catalogLifecycleEsc(x.retireReason||"已汰除")} · ${catalogLifecycleEsc(x.deadline||x.date||"無單一日期")} · ${catalogLifecycleEsc(x.source||x.organizer||"官方來源")}</small></div><time>${catalogLifecycleEsc(catalogLifecycleTime(x.retiredAt))}</time></div>`).join(""):'<div class="gm-life-empty">目前沒有被汰除的活動或獎學金。</div>';
    const err=catalogLifecycleState.error?`<div class="gm-life-warn">部分汰除資料暫時無法讀取：${catalogLifecycleEsc(catalogLifecycleState.error)}</div>`:"";
    return `<section class="settings-section gm-life-section" id="gmCatalogLifecyclePanel">
      <div class="settings-section-head"><div><h3>機會汰除歷程</h3><p>截止／失效項目不直接消失；保留來源與原因。官方來源再次出現且仍有效時會自動恢復。</p></div><span class="gm-life-pill">封存 ${total}</span></div>
      <div class="gm-life-summary"><span>活動封存<b>${a.count||0}</b></span><span>獎學金封存<b>${s.count||0}</b></span><span>累計自動恢復<b>${revived}</b></span><span>本輪恢復<b>${(a.revivedThisRun||0)+(s.revivedThisRun||0)}</b></span></div>
      ${err}<div class="gm-life-list">${list}</div>
      <div class="gm-life-actions"><button class="btn" type="button" onclick="GoalManagerCatalogLifecycle.refresh()">重新讀取汰除歷程</button><span>最後檢查：${catalogLifecycleEsc(catalogLifecycleTime(catalogLifecycleState.checkedAt))}</span></div>
    </section>`;
  }

  function catalogLifecycleEnsureStyles(){
    if(document.getElementById("gmCatalogLifecycleStyle"))return;
    const style=document.createElement("style");style.id="gmCatalogLifecycleStyle";
    style.textContent=`.gm-life-section{margin-top:16px}.gm-life-pill{display:inline-flex;padding:5px 9px;border-radius:999px;background:#eef6f2;color:#126c50;font-size:12px;font-weight:800}.gm-life-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:10px 0}.gm-life-summary span{display:flex;flex-direction:column;gap:2px;padding:9px 10px;border-radius:13px;background:rgba(4,104,75,.055);font-size:12px;color:#65736f}.gm-life-summary b{font-size:15px}.gm-life-list{display:grid;gap:7px;max-height:360px;overflow:auto}.gm-life-row{display:flex;justify-content:space-between;gap:10px;padding:10px;border:1px solid rgba(15,86,65,.12);border-radius:13px}.gm-life-row>div{min-width:0}.gm-life-row b{display:block;font-size:13px}.gm-life-row small{display:block;margin-top:4px;color:#74807c;line-height:1.45}.gm-life-row time{flex:0 0 auto;font-size:10px;color:#87918e}.gm-life-kind{margin-right:6px;padding:2px 6px;border-radius:999px;background:#f0f3f2;font-size:10px}.gm-life-empty,.gm-life-warn{padding:10px;border-radius:12px;font-size:12px;color:#697570;background:#f5f7f6}.gm-life-warn{color:#946b00;background:#fff5dc}.gm-life-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:11px;color:#7b8783}html.app-dark .gm-life-row{border-color:#34433e}html.app-dark .gm-life-summary span,html.app-dark .gm-life-empty{background:#17211e}@media(max-width:520px){.gm-life-row{display:block}.gm-life-row time{display:block;margin-top:5px}}`;
    document.head.appendChild(style);
  }

  function catalogLifecycleInjectSettings(){
    catalogLifecycleEnsureStyles();
    const body=document.getElementById("settingsBody");if(!body)return;
    document.getElementById("gmCatalogLifecyclePanel")?.remove();
    const health=document.getElementById("gmAutoFetchHealth");
    if(health)health.insertAdjacentHTML("afterend",catalogLifecyclePanelHTML());
    else body.insertAdjacentHTML("beforeend",catalogLifecyclePanelHTML());
  }

  function catalogLifecycleInstallRenderHook(){
    if(typeof window.renderSettings!=="function"||window.renderSettings.__gmCatalogLifecycleWrapped)return;
    const original=window.renderSettings;
    const wrapped=function(){const out=original.apply(this,arguments);setTimeout(catalogLifecycleInjectSettings,0);return out};
    wrapped.__gmCatalogLifecycleWrapped=true;window.renderSettings=wrapped;
  }

  function catalogLifecycleBoot(){
    catalogLifecycleEnsureStyles();catalogLifecycleInstallRenderHook();
    catalogLifecycleRefresh().catch(e=>{catalogLifecycleState.error=String(e?.message||e);catalogLifecycleInjectSettings()});
    window.addEventListener("online",()=>catalogLifecycleRefresh().catch(()=>{}));
  }

  window.GoalManagerCatalogLifecycle=Object.freeze({version:CATALOG_LIFECYCLE_VERSION,refresh:catalogLifecycleRefresh,status:catalogLifecycleSnapshot,render:catalogLifecycleInjectSettings});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",catalogLifecycleBoot,{once:true});else catalogLifecycleBoot();
})();

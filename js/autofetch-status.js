(function(){
  "use strict";

  const PANEL_ID="gmAutoFetchStatusPanel";
  const STYLE_ID="gmAutoFetchStatusStyle";
  const REFRESH_MS=5*60*1000;
  const state={activity:null,scholarship:null,lifecycle:null,checkedAt:"",error:"",timer:null};

  const esc=value=>String(value??"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");

  const num=(value,fallback=0)=>{
    const n=Number(value);
    return Number.isFinite(n)?n:fallback;
  };

  function rows(payload,key){
    if(Array.isArray(payload))return payload;
    if(Array.isArray(payload?.[key]))return payload[key];
    if(Array.isArray(payload?.events))return payload.events;
    if(Array.isArray(payload?.scholarships))return payload.scholarships;
    if(Array.isArray(payload?.items))return payload.items;
    return [];
  }

  function meta(payload){
    return payload&&typeof payload.meta==="object"&&payload.meta?payload.meta:{};
  }

  function pickNumber(obj,keys,fallback=0){
    for(const k of keys){
      if(obj&&obj[k]!==undefined&&obj[k]!==null&&obj[k]!==""){
        const n=Number(obj[k]);
        if(Number.isFinite(n))return n;
      }
    }
    return fallback;
  }

  function formatTime(value){
    if(!value)return "尚無紀錄";
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return String(value);
    return new Intl.DateTimeFormat("zh-TW",{
      timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"
    }).format(d);
  }

  function durationLabel(seconds){
    const s=Math.max(0,Math.round(Number(seconds)||0));
    if(s<60)return `${s}秒`;
    const m=Math.floor(s/60),r=s%60;
    return r?`${m}分${r}秒`:`${m}分`;
  }

  function ageLabel(value){
    if(!value)return "無更新時間";
    const t=new Date(value).getTime();
    if(!Number.isFinite(t))return "時間格式待確認";
    const ms=Date.now()-t;
    if(ms<60000)return "剛更新";
    const min=Math.floor(ms/60000);
    if(min<60)return `${min} 分鐘前`;
    const h=Math.floor(min/60);
    if(h<24)return `${h} 小時前`;
    return `${Math.floor(h/24)} 天前`;
  }

  function taipeiParts(){
    const out={};
    for(const x of new Intl.DateTimeFormat("en-CA",{
      timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",hourCycle:"h23"
    }).formatToParts(new Date())){
      if(x.type!=="literal")out[x.type]=x.value;
    }
    return {hour:+out.hour,minute:+out.minute};
  }

  function nextSchedule(){
    const p=taipeiParts(),m=p.hour*60+p.minute;
    if(m<9*60+17)return {short:"今天 09:17",detail:"主排程"};
    if(m<10*60+47)return {short:"今天 10:47",detail:"備援排程；主更新已成功時會跳過"};
    return {short:"明天 09:17",detail:"主排程"};
  }

  function sourceStats(m,kind){
    if(kind==="activity"){
      const total=pickNumber(m,["sources","sourceCount","totalSources"],0);
      const healthy=pickNumber(m,["healthySources","okSources","successSources","ok"],total);
      const failed=pickNumber(m,["failedSources","failureSources","failed"],Math.max(0,total-healthy));
      return {total,healthy,failed};
    }
    const total=pickNumber(m,["categories","sourceCount","totalSources"],0);
    const healthy=pickNumber(m,["healthyCategories","okCategories","successCategories"],total);
    const failed=pickNumber(m,["failedCategories","failureCategories","failed"],Math.max(0,total-healthy));
    return {total,healthy,failed};
  }

  function detailStats(m){
    const d=(m.eligibilityDetail&&typeof m.eligibilityDetail==="object")
      ?m.eligibilityDetail
      :(m.detailEligibility&&typeof m.detailEligibility==="object"?m.detailEligibility:{});
    return {
      candidates:pickNumber(d,["detailCandidates","candidates"],0),
      fetched:pickNumber(d,["detailFetched","fetched"],0),
      reused:pickNumber(d,["detailReused","reused"],0),
      verified:pickNumber(d,["detailVerified","verified"],0),
      unverified:pickNumber(d,["detailUnverified","unverified"],0),
      budgetExpired:pickNumber(d,["detailBudgetExpired","budgetExpired"],0),
      elapsed:pickNumber(d,["detailElapsedSeconds","elapsedSeconds"],0)
    };
  }

  function collectFailures(m){
    const out=[];
    const add=v=>{
      if(v==null||v==="")return;
      if(typeof v==="string"){out.push(v);return;}
      if(Array.isArray(v)){v.forEach(add);return;}
      if(typeof v==="object"&&(v.ok===false||v.error||v.reason)){
        const name=v.name||v.id||v.sourceId||v.category||"來源";
        out.push(`${name}：${v.error||v.reason||"失敗"}`);
      }
    };
    add(m.error);add(m.errors);add(m.failures);add(m.report);add(m.sourceReport);add(m.categoryReport);
    return [...new Set(out.map(x=>String(x).trim()).filter(Boolean))].slice(0,3);
  }

  function autoCount(list){
    return list.filter(x=>{
      const id=String(x?.id||"");
      return x?.auto===true||x?.autoCatalog===true||id.startsWith("auto-");
    }).length;
  }

  function normalize(payload,kind){
    const m=meta(payload);
    const list=rows(payload,kind==="activity"?"events":"scholarships");
    return {
      kind,count:list.length,autoCount:autoCount(list),meta:m,updatedAt:m.updatedAt||m.fetchedAt||"",
      sources:sourceStats(m,kind),failures:collectFailures(m),
      failedRetained:pickNumber(m,["retainedOnFailure","preservedFailedAuto","preserveOnFailure"],0),
      duplicates:pickNumber(m,["duplicatesMerged","duplicateMerged","semanticDuplicates"],0),
      activeAuto:pickNumber(m,["activeAuto","freshAuto"],autoCount(list)),
      detail:kind==="scholarship"?detailStats(m):null
    };
  }

  function lifecycleSnapshot(){
    try{
      if(window.GoalManagerCatalogLifecycle?.status)return window.GoalManagerCatalogLifecycle.status();
    }catch(_){}
    return null;
  }

  function lifecycleFor(kind){
    const root=state.lifecycle;
    if(!root)return null;
    return kind==="activity"?(root.activity||null):(root.scholarship||null);
  }

  async function fetchJson(url){
    const sep=url.includes("?")?"&":"?";
    const r=await fetch(url+sep+"health="+Date.now(),{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function unifiedRefresh(){
    state.checkedAt=new Date().toISOString();
    state.error="";
    const activityUrl=window.AppConfig?.data?.activities||"./data/activities.json";
    const scholarshipUrl=window.AppConfig?.data?.scholarships||"./data/scholarships.json";
    const [a,s]=await Promise.allSettled([fetchJson(activityUrl),fetchJson(scholarshipUrl)]);

    if(a.status==="fulfilled")state.activity=normalize(a.value,"activity");
    else state.error+="活動資料："+String(a.reason?.message||a.reason||"讀取失敗");

    if(s.status==="fulfilled")state.scholarship=normalize(s.value,"scholarship");
    else state.error+=(state.error?"；":"")+"獎學金資料："+String(s.reason?.message||s.reason||"讀取失敗");

    state.lifecycle=lifecycleSnapshot();
    unifiedRender();
    return snapshot();
  }

  function snapshot(){
    return JSON.parse(JSON.stringify({
      activity:state.activity,scholarship:state.scholarship,lifecycle:state.lifecycle,
      checkedAt:state.checkedAt,error:state.error
    }));
  }

  function statusInfo(item){
    if(!item)return {cls:"warn",text:"待讀取"};
    if(item.sources.failed>0)return {cls:"warn",text:"來源異常"};
    if(item.kind==="scholarship"&&item.detail?.unverified>0)return {cls:"progress",text:"來源正常｜資格補抓中"};
    return {cls:"ok",text:"正常"};
  }

  function metric(label,value){
    return `<span><small>${esc(label)}</small><b>${esc(value)}</b></span>`;
  }

  function sourceText(item){
    const s=item.sources;
    if(!s.total)return "未提供";
    return `${s.healthy}/${s.total}${s.failed?` · 失敗 ${s.failed}`:""}`;
  }

  function activityCard(item){
    if(!item)return `<div class="gm-af-card warn"><div class="gm-af-card-head"><h4>活動雷達</h4><span>待讀取</span></div></div>`;
    const st=statusInfo(item),life=lifecycleFor("activity");
    const retiredThisRun=pickNumber(life||item.meta,["retiredThisRun"],pickNumber(item.meta,["retiredThisRun"],0));
    const archivedNow=pickNumber(life||{},["count"],0);

    const secondary=[
      archivedNow>0?metric("目前封存總數",archivedNow):"",
      retiredThisRun>0?metric("本次 AutoFetch 封存",retiredThisRun):"",
      item.sources.failed>0?metric("來源失敗",item.sources.failed):"",
      item.failedRetained>0?metric("失敗保留",item.failedRetained):""
    ].filter(Boolean).join("");

    return `<div class="gm-af-card ${st.cls}">
      <div class="gm-af-card-head"><h4>活動雷達</h4><span>${esc(st.text)}</span></div>
      <div class="gm-af-grid">
        ${metric("最後更新",formatTime(item.updatedAt))}
        ${metric("資料筆數",item.count)}
        ${metric("來源健康",sourceText(item))}
        ${secondary}
      </div>
      <p class="gm-af-relative-time">${esc(ageLabel(item.updatedAt))}</p>
      ${item.failures.length?`<div class="gm-af-issue">最近問題：${esc(item.failures.join("；"))}</div>`:""}
    </div>`;
  }

  function scholarshipCard(item){
    if(!item)return `<div class="gm-af-card warn"><div class="gm-af-card-head"><h4>獎學金</h4><span>待讀取</span></div></div>`;
    const st=statusInfo(item),life=lifecycleFor("scholarship"),d=item.detail||{};
    const retiredThisRun=pickNumber(life||item.meta,["retiredThisRun"],pickNumber(item.meta,["retiredThisRun"],0));
    const archivedNow=pickNumber(life||{},["count"],0);

    const secondary=[
      archivedNow>0?metric("目前封存總數",archivedNow):"",
      retiredThisRun>0?metric("本次 AutoFetch 封存",retiredThisRun):"",
      item.sources.failed>0?metric("來源失敗",item.sources.failed):"",
      item.failedRetained>0?metric("失敗保留",item.failedRetained):"",
      item.duplicates>0?metric("重複合併",item.duplicates):""
    ].filter(Boolean).join("");

    return `<div class="gm-af-card ${st.cls}">
      <div class="gm-af-card-head"><h4>獎學金</h4><span>${esc(st.text)}</span></div>
      <div class="gm-af-grid">
        ${metric("最後更新",formatTime(item.updatedAt))}
        ${metric("資料筆數",item.count)}
        ${metric("來源健康",sourceText(item))}
        ${metric("官方自動資料",item.activeAuto)}
        ${metric("資格已驗證",d.verified||0)}
        ${metric("詳細資格待補抓",d.unverified||0)}
        ${secondary}
      </div>
      <div class="gm-af-detail">本輪詳細資格：抓取 ${d.fetched||0} · 沿用 ${d.reused||0}${d.budgetExpired?` · 逾時 ${d.budgetExpired}`:""}${d.elapsed?` · 約 ${durationLabel(d.elapsed)}`:""}</div>
      <p class="gm-af-relative-time">${esc(ageLabel(item.updatedAt))}</p>
      ${item.failures.length?`<div class="gm-af-issue">最近問題：${esc(item.failures.join("；"))}</div>`:""}
    </div>`;
  }

  function panelHtml(){
    const a=state.activity,s=state.scholarship,next=nextSchedule();
    const sourceFail=(a?.sources.failed||0)+(s?.sources.failed||0);
    const backlog=s?.detail?.unverified||0;
    let overall={cls:"ok",text:"系統正常"};
    if(state.error||sourceFail)overall={cls:"warn",text:"部分來源異常"};
    else if(backlog)overall={cls:"progress",text:"來源正常｜資格補抓中"};

    return `<section class="settings-section gm-af-section" id="${PANEL_ID}">
      <div class="settings-section-head">
        <div>
          <h3>自動資料健康監測</h3>
          <p>活動雷達與獎學金統一監測；只讀正式資料，不修改個人資料，也不手動觸發 GitHub Actions。</p>
        </div>
        <span class="gm-af-pill ${overall.cls}">${esc(overall.text)}</span>
      </div>

      <div class="gm-af-summary">
        ${metric("App",window.AppConfig?.version||"未知")}
        ${metric("下次預計排程",next.short)}
        ${metric("主排程","09:17")}
        ${metric("備援排程","10:47")}
      </div>
      <div class="gm-af-next-note">${esc(next.detail)} · Asia/Taipei</div>

      <div class="gm-af-cards">
        ${activityCard(a)}
        ${scholarshipCard(s)}
      </div>

      ${state.error?`<div class="gm-af-error">${esc(state.error)}</div>`:""}

      <div class="gm-af-actions">
        <button class="btn" type="button" onclick="GoalManagerAutoFetchStatus.refresh()">重新讀取狀態</button>
        <span>本機檢查：${esc(formatTime(state.checkedAt))}</span>
      </div>
    </section>`;
  }

  function ensureStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    style.textContent=`
      .gm-af-section{margin-top:16px}
      .gm-af-pill{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800;white-space:nowrap}
      .gm-af-pill.ok,.gm-af-card.ok .gm-af-card-head span{background:#e9f7f0;color:#126c50}
      .gm-af-pill.progress,.gm-af-card.progress .gm-af-card-head span{background:#eaf2fb;color:#315d86}
      .gm-af-pill.warn,.gm-af-card.warn .gm-af-card-head span{background:#fff1c7;color:#876200}
      .gm-af-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0 6px}
      .gm-af-summary span,.gm-af-grid span{display:flex;flex-direction:column;gap:3px;padding:10px;border-radius:13px;background:rgba(15,86,65,.055)}
      .gm-af-summary small,.gm-af-grid small{font-size:11px;color:#74807c}
      .gm-af-summary b{font-size:14px}.gm-af-grid b{font-size:13px;line-height:1.4}
      .gm-af-next-note{margin:0 0 11px;font-size:11px;color:#7b8783}
      .gm-af-cards{display:grid;gap:10px}
      .gm-af-card{padding:13px;border:1px solid rgba(15,86,65,.14);border-radius:17px}
      .gm-af-card.progress{border-color:rgba(49,93,134,.22)}
      .gm-af-card.warn{border-color:rgba(172,125,0,.28)}
      .gm-af-card-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}
      .gm-af-card-head h4{margin:0;font-size:18px}
      .gm-af-card-head span{padding:4px 8px;border-radius:999px;font-size:11px;font-weight:800}
      .gm-af-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .gm-af-card p,.gm-af-detail{margin:9px 0 0;font-size:11px;line-height:1.55;color:#6d7975}
      .gm-af-relative-time{opacity:.72}
      .gm-af-issue{margin-top:7px;font-size:11px;line-height:1.5;color:#8a6500}
      .gm-af-error{margin-top:10px;padding:9px;border-radius:12px;background:#fff4d8;color:#8a6500;font-size:11px}
      .gm-af-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:11px;font-size:11px;color:#7b8783}
      html.app-dark .gm-af-summary span,html.app-dark .gm-af-grid span{background:#17211e}
      html.app-dark .gm-af-card{border-color:#34433e}
      @media(max-width:520px){.gm-af-summary,.gm-af-grid{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function removeLegacyPanel(){
    document.getElementById("gmAutoFetchHealth")?.remove();
  }

  function reorderSettingsSections(){
    const body=document.getElementById("settingsBody");
    const panel=document.getElementById(PANEL_ID);
    if(!body||!panel)return;

    const sections=[...body.querySelectorAll(".settings-section")];
    const headingText=section=>String(section.querySelector("h2,h3")?.textContent||"").trim();
    const findSection=rx=>sections.find(section=>rx.test(headingText(section)));

    const update=findSection(/桌面應用程式與自動更新|程式更新/);
    const lifecycle=findSection(/機會汰除歷程/);
    const about=findSection(/關於系統/);

    if(update&&update!==panel){
      update.insertAdjacentElement("afterend",panel);
    }else if(lifecycle&&lifecycle!==panel){
      body.insertBefore(panel,lifecycle);
    }

    if(about&&about!==panel){
      body.appendChild(about);
    }
  }

  function unifiedRender(){
    ensureStyles();
    removeLegacyPanel();
    const body=document.getElementById("settingsBody");
    if(!body)return;
    document.getElementById(PANEL_ID)?.remove();
    const lifecycle=document.getElementById("gmCatalogLifecyclePanel");
    const html=panelHtml();
    if(lifecycle)lifecycle.insertAdjacentHTML("afterend",html);
    else body.insertAdjacentHTML("beforeend",html);
    reorderSettingsSections();
  }

  function installRenderHook(){
    if(typeof window.renderSettings!=="function"||window.renderSettings.__gmUnifiedAutoFetchWrapped)return;
    const original=window.renderSettings;
    const wrapped=function(){
      const out=original.apply(this,arguments);
      setTimeout(()=>{removeLegacyPanel();unifiedRender();},0);
      return out;
    };
    wrapped.__gmUnifiedAutoFetchWrapped=true;
    window.renderSettings=wrapped;
  }

  function boot(){
    ensureStyles();installRenderHook();
    unifiedRefresh().catch(e=>{state.error=String(e?.message||e);unifiedRender();});
    window.addEventListener("online",()=>unifiedRefresh().catch(()=>{}));
    document.addEventListener("visibilitychange",()=>{
      const checked=new Date(state.checkedAt||0).getTime();
      if(document.visibilityState==="visible"&&(!checked||Date.now()-checked>REFRESH_MS))unifiedRefresh().catch(()=>{});
    });
    state.timer=setInterval(()=>unifiedRefresh().catch(()=>{}),REFRESH_MS);
  }

  window.GoalManagerAutoFetchStatus=Object.freeze({refresh:unifiedRefresh,status:snapshot,render:unifiedRender});

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
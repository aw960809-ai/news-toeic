/* Goal Manager V96.3.7 — Personal scholarship lifecycle overlay
   Additive overlay: does not rewrite activity.js, scholarship.js or app.js. */
(function(){
  "use strict";
  const VERSION="96.3.7-modular";
  const originalStore=typeof window.scholarshipStore==="function"?window.scholarshipStore:null;
  const originalMerge=typeof window.mergeScholarshipCatalog==="function"?window.mergeScholarshipCatalog:null;
  const state={expired:0,undated:0,disabled:0,duplicates:0,lastScan:""};

  function scholarshipLifecycleDateKey(){
    try{
      if(typeof window.todayKey==="function")return window.todayKey();
    }catch(_){}
    const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }
  function isDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||""))}
  function deadlineOf(a){return String(a?.deadline||a?.date||"").trim()}
  function isReference(a){return a?.kind==="reference"||a?.reference===true}
  function lifecycle(a,today=scholarshipLifecycleDateKey()){
    if(!a||typeof a!=="object")return {keep:false,state:"invalid"};
    if(a.available===false)return {keep:false,state:"disabled"};
    if(isReference(a))return {keep:true,state:"reference"};
    const d=deadlineOf(a);
    if(isDate(d))return d<today?{keep:false,state:"expired"}:{keep:true,state:"active"};
    if(a.ongoing===true)return {keep:true,state:"ongoing"};
    return {keep:false,state:"undated"};
  }
  function titleKey(a){
    return String(a?.title||"").toLowerCase()
      .replace(/[\s　._\-()（）【】\[\]「」『』:：/／]/g,"");
  }
  function quality(a){
    let n=0;
    if(a?.auto||a?.autoCatalog||a?.sourceId)n+=8;
    if(deadlineOf(a))n+=4;
    if(a?.url||a?.sourceUrl)n+=2;
    if(a?.source)n+=1;
    return n;
  }
  function filterRows(rows){
    const today=scholarshipLifecycleDateKey(),out=[],by=new Map();
    let expired=0,undated=0,disabled=0,duplicates=0;
    (Array.isArray(rows)?rows:[]).forEach(a=>{
      const x=lifecycle(a,today);
      if(!x.keep){
        if(x.state==="expired")expired++;
        else if(x.state==="undated")undated++;
        else if(x.state==="disabled")disabled++;
        return;
      }
      const key=(titleKey(a)||String(a?.id||""))+"|"+(deadlineOf(a)||x.state);
      const prev=by.get(key);
      if(prev){
        duplicates++;
        if(quality(a)>quality(prev))by.set(key,a);
      }else by.set(key,a);
    });
    by.forEach(v=>out.push(v));
    state.expired=expired;state.undated=undated;state.disabled=disabled;state.duplicates=duplicates;
    state.lastScan=new Date().toISOString();
    return out;
  }

  if(originalMerge){
    window.mergeScholarshipCatalog=function(existing){
      return filterRows(originalMerge(existing));
    };
  }
  if(originalStore){
    window.scholarshipStore=function(){
      return filterRows(originalStore());
    };
  }

  window.GoalManagerScholarshipLifecycle=Object.freeze({
    version:VERSION,
    lifecycle,
    filterRows,
    status:()=>({...state})
  });
})();
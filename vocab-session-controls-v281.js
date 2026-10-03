(() => {
  "use strict";

  const VERSION="2.8.1";
  const LEGACY_KEY="toeicVocabQuizActiveV1";
  const NEW_KEY="toeicVocabMultiSkillActiveV2";
  const TAB_KEY="toeicReviewWorkbenchTabV1";
  const previousReviewPage=reviewPage;
  const previousBind=bind;

  function read(key,fallback=null){
    try{
      const raw=localStorage.getItem(key);
      return raw===null?fallback:JSON.parse(raw);
    }catch(e){
      console.error(e);
      return fallback;
    }
  }

  function write(key,value){
    const raw=localStorage.getItem(key);
    if(raw!==null)JSON.parse(raw);
    localStorage.setItem(key,JSON.stringify(value));
  }

  function activeKind(){
    if(read(LEGACY_KEY,null)?.set?.length)return "legacy";
    if(read(NEW_KEY,null)?.set?.length)return "new";
    return "";
  }

  function keyFor(kind){
    return kind==="legacy"?LEGACY_KEY:kind==="new"?NEW_KEY:"";
  }

  function resetQuizObject(quiz){
    if(!quiz||!Array.isArray(quiz.set)||!quiz.set.length)throw Error("沒有可重新開始的單字測驗");
    const next=JSON.parse(JSON.stringify(quiz));
    next.index=0;
    next.answers=[];
    delete next.completedAt;
    next.restartCount=(Number(next.restartCount)||0)+1;
    next.restartedAt=new Date().toISOString();
    // 保留 id、題組、timing。已實際花掉的學習時間仍是學習時間；
    // 既有答題熟練度也不倒退，避免「重來」反而刪除歷史學習。
    return next;
  }

  function restartStored(kind){
    const key=keyFor(kind),quiz=key?read(key,null):null;
    if(!quiz)throw Error("找不到未完成測驗");
    const reset=resetQuizObject(quiz);
    write(key,reset);
    return reset;
  }

  function abandonStored(kind){
    const key=keyFor(kind);
    if(!key)return false;
    const exists=localStorage.getItem(key)!==null;
    if(exists)localStorage.removeItem(key);
    return exists;
  }

  function sessionPanel(kind){
    const legacy=kind==="legacy";
    return `<section class="card v281-session-card">
      <div class="v281-session-copy">
        <div class="v281-session-title"><span class="badge">${legacy?"舊版未完成":"未完成"}</span><strong>${legacy?"先處理這一輪即可進入五能力新版":"單字複習進行中"}</strong></div>
        <p class="muted">可以繼續、重新從第 1 題做，或放棄這一輪。重來不會刪除已累積的熟練度；放棄只清除本輪未完成狀態。</p>
      </div>
      <div class="v281-session-actions">
        <button class="primary" id="v281ContinueSession">繼續</button>
        <button class="secondary" id="v281RestartSession">本輪重來</button>
        <button class="secondary v281-danger" id="v281AbandonSession">放棄本輪</button>
      </div>
    </section>`;
  }

  function injectPanel(html,kind){
    if(!kind||typeof html!=="string"||html.includes("v281-session-card"))return html;
    const tabs=/<div class="study-tabs">[\s\S]*?<\/div>/;
    return tabs.test(html)?html.replace(tabs,m=>m+sessionPanel(kind)):sessionPanel(kind)+html;
  }

  reviewPage=function(){
    const html=previousReviewPage();
    const tab=localStorage.getItem(TAB_KEY)||"mistakes";
    return tab==="vocab"?injectPanel(html,activeKind()):html;
  };

  function continueSession(kind){
    if(kind==="legacy"){
      const btn=document.querySelector("#startVocabQuiz");
      if(btn){btn.click();return true}
    }else if(kind==="new"){
      const btn=document.querySelector("#startVocabMixed");
      if(btn){btn.click();return true}
    }
    try{render()}catch(_){}
    setTimeout(()=>{
      const btn=kind==="legacy"?document.querySelector("#startVocabQuiz"):document.querySelector("#startVocabMixed");
      btn?.click();
    },60);
    return false;
  }

  function confirmRestart(kind){
    const label=kind==="legacy"?"這輪舊版單字測驗":"這輪單字複習";
    return window.confirm(`${label}要從第 1 題重新開始嗎？\n\n已經累積的單字熟練度與實際學習時間不會被刪除。`);
  }

  function confirmAbandon(kind){
    const label=kind==="legacy"?"這輪舊版單字測驗":"這輪單字複習";
    return window.confirm(`要放棄${label}嗎？\n\n只會清除「本輪未完成狀態」，不會刪除單字庫、熟練度或過去紀錄。\n\n注意：未完成這一輪的時間不會送到 Goal Sync。`);
  }

  function notify(msg){
    try{toast(msg)}catch(_){console.log(msg)}
  }

  function bindPageControls(){
    const kind=activeKind();
    if(!kind)return;

    document.querySelector("#v281ContinueSession")?.addEventListener("click",()=>continueSession(kind));

    document.querySelector("#v281RestartSession")?.addEventListener("click",()=>{
      if(!confirmRestart(kind))return;
      try{
        restartStored(kind);
        notify("已重新從第 1 題開始；既有熟練度保留");
        render();
        setTimeout(()=>continueSession(kind),80);
      }catch(e){
        console.error(e);
        notify(e.message||"無法重新開始");
      }
    });

    document.querySelector("#v281AbandonSession")?.addEventListener("click",()=>{
      if(!confirmAbandon(kind))return;
      try{
        abandonStored(kind);
        notify(kind==="legacy"?"舊版未完成測驗已解除，可以使用五能力複習":"本輪已放棄；單字資料與熟練度保留");
        render();
      }catch(e){
        console.error(e);
        notify("無法放棄本輪，資料沒有被清除");
      }
    });
  }

  bind=function(){
    previousBind();
    bindPageControls();
  };

  function dialogKind(){
    const quiz=document.querySelector("#lessonBody .vocab-quiz");
    if(!quiz)return "";
    return activeKind();
  }

  function decorateDialog(){
    const body=document.querySelector("#lessonBody");
    const dialog=document.querySelector("#lessonDialog");
    const quiz=body?.querySelector(".vocab-quiz");
    if(!body||!dialog||!quiz||quiz.querySelector(".v281-dialog-controls"))return;

    const kind=dialogKind();
    if(!kind)return;

    const controls=document.createElement("div");
    controls.className="v281-dialog-controls";
    controls.innerHTML=`
      <button type="button" class="secondary" data-v281-dialog="pause">暫停並保留</button>
      <button type="button" class="secondary" data-v281-dialog="restart">本輪重來</button>
      <button type="button" class="secondary v281-danger" data-v281-dialog="abandon">放棄本輪</button>`;

    const anchor=quiz.querySelector(".section-head");
    if(anchor)anchor.after(controls);else quiz.prepend(controls);

    controls.querySelector('[data-v281-dialog="pause"]').onclick=()=>{
      dialog.close();
      notify("已暫停，進度已保留");
    };

    controls.querySelector('[data-v281-dialog="restart"]').onclick=()=>{
      if(!confirmRestart(kind))return;
      // 先關閉，讓舊計時器把最後一段時間安全寫入，再重設 active quiz。
      dialog.close();
      setTimeout(()=>{
        try{
          restartStored(kind);
          render();
          notify("已重新從第 1 題開始；既有熟練度保留");
          setTimeout(()=>continueSession(kind),80);
        }catch(e){
          console.error(e);
          notify(e.message||"無法重新開始");
        }
      },120);
    };

    controls.querySelector('[data-v281-dialog="abandon"]').onclick=()=>{
      if(!confirmAbandon(kind))return;
      // 同樣先讓當前 session cleanup 完成，避免 close 時又把 active quiz 寫回去。
      dialog.close();
      setTimeout(()=>{
        try{
          abandonStored(kind);
          render();
          notify(kind==="legacy"?"舊版未完成測驗已解除，可以使用五能力複習":"本輪已放棄；單字資料與熟練度保留");
        }catch(e){
          console.error(e);
          notify("無法放棄本輪，資料沒有被清除");
        }
      },120);
    };
  }

  function installObserver(){
    const body=document.querySelector("#lessonBody");
    if(!body||typeof MutationObserver==="undefined")return;
    const observer=new MutationObserver(()=>decorateDialog());
    observer.observe(body,{childList:true,subtree:true});
    decorateDialog();
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",installObserver,{once:true});
  }else{
    installObserver();
  }

  window.ToeicVocabSessionControlsV281=Object.freeze({
    version:VERSION,
    keys:{LEGACY_KEY,NEW_KEY,TAB_KEY},
    activeKind,
    resetQuizObject,
    restartStored,
    abandonStored
  });
})();
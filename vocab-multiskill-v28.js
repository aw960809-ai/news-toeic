(() => {
  "use strict";

  const VERSION="2.8.0";
  const VOCAB_KEY="toeicVocabBankV2";
  const TAB_KEY="toeicReviewWorkbenchTabV1";
  const LEGACY_QUIZ_KEY="toeicVocabQuizActiveV1";
  const QUIZ_KEY="toeicVocabMultiSkillActiveV2";
  const INTERVALS=[1,3,7,14,30];
  const MASTER_STAGE=6;
  const SKILL_ORDER=["recognition","recall","spelling","context","collocation"];
  const SKILLS={
    recognition:{label:"意思辨認",short:"辨義",desc:"英文 → 中文意思"},
    recall:{label:"主動回想",short:"回想",desc:"看到意思，先在腦中叫出英文"},
    spelling:{label:"拼字",short:"拼字",desc:"中文提示 → 完整輸入英文"},
    context:{label:"語境理解",short:"語境",desc:"在教材例句中判斷目標字"},
    collocation:{label:"搭配用法",short:"搭配",desc:"辨認常見 TOEIC 搭配"}
  };

  const previousReviewPage=reviewPage;
  const previousBind=bind;

  function read(key,fallback){
    try{
      const raw=localStorage.getItem(key);
      if(raw===null)return fallback;
      const value=JSON.parse(raw);
      if(Array.isArray(fallback)&&!Array.isArray(value))throw Error("Invalid data shape");
      return value;
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

  const html=v=>typeof esc==="function"?esc(String(v??"")):String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const norm=v=>String(v||"").normalize("NFKC").trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[.?!]+$/g,"").replace(/\s+/g," ");
  const escapeRegExp=v=>String(v).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const nowIso=()=>new Date().toISOString();
  const notify=msg=>{try{toast(msg)}catch{console.log(msg)}};

  function vocabRows(){return read(VOCAB_KEY,[])}

  function applicableSkills(row){
    const out=["recognition","recall","spelling"];
    const word=String(row?.word||"").trim();
    const example=String(row?.example||"").trim();
    const collocation=String(row?.collocation||"").trim();
    if(word&&example&&new RegExp(`\\b${escapeRegExp(word)}\\b`,"i").test(example))out.push("context");
    if(collocation)out.push("collocation");
    return out;
  }

  function freshState(){
    return {stage:0,status:"learning",dueAt:nowIso(),reviews:0,correct:0,wrong:0,lastReviewedAt:"",masteredAt:""};
  }

  function legacySpellingState(row){
    return {
      stage:Number(row?.stage)||0,
      status:row?.status||"learning",
      dueAt:row?.status==="mastered"?"":(row?.dueAt||nowIso()),
      reviews:Number(row?.reviews)||0,
      correct:Number(row?.correct)||0,
      wrong:Number(row?.wrong)||0,
      lastReviewedAt:row?.lastReviewedAt||"",
      masteredAt:row?.masteredAt||""
    };
  }

  function skillState(row,skill){
    const saved=row?.skillProgress?.[skill];
    if(saved)return {...freshState(),...saved,stage:Number(saved.stage)||0};
    if(skill==="spelling")return legacySpellingState(row||{});
    return freshState();
  }

  function nextDue(stage){
    const days=INTERVALS[Math.min(Number(stage)||0,INTERVALS.length-1)]||30;
    return new Date(Date.now()+days*86400000).toISOString();
  }

  function skillDue(row,skill){
    if(!applicableSkills(row).includes(skill))return false;
    const s=skillState(row,skill);
    return s.status!=="mastered"&&(!s.dueAt||!Number.isFinite(Date.parse(s.dueAt))||Date.parse(s.dueAt)<=Date.now());
  }

  function fullyMastered(row){
    const list=applicableSkills(row);
    return list.length>0&&list.every(skill=>skillState(row,skill).status==="mastered");
  }

  function ensureSkillProgress(row){
    if(!row.skillProgress||typeof row.skillProgress!=="object"||Array.isArray(row.skillProgress)){
      row.skillProgress={};
    }
    if(!row.skillProgress.spelling){
      row.skillProgress.spelling=legacySpellingState(row);
    }
    row.skillProgressVersion=1;
    return row.skillProgress;
  }

  function recomputeOverall(row){
    ensureSkillProgress(row);
    const list=applicableSkills(row);
    const states=list.map(skill=>skillState(row,skill));
    const allMastered=states.length>0&&states.every(s=>s.status==="mastered");
    row.stage=states.length?Math.min(...states.map(s=>Number(s.stage)||0)):0;
    row.status=allMastered?"mastered":states.some(s=>(Number(s.reviews)||0)>0)?"reviewing":"learning";
    row.masteredAt=allMastered?(row.masteredAt||nowIso()):"";
    const dates=states.filter(s=>s.status!=="mastered").map(s=>Date.parse(s.dueAt||0)).filter(Number.isFinite);
    row.dueAt=allMastered?"":(dates.length?new Date(Math.min(...dates)).toISOString():nowIso());
  }

  function advanceSkill(id,skill,ok,hard=false,eventId=""){
    if(!SKILLS[skill])throw Error("Unknown vocabulary skill");
    const rows=vocabRows(),row=rows.find(x=>x.id===id);
    if(!row)return null;
    if(!applicableSkills(row).includes(skill))return null;
    if(eventId&&(row.skillRecallEvents||[]).some(e=>e.id===eventId))return skillState(row,skill);

    ensureSkillProgress(row);
    const state={...skillState(row,skill)};
    const stamp=nowIso();
    state.reviews=(Number(state.reviews)||0)+1;
    state.lastReviewedAt=stamp;

    row.reviews=(Number(row.reviews)||0)+1;
    row.lastReviewedAt=stamp;

    if(!ok){
      state.wrong=(Number(state.wrong)||0)+1;
      state.stage=0;
      state.status="learning";
      state.dueAt=nextDue(0);
      state.masteredAt="";
      row.wrong=(Number(row.wrong)||0)+1;
    }else{
      state.correct=(Number(state.correct)||0)+1;
      row.correct=(Number(row.correct)||0)+1;
      if(hard){
        state.stage=Math.max(0,Math.min(Number(state.stage)||0,2));
        state.status="learning";
        state.dueAt=nextDue(state.stage);
        state.masteredAt="";
      }else{
        state.stage=(Number(state.stage)||0)+1;
        if(state.stage>=MASTER_STAGE){
          state.stage=MASTER_STAGE;
          state.status="mastered";
          state.dueAt="";
          state.masteredAt=stamp;
        }else{
          state.status="reviewing";
          state.dueAt=nextDue(state.stage-1);
          state.masteredAt="";
        }
      }
    }

    row.skillProgress[skill]=state;
    if(eventId){
      row.skillRecallEvents??=[];
      row.skillRecallEvents.push({id:eventId,skill,at:stamp,correct:!!ok,hard:!!hard,stage:state.stage});
    }
    recomputeOverall(row);
    write(VOCAB_KEY,rows);
    return state;
  }

  function dueSkills(row){
    return applicableSkills(row).filter(skill=>skillDue(row,skill));
  }

  function stats(){
    const rows=vocabRows();
    const dueRows=rows.filter(r=>dueSkills(r).length);
    const counts=Object.fromEntries(SKILL_ORDER.map(s=>[s,rows.filter(r=>skillDue(r,s)).length]));
    return {
      words:rows.length,
      dueWords:dueRows.length,
      mastered:rows.filter(fullyMastered).length,
      counts,
      dueRows
    };
  }

  function shuffle(values,seed=""){
    const list=[...values];
    const E=window.ToeicRandomEngine;
    if(E?.shuffle&&E?.rng){
      return E.shuffle(list,E.rng(seed||E.nonce()));
    }
    for(let i=list.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [list[i],list[j]]=[list[j],list[i]];
    }
    return list;
  }

  function choiceOptions(correct,candidates,seed){
    const c=String(correct||"").trim();
    const unique=[...new Set(candidates.map(x=>String(x||"").trim()).filter(x=>x&&norm(x)!==norm(c)))];
    const picked=shuffle(unique,seed).slice(0,3);
    return shuffle([c,...picked],seed+"|options");
  }

  function buildQuestion(row,skill,bank,seed){
    const q={row:{...row},skill,options:[],correct:""};
    if(skill==="recognition"){
      q.prompt=row.word;
      q.correct=row.meaning||row.definition||"";
      q.options=choiceOptions(q.correct,bank.map(x=>x.meaning||x.definition||""),seed);
    }else if(skill==="recall"){
      q.prompt=row.meaning||row.definition||"請回想這個單字";
      q.correct=row.word;
    }else if(skill==="spelling"){
      q.prompt=row.meaning||row.definition||"請拼出這個單字";
      q.correct=row.word;
    }else if(skill==="context"){
      q.prompt=String(row.example||"").replace(new RegExp(`\\b${escapeRegExp(row.word)}\\b`,"ig"),"_____");
      q.correct=row.word;
      q.options=choiceOptions(q.correct,bank.map(x=>x.word),seed);
    }else if(skill==="collocation"){
      q.prompt=row.word;
      q.correct=row.collocation;
      q.options=choiceOptions(q.correct,bank.map(x=>x.collocation||""),seed);
    }
    return q;
  }

  function selectPairs(mode,count=10){
    const rows=vocabRows();
    if(mode!=="mixed"){
      return shuffle(rows.filter(r=>skillDue(r,mode)).map(r=>({row:r,skill:mode})),`v28|${mode}|${Date.now()}`).slice(0,count);
    }

    const buckets={};
    for(const skill of SKILL_ORDER){
      buckets[skill]=shuffle(
        rows.filter(r=>skillDue(r,skill))
          .sort((a,b)=>{
            const sa=skillState(a,skill),sb=skillState(b,skill);
            return (Number(sa.stage)||0)-(Number(sb.stage)||0)||(Number(sb.wrong)||0)-(Number(sa.wrong)||0);
          }),
        `v28|mixed|${skill}|${Date.now()}`
      );
    }

    const result=[];
    let moved=true;
    while(result.length<count&&moved){
      moved=false;
      for(const skill of SKILL_ORDER){
        const row=buckets[skill].shift();
        if(!row)continue;
        result.push({row,skill});
        moved=true;
        if(result.length>=count)break;
      }
    }
    return result;
  }

  function makeQuiz(mode){
    const pairs=selectPairs(mode,10);
    if(!pairs.length)return null;
    const bank=vocabRows();
    const id=window.ToeicRandomEngine?.nonce?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const questions=pairs.map((p,i)=>buildQuestion(p.row,p.skill,bank,`${id}|${i}|${p.skill}`));
    return {
      id,
      schemaVersion:2,
      mode,
      set:questions.map(q=>q.row),
      questions,
      index:0,
      answers:[]
    };
  }

  function skillPill(row,skill){
    const s=skillState(row,skill);
    const dueNow=skillDue(row,skill);
    return `<span class="v28-skill-pill ${s.status==="mastered"?"mastered":dueNow?"due":""}">${html(SKILLS[skill].short)} ${s.status==="mastered"?"✓":`${Math.min(MASTER_STAGE,Number(s.stage)||0)}/${MASTER_STAGE}`}</span>`;
  }

  function tabsHtml(){
    const tab=localStorage.getItem(TAB_KEY)||"mistakes";
    return `<div class="study-tabs">
      <button class="study-tab ${tab==="mistakes"?"active":""}" data-study-tab="mistakes">錯題</button>
      <button class="study-tab ${tab==="vocab"?"active":""}" data-study-tab="vocab">單字</button>
      <button class="study-tab ${tab==="writing"?"active":""}" data-study-tab="writing">句型作文</button>
    </div>`;
  }

  function vocabPage(){
    const s=stats();
    const active=read(QUIZ_KEY,null);
    const latest=window.ToeicVocabSync?.records?.()[0];

    return `${tabsHtml()}
      <div class="section-head"><h3>單字複習</h3><span class="badge">${s.dueWords} 個單字待複習</span></div>

      <section class="v28-vocab-kpis">
        <div class="card"><small>單字庫</small><strong>${s.words}</strong></div>
        <div class="card"><small>待複習</small><strong>${s.dueWords}</strong></div>
        <div class="card"><small>五項皆掌握</small><strong>${s.mastered}</strong></div>
      </section>

      <section class="card v28-mixed-card">
        <div>
          <p class="eyebrow">SMART REVIEW</p>
          <h3>${active?"繼續未完成複習":"開始混合複習"}</h3>
          <p class="muted">${active?"本輪進度已保存，先完成後再切換模式。":"系統自動混合辨義、回想、拼字、語境與搭配，優先抽到期與較弱項目。"}</p>
        </div>
        <button class="primary" id="startVocabMixed" ${active||s.dueWords?"":"disabled"}>${active?"繼續":"開始 10 題"}</button>
      </section>

      <div class="section-head"><h3>五種能力</h3><span class="badge">SRS 1·3·7·14·30 日</span></div>
      <section class="v28-mode-grid">
        ${SKILL_ORDER.map(skill=>`<button class="card v28-mode-card" data-v28-mode="${skill}" ${active||!s.counts[skill]?"disabled":""}>
          <span><strong>${html(SKILLS[skill].label)}</strong><small>${html(SKILLS[skill].desc)}</small></span>
          <span class="badge">${s.counts[skill]}</span>
        </button>`).join("")}
      </section>

      <section class="card v28-sync-note">
        <div><strong>Goal Sync</strong><p class="muted">完成整輪後，只按有效練習時間同步，不用答對率灌進度。</p></div>
        <span class="badge">${latest?`${latest.correct}/${latest.total}`:"待開始"}</span>
      </section>

      <div class="section-head"><h3>目前需要複習</h3><button class="secondary v28-small" id="harvestStudyBank">重新掃描教材</button></div>
      <section class="v28-due-list">
        ${s.dueRows.length?s.dueRows.slice(0,12).map(row=>`<article class="card v28-due-row">
          <div class="v28-due-copy"><strong>${html(row.word)}</strong><span>${html(row.meaning||row.definition||"")}</span></div>
          <div class="v28-skill-pills">${applicableSkills(row).map(skill=>skillPill(row,skill)).join("")}</div>
        </article>`).join(""):'<div class="card empty">目前沒有到期單字。</div>'}
      </section>`;
  }

  reviewPage=function(){
    const tab=localStorage.getItem(TAB_KEY)||"mistakes";
    if(tab==="vocab"&&!localStorage.getItem(LEGACY_QUIZ_KEY))return vocabPage();
    return previousReviewPage();
  };

  function answerSummary(row){
    return `<p><strong>${html(row.word)}</strong> · ${html(row.meaning||row.definition||"")}</p>
      ${row.collocation?`<p class="muted">${html(row.collocation)}</p>`:""}
      ${row.example?`<blockquote>${html(row.example)}</blockquote>`:""}`;
  }

  function startSession(requestedMode="mixed"){
    const sync=window.ToeicVocabSync;
    if(!sync)return notify("單字同步模組尚未載入，請先檢查更新");

    let quiz=read(QUIZ_KEY,null);
    if(!quiz?.set?.length){
      quiz=makeQuiz(requestedMode);
      if(!quiz)return notify("目前這個模式沒有到期單字");
      write(QUIZ_KEY,quiz);
    }

    const dialogEl=document.querySelector("#lessonDialog");
    const titleEl=document.querySelector("#lessonTitle");
    const bodyEl=document.querySelector("#lessonBody");
    if(!dialogEl||!titleEl||!bodyEl)return notify("無法開啟單字複習視窗");

    let lease=null,clock=null,heartbeat=null,closed=false;
    let i=Number(quiz.index)||0;

    const persist=()=>{
      const saved=read(QUIZ_KEY,null);
      if(saved&&saved.id!==quiz.id)throw Error("其他分頁已變更此輪單字訓練");
      write(QUIZ_KEY,quiz);
    };
    const handleError=e=>{console.error(e);notify(e.message||"無法保存單字訓練；請先匯出備份")};
    const touch=()=>{try{clock?.interact()}catch(e){handleError(e)}};
    const visibility=()=>{try{clock?.visibility()}catch(e){handleError(e)}};
    const cleanup=()=>{
      if(closed)return;
      closed=true;
      try{clock?.stop()}catch(e){console.error(e)}
      clearInterval(heartbeat);
      lease?.release?.();
      window.toeicStopAudio?.();
      dialogEl.removeEventListener("pointerdown",touch);
      dialogEl.removeEventListener("keydown",touch);
      dialogEl.removeEventListener("input",touch);
      document.removeEventListener("visibilitychange",visibility);
      window.removeEventListener("pagehide",cleanup);
      dialogEl.removeEventListener("close",cleanup);
    };

    const open=async()=>{
      try{
        lease=await sync.acquire();
        titleEl.textContent="單字複習";
        if(!dialogEl.open)dialogEl.showModal();

        if(i<quiz.set.length&&!quiz.completedAt){
          clock=sync.createClock(quiz,persist,{visible:()=>document.visibilityState==="visible"&&dialogEl.open,owner:lease.valid});
          heartbeat=setInterval(()=>{try{clock.tick()}catch(e){clearInterval(heartbeat);handleError(e)}},1000);
        }

        dialogEl.addEventListener("pointerdown",touch);
        dialogEl.addEventListener("keydown",touch);
        dialogEl.addEventListener("input",touch);
        document.addEventListener("visibilitychange",visibility);
        window.addEventListener("pagehide",cleanup);
        dialogEl.addEventListener("close",cleanup);

        const finish=()=>{
          try{
            lease.assert();
            clock?.stop();
            clearInterval(heartbeat);
            const result=sync.complete(quiz,persist),record=result.record;
            const bySkill={};
            quiz.questions.forEach((q,idx)=>{
              bySkill[q.skill]??={total:0,correct:0};
              bySkill[q.skill].total++;
              if(quiz.answers[idx]?.ok)bySkill[q.skill].correct++;
            });
            bodyEl.innerHTML=`<section class="hero v28-result">
              <p class="eyebrow">VOCAB COMPLETE</p>
              <h2>${record.correct}/${record.total}</h2>
              <p>有效練習 ${html(sync.duration(record.durationSeconds))} · 正確率 ${Math.round(record.correct/record.total*100)}%</p>
              <div class="v28-result-skills">${Object.entries(bySkill).map(([skill,x])=>`<span>${html(SKILLS[skill]?.short||skill)} ${x.correct}/${x.total}</span>`).join("")}</div>
              <p id="vocabGoalSyncStatus">${html(sync.status(record))}</p>
              <p class="muted">每一種能力獨立推進 1 → 3 → 7 → 14 → 30 日；五項都掌握才算完整掌握。</p>
              <button class="primary wide" id="doneVocabV28">完成</button>
            </section>`;
            document.querySelector("#doneVocabV28").onclick=()=>{
              try{
                const current=read(QUIZ_KEY,null);
                if(current?.id===quiz.id)localStorage.removeItem(QUIZ_KEY);
                cleanup();
                dialogEl.close();
                render();
              }catch(e){handleError(e)}
            };
          }catch(e){
            handleError(e);
            bodyEl.innerHTML=`<section class="card"><h3>作答已暫存</h3><p>完成紀錄尚未保存，請勿清除網站資料。</p><button class="primary" id="retryVocabV28">重試保存</button></section>`;
            document.querySelector("#retryVocabV28").onclick=finish;
          }
        };

        const show=()=>{
          if(i>=quiz.set.length||quiz.completedAt)return finish();
          window.toeicStopAudio?.();

          const q=quiz.questions[i];
          const row=q.row;
          const saved=quiz.answers[i];
          const skill=q.skill;
          let submitted=!!saved;
          let revealed=false;

          const head=`<div class="section-head"><span class="badge">${html(SKILLS[skill].label)}</span><span class="badge">${i+1}/${quiz.set.length}</span></div>`;
          const timerNote=`<p class="muted v28-timer-note">整輪完成才同步；切到背景或閒置超過 2 分鐘會暫停計時。</p>`;

          if(skill==="recognition"){
            bodyEl.innerHTML=`<section class="lesson-step vocab-quiz">${head}${timerNote}
              <div class="card vocab-prompt"><small>這個英文單字的意思是？</small><h2>${html(row.word)}</h2></div>
              <div class="v28-choice-list">${q.options.map((o,n)=>`<button class="secondary v28-choice" data-choice="${n}">${html(o)}</button>`).join("")}</div>
              <div id="vocabFeedbackV28"></div>
            </section>`;
          }else if(skill==="recall"){
            bodyEl.innerHTML=`<section class="lesson-step vocab-quiz">${head}${timerNote}
              <div class="card vocab-prompt"><small>先不要看答案，在腦中回想英文</small><h3>${html(q.prompt)}</h3>${row.definition?`<p class="muted">${html(row.definition)}</p>`:""}</div>
              <button class="primary wide" id="revealRecallV28">顯示答案</button>
              <div id="recallRateV28"></div><div id="vocabFeedbackV28"></div>
            </section>`;
          }else if(skill==="spelling"){
            bodyEl.innerHTML=`<section class="lesson-step vocab-quiz">${head}${timerNote}
              <div class="card vocab-prompt"><small>中文／定義提示</small><h3>${html(q.prompt)}</h3><p class="muted">字首 ${html(String(row.word||"")[0]?.toUpperCase()||"")} · ${String(row.word||"").length} letters</p></div>
              <label class="setting"><span>輸入完整英文單字</span><input id="vocabAnswerV28" class="settings-input" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
              <button class="primary wide" id="checkVocabV28">檢查答案</button><div id="vocabFeedbackV28"></div>
            </section>`;
          }else if(skill==="context"){
            bodyEl.innerHTML=`<section class="lesson-step vocab-quiz">${head}${timerNote}
              <div class="card vocab-prompt"><small>哪個字最符合這個語境？</small><blockquote>${html(q.prompt)}</blockquote></div>
              <div class="v28-choice-list">${q.options.map((o,n)=>`<button class="secondary v28-choice" data-choice="${n}">${html(o)}</button>`).join("")}</div>
              <div id="vocabFeedbackV28"></div>
            </section>`;
          }else{
            bodyEl.innerHTML=`<section class="lesson-step vocab-quiz">${head}${timerNote}
              <div class="card vocab-prompt"><small>哪個搭配最適合這個單字？</small><h2>${html(row.word)}</h2></div>
              <div class="v28-choice-list">${q.options.map((o,n)=>`<button class="secondary v28-choice" data-choice="${n}">${html(o)}</button>`).join("")}</div>
              <div id="vocabFeedbackV28"></div>
            </section>`;
          }

          try{bodyEl.scrollTop=0;dialogEl.scrollTop=0}catch(_){}

          const showFeedback=result=>{
            submitted=true;
            document.querySelectorAll(".v28-choice").forEach(b=>b.disabled=true);
            const input=document.querySelector("#vocabAnswerV28");
            if(input){input.value=result.text||"";input.disabled=true}
            const check=document.querySelector("#checkVocabV28");
            if(check)check.disabled=true;
            const reveal=document.querySelector("#revealRecallV28");
            if(reveal)reveal.disabled=true;
            const rate=document.querySelector("#recallRateV28");
            if(rate)rate.innerHTML="";

            const live=vocabRows().find(x=>x.id===row.id)||row;
            const state=skillState(live,skill);
            const feedback=document.querySelector("#vocabFeedbackV28");
            feedback.innerHTML=`<div class="card ${result.ok?"study-correct":"study-wrong"}">
              <strong>${result.ok?(result.hard?"有想起來，但還不穩":"答對"):`答案：${html(q.correct)}`}</strong>
              ${answerSummary(row)}
              <div class="v28-feedback-meta"><span class="badge">${html(SKILLS[skill].label)} ${Math.min(MASTER_STAGE,Number(state.stage)||0)}/${MASTER_STAGE}</span>${state.status==="mastered"?'<span class="badge">已掌握</span>':""}</div>
              <div class="actions"><button class="secondary" id="speakVocabV28">單字發音</button>${row.example?'<button class="secondary" id="speakExampleV28">例句發音</button>':""}<button class="primary" id="nextVocabV28">${i+1===quiz.set.length?"完成":"下一題"}</button></div>
            </div>`;
            document.querySelector("#speakVocabV28").onclick=()=>window.toeicToggleSpeech?.(row.word,`v28:${row.id}`,document.querySelector("#speakVocabV28"));
            document.querySelector("#speakExampleV28")?.addEventListener("click",()=>window.toeicToggleSpeech?.(row.example,`v28example:${row.id}`,document.querySelector("#speakExampleV28")));
            document.querySelector("#nextVocabV28").onclick=()=>{
              try{
                lease.assert();
                quiz.index=i+1;
                persist();
                i=quiz.index;
                show();
              }catch(e){
                quiz.index=i;
                handleError(e);
              }
            };
          };

          const submit=(ok,text,hard=false)=>{
            if(submitted)return;
            const result={text:String(text||""),ok:!!ok,hard:!!hard,skill,at:nowIso(),date:sync.dateKey(Date.now())};
            try{
              lease.assert();
              clock?.tick(true);
              advanceSkill(row.id,skill,result.ok,result.hard,`${quiz.id}:${i}:${skill}`);
              quiz.answers[i]=result;
              persist();
              showFeedback(result);
            }catch(e){handleError(e)}
          };

          document.querySelectorAll(".v28-choice").forEach(b=>{
            b.onclick=()=>{
              const choice=q.options[Number(b.dataset.choice)];
              submit(norm(choice)===norm(q.correct),choice,false);
            };
          });

          const input=document.querySelector("#vocabAnswerV28");
          const check=document.querySelector("#checkVocabV28");
          if(check&&input){
            const doCheck=()=>{
              const text=input.value.trim();
              if(!text)return;
              submit(norm(text)===norm(q.correct),text,false);
            };
            check.onclick=doCheck;
            input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();doCheck()}});
            if(!saved)input.focus();
          }

          const reveal=document.querySelector("#revealRecallV28");
          if(reveal){
            reveal.onclick=()=>{
              if(submitted||revealed)return;
              revealed=true;
              reveal.disabled=true;
              reveal.textContent=row.word;
              const rate=document.querySelector("#recallRateV28");
              rate.innerHTML=`<div class="v28-recall-rate">
                <button class="primary" data-rate="yes">有想起來</button>
                <button class="secondary" data-rate="hard">有點模糊</button>
                <button class="secondary" data-rate="no">沒想起來</button>
              </div>`;
              rate.querySelector('[data-rate="yes"]').onclick=()=>submit(true,"recalled",false);
              rate.querySelector('[data-rate="hard"]').onclick=()=>submit(true,"recalled-hard",true);
              rate.querySelector('[data-rate="no"]').onclick=()=>submit(false,"not-recalled",false);
            };
          }

          if(saved)showFeedback(saved);
        };

        show();
      }catch(e){
        cleanup();
        handleError(e);
      }
    };

    open();
  }

  bind=function(){
    previousBind();

    document.querySelector("#startVocabMixed")?.addEventListener("click",()=>startSession("mixed"));
    document.querySelectorAll("[data-v28-mode]").forEach(btn=>{
      btn.addEventListener("click",()=>startSession(btn.dataset.v28Mode||"mixed"));
    });
  };

  window.ToeicVocabSkillsV28=Object.freeze({
    version:VERSION,
    skills:SKILLS,
    skillOrder:SKILL_ORDER,
    keys:{VOCAB_KEY,TAB_KEY,LEGACY_QUIZ_KEY,QUIZ_KEY},
    applicableSkills,
    skillState,
    skillDue,
    fullyMastered,
    advanceSkill,
    stats,
    selectPairs,
    makeQuiz
  });
})();

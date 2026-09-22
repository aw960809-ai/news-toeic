(() => {
  "use strict";

  const VOCAB_KEY="toeicVocabBankV2";
  const PATTERN_KEY="toeicPatternBankV1";
  const WRITING_KEY="toeicWritingSessionsV1";
  const TAB_KEY="toeicReviewWorkbenchTabV1";
  const DRAFTS_KEY="toeicWritingDraftsV2";
  const QUIZ_KEY="toeicVocabQuizActiveV1";
  const INTERVALS=[1,3,7,14,30];
  const MASTER_STAGE=6;

  const damagedKeys=new Set();
  const read=(k,f)=>{try{const raw=localStorage.getItem(k);if(!raw)return f;const v=JSON.parse(raw);if(Array.isArray(f)&&!Array.isArray(v)||f&&typeof f==="object"&&!Array.isArray(f)&&(!v||typeof v!=="object"||Array.isArray(v)))throw Error("Invalid data shape");return v}catch{damagedKeys.add(k);return f}};
  const write=(k,v)=>{if(damagedKeys.has(k))throw Error("Original data is unreadable; export a backup before repair: "+k);const raw=localStorage.getItem(k);if(raw)JSON.parse(raw);localStorage.setItem(k,JSON.stringify(v))};
  const slug=v=>String(v||"").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80);
  const norm=v=>String(v||"").normalize("NFKC").trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[.?!]+$/g,"").replace(/\s+/g," ");
  const due=row=>row.status!=="mastered"&&(!row.dueAt||!Number.isFinite(Date.parse(row.dueAt))||Date.parse(row.dueAt)<=Date.now());
  const dateLabel=v=>v?new Date(v).toLocaleDateString("zh-TW",{month:"numeric",day:"numeric"}):"現在";
  const escapeRegExp=v=>String(v).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");

  function nextDue(stage){
    const days=INTERVALS[Math.min(stage,INTERVALS.length-1)]||30;
    return new Date(Date.now()+days*86400000).toISOString();
  }

  function findExample(text,word){
    const sentences=(String(text||"").replace(/\n+/g," ").match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[])
      .map(x=>x.trim()).filter(Boolean);
    const target=norm(word);
    return sentences.find(s=>norm(s).includes(target))||"";
  }

  function vocabRows(){return read(VOCAB_KEY,[])}
  function patternRows(){return read(PATTERN_KEY,[])}
  function writingRows(){return read(WRITING_KEY,[])}

  const identity=(kind,title,meaning="")=>`${kind}:${slug(title)}:${window.ToeicRandomEngine.hashSeed(norm(title)+"|"+norm(meaning)).toString(36)}`;
  const sourceOf=(lesson,example,collocation="")=>({articleId:lesson?.id||"",title:lesson?.title||"",example:String(example||""),collocation:String(collocation||""),verbatim:!!example&&String(lesson?.text||"").includes(String(example))});
  function normalizeVocab(v,lesson){
    const word=Array.isArray(v)?v[0]:v?.word,meaning=Array.isArray(v)?v[1]:v?.meaning,collocation=Array.isArray(v)?v[2]:v?.collocation;
    if(!word)return null;
    const example=(Array.isArray(v)?"":v?.example)||findExample(lesson?.text,word);
    return {id:identity("v",word,meaning),word:String(word).trim(),meaning:String(meaning||"").trim(),collocation:String(collocation||""),
      example,definition:v?.definition||"",sources:[sourceOf(lesson,example,collocation)],sourceArticleId:lesson?.id||"",sourceTitle:lesson?.title||"",category:lesson?.category||"",
      stage:0,status:"learning",dueAt:new Date().toISOString(),reviews:0,correct:0,wrong:0,lastReviewedAt:"",masteredAt:""};
  }
  function normalizePattern(g,lesson){
    const title=Array.isArray(g)?g[0]:g?.title,supplied=String((Array.isArray(g)?g[1]:g?.example)||"").trim();
    if(!title)return null;
    const text=String(lesson?.text||""),sentences=text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[];
    const example=supplied&&text.includes(supplied)?supplied:(sentences.map(x=>x.trim()).find(x=>patternUsed(title,x)===true)||supplied);
    return {id:identity("p",title),title:String(title).trim(),example:String(example||"").trim(),sources:[sourceOf(lesson,example)],
      sourceArticleId:lesson?.id||"",sourceTitle:lesson?.title||"",stage:0,status:"learning",dueAt:new Date().toISOString(),reviews:0,correct:0,wrong:0,lastReviewedAt:"",masteredAt:""};
  }
  function bankIdentity(row){return row.word?`v|${norm(row.word)}|${norm(row.meaning)}`:`p|${norm(row.title)}`}
  function sourceRows(row){return Array.isArray(row.sources)?row.sources:[{articleId:row.sourceArticleId||"",title:row.sourceTitle||"",example:row.example||"",collocation:row.collocation||""}]}
  function mergeBank(current,incoming){
    const result=current.map(x=>({...x})),byIdentity=new Map(result.map((x,i)=>[bankIdentity(x),i]));
    for(const item of incoming){
      if(!item)continue;
      const at=byIdentity.get(bankIdentity(item));
      if(at===undefined){byIdentity.set(bankIdentity(item),result.length);result.push(item);continue}
      const old=result[at],sources=new Map();
      for(const src of [...sourceRows(old),...sourceRows(item)])sources.set(JSON.stringify([src.articleId,src.example,src.collocation]),src);
      result[at]={...item,...old,example:old.example||item.example,collocation:old.collocation||item.collocation,
        definition:old.definition||item.definition,sourceArticleId:old.sourceArticleId||item.sourceArticleId,sourceTitle:old.sourceTitle||item.sourceTitle,sources:[...sources.values()]};
    }
    return result;
  }

  function collectLesson(lesson){
    if(!lesson)return;
    const vocab=(lesson.vocabulary||[]).map(v=>normalizeVocab(v,lesson)).filter(Boolean);
    const patterns=(lesson.grammar||[]).map(g=>normalizePattern(g,lesson)).filter(Boolean);
    write(VOCAB_KEY,mergeBank(vocabRows(),vocab));
    write(PATTERN_KEY,mergeBank(patternRows(),patterns));
  }

  function harvestAll(){
    try{
      allLessons().forEach(collectLesson);
      toast("已掃描現有教材的單字與句型");
      render();
    }catch(e){
      console.error(e);
      toast("教材掃描暫時失敗");
    }
  }

  function advance(key,id,ok,hard=false,eventId=""){
    const rows=read(key,[]);
    const row=rows.find(x=>x.id===id);
    if(!row)return;
    if(eventId&&(row.recallEvents||[]).some(e=>e.id===eventId))return;
    row.reviews=(Number(row.reviews)||0)+1;
    row.lastReviewedAt=now();
    if(!ok){
      row.wrong=(Number(row.wrong)||0)+1;
      row.stage=0;row.status="learning";row.dueAt=nextDue(0);row.masteredAt="";
    }else{
      row.correct=(Number(row.correct)||0)+1;
      if(hard){
        row.stage=Math.max(0,Math.min(Number(row.stage)||0,2));
        row.status="learning";row.dueAt=nextDue(Math.max(0,row.stage));
      }else{
        row.stage=(Number(row.stage)||0)+1;
        if(row.stage>=MASTER_STAGE){
          row.stage=MASTER_STAGE;row.status="mastered";row.masteredAt=now();row.dueAt="";
        }else{
          row.status="reviewing";row.dueAt=nextDue(row.stage-1);
        }
      }
    }
    if(eventId){row.recallEvents??=[];row.recallEvents.push({id:eventId,at:row.lastReviewedAt,correct:ok,stage:row.stage})}
    write(key,rows);
  }

  function studyStats(){
    const v=vocabRows(),p=patternRows(),w=writingRows();
    return {
      vocab:v.length,vocabDue:v.filter(due).length,vocabMastered:v.filter(x=>x.status==="mastered").length,
      patterns:p.length,patternDue:p.filter(due).length,patternMastered:p.filter(x=>x.status==="mastered").length,
      writing:w.length
    };
  }

  let tab=localStorage.getItem(TAB_KEY)||"mistakes";

  function tabsHtml(){
    return `<div class="study-tabs">
      <button class="study-tab ${tab==="mistakes"?"active":""}" data-study-tab="mistakes">錯題</button>
      <button class="study-tab ${tab==="vocab"?"active":""}" data-study-tab="vocab">單字</button>
      <button class="study-tab ${tab==="writing"?"active":""}" data-study-tab="writing">句型作文</button>
    </div>`;
  }

  function vocabPage(){
    const s=studyStats(),latest=window.ToeicVocabSync?.records()[0];
    const dueRows=vocabRows().filter(due).sort((a,b)=>Date.parse(a.dueAt||0)-Date.parse(b.dueAt||0));
    return `<div class="section-head"><h3>單字主動複習</h3><span class="badge">${s.vocabDue} 個到期</span></div>
      <section class="study-kpis">
        <div class="card"><small>單字庫</small><strong>${s.vocab}</strong></div>
        <div class="card"><small>今日到期</small><strong>${s.vocabDue}</strong></div>
        <div class="card"><small>已掌握</small><strong>${s.vocabMastered}</strong></div>
      </section>
      <section class="card">
        <h3>拼字＋例句填空</h3>
        <p class="muted">看到中文意思與搭配提示後，自己輸入英文單字；作答後才顯示例句與發音。</p>
        <div class="actions">
          <button class="primary" id="startVocabQuiz" ${s.vocabDue||read(QUIZ_KEY,null)?"":"disabled"}>${read(QUIZ_KEY,null)?"繼續未完成測驗":"開始今日單字測驗"}</button>
          <button class="secondary" id="startVocabContext" ${s.vocabDue?"":"disabled"}>例句填空</button>
          <button class="secondary" id="harvestStudyBank">重新掃描教材</button>
        </div>
      </section>
      <section class="card"><h3>單字 Goal Sync</h3><p class="muted">完成一輪後，按有效練習秒數累積分鐘，不把答對率當成目標完成率。</p>
        ${latest?`<p>${latest.correct}/${latest.total} · ${window.ToeicVocabSync.duration(latest.durationSeconds)}</p><p>${esc(window.ToeicVocabSync.status(latest))}</p>`:'<p class="muted">更新後完成一輪，即可在這裡查看同步狀態；不補造舊紀錄的學習時間。</p>'}</section>
      <div class="section-head"><h3>待複習</h3><span class="badge">${dueRows.length}</span></div>
      <div class="list">${dueRows.length?dueRows.slice(0,20).map(v=>`<div class="card study-list-row">
        <div><strong>${esc(v.word)}</strong><p class="muted">${esc(v.meaning)} · ${esc(v.collocation||"")}</p><details><summary>來源與例句（${sourceRows(v).length}）</summary>${sourceRows(v).map(x=>`<p class="muted">${esc(x.title)} · ${x.verbatim?"原文例句":"教材參考例句"}</p><blockquote>${esc(x.example||"此教材未附原例句")}</blockquote>`).join("")}</details></div>
        <span class="badge">第 ${Number(v.stage)||0} 階段</span>
      </div>`).join(""):'<div class="card empty">目前沒有到期單字。完成更多教材後，系統會自動加入新單字。</div>'}</div>`;
  }

  function writingPage(){
    const s=studyStats();
    const recent=writingRows().slice(-8).reverse();
    return `<div class="section-head"><h3>句型與作文訓練</h3><span class="badge">ACTIVE OUTPUT</span></div>
      <section class="study-kpis">
        <div class="card"><small>句型庫</small><strong>${s.patterns}</strong></div>
        <div class="card"><small>到期句型</small><strong>${s.patternDue}</strong></div>
        <div class="card"><small>作文紀錄</small><strong>${s.writing}</strong></div>
      </section>
      <section class="card">
        <h3>把「看得懂」變成「寫得出來」</h3>
        <p class="muted">系統會從你學過的單字與句型抽題。評分是本機規則檢查：是否真的使用目標單字／句型、長度、句子結構與基本標點；不假裝是 AI 文法批改。</p>
        <div class="writing-mode-grid">
          <button class="primary writing-start" data-writing-mode="sentence">單句造句</button>
          <button class="secondary writing-start" data-writing-mode="paragraph">80–120 字短文</button>
        </div>
      </section>
      <div class="section-head"><h3>近期練習</h3></div>
      <div class="list">${recent.length?recent.map(r=>`<div class="card">
        <div class="article-meta"><span class="badge">${r.mode==="sentence"?"單句":"短文"}</span><span class="badge">本機檢查${r.revision?` · 第 ${r.revision} 稿`:""}</span></div>
        <p>${esc(r.text)}</p><p class="muted">${new Date(r.at).toLocaleString("zh-TW")}</p>
      </div>`).join(""):'<div class="card empty">尚無作文紀錄。</div>'}</div>`;
  }

  const originalReviewPage=reviewPage;
  reviewPage=function(){
    const head=`${tabsHtml()}`;
    if(tab==="vocab")return head+vocabPage();
    if(tab==="writing")return head+writingPage();
    return head+originalReviewPage();
  };

  function bindTabs(){
    document.querySelectorAll("[data-study-tab]").forEach(b=>b.onclick=()=>{
      tab=b.dataset.studyTab||"mistakes";
      localStorage.setItem(TAB_KEY,tab);
      render();
    });
    document.querySelector("#harvestStudyBank")?.addEventListener("click",harvestAll);
    document.querySelector("#startVocabQuiz")?.addEventListener("click",()=>startVocabQuiz("meaning"));
    document.querySelector("#startVocabContext")?.addEventListener("click",()=>startVocabQuiz("context"));
    document.querySelectorAll(".writing-start").forEach(b=>b.onclick=()=>startWriting(b.dataset.writingMode||"sentence"));
  }

  const originalBind=bind;
  bind=function(){
    originalBind();
    bindTabs();
  };

  function blankCollocation(row){
    const c=String(row.collocation||"").trim();
    if(!c)return `首字母：${String(row.word||"")[0]?.toUpperCase()||""} · ${String(row.word||"").length} letters`;
    const re=new RegExp(escapeRegExp(row.word),"ig");
    return re.test(c)?c.replace(re,"_____"):c;
  }

  async function startVocabQuiz(mode="meaning"){
    const sync=window.ToeicVocabSync;
    if(!sync)return toast("單字同步模組尚未載入，請先檢查更新");
    let lease=null,clock=null,heartbeat=null,quiz=null,closed=false;
    const handleError=e=>{console.error(e);toast(e.message||"無法保存單字訓練；請先匯出備份，勿清除資料")};
    const persist=()=>{const saved=read(QUIZ_KEY,null);if(saved&&saved.id!==quiz.id)throw Error("其他分頁已變更此輪訓練，請重新開啟");write(QUIZ_KEY,quiz)};
    const touch=()=>{try{clock?.interact()}catch(e){handleError(e)}};
    const visibility=()=>{try{clock?.visibility()}catch(e){handleError(e)}};
    const cleanup=()=>{
      if(closed)return;closed=true;
      try{clock?.stop()}catch(e){handleError(e)}
      clearInterval(heartbeat);lease?.release();window.toeicStopAudio?.();
      body.removeEventListener("pointerdown",touch);body.removeEventListener("keydown",touch);body.removeEventListener("input",touch);
      document.removeEventListener("visibilitychange",visibility);window.removeEventListener("pagehide",cleanup);dialog.removeEventListener("close",cleanup);
    };
    try{
      lease=await sync.acquire();quiz=read(QUIZ_KEY,null);
      if(!quiz?.set?.length){
        const pool=vocabRows().filter(due).filter(row=>mode!=="context"||row.example&&new RegExp(`\\b${escapeRegExp(row.word)}\\b`,"i").test(row.example));
        const set=window.ToeicRandomEngine.shuffle(pool,window.ToeicRandomEngine.rng(window.ToeicRandomEngine.nonce())).slice(0,10);
        if(!set.length){lease.release();return toast(mode==="context"?"目前沒有附完整例句的到期單字":"目前沒有到期單字")}
        quiz={id:window.ToeicRandomEngine.nonce(),mode,set,index:0,answers:[]};write(QUIZ_KEY,quiz);
      }
      const set=quiz.set;let i=quiz.index||0;
      dialogTitle.textContent="單字主動複習";if(!dialog.open)dialog.showModal();
      if(i<set.length&&!quiz.completedAt){
        clock=sync.createClock(quiz,persist,{visible:()=>document.visibilityState==="visible"&&dialog.open,owner:lease.valid});
        heartbeat=setInterval(()=>{try{clock.tick()}catch(e){clearInterval(heartbeat);handleError(e)}},1000);
      }
      body.addEventListener("pointerdown",touch);body.addEventListener("keydown",touch);body.addEventListener("input",touch);
      document.addEventListener("visibilitychange",visibility);window.addEventListener("pagehide",cleanup);dialog.addEventListener("close",cleanup);
      const finish=()=>{
        try{
          lease.assert();clock?.stop();clearInterval(heartbeat);
          const result=sync.complete(quiz,persist),record=result.record;
          body.innerHTML=`<section class="hero"><p class="eyebrow">VOCAB COMPLETE</p><h2>${record.correct}/${record.total}</h2>
            <p>有效練習 ${sync.duration(record.durationSeconds)} · 正確率 ${Math.round(record.correct/record.total*100)}%</p>
            <p id="vocabGoalSyncStatus">${esc(sync.status(record))}</p>
            ${record.legacyPartial?'<p class="muted">這輪從舊版接續，僅計入更新後可核對的練習時間。</p>':""}
            ${result.error?`<p class="muted">${esc(result.error)}；本輪已另存獨立同步紀錄，請先匯出備份。</p>`:""}
            <p>答錯單字明天重新出現；答對依 1 → 3 → 7 → 14 → 30 日推進。</p><button class="primary wide" id="doneVocab">完成</button></section>`;
          document.querySelector("#doneVocab").onclick=()=>{try{const current=read(QUIZ_KEY,null);if(current?.id===quiz.id)localStorage.removeItem(QUIZ_KEY);cleanup();dialog.close();render()}catch(e){handleError(e)}};resetDialog();
        }catch(e){
          handleError(e);body.innerHTML='<section class="card"><h3>作答已暫存，完成紀錄尚未保存</h3><p>請勿清除網站資料。釋出空間或匯出備份後，可重新嘗試。</p><button class="primary" id="retryVocabComplete">重試保存</button></section>';
          document.querySelector("#retryVocabComplete").onclick=finish;
        }
      };
      const show=()=>{
        if(i>=set.length||quiz.completedAt)return finish();
        window.toeicStopAudio?.();const row=set[i],saved=quiz.answers[i];
        const gap=row.example?.replace(new RegExp(`\\b${escapeRegExp(row.word)}\\b`,"ig"),"_____");
        body.innerHTML=`<section class="lesson-step vocab-quiz">
          <div class="section-head"><span class="badge">${quiz.mode==="context"?"CONTEXT RECALL":"VOCAB ACTIVE RECALL"}</span><span class="badge">${i+1}/${set.length}</span></div>
          <p class="muted">整輪完成才同步；切至背景、關閉練習或閒置超過 2 分鐘暫停計時。</p>
          <div class="card vocab-prompt"><small>中文意思</small><h3>${esc(row.meaning||"請回想這個單字")}</h3>
          ${quiz.mode==="context"?`<blockquote>${esc(gap)}</blockquote>`:`<p class="muted">搭配提示：${esc(blankCollocation(row))}</p>`}</div>
          <label class="setting"><span>輸入英文單字</span><input id="vocabAnswer" class="settings-input" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
          <button class="primary wide" id="checkVocab">檢查答案</button><div id="vocabFeedback"></div></section>`;
        resetDialog();const input=document.querySelector("#vocabAnswer");let submitted=!!saved;
        const feedback=result=>{
          input.value=result.text;input.disabled=true;document.querySelector("#checkVocab").disabled=true;
          document.querySelector("#vocabFeedback").innerHTML=`<div class="card ${result.ok?"study-correct":"study-wrong"}"><strong>${result.ok?"答對":"答案是 "+esc(row.word)}</strong><p>${esc(row.word)} · ${esc(row.meaning)}</p>
            <p class="muted">${esc(row.collocation||"")}</p>${row.example?`<blockquote>${esc(row.example)}</blockquote>`:""}
            <div class="actions"><button class="secondary" id="speakVocab">單字發音</button>${row.example?'<button class="secondary" id="speakVocabExample">例句發音</button>':""}<button class="primary" id="nextVocab">${i+1===set.length?"完成":"下一題"}</button></div></div>`;
          document.querySelector("#speakVocab").onclick=()=>window.toeicToggleSpeech?.(row.word,`vocab:${row.id}`,document.querySelector("#speakVocab"));
          document.querySelector("#speakVocabExample")?.addEventListener("click",()=>window.toeicToggleSpeech?.(row.example,`example:${row.id}`,document.querySelector("#speakVocabExample")));
          document.querySelector("#nextVocab").onclick=()=>{try{lease.assert();quiz.index=i+1;persist();i=quiz.index;show()}catch(e){quiz.index=i;handleError(e)}};
        };
        const check=()=>{
          if(submitted)return;const text=input.value.trim();if(!text)return;
          const result={text,ok:norm(text)===norm(row.word),at:now(),date:sync.dateKey(Date.now())};
          try{lease.assert();clock?.tick(true);advance(VOCAB_KEY,row.id,result.ok,false,`${quiz.id}:${i}`);quiz.answers[i]=result;persist();submitted=true;feedback(result)}catch(e){handleError(e)}
        };
        document.querySelector("#checkVocab").onclick=check;input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();check()}});
        if(saved)feedback(saved);else input.focus();
      };
      show();
    }catch(e){cleanup();handleError(e)}
  }

  function resetDialog(){
    requestAnimationFrame(()=>{try{body.scrollTop=0;dialog.scrollTop=0}catch(_){}});
  }

  function targetPatterns(count){
    let rows=patternRows().filter(due);
    if(rows.length<count)rows=[...rows,...patternRows().filter(x=>!rows.some(r=>r.id===x.id))];
    return window.ToeicRandomEngine.shuffle(rows,window.ToeicRandomEngine.rng(window.ToeicRandomEngine.nonce())).slice(0,count);
  }
  function targetWords(count){
    let rows=vocabRows().filter(due);
    if(rows.length<count)rows=[...rows,...vocabRows().filter(x=>!rows.some(r=>r.id===x.id))];
    return window.ToeicRandomEngine.shuffle(rows,window.ToeicRandomEngine.rng(window.ToeicRandomEngine.nonce())).slice(0,count);
  }

  function patternUsed(title,text){
    const n=String(title).toLowerCase(),t=String(text);
    const tests=[
      [/although|even though/,/\b(?:although|even though)\b[^.!?]+[,]/i],
      [/by.*v-ing/,/\bby\s+[a-z]+ing\b/i],
      [/relative clause/,/\b(?:which|that|who)\b\s+[^.!?]+/i],
      [/not only/,/\bnot only\b[^.!?]+\bbut\b(?:\s+also)?/i],
      [/^if|if.*may/,/\bif\b[^.!?]+\b(?:may|can|will|could|might)\b/i],
      [/rather than/,/\brather than\s+[a-z]+ing\b/i],
      [/^once/,/\bonce\b[^.!?]+,/i],
      [/^while/,/\bwhile\b[^.!?]+,/i],
      [/what.*clause/,/\bwhat\b[^.!?]+\b(?:is|are|was|were)\b/i],
      [/passive/,/\b(?:is|are|was|were|be|been)\s+(?:[a-z]+ed|seen|given|made|sent|built|written|known)\b/i],
      [/with.*noun/,/\bwith\b[^.!?]+\b[a-z]+ing\b/i],
      [/present perfect/,/\b(?:has|have)\s+(?:already\s+)?(?:[a-z]+ed|seen|given|made|sent|been|done|written)\b/i],
      [/before/,/\bbefore\s+[a-z]+ing\b/i],
      [/the more/,/\bthe more\b[^.!?]+,\s*the more\b/i],
      [/in order|purpose infinitive/,/\b(?:in order to|to)\s+[a-z]+\b/i],
      [/whereas/,/\bwhereas\b[^.!?]+/i],
      [/because/,/\bbecause(?:\s+of)?\s+[^.!?]+/i],
      [/so that/,/\bso that\b[^.!?]+/i],
      [/therefore|as a result/,/\b(?:therefore|as a result)\b/i],
      [/unless/,/\bunless\b[^.!?]+/i],
      [/plan to/,/\bplan(?:s|ned)?\s+to\s+[a-z]+/i],
      [/need.*to/,/\bneed(?:s|ed)?\s+to\s+[a-z]+/i],
      [/^may/,/\bmay\s+[a-z]+/i],
      [/asked|ask.*to/,/\bask(?:ed|s)?\b[^.!?]+\bto\s+[a-z]+/i],
      [/based on/,/\b(?:is|are|was|were|be)\s+based\s+on\b/i]
    ];
    const item=tests.find(([name])=>name.test(n));return item?item[1].test(t):null;
  }

  function sentenceScore(text,word,pattern){
    const words=String(text||"").trim().split(/\s+/).filter(Boolean);
    const vocabOk=new RegExp(`\\b${escapeRegExp(word.word)}\\b`,"i").test(text);
    const patternOk=patternUsed(pattern.title,text);
    const lengthOk=words.length>=6&&words.length<=35;
    const mechanics=/^[A-Z]/.test(String(text).trim())&&/[.!?]$/.test(String(text).trim());
    const sentenceCount=(String(text).match(/[.!?]+/g)||[]).length;
    const oneSentence=sentenceCount===1;
    const score=(vocabOk?35:0)+(patternOk?35:0)+(lengthOk?15:0)+(mechanics?10:0)+(oneSentence?5:0);
    return {score,vocabOk,patternOk,lengthOk,mechanics,oneSentence,wordCount:words.length};
  }

  function paragraphScore(text,words,patterns){
    const tokens=String(text||"").trim().split(/\s+/).filter(Boolean);
    const vocabHits=words.filter(w=>new RegExp(`\\b${escapeRegExp(w.word)}\\b`,"i").test(text)).length;
    const patternHits=patterns.filter(p=>patternUsed(p.title,text)).length;
    const sentenceCount=(String(text).match(/[.!?]+/g)||[]).length;
    const lengthScore=tokens.length>=80&&tokens.length<=120?25:tokens.length>=60&&tokens.length<=150?12:0;
    const vocabScore=Math.round(30*(vocabHits/Math.max(1,words.length)));
    const patternScore=Math.round(30*(patternHits/Math.max(1,patterns.length)));
    const structureScore=sentenceCount>=4?10:sentenceCount>=3?6:0;
    const mechanics=/^[A-Z]/.test(String(text).trim())&&/[.!?]$/.test(String(text).trim())?5:0;
    return {score:vocabScore+patternScore+lengthScore+structureScore+mechanics,vocabHits,patternHits,length:tokens.length,sentenceCount};
  }

  function saveWriting(row){
    const rows=writingRows();if(!rows.some(x=>x.id===row.id)){rows.push(row);write(WRITING_KEY,rows)}
  }
  function getDraft(mode){
    const drafts=read(DRAFTS_KEY,{});if(drafts[mode])return drafts[mode];
    const old=read("toeicWritingDraftV1",null);
    if(old?.mode===mode){
      const words=(old.vocabIds||[]).map(id=>vocabRows().find(x=>x.id===id)).filter(Boolean),patterns=(old.patternIds||[]).map(id=>patternRows().find(x=>x.id===id)).filter(Boolean);
      const draft={...old,id:`draft-${window.ToeicRandomEngine.nonce()}`,mode,words,patterns,revision:0,startedAt:Date.now(),legacy:true};
      drafts[mode]=draft;write(DRAFTS_KEY,drafts);return draft;
    }
    return null;
  }
  function putDraft(draft){const drafts=read(DRAFTS_KEY,{});drafts[draft.mode]=draft;write(DRAFTS_KEY,drafts)}
  function clearDraft(draft){const drafts=read(DRAFTS_KEY,{});if(drafts[draft.mode]?.id===draft.id){delete drafts[draft.mode];write(DRAFTS_KEY,drafts)}const old=read("toeicWritingDraftV1",null);if(draft.legacy&&old?.mode===draft.mode)localStorage.removeItem("toeicWritingDraftV1")}
  function startWriting(mode){
    let draft=getDraft(mode);
    if(!draft){
      const words=targetWords(mode==="sentence"?1:3),patterns=targetPatterns(mode==="sentence"?1:2);
      if(!words.length||!patterns.length)return toast("先完成教材或掃描教材，建立單字與句型庫");
      draft={id:`draft-${window.ToeicRandomEngine.nonce()}`,mode,text:"",words,patterns,revision:0,startedAt:Date.now()};putDraft(draft);
    }
    const words=draft.words||[],patterns=draft.patterns||[];
    dialogTitle.textContent=mode==="sentence"?"句型造句":"短文輸出";if(!dialog.open)dialog.showModal();
    const sourceHtml=row=>`<details><summary>${esc(row.word||row.title)} · 教材與例句</summary>${sourceRows(row).map(x=>`<p class="muted">${esc(x.title)} · ${x.verbatim?"原文例句":"教材參考例句"}</p><blockquote>${esc(x.example||"此教材未附原例句")}</blockquote>`).join("")}</details>`;
    body.innerHTML=`<section class="lesson-step writing-session"><p class="eyebrow">${mode==="sentence"?"SENTENCE PRODUCTION":"PARAGRAPH PRODUCTION"}</p>
      <div class="card"><strong>本篇練習目標（離開後仍保留）</strong><div class="target-chips">${words.map(w=>`<span class="badge">${esc(w.word)} · ${esc(w.meaning)}</span>`).join("")}${patterns.map(p=>`<span class="badge">${esc(p.title)}</span>`).join("")}</div>
      <p class="muted">${mode==="sentence"?"寫 1 句 6–35 words 的完整英文句子。":"寫 80–120 words，至少 4 句；自然使用目標單字與句型。"}</p>
      ${!words.length||!patterns.length?'<p class="notice">舊草稿的部分練習目標已無法找到；文字仍保留，請先保存文字。未重新抽題取代舊目標。</p>':""}
      ${words.concat(patterns).map(sourceHtml).join("")}</div>
      <label class="setting"><span>你的英文</span><textarea id="writingText" class="writing-textarea" rows="${mode==="sentence"?5:12}" spellcheck="true"></textarea></label>
      <div class="writing-counter"><span id="writingCount">0 words</span><span id="writingSaveStatus" role="status">草稿已保存</span></div>
      <button class="primary wide" id="submitWriting">提交本機檢查</button><div id="writingFeedback"></div></section>`;
    resetDialog();const input=document.querySelector("#writingText");input.value=draft.text||"";
    const count=()=>document.querySelector("#writingCount").textContent=`${input.value.trim()?input.value.trim().split(/\s+/).length:0} words`;
    const persist=()=>{draft.text=input.value;try{putDraft(draft);document.querySelector("#writingSaveStatus").textContent="草稿已保存"}catch(e){document.querySelector("#writingSaveStatus").textContent="儲存失敗：請先複製文字";console.error(e)}};
    input.addEventListener("input",()=>{count();persist()});count();let submitted=false;
    document.querySelector("#submitWriting").onclick=()=>{
      if(submitted)return;const text=input.value.trim();if(!text)return;
      if(!words.length||!patterns.length)return toast("原練習目標不完整，草稿仍可保存；請先匯出備份");
      const result=mode==="sentence"?sentenceScore(text,words[0],patterns[0]):paragraphScore(text,words,patterns);
      const passed=mode==="sentence"?result.vocabOk&&result.patternOk===true&&result.lengthOk&&result.mechanics&&result.oneSentence:result.vocabHits===words.length&&result.patternHits===patterns.length&&result.length>=80&&result.length<=120&&result.sentenceCount>=4;
      const revision=(draft.revision||0)+1,id=`${draft.id}:r${revision}`;
      try{
        saveWriting({id,at:now(),mode,text,score:result.score,checkType:"local-rule-check",result,draftId:draft.id,revision,
          durationMinutes:Math.max(1,Math.round((Date.now()-draft.startedAt)/60000)),vocabIds:words.map(x=>x.id),patternIds:patterns.map(x=>x.id),words,patterns});
        draft.revision=revision;draft.text=text;putDraft(draft);submitted=true;
      }catch(e){toast("未能保存這次修改，請先複製文字並匯出備份");console.error(e);return}
      const details=mode==="sentence"
        ? `<li>${result.vocabOk?"✓":"✗"} Use the target word.</li><li>${result.patternOk===null?"需人工確認":result.patternOk?"✓":"✗"} Use the target sentence pattern.</li><li>${result.lengthOk?"✓":"✗"} Write 6–35 words.</li><li>${result.mechanics?"✓":"✗"} Start with a capital letter and end with punctuation.</li><li>${result.oneSentence?"✓":"✗"} Write one sentence.</li>`
        : `<li>目標單字 ${result.vocabHits}/${words.length}</li><li>偵測到句型 ${result.patternHits}/${patterns.length}</li><li>長度 ${result.length} words</li><li>句子數 ${result.sentenceCount}</li>`;
      document.querySelector("#writingFeedback").innerHTML=`<div class="card ${passed?"study-correct":"study-wrong"}"><div class="section-head"><strong>目標與格式檢查</strong><span class="badge">${passed?"目標格式符合":"尚待修改"}</span></div>
        <ul class="writing-checks">${details}</ul><p class="muted">本機規則只能找詞形、句型線索與格式；不能確認完整文法、語意及用字是否自然，也不據此推進單字熟練度。</p>
        <div class="actions"><button class="secondary" id="reviseWriting">修改這篇</button><button class="primary" id="finishWriting">完成</button></div></div>`;
      input.disabled=true;document.querySelector("#submitWriting").disabled=true;
      document.querySelector("#reviseWriting").onclick=()=>{submitted=false;input.disabled=false;document.querySelector("#submitWriting").disabled=false;document.querySelector("#writingFeedback").innerHTML="";input.focus()};
      document.querySelector("#finishWriting").onclick=()=>{clearDraft(draft);dialog.close();render()};
    };
  }

  // Harvest existing material on first install without changing progress.
  if(!localStorage.getItem("toeicStudyWorkbenchHarvestedV1")){
    try{
      allLessons().forEach(collectLesson);
      localStorage.setItem("toeicStudyWorkbenchHarvestedV1","1");
    }catch(_){}
  }

  // Keep future lessons in the bank.
  const oldFinishLesson=finishLesson;
  finishLesson=function(){
    try{collectLesson(activeLesson)}catch(_){}
    return oldFinishLesson();
  };

  window.ToeicStudyTest={patternUsed,sentenceScore,paragraphScore,advance,mergeBank,normalizeVocab,normalizePattern,collectLesson,getDraft,saveWriting,norm,keys:{VOCAB_KEY,PATTERN_KEY,WRITING_KEY,DRAFTS_KEY,QUIZ_KEY}};
  render();
})();
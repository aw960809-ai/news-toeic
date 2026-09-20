(() => {
  "use strict";

  const CACHE_KEY = "toeicArticleAnalysisAppDeployParityV1";
  const CACHE_LIMIT = 12;
  const FILTERS = [
    ["all","全部"],["meaning","意思"],["structure","句構"],
    ["chunk","語塊"],["logic","邏輯"],["reference","指涉"],["expression","表達"]
  ];
  const LABELS = {
    meaning:"Core Meaning",
    structure:"Sentence Structure",
    chunk:"Chunk / Collocation",
    logic:"Logic / Connection",
    reference:"Reference / Context",
    expression:"Key Expression"
  };

  const escHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));

  function splitSentences(text){
    return (String(text||"").replace(/\n+/g," ").match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[])
      .map(s=>s.trim()).filter(Boolean).slice(0,50);
  }

  function fingerprint(text){
    const t=String(text||"");
    return `${t.length}:${t.slice(0,48)}:${t.slice(-48)}`;
  }

  function loadCache(){
    try{
      const raw=localStorage.getItem(CACHE_KEY);
      return raw?JSON.parse(raw):[];
    }catch(_){return[]}
  }

  function saveCache(article,analysis){
    const rows=loadCache().filter(x=>x.articleId!==article.id);
    rows.push({articleId:article.id,fingerprint:fingerprint(article.text),savedAt:new Date().toISOString(),analysis});
    localStorage.setItem(CACHE_KEY,JSON.stringify(rows.slice(-CACHE_LIMIT)));
  }

  function cached(article){
    return loadCache().find(x=>x.articleId===article.id&&x.fingerprint===fingerprint(article.text))?.analysis||null;
  }

  const LOGIC = [
    ["because","Cause marker","It introduces a reason or cause.","The schedule changed because demand increased."],
    ["however","Contrast marker","It signals a contrast with the previous idea.","However, the service remains available."],
    ["but","Contrast marker","It contrasts two ideas.","The plan is simple, but it takes time."],
    ["although","Concession marker","It introduces an unexpected contrast.","Although demand fell, sales remained stable."],
    ["if","Condition marker","It introduces a condition.","If demand rises, the company may hire more staff."],
    ["when","Time / condition marker","It connects an event with a time or condition.","Call us when the package arrives."],
    ["before","Time relation","It shows one action happens earlier.","Check the form before signing it."],
    ["after","Time relation","It shows one action follows another.","The team met after the announcement."],
    ["as a result","Result marker","It introduces a consequence.","As a result, delivery times improved."],
    ["so that","Purpose marker","It explains the purpose of an action.","The guide was revised so that customers could follow it."],
    ["therefore","Result marker","It signals a result or conclusion.","Therefore, the team changed the schedule."]
  ];

  const EXPRESSIONS = [
    ["plan to","Reusable plan pattern","Use it to state an intended future action.","The company plans to expand next year."],
    ["plans to","Reusable plan pattern","Use it to state an intended future action.","The company plans to expand next year."],
    ["is intended to","Purpose expression","Use it to explain the purpose of a change.","The change is intended to reduce delays."],
    ["are intended to","Purpose expression","Use it to explain the purpose of a change.","The changes are intended to reduce delays."],
    ["based on","Decision basis","Use it to show what evidence supports a decision.","The decision is based on recent data."],
    ["encouraged to","Instruction pattern","Use it for a polite recommendation.","Employees are encouraged to report problems."],
    ["asked to","Instruction pattern","Use it to report a request.","Staff were asked to arrive early."],
    ["allows customers to","Function pattern","Use it to explain what a service enables users to do.","The app allows customers to change reservations."],
    ["will review","Future review pattern","Use it to describe a planned evaluation.","Managers will review the results next week."]
  ];

  const CHUNKS = [
    "customer service","customer feedback","service quality","delivery time","delivery times",
    "delivery options","pickup locations","business customers","online orders","customer comments",
    "operational problems","additional training","route-planning","service plan","mobile application",
    "distribution center","standard delivery","weekly data","local teams","staff members"
  ];

  const REFERENCES = ["this","that","these","those","it","they","them","their","which","who"];

  function containsWord(sentence,needle){
    const escaped=needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`,"i").test(sentence);
  }

  function subjectHighlight(sentence){
    const words=sentence.match(/[A-Za-z][A-Za-z'-]*|[0-9]+/g)||[];
    if(!words.length)return null;
    const phrase=words.slice(0,Math.min(6,words.length)).join(" ");
    const idx=sentence.toLowerCase().indexOf(phrase.toLowerCase());
    if(idx<0)return null;
    return {
      text:sentence.slice(idx,idx+phrase.length),category:"meaning",note:"Core clause anchor",
      why:"Start here to identify who or what the sentence is mainly about.",
      example:"Identify the main actor first, then connect it to the main action."
    };
  }

  function structureHighlight(sentence){
    const patterns=[
      /\b(?:will|may|can|could|should|must)\s+[a-z]+/i,
      /\b(?:is|are|was|were)\s+(?:being\s+)?[a-z]+(?:ed|ing)\b/i,
      /\b(?:has|have|had)\s+[a-z]+(?:ed|en)\b/i,
      /\b(?:plans?|planned)\s+to\s+[a-z]+/i,
      /\b(?:asked|encouraged|expected|required)\s+(?:\w+\s+)?to\s+[a-z]+/i
    ];
    for(const re of patterns){
      const m=sentence.match(re);
      if(m)return {
        text:m[0],category:"structure",note:"Verb structure",
        why:"This part carries the sentence's tense, modality, or action pattern.",
        example:"Subject → main verb → object/detail."
      };
    }
    return null;
  }

  function buildSentence(sentence,index){
    const highlights=[],seen=new Set();
    const add=h=>{
      if(!h?.text)return;
      const pos=sentence.toLowerCase().indexOf(String(h.text).toLowerCase());
      if(pos<0)return;
      const key=`${h.category}:${String(h.text).toLowerCase()}`;
      if(seen.has(key))return;
      seen.add(key);highlights.push(h);
    };

    add(subjectHighlight(sentence));
    add(structureHighlight(sentence));

    for(const [needle,note,why,example] of LOGIC){
      if(containsWord(sentence,needle))add({text:needle,category:"logic",note,why,example});
    }
    for(const [needle,note,why,example] of EXPRESSIONS){
      if(sentence.toLowerCase().includes(needle))add({text:needle,category:"expression",note,why,example});
    }
    for(const needle of CHUNKS){
      if(sentence.toLowerCase().includes(needle))add({
        text:needle,category:"chunk",note:"Useful word partnership",
        why:"This group of words works as one useful meaning unit.",
        example:`Reuse “${needle}” as one block instead of translating word by word.`
      });
    }
    for(const needle of REFERENCES){
      if(containsWord(sentence,needle))add({
        text:needle,category:"reference",note:"Reference word",
        why:"This word points back to a person, thing, action, or idea in the surrounding context.",
        example:"Check the previous clause or sentence to identify its referent."
      });
    }

    highlights.sort((a,b)=>sentence.toLowerCase().indexOf(a.text.toLowerCase())-sentence.toLowerCase().indexOf(b.text.toLowerCase()));

    const connector=highlights.find(h=>h.category==="logic");
    const expression=highlights.find(h=>h.category==="expression");
    const structure=highlights.find(h=>h.category==="structure");
    const simple=sentence
      .replace(/\bin order to\b/gi,"to").replace(/\bas a result\b/gi,"so")
      .replace(/\badditional\b/gi,"more").replace(/\bevaluate\b/gi,"review")
      .replace(/\s+/g," ").trim();

    return {
      index,sentence,
      simpleEnglish:simple,
      structure:[
        "MAIN SUBJECT / IDEA",
        structure?`ACTION: ${structure.text}`:"MAIN ACTION",
        connector?`CONNECTION: ${connector.text}`:"DETAIL / RESULT"
      ].join(" → "),
      paraphrase:simple,
      imitationPrompt:expression
        ? `Write a new workplace sentence using “${expression.text}”.`
        : connector
          ? `Write a new sentence using “${connector.text}” to connect two ideas.`
          : "Rewrite the sentence with the same basic structure but a different workplace topic.",
      sampleAnswer:"The company reviewed the process and added a new service option.",
      chineseHint:"先找主詞與主要動詞，再判斷後面的資訊是原因、條件、時間、結果或補充細節。",
      highlights
    };
  }

  function buildAnalysis(article){
    const sentences=splitSentences(article.text).map(buildSentence);
    const paragraphs=String(article.text||"").split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);
    const logicFlow=paragraphs.slice(0,5).map(p=>{
      const first=splitSentences(p)[0]||p;
      return first.length>120?first.slice(0,117)+"…":first;
    });
    return {
      articleSummary:sentences.slice(0,2).map(x=>x.simpleEnglish).join(" "),
      logicFlow:logicFlow.length?logicFlow:["Identify the main topic","Follow the supporting details","Track the result or next step"],
      learningGoal:"Track the main action, connections, and reusable English patterns.",
      sentences
    };
  }

  function renderMarked(s,index,filter){
    const candidates=(s.highlights||[]).map((h,spanIndex)=>({
      h,spanIndex,start:s.sentence.toLowerCase().indexOf(String(h.text).toLowerCase())
    })).filter(x=>x.start>=0&&(filter==="all"||x.h.category===filter))
      .sort((a,b)=>a.start-b.start||String(b.h.text).length-String(a.h.text).length);
    let cursor=0,html="";
    for(const item of candidates){
      if(item.start<cursor)continue;
      html+=escHtml(s.sentence.slice(cursor,item.start));
      html+=`<button type="button" class="analysis-mark analysis-${item.h.category}" data-sentence="${index}" data-span="${item.spanIndex}">${escHtml(item.h.text)}</button>`;
      cursor=item.start+String(item.h.text).length;
    }
    html+=escHtml(s.sentence.slice(cursor));
    return html;
  }

  function overviewHtml(a){
    return `<div class="analysis-overview card">
      <p class="eyebrow">READ → DECONSTRUCT → PARAPHRASE → PRODUCE</p>
      <h3>${escHtml(a.learningGoal)}</h3>
      <p>${escHtml(a.articleSummary)}</p>
      <div class="analysis-flow">${a.logicFlow.map((x,i)=>`<span><b>${i+1}</b>${escHtml(x)}</span>`).join("")}</div>
    </div>`;
  }

  function detailHtml(s,h){
    return `<div class="analysis-detail-head">
      <div><span class="analysis-category-dot analysis-${h.category}">${escHtml(LABELS[h.category])}</span><h4>${escHtml(h.text)}</h4></div>
      <button type="button" class="icon-btn" id="analysisDetailClose" aria-label="關閉解析">×</button>
    </div>
    <p class="analysis-detail-note">${escHtml(h.note)}</p>
    <div class="analysis-detail-grid">
      <div><span>WHY IT MATTERS</span><p>${escHtml(h.why)}</p></div>
      <div><span>ANOTHER EXAMPLE</span><p>${escHtml(h.example)}</p></div>
      <div><span>SENTENCE MAP</span><p>${escHtml(s.structure)}</p></div>
      <div><span>PARAPHRASE</span><p>${escHtml(s.paraphrase)}</p></div>
    </div>
    <div class="analysis-produce"><span>YOUR TURN</span><p>${escHtml(s.imitationPrompt)}</p>
      <button type="button" class="ghost" id="analysisShowSample">看英文示範</button>
      <p class="analysis-hidden" id="analysisSample">${escHtml(s.sampleAnswer)}</p>
    </div>
    <div class="analysis-backup">
      <button type="button" class="ghost" id="analysisShowChinese">需要中文提示</button>
      <p class="analysis-hidden" id="analysisChinese">${escHtml(s.chineseHint)}</p>
    </div>`;
  }

  function sentenceHtml(a,filter){
    return a.sentences.map((s,i)=>`<article class="analysis-sentence-card">
      <div class="analysis-sentence-number">${i+1}</div>
      <button type="button" class="analysis-sentence-audio" data-sentence-audio="${i}" aria-label="播放第 ${i+1} 句英文發音">🔊</button>
      <p class="analysis-sentence-text">${renderMarked(s,i,filter)}</p>
      <details class="analysis-simple-english"><summary>SIMPLER ENGLISH</summary><p>${escHtml(s.simpleEnglish)}</p></details>
    </article>`).join("");
  }

  function renderAppDeployAnalysisStep(){
    if(typeof activeLesson==="undefined"||!activeLesson?.text)return;
    const article={id:activeLesson.id,title:activeLesson.title,text:activeLesson.text};
    const analysis=cached(article)||buildAnalysis(article);
    if(!cached(article))saveCache(article,analysis);
    let activeFilter="all";

    body.innerHTML=`<section class="lesson-step article-analysis-step">
      <div class="analysis-title-row">
        <div><p class="eyebrow">STEP 6 · ENGLISH DECONSTRUCTION</p><h3>用英文解構英文</h3></div>
        <span class="badge">English-first</span>
      </div>
      <p class="muted">顏色代表句子裡不同的工作。先讀英文，再點彩色片段看英文解釋；中文只在你需要時才打開。</p>
      ${overviewHtml(analysis)}
      <div class="analysis-legend">${FILTERS.slice(1).map(([k])=>`<span class="analysis-legend-item analysis-${k}">${escHtml(LABELS[k])}</span>`).join("")}</div>
      <div class="filters analysis-filters">${FILTERS.map(([k,label])=>`<button type="button" class="ghost analysis-filter ${k==="all"?"active":""}" data-filter="${k}">${label}</button>`).join("")}</div>
      <div id="analysisSentences" class="analysis-sentences"></div>
      <div id="analysisDetail" class="analysis-detail analysis-hidden"></div>
      <button type="button" class="primary wide" id="analysisContinue">解析完成，開始作答</button>
    </section>`;

    const root=document.querySelector("#analysisSentences");
    const detail=document.querySelector("#analysisDetail");

    function bindSentenceUi(){
      root.querySelectorAll(".analysis-mark").forEach(btn=>btn.onclick=()=>{
        const si=Number(btn.dataset.sentence),hi=Number(btn.dataset.span);
        const sentence=analysis.sentences[si],h=sentence?.highlights?.[hi];
        if(!sentence||!h)return;
        detail.innerHTML=detailHtml(sentence,h);
        detail.classList.remove("analysis-hidden");
        detail.querySelector("#analysisDetailClose").onclick=()=>detail.classList.add("analysis-hidden");
        detail.querySelector("#analysisShowSample").onclick=()=>detail.querySelector("#analysisSample").classList.toggle("analysis-hidden");
        detail.querySelector("#analysisShowChinese").onclick=()=>detail.querySelector("#analysisChinese").classList.toggle("analysis-hidden");
      });

      root.querySelectorAll(".analysis-sentence-audio").forEach(btn=>btn.onclick=()=>{
        const i=Number(btn.dataset.sentenceAudio);
        const sentence=analysis.sentences[i]?.sentence||"";
        if(window.toeicToggleSpeech)return window.toeicToggleSpeech(sentence,`analysis:${article.id}:${i}`,btn);
        if(typeof speech==="function")return speech(sentence,"en-US");
      });
    }

    function rerender(){
      root.innerHTML=sentenceHtml(analysis,activeFilter);
      detail.classList.add("analysis-hidden");
      bindSentenceUi();
    }

    document.querySelectorAll(".analysis-filter").forEach(btn=>btn.onclick=()=>{
      activeFilter=btn.dataset.filter||"all";
      document.querySelectorAll(".analysis-filter").forEach(x=>x.classList.toggle("active",x===btn));
      rerender();
    });

    document.querySelector("#analysisContinue").onclick=()=>{
      if(window.toeicStopAudio)window.toeicStopAudio();
      readingStarted=Date.now();
      renderLessonQuestion();
    };
    rerender();
  }

  window.renderAppDeployAnalysisStep=renderAppDeployAnalysisStep;
  try{renderAnalysisStep=renderAppDeployAnalysisStep}catch(_){window.renderAnalysisStep=renderAppDeployAnalysisStep}
})();
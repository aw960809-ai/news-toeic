(() => {
  "use strict";

  let lessonStep = 0;
  let lessonReadingMs = 0,finished=false,readOnly=false;
  const PROGRESS_KEY="toeicArticleProgressV1";
  let flowSessionId="",pausedAt=0;
  function progressRows(){const raw=localStorage.getItem(PROGRESS_KEY);return raw?JSON.parse(raw):{}}
  function snapshot(){
    if(!activeLesson?.id||finished||readOnly)return;
    try{
      const rows=progressRows();rows[activeLesson.id]={lesson:activeLesson,step:lessonStep,readingMs:lessonReadingMs+(lessonStep===1&&readingStarted?Date.now()-readingStarted:0),
        elapsedMs:Math.max(0,(pausedAt||Date.now())-lessonStarted),answers,qIndex,sessionId:flowSessionId,savedAt:now()};
      localStorage.setItem(PROGRESS_KEY,JSON.stringify(rows));
    }catch(e){console.error("Article progress not saved",e);toast("本次進度無法保存，請先匯出備份；勿清除網站資料")}
  }
  function pauseProgress(){if(!activeLesson||finished||readOnly||pausedAt)return;snapshot();if(lessonStep===1&&readingStarted){lessonReadingMs+=Date.now()-readingStarted;readingStarted=0}pausedAt=Date.now()}
  function resumeProgress(){if(!pausedAt)return;lessonStarted+=Date.now()-pausedAt;pausedAt=0;if(lessonStep===1)readingStarted=Date.now()}
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")pauseProgress();else if(dialog.open)resumeProgress()});
  window.addEventListener("pagehide",pauseProgress);
  dialog.addEventListener("close",pauseProgress);

  function resetScroll(){
    requestAnimationFrame(() => {
      try { body.scrollTop = 0; } catch {}
      try { dialog.scrollTop = 0; } catch {}
      try { body.scrollTo({top:0,left:0,behavior:"instant"}); } catch {}
      try { dialog.scrollTo({top:0,left:0,behavior:"instant"}); } catch {}
    });
  }

  function vocabHtml(){
    return (activeLesson?.vocabulary || []).map(v => {
      const word = Array.isArray(v) ? v[0] : v.word;
      const meaning = Array.isArray(v) ? v[1] : v.meaning;
      const collocation = Array.isArray(v) ? v[2] : v.collocation;
      return `<div class="word"><div><strong>${esc(word||"")}</strong><br><span class="muted">${esc(meaning||"")}</span></div><span class="badge">${esc(collocation||"")}</span></div>`;
    }).join("");
  }

  function grammarHtml(){
    return (activeLesson?.grammar || []).map(g => {
      const title = Array.isArray(g) ? g[0] : g.title;
      const example = Array.isArray(g) ? g[1] : g.example;
      return `<div class="card"><strong>${esc(title||"")}</strong><p class="muted">${esc(example||"")}</p></div>`;
    }).join("");
  }

  function validWpm(){
    if(!activeLesson?.text || !lessonReadingMs) return 0;
    const wpm = Math.round(wordCount(activeLesson.text) / (lessonReadingMs / 60000));
    return wpm >= 40 && wpm <= 450 ? wpm : 0;
  }

  function renderStep(){
    if(!activeLesson?.text) return;
    window.toeicStopAudio?.();
    resetScroll();
    snapshot();

    if(lessonStep === 0){
      body.innerHTML = `<section class="lesson-step">
        <p class="eyebrow">STEP 1 · PREVIEW</p>
        <h3>${esc(activeLesson.title)}</h3>
        <p>先看標題預測 Who / What / Why。</p>${activeLesson.adaptationMode?`<p class="notice">新聞題材延伸練習：下文是本機組合的假設情境，不是原新聞逐事實改寫。</p>`:""}${readOnly?`<p class="notice">已完成教材閱覽；不重複計入成績、錯題或 Goal Sync。</p>`:""}
        <button class="primary nextStep">開始閱讀</button>
      </section>`;
    } else if(lessonStep === 1){
      readingStarted = Date.now();
      body.innerHTML = `<section class="lesson-step">
        <p class="eyebrow">STEP 2 · TIMED READING</p>
        <span class="badge">${wordCount(activeLesson.text)} words</span>
        <div class="quote" style="white-space:pre-line">${esc(activeLesson.text)}</div>
        <div class="actions">
          <button id="speakArticle" class="secondary">🔊 播放全文</button>
          <button id="readDone" class="primary">讀完了</button>
        </div>
      </section>`;
      const audioBtn = document.querySelector("#speakArticle");
      audioBtn.onclick = () => window.toeicToggleSpeech
        ? window.toeicToggleSpeech(activeLesson.text, `article:${activeLesson.id}`, audioBtn)
        : speech(activeLesson.text);
      document.querySelector("#readDone").onclick = () => {
        window.toeicStopAudio?.();
        lessonReadingMs = Math.max(1000, lessonReadingMs + (readingStarted?Date.now()-readingStarted:0));
        readingStarted=0;
        lessonStep = 2;
        renderStep();
      };
      return;
    } else if(lessonStep === 2){
      const wpm = validWpm();
      body.innerHTML = `<section class="lesson-step">
        <p class="eyebrow">STEP 3 · READING SPEED</p>
        <h3>${wpm ? `${wpm} WPM` : "WPM 未計入"}</h3>
        ${wpm ? "" : `<p class="muted">此次速度超出 40–450 WPM 的可用量測範圍，因此不寫入平均或能力判斷。</p>`}
        <button class="primary nextStep">查看單字</button>
      </section>`;
    } else if(lessonStep === 3){
      body.innerHTML = `<section class="lesson-step">
        <p class="eyebrow">STEP 4 · VOCABULARY</p>
        <div class="card">${vocabHtml()}</div>
        <button class="primary nextStep">文法重點</button>
      </section>`;
    } else if(lessonStep === 4){
      body.innerHTML = `<section class="lesson-step">
        <p class="eyebrow">STEP 5 · GRAMMAR</p>
        ${grammarHtml()}
        <button class="primary nextStep">文章解析</button>
      </section>`;
    } else if(lessonStep === 5){
      if(typeof window.renderAppDeployAnalysisStep === "function"){
        window.renderAppDeployAnalysisStep();
      }else if(typeof renderAnalysisStep === "function"){
        renderAnalysisStep();
      }else{
        body.innerHTML = `<section class="lesson-step">
          <p class="eyebrow">STEP 6 · ENGLISH DECONSTRUCTION</p>
          <h3>文章解析暫時無法建立</h3>
          <div class="actions">
            <button class="primary" id="retryAnalysis">重新建立解析</button>
            <button class="secondary" id="skipAnalysis">略過並開始作答</button>
          </div>
        </section>`;
        document.querySelector("#retryAnalysis").onclick = renderStep;
        document.querySelector("#skipAnalysis").onclick = () => {
          lessonStep = 6;
          renderLessonQuestion();
        };
      }
      return;
    } else {
      renderLessonQuestion();
      return;
    }

    document.querySelector(".nextStep").onclick = () => {
      lessonStep += 1;
      renderStep();
    };
  }

  openLesson = function(id){
    if(activeLesson&&!finished&&!readOnly&&dialog.open)snapshot();
    let previous=null;try{previous=progressRows()[id]||null}catch(e){console.error(e)}
    const completed=sessions().some(row=>row.articleId===id),a=!completed&&previous?.lesson?.id===id?previous.lesson:allLessons().find(x=>x.id===id);
    if(!a?.text||!Array.isArray(a.questions))return;
    activeLesson=a;finished=false;readOnly=completed;pausedAt=0;
    const prior=!readOnly?previous:null;
    lessonStarted=Date.now()-(prior?.elapsedMs||0);readingStarted=0;lessonReadingMs=prior?.readingMs||0;
    lessonStep=prior?.step||0;answers=Array.isArray(prior?.answers)?prior.answers:[];qIndex=prior?.qIndex||0;
    flowSessionId=prior?.sessionId||`toeic-${Date.now()}-${a.id}`;
    if(!readOnly&&!prior){activeLesson={...a,questions:window.ToeicRandomEngine.balanceAnswers(a.questions,flowSessionId)}}
    dialogTitle.textContent=a.title;if(!dialog.open)dialog.showModal();renderStep();
  };

  renderLessonIntro = renderStep;

  renderLessonQuestion = function(){
    lessonStep=6;snapshot();
    const qs = activeLesson?.questions || [];
    if(qIndex >= qs.length) return finishLesson();
    window.toeicStopAudio?.();
    resetScroll();
    const item = qs[qIndex];
    body.innerHTML = `<section class="lesson-step">
      <p class="eyebrow">${esc(item.part)}</p>
      <div class="section-head">
        <span class="badge">${esc(item.skill || "TOEIC")}</span>
        <span class="badge">${qIndex + 1}/${qs.length}</span>
      </div>
      <h3>${esc(item.q)}</h3>${item.displayText?`<div class="practice-passage">${esc(item.displayText)}</div>`:""}
      <div class="option-grid">
        ${item.options.map((o,i)=>`<button class="option lesson-option" data-i="${i}">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join("")}
      </div>
      <div id="lessonFeedback"></div>
    </section>`;
    const choose = choice => {
      const correct=choice===item.answer;
      if(!answers[qIndex]){answers[qIndex]={q:item,choice,correct};snapshot();if(!correct&&!readOnly)registerNewsMistake(item,choice,activeLesson)}
      document.querySelectorAll(".lesson-option").forEach((x,i)=>{
        x.disabled = true;
        if(i === item.answer) x.classList.add("correct");
        else if(i === choice) x.classList.add("wrong");
      });
      document.querySelector("#lessonFeedback").innerHTML = `<div class="card">
        <b>${correct ? "答對了" : "需要複習"}</b>
        <p class="muted">${esc(item.explain)}</p>
        <button class="primary" id="nextQ">${qIndex + 1 === qs.length ? "完成訓練" : "下一題"}</button>
      </div>`;
      document.querySelector("#nextQ").onclick = () => {
        qIndex += 1;
        renderLessonQuestion();
      };
    };
    document.querySelectorAll(".lesson-option").forEach(b=>b.onclick=()=>{if(!answers[qIndex])choose(Number(b.dataset.i))});
    if(answers[qIndex])choose(answers[qIndex].choice);
  };

  finishLesson = function(){
    window.toeicStopAudio?.();
    if(finished)return;
    if(readOnly){body.innerHTML='<section class="lesson-step"><h3>閱覽完成</h3><p>原成績與錯題未改動。</p><button class="primary" id="closeReadOnly">完成</button></section>';document.querySelector('#closeReadOnly').onclick=()=>{dialog.close();render()};return}
    const qs = activeLesson?.questions || [];
    if(!qs.length||answers.filter(Boolean).length<qs.length)return;
    const correct = answers.filter(x => x.correct).length;
    const total = qs.length;
    const duration = Math.max(1, Math.round((Date.now() - lessonStarted) / 60000));
    const wpm = validWpm();

    const rows = sessions();
    const sessionId = flowSessionId;
    if(!rows.some(r=>r.id===sessionId))rows.push({
      id:sessionId,
      articleId:activeLesson.id,
      date:dayKey(),
      title:activeLesson.title,
      startedAt:new Date(lessonStarted).toISOString(),
      endedAt:now(),
      durationMinutes:duration,
      wpm,
      correct,
      total
    });
    save(KEYS.sessions, rows);

    const d = load(KEYS.daily,null);
    if(d?.date === dayKey() && d.articleId === activeLesson.id){
      save(KEYS.daily,{...d,completed:true});
    }

    const part5 = answers.filter(x=>x.q.part==="Part 5");
    const part6 = answers.filter(x=>x.q.part==="Part 6");
    const part7 = answers.filter(x=>x.q.part==="Part 7");

    const event=makeGoalEvent(
      activeLesson.title,
      duration,
      total,
      correct,
      answers.filter(x=>!x.correct).map(x=>x.q.skill),
      {
        articleId:activeLesson.id,
        category:activeLesson.category,
        articlesCompleted:1,
        wordCount:wordCount(activeLesson.text),
        readingWpm:wpm,
        part5Answered:part5.length,
        part5Correct:part5.filter(x=>x.correct).length,
        part6Answered:part6.length,
        part6Correct:part6.filter(x=>x.correct).length,
        part7Answered:part7.length,
        part7Correct:part7.filter(x=>x.correct).length
      }
    );event.eventId=sessionId;publishGoalEvent(event);
    finished=true;
    try{const progress=progressRows();delete progress[activeLesson.id];localStorage.setItem(PROGRESS_KEY,JSON.stringify(progress))}catch(e){console.error(e)}

    body.innerHTML = `<section class="lesson-step">
      <p class="eyebrow">SESSION COMPLETE</p>
      <h3>${correct}/${total} 題答對</h3>
      <div class="grid stats">
        <div class="card stat"><small>Words</small><strong>${wordCount(activeLesson.text)}</strong></div>
        <div class="card stat"><small>WPM</small><strong>${wpm || "未計入"}</strong></div>
        <div class="card stat"><small>Accuracy</small><strong>${total ? Math.round(correct/total*100) : 0}%</strong></div>
      </div>
      <div class="card"><strong>已寫入 GitHub Goal Sync</strong><p class="muted">本次有效學習 ${duration} 分鐘；學習紀錄與錯題都已保存。</p></div>
      <button id="lessonDone" class="primary wide">完成</button>
    </section>`;
    document.querySelector("#lessonDone").onclick = () => {
      dialog.close();
      render();
    };
    resetScroll();
  };
})();
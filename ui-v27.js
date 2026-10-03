(() => {
  'use strict';

  document.body.classList.add('toeic-v27');

  const baseBind = window.bind;

  function todayMinutes(){
    const d = dayKey();
    const reading = analyticsSessions().filter(x => x.date === d)
      .reduce((n,x) => n + (Number(x.durationMinutes) || 0), 0);
    const practice = partSessions().filter(x => x.date === d)
      .reduce((n,x) => n + (Number(x.durationMinutes) || 0), 0);
    const mock = mockHistory().filter(x => x.date === d)
      .reduce((n,x) => n + (Number(x.durationMinutes) || 0), 0);
    return Math.round(reading + practice + mock);
  }

  function reviewCount(){
    return [...newsMistakes(), ...partMistakes()].filter(x => x.status !== 'mastered').length;
  }

  function currentLesson(){
    const assigned = load(KEYS.daily, null);
    const found = assigned?.articleId ? allLessons().find(x => x.id === assigned.articleId) : null;
    return found || allLessons()[0];
  }

  window.todayPage = function(){
    const mins = todayMinutes();
    const goal = Math.max(1, Number(settings.dailyMinutes) || 30);
    const pct = Math.min(100, Math.round(mins / goal * 100));
    const lesson = currentLesson();
    const reviews = reviewCount();

    return `<section class="v27-home">
      <div class="v27-today-head">
        <div>
          <p class="eyebrow">TODAY · ${dayKey()}</p>
          <div class="v27-minutes"><strong>${mins}</strong><span>min</span></div>
          <p class="v27-sub">今日學習 · 目標 ${goal} 分鐘</p>
        </div>
        <span class="badge">${pct}%</span>
      </div>
      <div class="progressbar"><i style="width:${pct}%"></i></div>

      <section class="v27-quick">
        <p class="eyebrow">QUICK START</p>
        <h2>現在有多少時間？</h2>
        <p class="muted">不用挑題，直接開始；零碎時間只安排 Reading。</p>
        <div class="v27-time-grid">
          <button class="v27-time quick-time" data-min="1">1 分鐘</button>
          <button class="v27-time quick-time" data-min="3">3 分鐘</button>
          <button class="v27-time quick-time" data-min="5">5 分鐘</button>
          <button class="v27-time quick-time" data-min="10">10 分鐘</button>
        </div>
      </section>

      <div class="section-head"><h3>今天讀一篇</h3><span class="badge">推薦</span></div>
      <section class="card v27-recommend">
        <h3>${esc(lesson.title)}</h3>
        <p class="muted">${esc(lesson.source || 'Reading')} · ${esc(lesson.category || 'Business')} · 建議 ${targetWords()} 字</p>
        <button class="primary wide v27-start-lesson" data-id="${esc(lesson.id)}">開始閱讀</button>
        <button class="secondary wide" id="chooseNewsV27">換一篇教材</button>
      </section>

      <div class="section-head"><h3>再戰一次</h3><span class="badge">${reviews} 題</span></div>
      <section class="card">
        <strong>${reviews ? `有 ${reviews} 題還沒完全掌握` : '目前沒有待複習題目'}</strong>
        <p class="muted">${reviews ? '把以前錯過的題目重新做一次，不需要重新找題。' : '今天可以把時間留給新題或閱讀。'}</p>
        ${reviews ? '<button class="secondary wide" id="openReviewV27">查看待複習</button>' : ''}
      </section>
    </section>`;
  };

  window.newsPage = function(){
    const items = Array.isArray(news) ? news.slice(0, 12) : [];
    return `<section class="hero v27-hero">
      <p class="eyebrow">READING CENTER</p>
      <h2>閱讀教材</h2>
      <p>新聞只保留作為閱讀題材；讀完後再進理解題、單字、句型與後續複習。</p>
    </section>
    <div class="section-head"><h3>最新題材</h3><button id="reloadNews" class="secondary">更新</button></div>
    <section class="grid">${items.length ? items.map(n => `
      <article class="card news-card">
        <div class="news-meta"><span class="badge">${esc(n.category || 'Business')}</span><span class="badge">${esc(n.source || 'News')}</span></div>
        <h3>${esc(n.title)}</h3>
        <p class="muted">${esc(n.summary || '')}</p>
        <div class="actions">
          <button class="primary make-lesson" data-id="${esc(n.id)}">開始閱讀</button>
          ${n.url ? `<a class="secondary" href="${esc(n.url)}" target="_blank" rel="noopener">來源</a>` : ''}
        </div>
      </article>`).join('') : '<div class="card"><p class="muted">目前沒有可用新聞題材；既有教材與題目仍可使用。</p></div>'}
    </section>`;
  };

  window.practicePage = function(){
    return `<section class="hero v27-hero">
      <p class="eyebrow">PRACTICE</p>
      <h2>Part 5–7 練習</h2>
      <p>日常練習聚焦 Reading；Listening 不再放在平常入口。</p>
    </section>
    <div class="section-head"><h3>選擇題型</h3><span class="badge">Reading</span></div>
    <section class="v27-parts">
      <button data-part="5"><strong>Part 5 · 句子填空</strong><small>文法／詞彙／搭配</small></button>
      <button data-part="6"><strong>Part 6 · 段落填空</strong><small>篇章脈絡／句子填空</small></button>
      <button data-part="7"><strong>Part 7 · 閱讀理解</strong><small>資訊定位／推論／同義改寫</small></button>
    </section>
    <div class="section-head"><h3>能力檢驗</h3></div>
    <section class="card">
      <h3>全真模考</h3>
      <p class="muted">完整 200 題保留為獨立考試模式；只有進入全真模考時才使用 Listening。</p>
      <button id="startFullMockV27" class="secondary wide">進入全真模考</button>
    </section>`;
  };

  window.progressPage = function(){
    const ss = analyticsSessions();
    const ps = partSessions();
    const mh = mockHistory();
    const reviews = reviewCount();
    const mins = ss.reduce((a,b)=>a+(Number(b.durationMinutes)||0),0)
      + ps.reduce((a,b)=>a+(Number(b.durationMinutes)||0),0)
      + mh.reduce((a,b)=>a+(Number(b.durationMinutes)||0),0);

    return `<section class="hero v27-hero">
      <p class="eyebrow">MY TOEIC</p>
      <h2>${settings.currentLevel} → ${settings.targetScore}</h2>
      <p>分析、錯題與設定集中在這裡；首頁只負責讓你快速開始。</p>
    </section>
    <section class="kpis v27-kpis">
      <div class="card kpi"><small>閱讀</small><strong>${ss.length}</strong></div>
      <div class="card kpi"><small>練習</small><strong>${ps.length}</strong></div>
      <div class="card kpi"><small>模考</small><strong>${mh.length}</strong></div>
    </section>
    <div class="section-head"><h3>學習資料</h3><span class="badge">${Math.round(mins)} 分</span></div>
    <section class="grid">
      <div class="card"><h3>錯題與複習</h3><p class="muted">目前 ${reviews} 題待處理。</p><button id="openReviewV27" class="secondary wide">查看複習</button></div>
      <div class="card"><h3>設定、同步與備份</h3><p class="muted">目標分數、每日分鐘、Goal Sync、版本更新與備份。</p><button id="openSettingsV27" class="secondary wide">開啟設定</button></div>
    </section>
    <div class="section-head"><h3>近期閱讀</h3></div>
    <section class="grid">${ss.length ? ss.slice(-6).reverse().map(x => `
      <div class="card"><strong>${esc(x.title || '訓練')}</strong><p class="muted">${esc(x.date || '')} · ${x.correct || 0}/${x.total || 0} · ${displayWpm(x.wpm)}</p></div>`).join('') : '<div class="card"><p class="muted">尚無紀錄。</p></div>'}
    </section>`;
  };

  window.bind = function(){
    if(typeof baseBind === 'function') baseBind();

    document.querySelectorAll('.quick-time').forEach(b => {
      b.onclick = () => {
        const m = Number(b.dataset.min);
        const plan = m === 1 ? [5,2] : m === 3 ? [5,5] : m === 5 ? [6,5] : [7,8];
        startPractice(plan[0], plan[1]);
      };
    });

    document.querySelectorAll('.v27-start-lesson').forEach(b => {
      b.onclick = () => openLesson(b.dataset.id);
    });

    document.querySelector('#chooseNewsV27')?.addEventListener('click', () => switchRoute('news'));
    document.querySelector('#openReviewV27')?.addEventListener('click', () => switchRoute('review'));
    document.querySelector('#openSettingsV27')?.addEventListener('click', () => switchRoute('settings'));
    document.querySelector('#startFullMockV27')?.addEventListener('click', () => startFullMock('strict'));
  };

  try{ render(); }catch(e){ console.error('TOEIC v2.7 UI', e); }
})();
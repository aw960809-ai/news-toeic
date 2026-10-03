(() => {
  'use strict';

  document.body.classList.add('toeic-v27', 'toeic-v272');

  const baseBind = window.bind;
  let newsVisible = 6;

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

  function shortSource(value){
    const s = String(value || 'News').trim();
    return s.length > 24 ? s.slice(0, 23) + '…' : s;
  }

  function chips(values){
    return `<div class="v272-chips">${values.filter(Boolean).map(v => `<span>${esc(v)}</span>`).join('')}</div>`;
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
        <div class="v272-quick-head">
          <div>
            <p class="eyebrow">QUICK START</p>
            <h2>現在有多少時間？</h2>
          </div>
          <span class="v272-mini-note">Reading</span>
        </div>
        <div class="v27-time-grid">
          <button class="v27-time quick-time" data-min="1">1 分</button>
          <button class="v27-time quick-time" data-min="3">3 分</button>
          <button class="v27-time quick-time" data-min="5">5 分</button>
          <button class="v27-time quick-time" data-min="10">10 分</button>
        </div>
      </section>

      <div class="section-head"><h3>今天讀一篇</h3><span class="badge">推薦</span></div>
      <section class="card v27-recommend">
        ${chips([lesson.category || 'Business', targetWords() + ' words', '約 5–8 分'])}
        <h3 class="v272-title-2">${esc(lesson.title)}</h3>
        <div class="v272-action-row">
          <button class="primary v27-start-lesson" data-id="${esc(lesson.id)}">開始閱讀</button>
          <button class="secondary" id="chooseNewsV27">換一篇</button>
        </div>
      </section>

      <div class="section-head"><h3>再戰一次</h3><span class="badge">${reviews} 題</span></div>
      <section class="card v272-review-card">
        <div>
          <strong>${reviews ? `有 ${reviews} 題還沒完全掌握` : '目前沒有待複習題目'}</strong>
          <p class="muted">${reviews ? '把以前錯過的題目重新做一次。' : '今天可以把時間留給新題或閱讀。'}</p>
        </div>
        ${reviews ? '<button class="secondary" id="openReviewV27">複習</button>' : ''}
      </section>
    </section>`;
  };

  window.newsPage = function(){
    const all = Array.isArray(news) ? news : [];
    const items = all.slice(0, newsVisible);
    const remaining = Math.max(0, all.length - items.length);

    return `<section class="hero v27-hero v272-compact-hero">
      <p class="eyebrow">READING CENTER</p>
      <div class="v272-hero-row">
        <div>
          <h2>閱讀教材</h2>
          <p>新聞題材 → 理解題 → 單字／句型 → 複習。</p>
        </div>
        <span class="badge">${all.length} 篇</span>
      </div>
    </section>

    <div class="section-head v272-material-head">
      <h3>最新題材</h3>
      <button id="reloadNews" class="secondary v272-small-btn">更新</button>
    </div>

    <section class="v272-material-list">${items.length ? items.map(n => `
      <article class="card v272-material-card">
        ${chips([n.category || 'Business', shortSource(n.source)])}
        <h3 class="v272-title-2">${esc(n.title)}</h3>
        <div class="v272-material-actions">
          <button class="primary make-lesson" data-id="${esc(n.id)}">閱讀</button>
          ${n.url ? `<a class="secondary" href="${esc(n.url)}" target="_blank" rel="noopener">來源</a>` : ''}
        </div>
      </article>`).join('') : '<div class="card"><p class="muted">目前沒有可用新聞題材；既有教材與題目仍可使用。</p></div>'}
    </section>

    ${remaining ? `<button id="showMoreMaterials" class="v272-more">再顯示 ${Math.min(6, remaining)} 篇 <span>剩餘 ${remaining}</span></button>` : ''}`;
  };

  window.practicePage = function(){
    return `<section class="hero v27-hero v272-compact-hero">
      <p class="eyebrow">PRACTICE</p>
      <div class="v272-hero-row">
        <div>
          <h2>Part 5–7 練習</h2>
          <p>日常練習只保留 Reading。</p>
        </div>
        <span class="badge">Reading</span>
      </div>
    </section>

    <div class="section-head"><h3>選擇題型</h3></div>
    <section class="v27-parts">
      <button data-part="5"><strong>Part 5 · 句子填空</strong><small>文法／詞彙／搭配</small></button>
      <button data-part="6"><strong>Part 6 · 段落填空</strong><small>篇章脈絡／句子填空</small></button>
      <button data-part="7"><strong>Part 7 · 閱讀理解</strong><small>資訊定位／推論／同義改寫</small></button>
    </section>

    <div class="section-head"><h3>能力檢驗</h3></div>
    <section class="card v272-mock-card">
      <div>
        <h3>全真模考</h3>
        <p class="muted">完整 200 題；Listening 只在全真模考使用。</p>
      </div>
      <button id="startFullMockV27" class="secondary">進入</button>
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

    return `<section class="hero v27-hero v272-compact-hero">
      <p class="eyebrow">MY TOEIC</p>
      <div class="v272-hero-row">
        <div>
          <h2>${settings.currentLevel} → ${settings.targetScore}</h2>
          <p>學習資料與設定集中管理。</p>
        </div>
        <span class="badge">${Math.round(mins)} 分</span>
      </div>
    </section>

    <section class="v272-stat-row">
      <div><small>閱讀</small><strong>${ss.length}</strong></div>
      <div><small>練習</small><strong>${ps.length}</strong></div>
      <div><small>模考</small><strong>${mh.length}</strong></div>
    </section>

    <div class="section-head"><h3>設定</h3></div>
    <button id="openSettingsV27" class="card v272-settings-row">
      <span class="v272-settings-icon">⚙</span>
      <span class="v272-settings-copy">
        <strong>設定與同步</strong>
        <small>目標分數 · 每日分鐘 · Goal Sync · 系統更新 · 備份</small>
      </span>
      <span class="v272-settings-arrow">›</span>
    </button>

    <div class="section-head"><h3>學習資料</h3></div>
    <button id="openReviewV27" class="card v272-review-row">
      <span>
        <strong>錯題與複習</strong>
        <small>${reviews} 題待處理</small>
      </span>
      <span>›</span>
    </button>

    <div class="section-head"><h3>近期閱讀</h3></div>
    <section class="v272-recent-list">${ss.length ? ss.slice(-6).reverse().map(x => `
      <article class="card v272-recent-row">
        <strong class="v272-title-2">${esc(x.title || '訓練')}</strong>
        <span>${esc(x.date || '')} · ${x.correct || 0}/${x.total || 0} · ${displayWpm(x.wpm)}</span>
      </article>`).join('') : '<div class="card"><p class="muted">尚無紀錄。</p></div>'}
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
    document.querySelector('#showMoreMaterials')?.addEventListener('click', () => {
      newsVisible += 6;
      render();
    });
  };

  try{ render(); }catch(e){ console.error('TOEIC v2.7.2 UI', e); }
})();
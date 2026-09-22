(() => {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;
  const MODE_COUNTS = {
    quick:{1:1,2:1,3:3,4:3,5:4,6:4,7:4},
    standard:{1:3,2:10,3:9,4:9,5:10,6:8,7:10},
    mock:{1:6,2:25,3:39,4:30,5:30,6:16,7:54}
  };
  const BLOCK_SIZE = {1:1,2:10,3:3,4:3,5:10,6:4,7:5};
  const FULL_COUNTS = {1:6,2:25,3:39,4:30,5:30,6:16,7:54};
  const PART_NAMES = {1:'照片描述',2:'應答問題',3:'簡短對話',4:'簡短獨白',5:'句子填空',6:'段落填空',7:'閱讀理解'};
  const ACCENTS = ['US','UK','CA','AU-NZ'];
  const ACCENT_LANGS = {US:['en-US'],UK:['en-GB'],CA:['en-CA'],'AU-NZ':['en-AU','en-NZ']};
  const READING_SECONDS = 75 * 60;
  const QUALITY_THRESHOLD = 82;

  const localLoad = (k,f) => { try { const r=localStorage.getItem(k); return r?JSON.parse(r):f } catch { return f } };
  const localSave = (k,v) => localStorage.setItem(k,JSON.stringify(v));

  // ---------------------------------------------------------------------------
  // DAILY MAIN ARTICLE — AppDeploy candidate-pool semantics
  // ---------------------------------------------------------------------------
  const dailyHistory = () => localLoad(KEYS.dailyHistory,[]);
  const candidatePool = () => {
    const pool=localLoad(KEYS.dailyPool,null);
    if(!pool || pool.date!==dayKey() || !Array.isArray(pool.items) || pool.items.length!==3){
      if(pool) localStorage.removeItem(KEYS.dailyPool);
      return null;
    }
    return pool;
  };
  const currentDailyAssignment = () => {
    const a=localLoad(KEYS.daily,null);
    if(!a || a.date!==dayKey()) return null;
    if(!a.selectedByUser && !a.completed){ localStorage.removeItem(KEYS.daily); return null }
    return a;
  };
  const lessonIdForLive = a => `lesson-${String(a.id||'').replace(/[^a-zA-Z0-9-]/g,'-')}`;
  const categoryFit = a => settings.category==='Balanced'||a.category===settings.category ? 1 : 0;
  const abilityTarget = () => {
    const midpoint=(Number(settings.currentLevel||600)+Number(settings.targetScore||750))/2;
    return Math.max(65,Math.min(95,70+(midpoint-600)/12));
  };
  const bestScore = a => {
    const ageHours=Math.max(0,(Date.now()-(Date.parse(a.publishedAt||'')||Date.now()))/3600000);
    const fresh=Math.max(0,72-ageHours);
    return (Number(a.toeicScore)||0)*0.58 + fresh*0.32 + categoryFit(a)*12;
  };
  function ensureDailyCandidates(){
    if(currentDailyAssignment() || candidatePool() || !Array.isArray(news) || !news.length) return;
    const used=new Set([
      ...dailyHistory().map(x=>x.articleId),
      ...sessions().map(x=>x.articleId||'')
    ]);
    const available=news.filter(a=>!used.has(lessonIdForLive(a)));
    const picked=[];
    const remaining=()=>available.filter(a=>!picked.some(p=>p.kind==='live'&&p.id===a.id));
    const take=(role,list)=>{ const a=list[0]; if(a) picked.push({role,kind:'live',id:a.id}) };

    take('best',[...remaining()].sort((a,b)=>bestScore(b)-bestScore(a)||String(a.id).localeCompare(String(b.id))));
    take('latest',[...remaining()].sort((a,b)=>(Date.parse(b.publishedAt||'')-Date.parse(a.publishedAt||''))||(categoryFit(b)-categoryFit(a))||((b.toeicScore||0)-(a.toeicScore||0))));
    const target=abilityTarget();
    take('ability',[...remaining()].sort((a,b)=>(Math.abs((a.toeicScore||0)-target)-Math.abs((b.toeicScore||0)-target))||(categoryFit(b)-categoryFit(a))||(Date.parse(b.publishedAt||'')-Date.parse(a.publishedAt||''))));

    const roles=['best','latest','ability'];
    if(picked.length<3){
      const fallback=allLessons().filter(a=>a.text&&a.questions?.length&&!used.has(a.id)&&!picked.some(p=>p.kind==='lesson'&&p.id===a.id))
        .sort((a,b)=>(categoryFit(b)-categoryFit(a))||((b.toeicScore||0)-(a.toeicScore||0))||(Date.parse(b.publishedAt||'')-Date.parse(a.publishedAt||'')));
      while(picked.length<3 && fallback.length) picked.push({role:roles[picked.length],kind:'lesson',id:fallback.shift().id});
    }
    if(picked.length===3) localSave(KEYS.dailyPool,{date:dayKey(),items:picked});
  }
  const candidateArticle = item => item.kind==='live' ? news.find(a=>a.id===item.id)||null : allLessons().find(a=>a.id===item.id)||null;
  const candidateLabel = role => role==='best'?'最佳推薦':role==='latest'?'最新新聞':'能力適配';
  const candidateReason = role => role==='best'?'綜合時效、TOEIC 適配度與內容偏好':role==='latest'?'候選池中發布時間最新':`依目前 ${settings.currentLevel} → ${settings.targetScore} 與 ${appdeployTargetLength()} words 調整教材`;

  function parityCandidateCard(item){
    const a=candidateArticle(item);
    if(!a) return '';
    const full=!!(a.text&&a.questions?.length);
    const summary=String(a.summary||'').replace(/\s+/g,' ').trim() || `來自 ${a.source||'新聞來源'} 的候選。`;
    return `<article class="card article-card">
      <div class="article-meta"><span class="badge">${candidateLabel(item.role)}</span><span class="badge">${esc(a.category||'Business')}</span><span class="badge">${full?`${wordCount(a.text)} words`:`目標 ${appdeployTargetLength()} words`}</span><span class="badge score">TOEIC ${Number(a.toeicScore||75)}</span></div>
      <h3>${esc(a.title)}</h3><p class="article-summary">${esc(summary)}</p>
      <p class="muted">${candidateReason(item.role)}${a.origin==='live'||!a.text?` · ${a.publishedAt?new Date(a.publishedAt).toLocaleDateString('zh-TW'):''}`:''}</p>
      <div class="actions"><button class="primary choose-main" data-kind="${item.kind}" data-id="${esc(item.id)}">選這篇作為今日主文章</button>${a.url?`<a class="ghost source-link" href="${esc(a.url)}" target="_blank" rel="noopener">原新聞</a>`:''}</div>
    </article>`;
  }

  let dailyChoosing=false;
  async function chooseDailyCandidate(kind,id){
    if(dailyChoosing || currentDailyAssignment()) return;
    const pool=candidatePool();
    const item=pool?.items.find(x=>x.kind===kind&&x.id===id);
    if(!item) return;
    dailyChoosing=true; render();
    try{
      let lesson;
      if(kind==='lesson') lesson=allLessons().find(a=>a.id===id);
      else{
        const source=news.find(a=>a.id===id);
        if(!source) throw new Error('Candidate source unavailable');
        const generatedId=lessonIdForLive(source);
        lesson=allLessons().find(a=>a.id===generatedId);
        if(!lesson){
          lesson=buildNewsLesson(source);
          const rows=generated().filter(x=>x.id!==lesson.id);
          rows.push(lesson); save(KEYS.generated,rows);
        }
      }
      if(!lesson) throw new Error('Unable to create lesson');
      localSave(KEYS.daily,{date:dayKey(),articleId:lesson.id,completed:false,selectedByUser:true});
      const h=dailyHistory().filter(x=>x.date!==dayKey()); h.push({date:dayKey(),articleId:lesson.id}); localSave(KEYS.dailyHistory,h.slice(-180));
      toast('已鎖定今日主文章');
    }catch(e){
      console.error(e); toast('主文章建立失敗，請再選一次');
    }finally{
      dailyChoosing=false; render();
    }
  }

  const originalTodayPage = typeof todayPage==='function' ? todayPage : null;
  window.todayPage = function(){
    ensureDailyCandidates();
    const assignment=currentDailyAssignment();
    const rows=analyticsSessions();
    const assigned=assignment?.articleId ? allLessons().find(x=>x.id===assignment.articleId) : null;
    const completed=Boolean(assignment?.completed || (assignment&&rows.some(s=>s.date===assignment.date&&s.articleId===assignment.articleId)));
    const pool=candidatePool();
    const cards=pool?.items.map(parityCandidateCard).filter(Boolean)||[];
    const mainBlock=completed
      ? '<div class="card empty"><strong>今日主文章已完成 ✓</strong><p>今天的主文章已收起，WPM、正確率與錯題紀錄都已保存。明天會重新提供三篇候選。</p></div>'
      : assigned ? appdeployArticleCard(assigned,true)
      : dailyChoosing ? '<div class="card empty"><strong>正在建立你選的主文章…</strong><p>完整閱讀、字彙、文法與題目會在本機建立。</p></div>'
      : cards.length ? `<div class="list">${cards.join('')}</div>`
      : '<div class="card empty"><strong>正在準備今日候選…</strong><p>新聞同步完成後會建立最佳推薦、最新新聞、能力適配三篇候選。</p></div>';
    return `<section class="hero"><div class="hero-kicker"><p class="eyebrow">TODAY</p><span class="hero-chip">${appdeployTargetLength()} words</span></div><h2>新聞閱讀＋Part 1–7。</h2><p>每天先從三篇候選中選一篇；選定後鎖定為今日主文章，完成後不再重複計入。</p></section>
      <section class="grid stats"><div class="card stat"><small>完成篇數</small><strong>${rows.length}</strong></div><div class="card stat"><small>平均 WPM</small><strong>${avgWpm()||'—'}</strong></div><div class="card stat"><small>平均正確率</small><strong>${accuracy()}%</strong></div></section>
      <div class="section-head"><h3>${assigned?'今日主文章':'今日主文章候選'}</h3><span class="badge">${assigned?'15–25 分鐘':'3 選 1'}</span></div>${mainBlock}`;
  };

  const oldLoadNews=loadNews;
  window.loadNews=async function(manual=false){
    await oldLoadNews(manual);
    if(!candidatePool()&&!currentDailyAssignment()){ensureDailyCandidates();if(route==='today')render()}
  };

  // ---------------------------------------------------------------------------
  // ARTICLE REVIEW SNAPSHOT — match AppDeploy context-preservation contract
  // ---------------------------------------------------------------------------
  function paragraphs(text){ return String(text||'').split(/\n{2,}/).map(x=>x.trim()).filter(Boolean) }
  function saveReviewSnapshot(article){
    if(!article?.id||!article?.text) return;
    const rows=localLoad(KEYS.articleReviews,[]).filter(x=>x.articleId!==article.id);
    rows.push({articleId:article.id,title:article.title||'',source:article.source||'',text:article.text,paragraphs:paragraphs(article.text),savedAt:new Date().toISOString()});
    localSave(KEYS.articleReviews,rows);
  }
  const oldRegisterNewsMistake=registerNewsMistake;
  window.registerNewsMistake=function(question,choice,article){
    if(question?.part==='Part 6'||question?.part==='Part 7') saveReviewSnapshot(article);
    return oldRegisterNewsMistake(question,choice,article);
  };
  const oldReviewContext=appdeployReviewContext;
  window.appdeployReviewContext=function(kind,m){
    if(kind!=='news') return oldReviewContext(kind,m);
    if(m.question?.part==='Part 5') return '';
    const snap=localLoad(KEYS.articleReviews,[]).find(x=>x.articleId===m.sourceId);
    if(!snap) return oldReviewContext(kind,m);
    return snap.text || oldReviewContext(kind,m);
  };

  // ---------------------------------------------------------------------------
  // LOCAL BLUEPRINT VALIDATION — same flow/threshold, local instead of AppDeploy AI
  // ---------------------------------------------------------------------------
  function rotateOptions(question,shift){
    const options=[...(question.options||[])];
    if(options.length<2) return question;
    shift=((shift%options.length)+options.length)%options.length;
    if(!shift) return question;
    const answerText=options[question.answer];
    const rotated=options.slice(options.length-shift).concat(options.slice(0,options.length-shift));
    return {...question,options:rotated,answer:rotated.indexOf(answerText)};
  }
  function localValidation(part,questions){
    let score=100;
    const issues=[];
    if(!Array.isArray(questions)||!questions.length){score=0;issues.push('No questions')}
    const ids=new Set(),prompts=new Set();
    for(const q of questions||[]){
      if(!q?.id||ids.has(q.id)){score-=12;issues.push('Duplicate/missing id')} else ids.add(q.id);
      const prompt=String(q?.q||'').trim().toLowerCase();
      if(!prompt||prompts.has(prompt)){score-=10;issues.push('Duplicate/missing prompt')} else prompts.add(prompt);
      if(!Array.isArray(q.options)||q.options.length<(part===2?3:4)){score-=15;issues.push('Option count')}
      if(!Number.isInteger(q.answer)||q.answer<0||q.answer>=q.options.length){score-=30;issues.push('Invalid answer')}
      if(new Set(q.options.map(x=>String(x).trim().toLowerCase())).size!==q.options.length){score-=10;issues.push('Duplicate options')}
    }
    if(part===1 && !questions?.[0]?.image){score-=20;issues.push('Missing Part 1 image')}
    score=Math.max(0,Math.min(100,score));
    return {blueprint:'TOEIC-style',score,attempts:1,imageScore:undefined, imageStatus:part===1?'prebuilt-unreviewed':undefined,issues:[...new Set(issues)]};
  }

  const P2_BANK=[
    ['When will the revised report be ready?',['By Friday afternoon.','At the front desk.','Because it was expensive.'],0],
    ['Where is the training session being held?',['In Conference Room B.','For about two hours.','Yes, I trained yesterday.'],0],
    ['Who approved the new schedule?',['Ms. Chen did.','At nine o’clock.','The blue folder.'],0],
    ['Could you send me the revised file?',['Sure, I’ll email it now.','The meeting was revised.','On the third floor.'],0],
    ['Why was the delivery delayed?',['Because of heavy traffic.','At the loading dock.','Three boxes.'],0],
    ['How often is the shuttle available?',['Every thirty minutes.','Near the east entrance.','Yes, I reserved it.'],0],
    ['Would you like me to call the supplier?',['Yes, please do.','The invoice is blue.','At the warehouse.'],0],
    ['Where should I leave these documents?',['On Ms. Lee’s desk.','By tomorrow morning.','I read them yesterday.'],0],
    ['When does the hotel restaurant open?',['At six thirty.','On the second floor.','The breakfast menu.'],0],
    ['Who is meeting the client at the airport?',['Mr. Park is.','At Gate 12.','Around forty minutes.'],0],
    ['Can you reserve a larger meeting room?',['I’ll check availability now.','The projector is new.','For the finance team.'],0],
    ['Why don’t we move the appointment to Thursday?',['That works for me.','In the main lobby.','Two appointments.'],0]
  ];
  const P5_BANK=[
    ['The manager _____ the final report yesterday.',['approve','approved','approving','approval'],1,'Past time marker yesterday requires approved.'],
    ['Please submit the form _____ Friday.',['by','among','during','through'],0,'by Friday means no later than Friday.'],
    ['The new software is easy to use and highly _____.',['rely','reliable','reliably','reliance'],1,'An adjective is needed after highly.'],
    ['Employees are asked _____ their badges at all times.',['wear','to wear','wore','wearing'],1,'ask + object + to-infinitive.'],
    ['The shipment arrived _____ than expected.',['early','earlier','earliest','more early'],1,'Comparative form earlier is required.'],
    ['Ms. Lin will contact you as soon as the contract _____.',['arrive','arrives','arrived','arriving'],1,'A present-tense clause follows as soon as for future time.'],
    ['The conference room is currently _____.',['available','availability','availably','avail'],0,'An adjective is required after is.'],
    ['Customers may request a refund _____ thirty days.',['within','between','along','beside'],0,'within expresses a time limit.'],
    ['The company hired two additional _____ last month.',['technician','technicians','technical','technically'],1,'A plural noun follows two.'],
    ['Please review the figures _____ before sending the file.',['careful','carefully','care','caring'],1,'An adverb modifies review.'],
    ['Neither of the printers _____ working properly.',['are','were','is','be'],2,'Neither takes a singular verb here.'],
    ['The new policy was introduced _____ reduce processing time.',['so','to','for','because'],1,'to + verb expresses purpose.']
  ];

  function parityQuestion(part,index,seed=0){
    if(part===1) return makeQuestion(1,index,seed);
    if(part===2){
      const b=P2_BANK[(index+seed)%P2_BANK.length];
      return rotateOptions({id:`p2-${seed}-${index}`,part:2,skill:'Best response',q:b[0],options:[...b[1]],answer:b[2],explain:'Choose the response that directly answers the speaker.'},(index+seed)%3);
    }
    if(part===3||part===4) return makeQuestion(part,index,seed);
    if(part===5){
      const b=P5_BANK[(index+seed)%P5_BANK.length];
      return rotateOptions({id:`p5-${seed}-${index}`,part:5,skill:'Grammar/Vocabulary',q:b[0],options:[...b[1]],answer:b[2],explain:b[3]},(index+seed)%4);
    }
    if(part===6||part===7){
      if(!window.ToeicReadingBank)throw new Error('閱讀題庫未載入，請完成更新。');
      return window.ToeicReadingBank.previewQuestion(part,index,seed);
    }
    throw new Error('Unsupported Part');
  }

  function passageHtml(q){
    const escaped=esc(q.stimulus||'');
    if(q.part!==6||!q.contentVersion)return escaped;
    return escaped.replace(/\[([1-4])\] _____/g,(_,n)=>`<span class="reading-gap ${Number(n)===q.gapNumber?'current-gap':''}" ${Number(n)===q.gapNumber?'aria-current="step"':''}>[${n}] _____</span>`);
  }
  function qualityNote(set,mock=false){
    if(!set.contentVersion)return `<p class="quality-note">✓ 題數與選項格式檢查通過 · ${mock?'模考作答中不顯示正解與解析':'未做 AI 語意驗題'} · 非 ETS 官方題</p>`;
    return `<p class="quality-note">原創練習題 · 題型、選項及文本對應檢查通過；未經獨立命題審校。${mock?'模考作答中不顯示解析。':''}</p>`;
  }
  function readingNote(set){
    if(!set.novelty)return '';
    const n=set.novelty;
    return `<div class="reading-bank-note" data-reading-bank="2.6.3"><strong>${esc(set.contextTitle)}</strong><span>Part ${set.part} 題庫 ${n.total} 組 · 本裝置已抽 ${n.seen} 組</span><span>${n.repeat?'已開始輪替先前抽過的題組；本次練習內仍不重複文章。':'本裝置尚未抽過的題組。'}${set.part===6?'同一題組四題共用一篇文章，依序完成 [1]–[4]。':'同題組共用文章，題目各自對應不同內容。'}</span></div>`;
  }
  function makeValidatedBlock(part,count,seed,mode,blockNumber=0,answerTargets=null,excludedContexts=[]){
    const E=window.ToeicRandomEngine,questions=[],key=`${part}|${mode}|${seed}|${blockNumber}`;
    const select=(size,n,kind)=>E.drawPool(`part:${part}:${kind}`,size,n);
    let reading=null;
    if(part===6||part===7){
      if(!window.ToeicReadingBank)throw new Error('閱讀題庫未載入；未使用舊重複模板替代。');
      reading=window.ToeicReadingBank.draw(part,count,`${mode}|${seed}`,blockNumber,excludedContexts);
      questions.push(...reading.questions);
    }else if(part===3||part===4){
      const scenario=select(10,1,'scenarios')[0];
      for(const j of E.sampleIndices(4,count,key))questions.push(parityQuestion(part,j*10,scenario));
    }else{
      const size=part===2?P2_BANK.length:part===5?P5_BANK.length:window.ToeicAssets?.scenes?.length||4;
      for(const j of select(size,count,'items'))questions.push(parityQuestion(part,j,0));
    }
    const balanced=E.balanceAnswers(questions,key,answerTargets);
    const validation=localValidation(part,balanced);
    if(reading){
      const issues=window.ToeicReadingBank.validate(part,balanced);
      if(issues.length)throw new Error(issues.join('；'));
      validation.typeChecked=true;validation.semanticReview='not-independently-reviewed';
    }
    if(validation.score<QUALITY_THRESHOLD)throw new Error(`Local structure check ${validation.score}/100`);
    const first=balanced[0]||{};
    return {id:`set-${E.hashSeed(key+'|'+balanced.map(q=>q.id).join('|'))}`,part,mode,title:`Part ${part} · ${PART_NAMES[part]}`,skill:first.skill||'TOEIC-style',instructions:part<=4?'請先聆聽，再依題目作答。':part===6?'依序選出填入 [1]–[4] 的字詞或句子。':'閱讀內容後選出最佳答案。',displayText:part>=5?(first.stimulus||''):'',audioText:part<=4?(first.stimulus||first.q||''):'',imageData:part===1?first.image:'',imageMimeType:'',validation,questions:balanced,...(reading?{contextTitle:reading.title,contentVersion:window.ToeicReadingBank.VERSION,novelty:reading.novelty}:{})};
  }
  window.ToeicPracticeBlocks={makeValidatedBlock,counts:FULL_COUNTS};

  // ---------------------------------------------------------------------------
  // MULTI-ACCENT SEGMENT PLAYER — pause/resume + target/actual tracking
  // ---------------------------------------------------------------------------
  function plannedAccents(unit,count=1){return window.toeicAudio.accents(`listening:${unit}`,count)}
  function listeningSegments(set,question,unit){
    if(set.part===1) return question.options.map((o,i)=>({text:`${String.fromCharCode(65+i)}. ${o}`,accent:plannedAccents(`${set.id||unit}:${question.id}`,1)[0],speaker:'Narrator'}));
    if(set.part===2) return [question.q,...question.options.map((o,i)=>`${String.fromCharCode(65+i)}. ${o}`)].map(t=>({text:t,accent:plannedAccents(`${set.id||unit}:${question.id}`,1)[0],speaker:'Narrator'}));
    if(set.part===3){
      const lines=String(set.audioText||question.stimulus||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
      const speakers=[...new Set(lines.map(x=>(x.match(/^([MW]|Speaker\s+[ABC]):/i)||[])[1]).filter(Boolean))];
      const accents=plannedAccents(`${set.id||unit}`,Math.max(2,speakers.length||2)),map=new Map();
      speakers.forEach((sp,i)=>map.set(sp.toUpperCase(),accents[i%accents.length]));
      return lines.map(line=>{const m=line.match(/^([MW]|Speaker\s+[ABC]):\s*(.+)$/i);return m?{text:m[2],accent:map.get(m[1].toUpperCase())||accents[0],speaker:m[1].toUpperCase()}:{text:line,accent:accents[0],speaker:'Speaker'}});
    }
    return [{text:set.audioText||question.stimulus||question.q,accent:plannedAccents(`${set.id||unit}:${question.id}`,1)[0],speaker:'Narrator'}];
  }

  function voiceFeedback(results,accents){
    if(!accents?.length)return'';
    if(!results?.length)return `<div class="accent-feedback"><strong>口音配置</strong><p>目標：${accents.join(' + ')}</p></div>`;
    return `<div class="accent-feedback"><strong>口音配置</strong><p>目標：${accents.join(' + ')}</p><p>實際裝置語音：${results.map(r=>`${r.target} → ${esc(r.actualLang)}${r.fallback?'（替代）':''}`).join(' · ')}</p></div>`;
  }

  // ---------------------------------------------------------------------------
  // PART 1–7 PRACTICE — blocks, Blueprint, max 2 plays, accent analytics
  // ---------------------------------------------------------------------------
  window.startPractice=async function(part,count){
    await window.ToeicAssets.ready;
    const mode=window.appdeployPracticeMode||localStorage.getItem(KEYS.practiceMode)||'quick';
    const target=Number(count)||MODE_COUNTS[mode]?.[part]||MODE_COUNTS.quick[part];
    const state={seed:window.ToeicRandomEngine.nonce(),answerPlan:window.ToeicRandomEngine.positions(target,part===2?3:4,window.ToeicRandomEngine.nonce()),part,mode,target,answers:[],started:Date.now(),block:0,set:null,index:0,plays:0,accents:[],voiceResults:[],scores:[]};
    dialogTitle.textContent=`Part ${part} · ${PART_NAMES[part]} · ${appdeployModeInfo(mode).label}`;
    dialog.showModal();

    const loadBlock=()=>{
      const remaining=state.target-state.answers.length;
      if(remaining<=0)return finish();
      const n=Math.min(BLOCK_SIZE[part],remaining);
      try{
        state.set=makeValidatedBlock(part,n,state.seed,mode,state.block++,state.answerPlan.slice(state.answers.length,state.answers.length+n),state.answers.map(x=>x.item?.contextFingerprint).filter(Boolean));
        state.index=0;state.plays=0;state.accents=[];state.voiceResults=[];state.scores.push(state.set.validation.score);
        show();
      }catch(e){
        console.error(e);
        body.innerHTML=`<section class="lesson-step"><p class="eyebrow">GENERATION FAILED</p><h3>題型練習未通過生成／驗題</h3><div class="card"><p class="muted">${esc(e.message||'題組建立失敗')} 已作答 ${state.answers.length} 題，可按「結束本次」儲存目前結果。</p></div><div class="actions"><button class="primary" id="practiceRetryBlock">重新產生</button><button class="secondary" id="practiceCloseError">結束本次</button></div></section>`;
        document.querySelector('#practiceRetryBlock').onclick=()=>{state.block=Math.max(0,state.block-1);loadBlock()};
        document.querySelector('#practiceCloseError').onclick=()=>{if(state.answers.length)finish();else dialog.close()};
      }
    };

    const play=()=>{
      const set=state.set,q=set.questions[state.index],key=`practice:${state.seed}:${set.id}:${part<=2?state.index:0}`;
      const currentlyPlaying=window.toeicAudio.state()?.key===key;
      if(!currentlyPlaying&&state.plays>=2){toast('學習模式每題／題組最多播放 2 次');return}
      const segments=listeningSegments(set,q,`${state.seed}:${state.block}`);
      const result=window.toeicAudio.toggle(segments,key,document.querySelector('#playPracticeAudio'));
      if(result.action==='started')state.plays++;
      state.accents=[...new Set(segments.map(x=>x.accent))];state.voiceResults=result.results;
      result.promise.then(r=>{if(r.status==='error'){state.plays=Math.max(0,state.plays-1);toast(r.error||'語音未播放，請重試')}});
    };

    const show=()=>{
      window.toeicStopAudio?.();
      const set=state.set,q=set.questions[state.index],listening=part<=4,lettersOnly=part<=2;
      const global=state.answers.length+1;
      const visual=part===1&&q.image?`<img class="practice-photo" src="${q.image}" alt="已驗證的 Part 1 題庫圖片">`:'';
      const passage=part>=5&&q.stimulus?`<div class="practice-passage">${passageHtml(q)}</div>`:'';
      body.innerHTML=`<section class="lesson-step practice-session"><div class="practice-session-head"><div><p class="eyebrow">PART ${part} · ${appdeployModeInfo(mode).label}</p><h3>${esc(set.title)}</h3></div><div class="practice-head-badges"><span class="badge quality-badge">${set.contentVersion?'題型結構通過':`結構檢查 ${set.validation.score}`}</span>${part===1?`<span class="badge">預建插圖 · 未獨立驗圖</span>`:''}<span class="badge">${global} / ${state.target}</span></div></div>
      ${qualityNote(set)}${readingNote(set)}${visual}
      ${listening?`<div class="listen-controls"><button class="secondary" id="playPracticeAudio">播放音檔（${state.plays}/2）</button><small>${part<=2?'每題':'每題組'}最多播放 2 次 · 四區口音平衡</small></div>`:''}
      ${passage}<h3>${lettersOnly?'請先聆聽題目，再選擇答案。':esc(q.q)}</h3>
      <div class="practice-options ${lettersOnly?'letter-grid':''}">${q.options.map((o,i)=>`<button class="option practice-answer ${lettersOnly?'letter-only':''}" data-i="${i}">${lettersOnly?String.fromCharCode(65+i):`${String.fromCharCode(65+i)}. ${esc(o)}`}</button>`).join('')}</div><div id="practiceFeedback"></div></section>`;
      document.querySelector('#playPracticeAudio')?.addEventListener('click',play);
      document.querySelectorAll('.practice-answer').forEach(btn=>btn.onclick=()=>{
        const choice=Number(btn.dataset.i),correct=choice===q.answer;
        window.toeicStopAudio?.();
        document.querySelectorAll('.practice-answer').forEach((x,i)=>{x.disabled=true;if(i===q.answer)x.classList.add('correct');else if(i===choice)x.classList.add('wrong')});
        const fallbacks=[...new Set((state.voiceResults||[]).filter(r=>r.fallback).map(r=>r.target))];
        state.answers.push({item:q,choice,correct,accents:[...state.accents],voiceFallbacks:fallbacks,validationScore:set.validation.score,audioText:set.audioText,displayText:set.displayText});
        if(!correct){
          const rows=partMistakes(),t=now();
          rows.push({id:`part-m-${Date.now()}-${Math.random().toString(36).slice(2)}`,part,question:q,choice,audioText:set.audioText,displayText:set.displayText,accents:[...state.accents],validationScore:set.validation.score,source:'practice',status:'unmastered',reviewStage:0,correctStreak:0,reviewCount:0,firstWrongAt:t,lastWrongAt:t,lastReviewedAt:t,nextReviewAt:new Date(Date.now()+DAY_MS).toISOString(),imageData:q.image||'',imageMimeType:q.image?'image/svg+xml':''});
          save(KEYS.partMistakes,rows);
        }
        document.querySelector('#practiceFeedback').innerHTML=`<div class="card practice-feedback"><strong>${correct?'答對了':'需要複習'}</strong><p class="muted">${esc(q.explain)}</p>${voiceFeedback(state.voiceResults,state.accents)}${listening?listeningTranscriptHtml(q):''}<button class="primary" id="practiceNext">${state.answers.length>=state.target?'完成本次練習':state.index>=set.questions.length-1?'下一題組':'下一題'}</button></div>`;
        document.querySelector('#practiceNext').onclick=()=>{
          if(state.answers.length>=state.target)return finish();
          if(state.index>=set.questions.length-1)return loadBlock();
          state.index+=1;if(part<=2){state.plays=0;state.accents=[];state.voiceResults=[]}show();
        };
      });
    };

    const finish=()=>{
      window.toeicStopAudio?.();
      const correct=state.answers.filter(x=>x.correct).length,total=state.answers.length,duration=Math.max(1,Math.round((Date.now()-state.started)/60000));
      const exposure=state.answers.flatMap(a=>a.accents.map(accent=>({accent,correct:a.correct})));
      const fallbacks=state.answers.reduce((n,a)=>n+a.voiceFallbacks.length,0),rows=partSessions();
      rows.push({id:`part-${part}-${state.started}`,date:dayKey(),part,mode,title:`${PART_NAMES[part]} · ${appdeployModeInfo(mode).label}`,correct,total,durationMinutes:duration,skills:[...new Set(state.answers.map(a=>a.item.skill))],accentExposure:exposure,blueprintScores:state.scores,voiceFallbacks:fallbacks});
      save(KEYS.partSessions,rows);
      const extra={};extra[`part${part}Answered`]=total;extra[`part${part}Correct`]=correct;
      publishGoalEvent(makeGoalEvent(`Part ${part} 訓練`,duration,total,correct,state.answers.filter(x=>!x.correct).map(x=>x.item.skill),extra));
      body.innerHTML=`<section class="hero"><p class="eyebrow">PART ${part} COMPLETE</p><h2>${correct}/${total}</h2><p>${duration} 分鐘 · 結構檢查 平均 ${Math.round(state.scores.reduce((a,b)=>a+b,0)/state.scores.length)||'—'}。</p><button id="doneP" class="primary wide">完成</button></section>`;
      document.querySelector('#doneP').onclick=()=>{dialog.close();render()};
    };

    loadBlock();
  };

  // ---------------------------------------------------------------------------
  // FULL MOCK — strict/training, resume/discard, 75-min Reading, persistent active
  // ---------------------------------------------------------------------------
  const MOCK_KEY=KEYS.mockActive,MOCK_HISTORY=KEYS.mockHistory;
  let mockTimer=null,mockPendingChoice=null,mockVoiceResults=[];
  const activeMock=()=>{const a=localLoad(MOCK_KEY,null);return a?.id&&a.currentPart>=1&&a.currentPart<=7?a:null};
  const persistMock=a=>localSave(MOCK_KEY,a);
  const partAnswered=(a,p)=>a.answers.filter(x=>Number(x.part)===Number(p)).length;
  const mockProgress=a=>Math.min(200,a.answers.length);
  const nextPart=p=>p<7?p+1:null;
  const remainingReading=a=>a.mode==='strict'&&a.readingDeadline?Math.max(0,Math.ceil((a.readingDeadline-Date.now())/1000)):null;
  const fmt=s=>`${String(Math.floor(Math.max(0,s)/60)).padStart(2,'0')}:${String(Math.max(0,s)%60).padStart(2,'0')}`;
  const modeLabel=m=>m==='strict'?'全真模式':'訓練模考';
  const round5=v=>Math.round(v/5)*5;
  const estimateSection=raw=>Math.max(5,Math.min(495,round5(5+raw*4.9)));

  function clearMockTimer(){if(mockTimer){clearInterval(mockTimer);mockTimer=null}}
  function mockResultCard(r){return `<article class="card full-mock-result"><div class="article-meta"><span class="badge">${modeLabel(r.mode)}</span><span class="badge">${esc(r.date||'')}</span>${r.timedOut?'<span class="badge">時間到</span>':''}</div><strong>${r.correct}/200</strong><p>Listening ${r.listeningCorrect}/100 · Reading ${r.readingCorrect}/100</p><p class="muted">預估 TOEIC ${r.estimatedMin}–${r.estimatedMax} · 中心值約 ${r.estimatedCenter} · ${r.durationMinutes} 分鐘</p></article>`}

  window.appdeployFullMockPanel=function(){
    const a=activeMock(),recent=mockHistory().slice(-3).reverse();
    const hist=recent.length?`<div class="full-mock-recent"><div class="section-head"><h3>最近完整模考</h3><span class="badge">${recent.length}</span></div>${recent.map(mockResultCard).join('')}</div>`:'';
    if(a){
      const status=a.currentPart>=5&&a.readingStartedAt?(a.mode==='strict'?`Reading 剩餘 ${fmt(remainingReading(a)||0)}`:'Reading 訓練模式 · 不限時'):'Listening 進行中';
      return `<section id="fullMockPanel" class="card full-mock-card active"><div class="full-mock-head"><div><span class="part-number">FULL MOCK · 200 QUESTIONS</span><h3>完整模考進行中</h3></div><span class="badge">${modeLabel(a.mode)}</span></div><div class="full-mock-progress"><strong>${mockProgress(a)} / 200</strong><span>目前 Part ${a.currentPart} · ${PART_NAMES[a.currentPart]}</span></div><p class="muted">${status}。題目與已作答進度會保留，重新開啟可繼續。</p><div class="actions"><button class="primary" id="resumeFullMock">繼續完整模考</button><button class="danger" id="discardFullMock">放棄本次</button></div></section>${hist}`;
    }
    return `<section id="fullMockPanel" class="card full-mock-card"><div class="full-mock-head"><div><span class="part-number">FULL MOCK · 200 QUESTIONS</span><h3>完整 TOEIC-style 模考</h3></div><span class="badge">P1–P7</span></div><p>Listening 100 題＋Reading 100 題。各題組沿用 結構檢查 驗證與多口音引擎。</p><div class="full-mock-spec"><span>Listening 約 45 分</span><span>Reading 75 分</span><span>共 200 題</span></div><div class="full-mock-mode-grid"><button class="primary full-mock-start" id="startFullMockStrict"><strong>開始全真模式</strong><span>聽力每題組 1 次 · Reading 75:00 倒數 · 作答中不顯示解析</span></button><button class="secondary full-mock-start" id="startFullMockTraining"><strong>開始訓練模考</strong><span>聽力最多 2 次 · 可退出後繼續 · Reading 不強制倒數</span></button></div><p class="muted full-mock-note">分數為系統依答對題數估算的練習區間，不是 ETS 官方換算成績。</p></section>${hist}`;
  };

  function renderMockQuestion(a){
    const set=a.currentSet;if(!set)return loadMockBlock();
    const q=set.questions[a.currentIndex];if(!q){a.currentSet=null;a.currentIndex=0;persistMock(a);return loadMockBlock()}
    window.toeicStopAudio?.();mockPendingChoice=null;mockVoiceResults=[];
    const listening=set.part<=4,lettersOnly=set.part<=2,maxPlays=a.mode==='strict'?1:2,audioRequired=listening&&!a.audioComplete;
    const rem=remainingReading(a),timer=set.part>=5&&a.mode==='strict'?`<span class="badge mock-timer">Reading <strong id="fullMockTimer">${fmt(rem||0)}</strong></span>`:`<span class="badge">${set.part<=4?'Listening':'Reading'}</span>`;
    body.innerHTML=`<section class="lesson-step practice-session full-mock-session"><div class="practice-session-head"><div><p class="eyebrow">FULL MOCK · PART ${set.part}</p><h3>${esc(PART_NAMES[set.part])}</h3></div><div class="practice-head-badges">${timer}<span class="badge">${a.answers.length+1} / 200</span></div></div><div class="full-mock-section-progress"><span>Part ${set.part}: ${partAnswered(a,set.part)+1} / ${FULL_COUNTS[set.part]}</span><span>結構檢查 ${set.validation.score}</span></div>${qualityNote(set,true)}${readingNote(set)}
    ${set.part===1&&q.image?`<img class="practice-photo" src="${q.image}" alt="Part 1 情境圖片">`:''}
    ${listening?`<div class="listen-controls"><button class="secondary" id="playFullMockAudio" ${a.plays>=maxPlays&&a.audioComplete?'disabled':''}>${a.audioComplete?'音檔已播放':'播放正式音檔'}（${a.plays}/${maxPlays}）</button><small>${a.mode==='strict'?'全真模式：每題／題組 1 次':'訓練模考：最多 2 次'}${audioRequired?' · 播放完畢後才能作答':''}</small></div>`:''}
    ${set.part>=5&&q.stimulus?`<div class="practice-passage">${passageHtml(q)}</div>`:''}<h3>${lettersOnly?'請依音檔內容選擇答案。':esc(q.q)}</h3>
    <div class="practice-options ${lettersOnly?'letter-grid':''}">${q.options.map((o,i)=>`<button class="option full-mock-answer ${lettersOnly?'letter-only':''}" data-i="${i}" ${audioRequired?'disabled':''}>${lettersOnly?String.fromCharCode(65+i):`${String.fromCharCode(65+i)}. ${esc(o)}`}</button>`).join('')}</div>
    <div class="full-mock-confirm"><span class="muted">選擇後仍可更改，按確認才送出本題。</span><button class="primary" id="confirmFullMockAnswer" disabled>確認答案 →</button></div></section>`;
    document.querySelector('#playFullMockAudio')?.addEventListener('click',()=>playMockAudio());
    document.querySelectorAll('.full-mock-answer').forEach(btn=>btn.onclick=()=>{if(btn.disabled)return;mockPendingChoice=Number(btn.dataset.i);document.querySelectorAll('.full-mock-answer').forEach(x=>x.classList.remove('selected'));btn.classList.add('selected');document.querySelector('#confirmFullMockAnswer').disabled=false});
    document.querySelector('#confirmFullMockAnswer').onclick=()=>confirmMockAnswer();
    if(set.part>=5&&a.mode==='strict') startMockTimer(); else clearMockTimer();
  }

  function playMockAudio(){
    const a=activeMock(),set=a?.currentSet;if(!a||!set||set.part>4)return;
    const q=set.questions[a.currentIndex],key=`mock:${a.id}:${set.id||set.part}:${set.part<=2?a.currentIndex:0}`;
    const ongoing=window.toeicAudio.state()?.key===key,max=a.mode==='strict'?1:2;
    if(!ongoing&&a.plays>=max){toast(a.mode==='strict'?'本題組已播放一次':'本題組已播放兩次');return}
    const segments=listeningSegments(set,q,`${a.id}:${set.id}`);
    const result=window.toeicAudio.toggle(segments,key,document.querySelector('#playFullMockAudio'));
    if(result.action==='started'){
      a.plays++;a.audioComplete=false;a.currentAccents=[...new Set(segments.map(x=>x.accent))];a.currentVoiceResults=result.results;persistMock(a);
      result.promise.then(r=>{
        const latest=activeMock();if(!latest||latest.id!==a.id||latest.currentSet?.id!==set.id)return;
        if(r.status==='ended'){latest.audioComplete=true;persistMock(latest);if(dialog.open)renderMockQuestion(latest)}
        else{latest.audioComplete=false;latest.plays=Math.max(0,latest.plays-1);persistMock(latest);if(r.status==='error')toast(r.error||'語音失敗，次數已還原')}
      });
    }
  }

  function startMockTimer(){
    clearMockTimer();
    const tick=()=>{const a=activeMock();if(!a||a.mode!=='strict'||!a.readingDeadline)return clearMockTimer();const r=remainingReading(a)||0;const t=document.querySelector('#fullMockTimer');if(t)t.textContent=fmt(r);if(r<=0){clearMockTimer();finishMock(a,true)}};
    tick();mockTimer=setInterval(tick,1000);
  }

  function showReadingTransition(a){
    body.innerHTML=`<section class="lesson-step full-mock-transition"><p class="eyebrow">LISTENING COMPLETE</p><h3>Listening 100 題已完成</h3><div class="card"><strong>接下來進入 Reading 100 題</strong><p class="muted">Part 5 30 題 · Part 6 16 題 · Part 7 54 題</p></div>${a.mode==='strict'?'<div class="card mock-warning"><strong>Reading 75:00</strong><p class="muted">按下開始後立即倒數；離開 App 不會暫停。</p></div>':'<div class="card"><strong>訓練模考</strong><p class="muted">Reading 不強制倒數，可退出後再繼續。</p></div>'}<button class="primary" id="beginFullMockReading">開始 Reading</button></section>`;
    document.querySelector('#beginFullMockReading').onclick=()=>{const x=activeMock();if(!x)return;x.currentPart=5;x.readingStartedAt=Date.now();if(x.mode==='strict')x.readingDeadline=x.readingStartedAt+READING_SECONDS*1000;persistMock(x);loadMockBlock()};
  }

  function mockAnswerTargets(a,part,count){
    const E=window.ToeicRandomEngine,k=part===2?3:4,total=k===3?25:175;
    a.answerPlans??={};a.answerPlans[k]??=E.positions(total,k,`${a.id}|options:${k}`);
    const used=a.answers.filter(x=>((x.q||x.question)?.options?.length||(x.part===2?3:4))===k).length;
    return a.answerPlans[k].slice(used,used+count);
  }
  function loadMockBlock(){
    const a=activeMock();if(!a)return;
    if(a.mode==='strict'&&a.readingDeadline&&remainingReading(a)<=0)return finishMock(a,true);
    const part=a.currentPart,answered=partAnswered(a,part);
    if(answered>=FULL_COUNTS[part]){
      const n=nextPart(part);if(!n)return finishMock(a,false);
      a.currentPart=n;a.currentSet=null;a.currentIndex=0;a.plays=0;a.audioComplete=false;persistMock(a);
      if(n===5&&!a.readingStartedAt)return showReadingTransition(a);
      return loadMockBlock();
    }
    const blockNumber=(a.blockNumbers?.[String(part)]||0)+1,count=Math.min(BLOCK_SIZE[part],FULL_COUNTS[part]-answered);
    try{
      const set=makeValidatedBlock(part,count,a.id||a.seed,'mock',blockNumber,mockAnswerTargets(a,part,count),a.answers.map(x=>(x.q||x.question)?.contextFingerprint).filter(Boolean));
      a.currentSet=set;a.currentIndex=0;a.blockNumbers[String(part)]=blockNumber;a.validationScores[String(part)]=[...(a.validationScores[String(part)]||[]),set.validation.score];a.plays=0;a.audioComplete=part>4;persistMock(a);renderMockQuestion(a);
    }catch(e){
      console.error(e);body.innerHTML=`<section class="lesson-step"><p class="eyebrow">FULL MOCK · GENERATION FAILED</p><h3>Part ${part} 第 ${blockNumber} 題組未通過驗題</h3><div class="card"><p class="muted">${esc(e.message||'題組建立失敗')} 已完成的 ${a.answers.length}/200 題仍保留。</p></div><div class="actions"><button class="primary" id="fullMockRetry">重新產生題組</button><button class="secondary" id="fullMockExit">先退出，保留進度</button></div></section>`;document.querySelector('#fullMockRetry').onclick=loadMockBlock;document.querySelector('#fullMockExit').onclick=()=>dialog.close();
    }
  }

  function confirmMockAnswer(){
    const a=activeMock(),set=a?.currentSet;if(!a||!set||mockPendingChoice===null)return;
    if(a.mode==='strict'&&a.readingDeadline&&remainingReading(a)<=0)return finishMock(a,true);
    const q=set.questions[a.currentIndex],accents=a.currentAccents||[],fallbacks=(a.currentVoiceResults||[]).filter(x=>x.fallback).map(x=>x.target);
    a.answers.push({part:set.part,q,choice:mockPendingChoice,correct:mockPendingChoice===q.answer,accents,voiceFallbacks:fallbacks,audioText:set.audioText,displayText:set.displayText,validationScore:set.validation.score});
    if(mockPendingChoice!==q.answer){
      const rows=partMistakes(),t=now();rows.push({id:`part-m-${Date.now()}-${Math.random().toString(36).slice(2)}`,part:set.part,question:q,choice:mockPendingChoice,audioText:set.audioText,displayText:set.displayText,accents,validationScore:set.validation.score,source:'full-mock',status:'unmastered',reviewStage:0,correctStreak:0,reviewCount:0,firstWrongAt:t,lastWrongAt:t,lastReviewedAt:t,nextReviewAt:new Date(Date.now()+DAY_MS).toISOString(),imageData:q.image||'',imageMimeType:q.image?'image/svg+xml':''});save(KEYS.partMistakes,rows);
    }
    mockPendingChoice=null;window.toeicStopAudio?.();
    const last=a.currentIndex>=set.questions.length-1;
    if(last){a.currentSet=null;a.currentIndex=0;a.plays=0;a.audioComplete=false;a.currentAccents=[];a.currentVoiceResults=[]}
    else{a.currentIndex+=1;if(set.part<=2){a.plays=0;a.audioComplete=false;a.currentAccents=[];a.currentVoiceResults=[]}}
    persistMock(a);if(last)loadMockBlock();else renderMockQuestion(a);
  }

  function finishMock(a,timedOut){
    window.toeicStopAudio?.();clearMockTimer();
    const correct=a.answers.filter(x=>x.correct),listening=correct.filter(x=>x.part<=4).length,reading=correct.filter(x=>x.part>=5).length,center=estimateSection(listening)+estimateSection(reading),duration=Math.max(1,Math.round((Date.now()-a.startedAt)/60000));
    const scores=Object.values(a.validationScores||{}).flat(),blueprintAverage=scores.length?Math.round(scores.reduce((x,y)=>x+y,0)/scores.length):0;
    const result={id:a.id,date:dayKey(),mode:a.mode,correct:correct.length,listeningCorrect:listening,readingCorrect:reading,durationMinutes:duration,estimatedCenter:center,estimatedMin:Math.max(10,round5(center-30)),estimatedMax:Math.min(990,round5(center+30)),blueprintAverage,timedOut};
    const h=mockHistory();if(!h.some(x=>x.id===a.id)){h.push(result);save(MOCK_HISTORY,h);
    const extra={};for(let p=1;p<=7;p++){const items=a.answers.filter(x=>x.part===p);extra[`part${p}Answered`]=items.length;extra[`part${p}Correct`]=items.filter(x=>x.correct).length}
    const event=makeGoalEvent(`完整模考 · ${modeLabel(a.mode)}`,duration,a.answers.length,correct.length,[],extra);event.eventId=a.id;publishGoalEvent(event);
    }localStorage.removeItem(MOCK_KEY);window.dispatchEvent(new Event('toeic-safe-update'));
    body.innerHTML=`<section class="hero"><p class="eyebrow">FULL MOCK COMPLETE</p><h2>${correct.length}/200</h2><p>Listening ${listening}/100 · Reading ${reading}/100 · 預估 ${result.estimatedMin}–${result.estimatedMax}${timedOut?' · 時間到':''}</p><button id="doneMock" class="primary wide">完成</button></section>`;document.querySelector('#doneMock').onclick=()=>{dialog.close();render()};
  }

  window.startFullMock=async function(arg){
    await window.ToeicAssets.ready;
    if(activeMock())return resumeFullMock();
    let mode=arg==='strict'?'strict':'training';
    const id=arg?.currentTarget?.id||document.activeElement?.id||'';
    if(String(id).includes('Strict'))mode='strict';
    if(mode==='strict'&&!confirm('全真模式：Listening 每題／題組只能播放一次；Reading 75 分鐘倒數會持續計時。確定開始？'))return;
    const t=Date.now(),a={id:`full-mock-${t}`,mode,startedAt:t,currentPart:1,currentSet:null,currentIndex:0,blockNumbers:{},answers:[],validationScores:{},plays:0,audioComplete:false,currentAccents:[],currentVoiceResults:[],seed:t%997};persistMock(a);resumeFullMock();
  };
  window.resumeFullMock=function(){
    const a=activeMock();if(!a)return;if(a.currentPart<=4&&!a.audioComplete){a.plays=0;persistMock(a)}window.toeicStopAudio?.();clearMockTimer();dialogTitle.textContent=`完整模考 · ${modeLabel(a.mode)}`;if(!dialog.open)dialog.showModal();
    if(a.mode==='strict'&&a.readingDeadline&&remainingReading(a)<=0)return finishMock(a,true);
    if(a.currentPart>=5&&!a.readingStartedAt)return showReadingTransition(a);
    if(a.currentSet)renderMockQuestion(a);else loadMockBlock();
  };
  window.discardFullMock=function(){
    const a=activeMock();if(!a||!confirm(`確定放棄目前 ${mockProgress(a)}/200 的完整模考進度？`))return;
    window.toeicStopAudio?.();clearMockTimer();localStorage.removeItem(MOCK_KEY);if(dialog.open)dialog.close();render();window.dispatchEvent(new Event('toeic-safe-update'));
  };

  // ---------------------------------------------------------------------------
  // PROGRESS SUMMARY — 結構檢查 + accent exposure
  // ---------------------------------------------------------------------------
  const oldProgressPage=progressPage;
  window.progressPage=function(){
    const base=oldProgressPage();
    const rows=partSessions(),scores=rows.flatMap(r=>r.blueprintScores||[]),exposure=rows.flatMap(r=>r.accentExposure||[]);
    const blueprint=scores.length?`<div class="section-head"><h3>結構檢查 品質</h3><span class="badge">${scores.length} 題組</span></div><div class="card blueprint-summary"><div><small>平均品質</small><strong>${Math.round(scores.reduce((a,b)=>a+b,0)/scores.length)}/100</strong></div><div><small>門檻</small><strong>${QUALITY_THRESHOLD}+</strong></div></div>`:'';
    const accents=exposure.length?`<div class="section-head"><h3>Listening 口音接觸表現</h3><span class="badge">${exposure.length} 接觸點</span></div><div class="accent-performance-grid">${ACCENTS.map(a=>{const x=exposure.filter(e=>e.accent===a),pct=x.length?Math.round(x.filter(e=>e.correct).length/x.length*100):null;return `<div class="card accent-performance"><small>${a}</small><strong>${pct===null?'—':`${pct}%`}</strong><span>${x.length} 接觸</span></div>`}).join('')}</div>`:'';
    return base+blueprint+accents;
  };

  // ---------------------------------------------------------------------------
  // BINDING + RENDER WRAP
  // ---------------------------------------------------------------------------
  const oldBind=bind;
  window.bind=function(){
    oldBind();
    document.querySelectorAll('.choose-main').forEach(b=>b.onclick=()=>chooseDailyCandidate(b.dataset.kind||'live',b.dataset.id||''));
    document.querySelector('#resumeFullMock')?.addEventListener('click',()=>resumeFullMock());
    document.querySelector('#discardFullMock')?.addEventListener('click',()=>discardFullMock());
  };

  // Repair candidate pool after news is already present.
  ensureDailyCandidates();
  render();
})();
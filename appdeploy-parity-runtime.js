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
          rows.push(lesson); save(KEYS.generated,rows.slice(-60));
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
    if(!candidatePool()&&!currentDailyAssignment()) ensureDailyCandidates();
  };

  // ---------------------------------------------------------------------------
  // ARTICLE REVIEW SNAPSHOT — match AppDeploy context-preservation contract
  // ---------------------------------------------------------------------------
  function paragraphs(text){ return String(text||'').split(/\n{2,}/).map(x=>x.trim()).filter(Boolean) }
  function saveReviewSnapshot(article){
    if(!article?.id||!article?.text) return;
    const rows=localLoad(KEYS.articleReviews,[]).filter(x=>x.articleId!==article.id);
    rows.push({articleId:article.id,title:article.title||'',source:article.source||'',text:article.text,paragraphs:paragraphs(article.text),savedAt:new Date().toISOString()});
    localSave(KEYS.articleReviews,rows.slice(-20));
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
    const qs=String(m.question?.q||'').toLowerCase().match(/[a-z][a-z'-]{2,}/g)||[];
    const stop=new Set(['the','and','what','which','when','where','why','how','does','did','about','from','with','that','this','have','has']);
    const tokens=[...new Set(qs.filter(x=>!stop.has(x)))];
    let best=snap.paragraphs?.[0]||snap.text,bestScore=-1;
    (snap.paragraphs||[snap.text]).forEach(p=>{const l=p.toLowerCase();const score=tokens.reduce((n,t)=>n+(l.includes(t)?1:0),0);if(score>bestScore){bestScore=score;best=p}});
    return best;
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
    return {blueprint:'TOEIC-style',score,attempts:1,imageScore:part===1?(questions?.[0]?.image?96:0):undefined,issues:[...new Set(issues)]};
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
    if(part===6){
      const subjects=['inventory','training schedule','reservation process','delivery procedure','expense policy','customer survey'];
      const x=subjects[seed%subjects.length];
      const stimulus=`To: All Staff\nSubject: ${x} update\n\nPlease review the updated ${x} information before tomorrow’s meeting. The document was revised this morning, so everyone should use the newest version. If you have questions, contact the operations team before 4 p.m.`;
      const qs=[
        ['Why should employees use the newest version?',['The document was revised','The meeting was cancelled','The office moved','The team is on vacation'],0,'The message says the document was revised this morning.','Detail'],
        ['When should employees contact the operations team?',['Before 4 p.m.','After midnight','Next month','During lunch only'],0,'Questions should be sent before 4 p.m.','Detail'],
        ['What is the main purpose of the message?',['To explain updated information','To advertise a hotel','To cancel a shipment','To announce a new director'],0,'The message asks staff to review updated information.','Main idea'],
        ['Who should review the updated information?',['All staff','Only customers','Hotel guests','Delivery drivers only'],0,'The message is addressed to all staff.','Audience']
      ];
      const q=qs[index%qs.length];
      return rotateOptions({id:`p6-${seed}-${index}`,part:6,skill:q[4],stimulus,q:q[0],options:q[1],answer:q[2],explain:q[3]},(index+seed)%4);
    }
    const topics=['delivery service','training program','reservation system','customer survey','mobile ordering','hotel check-in','rail schedule','payment system','support center','inventory process','airport shuttle','software rollout'];
    const t=topics[seed%topics.length];
    const stimulus=`NOTICE\n\nThe company will test a new ${t} next month. Employees at two locations will participate first. Managers will collect feedback for four weeks before deciding whether to expand the program. Training materials will be sent to participating employees before the trial begins.`;
    const qs=[
      ['What will managers do before expanding the program?',['Collect feedback','Close both locations','Cancel the test','Hire a new director'],0,'Managers will collect feedback for four weeks.','Detail'],
      ['How long will managers collect feedback?',['Four weeks','Two days','Six months','One year'],0,'The notice specifies four weeks.','Detail'],
      ['Who will participate first?',['Employees at two locations','All customers','Only suppliers','Hotel guests'],0,'Employees at two locations will participate first.','Detail'],
      ['What will employees receive before the trial?',['Training materials','Refund checks','Hotel keys','Shipping labels'],0,'Training materials will be sent before the trial.','Detail'],
      ['What is suggested about future expansion?',['It depends on the trial results','It has already been cancelled','It will happen tomorrow','It is limited to customers'],0,'Managers will decide after collecting feedback.','Inference']
    ];
    const q=qs[index%qs.length];
    return rotateOptions({id:`p7-${seed}-${index}`,part:7,skill:q[4],stimulus,q:q[0],options:q[1],answer:q[2],explain:q[3]},(index+seed)%4);
  }

  function makeValidatedBlock(part,count,seed,mode,blockNumber=0){
    let questions=[];
    if(part===3||part===4){
      const scenarioSeed=(seed+blockNumber)%10;
      for(let j=0;j<count;j++) questions.push(parityQuestion(part,j*10,scenarioSeed));
    }else if(part===6){
      const passageSeed=(seed+blockNumber)%6;
      for(let j=0;j<count;j++) questions.push(parityQuestion(6,j,passageSeed));
    }else if(part===7){
      const passageSeed=(seed+blockNumber)%12;
      for(let j=0;j<count;j++) questions.push(parityQuestion(7,j,passageSeed));
    }else{
      for(let j=0;j<count;j++) questions.push(parityQuestion(part,j,seed+blockNumber*17));
    }
    const validation=localValidation(part,questions);
    if(validation.score<QUALITY_THRESHOLD) throw new Error(`Local Blueprint ${validation.score}/100`);
    const first=questions[0]||{};
    return {
      part,mode,title:`Part ${part} · ${PART_NAMES[part]}`,skill:first.skill||'TOEIC-style',
      instructions:part<=4?'請先聆聽，再依題目作答。':'閱讀內容後選出最佳答案。',
      displayText:part>=5?(first.stimulus||''):'',
      audioText:part<=4?(first.stimulus||first.q||first.options?.join('. ')||''):'',
      imageData:part===1?first.image:'',
      imageMimeType:part===1&&first.image?'image/svg+xml':'',
      validation,questions
    };
  }

  // ---------------------------------------------------------------------------
  // MULTI-ACCENT SEGMENT PLAYER — pause/resume + target/actual tracking
  // ---------------------------------------------------------------------------
  const segPlayer={key:'',button:null,paused:false,active:false,results:[]};
  function exactVoices(accent){
    const tags=(ACCENT_LANGS[accent]||['en-US']).map(x=>x.toLowerCase());
    return speechSynthesis.getVoices().filter(v=>tags.includes(v.lang.toLowerCase()));
  }
  function englishVoices(){ return 'speechSynthesis'in window?speechSynthesis.getVoices().filter(v=>/^en[-_]/i.test(v.lang)):[] }
  function pickVoice(accent,used){
    const exact=exactVoices(accent),all=englishVoices();
    const v=exact.find(x=>!used.has(x.voiceURI))||exact[0]||all.find(x=>!used.has(x.voiceURI))||all[0];
    if(v) used.add(v.voiceURI);
    return {voice:v,info:{target:accent,actualLang:v?.lang||ACCENT_LANGS[accent]?.[0]||'en-US',actualName:v?.name||'裝置自動選擇',fallback:!!v&&!exact.includes(v)}};
  }
  function setSegButton(state){
    const b=segPlayer.button;if(!b)return;
    if(!b.dataset.idleLabel)b.dataset.idleLabel=b.textContent||'播放音檔';
    if(state==='playing'){b.textContent='⏸ 暫停';b.classList.add('audio-playing');b.classList.remove('audio-paused')}
    else if(state==='paused'){b.textContent='▶ 繼續';b.classList.add('audio-paused');b.classList.remove('audio-playing')}
    else{b.textContent=b.dataset.idleLabel;b.classList.remove('audio-playing','audio-paused')}
  }
  function stopSegments(){
    try{speechSynthesis.cancel()}catch(_){}
    segPlayer.key='';segPlayer.active=false;segPlayer.paused=false;segPlayer.results=[];setSegButton('idle');segPlayer.button=null;
  }
  const oldStopAudio=window.toeicStopAudio;
  window.toeicStopAudio=function(){try{oldStopAudio?.()}catch(_){} stopSegments()};

  function playSegments(segments,key,button){
    if(!('speechSynthesis'in window)){toast('此裝置目前不支援語音播放');return []}
    if(segPlayer.key===key&&segPlayer.active){
      if(speechSynthesis.paused||segPlayer.paused){speechSynthesis.resume();segPlayer.paused=false;setSegButton('playing')}
      else{speechSynthesis.pause();segPlayer.paused=true;setSegButton('paused')}
      return segPlayer.results;
    }
    window.toeicStopAudio();
    segPlayer.key=key;segPlayer.button=button;segPlayer.active=true;segPlayer.paused=false;
    const used=new Set(),speakerVoice=new Map();
    for(const s of segments) if(!speakerVoice.has(s.speaker)) speakerVoice.set(s.speaker,pickVoice(s.accent,used));
    segPlayer.results=[...speakerVoice.values()].map(x=>x.info);setSegButton('playing');
    const utterances=segments.map((s,i)=>{
      const u=new SpeechSynthesisUtterance(s.text),sel=speakerVoice.get(s.speaker);
      if(sel?.voice)u.voice=sel.voice;u.lang=sel?.info.actualLang||'en-US';u.rate=.92;u.pitch=1;
      if(i===segments.length-1)u.onend=()=>{segPlayer.active=false;segPlayer.key='';setSegButton('idle')};
      return u;
    });
    utterances.forEach(u=>speechSynthesis.speak(u));
    return segPlayer.results;
  }

  function plannedAccents(unit,count=1){
    const mode=localLoad('toeicGithubVoiceSettingsV1',{}).accent||'RANDOM';
    if(mode!=='RANDOM'){
      const normalized=mode==='AU_NZ'?'AU-NZ':mode;
      return Array.from({length:count},()=>normalized);
    }
    const pool=[...ACCENTS],out=[];
    let cursor=(Number(localStorage.getItem(KEYS.accent))||0)+unit;
    for(let i=0;i<count;i++){out.push(pool[(cursor+i)%pool.length])}
    return out;
  }
  function listeningSegments(set,question,unit){
    if(set.part===1) return question.options.map((o,i)=>({text:`${String.fromCharCode(65+i)}. ${o}`,accent:plannedAccents(unit,1)[0],speaker:'Narrator'}));
    if(set.part===2) return [question.q,...question.options.map((o,i)=>`${String.fromCharCode(65+i)}. ${o}`)].map(t=>({text:t,accent:plannedAccents(unit,1)[0],speaker:'Narrator'}));
    if(set.part===3){
      const lines=String(set.audioText||question.stimulus||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
      const speakers=[...new Set(lines.map(x=>(x.match(/^([MW]|Speaker\s+[ABC]):/i)||[])[1]).filter(Boolean))];
      const accents=plannedAccents(unit,Math.max(2,speakers.length||2)),map=new Map();
      speakers.forEach((sp,i)=>map.set(sp.toUpperCase(),accents[i%accents.length]));
      return lines.map(line=>{const m=line.match(/^([MW]|Speaker\s+[ABC]):\s*(.+)$/i);return m?{text:m[2],accent:map.get(m[1].toUpperCase())||accents[0],speaker:m[1].toUpperCase()}:{text:line,accent:accents[0],speaker:'Speaker'}});
    }
    return [{text:set.audioText||question.stimulus||question.q,accent:plannedAccents(unit,1)[0],speaker:'Narrator'}];
  }

  function voiceFeedback(results,accents){
    if(!accents?.length)return'';
    if(!results?.length)return `<div class="accent-feedback"><strong>口音配置</strong><p>目標：${accents.join(' + ')}</p></div>`;
    return `<div class="accent-feedback"><strong>口音配置</strong><p>目標：${accents.join(' + ')}</p><p>實際裝置語音：${results.map(r=>`${r.target} → ${esc(r.actualLang)}${r.fallback?'（替代）':''}`).join(' · ')}</p></div>`;
  }

  // ---------------------------------------------------------------------------
  // PART 1–7 PRACTICE — blocks, Blueprint, max 2 plays, accent analytics
  // ---------------------------------------------------------------------------
  window.startPractice=function(part,count){
    const mode=window.appdeployPracticeMode||localStorage.getItem(KEYS.practiceMode)||'quick';
    const target=Number(count)||MODE_COUNTS[mode]?.[part]||MODE_COUNTS.quick[part];
    const state={part,mode,target,answers:[],started:Date.now(),block:0,set:null,index:0,plays:0,accents:[],voiceResults:[],scores:[]};
    dialogTitle.textContent=`Part ${part} · ${PART_NAMES[part]} · ${appdeployModeInfo(mode).label}`;
    dialog.showModal();

    const loadBlock=()=>{
      const remaining=state.target-state.answers.length;
      if(remaining<=0)return finish();
      const n=Math.min(BLOCK_SIZE[part],remaining);
      try{
        state.set=makeValidatedBlock(part,n,Date.now()%997,mode,state.block++);
        state.index=0;state.plays=0;state.accents=[];state.voiceResults=[];state.scores.push(state.set.validation.score);
        show();
      }catch(e){
        console.error(e);
        body.innerHTML=`<section class="lesson-step"><p class="eyebrow">GENERATION FAILED</p><h3>題型練習未通過生成／驗題</h3><div class="card"><p class="muted">已完成的 ${state.answers.length} 題會保留，可重新產生下一題組。</p></div><div class="actions"><button class="primary" id="practiceRetryBlock">重新產生</button><button class="secondary" id="practiceCloseError">結束本次</button></div></section>`;
        document.querySelector('#practiceRetryBlock').onclick=()=>{state.block=Math.max(0,state.block-1);loadBlock()};
        document.querySelector('#practiceCloseError').onclick=()=>dialog.close();
      }
    };

    const play=()=>{
      const set=state.set,q=set.questions[state.index],max=2;
      if(state.plays>=max){toast('學習模式每題／題組最多播放 2 次');return}
      const segments=listeningSegments(set,q,state.answers.length+state.block);
      const accents=[...new Set(segments.map(x=>x.accent))];
      const results=playSegments(segments,`practice:${part}:${state.block}:${part<=2?state.index:0}`,document.querySelector('#playPracticeAudio'));
      if(segPlayer.key.startsWith('practice:')&&!segPlayer.paused)state.plays+=1;
      state.accents=accents;state.voiceResults=results;
      const b=document.querySelector('#playPracticeAudio');if(b&&!segPlayer.paused)b.dataset.idleLabel=`播放音檔（${state.plays}/2）`;
    };

    const show=()=>{
      window.toeicStopAudio?.();
      const set=state.set,q=set.questions[state.index],listening=part<=4,lettersOnly=part<=2;
      const global=state.answers.length+1;
      const visual=part===1&&q.image?`<img class="practice-photo" src="${q.image}" alt="已驗證的 Part 1 題庫圖片">`:'';
      const passage=part>=5&&q.stimulus?`<div class="practice-passage">${esc(q.stimulus)}</div>`:'';
      body.innerHTML=`<section class="lesson-step practice-session"><div class="practice-session-head"><div><p class="eyebrow">PART ${part} · ${appdeployModeInfo(mode).label}</p><h3>${esc(set.title)}</h3></div><div class="practice-head-badges"><span class="badge quality-badge">Blueprint ${set.validation.score}</span>${part===1?`<span class="badge">圖像驗證 ${set.validation.imageScore}/100</span>`:''}<span class="badge">${global} / ${state.target}</span></div></div>
      <p class="quality-note">✓ 結構檢查＋本機獨立規則驗證已通過 · 非 ETS 官方題</p>${visual}
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
          save(KEYS.partMistakes,rows.slice(-500));
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
      save(KEYS.partSessions,rows.slice(-500));
      const extra={};extra[`part${part}Answered`]=total;extra[`part${part}Correct`]=correct;
      publishGoalEvent(makeGoalEvent(`Part ${part} 訓練`,duration,total,correct,state.answers.filter(x=>!x.correct).map(x=>x.item.skill),extra));
      body.innerHTML=`<section class="hero"><p class="eyebrow">PART ${part} COMPLETE</p><h2>${correct}/${total}</h2><p>${duration} 分鐘 · Blueprint 平均 ${Math.round(state.scores.reduce((a,b)=>a+b,0)/state.scores.length)||'—'}。</p><button id="doneP" class="primary wide">完成</button></section>`;
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
    return `<section id="fullMockPanel" class="card full-mock-card"><div class="full-mock-head"><div><span class="part-number">FULL MOCK · 200 QUESTIONS</span><h3>完整 TOEIC-style 模考</h3></div><span class="badge">P1–P7</span></div><p>Listening 100 題＋Reading 100 題。各題組沿用 Blueprint 驗證與多口音引擎。</p><div class="full-mock-spec"><span>Listening 約 45 分</span><span>Reading 75 分</span><span>共 200 題</span></div><div class="full-mock-mode-grid"><button class="primary full-mock-start" id="startFullMockStrict"><strong>開始全真模式</strong><span>聽力每題組 1 次 · Reading 75:00 倒數 · 作答中不顯示解析</span></button><button class="secondary full-mock-start" id="startFullMockTraining"><strong>開始訓練模考</strong><span>聽力最多 2 次 · 可退出後繼續 · Reading 不強制倒數</span></button></div><p class="muted full-mock-note">分數為系統依答對題數估算的練習區間，不是 ETS 官方換算成績。</p></section>${hist}`;
  };

  function renderMockQuestion(a){
    const set=a.currentSet;if(!set)return loadMockBlock();
    const q=set.questions[a.currentIndex];if(!q){a.currentSet=null;a.currentIndex=0;persistMock(a);return loadMockBlock()}
    window.toeicStopAudio?.();mockPendingChoice=null;mockVoiceResults=[];
    const listening=set.part<=4,lettersOnly=set.part<=2,maxPlays=a.mode==='strict'?1:2,audioRequired=listening&&!a.audioComplete;
    const rem=remainingReading(a),timer=set.part>=5&&a.mode==='strict'?`<span class="badge mock-timer">Reading <strong id="fullMockTimer">${fmt(rem||0)}</strong></span>`:`<span class="badge">${set.part<=4?'Listening':'Reading'}</span>`;
    body.innerHTML=`<section class="lesson-step practice-session full-mock-session"><div class="practice-session-head"><div><p class="eyebrow">FULL MOCK · PART ${set.part}</p><h3>${esc(PART_NAMES[set.part])}</h3></div><div class="practice-head-badges">${timer}<span class="badge">${a.answers.length+1} / 200</span></div></div><div class="full-mock-section-progress"><span>Part ${set.part}: ${partAnswered(a,set.part)+1} / ${FULL_COUNTS[set.part]}</span><span>Blueprint ${set.validation.score}</span></div><p class="quality-note">✓ 已通過驗題 · 模考作答中不顯示正解與解析 · 非 ETS 官方題</p>
    ${set.part===1&&q.image?`<img class="practice-photo" src="${q.image}" alt="Part 1 情境圖片">`:''}
    ${listening?`<div class="listen-controls"><button class="secondary" id="playFullMockAudio" ${a.plays>=maxPlays&&a.audioComplete?'disabled':''}>${a.audioComplete?'音檔已播放':'播放正式音檔'}（${a.plays}/${maxPlays}）</button><small>${a.mode==='strict'?'全真模式：每題／題組 1 次':'訓練模考：最多 2 次'}${audioRequired?' · 播放完畢後才能作答':''}</small></div>`:''}
    ${set.part>=5&&q.stimulus?`<div class="practice-passage">${esc(q.stimulus)}</div>`:''}<h3>${lettersOnly?'請依音檔內容選擇答案。':esc(q.q)}</h3>
    <div class="practice-options ${lettersOnly?'letter-grid':''}">${q.options.map((o,i)=>`<button class="option full-mock-answer ${lettersOnly?'letter-only':''}" data-i="${i}" ${audioRequired?'disabled':''}>${lettersOnly?String.fromCharCode(65+i):`${String.fromCharCode(65+i)}. ${esc(o)}`}</button>`).join('')}</div>
    <div class="full-mock-confirm"><span class="muted">選擇後仍可更改，按確認才送出本題。</span><button class="primary" id="confirmFullMockAnswer" disabled>確認答案 →</button></div></section>`;
    document.querySelector('#playFullMockAudio')?.addEventListener('click',()=>playMockAudio());
    document.querySelectorAll('.full-mock-answer').forEach(btn=>btn.onclick=()=>{if(btn.disabled)return;mockPendingChoice=Number(btn.dataset.i);document.querySelectorAll('.full-mock-answer').forEach(x=>x.classList.remove('selected'));btn.classList.add('selected');document.querySelector('#confirmFullMockAnswer').disabled=false});
    document.querySelector('#confirmFullMockAnswer').onclick=()=>confirmMockAnswer();
    if(set.part>=5&&a.mode==='strict') startMockTimer(); else clearMockTimer();
  }

  function playMockAudio(){
    const a=activeMock(),set=a?.currentSet;if(!a||!set||set.part>4)return;
    const max=a.mode==='strict'?1:2;if(a.plays>=max){toast(a.mode==='strict'?'全真模式音檔只能播放一次':'訓練模考每題組最多播放兩次');return}
    const q=set.questions[a.currentIndex],segments=listeningSegments(set,q,a.answers.length+(a.blockNumbers?.[String(set.part)]||0));
    const results=playSegments(segments,`mock:${a.id}:${set.part}:${a.blockNumbers?.[String(set.part)]||0}:${set.part<=2?a.currentIndex:0}`,document.querySelector('#playFullMockAudio'));
    a.plays+=1;a.audioComplete=true;a.currentAccents=[...new Set(segments.map(x=>x.accent))];a.currentVoiceResults=results;persistMock(a);
    renderMockQuestion(a);
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
      const set=makeValidatedBlock(part,count,Number(a.seed||97)+part*31,'mock',blockNumber);
      a.currentSet=set;a.currentIndex=0;a.blockNumbers[String(part)]=blockNumber;a.validationScores[String(part)]=[...(a.validationScores[String(part)]||[]),set.validation.score];a.plays=0;a.audioComplete=part>4;persistMock(a);renderMockQuestion(a);
    }catch(e){
      console.error(e);body.innerHTML=`<section class="lesson-step"><p class="eyebrow">FULL MOCK · GENERATION FAILED</p><h3>Part ${part} 第 ${blockNumber} 題組未通過驗題</h3><div class="card"><p class="muted">已完成的 ${a.answers.length}/200 題仍保留。</p></div><div class="actions"><button class="primary" id="fullMockRetry">重新產生題組</button><button class="secondary" id="fullMockExit">先退出，保留進度</button></div></section>`;document.querySelector('#fullMockRetry').onclick=loadMockBlock;document.querySelector('#fullMockExit').onclick=()=>dialog.close();
    }
  }

  function confirmMockAnswer(){
    const a=activeMock(),set=a?.currentSet;if(!a||!set||mockPendingChoice===null)return;
    if(a.mode==='strict'&&a.readingDeadline&&remainingReading(a)<=0)return finishMock(a,true);
    const q=set.questions[a.currentIndex],accents=a.currentAccents||[],fallbacks=(a.currentVoiceResults||[]).filter(x=>x.fallback).map(x=>x.target);
    a.answers.push({part:set.part,q,choice:mockPendingChoice,correct:mockPendingChoice===q.answer,accents,voiceFallbacks:fallbacks,audioText:set.audioText,displayText:set.displayText,validationScore:set.validation.score});
    if(mockPendingChoice!==q.answer){
      const rows=partMistakes(),t=now();rows.push({id:`part-m-${Date.now()}-${Math.random().toString(36).slice(2)}`,part:set.part,question:q,choice:mockPendingChoice,audioText:set.audioText,displayText:set.displayText,accents,validationScore:set.validation.score,source:'full-mock',status:'unmastered',reviewStage:0,correctStreak:0,reviewCount:0,firstWrongAt:t,lastWrongAt:t,lastReviewedAt:t,nextReviewAt:new Date(Date.now()+DAY_MS).toISOString(),imageData:q.image||'',imageMimeType:q.image?'image/svg+xml':''});save(KEYS.partMistakes,rows.slice(-500));
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
    const h=mockHistory();h.push(result);save(MOCK_HISTORY,h.slice(-50));localStorage.removeItem(MOCK_KEY);
    body.innerHTML=`<section class="hero"><p class="eyebrow">FULL MOCK COMPLETE</p><h2>${correct.length}/200</h2><p>Listening ${listening}/100 · Reading ${reading}/100 · 預估 ${result.estimatedMin}–${result.estimatedMax}${timedOut?' · 時間到':''}</p><button id="doneMock" class="primary wide">完成</button></section>`;document.querySelector('#doneMock').onclick=()=>{dialog.close();render()};
  }

  window.startFullMock=function(arg){
    if(activeMock())return resumeFullMock();
    let mode='training';
    const id=arg?.currentTarget?.id||document.activeElement?.id||'';
    if(String(id).includes('Strict'))mode='strict';
    if(mode==='strict'&&!confirm('全真模式：Listening 每題／題組只能播放一次；Reading 75 分鐘倒數會持續計時。確定開始？'))return;
    const t=Date.now(),a={id:`full-mock-${t}`,mode,startedAt:t,currentPart:1,currentSet:null,currentIndex:0,blockNumbers:{},answers:[],validationScores:{},plays:0,audioComplete:false,currentAccents:[],currentVoiceResults:[],seed:t%997};persistMock(a);resumeFullMock();
  };
  window.resumeFullMock=function(){
    const a=activeMock();if(!a)return;window.toeicStopAudio?.();clearMockTimer();dialogTitle.textContent=`完整模考 · ${modeLabel(a.mode)}`;if(!dialog.open)dialog.showModal();
    if(a.mode==='strict'&&a.readingDeadline&&remainingReading(a)<=0)return finishMock(a,true);
    if(a.currentPart>=5&&!a.readingStartedAt)return showReadingTransition(a);
    if(a.currentSet)renderMockQuestion(a);else loadMockBlock();
  };
  window.discardFullMock=function(){
    const a=activeMock();if(!a||!confirm(`確定放棄目前 ${mockProgress(a)}/200 的完整模考進度？`))return;
    window.toeicStopAudio?.();clearMockTimer();localStorage.removeItem(MOCK_KEY);if(dialog.open)dialog.close();render();
  };

  // ---------------------------------------------------------------------------
  // PROGRESS SUMMARY — Blueprint + accent exposure
  // ---------------------------------------------------------------------------
  const oldProgressPage=progressPage;
  window.progressPage=function(){
    const base=oldProgressPage();
    const rows=partSessions(),scores=rows.flatMap(r=>r.blueprintScores||[]),exposure=rows.flatMap(r=>r.accentExposure||[]);
    const blueprint=scores.length?`<div class="section-head"><h3>Blueprint 品質</h3><span class="badge">${scores.length} 題組</span></div><div class="card blueprint-summary"><div><small>平均品質</small><strong>${Math.round(scores.reduce((a,b)=>a+b,0)/scores.length)}/100</strong></div><div><small>門檻</small><strong>${QUALITY_THRESHOLD}+</strong></div></div>`:'';
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
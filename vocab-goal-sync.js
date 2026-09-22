(() => {
  "use strict";
  const ROUND_PREFIX="toeicVocabGoalRoundV1:";
  const RECEIPT_PREFIX="GoalManagerToeicVocabReceiptV1:";
  const LOCK_KEY="toeicVocabRoundLeaseV1";
  const IDLE_MS=120000;
  const dateKey=ms=>{const d=new Date(ms);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
  const round3=n=>Math.round(n*1000)/1000;
  const keyFor=id=>ROUND_PREFIX+encodeURIComponent(String(id));
  const read=(key,fallback=null)=>{const raw=localStorage.getItem(key);return raw===null?fallback:JSON.parse(raw)};
  const put=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const stamp=()=>new Date().toISOString();
  function initTiming(quiz,at=Date.now()){
    if(quiz.timing){
      const t=quiz.timing;
      if(t.version!==1||!t.days||typeof t.days!=="object"||Array.isArray(t.days)||!Object.values(t.days).every(n=>Number.isFinite(n)&&n>=0))throw Error("單字計時資料格式異常；請先匯出備份");
      return t;
    }
    return quiz.timing={version:1,startedAt:new Date(at).toISOString(),days:{},legacyPartial:(quiz.answers||[]).some(Boolean)};
  }
  function addTime(t,start,end){
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return;
    while(start<end){
      const d=new Date(start),next=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1).getTime(),stop=Math.min(end,next),key=dateKey(start);
      t.days[key]=(t.days[key]||0)+(stop-start);t.lastAt??={};t.lastAt[key]=new Date(stop-1).toISOString();start=stop;
    }
  }
  function createClock(quiz,persist,options={}){
    const wall=options.wall||Date.now,mono=options.mono||(()=>performance.now()),visible=options.visible||(()=>document.visibilityState==="visible"),owner=options.owner||(()=>true);
    const t=initTiming(quiz,wall());let last=wall(),lastMono=mono(),lastInput=last,lastSaved=last,running=true,stopped=false;
    persist();
    function tick(force=false){
      if(stopped)return;
      const n=wall(),m=mono(),delta=m-lastMono,span=n-last;
      if(running&&visible()&&owner()&&delta>=0&&delta<=15000&&span>=0&&Math.abs(span-delta)<2000){
        const end=Math.min(n,lastInput+IDLE_MS),start=Math.max(last,end-delta);
        if(end>start)addTime(t,start,end);
      }
      last=n;lastMono=m;
      if(force||n-lastSaved>=5000){persist();lastSaved=n}
    }
    return {
      tick,
      interact(){tick();lastInput=wall();running=true},
      visibility(){tick(true);running=visible();last=wall();lastMono=mono();if(running)lastInput=last},
      stop(){if(stopped)return;tick(true);stopped=true},
      seconds:()=>round3(Object.values(t.days).reduce((a,b)=>a+b,0)/1000)
    };
  }
  async function acquire(){
    if(navigator.locks?.request){
      return new Promise((resolve,reject)=>{
        let release;
        const held=new Promise(done=>{release=done});
        navigator.locks.request("toeic-vocabulary-round-v1",{ifAvailable:true},async lock=>{
          if(!lock){reject(Error("另一個分頁正在進行單字訓練；請先關閉那個訓練視窗"));return}
          let live=true;resolve({valid:()=>live,assert(){if(!live)throw Error("單字訓練已關閉，請重新開啟")},release(){live=false;release()}});
          await held;
        }).catch(reject);
      });
    }
    const token=`${Date.now()}-${Math.random().toString(36).slice(2)}`,old=read(LOCK_KEY);
    if(old?.until>Date.now())throw Error("另一個分頁正在訓練；關閉後稍候再試");
    put(LOCK_KEY,{token,until:Date.now()+30000});
    await new Promise(resolve=>setTimeout(resolve,80));
    const valid=()=>{try{return read(LOCK_KEY)?.token===token}catch{return false}};
    if(!valid())throw Error("請只保留一個單字訓練分頁");
    const beat=setInterval(()=>{if(valid())put(LOCK_KEY,{token,until:Date.now()+30000})},10000);
    return {valid,assert(){if(!valid())throw Error("訓練已在另一個分頁開啟，請回到該分頁")},release(){clearInterval(beat);if(valid())localStorage.removeItem(LOCK_KEY)}};
  }
  function makeRecord(quiz){
    const set=quiz.set,answers=quiz.answers;
    if(!quiz.id||!Array.isArray(set)||!set.length||!Array.isArray(answers)||answers.length!==set.length||!set.every((_,i)=>typeof answers[i]?.ok==="boolean")||quiz.index<set.length)throw Error("必須完成整輪作答才可同步");
    const endedAt=quiz.completedAt||stamp(),timing=quiz.timing,correct=answers.filter(a=>a.ok).length;
    const daily=Object.entries(timing?.days||{}).filter(([,ms])=>Number.isFinite(ms)&&ms>0).sort(([a],[b])=>a.localeCompare(b)).map(([date,ms])=>({date,lastStudiedAt:timing.lastAt?.[date]||(dateKey(Date.parse(endedAt))===date?endedAt:null),durationSeconds:round3(ms/1000),questionsAnswered:answers.filter(a=>a.date===date).length,correctAnswers:answers.filter(a=>a.date===date&&a.ok).length}));
    const seconds=round3(daily.reduce((n,d)=>n+d.durationSeconds,0));
    const event=seconds>0?{
      schemaVersion:1,eventId:`toeic-vocab-${quiz.id}`,source:"news-toeic",activity:"toeic-vocabulary-training",goalKey:"foreign-language-preparation",goalLabels:["語言能力準備"],
      channelId:localStorage.getItem("goalSyncChannel")||"github-direct",sessionId:quiz.id,startedAt:timing.startedAt,endedAt,studyDate:dateKey(Date.parse(endedAt)),
      timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,durationSeconds:seconds,durationMinutes:seconds/60,dailyDurations:daily,
      questionsAnswered:set.length,correctAnswers:correct,accuracy:correct/set.length,vocabularyAnswered:set.length,vocabularyCorrect:correct,
      mode:quiz.mode||"meaning",articleId:"",articleTitle:quiz.mode==="context"?"單字例句填空":"單字主動複習",category:"Vocabulary",articlesCompleted:0,readingWpm:0,
      wrongSkills:correct<set.length?["Vocabulary"]:[],timingPolicy:"foreground-idle120-v1",legacyPartial:!!timing.legacyPartial
    }:null;
    return {schemaVersion:1,id:quiz.id,completedAt:endedAt,mode:quiz.mode||"meaning",total:set.length,correct,durationSeconds:seconds,event,
      reason:event?"":"舊紀錄沒有可核對的計時，未補算時間",answers:answers.map((a,i)=>({...a,wordId:set[i].id})),legacyPartial:!!timing?.legacyPartial};
  }
  function publish(record){
    // Keep vocabulary outside the legacy hub so an already-open old receiver cannot misallocate it.
    return {published:!!record.event,channel:"vocabulary-journal-v1"};
  }
  function complete(quiz,persist){
    const key=keyFor(quiz.id),existing=read(key);
    if(existing){if(existing.id!==quiz.id||existing.schemaVersion!==1)throw Error("原單字紀錄格式異常，未覆寫");return {...publish(existing),record:existing}}
    const record=makeRecord(quiz);
    if(!quiz.completedAt){quiz.completedAt=record.completedAt;persist()}
    put(key,record);
    return {...publish(record),record};
  }
  function records(){
    const rows=[];
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k?.startsWith(ROUND_PREFIX))continue;try{const r=read(k);if(r?.schemaVersion===1)rows.push(r)}catch{}}
    return rows.sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt)));
  }
  const duration=s=>{const n=Math.floor(Number(s)||0);return n>=60?`${Math.floor(n/60)} 分 ${n%60} 秒`:`${n} 秒`};
  function status(record){
    if(!record?.event)return record?.reason||"尚無單字訓練紀錄";
    let receipt=null;try{receipt=read(RECEIPT_PREFIX+record.event.eventId)}catch{}
    if(receipt?.status==="counted")return `目標管理已接收 ${duration(receipt.seconds)} · ${(receipt.targets||[]).join("、")}`;
    if(receipt?.status==="partial")return `已計入 ${duration(receipt.seconds)}；其餘日期沒有期間內的字彙行動，暫未計入`;
    if(receipt?.status==="deferred")return "紀錄已保留；沒有期間內對應的字彙行動，暫未計入";
    return "已保存至 Goal Sync；請在同一瀏覽器開啟 GitHub 目標管理，按「立即同步」";
  }
  window.ToeicVocabSync=Object.freeze({version:"2.6.2",ROUND_PREFIX,RECEIPT_PREFIX,dateKey,keyFor,initTiming,addTime,createClock,acquire,makeRecord,complete,records,duration,status});
})();

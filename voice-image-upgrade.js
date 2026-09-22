(() => {
  'use strict';
  const KEY='toeicGithubVoiceSettingsV1',TAGS={US:['en-US'],UK:['en-GB'],CA:['en-CA'],'AU-NZ':['en-AU','en-NZ']};
  const assignments=new Map();let previousAccent='';
  const get=()=>{try{return {accent:'RANDOM',rate:.95,autoPlay:false,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {accent:'RANDOM',rate:.95,autoPlay:false}}};
  const normalize=a=>a==='AU_NZ'||a==='AU'||a==='NZ'?'AU-NZ':Object.hasOwn(TAGS,a)?a:'RANDOM';
  function accents(key,count=1,mode=get().accent){
    const fixed=normalize(mode);if(fixed!=='RANDOM')return Array(count).fill(fixed);
    const mapKey=`${key}|${count}`;if(assignments.has(mapKey))return [...assignments.get(mapKey)];
    const E=window.ToeicRandomEngine;let bag=E.shuffle(Object.keys(TAGS),E.rng(E.nonce()));
    if(bag[0]===previousAccent)[bag[0],bag[1]]=[bag[1],bag[0]];
    const result=Array.from({length:count},(_,i)=>bag[i%bag.length]);previousAccent=result[0];assignments.set(mapKey,result);
    if(assignments.size>400)assignments.delete(assignments.keys().next().value);
    return result;
  }
  function choose(accent,used){
    const available=window.speechSynthesis?.getVoices()||[],english=available.filter(v=>/^en[-_]/i.test(v.lang));
    const exact=english.filter(v=>TAGS[accent]?.some(t=>t.toLowerCase()===v.lang.toLowerCase()));
    const voice=exact.find(v=>!used.has(v.voiceURI))||exact[0]||english.find(v=>!used.has(v.voiceURI))||english[0];
    if(voice)used.add(voice.voiceURI);
    return {voice,info:{target:accent,actualLang:voice?.lang||'device-default',actualName:voice?.name||'裝置預設',fallback:!voice||!exact.includes(voice)}};
  }
  let current=null,generation=0;
  function paint(s,phase){
    if(!s?.button?.isConnected)return;const b=s.button;
    if(!b.dataset.audioIdleLabel)b.dataset.audioIdleLabel=b.textContent;
    b.classList.toggle('audio-playing',phase==='playing');b.classList.toggle('audio-paused',phase==='paused');
    const compact=b.classList.contains('analysis-sentence-audio');
    b.textContent=phase==='playing'?(compact?'⏸':'⏸ 暫停'):phase==='paused'?(compact?'▶':s.resumeFallback?'▶ 接續句子':'▶ 繼續'):b.dataset.audioIdleLabel;
    b.setAttribute('aria-label',phase==='playing'?'暫停語音':phase==='paused'?'繼續語音':'播放語音');
  }
  function end(s,status,error){
    if(current!==s)return;
    generation++;current=null;clearTimeout(s.pauseTimer);clearTimeout(s.startTimer);paint(s,'idle');
    s.resolve({status,error,results:s.results});
    try{s.onEnd?.({status,error,results:s.results})}catch(e){console.warn(e)}
  }
  function stop(){
    const old=current;generation++;
    if(old){clearTimeout(old.pauseTimer);clearTimeout(old.startTimer);try{old.audio?.pause()}catch{}}
    try{window.speechSynthesis?.cancel()}catch{}
    if(old)end(old,'stopped');
  }
  function speakCurrent(s){
    if(current!==s)return;
    if(s.index>=s.segments.length){end(s,'ended');return}
    const segment=s.segments[s.index],selection=s.voices.get(segment.speaker);
    const token=++generation,u=new SpeechSynthesisUtterance(segment.text.slice(s.offset||0));s.utterance=u;s.started=false;
    if(selection?.voice)u.voice=selection.voice;u.lang=selection?.voice?.lang||TAGS[segment.accent]?.[0]||'en-US';u.rate=Math.max(.7,Math.min(1.1,Number(get().rate)||.95));
    const live=()=>current===s&&token===generation;
    const originalOffset=s.offset||0;
    u.onstart=()=>{if(live()){s.started=true;clearTimeout(s.startTimer)}};
    u.onboundary=e=>{if(live()&&Number.isInteger(e.charIndex))s.offset=originalOffset+e.charIndex};
    u.onpause=()=>{if(live()){s.nativePaused=true;clearTimeout(s.pauseTimer)}};
    u.onend=()=>{if(!live()||s.paused)return;s.index++;s.offset=0;speakCurrent(s)};
    u.onerror=e=>{if(!live())return;end(s,'error',String(e.error||'speech error'))};
    s.startTimer=setTimeout(()=>{if(live()&&!s.started&&!s.paused){try{speechSynthesis.cancel()}catch{}end(s,'error','語音未啟動，請確認裝置英文語音設定')}},8000);
    speechSynthesis.speak(u);
  }
  function toggle(segments,key,button,opts={}){
    if(current?.key===key){
      const s=current;if(button)s.button=button;
      if(!s.paused){
        s.paused=true;s.nativePaused=false;paint(s,'paused');
        if(s.audio){s.audio.pause();return {action:'paused',promise:s.promise,results:s.results}}
        try{speechSynthesis.pause()}catch{}
        s.pauseTimer=setTimeout(()=>{if(current!==s||!s.paused||s.nativePaused)return;generation++;s.resumeFallback=true;try{speechSynthesis.cancel()}catch{}paint(s,'paused')},220);
        return {action:'paused',promise:s.promise,results:s.results};
      }
      s.paused=false;clearTimeout(s.pauseTimer);paint(s,'playing');
      if(s.audio){s.audio.play().catch(e=>end(s,'error',e.message))}
      else if(s.resumeFallback){speakCurrent(s)}else{try{speechSynthesis.resume()}catch(e){end(s,'error',e.message)}}
      return {action:'resumed',promise:s.promise,results:s.results};
    }
    if(!opts.src&&(!window.speechSynthesis||typeof SpeechSynthesisUtterance==='undefined'))return {action:'error',results:[],promise:Promise.resolve({status:'error',error:'裝置未提供語音'})};
    const clean=segments.filter(x=>String(x.text||'').trim()).map(x=>({...x,text:String(x.text),speaker:x.speaker||'Narrator'}));
    if(!clean.length&&!opts.src)return {action:'error',results:[],promise:Promise.resolve({status:'error',error:'沒有可播放文字'})};
    stop();
    const s={key,button,segments:clean,index:0,offset:0,paused:false,resumeFallback:false,voices:new Map(),results:[],onEnd:opts.onEnd};
    const used=new Set();for(const x of clean)if(!s.voices.has(x.speaker))s.voices.set(x.speaker,choose(x.accent||'US',used));s.results=[...s.voices.values()].map(x=>x.info);
    s.promise=new Promise(resolve=>s.resolve=resolve);current=s;paint(s,'playing');
    if(opts.src){const audio=new Audio(opts.src);s.audio=audio;audio.onended=()=>end(s,'ended');audio.onerror=()=>end(s,'error','錄音讀取失敗');audio.play().catch(e=>end(s,'error',e.message))}else{speakCurrent(s)}
    return {action:'started',promise:s.promise,results:s.results};
  }
  function textSegments(text,accent){const E=typeof Intl.Segmenter==='function'?new Intl.Segmenter('en',{granularity:'sentence'}):null;return (E?[...E.segment(text)].map(x=>x.segment):[text]).map(t=>({text:t,accent,speaker:'Narrator'}))}
  window.toeicAudio={toggle,stop,accents,getSettings:get,state:()=>current?{key:current.key,paused:current.paused}:null};
  window.toeicStopAudio=stop;
  window.toeicToggleSpeech=(text,key=`text:${text}`,button=null,accent='')=>{
    const a=accents(key,1,accent||get().accent)[0];const r=toggle(textSegments(String(text||''),a),key,button);
    r.promise.then(x=>{if(x.status==='error')toast(x.error||'無法播放語音')});return r.promise;
  };
  window.speech=(text,_lang,key,button)=>window.toeicToggleSpeech(text,key||`text:${text}`,button||document.activeElement);
  window.ToeicAssets={scenes:[],manifest:{packs:{}},ready:null};
  const safeFetch=async(url,fallback)=>{try{const r=await fetch(url);if(!r.ok)throw Error(r.status);return await r.json()}catch{return fallback}};
  window.ToeicAssets.ready=Promise.all([safeFetch('./data/part1-bank.json',{scenes:[]}),safeFetch('./audio/manifest.json',{packs:{}})]).then(([bank,manifest])=>{window.ToeicAssets.scenes=bank.scenes||[];window.ToeicAssets.manifest=manifest});
  const oldMake=window.makeQuestion;
  window.makeQuestion=function(part,i,seed=0){
    const bank=window.ToeicAssets.scenes;
    if(Number(part)===1&&bank.length){const s=bank[((i+seed)%bank.length+bank.length)%bank.length];return {id:`part1-${s.id}-${seed}-${i}`,sceneId:s.id,part:1,skill:'Photo description',q:'Choose the statement that best describes the picture.',options:[...s.options],answer:Math.max(0,s.options.indexOf(s.correct)),explain:`The supported description is: ${s.correct}`,image:s.image,source:'github-part1-bank'}}
    return oldMake.apply(this,arguments);
  };
  function settingsCard(){
    const host=document.querySelector('#appMain');if(!host?.querySelector('#saveSettings')||host.querySelector('#toeicVoiceImageCard'))return;
    const s=get(),card=document.createElement('section');card.className='card';card.id='toeicVoiceImageCard';
    card.innerHTML=`<h3>聽力與圖片</h3><p class="muted">預建 Part 1 插圖；裝置英文語音。缺少地區語音時顯示替代語音，不將它冒稱為該口音。</p><label class="setting"><span>口音</span><select id="toeicVoiceAccent">${['RANDOM',...Object.keys(TAGS)].map(a=>`<option value="${a}">${a==='RANDOM'?'隨機（US / UK / CA / AU-NZ）':a}</option>`).join('')}</select></label><label class="setting"><span>語速</span><input id="toeicVoiceRate" type="number" min=".7" max="1.1" step=".05"></label><div class="actions"><button class="primary" id="toeicVoiceSave">儲存聽力設定</button><button class="secondary" id="toeicVoiceTest">測試播放</button><button class="ghost" id="toeicVoiceStop">停止語音</button></div><p class="muted">TTS 暫停若裝置不支援，改為中止並從句內最近位置或本句重新接續；錄音檔使用原生暫停。錄音庫保留於 audio/manifest.json。</p>`;
    host.append(card);card.querySelector('#toeicVoiceAccent').value=normalize(s.accent);card.querySelector('#toeicVoiceRate').value=s.rate;
    card.querySelector('#toeicVoiceSave').onclick=()=>{localStorage.setItem(KEY,JSON.stringify({...get(),accent:normalize(card.querySelector('#toeicVoiceAccent').value),rate:Math.max(.7,Math.min(1.1,Number(card.querySelector('#toeicVoiceRate').value)||.95))}));toast('聽力設定已儲存')};
    card.querySelector('#toeicVoiceTest').onclick=e=>window.toeicToggleSpeech('This is a listening test. You can pause and continue this recording.', 'settings:test',e.currentTarget,card.querySelector('#toeicVoiceAccent').value);
    card.querySelector('#toeicVoiceStop').onclick=stop;
  }
  const oldRender=window.render;window.render=function(){const result=oldRender.apply(this,arguments);settingsCard();return result};
  document.getElementById('lessonDialog')?.addEventListener('close',stop);window.addEventListener('pagehide',stop);
})();

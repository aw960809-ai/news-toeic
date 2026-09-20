(function(){
  "use strict";

  const PART1_BANK_URL = "./data/part1-bank.json";
  const AUDIO_MANIFEST_URL = "./audio/manifest.json";
  const VOICE_KEY = "toeicGithubVoiceSettingsV1";
  const VOICE_RANDOM_MIGRATION_KEY = "toeicGithubVoiceRandomV1";
  const ACCENTS = ["US","UK","CA","AU-NZ"];
  const RANDOM_ACCENT = "RANDOM";
  const randomAccentByQuestion = new Map();
  let lastRandomAccent = "";

  let part1Bank = [];
  let audioManifest = { packs: { "US": {}, "UK": {}, "CA": {}, "AU-NZ": {} } };

  function load(key, fallback){ try{ const x = JSON.parse(localStorage.getItem(key) || ""); return x ?? fallback; }catch(_){ return fallback; } }
  function save(key, value){ try{ localStorage.setItem(key, JSON.stringify(value)); }catch(_){} }
  function esc(v){ return String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
  function voiceSettings(){ return { accent:RANDOM_ACCENT, rate:0.95, autoPlay:true, ...load(VOICE_KEY, {}) }; }
  function persistVoiceSettings(next){ save(VOICE_KEY, { ...voiceSettings(), ...next }); }
  function toast(msg){ try{
    const host = document.getElementById("toastHost");
    if(!host) return;
    const e = document.createElement("div");
    e.className = "toast";
    e.textContent = msg;
    host.appendChild(e);
    setTimeout(()=>e.remove(),2200);
  }catch(_){}
  }

  async function fetchJSON(url, fallback){
    try{
      const r = await fetch(url, { cache:"no-store" });
      if(!r.ok) throw new Error(String(r.status));
      return await r.json();
    }catch(_){
      return fallback;
    }
  }

  async function bootAssets(){
    const [bank, manifest] = await Promise.all([
      fetchJSON(PART1_BANK_URL, { scenes: [] }),
      fetchJSON(AUDIO_MANIFEST_URL, { packs: { "US": {}, "UK": {}, "CA": {}, "AU-NZ": {} } })
    ]);
    part1Bank = Array.isArray(bank.scenes) ? bank.scenes : [];
    audioManifest = manifest && manifest.packs ? manifest : { packs: { "US": {}, "UK": {}, "CA": {}, "AU-NZ": {} } };
  }

  function normalizeAccent(accent){
    const a = String(accent || RANDOM_ACCENT).toUpperCase();
    if(a === "RANDOM" || a === "AUTO") return RANDOM_ACCENT;
    if(a === "UK") return "UK";
    if(a === "CA") return "CA";
    if(a === "AU" || a === "AU-NZ" || a === "NZ") return "AU-NZ";
    return "US";
  }

  function chooseRandomAccent(){
    const pool = ACCENTS.filter(a => a !== lastRandomAccent);
    const next = pool[Math.floor(Math.random() * pool.length)] || ACCENTS[0];
    lastRandomAccent = next;
    return next;
  }

  function resolveAccent(accent, key=""){
    const normalized = normalizeAccent(accent);
    if(normalized !== RANDOM_ACCENT) return normalized;
    if(key && randomAccentByQuestion.has(key)) return randomAccentByQuestion.get(key);
    const picked = chooseRandomAccent();
    if(key) randomAccentByQuestion.set(key, picked);
    return picked;
  }

  function voiceCandidates(accent){
    accent = resolveAccent(accent);
    const map = {
      "US": ["en-US", "english (united states)", "samantha", "google us english"],
      "UK": ["en-GB", "english (united kingdom)", "serena", "daniel", "google uk english"],
      "CA": ["en-CA", "english (canada)"],
      "AU-NZ": ["en-AU", "en-NZ", "english (australia)", "english (new zealand)", "karen", "google australian english"]
    };
    return map[normalizeAccent(accent)] || map.US;
  }

  function pickVoice(accent){
    if(!("speechSynthesis" in window)) return null;
    const voices = speechSynthesis.getVoices() || [];
    const candidates = voiceCandidates(accent);
    const lower = x => String(x || "").toLowerCase();
    for(const c of candidates){
      const found = voices.find(v => lower(v.lang) === lower(c) || lower(v.name).includes(lower(c)));
      if(found) return found;
    }
    return voices.find(v => lower(v.lang).startsWith("en")) || null;
  }

  function questionText(item){
    if(!item) return "";
    if(item.part === 1) return (item.options || []).join(". ");
    if(item.part === 2) return `${item.q}. ${(item.options || []).join(". ")}`;
    if(item.stimulus) return item.stimulus;
    return item.q || "";
  }

  function fileClipFor(item, resolvedAccent){
    const accent = resolveAccent(resolvedAccent || voiceSettings().accent, String(item?.id || ""));
    const pack = (audioManifest.packs && audioManifest.packs[accent]) || {};
    return pack[String(item?.id || "")] || "";
  }

  const playback = {kind:"",key:"",audio:null,utterance:null,button:null,paused:false,resolve:null};

  function rememberButton(button){
    if(!(button instanceof HTMLButtonElement))return null;
    if(!button.dataset.audioIdleLabel)button.dataset.audioIdleLabel=button.textContent||"🔊";
    return button;
  }

  function setButtonState(button,state){
    button=rememberButton(button);
    if(!button)return;
    button.classList.remove("audio-playing","audio-paused");
    if(state==="playing"){
      button.classList.add("audio-playing");
      button.textContent=button.classList.contains("analysis-sentence-audio")?"⏸":"⏸ 暫停";
    }else if(state==="paused"){
      button.classList.add("audio-paused");
      button.textContent=button.classList.contains("analysis-sentence-audio")?"▶":"▶ 繼續";
    }else button.textContent=button.dataset.audioIdleLabel||"🔊";
  }

  function clearPlayback(value=true){
    const old=playback.button,done=playback.resolve;
    playback.kind="";playback.key="";playback.audio=null;playback.utterance=null;playback.button=null;playback.paused=false;playback.resolve=null;
    setButtonState(old,"idle");
    if(typeof done==="function"){try{done(value)}catch(_){}}
  }

  function stopPlayback(){
    try{if(playback.audio){playback.audio.pause();playback.audio.currentTime=0}}catch(_){}
    try{if("speechSynthesis" in window)speechSynthesis.cancel()}catch(_){}
    clearPlayback(false);
  }

  function activeButton(button=null){
    if(button instanceof HTMLButtonElement)return button;
    return document.activeElement instanceof HTMLButtonElement?document.activeElement:null;
  }

  function playRecordedClip(src,key,button=null){
    key=String(key||src||"recorded");button=activeButton(button);
    if(playback.kind==="audio"&&playback.key===key&&playback.audio){
      if(playback.audio.paused){
        playback.audio.play().catch(()=>{});playback.paused=false;setButtonState(playback.button||button,"playing");return Promise.resolve("resumed");
      }
      playback.audio.pause();playback.paused=true;setButtonState(playback.button||button,"paused");return Promise.resolve("paused");
    }
    stopPlayback();
    return new Promise((resolve,reject)=>{
      try{
        const a=new Audio(src);a.preload="auto";
        playback.kind="audio";playback.key=key;playback.audio=a;playback.button=rememberButton(button);playback.resolve=resolve;
        setButtonState(playback.button,"playing");
        a.onended=()=>clearPlayback(true);
        a.onerror=()=>{const err=new Error("audio error");clearPlayback(false);reject(err)};
        a.play().catch(err=>{clearPlayback(false);reject(err)});
      }catch(err){clearPlayback(false);reject(err)}
    });
  }

  function speakWithTTS(text,accent,key="",button=null){
    text=String(text||"");key=String(key||`tts:${text}`);button=activeButton(button);accent=resolveAccent(accent,key);
    if(!("speechSynthesis" in window))return Promise.reject(new Error("tts unavailable"));
    if(playback.kind==="tts"&&playback.key===key){
      try{
        if(speechSynthesis.paused||playback.paused){
          speechSynthesis.resume();playback.paused=false;setButtonState(playback.button||button,"playing");return Promise.resolve("resumed");
        }
        if(speechSynthesis.speaking){
          speechSynthesis.pause();playback.paused=true;setButtonState(playback.button||button,"paused");return Promise.resolve("paused");
        }
      }catch(_){}
    }
    stopPlayback();
    return new Promise((resolve,reject)=>{
      try{
        const u=new SpeechSynthesisUtterance(text),settings=voiceSettings();
        u.lang="en-US";u.rate=Number(settings.rate)||0.95;
        const voice=pickVoice(accent);if(voice){u.voice=voice;u.lang=voice.lang||u.lang}
        playback.kind="tts";playback.key=key;playback.utterance=u;playback.button=rememberButton(button);playback.resolve=resolve;
        setButtonState(playback.button,"playing");
        u.onend=()=>clearPlayback(true);
        u.onerror=err=>{clearPlayback(false);reject(err.error||err)};
        speechSynthesis.speak(u);
      }catch(err){clearPlayback(false);reject(err)}
    });
  }

  async function playQuestionAudio(item){
    const settings=voiceSettings(),key=`question:${String(item?.id||questionText(item))}`;
    const accent=resolveAccent(settings.accent,key),button=activeButton(document.querySelector("#playQ,#mockAudio,#playFullMockAudio"));
    const clip=fileClipFor(item,accent);
    if(clip){try{return await playRecordedClip(clip,key,button)}catch(_){}}
    return await speakWithTTS(questionText(item),accent,key,button);
  }

  function installSpeechOverride(){
    const original=window.speech;
    window.toeicToggleSpeech=(text,key="",button=null,accent="")=>speakWithTTS(String(text||""),accent||voiceSettings().accent,key||`text:${String(text||"")}`,button);
    window.toeicStopAudio=stopPlayback;
    if(typeof original==="function"){
      window.speech=(text,_lang,key="",button=null)=>speakWithTTS(String(text||""),voiceSettings().accent,key||`text:${String(text||"")}`,button)
        .catch(()=>{try{return original.call(this,text,_lang)}catch(_){}});
    }
    document.getElementById("lessonDialog")?.addEventListener("close",stopPlayback);
    window.addEventListener("pagehide",stopPlayback);
  }

  function installQuestionOverrides(){
    const originalMakeQuestion = window.makeQuestion;
    const originalSpeakQuestion = window.speakQuestion;

    if(typeof originalMakeQuestion === "function"){
      window.makeQuestion = function(part, i, seed = 0){
        if(Number(part) === 1 && Array.isArray(part1Bank) && part1Bank.length){
          const scene = part1Bank[(Number(i) + Number(seed || 0)) % part1Bank.length];
          return {
            id: `part1-${scene.id}-${seed}-${i}`,
            part: 1,
            skill: "Photo description",
            q: "Choose the statement that best describes the picture.",
            options: scene.options.slice(),
            answer: 0,
            explain: `The first statement best matches the image: ${scene.correct}`,
            image: scene.image,
            source: "github-part1-bank"
          };
        }
        return originalMakeQuestion.apply(this, arguments);
      };
    }

    if(typeof originalSpeakQuestion === "function"){
      window.speakQuestion = function(item){
        return playQuestionAudio(item).catch(() => originalSpeakQuestion.call(this, item));
      };
    }
  }

  function injectSettingCard(){
    const host = document.querySelector("#appMain");
    if(!host || !host.querySelector) return;
    const settingsHeading = Array.from(host.querySelectorAll("h2,h3")).find(el => /設定/.test(el.textContent || ""));
    const firstCard = settingsHeading ? settingsHeading.closest("div,section") : null;
    const cardHost = host.querySelector(".card:last-of-type") || firstCard || host;
    if(!cardHost || document.getElementById("toeicVoiceImageCard")) return;

    const state = voiceSettings();
    const wrapper = document.createElement("section");
    wrapper.className = "card";
    wrapper.id = "toeicVoiceImageCard";
    wrapper.innerHTML = `
      <h3>聽力與圖片強化</h3>
      <p class="muted">Part 1 現在使用預建圖片題庫；Part 1–4 先播放錄音檔（若未提供）再退回裝置英文 TTS。</p>
      <label class="setting"><span>預設口音</span>
        <select id="toeicVoiceAccent" class="settings-input">
          <option value="RANDOM">隨機（US / UK / CA / AU-NZ）</option>
          <option value="US">US</option>
          <option value="UK">UK</option>
          <option value="CA">CA</option>
          <option value="AU-NZ">AU / NZ</option>
        </select>
      </label>
      <label class="setting"><span>播放語速</span>
        <input id="toeicVoiceRate" class="settings-input" type="number" min="0.7" max="1.1" step="0.05" value="${esc(state.rate)}">
      </label>
      <div class="actions">
        <button id="toeicVoiceSave" class="primary">儲存聽力設定</button>
        <button id="toeicVoiceTest" class="secondary">測試播放</button>
      </div>
      <small class="muted">若未來把錄音檔加入 <code>audio/</code> 並在 audio/manifest.json 登錄，系統會自動優先播放錄音。</small>
    `;
    host.appendChild(wrapper);

    const accentInput = wrapper.querySelector("#toeicVoiceAccent");
    const rateInput = wrapper.querySelector("#toeicVoiceRate");
    accentInput.value = normalizeAccent(state.accent);
    rateInput.value = String(state.rate);

    wrapper.querySelector("#toeicVoiceSave").onclick = () => {
      const next = {
        accent: normalizeAccent(accentInput.value),
        rate: Math.max(0.7, Math.min(1.1, Number(rateInput.value) || 0.95))
      };
      persistVoiceSettings(next);
      toast("聽力設定已儲存");
    };

    wrapper.querySelector("#toeicVoiceTest").onclick = () => {
      const testAccent = resolveAccent(accentInput.value);
      toast(`本次測試口音：${testAccent}`);
      speakWithTTS("This is a listening test for your TOEIC GitHub system.", testAccent)
        .catch(() => toast("裝置目前無法播放 TTS"));
    };
  }

  function patchRender(){
    if(typeof window.render !== "function" || window.render.__voiceImagePatched) return;
    const original = window.render;
    const wrapped = function(){
      const out = original.apply(this, arguments);
      try{
        const settingsNav = document.querySelector('.nav-btn.active[data-route="settings"]');
        if(settingsNav) setTimeout(injectSettingCard, 0);
      }catch(_){}
      return out;
    };
    wrapped.__voiceImagePatched = true;
    window.render = wrapped;
  }

  function patchDialogAutoplay(){
    const originalOpenLesson = window.openLesson;
    if(typeof originalOpenLesson !== "function" || originalOpenLesson.__voiceImagePatched) return;
    const wrapped = function(){
      const res = originalOpenLesson.apply(this, arguments);
      const settings = voiceSettings();
      if(settings.autoPlay){
        setTimeout(() => {
          const btn = document.getElementById("speakArticle");
          if(btn) btn.click();
        }, 180);
      }
      return res;
    };
    wrapped.__voiceImagePatched = true;
    window.openLesson = wrapped;
  }

  function waitForBaseApp(){
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if(typeof window.render === "function" && typeof window.makeQuestion === "function" && typeof window.speakQuestion === "function"){
        clearInterval(timer);
        installSpeechOverride();
        installQuestionOverrides();
        patchRender();
        patchDialogAutoplay();
        try{ window.render(); }catch(_){}
      }else if(tries > 120){
        clearInterval(timer);
      }
    }, 100);
  }

  (async function init(){
    try{
      if(localStorage.getItem(VOICE_RANDOM_MIGRATION_KEY)!=="1"){
        const current=load(VOICE_KEY,{});
        if(!current.accent || String(current.accent).toUpperCase()==="US"){
          save(VOICE_KEY,{...current,accent:RANDOM_ACCENT});
        }
        localStorage.setItem(VOICE_RANDOM_MIGRATION_KEY,"1");
      }
    }catch(_){}
    await bootAssets();
    if("speechSynthesis" in window){
      try{ speechSynthesis.getVoices(); }catch(_){}
      window.speechSynthesis.addEventListener?.("voiceschanged", () => {});
    }
    waitForBaseApp();
  })();
})();

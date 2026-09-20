(function(){
  "use strict";

  const PART1_BANK_URL = "./data/part1-bank.json";
  const AUDIO_MANIFEST_URL = "./audio/manifest.json";
  const VOICE_KEY = "toeicGithubVoiceSettingsV1";

  let part1Bank = [];
  let audioManifest = { packs: { "US": {}, "UK": {}, "CA": {}, "AU-NZ": {} } };

  function load(key, fallback){ try{ const x = JSON.parse(localStorage.getItem(key) || ""); return x ?? fallback; }catch(_){ return fallback; } }
  function save(key, value){ try{ localStorage.setItem(key, JSON.stringify(value)); }catch(_){} }
  function esc(v){ return String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
  function voiceSettings(){ return { accent:"US", rate:0.95, autoPlay:true, ...load(VOICE_KEY, {}) }; }
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
    const a = String(accent || "US").toUpperCase();
    if(a === "UK") return "UK";
    if(a === "CA") return "CA";
    if(a === "AU" || a === "AU-NZ" || a === "NZ") return "AU-NZ";
    return "US";
  }

  function voiceCandidates(accent){
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

  function fileClipFor(item){
    const settings = voiceSettings();
    const accent = normalizeAccent(settings.accent);
    const pack = (audioManifest.packs && audioManifest.packs[accent]) || {};
    return pack[String(item.id || "")] || "";
  }

  function playRecordedClip(src){
    return new Promise((resolve, reject) => {
      try{
        const a = new Audio(src);
        a.preload = "auto";
        a.onended = () => resolve(true);
        a.onerror = () => reject(new Error("audio error"));
        a.play().catch(reject);
      }catch(err){
        reject(err);
      }
    });
  }

  function speakWithTTS(text, accent){
    return new Promise((resolve, reject) => {
      if(!("speechSynthesis" in window)) return reject(new Error("tts unavailable"));
      try{
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const settings = voiceSettings();
        u.lang = "en-US";
        u.rate = Number(settings.rate) || 0.95;
        const voice = pickVoice(accent);
        if(voice){
          u.voice = voice;
          u.lang = voice.lang || u.lang;
        }
        u.onend = () => resolve(true);
        u.onerror = err => reject(err.error || err);
        speechSynthesis.speak(u);
      }catch(err){
        reject(err);
      }
    });
  }

  async function playQuestionAudio(item){
    const clip = fileClipFor(item);
    if(clip){
      try{
        await playRecordedClip(clip);
        return;
      }catch(_){}
    }
    const settings = voiceSettings();
    await speakWithTTS(questionText(item), settings.accent);
  }

  function installSpeechOverride(){
    const original = window.speech;
    if(typeof original !== "function") return;
    window.speech = function(text, _lang){
      return speakWithTTS(String(text || ""), voiceSettings().accent).catch(() => {
        try{ return original.call(this, text, _lang); }catch(_){}
      });
    };
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
      <small class="muted">若未來把錄音檔加入 <code>apps/toeic/audio/</code> 並在 manifest 登錄，系統會自動優先播放錄音。</small>
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
      speakWithTTS("This is a listening test for your TOEIC GitHub system.", accentInput.value)
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
    await bootAssets();
    if("speechSynthesis" in window){
      try{ speechSynthesis.getVoices(); }catch(_){}
      window.speechSynthesis.addEventListener?.("voiceschanged", () => {});
    }
    waitForBaseApp();
  })();
})();

(() => {
  'use strict';
  const APP=document.documentElement.dataset.pwaApp||'app';
  const CHECK_MS=30*60*1000;
  let registration=null;
  let controllerReloaded=false;
  let pending=false;
  let lastCheck=0;

  const safeToReload=()=>{
    const openDialog=[...document.querySelectorAll('dialog')].some(d=>d.open);
    return !openDialog;
  };
  const statusText=message=>{
    const el=document.getElementById('pwaRuntimeStatus');
    if(el)el.textContent=message;
  };
  const showBanner=message=>{
    let el=document.getElementById('pwaRuntimeBanner');
    if(!el){
      el=document.createElement('div');
      el.id='pwaRuntimeBanner';
      el.className='pwa-runtime-banner';
      document.body.appendChild(el);
    }
    el.innerHTML=`<strong>程式更新</strong><span>${message}</span>`;
    el.classList.add('show');
  };
  const hideBanner=()=>document.getElementById('pwaRuntimeBanner')?.classList.remove('show');

  async function workerMeta(worker=navigator.serviceWorker?.controller){
    if(!worker)return null;
    try{
      const channel=new MessageChannel();
      return await new Promise(resolve=>{
        const timer=setTimeout(()=>resolve(null),900);
        channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data||null)};
        worker.postMessage({type:'GET_VERSION'},[channel.port2]);
      });
    }catch{return null}
  }

  async function activateWaiting(){
    if(!registration?.waiting)return false;
    if(!safeToReload()){
      pending=true;
      statusText('新版已下載；目前正在操作，結束後自動套用。');
      showBanner('新版已下載；目前正在操作，結束後自動套用。');
      return false;
    }
    pending=false;
    statusText('新版已下載，正在套用…');
    showBanner('新版已下載，正在安全套用…');
    registration.waiting.postMessage({type:'SKIP_WAITING'});
    return true;
  }

  function observe(reg){
    registration=reg;
    reg.addEventListener('updatefound',()=>{
      const worker=reg.installing;
      if(!worker)return;
      statusText('正在下載新版…');
      worker.addEventListener('statechange',()=>{
        if(worker.state==='installed'&&navigator.serviceWorker.controller){
          void activateWaiting();
        }
      });
    });
    if(reg.waiting&&navigator.serviceWorker.controller)void activateWaiting();
  }

  async function check(force=false){
    if(!('serviceWorker'in navigator)||navigator.onLine===false)return false;
    if(!force&&Date.now()-lastCheck<60_000)return true;
    lastCheck=Date.now();
    try{
      registration=registration||await navigator.serviceWorker.getRegistration('./')||
        await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
      observe(registration);
      statusText('正在檢查更新…');
      await registration.update();
      if(registration.waiting)await activateWaiting();
      else{
        const meta=await workerMeta();
        statusText(`自動更新已啟用${meta?.version?` · v${meta.version}`:''}`);
      }
      return true;
    }catch(error){
      console.warn(`[${APP}] PWA update check failed`,error);
      statusText('版本檢查暫時失敗；連線恢復後會自動重試。');
      return false;
    }
  }

  function injectSettingsCard(){
    const main=document.getElementById('appMain');
    if(!main||document.getElementById('pwaSystemCard'))return;
    const inSettings=!!(main.querySelector('#saveSettings')||main.querySelector('#savePeriod')||main.querySelector('#exportBackup'));
    if(!inSettings)return;
    const section=document.createElement('section');
    section.id='pwaSystemCard';
    section.className='card system-card pwa-system-card';
    section.innerHTML=`<div class="section-head pwa-card-head"><h3>應用程式更新</h3><span class="badge">AUTO</span></div>
      <p class="muted" id="pwaRuntimeStatus">自動更新已啟用；啟動、回到前景、網路恢復及每 30 分鐘檢查。</p>
      <button class="secondary wide" id="pwaRuntimeCheck" type="button">立即檢查更新</button>`;
    main.appendChild(section);
    document.getElementById('pwaRuntimeCheck')?.addEventListener('click',()=>void check(true));
    void workerMeta().then(meta=>statusText(`自動更新已啟用${meta?.version?` · v${meta.version}`:''}`));
  }

  async function boot(){
    if(!('serviceWorker'in navigator))return;
    try{
      registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
      observe(registration);
      void check(true);
    }catch(error){console.warn(`[${APP}] service worker registration failed`,error)}
    new MutationObserver(injectSettingsCard).observe(document.body,{childList:true,subtree:true});
    injectSettingsCard();
    setInterval(()=>void check(false),CHECK_MS);
  }

  navigator.serviceWorker?.addEventListener('controllerchange',()=>{
    if(controllerReloaded)return;
    if(!safeToReload()){
      pending=true;
      showBanner('新版已接管；完成目前操作後自動重新整理。');
      return;
    }
    controllerReloaded=true;
    hideBanner();
    setTimeout(()=>location.reload(),120);
  });

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){
      if(pending&&safeToReload()){pending=false;void activateWaiting()}
      void check(false);
    }
  });
  window.addEventListener('online',()=>void check(true));
  document.addEventListener('close',()=>{if(pending&&safeToReload())void activateWaiting()},true);

  window.AppPWA=Object.freeze({check});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
})();

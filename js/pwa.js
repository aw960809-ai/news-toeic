/* V97.3.0 THU personal automatic update lifecycle */
window.PWA=(function(){
  const CURRENT_VERSION=String(window.AppConfig?.version||'V97.3.0').replace(/^V/i,'');
  const CHECK_INTERVAL=5*60*1000;
  const CHECK_MIN_GAP=60*1000;
  let deferredPrompt=null;
  let registration=null;
  let reloading=false;
  let lastUpdateCheck=0;
  let periodicTimer=null;

  function isStandalone(){
    return window.matchMedia?.('(display-mode: standalone)').matches===true ||
      window.navigator.standalone===true;
  }
  function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent||'')}
  function isOnline(){return navigator.onLine!==false}
  function toastSafe(msg){
    try{
      if(typeof window.toast==='function')window.toast(msg);
      else console.info('[THU PWA]',msg);
    }catch(_){}
  }
  function refreshSettings(){
    try{
      const modal=document.getElementById('settingsModal');
      if(modal?.classList.contains('show')&&typeof window.renderSettings==='function')window.renderSettings();
    }catch(_){}
  }
  function status(){
    if(isStandalone())return {kind:'installed',label:'已安裝',detail:'目前正以獨立應用程式模式執行'};
    if(deferredPrompt)return {kind:'ready',label:'可以安裝',detail:'可直接安裝到手機桌面或電腦應用程式'};
    if(isIOS())return {kind:'ios',label:'可加入主畫面',detail:'Safari：分享 → 加入主畫面'};
    return {kind:'browser',label:'瀏覽器模式',detail:'Chrome／Edge 可由瀏覽器選單安裝應用程式'};
  }
  function settingsPanelHTML(){
    const s=status();
    const installText=s.kind==='installed'?'已安裝':s.kind==='ios'?'加入主畫面說明':'安裝到桌面';
    return `<div class="settings-section pwa-settings-section">
      <div class="settings-section-head"><div><h3>桌面應用程式與自動更新</h3><p>程式更新會自動檢查並套用；你的目標、紀錄與本機資料不會因更新而清除。</p></div></div>
      <div class="pwa-settings-status ${s.kind}">
        <div><b>${s.label}</b><small>${s.detail}</small></div>
        <span>${isOnline()?'● 線上':'○ 離線'}</span>
      </div>
      <div class="settings-action-grid">
        <button class="btn primary" type="button" onclick="pwaInstall()" ${s.kind==='installed'?'disabled':''}>⌂ ${installText}</button>
        <button id="pwaUpdateCheckBtn" class="btn" type="button" onclick="pwaCheckForUpdate()">↻ 立即檢查更新</button>
      </div>
      <div id="pwaUpdateStatus" class="pwa-update-status idle" aria-live="polite"><span>●</span><b>系統會自動檢查更新</b></div>
      <div class="pwa-settings-note">頁面版本 V${String(CURRENT_VERSION).replace(/^V/,'')}｜啟動、回到前景、網路恢復及每 5 分鐘自動檢查；若 Service Worker 與頁面版本不同，系統會強制完成頁面切換。</div>
    </div>`;
  }
  function setUpdateUI(state,message){
    const box=document.getElementById('pwaUpdateStatus');
    const btn=document.getElementById('pwaUpdateCheckBtn');
    if(box){
      const icon=state==='checking'?'◌':state==='ok'?'✓':state==='update'?'↑':'!';
      box.className='pwa-update-status '+state;
      box.innerHTML=`<span>${icon}</span><b>${message}</b>`;
    }
    if(btn){
      btn.disabled=state==='checking';
      btn.textContent=state==='checking'?'◌ 檢查中…':'↻ 立即檢查更新';
    }
  }
  function ensureUpdateBar(){
    let bar=document.getElementById('pwaUpdateBar');
    if(bar)return bar;
    bar=document.createElement('div');
    bar.id='pwaUpdateBar';
    bar.className='pwa-update-bar';
    bar.setAttribute('role','status');
    bar.setAttribute('aria-live','polite');
    bar.innerHTML='<div><b>正在套用新的程式版本</b><span>本機目標與紀錄會保留。</span></div>';
    document.body.appendChild(bar);
    return bar;
  }
 /* PWA update settlement watchdog */
  let updateWatchdog=null;
  function clearUpdateWatchdog(){
    if(updateWatchdog){clearTimeout(updateWatchdog);updateWatchdog=null}
  }
  async function settleUpdateState(){
    try{
      registration=registration||await navigator.serviceWorker.getRegistration('./')||null;
      const [remote,current]=await Promise.all([remoteMeta(),currentWorkerMeta()]);
      const sameVersion=!!(remote&&current&&remote.version===current.version);
      const sameSignature=!remote?.signature||!current?.signature||remote.signature===current.signature;
      if(sameVersion&&sameSignature){
        hideUpdate();
        if(remote.version!==CURRENT_VERSION){
          setUpdateUI('update',`V${remote.version} 已接管，正在重新載入…`);
          setTimeout(()=>location.reload(),80);
        }else{
          const time=new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'});
          setUpdateUI('ok',`目前已是最新版本 V${remote.version} · ${time}`);
        }
        return;
      }
      if(registration?.waiting){
        registration.waiting.postMessage({type:'SKIP_WAITING'});
        armUpdateWatchdog();
        return;
      }
      if(registration?.installing){
        armUpdateWatchdog();
        return;
      }
      hideUpdate();
      setUpdateUI('error','更新尚未完成，請按「立即檢查更新」重試');
    }catch(e){
      console.warn('THU update settlement check failed',e);
      hideUpdate();
      setUpdateUI('error',isOnline()?'更新確認逾時，請按「立即檢查更新」重試':'目前離線，恢復連線後再更新');
    }
  }
  function armUpdateWatchdog(){
    clearUpdateWatchdog();
    updateWatchdog=setTimeout(()=>{updateWatchdog=null;settleUpdateState()},12000);
  }
  function showUpdate(){
    ensureUpdateBar().classList.add('show');
    armUpdateWatchdog();
  }
  function hideUpdate(){
    clearUpdateWatchdog();
    document.getElementById('pwaUpdateBar')?.classList.remove('show');
  }

  async function remoteMeta(){
    const url=new URL('./sw.js',location.href);
    url.searchParams.set('update_probe',Date.now());
    const res=await fetch(url.href,{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const source=await res.text();
    const vm=source.match(/const\s+PWA_VERSION\s*=\s*['"]([^'"]+)['"]/);
    const sm=source.match(/const\s+PWA_SIGNATURE\s*=\s*['"]([^'"]+)['"]/);
    if(!vm)throw new Error('找不到遠端版本號');
    return {version:vm[1],signature:sm?.[1]||''};
  }
  async function currentWorkerMeta(){
    try{
      const sw=navigator.serviceWorker.controller;
      if(!sw)return null;
      const channel=new MessageChannel();
      return await new Promise(resolve=>{
        const timer=setTimeout(()=>resolve(null),900);
        channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data||null)};
        sw.postMessage({type:'GET_VERSION'},[channel.port2]);
      });
    }catch(_){return null}
  }
  function observeRegistration(reg){
    registration=reg;
    reg.addEventListener('updatefound',()=>{
      const worker=reg.installing;
      if(!worker)return;
      worker.addEventListener('statechange',()=>{
        if(worker.state==='installed'&&navigator.serviceWorker.controller){
          setUpdateUI('update','新版本已下載，正在自動套用…');
          showUpdate();
          worker.postMessage({type:'SKIP_WAITING'});
        }
      });
    });
    if(reg.waiting&&navigator.serviceWorker.controller){
      setUpdateUI('update','新版本已下載，正在自動套用…');
      showUpdate();
      reg.waiting.postMessage({type:'SKIP_WAITING'});
    }
  }
  async function register(){
    if(!('serviceWorker' in navigator))return null;
    try{
      const reg=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
      observeRegistration(reg);
      setTimeout(()=>checkForUpdate({silent:true,force:true}),1800);
      startPeriodicChecks();
      return reg;
    }catch(e){
      console.warn('THU service worker registration failed',e);
      return null;
    }
  }
  async function install(){
    if(isStandalone()){toastSafe('目前已經是桌面應用程式');return true}
    if(deferredPrompt){
      const prompt=deferredPrompt;deferredPrompt=null;
      try{
        await prompt.prompt();
        const choice=await prompt.userChoice;
        refreshSettings();
        if(choice?.outcome==='accepted'){toastSafe('正在安裝到桌面');return true}
        toastSafe('已取消安裝');return false;
      }catch(e){console.warn(e);toastSafe('目前無法叫出安裝視窗');return false}
    }
    if(isIOS()){
      alert('iPhone／iPad 安裝方式：\n\n1. 使用 Safari 開啟本網站\n2. 點「分享」\n3. 選「加入主畫面」\n4. 點「加入」');
      return false;
    }
    toastSafe('請使用 Chrome／Edge 選單中的「安裝應用程式」或「新增至主畫面」');
    return false;
  }
/* page-worker version coherence */
  async function checkForUpdate(options={}){
    const silent=options.silent===true,force=options.force===true;
    if(!('serviceWorker' in navigator))return false;
    if(!isOnline())return false;
    if(!force&&Date.now()-lastUpdateCheck<CHECK_MIN_GAP)return true;
    lastUpdateCheck=Date.now();
    if(!silent)setUpdateUI('checking','正在檢查新版本…');
    try{
      registration=registration||await navigator.serviceWorker.getRegistration('./')||await register();
      if(!registration)throw new Error('找不到 Service Worker registration');

      const [remote,current]=await Promise.all([remoteMeta(),currentWorkerMeta()]);
      const currentVersion=current?.version||CURRENT_VERSION;
      const currentSignature=current?.signature||'';
      const pageVersion=String(CURRENT_VERSION||'').replace(/^V/,'');
      const remoteVersion=String(remote.version||'').replace(/^V/,'');
      const workerVersion=String(currentVersion||'').replace(/^V/,'');
      const changed=remoteVersion!==workerVersion ||
        remoteVersion!==pageVersion ||
        (remote.signature&&currentSignature&&remote.signature!==currentSignature);

      if(!changed){
        hideUpdate();
        if(!silent){
          const time=new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'});
          setUpdateUI('ok',`目前已是最新版本 V${remote.version} · ${time}`);
        }
        return true;
      }

      // If the worker is already current but this page is stale, reloading is the
      // only correct settlement action. Do not falsely report "latest".
      if(remoteVersion===workerVersion && remoteVersion!==pageVersion){
        setUpdateUI('update',`程式頁面仍是 V${pageVersion}，正在切換至 V${remoteVersion}…`);
        showUpdate();
        setTimeout(()=>location.reload(),120);
        return true;
      }

      setUpdateUI('update',`發現 V${remote.version}，正在自動下載與套用…`);
      showUpdate();
      await registration.update();

      if(registration.waiting){
        registration.waiting.postMessage({type:'SKIP_WAITING'});
        return true;
      }
      if(registration.installing)return true;

      setTimeout(()=>registration?.update().catch(()=>{}),800);
      return true;
    }catch(e){
      console.warn('THU auto update check failed',e);
      hideUpdate();
      if(!silent)setUpdateUI('error',isOnline()?'檢查更新失敗，稍後會自動重試':'目前離線，恢復連線後會自動檢查');
      return false;
    }
  }
  function startPeriodicChecks(){
    if(periodicTimer)return;
    periodicTimer=setInterval(()=>checkForUpdate({silent:true}),CHECK_INTERVAL);
  }
  function applyUpdate(){
    if(registration?.waiting){
      showUpdate();
      registration.waiting.postMessage({type:'SKIP_WAITING'});
      return true;
    }
    return checkForUpdate({force:true});
  }

  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();deferredPrompt=e;refreshSettings();
  });
  window.addEventListener('appinstalled',()=>{
    deferredPrompt=null;refreshSettings();toastSafe('已安裝到桌面');
  });
  window.addEventListener('online',()=>{
    refreshSettings();
    setTimeout(()=>checkForUpdate({silent:true,force:true}),500);
  });
  window.addEventListener('offline',()=>refreshSettings());

  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('controllerchange',async()=>{
      if(reloading)return;
      let next=null;
      try{next=await currentWorkerMeta()}catch(_){}
      const token=(next?.version||'unknown')+':'+(next?.signature||'');
      const key='thuPwaReload:'+token;
      try{
        if(sessionStorage.getItem(key)==='1'){
          hideUpdate();
          const v=next?.version||CURRENT_VERSION;
          setUpdateUI('ok',`目前已由 V${v} 接管`);
          return;
        }
        sessionStorage.setItem(key,'1');
      }catch(_){}
      reloading=true;
      hideUpdate();
      setTimeout(()=>location.reload(),80);
    });
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){
      settleUpdateState();
      checkForUpdate({silent:true});
    }
  });

  return {register,install,checkForUpdate,applyUpdate,isStandalone,status,settingsPanelHTML};
})();

function pwaSettingsPanelHTML(){return window.PWA.settingsPanelHTML()}
function pwaInstall(){return window.PWA.install()}
function pwaCheckForUpdate(){return window.PWA.checkForUpdate({force:true})}
function pwaApplyUpdate(){return window.PWA.applyUpdate()}

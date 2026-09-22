(() => {
  'use strict';
  if(!('serviceWorker' in navigator))return;
  const CHECK_MS=30*60*1000,seen=new WeakSet();let reg=null,checking=null,lastCheck=0,pendingReload=false,reloading=false;
  const initiallyControlled=!!navigator.serviceWorker.controller;
  function safe(){return !document.querySelector('dialog[open]')&&!localStorage.getItem('toeicFullMockActive')}
  function status(text){const el=document.querySelector('#pwaRuntimeStatus');if(el)el.textContent=text}
  function banner(text){let b=document.querySelector('#pwaRuntimeBanner');if(!b){b=document.createElement('div');b.id='pwaRuntimeBanner';b.className='pwa-runtime-banner';b.setAttribute('role','status');document.body.append(b)}b.textContent=text;b.classList.add('show')}
  function meta(){return new Promise(resolve=>{if(!navigator.serviceWorker.controller)return resolve(null);const c=new MessageChannel(),t=setTimeout(()=>{c.port1.close();resolve(null)},1200);c.port1.onmessage=e=>{clearTimeout(t);c.port1.close();resolve(e.data)};navigator.serviceWorker.controller.postMessage({type:'GET_VERSION'},[c.port2])})}
  async function applyPending(){
    if(!safe()){if(reg?.waiting||pendingReload){status('新版已下載；完成目前訓練／模考後套用。');banner('新版已排隊，不會中斷目前作答。')}return}
    if(pendingReload&&!reloading){reloading=true;const m=await meta(),key=`toeicReloaded:${m?.version||'unknown'}`;if(sessionStorage.getItem(key)){status('新版已接管；請手動重新開啟一次。');reloading=false;return}sessionStorage.setItem(key,'1');location.reload();return}
    if(reg?.waiting){status('正在套用新版…');reg.waiting.postMessage({type:'SKIP_WAITING'})}
  }
  function observe(r){if(seen.has(r))return;seen.add(r);r.addEventListener('updatefound',()=>{const w=r.installing;if(!w)return;status('正在下載新版…');w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)void applyPending();if(w.state==='redundant')status('新版下載失敗；保留舊版，稍後重試。')})})}
  async function check(force=false){
    if(checking)return checking;if(navigator.onLine===false){status('離線使用中；恢復連線後再檢查更新。');return false}
    if(!force&&Date.now()-lastCheck<60000){void applyPending();return true}lastCheck=Date.now();
    checking=(async()=>{try{reg??=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});observe(reg);await reg.update();if(reg.waiting){await applyPending()}else{const m=await meta();status(`自動更新已啟用${m?.version?` · v${m.version}`:''}`)}return true}catch(e){console.warn('PWA update',e);status('暫時無法檢查更新；現有程式與學習資料保留。');return false}finally{checking=null}})();return checking;
  }
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(initiallyControlled){pendingReload=true;void applyPending()}});
  document.querySelector('#lessonDialog')?.addEventListener('close',()=>setTimeout(applyPending,200));
  window.addEventListener('toeic-safe-update',applyPending);window.addEventListener('online',()=>void check(true));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){void applyPending();void check(false)}});
  window.AppPWA=Object.freeze({check});void check(true);setInterval(()=>void check(false),CHECK_MS);
})();

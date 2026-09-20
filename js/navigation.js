/* V96.5 Navigation layer: isolated bottom-nav routing + adaptive mobile gesture. */
(function(){
  'use strict';
  function setup(){
    const nav=document.querySelector('.bottom-nav');
    if(!nav)return;
    const isMobile=()=>window.matchMedia('(max-width:700px)').matches;
    const currentY=()=>Math.max(0,window.scrollY||document.documentElement.scrollTop||document.body.scrollTop||0);
    const overlaysOpen=()=>!!document.querySelector('.settings-modal.show,.modal.show,.edit-modal.show,.developer-modal[style*="display: flex"]');
    let lastY=currentY(), gestureY=null, ticking=false;

    const show=()=>{document.body.classList.remove('nav-hidden');};
    const hide=()=>{if(isMobile()&&!overlaysOpen())document.body.classList.add('nav-hidden');};
    const sync=()=>{
      ticking=false;
      const y=currentY();
      if(!isMobile()){show();lastY=y;return;}
      const delta=y-lastY;
      if(y<=12)show();
      else if(delta>4)hide();
      else if(delta<-4)show();
      lastY=y;
    };
    const scheduleSync=()=>{if(!ticking){ticking=true;requestAnimationFrame(sync);}};

    // Event delegation keeps routing independent from generated module markup.
    nav.addEventListener('click',e=>{
      const button=e.target.closest?.('button[data-view]');
      if(!button||!nav.contains(button))return;
      const view=button.dataset.view;
      if(typeof window.go==='function')window.go(view);
      show();
    },{passive:false});

    const start=e=>{
      if(!isMobile()||overlaysOpen())return;
      const p=e.touches?.[0]||e;
      gestureY=Number.isFinite(p?.clientY)?p.clientY:null;
    };
    const move=e=>{
      if(!isMobile()||overlaysOpen()||gestureY===null)return;
      const p=e.touches?.[0]||e;
      if(!Number.isFinite(p?.clientY))return;
      const dy=p.clientY-gestureY;
      if(Math.abs(dy)>=8){
        dy<0?hide():show();
        gestureY=p.clientY;
      }
    };
    const end=()=>{gestureY=null;};

    window.addEventListener('scroll',scheduleSync,{passive:true});
    document.addEventListener('pointerdown',start,{passive:true,capture:true});
    document.addEventListener('pointermove',move,{passive:true,capture:true});
    document.addEventListener('pointerup',end,{passive:true,capture:true});
    document.addEventListener('pointercancel',end,{passive:true,capture:true});
    document.addEventListener('touchstart',start,{passive:true,capture:true});
    document.addEventListener('touchmove',move,{passive:true,capture:true});
    document.addEventListener('touchend',end,{passive:true,capture:true});
    nav.addEventListener('pointerdown',show,{passive:true});
    nav.addEventListener('touchstart',show,{passive:true});
    window.addEventListener('resize',scheduleSync,{passive:true});
    window.addEventListener('orientationchange',()=>setTimeout(scheduleSync,120),{passive:true});
    sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();

/* modal/nav ownership guard */
(function(){
  'use strict';
  const OVERLAY_SELECTOR='.settings-modal.show,.modal.show,.edit-modal.show,.developer-modal[style*="display: flex"]';

  function syncOverlayNav(){
    const open=!!document.querySelector(OVERLAY_SELECTOR);
    document.body.classList.toggle('nav-overlay-open',open);
    if(open) document.body.classList.add('nav-hidden');
  }

  function setupOverlayNavGuard(){
    const nodes=document.querySelectorAll('.settings-modal,.modal,.edit-modal,.developer-modal');
    const observer=new MutationObserver(syncOverlayNav);
    nodes.forEach(node=>observer.observe(node,{
      attributes:true,
      attributeFilter:['class','style','aria-hidden']
    }));

    document.addEventListener('click',()=>requestAnimationFrame(syncOverlayNav),true);
    document.addEventListener('keydown',()=>requestAnimationFrame(syncOverlayNav),true);
    window.addEventListener('pageshow',syncOverlayNav,{passive:true});
    syncOverlayNav();
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',setupOverlayNavGuard,{once:true});
  }else{
    setupOverlayNavGuard();
  }
})();

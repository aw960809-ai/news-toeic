(() => {
  'use strict';
  const SELECTOR='button,.btn,.primary,.secondary,.ghost,[role="button"]';
  const clear=(el)=>{
    if(!el)return;
    el.classList.remove('is-pressed');
    if(el.__pressTimer){clearTimeout(el.__pressTimer);el.__pressTimer=null}
  };
  document.addEventListener('pointerdown',event=>{
    const el=event.target.closest?.(SELECTOR);
    if(!el||el.disabled||el.getAttribute('aria-disabled')==='true')return;
    clear(el);
    el.classList.add('is-pressed');
    el.__pressTimer=setTimeout(()=>clear(el),900);
  },true);
  ['pointerup','pointercancel','pointerleave'].forEach(type=>{
    document.addEventListener(type,event=>clear(event.target.closest?.(SELECTOR)),true);
  });
  document.addEventListener('click',event=>{
    const el=event.target.closest?.(SELECTOR);
    if(!el||el.disabled||el.getAttribute('aria-disabled')==='true')return;
    clear(el);
    el.classList.remove('tap-flash');
    void el.offsetWidth;
    el.classList.add('tap-flash');
    setTimeout(()=>el.classList.remove('tap-flash'),180);
  },true);
})();

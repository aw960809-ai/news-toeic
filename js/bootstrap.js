/* V96 browser bootstrap: relative paths for GitHub Pages project sites + PWA registration. */
(function(){
  function goalManagerBootstrap(){
    if(window.PWA&&typeof window.PWA.register==='function'){ window.PWA.register(); } else if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').catch(()=>{}); }
    window.AppCore=window.AppCore||{storage:{get:window.storeGet,set:window.storeSet,save:window.save,exportDB:window.exportDB,importDB:window.importDB},catalog:{activities:window.activityStore,scholarships:window.scholarshipStore,byId:window.catalogItemById},validation:{validateData:window.validateData,validateDB:window.validateDB,makeEnvelope:window.makeEnvelope,parseEnvelope:window.parseEnvelope,fnv1a:window.fnv1a,sha256Hex:window.sha256Hex,makeSecureBackupEnvelope:window.makeSecureBackupEnvelope,validateSecureBackupEnvelope:window.validateSecureBackupEnvelope},cache:{clear:window.clearApplicationCaches,clearOnly:window.clearCacheOnly},diagnostics:{run:window.runSelfTest,auditButtonHandlers:window.auditButtonHandlers,auditCoreModules:window.auditCoreModules,auditDataRoundTrip:window.auditDataRoundTrip,auditDOM:window.auditDOM}};
    window.AppModules=window.AppModules||{dashboard:{render:window.renderAll},goals:{render:window.renderTree},execution:{render:window.renderAll},activities:{render:window.renderActivities},scholarships:{render:window.renderScholarships},calendar:{render:window.renderCalendar},analytics:{render:window.renderAll}};
    if(typeof loadRemoteActivities==='function') setTimeout(loadRemoteActivities,120);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',goalManagerBootstrap,{once:true});
  else goalManagerBootstrap();
})();

/* V96.4.4 Settings / control layer — no PIN lock. */
const SETTINGS_KEY='lawLangGoalSystem_settings_v1';
const DEFAULT_SETTINGS=Object.freeze({
  appearance:'system',
  density:'comfortable',
  reducedMotion:false,
  dateFormat:'yyyy/mm/dd',
  timeFormat:'24',
  activityReminder:true,
  scholarshipReminder:true,
  reminderDays:3
});
let appSettings=loadAppSettings();
function loadAppSettings(){
  try{const raw=localStorage.getItem(SETTINGS_KEY);const parsed=raw?JSON.parse(raw):{};return {...DEFAULT_SETTINGS,...(parsed&&typeof parsed==='object'?parsed:{})}}catch(e){return {...DEFAULT_SETTINGS}}
}
function saveAppSettings(){
  try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(appSettings));return true}catch(e){return false}
}
function applyAppSettings(){
  const root=document.documentElement;
  root.dataset.appearance=appSettings.appearance;
  root.dataset.density=appSettings.density;
  root.dataset.reducedMotion=appSettings.reducedMotion?'true':'false';
  root.dataset.timeFormat=appSettings.timeFormat;
  if(appSettings.appearance==='dark')root.classList.add('app-dark');else root.classList.remove('app-dark');
  saveAppSettings();
}
function resetAppSettings(){appSettings={...DEFAULT_SETTINGS};applyAppSettings();renderSettings();toast('已恢復預設設定')}
function setAppSetting(key,value){
  if(!(key in DEFAULT_SETTINGS))return;
  if(key==='reducedMotion'||key==='activityReminder'||key==='scholarshipReminder')value=!!value;
  if(key==='reminderDays')value=Math.max(1,Math.min(30,Number(value)||3));
  appSettings[key]=value;applyAppSettings();renderSettings();toast('設定已保存');
}
function openSettings(){
  const modal=document.getElementById('settingsModal');if(!modal)return false;
  renderSettings();
  modal.classList.add('show');
  modal.style.display='flex';
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  return true;
}
function closeSettings(){
  const modal=document.getElementById('settingsModal');
  if(modal){modal.classList.remove('show');modal.style.display='none';modal.setAttribute('aria-hidden','true');}
  document.body.style.overflow='';
}
function settingsSelect(key,options){return `<select onchange="setAppSetting('${key}',this.value)">${options.map(([v,t])=>`<option value="${v}" ${String(appSettings[key])===String(v)?'selected':''}>${t}</option>`).join('')}</select>`}
function settingsSwitch(key,label){return `<label class="settings-switch"><span>${label}</span><input type="checkbox" ${appSettings[key]?'checked':''} onchange="setAppSetting('${key}',this.checked)"><i></i></label>`}
function renderSettings(){
 const b=document.getElementById('settingsBody');if(!b)return;
 const notif=('Notification' in window)?(Notification.permission||'default'):'unsupported';
 b.innerHTML=`
  <div class="settings-section">
   <div class="settings-section-head"><div><h3>外觀與操作</h3><p>只影響本機顯示，不改變目標、活動或獎學金資料。</p></div></div>
   <div class="settings-row"><div><b>外觀</b><small>跟隨裝置、淺色或深色</small></div>${settingsSelect('appearance',[['system','跟隨系統'],['light','淺色'],['dark','深色']])}</div>
   <div class="settings-row"><div><b>資訊密度</b><small>控制卡片與區塊的垂直間距</small></div>${settingsSelect('density',[['comfortable','舒適'],['standard','標準'],['compact','精簡']])}</div>
   <div class="settings-row"><div><b>減少動畫</b><small>降低轉場與動態效果</small></div>${settingsSwitch('reducedMotion','啟用')}</div>
   <div class="settings-row"><div><b>日期格式</b><small>系統資料仍使用標準 ISO 日期保存</small></div>${settingsSelect('dateFormat',[['yyyy/mm/dd','2026/09/06'],['yyyy-mm-dd','2026-09-06']])}</div>
   <div class="settings-row"><div><b>時間格式</b><small>影響未來可支援的時間顯示</small></div>${settingsSelect('timeFormat',[['24','24 小時'],['12','12 小時']])}</div>
  </div>
  <div class="settings-section">
   <div class="settings-section-head"><div><h3>提醒與通知</h3><p>提醒偏好先保存在本機；瀏覽器背景通知是否能執行，仍取決於裝置與瀏覽器。</p></div></div>
   ${settingsSwitch('activityReminder','活動截止提醒')}
   ${settingsSwitch('scholarshipReminder','獎學金截止提醒')}
   <div class="settings-row"><div><b>提前天數</b><small>活動／獎學金提醒偏好</small></div>${settingsSelect('reminderDays',[['1','1 天前'],['3','3 天前'],['7','7 天前'],['14','14 天前']])}</div>
   <div class="settings-permission"><span>瀏覽器通知權限：<b>${notif==='granted'?'已允許':notif==='denied'?'已拒絕':notif==='unsupported'?'不支援':'尚未設定'}</b></span><button class="btn" type="button" onclick="requestNotificationPermission()">${notif==='granted'?'重新確認':'允許通知'}</button></div>
  </div>
  ${typeof pwaSettingsPanelHTML==='function'?pwaSettingsPanelHTML():''}
  <div class="settings-section">
   <div class="settings-section-head"><div><h3>資料管理</h3><p>你的使用者資料以本機保存為主。匯入會先驗證格式與完整性。</p></div></div>
   <div class="settings-action-grid">
    <button class="btn primary" onclick="exportDB();toast('備份檔已準備下載')">↥ 匯出全部資料</button>
    <button class="btn" onclick="importDB();closeSettings()">↧ 匯入資料</button>
    <button class="btn" onclick="createRestorePoint()">✦ 建立復原點</button>
    <button class="btn" onclick="restoreLatestBackup()">↶ 還原最近備份</button>
   </div>
   <div class="settings-data-status" id="settingsDataStatus">正在檢查資料狀態…</div>
   <div class="settings-danger"><div><b>危險區域</b><small>清除前會要求確認；建議先匯出備份。</small></div><button class="dangerbtn" onclick="resetUserData()">清除本機使用者資料</button></div>
  </div>
  <div class="settings-section">
   <div class="settings-section-head"><div><h3>系統診斷</h3><p>檢查資料結構、儲存空間、版本與快取狀態。</p></div><button class="btn gold" onclick="runDiagnostics()">執行完整檢查</button></div>
   <div id="diagnosticResult" class="diagnostic-result"><div class="diagnostic-empty">尚未執行完整檢查。</div></div>
   <div class="settings-repair"><b>進階修復</b><div class="settings-action-grid"><button class="btn" onclick="clearCacheOnly();closeSettings()">↻ 清除快取</button><button class="btn" onclick="rebuildLocalIndexes()">⟳ 重建資料索引</button></div></div>
  </div>
  <div class="settings-section">
   <div class="settings-section-head"><div><h3>隱私與安全</h3><p>這是純前端 GitHub Pages 應用程式，不能把前端 JS 視為秘密。</p></div></div>
   <div class="security-facts"><div><b>資料位置</b><span>本機瀏覽器</span></div><div><b>遠端上傳</b><span>目前沒有內建使用者資料伺服器</span></div><div><b>輸入保護</b><span>URL 白名單、資料驗證、Checksum、SHA-256 備份</span></div><div><b>程式可見性</b><span>前端程式可被瀏覽器讀取</span></div></div>
  </div>
  <div class="settings-section about-section">
   <div class="settings-section-head"><div><h3>關於系統</h3><p>個人目標與學習行動管理系統</p></div></div>
   <div class="about-version"><b id="settingsVersion">${window.AppConfig?.version||'V97.3.0'}</b><span>七模組工作層＋系統控制層</span></div>
   ${window.__DEV_PREVIEW__===true?'<button class="text-button developer-entry" type="button" onclick="registerDeveloperTap()">檢視進階系統資訊</button><div class="developer-hint">預覽／開發環境限定：連續點擊版本 7 次可開啟進階測試工具</div>':''}
  </div>`;
 updateSettingsDataStatus();
}
async function updateSettingsDataStatus(){
 const el=document.getElementById('settingsDataStatus');if(!el)return;
 let storage='不可用';try{storage=localStorage?'可用':'不可用'}catch(e){}
 const size=(()=>{try{return Math.round(new Blob([storeGet(KEY)||'']).size/1024)}catch(e){return 0}})();
 const backups=BACKUP_KEYS.filter(k=>!!storeGet(k)).length;
 const errs=typeof validateDB==='function'?validateDB():[];
 el.innerHTML=`<div><b>資料結構</b><span>${errs.length?'⚠ '+errs.length+' 項問題':'✓ 正常'}</span></div><div><b>本機儲存</b><span>${storage}</span></div><div><b>目前資料大小</b><span>${size} KB</span></div><div><b>可用備份</b><span>${backups} 份</span></div>`;
}
function createRestorePoint(){
 try{if(save({backup:true})) {renderSettings();toast('已建立復原點；目前資料未改變')}}catch(e){toast('建立復原點失敗')}
}
function restoreLatestBackup(){
 const raws=BACKUP_KEYS.map(k=>({key:k,raw:storeGet(k)})).filter(x=>x.raw);
 if(!raws.length){toast('目前沒有可還原的備份');return}
 const latest=raws[0];
 if(!confirm('確定要還原最近一份備份？\n目前資料會先保留在另一個備份槽。'))return;
 try{
  const d=tryReadCandidate(latest.raw,latest.key);if(!d)throw new Error('備份資料無效');
  const previous=db;db=d;if(!save({backup:true})){db=previous;throw new Error('保存失敗')}
  selected=null;goalPath={long:null,mid:null,short:null,exec:null};renderAll();renderSettings();toast('已還原最近備份');
 }catch(e){toast('還原失敗；目前資料未變更')}
}
function resetUserData(){
 if(!confirm('⚠️ 確定清除本機使用者資料？\n\n系統會先建立一次備份，再恢復為初始資料。'))return;
 try{
  const current=storeGet(KEY);if(current)storeSet(BACKUP_KEYS[0],current);
  db=normalize(seed());ensureSchoolCalendar();ensureToeicPlan();save({backup:false});
  selected=null;goalPath={long:null,mid:null,short:null,exec:null};renderAll();closeSettings();toast('已恢復初始資料；舊資料已保留備份');
 }catch(e){toast('重置失敗；目前資料可能未完整更新')}
}
async function requestNotificationPermission(){
 if(!('Notification' in window)){toast('此瀏覽器不支援通知');return}
 try{const result=await Notification.requestPermission();renderSettings();toast(result==='granted'?'通知權限已允許':result==='denied'?'通知權限已拒絕':'尚未允許通知')}catch(e){toast('無法取得通知權限')}
}
function rebuildLocalIndexes(){
 try{db=normalize(db);rebuildExecutionPlanActuals();ensureActivities();ensureSchoolCalendar();recalcAllStatuses();save({backup:true});renderAll();renderSettings();toast('資料索引已重建並重新驗證')}catch(e){toast('重建索引失敗；目前資料未變更')}
}
async function runDiagnostics(){
 const box=document.getElementById('diagnosticResult');if(!box)return;
 box.innerHTML='<div class="diagnostic-running">正在檢查系統…</div>';
 const checks=[];
 try{checks.push(['核心資料結構',validateDB().length===0,validateDB().slice(0,2).join('；')])}catch(e){checks.push(['核心資料結構',false,e.message])}
 try{const normalized=normalize(db);const env=makeEnvelope(normalized);const p=parseEnvelope(JSON.stringify(env));checks.push(['Checksum／序列化',dataPayload(p.data)===dataPayload(normalized),''])
 try{const env2=await makeSecureBackupEnvelope(normalized);const secureOk=!env2.integrity||((await sha256Hex(dataPayload(env2.data)))===env2.integrity.digest);checks.push(['SHA-256 備份完整性',secureOk,env2.integrity?'Web Crypto 已啟用':'瀏覽器未提供 Web Crypto'])}catch(e){checks.push(['SHA-256 備份完整性',false,e.message])}}catch(e){checks.push(['Checksum／序列化',false,e.message])}
 try{checks.push(['七模組 DOM',auditDOM().ok,''])}catch(e){checks.push(['七模組 DOM',false,e.message])}
 try{checks.push(['安全邊界',securityDiagnostics().ok&&safeExternalUrl('javascript:alert(1)')==='',''])}catch(e){checks.push(['安全邊界',false,e.message])}
 try{checks.push(['活動資料',Array.isArray(db.activities)&&db.activities.length>0,''])}catch(e){checks.push(['活動資料',false,e.message])}
 try{checks.push(['獎學金資料',Array.isArray(db.scholarships)&&db.scholarships.length>0,''])}catch(e){checks.push(['獎學金資料',false,e.message])}
 try{const ok=typeof indexedDB!=='undefined';checks.push(['IndexedDB 鏡像',ok,'瀏覽器支援狀態'])}catch(e){checks.push(['IndexedDB 鏡像',false,e.message])}
 try{let cacheCount=0;if('caches' in window)cacheCount=(await caches.keys()).length;checks.push(['Cache／Service Worker',('serviceWorker' in navigator),'快取 '+cacheCount+' 組'])}catch(e){checks.push(['Cache／Service Worker',false,e.message])}
 try{const estimate=navigator.storage?.estimate?await navigator.storage.estimate():null;const used=estimate?.usage?Math.round(estimate.usage/1024):null;checks.push(['瀏覽器儲存空間',true,used===null?'可用':'約 '+used+' KB 已使用'])}catch(e){checks.push(['瀏覽器儲存空間',true,'瀏覽器未提供估算'])}
 box.innerHTML=checks.map(c=>`<div class="diagnostic-row"><span>${c[1]?'✓':'✗'} ${esc(c[0])}</span><b class="${c[1]?'ok':'bad'}">${c[1]?'正常':esc(c[2]||'失敗')}</b></div>`).join('')+`<div class="diagnostic-summary ${checks.every(c=>c[1])?'ok':'warn'}">${checks.every(c=>c[1])?'系統完整性檢查通過':'發現需要注意的項目，請查看上方結果。'}</div>`;
}

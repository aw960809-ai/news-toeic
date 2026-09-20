/* V96.3 Security layer: input, URL, import and catalog boundary checks. */
const SECURITY_LIMITS=Object.freeze({maxImportBytes:2*1024*1024,maxString:2000,maxCollection:5000});
function safeExternalUrl(raw){
  const value=String(raw??'').trim();
  if(!value||value.length>2048)return '';
  try{
    const u=new URL(value,location.href);
    if(u.protocol!=='https:'&&u.protocol!=='http:')return '';
    return u.href;
  }catch(e){return ''}
}
function safeId(raw){return /^[A-Za-z0-9._:-]{1,120}$/.test(String(raw??''))?String(raw):''}
function validateCollectionSize(value,label,limit=SECURITY_LIMITS.maxCollection){return Array.isArray(value)?(value.length<=limit?'':`${label}數量超過安全上限`):''}
function validateImportEnvelope(raw){
  if(typeof raw!=='string'||!raw.trim())throw new Error('備份檔案為空');
  if(raw.length>SECURITY_LIMITS.maxImportBytes)throw new Error('備份檔案超過 2 MB 安全上限');
  const parsed=parseEnvelope(raw);
  if(!parsed||!parsed.data||typeof parsed.data!=='object')throw new Error('備份資料格式無效');
  const checks=[validateCollectionSize(parsed.data.tasks,'目標'),validateCollectionSize(parsed.data.logs,'歷程'),validateCollectionSize(parsed.data.executionPlans,'執行安排'),validateCollectionSize(parsed.data.calendarEvents,'行事曆')].filter(Boolean);
  if(checks.length)throw new Error(checks.join('；'));
  return parsed;
}
function validateCatalogBoundary(items,label){
  if(!Array.isArray(items))return [];
  return items.filter(x=>x&&typeof x==='object'&&safeId(x.id)&&String(x.title||'').length<=SECURITY_LIMITS.maxString).map(x=>({...x,id:safeId(x.id),title:String(x.title||'').trim(),url:safeExternalUrl(x.url||x.externalUrl||x.sourceUrl||'')}));
}
function securityDiagnostics(){return {ok:true,limits:{...SECURITY_LIMITS},urlPolicy:'http/https only',importChecksum:true,sha256Backup:'Web Crypto when available'}}

/* V96.5: cryptographic integrity for exported backups.
   Local persistence keeps the synchronous legacy checksum for compatibility;
   exported backups additionally carry SHA-256 when Web Crypto is available. */
async function sha256Hex(value){
  if(!window.crypto?.subtle) return '';
  const bytes=new TextEncoder().encode(String(value));
  const digest=await window.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
async function makeSecureBackupEnvelope(d){
  const normalized=normalize(d), payload=dataPayload(normalized);
  const env=makeEnvelope(normalized);
  const sha=await sha256Hex(payload);
  if(sha)env.integrity={algorithm:'SHA-256',scope:'dataPayload',digest:sha};
  return env;
}
async function validateSecureBackupEnvelope(raw){
  const parsed=validateImportEnvelope(raw);
  const env=JSON.parse(raw);
  if(env?.integrity?.algorithm==='SHA-256'){
    const expected=await sha256Hex(dataPayload(parsed.data));
    if(!expected||expected!==String(env.integrity.digest||''))throw new Error('SHA-256 完整性檢查失敗');
  }
  return parsed;
}

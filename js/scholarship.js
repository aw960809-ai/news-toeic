/* V96 Scholarship module: independent catalog, fit and UI */
// V93.1 offline scholarship fallback: keeps scholarship data available even when a local HTML file cannot fetch ./data/events.json.
const SCHOLARSHIP_SEED = [{"id":"sch-thu-589","title":"東海大學TEFA黃秋雄玉山獎學金","date":"2026-10-22","time":"","scope":"東海校內","type":"獎學金／助學金","kind":"scholarship","url":"https://tscholarship.thu.edu.tw/wwwstud/frontend/Scholarship.php","keywords":"東海 玉山 獎學金 黃秋雄 100000","direct":true,"team":false,"available":true,"source":"東海大學｜獎助學金查詢","statusText":"東海官方獎學金；申請期限 2026-10-22","government":false,"sourcePriority":"core","scholarship":true},{"id":"sch-thu-115","title":"宗倬章先生獎學金","date":"2026-09-18","time":"","scope":"東海校內","type":"獎學金／助學金","kind":"scholarship","url":"https://tscholarship.thu.edu.tw/wwwstud/frontend/Scholarship.php","keywords":"宗倬章 獎學金 40000","direct":true,"team":false,"available":true,"source":"東海大學｜獎助學金查詢","statusText":"東海官方獎學金；申請期限 2026-09-18","government":false,"sourcePriority":"core","scholarship":true},{"id":"sch-thu-132","title":"羅慧夫顱顏基金會獎助學金","date":"2026-09-11","time":"","scope":"東海校內","type":"獎學金／助學金","kind":"scholarship","url":"https://tscholarship.thu.edu.tw/wwwstud/frontend/Scholarship.php","keywords":"羅慧夫 顱顏 基金會 獎助學金","direct":true,"team":false,"available":true,"source":"東海大學｜獎助學金查詢","statusText":"東海官方獎助學金；申請期限 2026-09-11","government":false,"sourcePriority":"core","scholarship":true},{"id":"sch-thu-133","title":"杜萬全慈善獎學金","date":"2026-09-30","time":"","scope":"東海校內","type":"獎學金／助學金","kind":"scholarship","url":"https://tscholarship.thu.edu.tw/wwwstud/frontend/Scholarship.php","keywords":"杜萬全 慈善 獎學金 10000","direct":true,"team":false,"available":true,"source":"東海大學｜獎助學金查詢","statusText":"東海官方獎學金；申請期限 2026-09-30","government":false,"sourcePriority":"core","scholarship":true},{"id":"sch-thu-158","title":"法治推廣獎學金","date":"2026-10-05","time":"","scope":"東海校內","type":"獎學金／助學金","kind":"scholarship","url":"https://tscholarship.thu.edu.tw/wwwstud/frontend/Scholarship.php","keywords":"法治 推廣 獎學金 10000 法律","direct":true,"team":false,"available":true,"source":"東海大學｜獎助學金查詢","statusText":"東海官方獎學金；申請期限 2026-10-05","government":false,"sourcePriority":"core","scholarship":true},{"id":"sch-moe-115","title":"115學年度獎學金公告資訊網申請","date":"2026-09-30","time":"","scope":"全臺","type":"獎學金／助學金","kind":"scholarship","url":"https://www.edu.tw/scholarshipinfo/Default.aspx","keywords":"教育部 獎學金 115學年度 9月 申請","direct":true,"team":false,"available":true,"source":"教育部｜獎學金公告資訊網","statusText":"教育部獎學金公告；受理至 2026-09-30","government":true,"sourcePriority":"government","scholarship":true},{"id":"sch-gov-portal","title":"大專院校學生政府獎助學金申請整理","date":"","time":"","scope":"全臺","type":"獎學金／助學金","kind":"reference","url":"https://www.gov.tw/News_Content_26_402188","keywords":"我的E政府 大專學生 獎助學金 低收入 中低收入 身心障礙 原住民 特殊境遇","direct":true,"team":false,"available":true,"source":"我的E政府","statusText":"政府獎助學金整理入口","government":true,"sourcePriority":"government","scholarship":true}];


const SCHOLARSHIP_PAGE_SIZE=8;
let scholarshipPage=1,scholarshipLastFilter='';

function scholarshipNumber(a){
 const explicit=String(a?.scholarshipNumber||'').trim();
 if(explicit)return explicit;
 const id=String(a?.id||'');
 let m=id.match(/^sch-thu-(\d+)$/);if(m)return m[1];
 m=id.match(/^auto-thu-sch-[^-]+-(\d+)$/);if(m)return m[1];
 return '';
}
function scholarshipAcademicParams(a){
 const raw=String(a?.date||a?.deadline||'').trim();
 const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 const d=m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3])):new Date();
 const y=d.getFullYear(),month=d.getMonth()+1;
 const term=(month>=8||month===1)?1:2;
 const academicYear=(month>=8)?y-1911:y-1912;
 return {year:academicYear,term};
}
function scholarshipOfficialUrl(a){
 const detail=String(a?.detailUrl||'').trim();
 if(detail)return detail;
 const raw=String(a?.url||a?.externalUrl||a?.sourceUrl||'').trim();
 const isThu=String(a?.sourceId||'')==='thu_scholarship_official'||/tscholarship\.thu\.edu\.tw/i.test(raw);
 const no=scholarshipNumber(a);
 if(isThu&&no){
  const p=scholarshipAcademicParams(a);
  return `https://tscholarship.thu.edu.tw/wwwstud/frontend/Scholarship_detail.php?schno=${encodeURIComponent(no)}&term=${p.term}&year=${p.year}`;
 }
 return raw;
}
function renderScholarshipPagination(total){
 const el=document.getElementById('scholarshipPagination');if(!el)return;
 const pages=Math.max(1,Math.ceil(total/SCHOLARSHIP_PAGE_SIZE));
 scholarshipPage=Math.min(Math.max(1,scholarshipPage),pages);
 el.innerHTML=total>SCHOLARSHIP_PAGE_SIZE
  ?`<button class="btn" type="button" onclick="scholarshipPrevPage()" ${scholarshipPage===1?'disabled':''}>‹</button><span class="activity-page-info">第 ${scholarshipPage} / ${pages} 頁</span><button class="btn" type="button" onclick="scholarshipNextPage()" ${scholarshipPage===pages?'disabled':''}>›</button>`
  :'';
}
function scholarshipScrollTop(){document.getElementById('scholarshipStats')?.scrollIntoView({behavior:'smooth',block:'start'});}
function scholarshipPrevPage(){if(scholarshipPage>1){scholarshipPage--;renderScholarships();scholarshipScrollTop()}}
function scholarshipNextPage(){scholarshipPage++;renderScholarships();scholarshipScrollTop()}

/* scholarship eligibility + specialty priority */
function scholarshipPolicyText(a){
 return [a?.title,a?.keywords,a?.description,a?.statusText,a?.category,a?.amount,a?.eligibility,a?.audience,a?.target,a?.eligibilityTarget]
  .map(x=>String(x||'')).join(' ').replace(/\s+/g,' ').trim();
}
function scholarshipSpecialtyKind(a){
 const explicit=String(a?.specialtyKind||'').toLowerCase();
 if(explicit==='professional')return '專業考照';
 if(explicit==='language')return '外語能力';
 const text=scholarshipPolicyText(a).toLowerCase();
 if(/專業證照|證照獎勵|證照補助|專門職業|專技高考|專業考照|技術士|國家考試|考照|ipas|證券|金融證照|會計證照|資訊證照/.test(text))return '專業考照';
 if(/外語能力|外語檢定|英語檢定|日語檢定|語言檢定|語言證照|toeic|toefl|ielts|gept|jlpt|delf|goethe|topik|cefr|linguaskill|bestep/.test(text))return '外語能力';
 return '一般獎學金';
}
/* detail-level scholarship eligibility enforcement */
/* Scholarship Eligibility Engine */
/* V97.6.0 Strict Scholarship Eligibility Engine */
const SCHOLARSHIP_STRICT_POLICY=Object.freeze({
  householdWhitelist:['嘉義縣'],
  studyWhitelist:['臺中','台中'],
  currentSchool:'東海大學',
  currentLevel:'大學部',
  currentMajor:'法律',
  requireVerifiedThuDetail:true,
  specialIdentityMode:'general-student-only'
});

function scholarshipStrictCorpus(a){
  const norm=x=>String(x||'').replace(/\s+/g,' ').trim();
  const title=norm(a?.title);
  const target=norm(a?.eligibilityTarget||a?.audience||a?.target);
  const restrictions=norm(a?.restrictions);
  const academic=norm(a?.academicScope||a?.eligibility);
  const documents=norm(a?.requiredDocuments||a?.documents||a?.attachments);
  const note=norm(a?.applicationNote||a?.description||a?.statusText);
  return {title,target,restrictions,academic,documents,note,text:[title,target,restrictions,academic,documents,note].join(' ')};
}

function scholarshipStrictClauses(text){
  return String(text||'').split(/[。；;\n]/).map(x=>x.trim()).filter(Boolean);
}

function scholarshipStrictPositiveClause(text,rx){
  const mandatory=/(?:僅限|限|限定|必須|須具備|需具備|申請資格|申請對象|獎助對象|補助對象|受獎對象|資格條件|專供|提供予|發給|限於|須檢附|需檢附|應檢附|證明)/;
  const optional=/(?:另|另外|額外|加發|加碼|優先|酌予加分|得另申請|可另申請|另可申請|報名費補助|考試費補助|費用補助)/;
  const negative=/(?:不得領|不得同時|不可同時|未享|未領|未曾領|不具|不含|除外|排除|非屬|非為)/;
  return scholarshipStrictClauses(text).some(c=>rx.test(c)&&mandatory.test(c)&&!optional.test(c)&&!negative.test(c));
}

function scholarshipStrictGeneralAccess(target){
  return /(?:一般學生|一般優秀學生|一般在學生|全校學生|本校學生|各系學生|各學系學生|不限科系|不限學系|不限身分|全體學生)/.test(String(target||''));
}

function scholarshipStrictRegion(c){
  const title=c.title;
  const scope=[c.target,c.restrictions,c.academic,c.documents,c.note].join(' ');
  const nationwide=/(?:全國|不限地區|不限戶籍|不限縣市|全臺|全台|各縣市)/;
  if(nationwide.test(scope))return null;

  const chiayiHousehold=/(?:嘉義縣).{0,32}(?:戶籍|設籍|原籍|籍貫)|(?:戶籍|設籍|原籍|籍貫).{0,32}(?:嘉義縣)/;
  const taichungStudy=/(?:臺中|台中).{0,40}(?:就讀|在學|大專校院|大專院校|學校學生|學生)|(?:就讀|在學|大專校院|大專院校).{0,40}(?:臺中|台中)/;
  const hasChiayi=chiayiHousehold.test(scope);
  const hasTaichungStudy=taichungStudy.test(scope);

  const taichungHousehold=/(?:臺中|台中).{0,28}(?:戶籍|設籍|原籍|籍貫)|(?:戶籍|設籍|原籍|籍貫).{0,28}(?:臺中|台中)/;
  if(taichungHousehold.test(scope)){
    const clearOr=/(?:或|任一|擇一|其中之一)/.test(scope);
    if(!(clearOr&&hasTaichungStudy))return '臺中就讀不等於臺中設籍，地域必要資格不符';
  }

  const otherPlaces=/(?:基隆|臺北|台北|新北|桃園|新竹|苗栗|臺中|台中|彰化|南投|雲林|嘉義市|臺南|台南|高雄|屏東|宜蘭|花蓮|臺東|台東|澎湖|金門|連江|恆春)/;
  const otherRegionRequirement=new RegExp(
    '(?:限|僅限|限定|須|需|必須|申請對象|獎助對象|資格條件|戶籍|設籍|原籍|籍貫|居住)[^。；\\n]{0,48}'+otherPlaces.source+
    '|'+otherPlaces.source+'[^。；\\n]{0,48}(?:戶籍|設籍|原籍|籍貫|居住|本縣|本市|學生)'
  );
  if(otherRegionRequirement.test(scope)){
    if(hasChiayi||hasTaichungStudy){
      const clearOr=/(?:或|任一|擇一|其中之一)/.test(scope);
      const clearAnd=/(?:且|並且|同時|以及|及須|並須)/.test(scope);
      if(clearOr&&!clearAnd)return null;
    }
    const withoutChiayi=scope.replace(/嘉義縣/g,'');
    const onlyAllowed=hasChiayi&&!otherPlaces.test(withoutChiayi);
    if(onlyAllowed)return null;
    return '具有嘉義縣設籍／臺中就讀以外的地域必要資格';
  }

  if(/(?:本縣|本市|本鄉|本鎮|本區)/.test(scope)){
    if(/嘉義縣/.test(title)&&!/(?:原住民|原住民族)/.test(title))return null;
    return '具有地方性本縣／本市／本鄉鎮區限制';
  }
  return null;
}

function scholarshipStrictEconomic(c){
  const rx=/(?:清寒|低收入戶|中低收入戶|經濟弱勢|弱勢家庭|弱勢學生|家庭經濟困難|家境困難|家境清寒|經濟困難|需工讀|須工讀|工讀者|家庭收入|家戶所得)/;
  if(rx.test(c.title))return '獎助名稱即限定清寒／低收入／經濟困難對象';
  const targetGeneral=scholarshipStrictGeneralAccess(c.target);
  if(!targetGeneral&&rx.test(c.target))return '獎助對象限定清寒／低收入／經濟困難身分';
  if(scholarshipStrictPositiveClause([c.restrictions,c.documents,c.academic].join(' '),rx))return '清寒／低收入／經濟條件為必要資格';
  if(/(?:清寒證明|低收入戶證明|中低收入戶證明|所得證明|家庭收入證明)/.test(c.documents))return '申請必備文件要求經濟弱勢證明';
  return null;
}

function scholarshipStrictIdentity(c){
  const rx=/(?:原住民|原住民族|新住民|新住民子女|僑生|外籍生|境外生|陸生|蒙藏生|特殊境遇家庭)/;
  if(rx.test(c.title))return '獎助名稱限定特定族群／身分';
  const targetGeneral=scholarshipStrictGeneralAccess(c.target);
  if(!targetGeneral&&rx.test(c.target))return '獎助對象限定特定族群／身分';
  if(scholarshipStrictPositiveClause([c.restrictions,c.documents,c.academic].join(' '),rx))return '特定族群／身分為必要資格';
  if(/(?:原住民身分證明|原住民族身分證明|僑生證明|外籍生證明|新住民證明)/.test(c.documents))return '申請必備文件要求特定身分證明';
  return null;
}

function scholarshipStrictMilitaryPublic(c){
  const rx=/(?:軍公教|軍警消|現役軍人|軍人子女|軍人遺族|軍眷|公務人員|公務員子女|公教人員|榮民|榮眷)/;
  if(rx.test(c.title))return '獎助名稱限定軍公教／軍警消等身分';
  const targetGeneral=scholarshipStrictGeneralAccess(c.target);
  if(!targetGeneral&&rx.test(c.target))return '獎助對象限定軍公教／軍警消等身分';
  if(scholarshipStrictPositiveClause([c.restrictions,c.documents,c.academic].join(' '),rx))return '軍公教／軍警消等為必要資格';
  return null;
}

function scholarshipStrictHealth(c){
  const identity=/(?:身心障礙|身障|重大傷病|罕見疾病|癌症|癌友|病友|病患|患者|慢性病|特殊疾病|病童|心臟病兒童|先天性心臟病)/;
  const treatment=/(?:手術|開刀|治療|化療|放射治療|心導管|心臟導管|器官移植|洗腎|透析|住院|醫師診斷|診斷證明|病歷證明)/;
  const history=/(?:罹患|患有|曾患|曾於|曾接受|接受過|經診斷|診斷為|治療者|手術者|病史)/;
  if(identity.test(c.title))return '獎助名稱限定疾病／傷病／身心障礙身分';
  const targetGeneral=scholarshipStrictGeneralAccess(c.target);
  if(!targetGeneral&&identity.test(c.target))return '獎助對象限定疾病／傷病／身心障礙身分';
  if(identity.test(c.restrictions))return '疾病／傷病／身心障礙為必要限制條件';
  if(treatment.test(c.restrictions)&&history.test(c.restrictions))return '特定手術／治療經歷為必要資格';
  if(/(?:身心障礙證明|重大傷病卡|診斷證明|病歷證明|手術證明)/.test(c.documents))return '申請必備文件要求醫療／身障證明';
  return null;
}

function scholarshipStrictSpecialCircumstance(c){
  const rx=/(?:天然災害|重大災害|受災|災區|火災|水災|震災|風災|急難|家庭重大變故|家中突遭變故|失親|孤兒|遺孤|父母雙亡|單親|家暴|家庭暴力|特殊事故)/;
  if(rx.test(c.title))return '獎助名稱限定受災／急難／特殊家庭遭遇';
  const targetGeneral=scholarshipStrictGeneralAccess(c.target);
  if(!targetGeneral&&rx.test(c.target))return '獎助對象限定受災／急難／特殊家庭遭遇';
  if(scholarshipStrictPositiveClause([c.restrictions,c.documents].join(' '),rx))return '受災／急難／特殊家庭遭遇為必要資格';
  if(/(?:受災證明|災害證明|村里長證明|死亡證明|切結書)/.test(c.documents)&&rx.test(c.text))return '申請必備文件要求特殊遭遇證明';
  return null;
}

function scholarshipStrictAffiliation(c){
  const rx=/(?:員工子女|職員子女|教職員子女|會員子女|校友子女|宗親|宗族|同鄉會|獅子會|扶輪社|青商會|工會會員|協會會員|公司員工|企業員工|眷屬|信徒|教友|特定姓氏)/;
  if(rx.test(c.title))return '獎助名稱限定特定組織／親屬／宗親身分';
  const targetGeneral=scholarshipStrictGeneralAccess(c.target);
  if(!targetGeneral&&rx.test(c.target))return '獎助對象限定特定組織／親屬身分';
  if(scholarshipStrictPositiveClause([c.restrictions,c.documents].join(' '),rx))return '特定組織／親屬身分為必要資格';
  return null;
}

function scholarshipStrictStudentLevel(c){
  const s=[c.title,c.target,c.academic,c.restrictions].join(' ');
  const acceptsUndergrad=/(?:大學部|學士班|大專校院|大專院校|大學生|大專生|日間學士班|各級學生|全校學生)/.test(s);
  if(acceptsUndergrad)return null;
  if(/(?:僅限|限|限定|專供|申請對象|獎助對象).{0,24}(?:國小|國中|高中|高職|高中職|五專前三年|碩士班|博士班|研究生|在職專班)/.test(s))return '限定其他教育階段／學制';
  if(/(?:國小生|國中生|高中生|高職生|高中職學生|碩士生|博士生|研究生)(?:專用|專屬|獎學金|助學金)/.test(s))return '獎助名稱限定其他教育階段';
  return null;
}

function scholarshipStrictMajor(c){
  const s=[c.target,c.academic,c.restrictions].join(' ');
  if(!s)return null;
  if(/(?:法律|法學|不限科系|不限學系|各系|各學系|全校學生|全校各系)/.test(s))return null;
  const hasDepartmentSignal=/(?:學院|學系|科系|系所|學門)/.test(s);
  if(!hasDepartmentSignal)return null;
  const nonLaw=/(?:管理學院|國貿|國際經營與貿易|企管|企業管理|財金|財務金融|會計|經濟|醫學|牙醫|護理|藥學|工程|工學院|電機|資訊|資工|機械|土木|化工|材料|建築|農業|農學|獸醫|生命科學|生物|化學|物理|數學|理學院|文學院|外文|中文|歷史|地理|社工|社會工作|心理|教育|師培|音樂|美術|藝術|體育|餐旅|觀光)/;
  if(nonLaw.test(s))return '限定非法律系之特定科系／學門';
  if(/(?:僅限|限|限定|專供|申請對象|獎助對象).{0,45}(?:學院|學系|科系|系所|學門)/.test(s))return '存在特定科系／學門限制，未證明法律系可申請';
  return null;
}

function scholarshipStrictRequiresVerifiedDetail(a){
  const id=String(a?.id||'');
  const specialty=String(a?.sourceSubId||'')==='specialty'||id.startsWith('auto-thu-sch-specialty-');
  return SCHOLARSHIP_STRICT_POLICY.requireVerifiedThuDetail&&id.startsWith('auto-thu-sch-')&&!specialty;
}

function scholarshipEligibility(a){
  const c=scholarshipStrictCorpus(a);
  const specialty=typeof scholarshipSpecialtyKind==='function'?scholarshipSpecialtyKind(a):null;
  const checks=[
    ['REGION',scholarshipStrictRegion(c)],
    ['ECONOMIC',scholarshipStrictEconomic(c)],
    ['IDENTITY',scholarshipStrictIdentity(c)],
    ['MILITARY_PUBLIC',scholarshipStrictMilitaryPublic(c)],
    ['HEALTH',scholarshipStrictHealth(c)],
    ['SPECIAL_CIRCUMSTANCE',scholarshipStrictSpecialCircumstance(c)],
    ['AFFILIATION',scholarshipStrictAffiliation(c)],
    ['STUDENT_LEVEL',scholarshipStrictStudentLevel(c)],
    ['MAJOR',scholarshipStrictMajor(c)]
  ];
  for(const [code,reason] of checks){
    if(reason)return {eligible:false,excluded:true,code,reason,specialty};
  }
  if(scholarshipStrictRequiresVerifiedDetail(a)&&a?.eligibilityVerified!==true)
    return {eligible:false,excluded:true,code:'UNVERIFIED',reason:'東海獎學金官方詳細資格尚未完成驗證，嚴格模式暫不推薦',specialty};
  return {eligible:true,excluded:false,code:'PASS',reason:'通過嚴格硬性資格審查',specialty};
}

function scholarshipAssessment(a){
 const eligibility=scholarshipEligibility(a),text=scholarshipPolicyText(a).toLowerCase();
 let score=45;if(!eligibility.eligible)return {...eligibility,score:0,priority:-1};
 if(/東海|東海大學|tunghai/.test(text))score+=20;
 if(/法律|法治|司法|法學|律師|司法官|專門職業及技術人員/.test(text))score+=15;
 if(/大學|學生|在學|學士班|碩士班|博士班/.test(text))score+=5;
 if(/成績|學業|gpa|排名|優良|優秀/.test(text))score+=5;
 let priority=0;
 if(eligibility.specialty==='專業考照'){score+=28;priority=2}
 if(eligibility.specialty==='外語能力'){score+=30;priority=2}
 if(eligibility.specialty==='專業考照'&&/法律|司法|律師|專技|國家考試/.test(text)){score+=5;priority=3}
 return {...eligibility,score:Math.min(99,Math.max(0,score)),priority};
}
function scholarshipFit(a){return scholarshipAssessment(a).score}
function renderScholarships(){
 const box=document.getElementById('scholarshipList');if(!box)return;ensureActivities();
 const today=todayKey(),filter=document.getElementById('scholarshipFilter')?.value||'全部';
 if(typeof scholarshipLastFilter!=='undefined'&&filter!==scholarshipLastFilter){
   if(typeof scholarshipPage!=='undefined')scholarshipPage=1;scholarshipLastFilter=filter;
 }
 const assessedAll=scholarshipStore().map(a=>{
   const assessment=scholarshipAssessment(a);
   const life=typeof scholarshipTimeState==='function'?scholarshipTimeState(a,today):{keep:true,state:''};
   return {...a,score:assessment.score,assessment,life};
 });
 const excluded=assessedAll.filter(a=>a.life.keep&&!a.assessment.eligible).length;
 let arr=assessedAll.filter(a=>a.life.keep&&a.assessment.eligible);
 arr=arr.filter(a=>{
   if(filter==='高度符合')return a.score>=80;
   if(filter==='可能符合')return a.score>=60&&a.score<80;
   if(filter==='近期截止')return !!a.date&&a.date>=today&&daysUntil(a.date)<=30;
   if(filter==='專業考照')return a.assessment.specialty==='專業考照';
   if(filter==='外語能力')return a.assessment.specialty==='外語能力';
   return true;
 });
 arr.sort((a,b)=>(b.assessment.priority-a.assessment.priority)||((a.date||'9999-12-31').localeCompare(b.date||'9999-12-31'))||(b.score-a.score));
 const high=arr.filter(a=>a.score>=80&&a.kind!=='reference').length;
 const professional=arr.filter(a=>a.assessment.specialty==='專業考照').length;
 const language=arr.filter(a=>a.assessment.specialty==='外語能力').length;
 const lifecycle=(typeof scholarshipLifecycleMeta!=='undefined'&&scholarshipLifecycleMeta)||{};
 const pruned=(lifecycle.expiredPruned||0)+(lifecycle.unknownPruned||0)+(lifecycle.disabledPruned||0);
 const stats=document.getElementById('scholarshipStats');
 if(stats)stats.innerHTML=`目前 <b>${arr.length}</b> 項 · 高度符合 ${high} · 專業考照 ${professional} · 外語能力 ${language} · 資格排除 ${excluded}${pruned?' · 自動汰除 '+pruned:''}`;
 let pageItems=arr;
 if(typeof SCHOLARSHIP_PAGE_SIZE==='number'&&SCHOLARSHIP_PAGE_SIZE>0&&typeof scholarshipPage!=='undefined'){
   const pages=Math.max(1,Math.ceil(arr.length/SCHOLARSHIP_PAGE_SIZE));scholarshipPage=Math.min(Math.max(1,scholarshipPage),pages);
   const start=(scholarshipPage-1)*SCHOLARSHIP_PAGE_SIZE;pageItems=arr.slice(start,start+SCHOLARSHIP_PAGE_SIZE);
 }
 box.innerHTML=pageItems.map(a=>{
   const level=a.kind==='reference'?'參考':a.score>=80?'高度符合':a.score>=60?'可能符合':'參考';
   const cls=level==='高度符合'?'':' '+(level==='可能符合'?'gold':'gray');
   const specialty=a.assessment.specialty==='一般獎學金'?'':a.assessment.specialty+' · ';
   const lifeLabel=a.life?.state?esc(a.life.state)+' · ':'';
   return `<button class="row scholarship-card scholarship-action-row" type="button" onclick="openScholarshipInfo('${a.id}')"><span class="main"><span class="title">${esc(a.title)}</span><span class="meta">${specialty}${a.date?'截止 '+esc(a.date.slice(5).replace('-','/'))+' · ':''}${lifeLabel}${esc(a.source||a.scope||'官方資訊')}</span></span><span class="badge${cls}">${level}</span><span class="scholarship-chevron" aria-hidden="true">›</span></button>`;
 }).join('')||'<div class="empty">目前沒有符合個人資格判斷的獎學金資料。</div>';
 if(typeof renderScholarshipPagination==='function')renderScholarshipPagination(arr.length);
}
function openScholarshipInfo(id){
 const a=scholarshipStore().find(x=>String(x.id)===String(id));if(!a)return;
 const assessment=scholarshipAssessment(a),score=assessment.score;
 const level=!assessment.eligible?'已排除':score>=80?'高度符合':score>=60?'可能符合':'參考';
 const official=typeof scholarshipOfficialUrl==='function'?scholarshipOfficialUrl(a):String(a?.detailUrl||a?.url||a?.externalUrl||a?.sourceUrl||'').trim();
 const number=typeof scholarshipNumber==='function'?scholarshipNumber(a):'';
 const life=typeof scholarshipTimeState==='function'?scholarshipTimeState(a,todayKey()):null;
 document.getElementById('scholarshipInfoTitle').textContent=a.title;
 document.getElementById('scholarshipInfoBody').innerHTML=`<div class="info-modal-grid">
  <div class="info-kv"><small>判斷結果</small><b>${esc(level)}</b></div>
  <div class="info-kv"><small>適配分數</small><b>${assessment.eligible?score+'%':'—'}</b></div>
  <div class="info-kv"><small>類型</small><b>${esc(assessment.specialty)}</b></div>
  <div class="info-kv"><small>資格判斷</small><b>${esc(assessment.reason)}</b></div>
  <div class="info-kv"><small>申請期限</small><b>${esc(a.date||a.deadline||'未標示')}</b></div>
  <div class="info-kv"><small>來源</small><b>${esc(a.source||a.scope||'官方資訊')}</b></div>
  ${number?`<div class="info-kv"><small>獎助學金編號</small><b>${esc(number)}</b></div>`:''}
  ${life?.state?`<div class="info-kv"><small>期限狀態</small><b>${esc(life.state)}</b></div>`:''}
 </div><div class="notice">${assessment.eligible
 ?'只有在清寒／低收入／經濟弱勢或軍公教／軍警消等身分是基本申請或受獎必要條件時才排除；若只是額外補助、加發或報名費補助而一般學生仍可申請基本獎勵，則保留。專業考照與外語能力獎勵仍提高排序。'
 :'此項因公告呈現明確的特定資格限制而不列入個人推薦；最終資格仍以官方簡章為準。'
 }</div><div class="goal-info-actions">${official?`<a class="btn primary" href="${esc(safeExternalUrl(official))}" target="_blank" rel="noopener noreferrer">${number?'開啟官方詳細辦法／申請書':'查看官方資訊'}</a>`:''}${assessment.eligible&&(a.date||a.deadline)?`<button class="btn dark" type="button" onclick="addActivityToCalendar('${String(a.id).replace(/'/g,"\\'")}');closeScholarshipInfoModal()">加入申請截止日</button>`:''}<button class="btn" type="button" onclick="closeScholarshipInfoModal()">關閉</button></div>`;
 document.getElementById('scholarshipInfoModal').classList.add('show');document.body.style.overflow='hidden';bindInteractionFeedback();
}
function closeScholarshipInfoModal(){const m=document.getElementById('scholarshipInfoModal');if(m)m.classList.remove('show');document.body.style.overflow='';}

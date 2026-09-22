'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),report=[];
function test(name,fn){fn();report.push({name,status:'PASS'});console.log('PASS',name)}
function setup(seed={}){
 const data=new Map(Object.entries(seed));
 const c={console,Date,Math,JSON,Map,Set,Uint32Array,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}};
 c.window=c;c.globalThis=c;vm.createContext(c);
 for(const f of ['toeic-random-engine.js','reading-question-bank.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),c);
 return {c,B:c.ToeicReadingBank,E:c.ToeicRandomEngine,data};
}
const {B,E}=setup(),bank=B.inspect();
test('180 original questions in 40 independently written reading contexts',()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(B.stats())),{6:{contexts:20,questions:80},7:{contexts:20,questions:100}});
 assert.equal(new Set([...bank[6],...bank[7]].map(x=>x.id)).size,40);
 for(const part of [6,7])for(const s of bank[part])assert.equal(B.validate(part,s.questions).length,0,s.id);
});
test('Part 6 always has four numbered blanks and a whole-sentence item',()=>{
 for(const s of bank[6]){
  const qs=s.questions;assert.equal(qs.length,4);assert.equal(new Set(qs.map(q=>q.stimulus)).size,1);
  qs.forEach((q,i)=>{assert.equal(q.gapNumber,i+1);assert.match(q.q,/blank \[[1-4]\]/);assert.equal((q.stimulus.match(/\[[1-4]\] _____/g)||[]).length,4)});
  assert(qs.some(q=>q.skill==='Sentence completion'&&q.options.every(o=>o.split(/\s+/).length>=5)));
 }
});
test('old screenshot comprehension items are rejected as Part 6',()=>{
 const old=Array.from({length:4},(_,i)=>({id:'old'+i,part:6,q:'Why should employees use the newest version?',stimulus:'Please review the updated inventory information.',options:['The document was revised','Other','Again','None'],answer:0}));
 assert(B.validate(6,old).some(x=>/空格/.test(x)));
});
test('Part 7 evidence is a verbatim part of its own passage',()=>{
 for(const s of bank[7])for(const q of s.questions){assert(q.stimulus.includes(q.evidence),q.id);assert.equal(q.options.length,4)}
 assert(bank[7].flatMap(s=>s.questions).filter(q=>q.skill==='Cross-reference').length>=5);
});
test('all contexts have distinct substantial content, not just different titles',()=>{
 const sets=[...bank[6],...bank[7]];
 const shingles=s=>{const w=s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/);return new Set(w.slice(0,-4).map((_,i)=>w.slice(i,i+5).join(' ')))};
 for(let i=0;i<sets.length;i++)for(let j=i+1;j<sets.length;j++){
  const a=shingles(sets[i].questions[0].stimulus),b=shingles(sets[j].questions[0].stimulus),over=[...a].filter(v=>b.has(v)).length;
  assert(over/Math.min(a.size,b.size)<.5,sets[i].id+' '+sets[j].id);
 }
});
test('20 sequential Part 6 rounds use 20 different passages before repeating',()=>{
 const {B}=setup(),seen=new Set();
 for(let i=0;i<20;i++){const s=B.draw(6,4,'p6-'+i);assert(!s.novelty.repeat);assert(!seen.has(s.contextId));seen.add(s.contextId)}
 const repeat=B.draw(6,4,'p6-21');assert(repeat.novelty.repeat);assert.equal(repeat.novelty.seen,20);
});
test('20 sequential Part 7 rounds use 20 different passages before repeating',()=>{
 const {B}=setup(),seen=new Set();for(let i=0;i<20;i++){const s=B.draw(7,4,'p7-'+i);assert(!seen.has(s.contextId));seen.add(s.contextId)}
 assert(B.draw(7,4,'p7-21').novelty.repeat);
});
test('draw history survives reload and changes of practice mode',()=>{
 const first=setup();const a=first.B.draw(6,4,'quick|first');const next=setup(Object.fromEntries(first.data));
 const b=next.B.draw(6,4,'standard|second');assert.notEqual(a.contextId,b.contextId);assert.equal(b.novelty.seen,2);
});
test('retrying a block preserves content and does not consume another draw',()=>{
 const {B,data}=setup();const a=B.draw(6,4,'session',0);const raw=data.get(B.STORAGE_KEY);const b=B.draw(6,4,'session',0);
 assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(data.get(B.STORAGE_KEY),raw);
});
test('retry after a reload preserves original block even when other draws occurred',()=>{
 const old=setup();const a=old.B.draw(7,4,'saved',3);old.B.draw(7,4,'other',1);const next=setup(Object.fromEntries(old.data));
 assert.equal(a.contextId,next.B.draw(7,4,'saved',3).contextId);
 assert.equal(JSON.stringify(a.questions),JSON.stringify(next.B.draw(7,4,'saved',3).questions));
});
test('answer randomization preserves every correct text and evidence',()=>{
 for(const part of [6,7])for(const s of bank[part])for(let n=0;n<20;n++){
  const before=JSON.stringify(s.questions),r=E.balanceAnswers(s.questions,'shuffle-'+n);
  r.forEach((q,i)=>{assert.equal(q.options[q.answer],s.questions[i].options[s.questions[i].answer]);assert.equal(q.evidence,s.questions[i].evidence);assert.equal(q.contextFingerprint,s.questions[i].contextFingerprint)});
  assert.equal(B.validate(part,r).length,0);assert.equal(JSON.stringify(s.questions),before);
 }
});
test('content identity ignores question IDs and option order',()=>{
 const q=bank[7][0].questions[0];const rotated=E.balanceAnswers([{...q,id:'new-random-id'}],'changed',[3])[0];
 assert.equal(B.signature(q),B.signature(rotated));
});
test('full mock Part 6 and Part 7 contexts never repeat even across a pool boundary',()=>{
 for(const part of [6,7]){
  const {B}=setup();for(let i=0;i<17;i++)B.draw(part,part===6?4:5,'old-'+i);
  const seen=[];const counts=part===6?[4,4,4,4]:[5,5,5,5,5,5,5,5,5,5,4];let n=0;
  counts.forEach((count,i)=>{const s=B.draw(part,count,'full-mock',i,seen);assert(!seen.includes(s.questions[0].contextFingerprint));seen.push(s.questions[0].contextFingerprint);n+=s.questions.length});
  assert.equal(n,part===6?16:54);
 }
});
test('question-bank exhaustion is explicit rather than a silent duplicate',()=>{
 const {B}=setup();const excluded=bank[6].map(x=>x.contextFingerprint);
 assert.throws(()=>B.draw(6,4,'too-many',0,excluded),/用完/);
});
test('invalid counts and duplicate options fail validation',()=>{
 assert.throws(()=>B.draw(6,3,'invalid'));assert.throws(()=>B.draw(7,6,'invalid'));assert.throws(()=>B.draw(7,0,'invalid'));
 const qs=JSON.parse(JSON.stringify(bank[6][0].questions));qs[0].options[1]=qs[0].options[0];assert(B.validate(6,qs).includes('選項內容重複'));
});
test('existing learning, writing, mock and goal records are not touched',()=>{
 const sentinel={sessions:'[{"id":"old-reading"}]',toeicFullMockActive:'{"id":"old-mock","currentSet":{"legacy":true}}',toeicVocabBankV2:'[{"word":"keep"}]',toeicWritingDraftV1:'{"text":"keep my draft"}',GoalManagerToeicEventHubV2:'{"old":"keep"}',toeicPartMistakes:'[{"question":{"q":"old context"}}]'};
 const {B,data}=setup(sentinel);B.draw(6,4,'new');B.draw(7,5,'another');for(const [k,v] of Object.entries(sentinel))assert.equal(data.get(k),v);
 assert.equal(data.size,Object.keys(sentinel).length+1);
});
test('corrupt sampling data is never silently overwritten',()=>{
 const {B,data}=setup({toeicReadingDrawsV263:'bad-json'});assert.throws(()=>B.draw(6,4,'broken'),/損壞/);assert.equal(data.get(B.STORAGE_KEY),'bad-json');
});
test('storage write failure stops the draw rather than falsely promising deduplication',()=>{
 const {B,c}=setup();c.localStorage.setItem=()=>{throw Error('quota')};assert.throws(()=>B.draw(7,4,'full'),/無法儲存/);
});
test('legacy preview paths no longer emit title-swapping comprehension as Part 6',()=>{
 const q=B.previewQuestion(6,0,'legacy');assert.match(q.stimulus,/\[1\] _____/);assert.equal(q.part,6);
 const source=fs.readFileSync(path.join(ROOT,'app.js'),'utf8')+fs.readFileSync(path.join(ROOT,'appdeploy-parity-runtime.js'),'utf8');
 assert(!source.includes('Why should employees use the newest version?'));assert(!source.includes('The company will test a new ${t}'));
});
test('runtime routes both practice and full mock through the new content bank',()=>{
 const s=fs.readFileSync(path.join(ROOT,'appdeploy-parity-runtime.js'),'utf8');
 assert(s.includes('ToeicReadingBank.draw'));assert(s.includes('state.answers.map(x=>x.item?.contextFingerprint)'));assert(s.includes("a.answers.map(x=>(x.q||x.question)?.contextFingerprint)"));
 const h=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');assert(h.indexOf('reading-question-bank.js')<h.indexOf('appdeploy-parity-runtime.js'));
 assert(fs.readFileSync(path.join(ROOT,'sw.js'),'utf8').includes('./reading-question-bank.js'));
});
const result={version:'2.6.3',status:'PASS',checks:report.length,bank:B.stats(),tests:report,limits:['Original practice material; not ETS questions or independent expert semantic validation.','Cross-tab simultaneous draw coordination and physical Android PWA update are not tested here.']};
const dest=process.env.READING_TEST_REPORT||path.join(ROOT,'qa/reading-bank-test-report.json');fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');console.log('READING_BANK_TEST_PASS checks='+report.length);

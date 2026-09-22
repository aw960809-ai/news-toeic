'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');const E=require(path.join(ROOT,'toeic-random-engine.js'));
let checks=0,plans=0;const report=[];
function test(name,fn){fn();checks++;report.push({name,status:'PASS'});console.log('PASS',name)}
function context(){
 const store=new Map();const noop=()=>{};
 const c={console,Date,Intl,Math,JSON,Map,Set,Promise,URL,Uint32Array,setTimeout,clearTimeout,requestAnimationFrame:noop,now:()=>new Date().toISOString(),localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},document:{querySelector:()=>null,querySelectorAll:()=>[]},allLessons:()=>[],generated:()=>[],sessions:()=>[],newsMistakes:()=>[],openLesson:noop,finishLesson:noop,reviewPage:()=>'',bind:noop,render:noop,toast:noop,save:noop,news:[],KEYS:{generated:'generated'},targetWords:()=>'250–400',esc:v=>String(v),q:(id,part,skill,q,options,answer,explain)=>({id,part,skill,q,options,answer,explain}),ToeicRandomEngine:E};
 c.window=c;c.globalThis=c;return vm.createContext(c);
}
test('6000 weighted random plans preserve bounds and maximum streak',()=>{
 for(let s=0;s<1000;s++)for(const [total,k] of [[1,4],[3,4],[9,4],[175,4],[25,3],[200,4]]){
  const a=E.positions(total,k,'seed'+s),hist=Array(k).fill(0);a.forEach(v=>hist[v]++);
  assert.equal(a.length,total);assert(a.every(v=>Number.isInteger(v)&&v>=0&&v<k));assert(E.longestRun(a.map(answer=>({answer})))<=3);plans++;
 }
});
test('option permutation keeps correct answer and never mutates inputs',()=>{
 const src=Array.from({length:31},(_,i)=>({id:'q'+i,options:['correct'+i,'one','two', 'three'],answer:0})),original=JSON.stringify(src);
 const r=E.balanceAnswers(src,'stable');r.forEach((q,i)=>assert.equal(q.options[q.answer],src[i].options[0]));assert.equal(JSON.stringify(src),original);assert.equal(JSON.stringify(r),JSON.stringify(E.balanceAnswers(src,'stable')));
});
test('three-option and four-option groups stay separate',()=>{
 const source=[...Array(25)].map((_,i)=>({options:['yes','no','later'],answer:0})).concat([...Array(175)].map(()=>({options:['yes','no','later','none'],answer:0})));
 const hist=E.histogram(E.balanceAnswers(source,'fullmock'));assert.equal(hist[3].reduce((a,b)=>a+b),25);assert.equal(hist[4].reduce((a,b)=>a+b),175);assert(hist[3].every(n=>n>0));
});
test('sampling is without replacement until pool exhaustion',()=>{const a=E.sampleIndices(10,20,'draw');assert.equal(new Set(a.slice(0,10)).size,10);assert.equal(new Set(a.slice(10)).size,10);assert.notEqual(a[9],a[10])});
const c=context();vm.runInContext(fs.readFileSync(path.join(ROOT,'headline-lesson-generator.js'),'utf8'),c);
const lessons=[];
test('article generation uses its own sentence examples and grounded questions',()=>{
 for(let i=0;i<40;i++){
  const item={id:'qa-'+i,title:'Service teams review changing demand '+i,source:'QA fixture',category:['Business','Travel','Technology','Daily Life'][i%4]};
  const l=c.buildNewsLesson(item);lessons.push(l);
  assert.equal(l.questions.length,9);assert(l.questions.filter(q=>q.part==='Part 6').length>=2);
  for(const g of l.grammar)assert(l.text.includes(g[1]),'grammar example not in text');
  for(const q of l.questions){assert(l.text.includes(q.evidence),'missing evidence');assert(q.options[q.answer]);assert.equal(q.options.length,4)}
  for(const v of l.vocabulary){assert(l.text.toLowerCase().includes(v.word.toLowerCase()));assert(l.text.includes(v.example))}
  assert.equal(new Set(l.syntaxProfile).size,l.syntaxProfile.length);
 }
});
test('article plan remains stable when other articles are generated',()=>{const item={id:'stable-source',title:'Same source',category:'Business'};const a=c.buildNewsLesson(item);c.buildNewsLesson({id:'other',title:'Another',category:'Travel'});const b=c.buildNewsLesson(item);assert.equal(a.text,b.text);assert.equal(JSON.stringify(a.questions),JSON.stringify(b.questions))});
test('article syntax is varied across sources',()=>assert(new Set(lessons.map(l=>l.syntaxProfile.join('|'))).size>30));
const w=context();vm.runInContext(fs.readFileSync(path.join(ROOT,'study-workbench.js'),'utf8'),w);
test('vocabulary recall intervals are 1,3,7,14,30 days then mastery',()=>{
 const key='toeicVocabBankV2';w.localStorage.setItem(key,JSON.stringify([{id:'v:word',stage:0,status:'learning'}]));
 for(const days of [1,3,7,14,30]){const t=Date.now();w.ToeicStudyTest.advance(key,'v:word',true);const x=JSON.parse(w.localStorage.getItem(key))[0];assert(Math.abs((Date.parse(x.dueAt)-t)/86400000-days)<.001);assert.notEqual(x.status,'mastered')}
 w.ToeicStudyTest.advance(key,'v:word',true);assert.equal(JSON.parse(w.localStorage.getItem(key))[0].status,'mastered');
});
test('a wrong recall resets only that target',()=>{const key='toeicVocabBankV2';w.localStorage.setItem(key,JSON.stringify([{id:'one',stage:3,status:'reviewing'},{id:'two',stage:2,status:'reviewing'}]));w.ToeicStudyTest.advance(key,'one',false);const x=JSON.parse(w.localStorage.getItem(key));assert.equal(x[0].stage,0);assert.equal(x[1].stage,2)});
test('unsupported grammar is not auto-approved',()=>assert.equal(w.ToeicStudyTest.patternUsed('unrecognised construction','Hello.'),null));
test('supported grammar matches targets only',()=>{assert.equal(w.ToeicStudyTest.patternUsed('By + V-ing','By comparing results, we can find a pattern.'),true);assert.equal(w.ToeicStudyTest.patternUsed('By + V-ing','The report is ready.'),false)});
test('random plans have variable totals rather than a fixed answer quota',()=>{
 const signatures=new Set(),aggregate=[0,0,0,0];for(let n=0;n<2000;n++){const a=E.positions(20,4,'distribution-'+n),h=[0,0,0,0];for(const v of a){h[v]++;aggregate[v]++}signatures.add(h.join(','))}
 assert(signatures.size>20);assert(aggregate.every(n=>Math.abs(n-10000)<600));
});
test('explanation labels and composed option IDs follow the correct answer',()=>{
 const q={id:'labels',options:['right','wrong','other'],answer:0,explain:'Option A is right; 選項 B is wrong. (C) is another choice.'};
 const r=E.balanceAnswers([q],'labels',[2])[0];assert(r.explain.includes('Option C'));assert.equal(r.optionIds[r.answer],'labels:0');
 const twice=E.balanceAnswers([r],'second',[1])[0];assert.equal(twice.options[twice.answer],'right');assert.equal(twice.optionIds[twice.answer],'labels:0');assert(twice.explain.includes('Option B'));
});
test('pool validation and a cycle boundary never duplicate a question within a small draw',()=>{
 global.localStorage={getItem:()=>JSON.stringify({test:{size:5,bag:[2],last:1}}),setItem:()=>{}};
 assert.equal(new Set(E.drawPool('test',5,5)).size,5);assert.throws(()=>E.drawPool('test',0,1));assert.throws(()=>E.sampleIndices(3,-1,'bad'));
});
test('different meanings are retained; rescan preserves IDs, review state and all sources',()=>{
 const t=w.ToeicStudyTest,A={id:'a',title:'A',text:'Please book a room.'},B={id:'b',title:'B',text:'We need to book in advance.'};
 const va=t.normalizeVocab({word:'book',meaning:'預訂',example:A.text},A),vb=t.normalizeVocab({word:'book',meaning:'預訂',example:B.text},B),vc=t.normalizeVocab({word:'book',meaning:'書本',example:'Read a book.'},B);
 const old={...va,id:'v:book',stage:3,reviews:8,dueAt:'2030-01-01'};
 const rows=t.mergeBank([old],[vb,vc]);assert.equal(rows.length,2);assert.equal(rows[0].id,'v:book');assert.equal(rows[0].stage,3);assert.equal(rows[0].sources.length,2);assert.equal(JSON.stringify(rows),JSON.stringify(t.mergeBank(rows,[vb,vc])));
});
test('the same saved recall event cannot advance a word twice',()=>{
 const t=w.ToeicStudyTest,key=t.keys.VOCAB_KEY;w.localStorage.setItem(key,JSON.stringify([{id:'same',stage:0,status:'learning'}]));t.advance(key,'same',true,false,'event-1');t.advance(key,'same',true,false,'event-1');const row=JSON.parse(w.localStorage.getItem(key))[0];assert.equal(row.reviews,1);assert.equal(row.stage,1);
});
test('legacy writing draft retains its original targets and text',()=>{
 const t=w.ToeicStudyTest;w.localStorage.setItem(t.keys.VOCAB_KEY,JSON.stringify([{id:'one',word:'demand'}]));w.localStorage.setItem(t.keys.PATTERN_KEY,JSON.stringify([{id:'by',title:'By + V-ing'}]));w.localStorage.setItem('toeicWritingDraftV1',JSON.stringify({mode:'sentence',text:'Keep my sentence.',vocabIds:['one'],patternIds:['by']}));
 const d=t.getDraft('sentence');assert.equal(d.text,'Keep my sentence.');assert.equal(d.words[0].id,'one');assert.equal(d.patterns[0].id,'by');assert.equal(t.getDraft('sentence').id,d.id);
});
test('writing history is not trimmed at 500 and save IDs are idempotent',()=>{
 const t=w.ToeicStudyTest,key=t.keys.WRITING_KEY;w.localStorage.setItem(key,JSON.stringify(Array.from({length:505},(_,i)=>({id:'old-'+i}))));t.saveWriting({id:'new'});t.saveWriting({id:'new'});assert.equal(JSON.parse(w.localStorage.getItem(key)).length,506);
});
test('new grammar targets use a matching original sentence when the old example is paraphrased',()=>{
 const t=w.ToeicStudyTest,lesson={id:'source',title:'Source',text:'A regional retailer plans to expand its delivery options. Employees will receive training.'};
 const row=t.normalizePattern(['plan to + V','The company plans to expand its service.'],lesson);
 assert.equal(row.example,'A regional retailer plans to expand its delivery options.');assert.equal(row.sources[0].verbatim,true);
 const other=t.normalizePattern(['unrecognised construction','This is an illustrative example.'],lesson);assert.equal(other.sources[0].verbatim,false);
});
test('damaged review storage is not overwritten during a harvest',()=>{
 const t=w.ToeicStudyTest,key=t.keys.VOCAB_KEY;w.localStorage.setItem(key,'not-json');assert.throws(()=>t.collectLesson({id:'safe',vocabulary:[['word','meaning','']],grammar:[]}));assert.equal(w.localStorage.getItem(key),'not-json');
});
const summary={checks,randomPlans:plans,status:'PASS',report};
fs.writeFileSync(path.join(ROOT,'qa/unit-report.json'),JSON.stringify(summary,null,2));
console.log(`UNIFIED_UNIT_TEST_PASS checks=${checks} randomPlans=${plans}`);

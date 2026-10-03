'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const data=new Map();
const localStorage={getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i]??null,get length(){return data.size}};
const noop=()=>{};
const E={nonce:()=>`n-${Date.now()}`,rng:()=>Math.random,shuffle:a=>a.slice().reverse()};
const c={console,Date,Math,JSON,Map,Set,Intl,localStorage,window:null,globalThis:null,reviewPage:()=>'',bind:noop,render:noop,toast:noop,esc:v=>String(v),ToeicRandomEngine:E,document:{querySelector:()=>null,querySelectorAll:()=>[],visibilityState:'visible'},setInterval,clearInterval,setTimeout,clearTimeout};
c.window=c;c.globalThis=c;
vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(ROOT,'vocab-multiskill-v28.js'),'utf8'),c);
const A=c.ToeicVocabSkillsV28,key=A.keys.VOCAB_KEY;let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name)}

test('legacy progress is inherited as spelling only',()=>{const row={id:'w',word:'expand',meaning:'擴展',stage:3,status:'reviewing',dueAt:'2030-01-01T00:00:00.000Z',reviews:8,correct:7,wrong:1};assert.equal(A.skillState(row,'spelling').stage,3);assert.equal(A.skillState(row,'recognition').stage,0)});
test('five skills appear only when source data supports them',()=>{const row={word:'deadline',meaning:'期限',example:'We must meet the deadline tomorrow.',collocation:'meet a deadline'};assert.deepEqual(Array.from(A.applicableSkills(row)),['recognition','recall','spelling','context','collocation']);assert.deepEqual(Array.from(A.applicableSkills({word:'plain',meaning:'簡單'})),['recognition','recall','spelling'])});
test('a skill advances without erasing legacy spelling progress',()=>{const row={id:'w1',word:'expand',meaning:'擴展',stage:3,status:'reviewing',dueAt:'2030-01-01T00:00:00.000Z',reviews:8,correct:7,wrong:1};localStorage.setItem(key,JSON.stringify([row]));A.advanceSkill('w1','recognition',true,false,'r1');const saved=JSON.parse(localStorage.getItem(key))[0];assert.equal(saved.skillProgress.spelling.stage,3);assert.equal(saved.skillProgress.recognition.stage,1)});
test('duplicate saved event cannot double advance a skill',()=>{A.advanceSkill('w1','recognition',true,false,'r1');const saved=JSON.parse(localStorage.getItem(key))[0];assert.equal(saved.skillProgress.recognition.stage,1)});
test('wrong answer resets only the target skill',()=>{A.advanceSkill('w1','recall',true,false,'recall-ok');A.advanceSkill('w1','recognition',false,false,'recognition-wrong');const saved=JSON.parse(localStorage.getItem(key))[0];assert.equal(saved.skillProgress.recognition.stage,0);assert.equal(saved.skillProgress.recall.stage,1);assert.equal(saved.skillProgress.spelling.stage,3)});
test('skill mastery follows six successful stages',()=>{localStorage.setItem(key,JSON.stringify([{id:'w2',word:'invoice',meaning:'發票',stage:0,status:'learning'}]));for(let i=0;i<6;i++)A.advanceSkill('w2','recognition',true,false,'x'+i);const saved=JSON.parse(localStorage.getItem(key))[0];assert.equal(saved.skillProgress.recognition.stage,6);assert.equal(saved.skillProgress.recognition.status,'mastered');assert.equal(A.fullyMastered(saved),false)});
test('mixed selector includes multiple ability types when available',()=>{const rows=Array.from({length:8},(_,i)=>({id:'m'+i,word:'word'+i,meaning:'意思'+i,example:`The team will use word${i} in this example.`,collocation:`use word${i}`}));localStorage.setItem(key,JSON.stringify(rows));const pairs=A.selectPairs('mixed',10);assert(pairs.length>0);assert(new Set(pairs.map(x=>x.skill)).size>=3)});
console.log(`VOCAB_MULTISKILL_TEST_PASS checks=${checks}`);

'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),data=new Map();
const localStorage={
 getItem:k=>data.has(k)?data.get(k):null,
 setItem:(k,v)=>data.set(k,String(v)),
 removeItem:k=>data.delete(k)
};
const noop=()=>{};
const c={
 console,Date,JSON,localStorage,
 reviewPage:()=>'<div class="study-tabs"></div><div>old</div>',bind:noop,render:noop,toast:noop,
 document:{readyState:'loading',addEventListener:noop,querySelector:()=>null},
 window:null,globalThis:null,MutationObserver:undefined,setTimeout:noop
};
c.window=c;c.globalThis=c;c.confirm=()=>true;
vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(ROOT,'vocab-session-controls-v281.js'),'utf8'),c);
const S=c.ToeicVocabSessionControlsV281;
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name)}

test('restart keeps identity, set and timing but clears current answers',()=>{
 const q={id:'same',mode:'meaning',set:[{id:'a'},{id:'b'}],index:2,answers:[{ok:true},{ok:false}],timing:{version:1,days:{'2026-10-03':60000}},completedAt:'2026-10-03T10:00:00Z'};
 const r=S.resetQuizObject(q);
 assert.equal(r.id,'same');
 assert.equal(r.set.length,2);
 assert.equal(r.index,0);
 assert.equal(Array.isArray(r.answers),true);
 assert.equal(r.answers.length,0);
 assert.equal(JSON.stringify(r.timing),JSON.stringify(q.timing));
 assert.equal(r.completedAt,undefined);
 assert.equal(q.index,2);
});

test('restartStored does not clear vocabulary bank or unrelated data',()=>{
 const q={id:'legacy',set:[{id:'a'}],index:1,answers:[{ok:true}],timing:{version:1,days:{}}};
 localStorage.setItem(S.keys.LEGACY_KEY,JSON.stringify(q));
 localStorage.setItem('toeicVocabBankV2','[{"word":"keep"}]');
 localStorage.setItem('ledger','KEEP');
 S.restartStored('legacy');
 assert.equal(JSON.parse(localStorage.getItem(S.keys.LEGACY_KEY)).index,0);
 assert.equal(localStorage.getItem('toeicVocabBankV2'),'[{"word":"keep"}]');
 assert.equal(localStorage.getItem('ledger'),'KEEP');
});

test('abandon removes only active round',()=>{
 S.abandonStored('legacy');
 assert.equal(localStorage.getItem(S.keys.LEGACY_KEY),null);
 assert.equal(localStorage.getItem('toeicVocabBankV2'),'[{"word":"keep"}]');
 assert.equal(localStorage.getItem('ledger'),'KEEP');
});

test('legacy unfinished round takes priority so it can be resolved before v2.8 round',()=>{
 localStorage.setItem(S.keys.LEGACY_KEY,JSON.stringify({set:[{id:'old'}]}));
 localStorage.setItem(S.keys.NEW_KEY,JSON.stringify({set:[{id:'new'}]}));
 assert.equal(S.activeKind(),'legacy');
});

console.log(`VOCAB_SESSION_CONTROLS_TEST_PASS checks=${checks}`);

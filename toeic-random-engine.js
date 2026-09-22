(function(root){
  'use strict';
  const VERSION='unified-random-v2';
  function hashSeed(value){let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0}
  function rng(seed){let a=hashSeed(seed);return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  function nonce(){const a=new Uint32Array(4);if(root.crypto?.getRandomValues){root.crypto.getRandomValues(a);return Array.from(a).join('-')}return `${Date.now()}-${Math.random()}`}
  function shuffle(list,random=Math.random){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  function run(a){let max=0,n=0,last;for(const v of a){n=v===last?n+1:1;last=v;max=Math.max(max,n)}return max}
  function poolArgs(size,count){if(!Number.isInteger(size)||size<1||!Number.isInteger(count)||count<0||count>100000)throw new RangeError('Invalid pool size or count')}
  function positions(total,k,seed){
    if(!Number.isInteger(total)||total<0||total>100000||!Number.isInteger(k)||k<2||k>20)throw new TypeError('Invalid answer plan');
    const random=rng(seed),counts=Array(k).fill(0),out=[];
    // Soft balancing: no fixed A/B/C/D quota. Only an excessive streak is excluded.
    while(out.length<total){
      const min=Math.min(...counts),weights=counts.map((n,i)=>{
        if(out.length>=3&&out.slice(-3).every(v=>v===i))return 0;
        let w=Math.exp(-0.48*(n-min));
        if(out.at(-1)===i)w*=0.72;
        for(const p of [2,3,4])if(out.length>=p*2-1&&out.slice(-(p*2-1)).concat(i).every((v,j,a)=>j<p||v===a[j-p]))w*=0.5;
        return w;
      });
      let ticket=random()*weights.reduce((a,b)=>a+b,0),chosen=weights.length-1;
      for(let i=0;i<weights.length;i++){ticket-=weights[i];if(ticket<0){chosen=i;break}}
      out.push(chosen);counts[chosen]++;
    }
    return out;
  }
  function remapExplanation(text,order){
    if(typeof text!=='string')return text;
    const letters=Object.fromEntries(order.map((old,i)=>[String.fromCharCode(65+old),String.fromCharCode(65+i)]));
    return text.replace(/(\b(?:option|choice|answer)\s*|選項\s*|答案\s*(?:為|是|：|:)?\s*)([A-T])\b|\(([A-T])\)/gi,(s,p,l,paren)=>{
      const key=(l||paren).toUpperCase();return letters[key]?(paren?`(${letters[key]})`:`${p}${letters[key]}`):s;
    });
  }
  function reorder(question,target,random){
    if(!question||!Array.isArray(question.options))throw new TypeError('Question options missing');
    const n=question.options.length,a=Number(question.answer);
    if(n<2||!Number.isInteger(a)||a<0||a>=n||!Number.isInteger(target)||target<0||target>=n)throw new TypeError('Invalid answer index');
    const order=shuffle([...Array(n).keys()].filter(i=>i!==a),random);order.splice(target,0,a);
    const baseIds=Array.isArray(question.optionIds)&&question.optionIds.length===n?question.optionIds:question.options.map((_,i)=>`${question.id||'option'}:${i}`);
    const q={...question,options:order.map(i=>question.options[i]),answer:target,optionIds:order.map(i=>baseIds[i]),optionOrder:order.map(i=>question.optionOrder?.[i]??i),answerBalanceVersion:VERSION};
    for(const key of ['explain','explanation','rationale'])if(key in q)q[key]=remapExplanation(q[key],order);
    return q;
  }
  function balanceAnswers(questions,seed=nonce(),targets=null){
    if(!Array.isArray(questions)||targets&&targets.length!==questions.length)throw new TypeError('Invalid questions or targets');
    const groups=new Map();questions.forEach((q,i)=>{if(!Array.isArray(q?.options))throw new TypeError('Missing options');const k=q.options.length;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i)});
    const result=[...questions];
    for(const [k,indices] of groups){const plan=targets?indices.map(i=>targets[i]):positions(indices.length,k,`${seed}|${k}`),random=rng(`${seed}|distractors|${k}`);indices.forEach((i,j)=>{result[i]=reorder(questions[i],plan[j],random)})}
    return result;
  }
  function histogram(qs){const out={};for(const q of qs){const k=q.options.length;out[k]??=Array(k).fill(0);out[k][q.answer]++}return out}
  function sampleIndices(size,count,seed){poolArgs(size,count);const random=rng(seed),out=[];while(out.length<count){const bag=shuffle([...Array(size).keys()],random);if(size>1&&bag[0]===out.at(-1))[bag[0],bag[1]]=[bag[1],bag[0]];out.push(...bag.slice(0,count-out.length))}return out}
  function drawPool(key,size,count){
    poolArgs(size,count);const storageKey='toeicSamplingPoolsV1';let all={};try{const value=JSON.parse(root.localStorage?.getItem(storageKey)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))all=value}catch{}
    let state=Object.prototype.hasOwnProperty.call(all,key)?all[key]:null;
    if(!state||state.size!==size||!Array.isArray(state.bag)||new Set(state.bag).size!==state.bag.length||!state.bag.every(i=>Number.isInteger(i)&&i>=0&&i<size))state={size,bag:[],last:null};
    const out=[];while(out.length<count){
      if(!state.bag.length){
        state.bag=shuffle([...Array(size).keys()],rng(nonce()));
        if(count<=size){const used=new Set(out);state.bag=[...state.bag.filter(i=>!used.has(i)),...state.bag.filter(i=>used.has(i))]}
        if(size>1&&state.bag[0]===state.last)[state.bag[0],state.bag[1]]=[state.bag[1],state.bag[0]];
      }
      const next=state.bag.shift();out.push(next);state.last=next;
    }
    Object.defineProperty(all,key,{value:state,enumerable:true,writable:true,configurable:true});try{root.localStorage?.setItem(storageKey,JSON.stringify(all))}catch{}
    return out;
  }
  root.ToeicRandomEngine={VERSION,hashSeed,rng,nonce,shuffle,positions,targetPositions:positions,balanceAnswers,histogram,sampleIndices,drawPool,longestRun:qs=>run(qs.map(q=>q.answer))};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.ToeicRandomEngine;
})(typeof window!=='undefined'?window:globalThis);

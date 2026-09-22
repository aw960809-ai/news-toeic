(() => {
  "use strict";
  const GENERATOR_VERSION="unified-syntax-v2";
  const HISTORY_KEY="toeicRecentSyntaxFamiliesV1";
  const clean=v=>String(v??"").replace(/\s+/g," ").trim();
  const load=(k,f)=>{try{const r=localStorage.getItem(k);return r?JSON.parse(r):f}catch{return f}};
  const saveLocal=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
  const lessonId=item=>`lesson-${String(item?.id||Date.now()).replace(/[^a-zA-Z0-9-]/g,"-")}`;
  const randFor=(item,suffix="")=>window.ToeicRandomEngine.rng(`${GENERATOR_VERSION}|${item?.id||item?.title||""}|${suffix}`);

  function titleAnchor(item){
    const title=clean(item?.title),source=clean(item?.source||"News source"),category=clean(item?.category||"Business");
    let m;
    if((m=title.match(/^(.+?)\s+drive(?:s)?\s+(?:a\s+)?rebound\s+in\s+(.+)$/i)))return `The headline points to a rebound in ${m[2]}, with ${m[1]} contributing to the change.`;
    if((m=title.match(/^(.+?)\s+expand(?:s|ed)?\s+(.+)$/i)))return `According to the headline, ${m[1]} is expanding ${m[2]}.`;
    if((m=title.match(/^(.+?)\s+add(?:s|ed)?\s+(.+)$/i)))return `The headline reports that ${m[1]} is adding ${m[2]}.`;
    if((m=title.match(/^(.+?)\s+launch(?:es|ed)?\s+(.+)$/i)))return `The headline describes ${m[1]}'s launch of ${m[2]}.`;
    if((m=title.match(/^(.+?)\s+(?:adjusts?|revises?|changes?)\s+(.+)$/i)))return `A recent headline describes how ${m[1]} is changing ${m[2]}.`;
    return `A recent ${category.toLowerCase()} headline from ${source} highlights this development: ${title}.`;
  }

  function profile(item){
    const category=clean(item?.category||"Business"),lower=clean(item?.title).toLowerCase();
    if(category==="Business"&&/retail|store|shopping|sales|department/.test(lower))return{
      actors:["retail managers","store teams","purchasing staff","customer-service teams"],
      metric:"store sales, online orders, and inventory levels",
      context:"physical stores and online channels",
      evidence:"several weeks of channel-level sales and customer-demand data",
      outcome:"inventory, staffing, delivery, and promotional plans",
      risk:"a short-term rebound may not become a lasting trend",
      customer:"shoppers"
    };
    if(category==="Travel")return{
      actors:["travel managers","reservation teams","front-desk staff","transportation teams"],
      metric:"booking levels, capacity, schedule changes, and passenger questions",
      context:"reservations and transportation services",
      evidence:"booking patterns, passenger feedback, and service-performance data",
      outcome:"staffing, route capacity, reservation rules, and service times",
      risk:"frequent schedule changes can confuse passengers",
      customer:"travelers"
    };
    if(category==="Technology")return{
      actors:["product managers","support teams","software teams","customer-success staff"],
      metric:"usage data, support requests, reliability, and user feedback",
      context:"digital products and online services",
      evidence:"usage trends, error reports, and customer feedback",
      outcome:"support capacity, rollout timing, and feature priorities",
      risk:"a rushed rollout can increase support requests",
      customer:"users"
    };
    if(category==="Daily Life")return{
      actors:["service managers","front-line staff","operations teams","customer-service employees"],
      metric:"service volume, availability, waiting times, and customer feedback",
      context:"everyday consumer services",
      evidence:"service-volume trends and customer feedback over several weeks",
      outcome:"staffing, schedules, procedures, and service capacity",
      risk:"customers may receive inconsistent information",
      customer:"customers"
    };
    return{
      actors:["business managers","sales teams","operations staff","service teams"],
      metric:"customer demand, operating capacity, costs, and service quality",
      context:"daily business operations",
      evidence:"several weeks of performance and customer-response data",
      outcome:"staffing, budgets, service levels, and operating plans",
      risk:"a temporary change can be mistaken for a long-term trend",
      customer:"customers"
    };
  }

  function frames(p){
    const [A,B,C,D]=p.actors;
    return[
      {id:"although",g:"contrast",grammar:["Although / Even though + clause","Although the early result is positive, managers still need more evidence."],text:`Although the early signals may look encouraging, ${A} still need to determine whether the pattern is broad enough to justify a permanent change.`},
      {id:"by-gerund",g:"method",grammar:["By + V-ing","By comparing several kinds of data, teams can identify the cause of a change."],text:`By comparing ${p.metric}, ${B} can see which parts of ${p.context} are actually driving the change.`},
      {id:"relative",g:"relative",grammar:["Relative clause: which / that","The figures, which can change quickly, should be reviewed together."],text:`The figures, which can change quickly when conditions shift, should be reviewed together rather than as separate signals.`},
      {id:"not-only",g:"emphasis",grammar:["Not only ... but also ...","Not only can demand increase orders, but it can also change staffing needs."],text:`Not only can the development affect ${p.metric}, but it can also change how ${C} plan their daily work.`},
      {id:"if",g:"condition",grammar:["If + present, may + V","If the pattern continues, the company may adjust its plan."],text:`If the same pattern continues for several weeks, ${A} may decide to adjust ${p.outcome}.`},
      {id:"rather-than",g:"comparison",grammar:["Rather than + V-ing","Rather than reacting immediately, managers should compare results over time."],text:`Rather than reacting to one short period, ${D} should examine ${p.evidence} before making a long-term decision.`},
      {id:"once",g:"time",grammar:["Once + present, result clause","Once the trend is clear, managers can choose the next step."],text:`Once the trend becomes clearer, ${A} can decide which parts of ${p.outcome} should be changed first.`},
      {id:"while",g:"contrast",grammar:["While + clause","While higher demand is encouraging, it can create pressure on operations."],text:`While the development may be encouraging, ${p.risk}, so ${B} should continue monitoring the results.`},
      {id:"what",g:"nounclause",grammar:["What + clause + be ...","What managers need to determine is whether the change will last."],text:`What ${A} need to determine is whether the development reflects a lasting shift or a temporary change.`},
      {id:"passive",g:"passive",grammar:["Passive voice: be + past participle","The plan should be reviewed before it is expanded."],text:`Any major adjustment should be supported by clear evidence before it is introduced across the whole organization.`},
      {id:"with",g:"participial",grammar:["With + noun + V-ing / adjective","With demand rising, managers may need to adjust staffing."],text:`With ${p.metric} moving at different rates, ${C} may need to coordinate decisions more carefully.`},
      {id:"present-perfect",g:"tense",grammar:["Present perfect","The company has seen stronger demand in several channels."],text:`Teams that have already seen the change in daily operations can provide useful evidence about what is working and what still causes difficulty.`},
      {id:"before",g:"time",grammar:["before + V-ing","Managers should review results before expanding a program."],text:`Before changing ${p.outcome}, ${A} should compare recent results with earlier performance.`},
      {id:"the-more",g:"comparison",grammar:["The more ..., the more ...","The more data managers collect, the more confidently they can plan."],text:`The more carefully ${B} compare the available evidence, the more confidently they can explain the next step to ${p.customer}.`},
      {id:"purpose",g:"purpose",grammar:["to / in order to + V","Teams collect feedback to understand customer needs."],text:`To reduce uncertainty, ${D} can collect feedback and compare it with operating data before recommending a wider change.`},
      {id:"whereas",g:"contrast",grammar:["whereas + clause","Online demand increased, whereas in-store activity remained stable."],text:`Some parts of ${p.context} may improve quickly, whereas others can remain stable or weaken during the same period.`},
      {id:"because",g:"cause",grammar:["because / because of","Managers delayed the decision because the data were incomplete."],text:`Because ${p.evidence} can reveal different parts of the situation, ${A} should avoid relying on a single indicator.`},
      {id:"so-that",g:"purpose",grammar:["so that + clause","Teams share data so that managers can make a consistent decision."],text:`${B} can share the same operating data so that every team understands why ${p.outcome} may need to change.`},
      {id:"therefore",g:"result",grammar:["therefore / as a result","Demand rose; therefore, the company increased capacity."],text:`A consistent pattern would give managers stronger evidence; therefore, changes to ${p.outcome} could be introduced with greater confidence.`},
      {id:"unless",g:"condition",grammar:["unless + clause","The company will not expand the plan unless demand remains strong."],text:`${A} should avoid a permanent adjustment unless ${p.evidence} continue to support the same conclusion.`}
    ];
  }

  function recent(){
    return load(HISTORY_KEY,[]).slice(-5).flatMap(x=>x.families||[]);
  }

  function selectFrames(item,count){
    const planKey='toeicArticlePlansV1',key=`${GENERATOR_VERSION}|${item.id||item.title}`;
    const plans=load(planKey,{}),pool=frames(profile(item));
    if(plans[key]){const restored=plans[key].map(id=>pool.find(f=>f.id===id)).filter(Boolean);if(restored.length===plans[key].length)return restored}
    const rand=randFor(item,'syntax'),history=recent(),counts=new Map();history.forEach(id=>counts.set(id,(counts.get(id)||0)+1));
    const chosen=[],usedGroups=new Set();
    while(chosen.length<count&&pool.length){
      const ranked=pool.map((f,i)=>({f,i,score:rand()*100-(counts.get(f.id)||0)*12-(usedGroups.has(f.g)?20:0)})).sort((a,b)=>b.score-a.score);
      const p=ranked[0];chosen.push(p.f);usedGroups.add(p.f.g);pool.splice(p.i,1);
    }
    const order={contrast:0,nounclause:0,tense:0,relative:1,method:1,emphasis:1,cause:1,participial:1,comparison:2,purpose:2,passive:2,time:3,condition:3,result:3};
    chosen.sort((a,b)=>(order[a.g]??2)-(order[b.g]??2));
    plans[key]=chosen.map(f=>f.id);const entries=Object.entries(plans).slice(-80);saveLocal(planKey,Object.fromEntries(entries));
    return chosen;
  }

  function sentenceCount(){
    try{
      const m=String(typeof appdeployTargetLength==='function'?appdeployTargetLength():targetWords()).match(/(\d{2,3})\D+(\d{2,3})/);
      if(!m)return 10;
      const mid=(+m[1]+ +m[2])/2;
      return mid>=500?14:mid>=375?12:mid>=275?10:8;
    }catch(_){return 10}
  }

  function buildPassage(item){
    const selected=selectFrames(item,sentenceCount());
    const a=Math.ceil(selected.length/3),b=Math.ceil(selected.length*2/3);
    const paragraphs=[
      [`This training scenario explores possible decisions in ${profile(item).context}. Its topic comes from the headline “${clean(item.title)}”. The decisions below are hypothetical, not additional facts from the source.`,...selected.slice(0,a).map(x=>x.text)].join(" "),
      selected.slice(a,b).map(x=>x.text).join(" "),
      selected.slice(b).map(x=>x.text).join(" ")
    ].filter(Boolean);
    const grammar=window.ToeicRandomEngine.shuffle(selected,randFor(item,"grammar")).slice(0,3).map(x=>[x.grammar[0],x.text]);
    return {text:paragraphs.join("\n\n"),selected,grammar};
  }

  function vocab(item){
    const c=clean(item?.category||"Business"),t=clean(item?.title).toLowerCase();
    if(c==="Business"&&/retail|store|shopping|sales/.test(t))return[
      ["rebound","回升；反彈","a rebound in sales"],["retail sales","零售銷售","retail sales data"],["online orders","線上訂單","review online orders"],["inventory","庫存","inventory levels"],["demand","需求","customer demand"],["replenishment","補貨","replenishment needs"],["availability","供貨情況；可得性","product availability"],["channel","銷售通路","online and store channels"],["staffing","人力配置","adjust staffing"],["trend","趨勢","a continuing trend"]
    ];
    return[
      ["demand","需求","customer demand"],["capacity","處理能力","operating capacity"],["staffing","人力配置","adjust staffing"],["performance","表現","review performance"],["workflow","工作流程","workflow problems"],["feedback","回饋","customer feedback"],["cost","成本","operating cost"],["benefit","效益","expected benefit"],["expand","擴大","expand a program"],["reliable","可靠的","reliable data"]
    ];
  }

  const VOCAB=[
    ['evidence','證據','information that supports a conclusion'],['pattern','規律；趨勢','a repeated or recognizable tendency'],['permanent','永久的','intended to last'],['temporary','暫時的','lasting only for a limited time'],['capacity','處理能力','the amount of work that can be handled'],['inventory','庫存','goods held for sale or use'],['reliability','可靠性','the ability to work consistently'],['feedback','回饋','comments about an experience'],['uncertainty','不確定性','a lack of certainty'],['indicator','指標','a measure that signals a condition'],['adjustment','調整','a change made to improve a fit'],['demand','需求','the desire for goods or services'],['coordinate','協調','organize activities to work together'],['monitoring','監測','checking something over time'],['confidence','信心','a feeling of trust'],['consistent','一致的','staying similar across situations'],['staffing','人力配置','the arrangement of workers'],['workflow','工作流程','the order in which tasks are carried out'],['reservation','預訂','an arrangement made in advance'],['rollout','推出','the introduction of a new service'],['rebound','回升','a recovery after a decline']
  ];
  function vocabFrom(text){
    return VOCAB.filter(v=>new RegExp(`\\b${v[0]}\\b`,'i').test(text)).slice(0,12).map(([word,meaning,definition])=>{
      const sentence=text.split(/(?<=[.!?])\s+/).find(s=>new RegExp(`\\b${word}\\b`,'i').test(s))||'';
      return {word,meaning,definition,collocation:word,example:sentence};
    });
  }
  function gapFor(text){
    const candidates=[
      ['Although',['Although','Despite','Because of','During'],'Although + complete clause'],
      ['By comparing',['By comparing','By compare','By compared','By comparison'],'by + gerund'],
      ['which can',['which can','whose can','whom can','which to'],'relative pronoun + finite verb'],
      ['Not only can',['Not only can','Not only to','Not only be','Not only does can'],'Not only + auxiliary + subject'],
      ['If the',['If the','Despite the','During the','Because of the'],'if + complete clause'],
      ['Rather than reacting',['Rather than reacting','Rather than reaction','Rather than reacted','Rather than reacts'],'parallel gerund structure'],
      ['With',['With','Despite of','Because that','Although that'],'with + noun + participle'],
      ['have already seen',['have already seen','have already saw','has already seen','having already see'],'present perfect with plural subject'],
      ['Before changing',['Before changing','Before changed','Before changes','Before change of'],'before + gerund'],
      ['more confidently',['more confidently','more confident','most confidently than','confidently more than'],'comparative adverb'],
      ['To reduce',['To reduce','To reduced','For reduce','To reduction'],'purpose infinitive'],
      ['should be supported',['should be supported','should been supported','should be support','should to be supported'],'modal passive: should be + participle'],
      ['whether',['whether','despite','during','because of'],'whether introduces an embedded question']
    ];
    for(const [part,options,rule] of candidates)if(text.includes(part))return {fragment:part,prompt:text.replace(part,'_____'),options,rule};
    return null;
  }
  function questions(item,built,vocabulary){
    const id=lessonId(item),out=[],E=window.ToeicRandomEngine;
    const add=(part,skill,prompt,options,evidence,explain,extra={})=>out.push({...q(`${id}-q${out.length+1}`,part,skill,prompt,options,0,explain),evidence,...extra});
    add('Part 7','Main Idea','What is the main purpose of this training passage?',[
      `To consider evidence-based decisions in ${profile(item).context}`,
      `To announce a completed change in ${profile(item).context}`,
      `To provide an official forecast for ${profile(item).context}`,
      `To describe a legally required procedure in ${profile(item).context}`
    ],built.text.split(/(?<=[.!?])\s+/)[0],'This is a training scenario about possible decisions, not a report of an action already taken.');
    const shuffled=E.shuffle(built.selected,randFor(item,'questions'));
    for(const f of shuffled.slice(0,3)){
      add('Part 7','Meaning / Evidence',`Which statement is supported by the sentence beginning “${f.text.split(' ').slice(0,5).join(' ')}…”?`,[
        f.text,
        'An isolated early result is sufficient to justify a permanent decision.',
        'The proposed decision has already been implemented at every location.',
        'Customer reactions make comparisons of operating data unnecessary.'
      ],f.text,'The correct statement is supported by the cited sentence. Read the sentence in its paragraph, not as a claim about the original news.');
    }
    const gaps=shuffled.map(f=>({f,g:gapFor(f.text)})).filter(x=>x.g);
    if(gaps.length<4)throw new Error('Not enough grounded language items; retry another lesson');
    gaps.slice(0,2).forEach(({f,g})=>add('Part 5',g.rule,g.prompt,g.options,f.text,g.rule));
    gaps.slice(2,4).forEach(({f,g})=>{
      const paragraph=built.text.split('\n\n').find(p=>p.includes(f.text));
      add('Part 6','Text completion',`Complete the blank in the excerpt below.`,g.options,f.text,g.rule,{displayText:paragraph.replace(g.fragment,'_____')});
    });
    const v=vocabulary.find(x=>x.definition);
    if(!v)throw new Error('No passage-grounded vocabulary');
    add('Part 7','Vocabulary in Context',`In the passage, what does “${v.word}” most nearly mean?`,[
      v.definition,'a rule that forbids a business activity','a written promise to employ someone','a charge paid in advance for a reservation'
    ],v.example,`${v.word}: ${v.definition}`);
    return E.balanceAnswers(out,`${GENERATOR_VERSION}|${id}`);
  }

  function build(item){
    const existing=generated().find(x=>x.id===lessonId(item));
    if(existing)return existing;
    const p=buildPassage(item);
    const lesson={id:lessonId(item),generatorVersion:GENERATOR_VERSION,syntaxProfile:p.selected.map(x=>x.id),origin:"generated",articleType:"Main Article",category:item?.category||"Business",source:item?.source||"News source",publishedAt:item?.publishedAt||now(),toeicScore:item?.toeicScore||75,title:item?.title||"TOEIC News Practice",url:item?.url||"",summary:item?.summary||"",text:p.text,vocabulary:vocabFrom(p.text),grammar:p.grammar,questions:questions(item,p,vocabFrom(p.text)),adaptationMode:"local-training-scenario",sourceHeadline:clean(item?.title),syntaxExamples:p.selected.map(f=>({id:f.id,title:f.grammar[0],text:f.text,group:f.g}))};
    const h=load(HISTORY_KEY,[]);h.push({articleId:lesson.id,families:lesson.syntaxProfile,savedAt:new Date().toISOString()});saveLocal(HISTORY_KEY,h.slice(-8));
    return lesson;
  }

  window.buildNewsLesson=build;
  try{buildNewsLesson=build}catch(_){}

})();

/* News × TOEIC v2.8.2 integrated Goal Manager policy. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ToeicIntegratedGoalPolicyV282=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='2.8.2';
  const DAILY_MOBILE_MAX=20;
  const UNITS=Object.freeze({ARTICLE:'article',REVIEW:'review',PRACTICE:'practice',MOCK:'mock'});

  function clampMobileMinutes(value){
    const n=Math.round(Number(value));
    if(!Number.isFinite(n)||n<1)return DAILY_MOBILE_MAX;
    return Math.min(DAILY_MOBILE_MAX,n);
  }

  function inferLearningUnit(title='',extra={}){
    const explicit=String(extra?.learningUnit||'').toLowerCase();
    if(Object.values(UNITS).includes(explicit))return explicit;
    const text=String(title||''),category=String(extra?.category||'');
    if(/模考|mock/i.test(text))return UNITS.MOCK;
    if(/複習|review|單字|vocab/i.test(text)||/vocabulary/i.test(category))return UNITS.REVIEW;
    if(Number(extra?.articlesCompleted||0)>0||String(extra?.articleId||''))return UNITS.ARTICLE;
    return UNITS.PRACTICE;
  }

  function makeReviewEvent({startedAt,endedAt,durationSeconds=0,title='錯題短時間複習'}={}){
    const seconds=Math.max(0,Number(durationSeconds)||0);
    const end=endedAt||new Date().toISOString();
    const start=startedAt||new Date(new Date(end).getTime()-seconds*1000).toISOString();
    return {
      schemaVersion:2,
      eventId:`toeic-review-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      source:'news-toeic',
      activity:'toeic-review-training',
      learningUnit:UNITS.REVIEW,
      goalKey:'foreign-language-preparation',
      goalLabels:['語言能力準備'],
      channelId:(typeof localStorage!=='undefined'&&localStorage.getItem('goalSyncChannel'))||'github-direct',
      startedAt:start,endedAt:end,
      durationSeconds:seconds,durationMinutes:seconds/60,
      articleId:'',articleTitle:title,category:'Review',
      articlesCompleted:0,questionsAnswered:0,correctAnswers:0,accuracy:0,readingWpm:0,wrongSkills:[]
    };
  }

  return Object.freeze({VERSION,DAILY_MOBILE_MAX,UNITS,clampMobileMinutes,inferLearningUnit,makeReviewEvent});
});

(() => {
  "use strict";

  const GENERATOR_VERSION = "headline-anchor-v2";

  const clean = value => String(value ?? "").replace(/\s+/g," ").trim();

  function lessonId(item){
    return `lesson-${String(item?.id || Date.now()).replace(/[^a-zA-Z0-9-]/g,"-")}`;
  }

  function titleAnchor(item){
    const title=clean(item?.title||"");
    const source=clean(item?.source||"News source");
    const category=clean(item?.category||"Business");

    let sentence="";
    let m=title.match(/^(.+?)\s+drive(?:s)?\s+(?:a\s+)?rebound\s+in\s+(.+)$/i);
    if(m){
      sentence=`The headline points to a rebound in ${m[2]}, with ${m[1]} contributing to the change.`;
    }else if((m=title.match(/^(.+?)\s+expand(?:s|ed)?\s+(.+)$/i))){
      sentence=`The headline reports that ${m[1]} is expanding ${m[2]}.`;
    }else if((m=title.match(/^(.+?)\s+add(?:s|ed)?\s+(.+)$/i))){
      sentence=`The headline reports that ${m[1]} is adding ${m[2]}.`;
    }else if((m=title.match(/^(.+?)\s+launch(?:es|ed)?\s+(.+)$/i))){
      sentence=`The headline reports that ${m[1]} is launching ${m[2]}.`;
    }else if((m=title.match(/^(.+?)\s+(?:adjusts?|revises?|changes?)\s+(.+)$/i))){
      sentence=`The headline describes a change involving ${m[2]} by ${m[1]}.`;
    }else if((m=title.match(/^(.+?)\s+open(?:s|ed)?\s+(.+)$/i))){
      sentence=`The headline reports that ${m[1]} is opening ${m[2]}.`;
    }else{
      sentence=`A recent ${category.toLowerCase()} headline from ${source} describes a current development: ${title}.`;
    }
    return sentence;
  }

  function categoryBody(category,title){
    const lower=title.toLowerCase();

    if(category==="Business"){
      const retail=/retail|store|shopping|sales|department/.test(lower);
      if(retail){
        return [
          `For a retail business, a change in sales activity can affect several parts of daily operations at the same time. Managers may compare store sales with online orders, review inventory levels, and watch whether customer demand is concentrated in particular products or channels.`,
          `If demand strengthens across both physical and online channels, teams may need to coordinate stock more carefully. Purchasing staff can review replenishment needs, while customer-service and delivery teams monitor questions about availability, pickup, and shipping.`,
          `Managers should also avoid making a long-term decision from a short-term change alone. They can compare results over several weeks, check whether the pattern continues, and then decide whether staffing, inventory, or promotional plans should be adjusted.`
        ];
      }
      return [
        `For a business, a change reported in the market often requires managers to compare recent performance with earlier results. They may review customer demand, operating capacity, staffing, and service quality before changing a plan.`,
        `Different teams usually need to share the same information. Sales staff can report customer reactions, operations staff can monitor workflow problems, and managers can compare costs with the expected benefit of the change.`,
        `Before expanding or reducing a program, the company should review several weeks of results. A gradual decision based on clear data is usually more reliable than reacting to one short period.`
      ];
    }

    if(category==="Travel"){
      return [
        `For a travel business, changes in schedules, routes, reservations, or passenger demand can quickly affect daily operations. Staff may need to review booking levels, available capacity, and customer questions before adjusting service.`,
        `Clear communication is especially important when times or locations change. Reservation teams, front-desk staff, and transportation employees need consistent information so customers receive the same instructions.`,
        `Managers can compare demand over several weeks before making a permanent change. If the pattern continues, they may adjust staffing, capacity, or service times.`
      ];
    }

    if(category==="Technology"){
      return [
        `For a technology provider, a new product, feature, or service change usually requires both technical preparation and customer communication. Teams may review usage data, support requests, and user feedback before making a wider rollout.`,
        `Employees should test important functions and prepare clear instructions for customers. Support teams can record common questions, while product teams monitor whether users experience delays or confusion.`,
        `Managers can compare the results of the first stage with earlier performance. If the change improves reliability or customer experience, the company may expand it gradually.`
      ];
    }

    return [
      `For a consumer service, changes in demand or daily operations can affect staffing, availability, and customer communication. Managers may review service volume and customer feedback before changing schedules or procedures.`,
      `Employees should receive clear instructions so customers get consistent information. Teams can also monitor common questions and report problems that appear during the first stage of a change.`,
      `Managers can review the results after several weeks. If service quality remains stable and demand continues, the organization may decide to expand the change.`
    ];
  }

  function buildPassage(item){
    const anchor=titleAnchor(item);
    const body=categoryBody(clean(item?.category||"Business"),clean(item?.title||""));
    return [anchor,...body].join("\n\n");
  }

  function vocabularyFor(item){
    const title=clean(item?.title||"").toLowerCase();
    const category=clean(item?.category||"Business");

    if(category==="Business" && /retail|store|shopping|sales/.test(title)){
      return [
        ["rebound","回升；反彈","a rebound in sales"],
        ["retail sales","零售銷售","retail sales data"],
        ["online orders","線上訂單","review online orders"],
        ["inventory","庫存","inventory levels"],
        ["demand","需求","customer demand"],
        ["replenishment","補貨","replenishment needs"],
        ["availability","供貨情況；可得性","product availability"],
        ["channel","銷售通路","online and store channels"],
        ["staffing","人力配置","adjust staffing"],
        ["trend","趨勢","a continuing trend"]
      ];
    }

    const generic={
      Business:[
        ["demand","需求","customer demand"],["capacity","產能；處理能力","operating capacity"],
        ["staffing","人力配置","adjust staffing"],["performance","表現","review performance"],
        ["workflow","工作流程","workflow problems"],["feedback","回饋","customer feedback"],
        ["cost","成本","operating cost"],["benefit","效益","expected benefit"],
        ["expand","擴大","expand a program"],["reliable","可靠的","reliable data"]
      ],
      Travel:[
        ["reservation","預訂","confirm a reservation"],["capacity","運能；容量","available capacity"],
        ["schedule","時刻表；行程","adjust a schedule"],["passenger","乘客","passenger demand"],
        ["route","路線","change a route"],["availability","可用性","seat availability"],
        ["instruction","指示","clear instructions"],["consistent","一致的","consistent information"],
        ["staffing","人力配置","adjust staffing"],["permanent","永久的","a permanent change"]
      ],
      Technology:[
        ["rollout","推出；部署","a wider rollout"],["usage data","使用資料","review usage data"],
        ["support request","支援請求","support requests"],["reliability","可靠性","improve reliability"],
        ["feature","功能","a new feature"],["feedback","回饋","user feedback"],
        ["function","功能","test a function"],["instruction","說明","clear instructions"],
        ["gradually","逐步地","expand gradually"],["experience","使用體驗","customer experience"]
      ],
      "Daily Life":[
        ["service volume","服務量","monitor service volume"],["procedure","程序","change a procedure"],
        ["availability","可用性","service availability"],["demand","需求","customer demand"],
        ["feedback","回饋","customer feedback"],["consistent","一致的","consistent information"],
        ["monitor","監測","monitor questions"],["report","回報","report a problem"],
        ["stable","穩定的","remain stable"],["expand","擴大","expand the change"]
      ]
    };
    return generic[category]||generic.Business;
  }

  function grammarPoints(){
    return [
      ["may need to + V","Teams may need to coordinate stock more carefully."],
      ["before + V-ing","Managers should review several weeks of results before making a long-term decision."],
      ["If + present, may + V","If the pattern continues, the company may adjust its plans."]
    ];
  }

  function questionsFor(item,text){
    const id=lessonId(item);
    const category=clean(item?.category||"Business");
    const businessRetail=category==="Business" && /retail|store|shopping|sales|department/i.test(clean(item?.title||""));

    if(businessRetail){
      return [
        q(`${id}-q1`,"Part 7","Main Idea","What is the practice passage mainly about?",[
          "How a retailer could respond to changing sales activity",
          "Why all physical stores should close immediately",
          "How to design a hotel reservation system",
          "Why online shopping should be prohibited"
        ],0,"The passage explains how a retailer could evaluate and respond to changing sales activity."),
        q(`${id}-q2`,"Part 7","Detail","What may managers compare?",[
          "Store sales and online orders",
          "Employee passport numbers",
          "Hotel room keys",
          "Airline boarding passes"
        ],0,"The passage says managers may compare store sales with online orders."),
        q(`${id}-q3`,"Part 7","Detail","Which team may review replenishment needs?",[
          "Purchasing staff",
          "Hotel guests",
          "Airport security",
          "Restaurant customers"
        ],0,"Purchasing staff may review replenishment needs."),
        q(`${id}-q4`,"Part 7","Inference","Why should managers review results over several weeks?",[
          "To see whether the pattern continues",
          "To avoid collecting any sales data",
          "To close every sales channel",
          "To replace all employees"
        ],0,"The passage recommends confirming whether the change is sustained before making a long-term decision."),
        q(`${id}-q5`,"Part 7","Vocabulary in Context","The word “replenishment” is closest in meaning to:",[
          "restocking",
          "advertising",
          "cancelling",
          "interviewing"
        ],0,"Replenishment means supplying stock again."),
        q(`${id}-q6`,"Part 5","Grammar","Teams may need _____ stock more carefully.",[
          "coordinate","to coordinate","coordinated","coordinating"
        ],1,"need to + base verb."),
        q(`${id}-q7`,"Part 5","Grammar","Managers should review the data before _____ a long-term decision.",[
          "make","made","making","makes"
        ],2,"before can be followed by a gerund."),
        q(`${id}-q8`,"Part 6","Discourse Coherence","Which sentence best fits the passage?",[
          "Managers should confirm whether the change continues before making a permanent adjustment.",
          "All retail data should be ignored.",
          "Every customer must shop in the same way.",
          "Stores should stop checking inventory."
        ],0,"The passage emphasizes reviewing the trend before a long-term decision."),
        q(`${id}-q9`,"Part 6","Connector","The company may see stronger demand. _____, managers should still confirm that the trend continues.",[
          "However","For example","Meanwhile","Therefore"
        ],0,"However correctly introduces a contrast between stronger demand and the need for caution.")
      ];
    }

    return [
      q(`${id}-q1`,"Part 7","Main Idea","What is the main purpose of the practice passage?",[
        "To explain how an organization could respond to a current development",
        "To reproduce the full original news article",
        "To advertise a specific product",
        "To list employee names"
      ],0,"The passage uses the headline as a starting point and focuses on a realistic workplace response."),
      q(`${id}-q2`,"Part 7","Detail","What should managers review before making a long-term change?",[
        "Several weeks of results",
        "Only one customer comment",
        "An unrelated travel schedule",
        "A list of employee birthdays"
      ],0,"The passage recommends reviewing results over time."),
      q(`${id}-q3`,"Part 7","Inference","Why is consistent information important?",[
        "It helps different teams give customers the same guidance",
        "It removes the need for any planning",
        "It guarantees demand will increase",
        "It replaces all training"
      ],0,"Consistent information helps teams communicate clearly."),
      q(`${id}-q4`,"Part 7","Reason","Why might an organization expand a change gradually?",[
        "To confirm that the results remain positive",
        "To avoid collecting data",
        "To stop communicating with customers",
        "To remove every employee"
      ],0,"The passage recommends evaluating the results before wider expansion."),
      q(`${id}-q5`,"Part 7","Vocabulary in Context","The word “capacity” is closest in meaning to:",[
        "ability to handle work or demand",
        "advertising slogan",
        "meeting invitation",
        "travel document"
      ],0,"Capacity means the amount of work or demand a system can handle."),
      q(`${id}-q6`,"Part 5","Grammar","Managers may need _____ the plan after reviewing the data.",[
        "adjust","to adjust","adjusted","adjusting"
      ],1,"need to + base verb."),
      q(`${id}-q7`,"Part 5","Grammar","The team will review the results before _____ the program.",[
        "expand","expanded","expanding","expands"
      ],2,"before can be followed by a gerund."),
      q(`${id}-q8`,"Part 6","Discourse Coherence","Which sentence best matches the passage?",[
        "Managers should use clear data before making a permanent decision.",
        "Every service change should be permanent immediately.",
        "Customer feedback is never useful.",
        "Different teams should avoid sharing information."
      ],0,"The passage repeatedly emphasizes data-based decisions."),
      q(`${id}-q9`,"Part 6","Connector","The first results may be positive. _____, managers should continue monitoring the change.",[
        "However","Because","For instance","In addition to"
      ],0,"However shows that positive early results do not remove the need for continued monitoring.")
    ];
  }

  function buildHeadlineLesson(item){
    const text=buildPassage(item);
    const id=lessonId(item);
    return {
      id,
      generatorVersion:GENERATOR_VERSION,
      origin:"generated",
      articleType:"Main Article",
      category:item?.category||"Business",
      source:item?.source||"News source",
      publishedAt:item?.publishedAt||now(),
      toeicScore:item?.toeicScore||75,
      title:item?.title||"TOEIC News Practice",
      url:item?.url||"",
      summary:item?.summary||"",
      text,
      vocabulary:vocabularyFor(item),
      grammar:grammarPoints(),
      questions:questionsFor(item,text)
    };
  }

  window.buildNewsLesson = buildHeadlineLesson;
  try{ buildNewsLesson = buildHeadlineLesson; }catch(_){}

  function sourceForLesson(lesson){
    if(!lesson?.id)return null;
    return news.find(item => lessonId(item)===lesson.id) || null;
  }

  function refreshLegacyLessonIfSafe(lesson){
    if(!lesson || lesson.generatorVersion===GENERATOR_VERSION) return lesson;
    if(!String(lesson.id||"").startsWith("lesson-")) return lesson;
    if(sessions().some(s=>s.articleId===lesson.id)) return lesson;

    const source=sourceForLesson(lesson);
    if(!source)return lesson;

    const rebuilt=buildHeadlineLesson(source);
    const rows=generated().filter(x=>x.id!==rebuilt.id);
    rows.push(rebuilt);
    save(KEYS.generated,rows.slice(-60));

    const daily=load(KEYS.daily,null);
    if(daily?.articleId===rebuilt.id)save(KEYS.daily,{...daily,articleId:rebuilt.id});
    return rebuilt;
  }

  const previousOpenLesson = openLesson;
  openLesson = function(id){
    const current=allLessons().find(x=>x.id===id);
    const updated=refreshLegacyLessonIfSafe(current);
    if(updated && updated!==current){
      toast("已重新建立較自然的新聞教材");
    }
    return previousOpenLesson(updated?.id||id);
  };

  window.toeicRebuildCurrentGeneratedLesson = function(){
    if(!activeLesson)return false;
    const source=sourceForLesson(activeLesson);
    if(!source)return false;
    if(sessions().some(s=>s.articleId===activeLesson.id)){
      toast("已完成教材不自動改寫，以保留歷史紀錄");
      return false;
    }
    const rebuilt=buildHeadlineLesson(source);
    const rows=generated().filter(x=>x.id!==rebuilt.id);
    rows.push(rebuilt);save(KEYS.generated,rows.slice(-60));
    activeLesson=rebuilt;
    toast("教材已依新聞標題重新建立");
    return true;
  };
})();
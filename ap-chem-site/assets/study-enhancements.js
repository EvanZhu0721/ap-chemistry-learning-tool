(() => {
  'use strict';
  const assets = new URL('.', document.currentScript.src);
  const content = window.AP_STUDY;
  if (!content) return;
  const $ = id => document.getElementById(id);
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode still works */ } };
  let language = read('apchem.language', 'zh');
  if (!['zh','en'].includes(language)) language = 'zh';
  const t = (en, zh) => language === 'en' ? en : zh;
  const text = value => value[language];
  const el = (tag, cls, value) => { const n = document.createElement(tag); if (cls) n.className = cls; if (value !== undefined) n.textContent = value; return n; };
  const button = (en, zh, action, cls = 'btn') => { const n = el('button', cls, t(en,zh)); n.type = 'button'; n.addEventListener('click',action); return n; };
  const bilingual = (en,zh) => ({en,zh});
  const lessons=window.AP_LESSONS || {};
  const glossary=window.AP_LECTURE_GLOSSARY;
  const escapeRE=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const termPattern=glossary ? new RegExp('\\b(?:'+glossary.entries.map(([term])=>escapeRE(term)).sort((a,b)=>b.length-a.length).join('|')+')(?:s)?\\b','gi') : null;
  function emphasise(root) {
    if(language!=='en'||!termPattern)return;
    root.querySelectorAll('.study-card p,.study-card li').forEach(block=>{
      const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);const nodes=[];
      while(walker.nextNode())if(!walker.currentNode.parentElement.closest('.katex,strong,button'))nodes.push(walker.currentNode);
      let count=0;const seen=new Set();
      for(const node of nodes){
        termPattern.lastIndex=0;const raw=node.nodeValue;const fragment=document.createDocumentFragment();let offset=0,match;
        while((match=termPattern.exec(raw))&&count<3){
          const result=glossary.lookup(match[0]);if(!result||seen.has(result.key))continue;
          fragment.append(document.createTextNode(raw.slice(offset,match.index)));
          const term=el('strong','study-term',match[0]);term.dataset.term=match[0];term.tabIndex=0;term.setAttribute('role','button');term.title='查看中文释义 / Chinese meaning';
          fragment.append(term);offset=match.index+match[0].length;count++;seen.add(result.key);
        }
        if(offset){fragment.append(document.createTextNode(raw.slice(offset)));node.replaceWith(fragment);}
      }
    });
  }
  let wordPopup=null;
  function hideWord(){wordPopup?.remove();wordPopup=null;}
  function lookupWord(raw){return glossary?.lookup(raw)||window.__vocab?.lookup(raw)||null;}
  function showWord(raw,anchor,scope){
    hideWord();const result=lookupWord(raw);
    const popup=el('aside','study-word-popup study-owned');wordPopup=popup;
    popup.setAttribute('role','region');popup.setAttribute('aria-label',t('Chinese word meaning','英文词语中文释义'));
    popup.append(el('strong','study-word-title',raw));
    const close=button('Close','关闭',hideWord,'study-word-close');close.setAttribute('aria-label',t('Close definition','关闭释义'));popup.append(close);
    const meaning=el('p','',result?result.e[1]:t('No local definition found. Try the base form of a single word.','本地词典暂未收录。可以尝试单词原形。'));
    meaning.lang='zh-CN';meaning.setAttribute('role','status');popup.append(meaning);
    if(result){
      const add=button('Save to vocabulary','加入生词本',()=>{
        const entry=window.__vocab?.addEntry?.(result.key,result.e);
        add.textContent=entry?t('Saved ✓','已加入 ✓'):t('Could not save','暂时无法保存');add.disabled=!!entry;
      });popup.append(add);
    }
    // A native modal makes the page behind it inert. Keep the glossary in its top layer.
    const modal=scope.closest('dialog[open]');
    const bounds=modal?.getBoundingClientRect();
    const left=bounds?bounds.left+modal.clientLeft:0;
    const top=bounds?bounds.top+modal.clientTop:0;
    const right=Math.min(document.documentElement.clientWidth,bounds?left+modal.clientWidth:innerWidth);
    const bottom=Math.min(innerHeight,bounds?top+modal.clientHeight:innerHeight);
    popup.style.maxWidth=Math.max(0,right-left-16)+'px';
    popup.style.maxHeight=Math.max(0,bottom-top-16)+'px';
    (modal||document.body).append(popup);
    const box=popup.getBoundingClientRect(),gap=9;
    popup.style.left=Math.max(left+8,Math.min(anchor.left,right-box.width-8))+'px';
    popup.style.top=Math.max(top+8,Math.min(anchor.bottom+gap,bottom-box.height-8))+'px';
  }
  function inspectSelection(){
    const selection=window.getSelection();if(!selection||selection.isCollapsed||selection.rangeCount!==1)return;
    const raw=selection.toString().trim();if(!/^[A-Za-z]+(?:['’\-][A-Za-z]+)*(?:\s+[A-Za-z]+(?:['’\-][A-Za-z]+)*){0,4}$/.test(raw)||raw.length>70)return;
    const range=selection.getRangeAt(0),node=range.commonAncestorContainer;
    const parent=node.nodeType===1?node:node.parentElement;
    const scope=parent?.closest('.study-card');if(!scope||parent.closest('.katex,button,input,textarea,.study-word-popup'))return;
    if(!scope.contains(range.startContainer)||!scope.contains(range.endContainer))return;
    showWord(raw,range.getBoundingClientRect(),scope);
  }
  let selectTimer;
  document.addEventListener('selectionchange',()=>{
    clearTimeout(selectTimer);selectTimer=setTimeout(inspectSelection,250);
  });
  document.addEventListener('pointerup',event=>{if(!event.target.closest('.study-word-popup')){clearTimeout(selectTimer);selectTimer=setTimeout(inspectSelection,30);}});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.study-word-popup'))hideWord();});
  document.addEventListener('click',event=>{const term=event.target.closest('.study-term');if(term&&window.getSelection()?.isCollapsed)showWord(term.dataset.term,term.getBoundingClientRect(),term.closest('.study-card'));});
  document.addEventListener('keydown',event=>{
    const term=event.target.closest('.study-term');
    if(term&&['Enter',' '].includes(event.key)){event.preventDefault();showWord(term.dataset.term,term.getBoundingClientRect(),term.closest('.study-card'));}
    if(event.key==='Escape'&&wordPopup){event.preventDefault();event.stopPropagation();hideWord();}
  },true);
  document.addEventListener('scroll',event=>{if(wordPopup&&!wordPopup.contains(event.target))hideWord();},true);
  window.addEventListener('resize',hideWord);
  function readingHint(){return el('p','study-lookup-hint',t('Bold terms are key concepts. Select an English word or short term to see its Chinese meaning; click a bold term or focus it and press Enter.','粗体标出英文重点词。选中英文单词或短语可查中文；也可点击重点词，或用 Tab 聚焦后按 Enter。'));}
  const UI = new Map(Object.entries({
    'AP Chemistry 学习工具':'AP Chemistry Learning Tool',
    '首页':'Home','学习':'Learn','题库':'Question bank','错题本':'Review','生词本':'Vocabulary','设置':'Settings',
    '进入 →':'Open →','公式表':'Formula sheet','查缺补漏':'Knowledge check','大纲':'Outline','翻译':'Dictionary','刷新':'Reload',
    '← 返回首页':'← Home','登录 / 注册':'Sign in / Register','← 返回单元列表':'← All units',
    '9 个单元':'9 units','按小节归类':'Organised by topic','一键练习':'Quick practice','按范围选':'Choose topics','自选题量':'Choose question count',
    '中英双语解析':'Bilingual explanations','自动记录':'Automatic history','三态分类':'Track progress','一键订正':'Retry mistakes','单词列表':'Word list','背诵模式':'Recall practice','自动收录':'Save new words',
    '原子结构与性质':'Atomic Structure and Properties','分子与离子化合物结构与性质':'Molecular and Ionic Compound Structure',
    '分子间作用力与性质':'Intermolecular Forces and Properties','化学反应':'Chemical Reactions','化学动力学':'Kinetics','热力学':'Thermochemistry',
    '化学平衡':'Equilibrium','酸和碱':'Acids and Bases','热力学应用与电化学':'Thermodynamics and Electrochemistry',
    '摩尔与摩尔质量':'Moles and molar mass','质谱与同位素':'Mass spectra and isotopes','元素组成与化学式':'Composition and formulas',
    '混合物与限量反应':'Mixtures and limiting reactants','原子结构':'Atomic structure','电子排布':'Electron configurations','量子数':'Quantum numbers',
    'PES 能谱':'Photoelectron spectroscopy','周期趋势':'Periodic trends','价电子与离子化合物':'Valence electrons and ionic formulas',
    '第一步 · 选择题型':'Step 1 · Question types','第二步 · 选择范围':'Step 2 · Topics','第三步 · 选择题目数量':'Step 3 · Question count',
    '全选':'Select all','清空':'Clear','取全部':'Use all','开始做题':'Start practice','选择题 · 单选，自动判分':'Multiple choice · auto-graded',
    '解答题 · 含评分要点，自评':'Free response · self-assessment','全选本单元':'Select this unit','点击展开':'Expand',
    '学习 · Course Map':'Learn · Course Map',
    'AP Chemistry 全部 9 个单元。点击任意卡片进入该单元的教学空间。':'All nine AP Chemistry units. Select a card to open its learning space.',
    '从原子内部的电子排布，读懂元素性质的周期规律。':'Use electron structure to explain periodic patterns in element properties.',
    '从化学键到分子形状，理解物质为什么长这样。':'Connect bonding and molecular shape to the structure of matter.',
    '分子间作用力、理想气体、溶液与光谱。':'Explore intermolecular forces, ideal gases, solutions, and spectroscopy.',
    '化学方程式的读法与写法：净离子方程式、计量与反应类型。':'Read and write chemical equations; connect stoichiometry to reaction types.',
    '反应快慢的定量描述：速率定律、反应级数与反应机理。':'Describe reaction speed using rate laws, orders, and mechanisms.',
    '反应的能量账：吸热放热、量热法、键焓与盖斯定律。':'Track reaction energy with calorimetry, bond enthalpy, and Hess’s law.',
    '可逆反应的动态平衡：K 与 Q、勒夏特列原理与溶解平衡。':'Analyse dynamic equilibrium using K, Q, Le Châtelier’s principle, and solubility.',
    '酸与碱的定量世界：pH、弱酸平衡、滴定与缓冲溶液。':'Calculate pH, weak-acid equilibria, titration behaviour, and buffer responses.',
    '熵与吉布斯自由能如何决定反应方向，以及电化学。':'Use entropy and Gibbs free energy to understand reaction direction and electrochemistry.',
    '化学键':'Chemical bonds','分子几何':'Molecular geometry','路易斯结构':'Lewis structures','分子间作用力':'Intermolecular forces',
    '理想气体定律':'Ideal gas law','溶液与浓度':'Solutions and concentration','光谱':'Spectroscopy','净离子方程式':'Net ionic equations',
    '化学计量':'Stoichiometry','酸碱反应':'Acid–base reactions','氧化还原':'Redox','速率定律':'Rate laws','反应级数':'Reaction orders',
    '半衰期':'Half-life','反应机理':'Mechanisms','吸热与放热':'Endothermic and exothermic','量热法':'Calorimetry','键焓':'Bond enthalpy','盖斯定律':'Hess’s law',
    '平衡常数 K':'Equilibrium constant K','反应商 Q':'Reaction quotient Q','勒夏特列原理':'Le Châtelier’s principle','溶解平衡':'Solubility equilibria',
    'pH 与 pOH':'pH and pOH','弱酸弱碱':'Weak acids and bases','酸碱滴定':'Acid–base titrations','缓冲溶液':'Buffers','熵':'Entropy','吉布斯自由能':'Gibbs free energy',
    '原电池':'Galvanic cells','电解与法拉第定律':'Electrolysis and Faraday’s law',
    'MCQ 与 FRQ 可以':'MCQ and FRQ can be','同时选择':'selected together',
    '。范围右侧的题量会随题型筛选实时变化。':'. Question counts update with your type selection.',
    '勾选要练习的小节，右侧数字是该范围内的题目总数。':'Select topics to practise. The number on the right is the available question count.',
    '上限就是当前所选范围内的全部题目。':'The limit is the total number of questions in the selected topics.',
    '题目总数':'Questions','已完成':'Completed','进度':'Progress','← 上一道':'← Previous','下一道 →':'Next →',
    'Course Map —— 全部 9 个单元的内容地图，按 AP 官方小节归类，一键进入学习页或练习。':'Explore nine units, with bilingual chapter guides, worked examples, and interactive labs.',
    'Question Bank —— 所有 PDF 题目按小节归好档。先选范围（如 U2.7 分子几何），再选题量，随时开练。':'Choose topics and question counts, or open the imported book practice bank.',
    'Review Book —— 只收录做错的题，分「待订正 / 已订正」两部分，一键重做全部待订正。':'Revisit mistakes and track corrections in the existing question bank.',
    'Vocabulary Book —— 用「翻译」查过的单词会自动收录，集中查看中文释义与知识点，还能进入背诵模式自测。':'Look up chemistry words, save their Chinese meanings, and practise recall.'
  }));
  const unitTitles = [...UI.entries()].filter(([zh])=>['原子结构与性质','分子与离子化合物结构与性质','分子间作用力与性质','化学反应','化学动力学','热力学','化学平衡','酸和碱','热力学应用与电化学'].includes(zh)).sort((a,b)=>b[0].length-a[0].length);
  const originals = new WeakMap();
  function translate(root) {
    const walk = document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walk.nextNode())) {
      if (node.parentElement?.closest('script,style,.katex,.study-owned,.legacy-lab,.book-html')) continue;
      const current = node.nodeValue;
      let original = originals.get(node);
      if (original === undefined) { original = current; originals.set(node, original); }
      const key = original.trim();
      let value = language === 'en' && UI.has(key) ? original.replace(key,UI.get(key)) : original;
      if(language==='en'){
        if(/^Unit \d+/.test(key))for(const [zh,en] of unitTitles)value=value.replace(zh,en);
        value=value.replace(/(\d+) 章/g,'$1 topics').replace(/(\d+) 题/g,'$1 questions').replace(/(\d+) 个小节/g,'$1 topics').replace(/(\d+) 道配套题/g,'$1 practice questions').replace(/^首页\s*\//,'Home /');
      }
      if (node.nodeValue !== value) node.nodeValue = value;
    }
  }
  function renderMath(root) {
    if (!window.katex) return;
    root.querySelectorAll('[data-tex]').forEach(n => {
      if (n.dataset.rendered === n.dataset.tex) return;
      try {
        katex.render(n.dataset.tex,n,{displayMode:true,throwOnError:false,trust:false,strict:'warn',output:'htmlAndMathml'});
        n.dataset.rendered = n.dataset.tex;
      } catch { n.textContent = n.dataset.tex; }
    });
    if (window.renderMathInElement) renderMathInElement(root,{
      delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false}],
      throwOnError:false,trust:false,ignoredClasses:['katex','no-math'],
      ignoredTags:['script','noscript','style','textarea','pre','code','option']
    });
  }
  window.AP_renderMath = renderMath;
  function formula(tex) { const f = el('div','study-equation',tex); f.dataset.tex = tex; return f; }
  function chapterCard(c, compact = false) {
    const card = el('article','study-card study-owned');
    card.lang=language==='en'?'en':'zh-CN';
    card.append(el('div','study-eyebrow',t('CHAPTER','第')+' '+c.id+(language === 'zh' ? ' 章' : '')),
      el('h2','',text(c.title)),el('p','study-core',text(c.core)));
    const block = (en,zh,value) => { const n=el('section','study-block'); n.append(el('h3','',t(en,zh)),el('p','',text(value))); return n; };
    card.append(readingHint());
    const lesson=lessons[c.id];
    if(lesson){
      const roadmap=el('section','study-roadmap');
      roadmap.append(block('Before you start','开始前需要什么',lesson.before),block('What you will learn','学完要会什么',lesson.goals));card.append(roadmap);
      lesson.sections.forEach(section=>{
        const n=el('section','study-teaching');n.append(el('h3','',text(section.title)));
        section.paragraphs.forEach(p=>n.append(el('p','',text(p))));if(section.tex)n.append(formula(section.tex));if(section.note)n.append(el('p','study-symbol-note',text(section.note)));card.append(n);
      });
    }
    const review=el('details','study-recap');review.append(el('summary','',t('Recap: main reasoning and formula','回顾：核心思路与公式')),
      block('Why it works','为什么',c.why),formula(c.formula),block('Symbols, units, and conditions','符号、单位与适用条件',c.symbols));card.append(review);
    const example = el('section','study-example');
    example.append(el('h3','',t('Worked example 1 · follow the reasoning','例题 1 · 跟着思路做')),el('p','',text(c.example)));
    const list = el('ol'); c.steps.forEach(s=>list.append(el('li','',text(s)))); example.append(list); card.append(example);
    if(lesson){
      const extra=el('section','study-example');extra.append(el('h3','',t('Worked example 2 · apply the concept','例题 2 · 应用概念')),el('p','',text(lesson.extra.prompt)));
      const steps=el('ol');lesson.extra.steps.forEach(step=>steps.append(el('li','',text(step))));extra.append(steps);if(lesson.extra.tex)extra.append(formula(lesson.extra.tex));card.append(extra);
      const checks=el('section','study-checks');checks.append(el('h3','',t('Try it yourself before revealing the answer','先独立尝试，再展开答案')));
      lesson.checks.forEach((check,i)=>{const item=el('div','study-check');item.append(el('p','',`${i+1}. ${text(check.question)}`));
        const answer=el('details');answer.append(el('summary','',t('Show answer and reasoning','查看答案与理由')),el('p','',text(check.answer)));item.append(answer);checks.append(item);});card.append(checks);
    }
    card.append(block('Common mistake','常见错误',c.trap));
    const actions = el('div','study-actions');
    actions.append(button('Practise this chapter','练习本章题目',()=>openBook('chapter'+String(c.id).padStart(2,'0'))));
    if (compact) actions.append(button('Open all 14 chapters','查看全部 14 章',()=>openGuide(c.id)));
    card.append(actions);
    return card;
  }
  function topicCard(id) {
    const topic=window.AP_TOPICS?.[id];if(!topic)return null;
    const card=el('article','study-card study-owned study-topic');
    card.append(el('div','study-eyebrow',t('THIS TOPIC','本节重点')),el('h2','',t(topic[0],topic[1])),el('p','study-core',t(topic[2],topic[3])));
    card.lang=language==='en'?'en':'zh-CN';if(topic[4])card.append(formula(topic[4]));return card;
  }
  const paneHosts = [];
  document.querySelectorAll('#learnContent .pane').forEach(pane => {
    const ids = content.paneChapters[pane.id]; if (!ids) return;
    const legacy = el('details','legacy-lab');
    const summary = el('summary'); legacy.append(summary);
    while (pane.firstChild) legacy.append(pane.firstChild);
    const host = el('div','study-owned study-pane-guide');
    pane.append(host,legacy); paneHosts.push({pane,host,legacy,summary,ids,id:pane.id});
  });
  const top = document.querySelector('.topbar');
  const controls = el('div','study-toolbar study-owned');
  const languageLabel = el('label','language-label', 'Language / 语言');
  const languageSelect = el('select'); languageSelect.id='studyLanguage'; languageSelect.setAttribute('aria-label','Language / 语言');
  [['zh','中文'],['en','English']].forEach(([value,label])=>{const o=el('option','',label);o.value=value;languageSelect.append(o);});
  languageLabel.append(languageSelect); controls.append(languageLabel);
  const guideButton = button('Study guide','双语讲解',()=>openGuide());
  const bookButton = button('Book practice','书本题库',()=>openBook());
  controls.append(guideButton,bookButton); top.append(controls);
  const homeCard = el('div','study-home study-owned');
  $('home').insertBefore(homeCard,$('home').querySelector('.modules'));
  const bankLink = el('div','study-bank-link study-owned');
  $('bankSelView').prepend(bankLink);
  let activeChapter = 1;
  const guide = el('dialog','study-dialog study-owned'); guide.id='studyGuide';
  const book = el('dialog','study-dialog study-owned'); book.id='bookPractice';
  document.body.append(guide,book);
  function header(dialog,title) {
    const h=el('header','study-dialog-head'); h.append(el('h2','',title));
    const actions=el('div','study-dialog-actions');
    actions.append(button('中文','English',()=>{language=language==='en'?'zh':'en';save('apchem.language',language);renderLanguage();}));
    const close=button('Close','关闭',()=>dialog.close()); close.setAttribute('aria-label',t('Close dialog','关闭对话框'));actions.append(close);h.append(actions);return h;
  }
  function showDialog(d) { if (!d.open) d.showModal(); }
  function renderGuide() {
    hideWord();
    guide.replaceChildren(header(guide,t('Bilingual chemistry guide','化学双语学习讲解')));
    const layout=el('div','study-layout'); const nav=el('nav','study-chapter-nav'); nav.setAttribute('aria-label',t('Chapters','章节'));
    content.chapters.forEach(c=>{const b=button(`${c.id}. ${c.title.en}`,`${c.id}. ${c.title.zh}`,()=>{activeChapter=c.id;renderGuide();guide.scrollTop=0;},'study-chapter-button');
      b.setAttribute('aria-current',String(c.id===activeChapter));nav.append(b);});
    const body=el('div','study-reading');
    body.append(el('p','study-source',t('Original study notes arranged around the 14 review chapters of AP Chemistry Premium 2025.','依据 AP Chemistry Premium 2025 的 14 章复习顺序编写的讲解。')),
      chapterCard(content.chapters.find(c=>c.id===activeChapter)));
    layout.append(nav,body);guide.append(layout);renderMath(body);emphasise(body);
  }
  function openGuide(id) { if (id) activeChapter=id; renderGuide(); showDialog(guide);guide.scrollTop=0; }
  guide.addEventListener('close',hideWord);
  // Book data is optional, local and loaded only when requested.
  let bookLoad;
  function loadBook() {
    if (window.AP_BOOK_DATA) return Promise.resolve(window.AP_BOOK_DATA);
    if (!bookLoad) bookLoad=new Promise(resolve=>{const s=document.createElement('script');s.src=new URL('book-local/data.js',assets);
      s.onload=()=>resolve(window.AP_BOOK_DATA || null);s.onerror=()=>resolve(null);document.head.append(s);});
    return bookLoad;
  }
  let bookData, groupId='all', questionType='all', search='', wrongOnly=false, questionIndex=0;
  let history=read('apchem.bookHistory.v1',{});
  if (!history || typeof history !== 'object' || Array.isArray(history)) history={};
  let selected=null, revealed=false, written='';
  function resetAnswer() { selected=null;revealed=false;written=''; }
  function filtered() {
    if (!bookData) return [];
    return bookData.groups.filter(g=>groupId==='all'||g.id===groupId).flatMap(g=>g.questions.map(q=>({...q,group:g})))
      .filter(q=>(questionType==='all'||q.type===questionType)&&(!wrongOnly||history[q.id]?.correct===false)&&
        (!search||(q.stem+' '+q.group.title).toLowerCase().includes(search.toLowerCase())));
  }
  function bookHtml(html) {
    const div=el('div','book-html');
    // Data is produced by the allowlisting importer; also sanitise at the display boundary.
    const parsed=new DOMParser().parseFromString(html,'text/html');
    const allowed=new Set(['P','DIV','SPAN','B','STRONG','I','EM','U','SUB','SUP','BR','OL','UL','LI','TABLE','THEAD','TBODY','TR','TD','TH','FIGURE','FIGCAPTION','IMG','H3','H4','BLOCKQUOTE']);
    parsed.body.querySelectorAll('*').forEach(n=>{
      if (!allowed.has(n.tagName)) { n.remove();return; }
      for (const a of [...n.attributes]) if (!['src','alt','loading','class','start','rowspan','colspan'].includes(a.name)) n.removeAttribute(a.name);
      if (n.tagName==='IMG') {
        const src=n.getAttribute('src')||'';
        if (!/^__BOOK_ASSETS__\/[\w.-]+\.(png|jpe?g|gif|webp)$/i.test(src)) n.remove();
        else n.src=new URL('book-local/images/'+src.split('/').pop(),assets).href;
      }
    });
    div.append(...parsed.body.childNodes);return div;
  }
  function record(q, correct, choice=null) { history[q.id]={correct,choice,at:Date.now()};save('apchem.bookHistory.v1',history); }
  function renderBookShell() {
    book.replaceChildren(header(book,t('Book practice · AP Chemistry Premium 2025','书本题库 · AP Chemistry Premium 2025')));
    const body=el('div','study-book-body'); book.append(body);
    if (!bookData) {
      body.append(el('p','',t('No book has been imported on this device. Import your EPUB using the local import tool described in the project README.','本机尚未导入书籍。请按项目说明使用本地导入工具导入 EPUB。')));return;
    }
    body.append(el('p','study-source',t('Original English questions and explanations. Image-only options are preserved for manual review.','保留原书英文题目与解析；图片形式选项保留原样，供手动核对。')));
    const filters=el('div','book-filters');
    function selectControl(label,options,value,onChange) {
      const l=el('label','',label);const s=el('select');options.forEach(([v,title])=>{const o=el('option','',title);o.value=v;s.append(o);});
      s.value=value;s.addEventListener('change',()=>{onChange(s.value);questionIndex=0;resetAnswer();renderBookQuestion();});l.append(s);filters.append(l);
    }
    selectControl(t('Chapter or test','章节 / 测试'),[['all',t('All chapters and tests','全部章节与测试')],...bookData.groups.map(g=>[g.id,(g.kind==='chapter' ? String(Number(g.id.slice(7)))+'. ' : '')+g.title])],groupId,v=>groupId=v);
    selectControl(t('Type','题型'),[['all',t('All types','全部题型')],['mcq','MCQ'],['frq','FRQ']],questionType,v=>questionType=v);
    const l=el('label','',t('Search','搜索'));const input=el('input');input.type='search';input.value=search;input.placeholder=t('Search English question text','搜索英文题目');
    input.addEventListener('input',()=>{search=input.value;questionIndex=0;resetAnswer();renderBookQuestion();});l.append(input);filters.append(l);
    const wrong=el('label','book-wrong-filter');const cb=el('input');cb.type='checkbox';cb.checked=wrongOnly;
    cb.addEventListener('change',()=>{wrongOnly=cb.checked;questionIndex=0;resetAnswer();renderBookQuestion();});wrong.append(cb,document.createTextNode(t('Mistakes only','仅看错题')));filters.append(wrong);
    body.append(filters,el('div','book-progress'),el('div','book-question-host'));renderBookQuestion();
  }
  function renderBookQuestion() {
    const host=book.querySelector('.book-question-host');if(!host)return;
    const list=filtered();questionIndex=Math.min(questionIndex,Math.max(0,list.length-1));const q=list[questionIndex];
    host.replaceChildren();const progress=book.querySelector('.book-progress');
    const done=list.filter(x=>history[x.id]).length;progress.textContent=t(`${list.length} questions · ${done} attempted`,`${list.length} 题 · 已练习 ${done} 题`);
    if (!q) {host.append(el('p','',t('No questions match these filters.','当前筛选没有题目。')));return;}
    const nav=el('div','book-navigation');
    const move = delta => { questionIndex+=delta;resetAnswer();renderBookQuestion(); };
    const prev=button('← Previous','← 上一题',()=>move(-1));prev.disabled=questionIndex===0;
    const next=button('Next →','下一题 →',()=>move(1));next.disabled=questionIndex===list.length-1;
    nav.append(prev,el('span','',`${questionIndex+1} / ${list.length}`),next,
      button('Random','随机一题',()=>{questionIndex=Math.floor(Math.random()*list.length);resetAnswer();renderBookQuestion();}));host.append(nav);
    const article=el('article','book-question'); article.lang='en';
    article.append(el('p','study-eyebrow',`${q.group.title} · ${q.type.toUpperCase()} ${q.number}`));
    if(q.context){const context=el('details','book-context');context.open=true;context.append(el('summary','',t('Shared passage / data','共用题干 / 数据')),bookHtml(q.context));article.append(context);}
    article.append(bookHtml(q.stem));
    if (q.options.length) {
      const choices=el('fieldset','book-options');choices.append(el('legend','',t('Select one answer','选择一个答案')));
      q.options.forEach((html,i)=>{const label=el('label','book-option');const radio=el('input');radio.type='radio';radio.name='bookAnswer';radio.value=i;radio.checked=selected===i;
        radio.disabled=revealed;radio.addEventListener('change',()=>{selected=i;const submit=host.querySelector('.book-submit');if(submit)submit.disabled=false;});
        label.append(radio,el('b','',String.fromCharCode(65+i)),bookHtml(html));choices.append(label);});article.append(choices);
    }
    if(q.type==='frq') {
      const label=el('label','book-written',t('Your working (kept while viewing this question)','你的解题过程（当前题目内保留）'));
      const area=el('textarea');area.rows=6;area.value=written;area.addEventListener('input',()=>written=area.value);label.append(area);article.append(label);
    }
    if (!revealed) {
      const submit=button(q.answer!==null?'Check answer':'Show book explanation',q.answer!==null?'检查答案':'查看原书解析',()=>{
        if(q.answer!==null&&selected===null)return;revealed=true;
        if(q.answer!==null){const correct=selected===q.answer;record(q,correct,selected);if(wrongOnly&&correct)resetAnswer();}renderBookQuestion();},'btn book-submit');
      submit.disabled=q.answer!==null&&selected===null;article.append(submit);
    } else {
      const feedback=el('div','book-feedback');feedback.setAttribute('role','status');
      if(q.answer!==null)feedback.append(el('h3',selected===q.answer?'book-correct':'book-incorrect',selected===q.answer?t('Correct','回答正确'):t(`Correct answer: ${String.fromCharCode(65+q.answer)}`,`正确选项：${String.fromCharCode(65+q.answer)}`)));
      else feedback.append(el('p','',t('Compare with the source explanation and assess your work. This question is not auto-graded.','请对照原书解析自行判断；本题不自动判分。')));
      feedback.append(bookHtml(q.explanation || t('No source explanation was found.','没有找到对应的原书解析。')));
      if(q.answer===null)feedback.append(button('I got it right','我答对了',()=>{record(q,true);progress.textContent=t('Recorded as correct','已记录为答对');}),button('Review later','加入错题',()=>{record(q,false);progress.textContent=t('Saved for review','已加入书本错题');}));
      article.append(feedback);
    }
    const source=el('details','book-source-sheet');source.append(el('summary','',t('Open original question section to verify context','打开原书题目区核对上下文')),bookHtml(q.group.sheets[q.type]));article.append(source);
    host.append(article);renderMath(article);
  }
  async function openBook(id) {
    if(id)groupId=id;
    questionIndex=0;resetAnswer();book.replaceChildren(header(book,t('Book practice','书本题库')),el('p','study-loading',t('Loading local book…','正在加载本地题库…')));showDialog(book);
    bookData=await loadBook();renderBookShell();
  }
  function renderLanguage() {
    hideWord();
    document.documentElement.lang=language==='en'?'en':'zh-CN';languageSelect.value=language;
    document.title=t('AP Chemistry · Bilingual Learning','AP Chemistry · 双语学习工具');
    translate(document.body);
    document.querySelectorAll('a[data-pane]').forEach(a=>{const topic=window.AP_TOPICS?.[a.dataset.pane];if(topic)a.textContent=t(topic[0],topic[1]);});
    guideButton.textContent=t('Study guide','双语讲解');bookButton.textContent=t('Book practice','书本题库');
    homeCard.replaceChildren(el('div','study-eyebrow',t('UNDERSTAND · APPLY · REVIEW','理解 · 推导 · 练习')),
      el('h2','',t('Understand the chemistry behind the answer.','把原理讲清楚，再把题做明白。')),
      el('p','',t('Learn step by step across 14 bilingual chapters: foundations, explanations, two worked examples per chapter, and self-checks. Select English words for Chinese meanings.','从基础学起：14 章中英讲义，循序解释、每章两道分步例题与自测。英文重点词加粗，支持划词查中文。')),
      button('Explore the study guide','查看双语讲解',()=>openGuide()),button('Open book practice','进入书本题库',()=>openBook()));
    bankLink.replaceChildren(el('span','',t('Practice from your imported book:','练习已导入的书本题目：')),button('Book practice','书本题库',()=>openBook()));
    paneHosts.forEach(({host,legacy,summary})=>{
      host.replaceChildren();delete host.dataset.language;
      legacy.open=language==='zh';summary.textContent=t('Original interactive lab and detailed notes (Chinese labels)','原有互动实验与详细笔记');
    });
    renderActivePanes();
    // The formula sheet gains typeset equations with explicit units in both languages.
    const sheet=$('ftPaneFormula');
    if(sheet){let h=sheet.querySelector('.study-formulas');if(!h){h=el('div','study-formulas study-owned');sheet.prepend(h);}
      h.replaceChildren(el('h3','',t('Typeset formulas · symbols and units','LaTeX 公式 · 符号与单位')));
      content.chapters.forEach(c=>{const row=el('section','study-formula-row');row.append(el('h4','',text(c.title)),formula(c.formula),el('p','',text(c.symbols)));h.append(row);});renderMath(h);}
    if(guide.open)renderGuide();if(book.open&&bookData)renderBookShell();
  }
  function renderActivePanes(){
    paneHosts.forEach(({pane,host,ids,id})=>{
      if(!pane.classList.contains('on')||host.dataset.language===language)return;
      const topic=topicCard(id);host.replaceChildren(...(topic?[topic]:[]),...ids.map(chapter=>chapterCard(content.chapters.find(c=>c.id===chapter),true)));
      host.dataset.language=language;renderMath(host);emphasise(host);
    });
  }
  languageSelect.addEventListener('change',()=>{language=languageSelect.value;save('apchem.language',language);renderLanguage();});
  renderLanguage();
  const paneObserver=new MutationObserver(()=>{hideWord();renderActivePanes();});
  paneHosts.forEach(({pane})=>paneObserver.observe(pane,{attributes:true,attributeFilter:['class']}));
  // Translate newly generated navigation text without observing the animation loops.
  const uiObserver=new MutationObserver(records=>{
    for(const r of records){translate(r.target);for(const n of r.addedNodes)if(n.nodeType===1&&!n.closest('.katex'))renderMath(n);}
  });
  ['learnDirectory','bankRanges','bankSession','crumb','lsTitle','lsMeta'].forEach(id=>{const n=$(id);if(n)uiObserver.observe(n,{childList:true,subtree:true});});
  if(window.__q?.renderQ){const render=window.__q.renderQ;window.__q.renderQ=function(container,...args){const out=render.call(this,container,...args);renderMath(container);return out;};}
  window.AP_LEARNING={openGuide,openBook,setLanguage(value){if(['zh','en'].includes(value)){language=value;save('apchem.language',value);renderLanguage();}},get language(){return language;}};
})();

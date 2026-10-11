const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
let browser,server,base;
before(async()=>{
  const root=path.resolve(__dirname,'../ap-chem-site');
  server=http.createServer(async(req,res)=>{
    const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+(route==='/'?'/index.html':route));
    if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
    try {res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}
    catch {res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function open(t,width=1440,route='/learn'){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  t.after(async()=>{await page.close();assert.deepEqual(errors,[]);});
  await page.goto(base+'/#'+route);return page;
}
async function route(page,route){await page.evaluate(r=>location.hash=r,route);await page.waitForFunction(r=>location.hash==='#'+r&&document.querySelector('.m-content .m-active-page'),route);await page.waitForTimeout(50);}

test('all chapters, examples, checks and original laboratory panes remain reachable',async t=>{
  const page=await open(t);
  assert.equal(await page.locator('.m-course-row').count(),14);
  for(let chapter=1;chapter<=14;chapter++){
    await route(page,`/learn/${chapter}/reading`);
    assert.equal(await page.locator('#studyGuide').isVisible(),true);
    assert.equal(await page.locator('#studyGuide .study-teaching').count(),3);
    assert.equal(await page.locator('#studyGuide .katex-error').count(),0);
    await page.locator('.reader-tabs a').nth(1).click();
    await page.waitForSelector('#studyGuide .study-example');
    assert.equal(await page.locator('#studyGuide .study-example').count(),2);
    await page.locator('.reader-tabs a').nth(2).click();
    await page.waitForSelector('#studyGuide .study-check');
    assert.ok(await page.locator('#studyGuide .study-check').count()>=2);
  }
  const panes=await page.locator('#learnContent .pane').evaluateAll(ns=>ns.map(n=>({id:n.id,unit:n.closest('.unit-panel').id.replace('unit-','')})));
  assert.equal(panes.length,49);
  for(const pane of panes){
    await route(page,`/labs/${pane.unit}/${pane.id}`);
    assert.equal(await page.locator('#'+pane.id).isVisible(),true,pane.id);
    assert.equal(await page.locator('#'+pane.id+' .legacy-lab').getAttribute('open'),'');
  }
});

test('reading language is in the app bar, persists, and keeps formulas single',async t=>{
  const page=await open(t,1440,'/learn/1/reading');
  assert.equal(await page.locator('.m-appbar #reading-language').isVisible(),true);
  const formulas=await page.locator('#studyGuide .study-teaching .study-equation').count();
  await page.locator('#reading-language').click();
  await page.locator('#reading-language-menu label').filter({hasText:/^English$/}).click();
  assert.equal(await page.locator('#studyGuide .study-teaching p.chinese').count(),0);
  assert.ok(await page.locator('#studyGuide .study-teaching p.english').count()>0);
  assert.equal(await page.locator('#studyGuide .study-teaching .study-equation').count(),formulas);
  await page.reload();
  assert.equal(await page.evaluate(()=>AP_LEARNING.readingLanguage),'en');
  await page.locator('#reading-language').click();
  await page.locator('#reading-language-menu label').filter({hasText:'中英对照'}).click();
  assert.ok(await page.locator('#studyGuide .study-teaching p.chinese').count()>0);
  assert.equal(await page.locator('#studyGuide .study-teaching .study-equation').count(),formulas);
});

test('mobile directory tracks and restores the reading section with browser navigation',async t=>{
  const page=await open(t,390,'/learn/3/reading');
  await page.locator('#m-directory').click();
  await page.locator('#directory-dialog [data-reading="reading-3-2"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-reading="reading-3-2"]').getAttribute('aria-current')==='location');
  assert.equal(await page.locator('#directory-dialog').isVisible(),false);
  await page.locator('.m-bottom-nav [data-route-nav="tools"]').click();
  await page.waitForSelector('#tools-page:visible');
  await page.goBack();
  await page.waitForFunction(()=>document.querySelector('[data-reading="reading-3-2"]').getAttribute('aria-current')==='location');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('[data-reading="reading-3-2"]').getAttribute('aria-current')==='location');
  for(const view of ['/learn','/practice','/review','/review/vocabulary','/labs','/tools']){
    await route(page,view);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),view);
  }
});

function contrast(a,b){
  function luminance(color){const c=color.match(/[\da-f]{2}/gi).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
  const [x,y]=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (x+.05)/(y+.05);
}
test('six palettes have readable light and dark roles and persist without touching learning data',async t=>{
  const page=await open(t,390);
  await page.evaluate(()=>localStorage.setItem('apchem.vocab.v1','[{"word":"retained"}]'));
  await page.locator('#appearance').click();
  for(const mode of ['light','dark']){
    await page.locator(`.appearance-mode-label:has(input[value="${mode}"])`).click();
    for(const accent of ['blue','green','purple','orange','rose','gray']){
      await page.locator(`.appearance-accent-item[data-accent="${accent}"]`).click();
      const colors=await page.evaluate(()=>{const c=getComputedStyle(document.documentElement);return Object.fromEntries(['surface','on-surface','on-surface-variant','primary','on-primary','primary-container','on-primary-container','secondary-container','on-secondary-container','error','on-error'].map(n=>[n,c.getPropertyValue('--md-sys-color-'+n).trim()]));});
      for(const [fg,bg] of [['on-surface','surface'],['on-surface-variant','surface'],['primary','surface'],['on-primary','primary'],['on-primary-container','primary-container'],['on-secondary-container','secondary-container'],['on-error','error']])assert.ok(contrast(colors[fg],colors[bg])>=4.5,`${mode}/${accent}/${fg}`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
  }
  await page.keyboard.press('Escape');await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.equal(await page.locator('html').getAttribute('data-theme-accent'),'gray');
  assert.equal(await page.evaluate(()=>localStorage.getItem('apchem.vocab.v1')),'[{"word":"retained"}]');
  await page.locator('#appearance').click();await page.locator('.appearance-mode-label:has(input[value="system"])').click();
  await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
});

test('tools and account dialogs close with Escape and return keyboard focus',async t=>{
  const page=await open(t,768,'/tools');
  for(const [text,id] of [['公式与周期表','modalFormula'],['课程大纲','modalPdf'],['查缺补漏','modalGap'],['词典','modalTr'],['学习设置','modalSettings']]){
    const button=page.locator('.m-tool-row').filter({hasText:text});await button.click();
    assert.equal(await page.locator('#'+id).isVisible(),true);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#'+id).isVisible(),false);
    assert.equal(await button.evaluate(n=>n===document.activeElement),true);
  }
  await page.locator('#btnUser').click();assert.equal(await page.locator('#modalAccount').isVisible(),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#btnUser').evaluate(n=>n===document.activeElement),true);
});

test('system theme follows the current OS on cold start, regardless of the legacy theme',async t=>{
  for(const colorScheme of ['light','dark']){
    const page=await browser.newPage({colorScheme});t.after(()=>page.close());
    await page.addInitScript(()=>{
      localStorage.setItem('apchem.themeMode','system');
      localStorage.setItem('apchem.theme',matchMedia('(prefers-color-scheme: dark)').matches?'light':'dark');
    });
    await page.goto(base);
    assert.equal(await page.locator('html').getAttribute('data-theme'),colorScheme);
    assert.equal(await page.locator('html').getAttribute('data-theme-effective'),colorScheme);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),colorScheme);
  }
});

test('interface language updates navigation and dynamic pages independently of reading language',async t=>{
  const page=await open(t,1440,'/tools');
  await page.locator('#interface-language').selectOption('en');
  assert.deepEqual(await page.locator('.m-navigation b').allTextContents(),['Learn','Practice','Review','Labs','Tools']);
  await page.locator('.m-navigation [data-route-nav="learn"]').click();
  assert.equal(await page.locator('.m-course-row strong').first().textContent(),'Structure of the Atom');
  await page.locator('.m-course-row').first().click();
  assert.equal(await page.locator('#reading-language .m-language-value').textContent(),'Bilingual');
  assert.ok(await page.locator('#studyGuide p.chinese').count()>0);
  await page.locator('#reading-language').click();
  assert.equal(await page.locator('#reading-language-menu legend').textContent(),'Reading language');
  await page.keyboard.press('Escape');
  await page.locator('#appearance').click();
  assert.equal(await page.locator('.appearance-title').textContent(),'Appearance');
  await page.keyboard.press('Escape');
  await page.reload();
  assert.deepEqual(await page.locator('.m-navigation b').allTextContents(),['Learn','Practice','Review','Labs','Tools']);
  await route(page,'/tools');await page.locator('#interface-language').selectOption('zh');
  assert.deepEqual(await page.locator('.m-navigation b').allTextContents(),['学习','练习','复习','实验','工具']);
});

test('mobile scaling applies to the interface and periodic table scrolls within its panel',async t=>{
  const page=await open(t,390,'/tools');
  await page.locator('.m-tool-row').filter({hasText:'学习设置'}).click();
  await page.locator('#setFont [data-v="1.25"]').click();
  assert.equal(await page.evaluate(()=>document.body.style.zoom),'1.25');
  await page.keyboard.press('Escape');await page.reload();
  assert.equal(await page.evaluate(()=>document.body.style.zoom),'1.25');
  await route(page,'/learn/1/reading');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await route(page,'/tools');await page.locator('.m-tool-row').filter({hasText:'学习设置'}).click();
  await page.locator('#setFont [data-v="1"]').click();await page.keyboard.press('Escape');
  await route(page,'/labs/u1/u1-trends');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.locator('#ptFig').evaluate(n=>n.scrollWidth>n.clientWidth),true);
  assert.equal(await page.locator('#ptFig').evaluate(n=>{n.scrollLeft=100;return n.scrollLeft>0;}),true);
});

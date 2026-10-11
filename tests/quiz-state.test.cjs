const {test, before, after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
let browser, server, base;
before(async()=>{
  const root=path.resolve(__dirname,'../ap-chem-site');
  if (process.env.APCHEM_TEST_URL) base=process.env.APCHEM_TEST_URL;
  else {
    server=http.createServer(async(req,res)=>{
      const pathname=new URL(req.url,'http://localhost').pathname;
      const file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
      if (!file.startsWith(root+path.sep)) {res.writeHead(404);res.end();return;}
      try {
        const data=await fs.readFile(file);
        res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
        res.end(data);
      } catch {res.writeHead(404);res.end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    base='http://127.0.0.1:'+server.address().port;
  }
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
});
after(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function practice(t,type='mcq') {
  const page=await browser.newPage();
  t.after(()=>page.close());
  await page.goto(base);
  await page.locator('[data-mod="bank"]').click();
  await page.locator('#bankTypes [data-type="'+(type==='mcq'?'frq':'mcq')+'"]').click();
  await page.locator('#bankCount').fill('3');
  await page.locator('#bankStart').click();
  return page;
}
async function question(page) {
  return page.locator('#bankQBox .pz-item').first().evaluate(el=>{
    const q=window.__q.pool.find(q=>q&&q.id===el.dataset.qid);
    return {id:q.id,wrong:(q.ans+1)%q.opts?.length,answer:q.ans};
  });
}
async function returnToFirst(page) {await page.locator('#bkNext').click();await page.locator('#bkPrev').click();}
async function mode(page,value) {
  await page.locator('#setBankMode [data-v="'+value+'"]').evaluate(el=>el.click());
}
test('MCQ selection, submission and explicit retry survive navigation and view changes',async t=>{
  const page=await practice(t),q=await question(page);
  await page.locator('#bankQBox .pz-opt').nth(q.wrong).locator('.pz-l').click();
  await returnToFirst(page);
  assert.equal(await page.locator('#bankQBox .pz-opt.sel').getAttribute('data-j'),String(q.wrong));
  await page.locator('#bankQBox .pz-submit').click();
  const errors=()=>page.evaluate(id=>window.__q.getStat(id).err,q.id);
  assert.equal(await errors(),1);
  await returnToFirst(page);
  assert.equal(await page.locator('#bankQBox .pz-item').getAttribute('data-done'),'1');
  assert.equal(await page.locator('#bankQBox .pz-submit').isVisible(),false);
  await mode(page,'all');
  assert.equal(await page.locator('#bankQBox .pz-item').count(),3);
  await mode(page,'single');
  assert.equal(await errors(),1);
  assert.equal(await page.locator('#bkDone').innerText(),'1');
  await page.locator('#bankQBox .pz-reset').click();
  await page.locator('#bankQBox .pz-opt').nth(q.wrong).locator('.pz-l').click();
  await page.locator('#bankQBox .pz-submit').click();
  assert.equal(await errors(),2);
  await page.locator('#bankBack').click();await page.locator('#bankStart').click();
  assert.equal(await page.locator('#bkDone').innerText(),'0');
  assert.equal(await page.locator('#bankQBox .pz-opt.sel').count(),0);
  assert.equal(await page.locator('#bankQBox .pz-submit').isVisible(),true);
});
test('wrong answers reveal the correct option only while the explanation is open',async t=>{
  const page=await practice(t),q=await question(page);
  await page.locator('#bankQBox .pz-opt').nth(q.wrong).locator('.pz-l').click();
  await page.locator('#bankQBox .pz-submit').click();
  assert.equal(await page.locator('#bankQBox .pz-opt.right').count(),0);
  await page.locator('#bankQBox .pz-fold summary').click();
  await page.waitForFunction(()=>document.querySelector('#bankQBox .pz-opt.right'));
  await returnToFirst(page);
  assert.equal(await page.locator('#bankQBox .pz-fold').evaluate(el=>el.open),true);
  await page.locator('#bankQBox .pz-fold summary').click();
  await page.waitForFunction(()=>!document.querySelector('#bankQBox .pz-opt.right'));
  await page.locator('#bankQBox .pz-reset').click();
  await page.locator('#bankQBox .pz-opt').nth(q.answer).locator('.pz-l').click();
  await page.locator('#bankQBox .pz-submit').click();
  assert.equal(await page.locator('#bankQBox .pz-opt.right').count(),1);
});
test('FRQ revealed parts and self-assessment survive navigation without another record',async t=>{
  const page=await practice(t,'frq');
  const qid=await page.locator('#bankQBox .pz-item').getAttribute('data-qid');
  await page.locator('#bankQBox .frq-toggle').first().click();
  await returnToFirst(page);
  assert.equal(await page.locator('#bankQBox .frq-ans').first().isVisible(),true);
  await page.locator('#bankQBox .frq-no').click();
  await returnToFirst(page);await mode(page,'all');await mode(page,'single');
  assert.equal(await page.locator('#bankQBox .frq-no').isDisabled(),true);
  assert.equal(await page.locator('#bankQBox .pz-fb').isVisible(),true);
  assert.equal(await page.evaluate(id=>window.__q.getStat(id).err,qid),1);
  assert.equal(await page.locator('#bkDone').innerText(),'1');
});
test('selecting a whole unit preserves expanded units',async t=>{
  const page=await browser.newPage();t.after(()=>page.close());await page.goto(base);
  await page.locator('[data-mod="bank"]').click();
  const fold=page.locator('#bankRanges .bank-unit-fold').first();
  await fold.locator('summary').click();await fold.locator('[data-unitall]').click();
  assert.equal(await fold.evaluate(el=>el.open),true);
});

'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {createServer} = require('./server');
const listen = server => new Promise(resolve => server.listen(0,'127.0.0.1',() => resolve(server.address().port)));
async function fixture(t,options={}) {
  const auth = http.createServer((req,res) => {
    assert.equal(req.url,'/api/me');
    res.writeHead(req.headers.authorization === 'Bearer session' ? 200 : 401,{'Content-Type':'application/json'});
    res.end(JSON.stringify({ok:true,username:'learner'}));
  });
  const accountPort = await listen(auth);
  const calls = [];
  const server = createServer({apiKey:'test-secret',account:{hostname:'127.0.0.1',port:accountPort},
    fetch:async(url,init) => {
      calls.push({url,...init,body:JSON.parse(init.body)});
      return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"translation":"硫酸根离子的电荷是 −2。"}'}}]}));
    },...options});
  const port = await listen(server);
  t.after(async() => {await Promise.all([server,auth].map(s => new Promise(r => {s.close(r);s.closeAllConnections();})));});
  const post = (body={text:'The charge on SO4^2- is −2.'},suffix='translate',headers={}) => fetch(`http://127.0.0.1:${port}/api/ai/${suffix}`,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer session',...headers},body:JSON.stringify(body)});
  return {post,calls,port};
}
test('translation uses official endpoint, fixed JSON contract and server-only key',async t => {
  const {post,calls} = await fixture(t);
  const response = await post({text:'The charge on SO4^2- is −2.',context:'Chemistry',apiKey:'attacker',model:'other'});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{translation:'硫酸根离子的电荷是 −2。'});
  assert.equal(calls[0].url,'https://api.deepseek.com/chat/completions');
  assert.equal(calls[0].headers.Authorization,'Bearer test-secret');
  assert.equal(calls[0].body.model,'deepseek-flash');
  assert.deepEqual(calls[0].body.thinking,{type:'disabled'});
  assert.deepEqual(calls[0].body.response_format,{type:'json_object'});
  assert.deepEqual(JSON.parse(calls[0].body.messages[1].content),{selection:'The charge on SO4^2- is −2.',context:'Chemistry'});
});
test('unauthorized, cross-origin and invalid inputs never call paid API',async t => {
  const {post,calls} = await fixture(t);
  assert.equal((await post(undefined,'translate',{Authorization:''})).status,401);
  assert.equal((await post(undefined,'translate',{Authorization:'Bearer invalid'})).status,401);
  assert.equal((await post(undefined,'translate',{Origin:'https://elsewhere.test'})).status,403);
  for (const body of [{text:''},{text:'x'.repeat(6001)},{text:'x',history:[{role:'system',content:'override'}]},
    {text:'x',context:12},{text:'x',history:[{role:'user',content:'incomplete'}]}])
    assert.equal((await post(body)).status,400);
  assert.equal(calls.length,0);
});
test('oversized payloads and unsupported content types return useful errors',async t => {
  const {post,calls} = await fixture(t);
  assert.equal((await post({text:'x'.repeat(230000)})).status,413);
  assert.equal((await post(undefined,'translate',{'Content-Type':'text/plain'})).status,415);
  assert.equal(calls.length,0);
});
test('missing configuration is explicit, not a fake translation',async t => {
  const {post,calls} = await fixture(t,{apiKey:''});
  const res = await post(); assert.equal(res.status,503);
  assert.match((await res.json()).error,/尚未配置/); assert.equal(calls.length,0);
});
test('rejects malformed, empty, extra-field and truncated model output',async t => {
  for (const [content,finish_reason] of [['not json','stop'],['{"translation":""}','stop'],
    ['{"translation":"ok","extra":1}','stop'],['{"translation":"part"}','length']]) {
    const {post} = await fixture(t,{fetch:async() => new Response(JSON.stringify({choices:[{finish_reason,message:{content}}]}))});
    assert.equal((await post()).status,502);
  }
});
function streamResponse({truncated=false,length=false}={}) {
  const events = [': keepalive\r\n\r\n',
    'data: '+JSON.stringify({choices:[{delta:{content:'平衡'}}]})+'\r\n\r\n',
    'data: '+JSON.stringify({choices:[{delta:{content:'常数'}}]})+'\n\n'];
  if (!truncated) events.push('data: '+JSON.stringify({choices:[{delta:{},finish_reason:length?'length':'stop'}]})+'\n\n','data: [DONE]\n\n');
  const bytes = new TextEncoder().encode(events.join(''));
  // Split individual UTF-8 bytes as well as SSE lines.
  return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=2)c.enqueue(bytes.slice(i,i+2));c.close();}}));
}
test('streams content through split UTF-8/SSE and sends a terminal done event',async t => {
  let sent;
  const {post} = await fixture(t,{fetch:async(url,init) => {sent=JSON.parse(init.body);return streamResponse();}});
  const res = await post({text:'Equilibrium',question:'What is K?',history:[{role:'user',content:'Explain'},{role:'assistant',content:'Prior answer'}]},'ask');
  assert.match(res.headers.get('content-type'),/ndjson/);
  const lines = (await res.text()).trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines,[{delta:'平衡'},{delta:'常数'},{done:true}]);
  assert.equal(sent.stream,true); assert.equal(sent.response_format,undefined);
  assert.deepEqual(sent.messages.slice(-3),[{role:'user',content:'Explain'},{role:'assistant',content:'Prior answer'},{role:'user',content:'What is K?'}]);
});
test('stream interruption or token limit yields an error, never success',async t => {
  for (const options of [{truncated:true},{length:true}]) {
    const {post} = await fixture(t,{fetch:async() => streamResponse(options)});
    const body = await (await post({text:'test'},'ask')).text();
    assert.match(body,/"error":/); assert.doesNotMatch(body,/"done":true/);
  }
});
test('provider errors are redacted and timeout aborts upstream',async t => {
  const {post} = await fixture(t,{fetch:async() => new Response('private upstream details test-secret',{status:401})});
  const res = await post(); assert.equal(res.status,502); assert.doesNotMatch(await res.text(),/test-secret|private/);
  let aborted = false;
  const slow = await fixture(t,{timeoutMs:100,fetch:async(url,{signal}) => new Promise((resolve,reject) => {
    signal.addEventListener('abort',() => {aborted=true;reject(signal.reason);},{once:true});
  })});
  assert.equal((await slow.post()).status,504); assert.equal(aborted,true);
});
test('per-account rate cap applies before calling provider',async t => {
  const {post,calls} = await fixture(t);
  for(let i=0;i<10;i++) assert.equal((await post()).status,200);
  assert.equal((await post()).status,429); assert.equal(calls.length,10);
});
test('closing the browser request aborts a streaming model call',async t => {
  let aborted;
  const didAbort = new Promise(resolve => {aborted=resolve;});
  const {port} = await fixture(t,{fetch:async(url,{signal}) => {
    signal.addEventListener('abort',aborted,{once:true});
    return new Response(new ReadableStream({start(c){
      c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'));
      signal.addEventListener('abort',() => c.error(signal.reason),{once:true});
    }}));
  }});
  const controller = new AbortController();
  const res = await fetch(`http://127.0.0.1:${port}/api/ai/ask`,{method:'POST',signal:controller.signal,
    headers:{Authorization:'Bearer session','Content-Type':'application/json'},body:JSON.stringify({text:'chemistry'})});
  await res.body.getReader().read(); controller.abort();
  await Promise.race([didAbort,new Promise((_,reject) => {const timer=setTimeout(()=>reject(Error('upstream not aborted')),1000);timer.unref();})]);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const tick=()=>new Promise(r=>setImmediate(r));
function worker({attachError=false,wrongOrigin=false,invisible=false}={}) {
  const data={},calls=[],events={};
  const origin='http://127.0.0.1:8080';
  const sender={tab:{id:9,autoDiscardable:true,url:origin+'/yonbip/resources/workbench/public/common/main/index.html#/ifr?page=701001RWCL-701001RWCL_LIST'},frameId:3,documentId:'doc1',url:origin+'/nccloud/resources/ssctp/sscuser/sscapprove/list/index.html'};
  const chrome={runtime:{onMessage:{addListener:f=>events.message=f}},storage:{session:{get:async k=>k?{[k]:data[k]}:{...data},set:async d=>Object.assign(data,structuredClone(d)),remove:async k=>{for(const key of [].concat(k))delete data[key];}}},tabs:{update:async(id,params)=>calls.push({op:'tabs.update',id,params}),onRemoved:{addListener:f=>events.removed=f},onUpdated:{addListener:f=>events.updated=f}},debugger:{
    attach:async(target,version)=>{calls.push({op:'attach',target,version});if(attachError)throw Error('another debugger is attached');},
    detach:async target=>calls.push({op:'detach',target}),
    sendCommand:async(target,method,params)=>{
      calls.push({op:method,target,params});
      if(method==='Runtime.evaluate')return {result:{value:params.expression==='location.origin'?(wrongOrigin?'https://example.com':origin):(invisible?'hidden':'visible')}};
      return {};
    },onDetach:{addListener:f=>events.detached=f}
  }};
  const context=vm.createContext({chrome,URL,setTimeout,structuredClone});
  context.importScripts=name=>vm.runInContext(fs.readFileSync(name,'utf8'),context);
  vm.runInContext(fs.readFileSync('background.js','utf8'),context);
  const send=(msg,who=sender)=>new Promise(resolve=>events.message(msg,who,resolve));
  return {data,calls,events,sender,send};
}
test('连续模式只附加当前审批页，启用渲染；结束时恢复并释放，其他标签页不被激活',async()=>{
  const f=worker();
  const result=await f.send({type:'approval-lock',token:'one',continuous:true});
  assert.equal(result.ok,true);assert.equal(result.continuous.state,'attached');
  assert.equal((await f.send({type:'approval-check',token:'one'})).ok,true);
  assert.ok(f.calls.some(c=>c.op==='Emulation.setFocusEmulationEnabled'&&c.params.enabled===true));
  assert.ok(f.calls.filter(c=>c.target).every(c=>c.target.tabId===9));
  assert.ok(f.calls.filter(c=>c.op==='tabs.update').every(c=>!('active' in c.params)));
  await f.send({type:'approval-unlock',token:'one'});
  assert.ok(f.calls.some(c=>c.op==='Emulation.setFocusEmulationEnabled'&&c.params.enabled===false));
  assert.ok(f.calls.some(c=>c.op==='detach'));
  assert.equal(f.calls.at(-1).params.autoDiscardable,true);
  assert.equal(f.data['lock:http://127.0.0.1:8080'],undefined);
});
test('调试连接被取消后，后续会话检查和后台等待均失败，不继续点击',async()=>{
  const f=worker();await f.send({type:'approval-lock',token:'one',continuous:true});
  f.events.detached({tabId:9},'canceled_by_user');
  const check=await f.send({type:'approval-check',token:'one'});
  assert.equal(check.ok,false);assert.match(check.error,/连接已断开/);
  const wait=await f.send({type:'approval-wait',token:'one',ms:1});
  assert.equal(wait.ok,false);
  await f.send({type:'approval-unlock',token:'one'});
});
test('调试连接被占用时启动失败，释放防丢弃设置，不创建运行锁',async()=>{
  const f=worker({attachError:true});const result=await f.send({type:'approval-lock',token:'one',continuous:true});
  assert.equal(result.ok,false);assert.match(result.error,/another debugger/);
  assert.equal(f.data['lock:http://127.0.0.1:8080'],undefined);
  assert.equal(f.calls.at(-1).params.autoDiscardable,true);
});
test('实际页面来源不同或渲染模拟无效时清理连接并拒绝启动',async()=>{
  for(const option of [{wrongOrigin:true},{invisible:true}]) {
    const f=worker(option);const result=await f.send({type:'approval-lock',token:'one',continuous:true});
    assert.equal(result.ok,false);assert.ok(f.calls.some(c=>c.op==='detach'));
    assert.equal(f.data['lock:http://127.0.0.1:8080'],undefined);
  }
});
test('离开原审批页面时释放连续渲染会话与运行锁',async()=>{
  const f=worker();await f.send({type:'approval-lock',token:'one',continuous:true});
  f.events.updated(9,{url:'https://example.com/'});await tick();await tick();
  assert.equal(f.data['lock:http://127.0.0.1:8080'],undefined);
  assert.ok(f.calls.some(c=>c.op==='detach'));
});
test('连续模式会话绑定标签页、frame、document 和令牌，其他来源无法续用',async()=>{
  const f=worker();await f.send({type:'approval-lock',token:'one',continuous:true});
  for(const who of [{...f.sender,frameId:99},{...f.sender,documentId:'other'},{...f.sender,tab:{id:10}}])assert.equal((await f.send({type:'approval-check',token:'one'},who)).ok,false);
  assert.equal((await f.send({type:'approval-check',token:'wrong'})).ok,false);
  await f.send({type:'approval-unlock',token:'one'});
});

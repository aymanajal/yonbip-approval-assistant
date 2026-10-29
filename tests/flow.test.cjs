const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture({count=2, confirm=false, fail=false, virtual=false, keepDetail=false, loading=false, suspendedTimers=false, pseudoBack=false, afterReturn=null, continuousAck=false, initialStorage={}}={}) {
  const dom=new JSDOM(`<body><div role="tab" aria-selected="true">待处理 ${count}</div><table><tbody></tbody></table><div id="total">共 ${count} 条</div><div id="detail"></div></body>`,{url:'http://127.0.0.1:8080/nccloud/resources/ssctp/sscuser/sscapprove/list/index.html',runScripts:'outside-only'});
  const w=dom.window; let shadow, submissions=0;
  // Match Chrome on the deployed non-secure HTTP origin, not jsdom's API superset.
  Object.defineProperty(w.crypto,'randomUUID',{value:undefined,configurable:true});
  const messages=[];
  const storage=structuredClone(initialStorage);
  const attach=w.Element.prototype.attachShadow;
  w.Element.prototype.attachShadow=function(o){shadow=attach.call(this,o);return shadow;};
  w.Element.prototype.getClientRects=function(){return [{width:100,height:20}];};
  const nativeTimer=w.setTimeout.bind(w);
  w.setTimeout=(f,ms)=>{if(suspendedTimers)throw Error('后台页面计时器不可用');return nativeTimer(f,Math.min(ms,2));};
  w.chrome={storage:{local:{get:async k=>({...storage}),set:async data=>{Object.assign(storage,structuredClone(data));}}},runtime:{getURL:path=>"chrome-extension://test/"+path,sendMessage:async msg=>{messages.push(msg);if(msg.type==='approval-wait')await sleep(2);if(continuousAck&&msg.type==='approval-lock')Object.defineProperty(w.document,'visibilityState',{value:'visible',configurable:true});return {ok:true,...(continuousAck?{continuous:{enabled:true,state:'attached'},tabActive:false}:{})};}}};
  w.requestAnimationFrame=fn=>nativeTimer(()=>fn(w.performance.now()),2);
  w.cancelAnimationFrame=id=>w.clearTimeout(id);
  w.confirm=()=>false;
  const table=w.document.querySelector('tbody');
  function add(i) {
    const tr=w.document.createElement('tr');tr.innerHTML=`<td></td><td>${i}</td><td><a href="#">DEMO20261029${String(i).padStart(4,'0')}</a></td><td>BIP系统运维工单</td>`;
    tr.querySelector('a').onclick=e=>{
      e.preventDefault(); const detail=w.document.querySelector('#detail'); detail.innerHTML='<textarea></textarea><button>审批通过</button>';
      if(loading) {detail.querySelector('button').disabled=true;nativeTimer(()=>detail.querySelector('button').disabled=false,15);}
      const complete=()=>{
        tr.remove();detail.innerHTML=keepDetail?(pseudoBack?'<button>取消审核</button><div class="detail-page-area"><div class="work-bar-area nc-theme-area-bgc"><div type="ncdiv" class="title-ctrl"><div tabindex="-1" class="back-btn-hotkey-wrapper"><span id="back" class="back-btn iconfont icon icon-danjufanhuiicon"></span></div></div></div></div>':'<button>取消审核</button><button id="back">返回</button>'):'';
        if(keepDetail) detail.querySelector('#back').onclick=()=>{detail.innerHTML='';if(afterReturn)afterReturn({w,table,count});};
        w.document.querySelector('#total').textContent=`共 ${--count} 条`;
        w.document.querySelector('[role="tab"]').textContent=`待处理 ${count}`;
      };
      detail.querySelector('button').onclick=()=>{
        submissions++;
        if(confirm) {
          const prompt=confirm==='approval'?'是否确认审批通过？':'';
          detail.insertAdjacentHTML('beforeend',`<div role="dialog"><p>${prompt}</p><button>确定</button><button>取消</button></div>`);
          if(confirm==='approval') detail.querySelector('[role="dialog"] button').onclick=complete;
          return;
        }
        if(fail) {detail.insertAdjacentHTML('beforeend','<div role="alert">审批失败</div>');return;}
        complete();
      };
    };table.append(tr);
  }
  for(let i=1;i<=count;i++) add(i);
  if(virtual) {
    const scroller=w.document.createElement('div');scroller.style.overflowY='hidden';
    const tableEl=table.parentElement;tableEl.before(scroller);scroller.append(tableEl);
    const all=[...table.children];let top=0;
    const render=()=>table.replaceChildren(...all.slice(Math.floor(top/20),Math.floor(top/20)+5));
    Object.defineProperties(scroller,{
      clientHeight:{get:()=>100},scrollHeight:{get:()=>count*20},
      scrollTop:{get:()=>top,set:value=>{top=Math.max(0,Math.min(value,count*20-100));render();}}
    });render();
  }
  w.eval(fs.readFileSync('engine.js','utf8'));w.eval(fs.readFileSync('content.js','utf8'));
  await sleep(5);
  const q=id=>shadow.getElementById(id);
  const click=id=>q(id).click();
  async function until(predicate) {for(let i=0;i<600;i++){if(predicate())return;await sleep(3);}throw Error('Timed out: '+q('status').textContent);}
  async function scan(){click('scan');await until(()=>q('status').textContent.includes('已识别全部'));}
  const status=()=>q('status').textContent;
  return {w,dom,storage,messages,q,click,until,scan,status,submissions:()=>submissions};
}
test('HTTP 页面没有 randomUUID 时仍能启动，并用同一随机令牌释放运行锁',async()=>{
  const f=await fixture({count:1});
  try {
    assert.equal(f.w.crypto.randomUUID,undefined);
    await f.scan();f.q('armed').checked=true;f.click('start');
    await f.until(()=>f.status().includes('本轮已核实通过 1') && f.messages.some(m=>m.type==='approval-unlock'));
    assert.equal(f.submissions(),1);
    const messages=f.messages.filter(m=>['approval-lock','approval-unlock'].includes(m.type));
    assert.equal(messages[0].type,'approval-lock');
    assert.match(messages[0].token,/^[a-f0-9]{32}$/);
    assert.equal(messages[1].type,'approval-unlock');
    assert.equal(messages[1].token,messages[0].token);
  } finally {f.dom.window.close();}
});
test('扫描 31 张列表，不会提交；试开单据也不会审批',async()=>{
  const f=await fixture({count:31});try {await f.scan();assert.match(f.status(),/31/);f.click('dry');await f.until(()=>f.status().includes('未点击审批'));assert.equal(f.submissions(),0);assert.equal(f.w.document.querySelectorAll('textarea').length,1);}finally{f.dom.window.close();}
});
test('未开启真实审批时拒绝提交',async()=>{
  const f=await fixture();try{assert.equal(f.q('armed').checked,true);assert.equal(f.submissions(),0);await f.scan();f.q('armed').checked=false;f.click('start');await f.until(()=>f.status().includes('请勾选'));assert.equal(f.submissions(),0);}finally{f.dom.window.close();}
});
test('顺序审批两张，意见始终留空，核实列表移除且写入记录',async()=>{
  const f=await fixture();try{await f.scan();f.q('armed').checked=true;f.q('limit').value='2';f.click('start');await f.until(()=>f.status().includes('本轮已核实通过 2'));assert.equal(f.submissions(),2);const ledger=Object.values(f.storage)[0].ledger;assert.equal(Object.keys(ledger).length,2);assert.ok(Object.values(ledger).every(x=>x.state==='verified'));assert.equal(f.q('armed').checked,true);}finally{f.dom.window.close();}
});
test('未知确认弹窗会停止并锁定单据，不会点击确定或重试',async()=>{
  const f=await fixture({confirm:true});try{await f.scan();f.q('armed').checked=true;f.q('limit').value='2';f.click('start');await f.until(()=>f.status().includes('出现未识别的确认弹窗'));assert.equal(f.submissions(),1);assert.equal(Object.values(Object.values(f.storage)[0].ledger)[0].state,'submitted-unknown');f.w.document.querySelector('#detail').innerHTML='';await f.scan();f.click('start');await f.until(()=>f.status().includes('历史提交记录'));assert.equal(f.submissions(),1);}finally{f.dom.window.close();}
});
test('审批失败立即停止，后续单据不提交',async()=>{
  const f=await fixture({fail:true});try{await f.scan();f.q('armed').checked=true;f.q('limit').value='2';f.click('start');await f.until(()=>f.status().includes('审批失败'));assert.equal(f.submissions(),1);}finally{f.dom.window.close();}
});
test('扫描结果少于总数时拒绝启动',async()=>{
  const f=await fixture();try{f.w.document.querySelector('#total').textContent='共 31 条';f.w.document.querySelector('[role="tab"]').textContent='待处理 31';f.click('scan');await f.until(()=>f.status().includes('只识别 2 条'));assert.equal(f.submissions(),0);}finally{f.dom.window.close();}
});
test('已打开详情时禁止把当前详情当成列表中的另一张单据',async()=>{
  const f=await fixture();try{await f.scan();f.click('dry');await f.until(()=>f.status().includes('未点击审批'));f.q('armed').checked=true;f.click('start');await f.until(()=>f.status().includes('先关闭单据详情'));assert.equal(f.submissions(),0);}finally{f.dom.window.close();}
});

test('overflow:hidden 虚拟表格只有 5 行 DOM，仍扫描齐全部 31 张并恢复原位置',async()=>{
  const f=await fixture({count:31,virtual:true});
  try {await f.scan();assert.match(f.status(),/全部 31/);assert.equal(f.w.document.querySelectorAll('tbody tr').length,5);assert.equal(f.submissions(),0);assert.ok(f.q('items').textContent.includes('DEMO202610290031'));}
  finally {f.dom.window.close();}
});
test('按钮延迟启用，审批后保留详情并变为取消审核时，自动返回再核实',async()=>{
  const f=await fixture({count:2,keepDetail:true,loading:true});
  try {await f.scan();f.q('armed').checked=true;f.q('limit').value='2';f.click('start');await f.until(()=>f.status().includes('本轮已核实通过 2'));assert.equal(f.submissions(),2);assert.equal(f.w.document.querySelector('#detail').textContent,'');}
  finally {f.dom.window.close();}
});
test('页面计时器不可用且页签隐藏时，通过后台调度完成两张审批，不依赖前台',async()=>{
  const f=await fixture({count:2,keepDetail:true,loading:true,suspendedTimers:true});
  try {
    Object.defineProperty(f.w.document,'visibilityState',{configurable:true,value:'hidden'});
    f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));
    await f.scan();f.q('armed').checked=true;f.q('limit').value='2';f.click('start');
    await f.until(()=>f.status().includes('本轮已核实通过 2'));
    assert.equal(f.submissions(),2);
    assert.ok(f.messages.some(m=>m.type==='approval-wait'));
    assert.ok(Object.values(Object.values(f.storage)[0].ledger).every(v=>v.state==='verified'));
  } finally {f.dom.window.close();}
});
test('后台等待详情加载时点暂停，不会提交或处理后续单据',async()=>{
  const f=await fixture({count:2,loading:true,suspendedTimers:true});
  try {
    await f.scan();f.q('armed').checked=true;f.q('limit').value='2';f.click('start');
    await f.until(()=>f.w.document.querySelector('#detail button')?.disabled===true);
    f.click('stop');await f.until(()=>f.status().includes('已暂停；'));
    await sleep(30);assert.equal(f.submissions(),0);
  } finally {f.dom.window.close();}
});

test('不保存任何学习配置，仍自动确认审批通过弹窗并返回列表',async()=>{
  const f=await fixture({count:2,confirm:'approval',keepDetail:true});
  try {
    assert.equal(f.q('learnBack'),null);assert.equal(f.q('learnConfirm'),null);
    await f.scan();f.q('armed').checked=true;f.q('limit').value='2';f.click('start');
    await f.until(()=>f.status().includes('本轮已核实通过 2'));
    assert.equal(f.submissions(),2);
  } finally {f.dom.window.close();}
});
test('固定返回规则识别 YonBIP 返回图标；多个返回或非审批弹窗不误点',async()=>{
  const f=await fixture();
  try {
    const detail=f.w.document.querySelector('#detail');
    detail.innerHTML='<div class="back"><span></span></div>';
    assert.equal(f.w.ApproveDOM.fixedBack(f.w.document),detail.firstChild);
    detail.insertAdjacentHTML('beforeend','<button>返回</button>');
    assert.equal(f.w.ApproveDOM.fixedBack(f.w.document),null);
    detail.innerHTML='<div role="dialog"><p>是否确认删除审批通过记录？</p><button>确定</button></div>';
    assert.equal(f.w.ApproveDOM.fixedApprovalConfirm(f.w.document),null);
    detail.innerHTML='<div role="dialog"><p>是否确认审批通过？</p><button>确定</button><button>确认</button></div>';
    assert.equal(f.w.ApproveDOM.fixedApprovalConfirm(f.w.document),null);
  } finally {f.dom.window.close();}
});

test('日志查看记录切换页签；异常文本安全显示并去除网址查询参数',async()=>{
  const f=await fixture();
  try {
    f.click('viewlogs');assert.equal(f.q('logs').open,true);
    Object.defineProperty(f.w.document,'visibilityState',{value:'hidden',configurable:true});
    f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));
    f.w.dispatchEvent(new f.w.ErrorEvent('error',{message:'<img src=x onerror=alert(1)> https://example.com/path?token=SECRET'}));
    await f.until(()=>Object.values(f.storage)[0].audit.some(r=>r.event==='page-error'));
    const rows=Object.values(f.storage)[0].audit;
    assert.equal(rows.find(r=>r.event==='visibility').context.visibility,'hidden');
    assert.ok(!rows.find(r=>r.event==='page-error').detail.includes('SECRET'));
    f.q('logfilter').value='errors';f.q('logfilter').dispatchEvent(new f.w.Event('change'));
    assert.match(f.q('loglist').textContent,/页面脚本异常/);
    assert.ok(!f.q('loglist').textContent.includes('标签页切换'));
    assert.equal(f.q('loglist').querySelector('img'),null);
    assert.equal(f.submissions(),0);
  } finally {f.dom.window.close();}
});
test('后台通信异常自动展开日志，保留单据、步骤、后台状态及异常信息',async()=>{
  const f=await fixture({loading:true});
  try {
    await f.scan();
    Object.defineProperty(f.w.document,'visibilityState',{value:'hidden',configurable:true});
    const send=f.w.chrome.runtime.sendMessage;let fail=false;
    f.w.document.querySelector('a').addEventListener('click',()=>{fail=true;});
    f.w.chrome.runtime.sendMessage=async msg=>{
      if(fail&&msg.type==='approval-wait')throw Error('The message port closed');
      return send(msg);
    };
    f.click('start');await f.until(()=>f.status().includes('message port closed')&&!f.q('start').disabled);
    const audit=Object.values(f.storage)[0].audit;
    const error=audit.find(r=>r.event==='background-error');
    assert.equal(error.bill,'DEMO202610290001');
    assert.equal(error.context.visibility,'hidden');
    assert.equal(error.context.phase,'等待审批按钮就绪');
    assert.equal(error.level,'error');assert.ok(error.runId);
    assert.ok(audit.some(r=>r.event==='paused'&&r.data.stack.includes('message port closed')));
    assert.equal(f.q('logs').open,true);assert.equal(f.submissions(),0);
  } finally {f.dom.window.close();}
});
test('刷新后仍可查看旧日志与提交锁，旧版日志也可显示',async()=>{
  const key='approval-assistant:http://127.0.0.1:8080/nccloud/resources/ssctp/sscuser/sscapprove/list/index.html';
  const f=await fixture({initialStorage:{[key]:{audit:[{time:'2026-10-29T07:34:13.609Z',event:'paused',bill:'BILL1',detail:'旧版错误'}],ledger:{BILL1:{state:'submitted-unknown'}}}}});
  try {
    f.click('viewlogs');assert.match(f.q('loglist').textContent,/旧版错误/);
    await f.until(()=>Object.values(f.storage)[0].audit.some(r=>r.event==='page-ready'));
    assert.equal(Object.values(f.storage)[0].ledger.BILL1.state,'submitted-unknown');
  } finally {f.dom.window.close();}
});

test('真实 CSS 伪元素返回箭头没有文字，仍自动完成两张并返回列表',async()=>{
  const f=await fixture({count:2,keepDetail:true,pseudoBack:true});
  try {
    await f.scan();f.q('limit').value='2';f.click('start');
    await f.until(()=>f.status().includes('本轮已核实通过 2'));
    assert.equal(f.submissions(),2);
    const audit=Object.values(f.storage)[0].audit;
    const back=audit.filter(r=>r.event==='back-locate');
    assert.equal(back.length,2);assert.ok(back.every(r=>r.data.count===1&&r.data.rule.includes('.title-ctrl')));
    assert.equal(f.w.document.querySelector('#detail').textContent,'');
  } finally {f.dom.window.close();}
});
test('固定 CSS 返回规则只匹配详情工具栏，忽略其他同名图标且不在多个候选中猜测',async()=>{
  const f=await fixture();
  try {
    const detail=f.w.document.querySelector('#detail');
    const toolbar='<div class="detail-page-area"><div class="work-bar-area"><div class="title-ctrl"><div class="back-btn-hotkey-wrapper"><span class="back-btn iconfont icon icon-danjufanhuiicon"></span></div></div></div></div>';
    detail.innerHTML='<span class="back-btn icon-danjufanhuiicon"></span>'+toolbar+'<div hidden>'+toolbar+'</div>';
    const target=detail.querySelector('.detail-page-area .back-btn');
    assert.equal(target.textContent,'');assert.equal(f.w.ApproveDOM.fixedBack(f.w.document),target);
    detail.insertAdjacentHTML('beforeend',toolbar);
    assert.equal(f.w.ApproveDOM.fixedBack(f.w.document),null);
    assert.equal(f.w.ApproveDOM.backDiagnostics(f.w.document).count,2);
  } finally {f.dom.window.close();}
});

test('切页后已完成单据返回空虚拟表格：保留核实结果，恢复前台后继续下一张且不重复提交',async()=>{
  let savedRows=[],tableRef;
  const f=await fixture({count:2,keepDetail:true,pseudoBack:true,afterReturn:({w,table,count})=>{
    if(count!==1)return;
    Object.defineProperty(w.document,'visibilityState',{value:'hidden',configurable:true});
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    tableRef=table;savedRows=[...table.children];table.replaceChildren();
  }});
  try {
    await f.scan();f.q('limit').value='2';f.click('start');
    await f.until(()=>f.status().includes('后台列表等待渲染'));
    assert.equal(f.submissions(),1);
    assert.equal(Object.values(f.storage)[0].ledger.DEMO202610290001.state,'verified');
    const originalNow=f.w.Date.now;f.w.Date.now=()=>originalNow()+600000;
    await sleep(30);assert.equal(f.submissions(),1);assert.equal(f.q('start').disabled,true);
    Object.defineProperty(f.w.document,'visibilityState',{value:'visible',configurable:true});
    tableRef.replaceChildren(...savedRows);f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));
    await f.until(()=>f.status().includes('本轮已核实通过 2'));
    assert.equal(f.submissions(),2);
    const audit=Object.values(f.storage)[0].audit;
    const lastRun=audit.findLast(r=>r.event==='run-start').runId;
    assert.equal(audit.filter(r=>r.runId===lastRun&&r.event==='phase'&&r.detail==='扫描待处理列表').length,1);
    assert.ok(audit.some(r=>r.event==='table-wait'&&r.context.visibility==='hidden'));
    assert.ok(audit.some(r=>r.event==='table-ready'));
  } finally {f.dom.window.close();}
});
test('后台列表未渲染时手动暂停，已核实的第一张保留，不提交第二张',async()=>{
  const f=await fixture({count:2,keepDetail:true,afterReturn:({w,table,count})=>{
    if(count!==1)return;
    Object.defineProperty(w.document,'visibilityState',{value:'hidden',configurable:true});table.replaceChildren();
  }});
  try {
    await f.scan();f.q('limit').value='2';f.click('start');
    await f.until(()=>f.status().includes('后台列表等待渲染'));
    f.click('stop');await f.until(()=>!f.q('start').disabled);
    assert.equal(f.submissions(),1);
    const ledger=Object.values(f.storage)[0].ledger;
    assert.equal(ledger.DEMO202610290001.state,'verified');
    assert.equal(ledger.DEMO202610290002,undefined);
  } finally {f.dom.window.close();}
});
test('ResizeObserver 布局通知记为警告，不标记成审批失败',async()=>{
  const f=await fixture();
  try {
    f.w.dispatchEvent(new f.w.ErrorEvent('error',{message:'ResizeObserver loop completed with undelivered notifications.'}));
    await f.until(()=>Object.values(f.storage)[0].audit.some(r=>r.event==='layout-warning'));
    const entry=Object.values(f.storage)[0].audit.find(r=>r.event==='layout-warning');
    assert.equal(entry.level,'warn');assert.equal(f.submissions(),0);
    assert.ok(!Object.values(f.storage)[0].audit.some(r=>r.event==='paused'));
  } finally {f.dom.window.close();}
});

test('后台渲染验证按钮只检查帧更新和其他标签页状态，不提交审批或写提交锁',async()=>{
  const f=await fixture({continuousAck:true});
  try {
    f.click('probe');await f.until(()=>f.status().includes('后台渲染验证通过')&&!f.q('probe').disabled);
    assert.equal(f.submissions(),0);
    const saved=Object.values(f.storage)[0];assert.deepEqual(saved.ledger,{});
    assert.ok(saved.audit.some(r=>r.event==='render-probe-passed'));
    assert.equal(saved.audit.filter(r=>r.event==='render-probe').length,10);
    assert.ok(!saved.audit.some(r=>r.event==='submit-intent'));
    assert.ok(f.messages.some(m=>m.type==='approval-unlock'));
  } finally {f.dom.window.close();}
});
test('点击审批前连续会话检查失败时，不点击审批且保留提交意图用于核对',async()=>{
  const f=await fixture();
  try {
    await f.scan();const send=f.w.chrome.runtime.sendMessage;let checks=0;
    f.w.chrome.runtime.sendMessage=async msg=>msg.type==='approval-check'&&++checks===2?{ok:false,error:'后台连续连接已断开'}:send(msg);
    f.click('start');await f.until(()=>f.status().includes('连接已断开')&&!f.q('start').disabled);
    assert.equal(f.submissions(),0);
    assert.equal(Object.values(f.storage)[0].ledger.DEMO202610290001.state,'submitted-unknown');
  } finally {f.dom.window.close();}
});

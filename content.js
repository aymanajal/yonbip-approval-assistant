(() => {
  'use strict';
  if (document.getElementById('approval-assistant-host')) return;
  const D = globalThis.ApproveDOM;
  const host = document.createElement('div');
  host.id = 'approval-assistant-host';
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647';
  const ui = host.attachShadow({mode:'closed'});
  const themeBackground=chrome.runtime.getURL('assets/rei-background.png');
  ui.innerHTML = `<style>
    :host{all:initial}*{box-sizing:border-box}
    section{font:13px/1.55 system-ui,sans-serif;width:340px;color:#203951;background:#e7f2ff url("${themeBackground}") center top/340px auto no-repeat;border:1px solid #c4d9ed;border-radius:16px;box-shadow:0 14px 44px #35597e30;overflow:hidden;max-height:calc(100vh - 32px)}
    header{padding:12px 14px;background:#153a5de8;color:#f3f9ff;display:flex;justify-content:space-between;align-items:center;gap:8px}header b{font-size:12px;font-weight:600;letter-spacing:.1px}header button{background:transparent;color:#eef7ff;border:0;padding:0 4px;white-space:nowrap}
    .theme-art{height:146px;background:linear-gradient(180deg,transparent 65%,#f3f9ffeb)}.theme-art[hidden]{display:none}
    main{padding:10px 14px 14px;background:linear-gradient(#f3f9ffeb,#f6fafff5);max-height:calc(100vh - 230px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:#b2cce2 transparent}
    p{margin:0 0 10px;color:#4d637a}button{cursor:pointer;border:1px solid #bcd0e4;border-radius:8px;padding:7px 10px;background:#ffffffdf;color:#244765;font:inherit;transition:background .15s,box-shadow .15s}button:hover{background:#eaf4ff;box-shadow:0 2px 8px #4d75921a}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid #528ac0;outline-offset:2px}button:disabled{opacity:.45;cursor:default}
    .primary{background:#35658e;color:#fff;border-color:#35658e}.primary:hover{background:#294f74}.stop{color:#a24655;border-color:#dcbac3;background:#fff8fa}
    nav{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}label{display:block;margin:8px 0}input[type=checkbox]{accent-color:#477ba6}input[type=number]{width:65px;padding:4px;border:1px solid #bdd2e6;border-radius:6px;background:#fff;color:#244765}
    output{display:block;background:#e9f2fce6;border:1px solid #d2e2f0;padding:9px;border-radius:8px;white-space:pre-wrap;max-height:125px;overflow:auto;color:#31516c}small{display:block;margin-top:8px;color:#597188}details{margin-top:12px;border-top:1px solid #cdddea;padding-top:10px}summary{cursor:pointer;color:#3f607e}#items{max-height:140px;overflow:auto;font-size:11px;white-space:pre-wrap}a{color:#35658e}
    #loglist{max-height:240px;overflow:auto;margin-top:8px;font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere} .logrow{padding:7px;border-bottom:1px solid #d7e4f0}.logrow.error{background:#fff0f1;color:#912c3e}.logrow.warn{background:#fff9e9;color:#77551b}#logfilter{max-width:130px;padding:4px;border:1px solid #bdd2e6;border-radius:5px;background:white}#logstate{font-size:11px;white-space:pre-wrap;color:#43627c}
  </style><section><header><b>我的审核 · 顺序审批助手 v0.3.0</b><button id="collapse">收起</button></header><div class="theme-art" role="img" aria-label="绫波丽主题插画"></div><main>
    <p>全部待处理单据 · 不填写审批意见<br>逐张打开详情，遇到异常立即暂停。</p>
    <nav><button id="scan">① 扫描列表</button><button id="dry">② 试开一张</button></nav>
    <label><input id="armed" type="checkbox" checked> 启用真实审批（会提交“审批通过”）</label>
    <label><input id="continuous" type="checkbox" checked> 后台连续执行（保持审批页渲染）<small>运行时 Chrome 会显示调试提示；暂停或结束后自动释放。</small></label>
    <nav><button id="probe">验证后台渲染（不审批）</button></nav>
    <label>本轮最多 <input id="limit" type="number" min="1" max="500" value="1"> 张 <small>首次建议 1 张，流程核实后可改为全部数量。</small></label>
    <nav><button id="start" class="primary">开始顺序审批</button><button id="stop" class="stop">暂停</button><button id="viewlogs">查看日志</button><button id="export">导出日志</button></nav>
    <output id="status">待扫描。请先回到“待处理”列表。</output>
    <details id="logs"><summary>运行日志</summary><div id="logstate"></div><nav><select id="logfilter" aria-label="日志筛选"><option value="all">全部日志</option><option value="errors">异常与警告</option><option value="run">本次运行</option></select><button id="refreshlogs">刷新日志</button></nav><small id="logmeta">本机保存最近 2000 条；下方显示最近 200 条。</small><div id="loglist" aria-live="polite"></div></details>
    <details><summary>异常记录</summary><p>返回与审批确认已内置，无需设置。仅在提交结果不明确时核对异常记录。</p><nav><button id="reconcile">核对异常记录</button></nav><small>请先在系统审批历史核实结果，再核对记录。仍在待处理列表的单据不会自动解除锁定或重新提交。</small></details>
    <details><summary>本轮单据清单</summary><div id="items">尚未扫描</div></details>
  </main></section>`;
  document.documentElement.appendChild(host);
  const $ = id => ui.getElementById(id);
  let busy = false, cancelled = false, snapshot = [], audit = [], ledger = {}, config = {}, ready = false;
  let runId='',phaseName='待命',currentBill='',persistQueue=Promise.resolve(),lastHeartbeat=0,loggingError='';
  let activeLease=null,continuousState=null,actualTabActive=null;
  const version='0.3.0';
  const key = 'approval-assistant:' + location.origin + location.pathname;
  const stamp = () => new Date().toISOString();
  function status(s) { $('status').textContent = s; }
  function clean(value) {
    return String(value||'').replace(/https?:\/\/[^\s)]+/g,s=>{try{const u=new URL(s);return u.origin+u.pathname;}catch{return '[网址]';}}).slice(0,1800);
  }
  function context() {
    const result={version,runId,phase:phaseName,bill:currentBill,visibility:document.visibilityState,focused:document.hasFocus(),online:navigator.onLine,readyState:document.readyState,continuous:continuousState,tabActive:actualTabActive};
    try {result.approveButtons=D.buttons(document,'审批通过').length;result.completedButtons=D.buttons(document,'取消审核').length;result.dialogs=D.dialog(document).length;result.pending=D.total(document);}catch{}
    return result;
  }
  function renderLogs() {
    const state=context();
    $('logstate').textContent=`状态：${busy?'运行中':'空闲'} · ${state.continuous?.enabled?'持续渲染模拟':state.visibility==='visible'?'前台':'后台'}\n步骤：${phaseName}${currentBill?'\n单据：'+currentBill:''}`;
    const filter=$('logfilter').value;
    const rows=audit.filter(r=>filter==='errors'?['warn','error'].includes(r.level):filter==='run'?!!runId&&r.runId===runId:true).slice(-200).reverse();
    $('loglist').replaceChildren();
    for(const row of rows) {
      const el=document.createElement('div');el.className='logrow '+(row.level||'info');
      let time=row.time;try{time=new Date(row.time).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});}catch{}
      const c=row.context||{};
      el.textContent=`${time} [${row.level||'info'}] ${row.label||row.event}${row.bill?' · '+row.bill:''}\n${row.detail||''}${c.phase?'\n步骤：'+c.phase+' · '+(c.continuous?.enabled?'持续渲染模拟':c.visibility==='visible'?'前台':'后台'):''}${row.data?'\n'+JSON.stringify(row.data):''}`;
      $('loglist').append(el);
    }
    $('logmeta').textContent=loggingError?'日志保存异常：'+loggingError:`已保存 ${audit.length} 条，本次显示 ${rows.length} 条（最近在上）。`;
  }
  async function save() {
    const value=JSON.parse(JSON.stringify({audit,ledger,config}));
    const operation=persistQueue.catch(()=>{}).then(()=>chrome.storage.local.set({[key]:value}));
    persistQueue=operation.catch(()=>{});return operation;
  }
  const labels={'page-ready':'插件加载','visibility':'标签页切换','focus':'窗口焦点','pagehide':'页面离开','pageshow':'页面显示','freeze':'页面冻结','resume':'页面恢复','phase':'步骤变化','run-start':'任务开始','run-end':'任务结束','background-error':'后台通信异常','background-delay':'后台调度延迟','heartbeat':'运行心跳','wait-start':'开始等待','wait-end':'等待完成','wait-error':'等待异常','paused':'任务暂停或异常','submit-intent':'准备提交审批','submitted':'已点击审批通过','opened':'单据已打开','verified':'审批结果已核实','scanned':'扫描完成','stop-request':'手动暂停','page-error':'页面脚本异常','unhandled-error':'未处理的异步异常','confirm-click':'点击审批确认','render-probe':'后台渲染采样','render-probe-passed':'后台渲染验证通过','continuous-start':'后台连续模式启动','continuous-end':'后台连续模式结束','table-wait':'等待列表渲染','table-ready':'列表渲染恢复','layout-warning':'页面布局警告','back-locate':'返回控件定位','back-click':'返回列表'};
  async function log(event, bill='', detail='',options={}) {
    audit.push({time:stamp(),event,label:labels[event]||event,level:options.level||'info',bill,detail:clean(detail),runId,context:context(),...(options.data?{data:options.data}:{})});
    audit=audit.slice(-2000);renderLogs();
    try{await save();loggingError='';}catch(e){loggingError=clean(e.message);renderLogs();throw e;}
  }
  function diagnostic(event,detail='',options={}) {if(ready)void log(event,currentBill,detail,options).catch(()=>{});}
  async function phase(name,bill=currentBill) {phaseName=name;currentBill=bill;await log('phase',bill,name);}
  function check() { if (cancelled) throw Error('已暂停；已发出的审批请求无法撤回，请核实当前单据结果'); }
  async function checkSession() {
    check();
    if(!activeLease)return;
    const response=await chrome.runtime.sendMessage({type:'approval-check',token:activeLease});
    if(!response?.ok)throw Error(response?.error||'后台连续会话异常，已停止后续点击');
    check();
  }
  // Avoid chained timers in the website renderer when its Chrome tab is hidden.
  async function delay(ms) {
    const started=Date.now();
    try {
      const response=await chrome.runtime.sendMessage({type:'approval-wait',ms,token:activeLease});
      if(!response?.ok) throw Error(response?.error || '扩展后台等待失败，请重新加载插件并刷新页面');
      actualTabActive=response.tabActive??actualTabActive;
      const elapsed=Date.now()-started;
      if(elapsed>Math.max(3000,ms*3)) diagnostic('background-delay',`期望等待 ${ms}ms，实际 ${elapsed}ms`,{level:'warn',data:{requestedMs:ms,elapsedMs:elapsed,workerElapsedMs:response.workerElapsedMs,tabActive:response.tabActive}});
      if(busy&&Date.now()-lastHeartbeat>=10000){lastHeartbeat=Date.now();diagnostic('heartbeat','后台调度已响应',{data:{workerElapsedMs:response.workerElapsedMs,tabActive:response.tabActive,continuous:response.continuous}});}
    } catch(e) {diagnostic('background-error',e.message,{level:'error',data:{requestedMs:ms,elapsedMs:Date.now()-started}});throw e;}
  }
  async function wait(test, message, ms=25000,{pauseWhenHidden=false}={}) {
    const started=Date.now();diagnostic('wait-start',message,{data:{timeoutMs:ms}});
    // Observe the result before checking timeouts after a delayed background wake.
    // DOM mutations wake immediately; a worker timer provides the timeout fallback.
    return new Promise((resolve,reject)=>{
      let ended=false,queued=false,remaining=ms,last=Date.now();
      const observer=new MutationObserver(()=>{void inspect();});
      const visibility=()=>{last=Date.now();void inspect();};
      const stop=()=>finish(Error('已暂停；已发出的审批请求无法撤回，请核实当前单据结果'));
      function finish(error,value) {
        if(ended)return;ended=true;observer.disconnect();
        document.removeEventListener('visibilitychange',visibility);
        host.removeEventListener('approval-stop',stop);
        diagnostic(error?'wait-error':'wait-end',error?error.message:'条件已满足',{level:error?'error':'info',data:{elapsedMs:Date.now()-started}});
        if(error)reject(error);else resolve(value);
      }
      async function inspect() {
        if(ended)return;
        try {
          check();const value=test();if(value){finish(null,value);return;}
          if(remaining<=0&&!(pauseWhenHidden&&document.visibilityState==='hidden')){finish(Error(message));return;}
          if(queued)return;queued=true;
          await delay(250);queued=false;
          if(ended)return;
          const now=Date.now();
          // A long renderer suspension is not evidence that the server failed.
          if(!(pauseWhenHidden&&document.visibilityState==='hidden'))remaining-=Math.min(1000,Math.max(0,now-last));last=now;
          void inspect();
        } catch(e) {finish(e);}
      }
      observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','disabled','aria-disabled']});
      document.addEventListener('visibilitychange',visibility);
      host.addEventListener('approval-stop',stop);
      void inspect();
    });
  }
  function noDetail() { return !D.buttons(document,'审批通过').length && !D.buttons(document,'取消审核').length && !D.visible(document.querySelector('#ssc-bill-detail-iframe')); }
  function listGuard() {
    if(!D.pending(document)) throw Error('请切换到“待处理”标签');
    if(!noDetail()) throw Error('请先关闭单据详情，返回待处理列表');
    if(D.dialog(document).length) throw Error('请先关闭页面弹窗');
  }
  // Some YonBIP virtual tables scroll programmatically with overflow:hidden.
  function scrollContainers() {
    const result=[];
    for(let node=D.rows(document)[0]?.link.parentElement;node;node=node.parentElement) {
      if(node.clientHeight>0 && node.scrollHeight>node.clientHeight+10 && D.visible(node)) result.push(node);
    }
    return result;
  }
  async function waitForRows() {
    const rows=D.rows(document);
    if(rows.length || D.total(document)===0)return rows;
    const previousPhase=phaseName,previousStatus=$('status').textContent;
    await phase('等待列表渲染');
    diagnostic('table-wait','列表数量大于 0，但尚无已渲染的行；保留进度等待恢复',{level:'warn'});
    status(document.visibilityState==='hidden'?'后台列表等待渲染；切回审批标签页后会自动继续。':'列表正在刷新，等待单据行加载…');
    const result=await wait(()=>{
      const next=D.rows(document);
      return next.length?next:D.total(document)===0?[]:false;
    },'切回页面后列表仍未渲染，请检查页面加载状态',25000,{pauseWhenHidden:true});
    phaseName=previousPhase;status(previousStatus);diagnostic('table-ready','列表渲染已恢复',{data:{rows:result.length}});
    return result;
  }
  async function waitForForeground(reason) {
    const previous=$('status').textContent;
    diagnostic('table-wait',reason,{level:'warn'});
    status('后台虚拟表格等待渲染；切回审批标签页后自动继续，不会重复提交。');
    await wait(()=>document.visibilityState==='visible','等待审批标签页恢复前台',25000,{pauseWhenHidden:true});
    status(previous);diagnostic('table-ready','审批标签页已恢复前台');
  }
  async function scan(retried=false) {
    await phase('扫描待处理列表');
    listGuard();
    const count=D.total(document), found=new Map();
    if(count>0)await waitForRows();
    const collect=()=>{for(const r of D.rows(document)) found.set(r.bill,{bill:r.bill,text:r.text});};
    const containers=scrollContainers();
    const positions=containers.map(el=>el.scrollTop);
    try {
      collect();
      for(const scroller of containers) {
        scroller.scrollTop=0; await delay(400);
        let steps=0,last=-1;
        while(true) {
          check();collect();
          if(found.size===count || scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-3) break;
          if(++steps>200 || scroller.scrollTop===last) break;
          last=scroller.scrollTop;
          scroller.scrollTop+=Math.max(40,scroller.clientHeight*0.65);
          await delay(400);
        }
        if(found.size===count) break;
      }
    } finally {
      containers.forEach((el,i)=>el.scrollTop=positions[i]);
      await delay(300);
    }
    if(D.total(document)!==count) throw Error('扫描期间列表数量发生变化，请重新扫描');
    if(found.size!==count) {
      if(document.visibilityState==='hidden'&&!retried){await waitForForeground('后台扫描未获取完整虚拟行');return scan(true);}
      throw Error(`共 ${count} 条，只识别 ${found.size} 条；滚动容器 ${containers.length} 个。请检查虚拟表格或每页条数。`);
    }
    // Sort by displayed row number rather than the viewport where scanning began.
    return [...found.values()].sort((a,b)=>{
      const rowNo=x=>Number(x.text.split(' | ').find(t=>/^\d+$/.test(t.trim()))||0);
      return rowNo(a)-rowNo(b);
    });
  }
  async function findRow(bill,retried=false) {
    await waitForRows();
    let r=D.rows(document).find(x=>x.bill===bill);
    if(r) return r;
    for(const scroller of scrollContainers()) {
      scroller.scrollTop=0;
      let last=-1;
      for(let n=0;n<200;n++) {
        await delay(300);check();
        r=D.rows(document).find(x=>x.bill===bill);if(r)return r;
        if(scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-3 || last===scroller.scrollTop)break;
        last=scroller.scrollTop;
        scroller.scrollTop+=Math.max(40,scroller.clientHeight*0.65);
      }
    }
    if(document.visibilityState==='hidden'&&!retried){await waitForForeground('后台尚未渲染下一张单据：'+bill);return findRow(bill,true);}
    throw Error('列表找不到单据：'+bill);
  }
  async function open(bill) {
    await phase('打开单据',bill);
    listGuard();
    const row=await findRow(bill);await checkSession();row.link.click();
    await wait(()=>D.buttons(document,'审批通过').length===1,'打开详情超时');
    // Each click starts from a uniquely located row; never approve an already-open detail.
    if(D.dialog(document).length) throw Error('详情打开时存在弹窗，请人工检查');
    await log('opened',bill);
  }
  function watchResult() {
    const signals = new Set();
    const selector='[role="alert"],.u-message,.ant-message,.nc-message,.u-notification,.ant-notification';
    const old=new Map([...document.querySelectorAll(selector)].map(el=>[el,el.textContent]));
    const observer=new MutationObserver(()=>{
      for(const el of document.querySelectorAll(selector)) {
        if(!D.visible(el) || old.get(el)===el.textContent) continue;
        const text=D.norm(el.textContent);
        if(/失败|错误|异常|无权限|不允许|必填|不能为空/.test(text)) signals.add('error:'+text);
        else if(/(?:审批|审核|处理|操作|提交).*成功|成功.*(?:审批|审核|处理)/.test(text)) signals.add('success:'+text);
      }
    });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style']});
    return {signals,close:()=>observer.disconnect()};
  }
  function emptyOpinion() {
    const fields=[...document.querySelectorAll('textarea,input:not([type]),input[type="text"]')].filter(D.visible);
    if(fields.some(el=>el.value?.trim())) throw Error('详情中存在已填写的输入框，请人工检查并清空审核意见后重新开始');
  }
  async function approve(item, beforeCount, expected) {
    const bill=item.bill;
    if(D.total(document)!==beforeCount)throw Error('待处理数量与运行清单不一致，请重新扫描后核实');
    await open(bill);
    await phase('等待审批按钮就绪',bill);
    const button=await wait(()=>{
      const list=D.buttons(document,'审批通过');
      if(list.length>1) throw Error('发现多个审批通过按钮，请人工核实');
      return list.length===1 && D.enabled(list[0]) ? list[0] : false;
    },'详情加载后审批按钮仍不可用，请检查权限或单据状态');
    emptyOpinion();
    const watch=watchResult();
    let confirmed=false, sawSuccess=false,confirmPending=false,confirmError=null,resultActive=true;
    try {
      check();
      ledger[bill]={state:'submitted-unknown',time:stamp()};
      await phase('提交审批',bill);
      await log('submit-intent',bill,'意见留空；提交锁已保存');
      await checkSession();button.click();diagnostic('submitted','意见留空');phaseName='等待审批结果';
      // A failed continuous-session check in delay() stops this wait before more clicks.
      await wait(()=>{
        if(confirmError)throw confirmError;
        const error=[...watch.signals].find(x=>x.startsWith('error:')); if(error) throw Error(error.slice(6));
        // YonBIP keeps the completed document open and changes its toolbar.
        const completedToolbar=!D.buttons(document,'审批通过').length && D.buttons(document,'取消审核').length===1;
        sawSuccess=completedToolbar || [...watch.signals].some(x=>x.startsWith('success:'));
        if(sawSuccess) return true;
        if(noDetail() && D.pending(document)) {
          const current=D.total(document);
          if(current===beforeCount-1 && !D.rows(document).some(r=>r.bill===bill)) return true;
        }
        const dialogs=D.dialog(document);
        if(dialogs.length) {
          if(confirmed||confirmPending) return false;
          const confirmButton=D.fixedApprovalConfirm(document);
          if(!confirmButton) throw Error('出现未识别的确认弹窗，已暂停；请人工检查当前单据，避免重复提交');
          confirmPending=true;
          void checkSession().then(()=>{if(!resultActive)return;confirmed=true;confirmPending=false;diagnostic('confirm-click','固定审批确认规则已匹配');confirmButton.click();}).catch(e=>{confirmError=e;confirmPending=false;});
        }
        return false;
      },'提交后未识别明确结果，已锁定该单据，请人工核实',30000);
      if(!noDetail()) {
        await phase('返回待处理列表',bill);
        diagnostic('back-locate','检查详情工具栏返回控件',{data:D.backDiagnostics(document)});
        const back=await wait(()=>D.fixedBack(document),'已观察到完成状态，但返回控件仍无法唯一定位，请查看返回定位日志',15000);
        await checkSession();diagnostic('back-click','固定返回规则已匹配');back.click();
        await wait(noDetail,'返回列表超时');
      }
      await phase('核实待处理数量变化',bill);
      await wait(()=>D.pending(document) && D.total(document)===beforeCount-1,'返回后待处理数量未更新，请人工核实');
      const fresh=expected.filter(x=>x.bill!==bill);
      if(expected.length!==beforeCount || fresh.length!==beforeCount-1)throw Error('运行清单与单张审批不一致，请人工核实，禁止自动重试');
      // Keep the frozen startup list. Hidden virtual tables may temporarily have no rows.
      // Explicit completion + updated pending count is enough to retain this result;
      // opening the next document still requires locating its exact bill number.
      if(!sawSuccess && fresh.length && !D.rows(document).length)await waitForRows();
      await wait(()=>!D.rows(document).some(x=>x.bill===bill),'完成单据仍出现在待处理列表，请人工核实',25000,{pauseWhenHidden:true});
      ledger[bill]={state:'verified',time:stamp()};
      await log('verified',bill,sawSuccess?'成功提示或完成工具栏 + 待处理数量减少 1；沿用运行清单':'待处理数量减少 1 且已渲染列表无该单据');
      return fresh;
    } finally {resultActive=false;watch.close();}
  }
  function renderItems() { $('items').textContent=snapshot.map((x,i)=>`${i+1}. ${x.text}`).join('\n') || '当前无待处理单据'; }
  async function job(fn) {
    if(busy || !ready) return;
    busy=true; cancelled=false;
    runId=Date.now().toString(36)+'-'+Array.from(crypto.getRandomValues(new Uint32Array(2))).join('-');currentBill='';phaseName='准备任务';let outcome='completed';
    for(const id of ['scan','dry','start','reconcile','probe']) $(id).disabled=true;
    try {await log('run-start','','用户启动任务');await fn();} catch(e) {outcome=cancelled?'cancelled':'error';status(e.message);$('logs').open=true;try {await log('paused',currentBill,e.message,{level:cancelled?'warn':'error',data:{stack:clean(e.stack)}});}catch{status(e.message+'（日志保存失败）');}}
    finally {await log('run-end',currentBill,outcome,{level:outcome==='error'?'error':'info'}).catch(()=>{});busy=false;for(const id of ['scan','dry','start','reconcile','probe']) $(id).disabled=false;renderLogs();}
  }
  $('scan').onclick=()=>job(async()=>{ status('扫描中…'); snapshot=await scan(); renderItems(); status(`已识别全部 ${snapshot.length} 张。请核对清单，再试开一张。`); await log('scanned','',String(snapshot.length)); });
  $('dry').onclick=()=>job(async()=>{ if(!snapshot.length) throw Error('请先扫描列表'); await open(snapshot[0].bill); status(`已打开 ${snapshot[0].bill}，未点击审批。内置返回控件${D.fixedBack(document)?'已识别':'尚未识别'}；查看后返回列表。`); });
  async function exclusive(fn) {
    // Internal HTTP pages do not expose randomUUID; getRandomValues works there.
    const token=Array.from(crypto.getRandomValues(new Uint8Array(16)), b=>b.toString(16).padStart(2,'0')).join('');
    const lock=await chrome.runtime.sendMessage({type:'approval-lock',token,continuous:$('continuous').checked});
    if(!lock?.ok) throw Error(lock?.error || '无法取得运行锁');
    activeLease=token;continuousState=lock.continuous||null;
    try {
      await log('continuous-start','',continuousState?.enabled?'后台连续模式已启用，审批页保持渲染':'普通模式：不模拟前台渲染');
      const data=(await chrome.storage.local.get(key))[key]||{};
      ledger=data.ledger||{};config=data.config||{};
      await fn();
    } finally {
      try{const response=await chrome.runtime.sendMessage({type:'approval-unlock',token});if(!response?.ok)throw Error(response?.error||'运行会话释放失败');}
      finally{activeLease=null;continuousState=null;diagnostic('continuous-end','运行会话已结束，后台渲染模拟已请求释放');}
    }
  }
  $('probe').onclick=()=>job(()=>exclusive(async()=>{
    if(!continuousState?.enabled)throw Error('请勾选后台连续执行后再验证');
    await phase('验证后台渲染（不审批）','');
    let frames=0,previous=0,handle=null,active=true;
    const samples=[];
    const frame=()=>{if(!active)return;frames++;handle=requestAnimationFrame(frame);};
    handle=requestAnimationFrame(frame);
    try {
      for(let i=0;i<10;i++) {
        check();status(`后台渲染验证 ${i+1}/10：请切换到其他 Chrome 标签页，约 10 秒后回来看结果。不会审批。`);
        await delay(1000);check();
        const sample={frames,delta:frames-previous,tabActive:actualTabActive,visibility:document.visibilityState};previous=frames;samples.push(sample);
        diagnostic('render-probe','采样后台动画帧',{data:sample});
      }
    } finally {active=false;if(handle!==null)cancelAnimationFrame(handle);}
    const background=samples.filter(s=>s.tabActive===false);
    if(!background.length){status('渲染测试结束；未检测到切换到其他标签页，请再验证一次。未提交审批。');return;}
    if(!background.every(s=>s.delta>0&&s.visibility==='visible'))throw Error('后台渲染采样未全部通过，未提交审批，请导出日志检查');
    status('后台渲染验证通过：切到其他标签页期间仍有动画帧更新。未提交审批。');
    await log('render-probe-passed','','后台采样均持续渲染',{data:{backgroundSamples:background.length}});
  }));
  $('start').onclick=()=>job(()=>exclusive(async()=>{
    if(!$('armed').checked) throw Error('请勾选启用真实审批，或先使用“试开一张”');
    const limit=Number($('limit').value);
    if(!Number.isInteger(limit)||limit<1||limit>500) throw Error('本轮数量需为 1—500 的整数');
    if(!snapshot.length) throw Error('请先扫描列表');
    const fresh=await scan();
    if(fresh.length!==snapshot.length || fresh.some(x=>!snapshot.some(y=>y.bill===x.bill))) throw Error('列表已变化，请重新扫描并核对清单');
    const queue=snapshot.slice(0,limit);
    for(const item of queue) if(ledger[item.bill]) throw Error(`${item.bill} 有历史提交记录（${ledger[item.bill].state}），请先核对，禁止自动重复审批`);
    let count=fresh.length, done=0;
    for(const item of queue) {
      check(); status(`正在处理 ${done+1}/${queue.length}\n${item.bill}`);
      const remaining=await approve(item,count,snapshot); count=remaining.length; done++; snapshot=remaining; renderItems();
      await delay(1000);
    }
    status(`本轮已核实通过 ${done} 张，剩余 ${count} 张。`);
  }));
  $('stop').onclick=()=>{diagnostic('stop-request','用户点击暂停',{level:'warn'});cancelled=true;host.dispatchEvent(new Event('approval-stop'));status('已请求暂停。已提交的请求需等待或人工核实；不会重试。');};
  $('reconcile').onclick=()=>job(async()=>{
    listGuard(); const fresh=await scan();
    const records=Object.entries(ledger).filter(([,v])=>v.state==='submitted-unknown');
    if(!records.length) throw Error('没有待核对的提交记录');
    for(const [bill] of records) {
      if(!fresh.some(x=>x.bill===bill)) {
        if(confirm(`${bill} 已不在待处理列表。请先在系统“已处理/审批历史”核实。\n确认已核实处理完成？（取消则保留锁定）`)) {ledger[bill]={state:'manually-verified',time:stamp()};await log('manual-verified',bill);}
      } else if(confirm(`${bill} 仍在待处理列表。只有确认上一次审批未生效、没有处理中请求时才能解除锁定。\n确认已核实，可允许下次重新审批？`)) {delete ledger[bill];await log('manual-unlock',bill);}
    }
    snapshot=fresh; renderItems(); status('核对结束。请重新扫描后开始下一轮。');
  });
  $('export').onclick=()=>{
    const blob=new Blob([JSON.stringify({origin:location.origin,version,exportedAt:stamp(),state:context(),audit,ledger},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob), a=document.createElement('a');a.href=url;a.download='审批日志-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('collapse').onclick=()=>{const main=ui.querySelector('main');main.hidden=!main.hidden;ui.querySelector('.theme-art').hidden=main.hidden;$('collapse').textContent=main.hidden?'展开':'收起';};
  $('viewlogs').onclick=()=>{$('logs').open=!$('logs').open;renderLogs();if($('logs').open)$('logs').scrollIntoView?.({block:'nearest'});};
  $('refreshlogs').onclick=renderLogs;$('logfilter').onchange=renderLogs;
  document.addEventListener('visibilitychange',()=>{diagnostic('visibility',document.visibilityState);renderLogs();});
  for(const type of ['freeze','resume'])document.addEventListener(type,()=>diagnostic(type,document.visibilityState,{level:type==='freeze'?'warn':'info'}));
  for(const type of ['pagehide','pageshow','focus','blur'])window.addEventListener(type,e=>diagnostic(type==='blur'?'focus':type,type+(e.persisted?' · 缓存恢复':''),{level:type==='pagehide'?'warn':'info'}));
  window.addEventListener('pagehide',()=>{if(activeLease){cancelled=true;host.dispatchEvent(new Event('approval-stop'));void chrome.runtime.sendMessage({type:'approval-unlock',token:activeLease}).catch(()=>{});}});
  window.addEventListener('error',e=>{
    const layout=/^ResizeObserver loop (?:completed with undelivered notifications\.?|limit exceeded\.?)/.test(e.message||'');
    diagnostic(layout?'layout-warning':'page-error',e.message,{level:layout?'warn':'error'});
  });
  window.addEventListener('unhandledrejection',e=>diagnostic('unhandled-error',e.reason?.message||String(e.reason),{level:'error'}));
  chrome.storage.local.get(key).then(async data=>{const s=data[key]||{};audit=(s.audit||[]).slice(-2000);ledger=s.ledger||{};config=s.config||{};ready=true;renderLogs();await log('page-ready','','插件已加载，等待用户操作');}).catch(e=>{loggingError=clean(e.message);status('无法读取或保存本地记录，已禁用运行；请检查插件存储权限');ready=false;renderLogs();});
})();

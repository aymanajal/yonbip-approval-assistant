'use strict';
if(typeof importScripts==='function'){importScripts('config.js');importScripts('continuous.js');}
// Serialize lock requests; session storage survives service worker suspension.
let chain = Promise.resolve();
const lostSessions=new Set(),owners=new Map();
async function releaseContinuous(tabId) {owners.delete(tabId);await ContinuousGuard.stop(tabId);lostSessions.delete(tabId);}
const allowedOrigins=typeof APPROVAL_ORIGINS==='undefined'?['http://127.0.0.1:8080','http://127.0.0.1:9080']:APPROVAL_ORIGINS;
const allowedSender=sender=>{
  if(!sender.tab||!sender.url)return false;
  try{const url=new URL(sender.url);return allowedOrigins.includes(url.origin)&&url.pathname.startsWith('/nccloud/resources/ssctp/sscuser/sscapprove/list/');}catch{return false;}
};
async function assertLease(sender,token) {
  if(!allowedSender(sender))throw Error('无效运行来源');
  if(!token)return null;
  const key='lock:'+new URL(sender.url).origin;
  const lock=(await chrome.storage.session.get(key))[key];
  if(!lock || lock.token!==token || lock.tab!==sender.tab.id || lock.frame!==sender.frameId || lock.document!==sender.documentId)throw Error('运行会话已失效，请核实当前单据后重新启动');
  if(lock.continuous?.enabled && (lock.continuous.state!=='attached'||lostSessions.has(sender.tab.id)))throw Error('后台连续连接已断开，已停止后续点击；请核实当前单据后重新启动');
  return lock;
}
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if(msg?.type==='approval-check') {
    assertLease(sender,msg.token).then(lock=>reply({ok:true,continuous:lock?.continuous||null})).catch(e=>reply({ok:false,error:e.message}));return true;
  }
  if(msg?.type==='approval-wait') {
    if(!allowedSender(sender) || !Number.isInteger(msg.ms) || msg.ms<0 || msg.ms>2000) {
      reply({ok:false,error:'无效的后台等待请求'});return;
    }
    // This timer belongs to the extension worker, not the throttled website.
    const receivedAt=Date.now();
    assertLease(sender,msg.token).then(()=>{
      setTimeout(()=>assertLease(sender,msg.token).then(lock=>reply({ok:true,workerElapsedMs:Date.now()-receivedAt,tabActive:sender.tab.active,continuous:lock?.continuous||null})).catch(e=>reply({ok:false,error:e.message})),msg.ms);
    }).catch(e=>reply({ok:false,error:e.message}));
    return true;
  }
  if (!['approval-lock','approval-unlock'].includes(msg?.type)) return;
  chain = chain.catch(()=>{}).then(async()=>{
    if (!allowedSender(sender) || !msg.token) throw Error('无效运行来源');
    const origin = new URL(sender.url).origin;
    const key = 'lock:' + origin;
    const lock = (await chrome.storage.session.get(key))[key];
    if(msg.type==='approval-lock') {
      if(lock && !(lock.tab===sender.tab.id && lock.frame===sender.frameId && lock.document!==sender.documentId)) {
        reply({ok:false,error:'同一环境已有审批任务运行。请先在原页面暂停；若页面已离开，请关闭原标签页释放锁。'}); return;
      }
      const originalAutoDiscardable=lock?.tab===sender.tab.id ? lock.originalAutoDiscardable : sender.tab.autoDiscardable!==false;
      await chrome.tabs.update(sender.tab.id,{autoDiscardable:false});
      let continuous=null;
      try {
        if(lock?.continuous?.enabled)await releaseContinuous(lock.tab);
        if(msg.continuous){owners.set(sender.tab.id,msg.token);continuous=await ContinuousGuard.start(sender.tab.id,origin);lostSessions.delete(sender.tab.id);}
        await chrome.storage.session.set({[key]:{tab:sender.tab.id,frame:sender.frameId,document:sender.documentId,token:msg.token,originalAutoDiscardable,continuous,topUrl:sender.tab.url||null}});
      } catch(e) {
        if(continuous?.enabled)await releaseContinuous(sender.tab.id);else owners.delete(sender.tab.id);
        await chrome.tabs.update(sender.tab.id,{autoDiscardable:originalAutoDiscardable});throw e;
      }
      reply({ok:true,continuous});return;
    } else if(lock?.token===msg.token && lock.tab===sender.tab.id) {
      if(lock.continuous?.enabled)await releaseContinuous(lock.tab);
      await chrome.tabs.update(sender.tab.id,{autoDiscardable:lock.originalAutoDiscardable!==false});
      await chrome.storage.session.remove(key);
    }
    reply({ok:true});
  }).catch(e=>reply({ok:false,error:e.message}));
  return true;
});
chrome.debugger?.onDetach.addListener((source,reason)=>{
  const token=owners.get(source.tabId);lostSessions.add(source.tabId);owners.delete(source.tabId);
  chain=chain.catch(()=>{}).then(async()=>{
    const all=await chrome.storage.session.get(null);
    for(const key of Object.keys(all)) {
      const lock=all[key];
      if(key.startsWith('lock:')&&lock.tab===source.tabId&&lock.continuous?.enabled&&(token?token===lock.token:!owners.has(source.tabId))) {
        lock.continuous={...lock.continuous,state:'detached',reason};await chrome.storage.session.set({[key]:lock});
      }
    }
  });
});
chrome.tabs.onRemoved.addListener(tabId=>{
  chain=chain.catch(()=>{}).then(async()=>{
    const all=await chrome.storage.session.get(null);
    const keys=Object.keys(all).filter(k=>k.startsWith('lock:')&&all[k].tab===tabId);
    if(keys.length) await chrome.storage.session.remove(keys);
  });
});
chrome.tabs.onUpdated?.addListener((tabId,change)=>{
  if(!change.url)return;
  chain=chain.catch(()=>{}).then(async()=>{
    const all=await chrome.storage.session.get(null);
    for(const key of Object.keys(all)) {
      const lock=all[key];
      if(!key.startsWith('lock:')||lock.tab!==tabId||!lock.topUrl||lock.topUrl===change.url)continue;
      if(lock.continuous?.enabled)await releaseContinuous(tabId);
      try{await chrome.tabs.update(tabId,{autoDiscardable:lock.originalAutoDiscardable!==false});}catch{}
      await chrome.storage.session.remove(key);
    }
  });
});

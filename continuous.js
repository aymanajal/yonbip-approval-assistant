'use strict';
// Fixed protocol commands only. No caller-controlled target, expression or CDP method.
globalThis.ContinuousGuard={
  async start(tabId,expectedOrigin) {
    if(!chrome.debugger)throw Error('后台连续模式需要 Chrome debugger 权限，请先允许新版插件权限');
    const target={tabId};let attached=false;
    try {
      await chrome.debugger.attach(target,'1.3');attached=true;
      const origin=await chrome.debugger.sendCommand(target,'Runtime.evaluate',{expression:'location.origin',returnByValue:true});
      if(origin?.exceptionDetails || origin?.result?.value!==expectedOrigin)throw Error('审批标签页来源不一致，未启用后台连续模式');
      await chrome.debugger.sendCommand(target,'Emulation.setFocusEmulationEnabled',{enabled:true});
      const state=await chrome.debugger.sendCommand(target,'Runtime.evaluate',{expression:'document.visibilityState',returnByValue:true});
      if(state?.exceptionDetails || state?.result?.value!=='visible')throw Error('Chrome 未能保持审批页渲染，已停止启动');
      return {enabled:true,state:'attached',mechanism:'focus-emulation'};
    } catch(e) {
      if(attached)await this.stop(tabId);
      throw Error('后台连续模式未启动：'+e.message);
    }
  },
  async stop(tabId) {
    if(!chrome.debugger)return;
    const target={tabId};
    try{await chrome.debugger.sendCommand(target,'Emulation.setFocusEmulationEnabled',{enabled:false});}catch{}
    try{await chrome.debugger.detach(target);}catch{}
  }
};

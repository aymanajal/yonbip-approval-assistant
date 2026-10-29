/* DOM adapter: no application internals, API requests, or credentials. */
(function (root) {
  'use strict';
  const norm = s => String(s || '').replace(/\s+/g, '').trim();
  function visible(el) {
    if (!el || !el.isConnected) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = n.ownerDocument.defaultView.getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || n.hidden || n.getAttribute('aria-hidden') === 'true') return false;
    }
    return el.getClientRects().length > 0;
  }
  const enabled = el => !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !/(^|\s)(disabled|is-disabled)(\s|$)/.test(el.className || '');
  function buttons(doc, name) {
    return [...doc.querySelectorAll('button,[role="button"],input[type="button"]')].filter(el => visible(el) && norm(el.innerText || el.textContent || el.value) === norm(name));
  }
  function rows(doc) {
    const result = new Map();
    for (const row of doc.querySelectorAll('tr,[role="row"]')) {
      if (!visible(row)) continue;
      const cells = [...row.querySelectorAll('td,[role="cell"], [role="gridcell"]')];
      if (cells.length < 4) continue;
      for (const a of row.querySelectorAll('a,[role="link"]')) {
        const bill = norm(a.innerText || a.textContent);
        if (!visible(a) || !/^(?=.*\d)[A-Z0-9][A-Z0-9._/-]{7,63}$/i.test(bill)) continue;
        if (result.has(bill) && result.get(bill).link !== a) throw Error('发现重复单据编号，无法唯一定位：' + bill);
        result.set(bill, {bill, link:a, text:cells.map(c => (c.innerText || c.textContent || '').trim()).join(' | ')});
      }
    }
    return [...result.values()];
  }
  function total(doc) {
    // The footer keeps the old total after approval; the pending tab updates first.
    const tabs=[...doc.querySelectorAll('[role="tab"]')].filter(el=>visible(el) && /^待处理/.test(norm(el.textContent)) && (el.getAttribute('aria-selected')==='true' || /(^|[\s-])active([\s-]|$)|selected/.test(el.className||'')));
    if(tabs.length===1) {
      const match=norm(tabs[0].textContent).match(/^待处理(\d+)$/);
      if(match) return Number(match[1]);
    }
    const text = doc.body.innerText || doc.body.textContent;
    const matches = [...text.matchAll(/共\s*(\d+)\s*条/g)].map(m => Number(m[1]));
    const unique = [...new Set(matches)];
    if (unique.length !== 1) throw Error('无法唯一识别“共 N 条”，请回到待处理列表');
    return unique[0];
  }
  function pending(doc) {
    return [...doc.querySelectorAll('[role="tab"]')].some(el => visible(el) && /^待处理/.test(norm(el.textContent)) && (el.getAttribute('aria-selected') === 'true' || /(^|[\s-])active([\s-]|$)|selected/.test(el.className || '')));
  }
  function dialog(doc) {
    return [...doc.querySelectorAll('[role="dialog"],.u-modal,.ant-modal,.nc-modal')].filter(visible);
  }
  function uniqueButton(doc, name) {
    const list = buttons(doc, name).filter(enabled);
    if (list.length !== 1) throw Error('需要唯一且可用的“' + name + '”按钮，当前 ' + list.length + ' 个');
    return list[0];
  }
  function locateBack(doc) {
    // Verified in YonBIP: the arrow is CSS ::before, not span.textContent.
    const selector='.detail-page-area .work-bar-area .title-ctrl .back-btn.icon-danjufanhuiicon';
    const toolbar=[...doc.querySelectorAll(selector)].filter(el=>visible(el)&&enabled(el));
    if(toolbar.length) return {element:toolbar.length===1?toolbar[0]:null,rule:selector,candidates:toolbar};
    const controls=[...doc.querySelectorAll('button,a,[role="button"],[title],[aria-label]')].filter(el=>visible(el)&&enabled(el));
    const names=new Set(['返回','返回列表','关闭详情']);
    const explicit=controls.filter(el=>names.has(norm(el.getAttribute('title')))||names.has(norm(el.getAttribute('aria-label')))||names.has(norm(el.innerText||el.textContent)));
    const icons=[...doc.querySelectorAll('i,span')].filter(el=>visible(el)&&!el.children.length&&norm(el.textContent)==='').map(el=>el.closest('button,a,[role="button"]')||el.parentElement);
    const candidates=[...new Set([...explicit,...icons])].filter(el=>visible(el)&&enabled(el));
    // Nested labels and their parent button represent one control.
    const unique=candidates.filter(el=>!candidates.some(other=>other!==el&&other.contains(el)));
    return {element:unique.length===1?unique[0]:null,rule:'显式返回标签或文字图标',candidates:unique};
  }
  const fixedBack=doc=>locateBack(doc).element;
  function backDiagnostics(doc) {
    const result=locateBack(doc);
    return {rule:result.rule,count:result.candidates.length,candidates:result.candidates.slice(0,8).map(el=>({tag:el.tagName,class:String(el.className||''),title:el.getAttribute('title'),label:el.getAttribute('aria-label')}))};
  }
  function fixedApprovalConfirm(doc) {
    const candidates=new Set();
    for(const modal of dialog(doc)) {
      const text=norm(modal.innerText||modal.textContent);
      if(/失败|错误|异常|驳回|删除|撤回|取消审核/.test(text)) continue;
      if(!/(?:确认|确定|是否).*(?:审批通过|审核通过|通过审批|通过审核)|(?:审批通过|审核通过).*(?:确认|确定|是否)/.test(text)) continue;
      for(const name of ['确定','确认','是','审批通过','确认审批']) {
        for(const el of buttons(modal,name).filter(enabled)) candidates.add(el);
      }
    }
    return candidates.size===1?[...candidates][0]:null;
  }
  const api = {norm, visible, enabled, buttons, rows, total, pending, dialog, uniqueButton, fixedBack, backDiagnostics, fixedApprovalConfirm};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ApproveDOM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

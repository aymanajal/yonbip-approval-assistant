# 我的审核 · 顺序审批助手

面向 YonBIP / NCCloud“我的审核”的 Chrome 扩展。当前版本 **v0.3.0**。

逐张打开清单中的单据，审核意见留空，点击审批通过，确认结果后返回列表继续。支持切到其他 Chrome 标签页时保持审批页渲染，并提供运行日志与异常提交锁。

**这是公开配置版：默认地址仅为本机示例，不包含企业内网地址、账号、业务截图或现场日志。使用前必须配置自己的环境地址。**

## 功能

- 扫描清单、试开单据、按本轮数量顺序处理；加载和扫描不会自动提交。
- 固定返回及审批确认规则，无需学习按钮。
- 后台连续执行、暂停、结果核实与重复提交拦截。
- 面板查看日志、按异常或本次运行筛选、导出本机 JSON。
- “验证后台渲染（不审批）”可先检查切页后的持续渲染。
- 内置绫波丽主题背景。

## 下载与配置

从 [Releases](https://github.com/aymanajal/yonbip-approval-assistant/releases) 下载 ZIP，解压后保留完整目录。

安装 Node.js 20 或更新版本，在解压目录创建自己的 `config.local.json`。可复制 `config.example.json` 后修改：

```json
{
  "origins": [
    "https://erp.example.com"
  ]
}
```

地址只写协议、主机和端口，不带路径、账号、密码或参数。然后运行：

```sh
node scripts/configure.mjs config.local.json
```

脚本同时更新页面注入规则、主题图片规则和后台来源校验。`config.local*.json` 被 Git 忽略；不要提交自己配置后的 `config.js`、`manifest.json` 或其他内部环境资料。

源码仓库也可使用：

```sh
git clone https://github.com/aymanajal/yonbip-approval-assistant.git
cd yonbip-approval-assistant
cp config.example.json config.local.json
# 编辑 config.local.json
npm run configure -- config.local.json
```

## 在 Chrome 加载

要求 Chrome 118 或更新版本。

1. 打开 `chrome://extensions`，启用“开发者模式”。
2. 点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的已配置目录。
3. 确认新增的调试权限，刷新“我的审核”，查看 v0.3.0 面板。

更新时先暂停任务，再覆盖同一个已加载目录并重新加载；不要同时加载两份插件。

## 使用顺序

1. 进入“待处理”，关闭已经打开的单据详情，将每页条数调整到覆盖本次清单。
2. 先点“验证后台渲染（不审批）”，切到其他 Chrome 标签页约 10 秒，回来核对结果。
3. 点击“扫描列表”并核对“本轮单据清单”；“试开一张”只打开详情，不审批。
4. “启用真实审批”和“后台连续执行”默认勾选。本轮数量默认 1，确认流程后可扩大。
5. 点击“开始顺序审批”才会真实提交。可切到其他标签页，保持浏览器和审批页打开。
6. 出现异常先查看日志与系统审批历史，再使用“核对异常记录”；不明结果不会自动重试。

完整操作说明见 [使用说明](./使用说明.md)。插件执行点击流程，不判断业务内容是否应当通过，请先确认本轮单据范围。

## 后台连续执行与权限

后台连续模式通过 Chrome 的前台渲染模拟，让当前审批页及其 iframe 在切页后继续渲染，不激活或抢占其他标签页。暂停、结束或离开审批页后释放连接；调试连接被取消时，停止后续点击并保留提交记录。

`debugger` 是 Chrome 要求的必需权限，权限本身具有读取与修改网站数据的广泛能力，不能声明为可选权限。此实现只连接配置环境中启动任务的当前审批标签页，使用固定的来源、可见性检查与渲染模拟命令，没有开放任意 CDP 命令或任意脚本接口。

运行时 Chrome 的调试提示属于正常提示；取消该提示或打开同一审批页的开发者工具可能导致连接断开。电脑休眠、浏览器关闭、页面失去登录状态时不能保证继续执行。

官方依据：[前台模拟](https://developer.chrome.com/docs/devtools/rendering/apply-effects)、[debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger)、[权限规则](https://developer.chrome.com/docs/extensions/reference/api/permissions)。

## 开发与验证

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run package
```

打包脚本还需要 Python 3。ZIP 输出到 `dist/`；只包含运行文件、主题和文档，不包含本机配置文件、测试记录或日志。打包前配置过的目标地址会写入生成的运行文件，因此上传公开安装包时应保持示例配置。

开发阶段已在真实 Chrome 验证主页面及同源 iframe 的后台持续渲染，也在实际审批页完成了不提交审批的后台渲染验证。原 v0.3.0 的 32 项测试保留，公开版增加环境配置测试。不同系统版本、定制按钮和业务弹窗仍需在自己的环境验证；首次建议只处理一张。

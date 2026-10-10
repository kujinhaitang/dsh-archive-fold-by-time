# dsh-archive-fold-by-time · 按时间折叠的归档会话管理器

把 DSH 中零散的**已归档会话**集中到一个面板里统一管理：查看、**恢复**、**彻底删除**，并按 **周 / 月 / 年**分组折叠。

## 创作初衷

DSH 自身的归档能力是「把会话收起来」——设置里可以切换是否显示已归档会话，但归档之后想找回某一条、想恢复它、想彻底删掉它，始终缺一个集中的落点。

我遇到的问题很具体：**归档会话一多，列表就长得没法看**。全是平铺的条目，没有时间感，找不到上周归档的那条，也分不清哪些是几个月前的陈年旧账，翻起来很烦。

所以这个插件只做三件事：

1. **集中** —— 把散落的归档会话收进侧栏一个独立面板，不必去设置里翻。
2. **按时间看** —— 以周 / 月 / 年为节点分组折叠，「什么时候归档的」一眼可见。
3. **能动手** —— 直接恢复（回到原工作区接着聊）或彻底删除（连同磁盘数据一并清掉），全程不碰文件系统。

名字里的 `fold-by-time` 就是第 2 点的直译：**按时间折叠**。这也是它和同期同类插件最主要的差别——「查看、搜索、恢复」别人已经做得不错，但「太长、太烦」这件事没人处理。

插件名最初参考自社区里已有的同类项目（`dsh-archive-manager`）。实现是本仓库独立编写的，只使用 DSH 公开的 `webServer` 与 `slots` 接口，没有复制任何第三方代码。此后发现 GitHub 上叫这个名字的仓库已有二十多个，于是把包名改成现在这个——既避开重名混淆，也把「按时间折叠」这个差异点写进了名字里。

## 界面落点

插件内嵌于 DSH 桌面端 UI，落点两个官方插槽（替换风险均为 `none`）：

| 落点 | 说明 |
| --- | --- |
| `sidebar.panellist` | 侧栏「归档会话」入口图标 |
| `main` | 中央「归档会话」管理面板 |

## 功能

- **集中列表**：一次列出全部归档会话，显示标题、所属工作区、路径、最后活动时间、会话 id。
- **时间分组 / 折叠**：可按 **周（ISO 周）/ 月 / 年** 分桶，列表只列时间节点行；**默认全部折叠**，也可一键「展开全部 / 折叠全部」。搜索时自动全展开，命中结果不会被折叠藏住。
- **恢复**：把会话移出归档列表，重新回到所属工作区（优先调用官方 `workspaceRegistry.unarchiveSession`，内存态与磁盘同步）。
- **删除**：彻底移除会话 —— 移出归档表、清理 `workspace.json` 中的 workspace 引用、删除磁盘会话目录与投影缓存。删除前在面板内二次确认（不依赖可能被桌面端禁用的原生弹窗），不可撤销。
- **批量**：支持「全部恢复」「全部删除」。
- **过滤**：按标题、会话 id、工作区名或路径即时过滤。
- **主题友好**：全部样式基于 `currentColor` 与半透明边框，自动适配明暗主题。

## 安装

本插件是一个标准 DSH **bundle**：`package.json` 声明 `dsh.bundle.patch` 与 `dsh.client`，宿主半边提供 HTTP 路由，浏览器半边为手写 lazy-CJS 产物（**零构建链**，无需编译）。

### 方式一：从 tarball 安装（推荐分享用）

**直接下载**：在 [Releases](https://github.com/kujinhaitang/dsh-archive-fold-by-time/releases/latest) 页面取 `kujinhaitang-dsh-archive-fold-by-time-1.3.1.tgz`；也可以在本仓库目录自行打包：

```bash
npm pack                     # 产出 kujinhaitang-dsh-archive-fold-by-time-<version>.tgz
```

把 tarball 交给对方后，在 DSH 里安装（等价于在 profile 的 `dependencies` 写入 `file:` 依赖）：

```
plugin_manager install_bundle  target = file:<绝对路径>/kujinhaitang-dsh-archive-fold-by-time-1.3.1.tgz
```

同一 profile 的既有先例：`dsh-our-free-model` 就是用 `file:.../*.tgz` 安装的。

### 方式二：从 npm 安装

```bash
npm publish                  # 需要先改成你自己的 name / repository
# 之后：
plugin_manager install_bundle  target = @kujinhaitang/dsh-archive-fold-by-time
```

### 方式三：从源码目录安装（开发用）

1. 让包管理器能看到本目录：
   ```
   <profile>/node_modules/@kujinhaitang/dsh-archive-fold-by-time  →  <本仓库目录>
   ```
2. `<profile>/package.json`：
   - `dependencies` 增加 `"@kujinhaitang/dsh-archive-fold-by-time": "file:<本仓库目录>"`
   - `dsh.profile.bundles` 增加 `"@kujinhaitang/dsh-archive-fold-by-time"`
3. 重启 DSH。

## 在插件管理中可视、可开关

装好后本插件就是一个受管 bundle，会出现在 DSH 的**插件管理**里（数据与 `plugin_manager list_bundles` 同源）：

```json
{ "name": "@kujinhaitang/dsh-archive-fold-by-time", "version": "1.3.1",
  "enabled": true, "installed": true, "removable": true,
  "rows": [{ "rowId": "dsh-archive-fold-by-time", "entryId": "include:dsh-archive-fold-by-time" }] }
```

- **可开关**：`enabled` 由插件管理页的开关控制；关闭时其插槽注册整体卸载，侧栏图标与面板一起消失。
- **可卸载**：`removable: true`，卸载只移除 profile 里的依赖与 `node_modules` 链接，**不会**动你的源码目录。
- 插件管理页展示的名称/版本/描述取自本包的 `package.json`，这些元数据在 DSH 启动时读取，**改完需重启 DSH** 才会刷新。

## 结构

```
package.json          声明 dsh.bundle.patch 与 dsh.client
cordis.patch.yml      loader 装载条目（insert id=dsh-archive-fold-by-time）
lib/index.js          Host 半边：/dsh-archive-fold-by-time 路由
lib/client.js         Client 半边：侧栏图标 + 中央面板（lazy-CJS）
test/smoke.mjs        离线冒烟测试（只读，不写入任何数据）
LICENSE               MIT
```

> ⚠️ **`lib/client.js` 里 `window.__ModuleLoader__.load({ id })` 的 `id` 必须是 npm 包名**
> （`@kujinhaitang/dsh-archive-fold-by-time`），**不能写成插件短名**。宿主下发的客户端模块表
> 以包名做 row id（`@deepseek-ai/dsh-client-modules` 的 `reconcilePackage()` →
> `graphRow(packageName, …)`），客户端加载器也按该 row id 判断这个包的 factory 是否就绪。
> 写成短名时，加载器判定「本包加载完却没有注册」，于是反复重新拉取同一段脚本；脚本第二次
> 执行会在同一个短名上重复注册，抛出
> `client-modules: duplicate factory registration for "…" (bundle executed twice without invalidate?)`，
> 该 entry 永不激活 → `web boot: 1 entry did not activate` → 整个界面起不来。
> 注意区分三个同名概念：**模块注册 id = 包名**；**loader 装载条目 id**（`cordis.patch.yml` 里的
> `dsh-archive-fold-by-time`，社区惯例用短名，profile 层可按它覆盖 config）；**插槽 id**
> （`sidebar.panellist` / `main` 用的 `PANEL_ID`）与 **HTTP 路由前缀** `/dsh-archive-fold-by-time`。

## 宿主接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/dsh-archive-fold-by-time/list` | 返回 `{ items, total, home, store }` |
| `POST` | `/dsh-archive-fold-by-time/restore` | body `{ sessionId }` 或 `{ all: true }` |
| `POST` | `/dsh-archive-fold-by-time/delete` | body `{ sessionId }` 或 `{ all: true }` |

## 数据与安全

- 数据源：`<dsh-home>/storages/workspace.json` 的 `global.archivedSessionIds`。
- 恢复优先走官方服务；服务不可用时才回退为直接改写存储。
- 删除会先备份 `workspace.json`（`.bak-archive-manager`），写入使用同目录临时文件 + `rename` 原子替换。
- 只接受 `session-*` 形态的 id；只允许操作**当前确实处于归档状态**的会话，避免误删活跃会话。
- 不读取凭据、不启动子进程、不访问 `<dsh-home>` 之外的路径。

## 自测

```bash
npm test        # 或 node test/smoke.mjs
```

校验路由注册、归档列表读取与参数校验（400 / 409 / 404），全程只读。

## 卸载

在插件管理页关闭开关即可停用；要彻底移除，在插件管理中卸载，或手动从 `<profile>/package.json` 的 `dependencies` 与 `dsh.profile.bundles` 删除该条目并删除 `node_modules` 链接，然后重启 DSH。

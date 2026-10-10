# dsh-archive-manager · 归档会话管理器

把 DSH 中零散的**已归档会话**集中到一个面板里统一管理：查看、**恢复**、**彻底删除**，并按 **周 / 月 / 年**分组折叠。

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

```bash
npm pack                     # 产出 dsh-archive-manager-<version>.tgz
```

把 tarball 交给对方后，在 DSH 里安装（等价于在 profile 的 `dependencies` 写入 `file:` 依赖）：

```
plugin_manager install_bundle  target = file:<绝对路径>/dsh-archive-manager-1.3.0.tgz
```

同一 profile 的既有先例：`dsh-our-free-model` 就是用 `file:.../*.tgz` 安装的。

### 方式二：从 npm 安装

```bash
npm publish                  # 需要先改成你自己的 name / repository
# 之后：
plugin_manager install_bundle  target = dsh-archive-manager
```

### 方式三：从源码目录安装（开发用）

1. 让包管理器能看到本目录：
   ```
   <profile>/node_modules/dsh-archive-manager  →  <本仓库目录>
   ```
2. `<profile>/package.json`：
   - `dependencies` 增加 `"dsh-archive-manager": "file:<本仓库目录>"`
   - `dsh.profile.bundles` 增加 `"dsh-archive-manager"`
3. 重启 DSH。

## 在插件管理中可视、可开关

装好后本插件就是一个受管 bundle，会出现在 DSH 的**插件管理**里（数据与 `plugin_manager list_bundles` 同源）：

```json
{ "name": "dsh-archive-manager", "version": "1.3.0",
  "enabled": true, "installed": true, "removable": true,
  "rows": [{ "rowId": "dsh-archive-manager", "entryId": "include:dsh-archive-manager" }] }
```

- **可开关**：`enabled` 由插件管理页的开关控制；关闭时其插槽注册整体卸载，侧栏图标与面板一起消失。
- **可卸载**：`removable: true`，卸载只移除 profile 里的依赖与 `node_modules` 链接，**不会**动你的源码目录。
- 插件管理页展示的名称/版本/描述取自本包的 `package.json`，这些元数据在 DSH 启动时读取，**改完需重启 DSH** 才会刷新。

## 结构

```
package.json          声明 dsh.bundle.patch 与 dsh.client
cordis.patch.yml      loader 装载条目（insert id=dsh-archive-manager）
lib/index.js          Host 半边：/dsh-archive-manager 路由
lib/client.js         Client 半边：侧栏图标 + 中央面板（lazy-CJS）
test/smoke.mjs        离线冒烟测试（只读，不写入任何数据）
LICENSE               MIT
```

## 宿主接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/dsh-archive-manager/list` | 返回 `{ items, total, home, store }` |
| `POST` | `/dsh-archive-manager/restore` | body `{ sessionId }` 或 `{ all: true }` |
| `POST` | `/dsh-archive-manager/delete` | body `{ sessionId }` 或 `{ all: true }` |

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

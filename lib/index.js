// dsh-archive-manager — Host 半边
//
// 职责：读取 DSH 自身的归档数据（<dsh-home>/storages/workspace.json 的
// global.archivedSessionIds），并以只读 HTTP 路由把「归档会话」清单交给浏览器半边；
// 同时提供两个显式动作：恢复（restore）与彻底删除（delete）。
//
// 契约要点（均以本机实时服务目录为准）：
//   · 装载：profile package.json 的 dependencies 条目 + `export const name/inject/apply`。
//   · 路由：ctx.inject(['webServer'], scope => scope.webServer.register({ kind:'prefix', path, handler }))。
//   · 恢复：优先走官方 ctx.get('workspaceRegistry').unarchiveSession(id)（内存态 + 磁盘同步）；
//     服务不可用时回退为直接改写 workspace.json。
//   · 删除：官方当前**没有**会话删除 API，因此补齐三件事 —— 移出归档表、清理 workspace 引用、
//     删除磁盘会话目录与投影缓存。改写前先备份，写入走同目录临时文件 + rename（原子替换）。
//
// 安全边界：只接受 `session-*` 形态的会话 id；只允许删除**当前确实处于归档状态**的会话；
// 不读凭据、不起子进程、不触碰 <dsh-home> 之外的任何路径。

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const name = 'dsh-archive-manager';
export const inject = ['webServer'];

const ROUTE = '/dsh-archive-manager';
const ID_RE = /^session-[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/;

function dshHome() {
  const explicit = process.env.DSH_HOME || process.env.DSH_PROFILE_HOME;
  if (typeof explicit === 'string' && explicit.trim()) return path.resolve(explicit.trim());
  return path.join(os.homedir(), '.dsh');
}

const HOME = dshHome();
const STORE = path.join(HOME, 'storages', 'workspace.json');
const BACKUP = `${STORE}.bak-archive-manager`;
const SESSIONS_DIR = path.join(HOME, 'sessions');
const PROJ_DIR = path.join(HOME, 'storages', 'session_projcache', 'sessions');

/* ------------------------------------------------------------------ 存储层 */

async function readStore() {
  const raw = await fs.readFile(STORE, 'utf8');
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object') throw new Error('workspace.json 结构异常：不是对象');
  if (!data.global || typeof data.global !== 'object') data.global = {};
  if (!Array.isArray(data.global.archivedSessionIds)) data.global.archivedSessionIds = [];
  if (!data.tables || typeof data.tables !== 'object') data.tables = {};
  if (!data.tables.workspaces || typeof data.tables.workspaces !== 'object') data.tables.workspaces = {};
  return data;
}

/** 同目录临时文件 + rename 的原子替换；写前留一份备份。 */
async function writeStore(data) {
  const body = JSON.stringify(data, null, 2);
  try {
    await fs.copyFile(STORE, BACKUP);
  } catch {
    /* 首次安装时还没有原文件，可忽略 */
  }
  const tmp = `${STORE}.am-${process.pid}-${Date.now()}.tmp`;
  await fs.writeFile(tmp, body, 'utf8');
  await fs.rename(tmp, STORE);
}

async function findSessionDirs(sessionId) {
  const hits = [];
  let entries;
  try {
    entries = await fs.readdir(SESSIONS_DIR, { withFileTypes: true });
  } catch {
    return hits;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(SESSIONS_DIR, entry.name, sessionId);
    try {
      const st = await fs.stat(dir);
      if (st.isDirectory()) hits.push({ dir, slug: entry.name, mtimeMs: st.mtimeMs });
    } catch {
      /* 该 cwd 分组下没有这个会话 */
    }
  }
  return hits;
}

/** 投影缓存里的标题与创建时间；缺失时静默回退。 */
async function readMeta(sessionId) {
  const out = { title: null, createdAt: null };
  try {
    const raw = await fs.readFile(path.join(PROJ_DIR, `${sessionId}.json`), 'utf8');
    const record = JSON.parse(raw)?.record;
    const rows = record?.rows ?? {};
    const named = rows.title?.val;
    const first = rows.titleInput?.val?.first;
    if (typeof named === 'string' && named.trim()) out.title = named.trim();
    else if (typeof first === 'string' && first.trim()) out.title = first.trim();
    const created = record?.identity?.createdAt;
    if (typeof created === 'number' && created > 0) out.createdAt = created;
  } catch {
    /* 没有投影缓存：标题留空，由界面回退显示 id */
  }
  return out;
}

/* ------------------------------------------------------------------ 业务层 */

async function snapshot() {
  const store = await readStore();
  const ids = [...new Set(store.global.archivedSessionIds.filter((v) => typeof v === 'string' && ID_RE.test(v)))];
  const workspaces = store.tables.workspaces;
  const items = [];
  for (const sessionId of ids) {
    let owner = null;
    for (const [workspaceId, workspace] of Object.entries(workspaces)) {
      if (Array.isArray(workspace?.sessionIds) && workspace.sessionIds.includes(sessionId)) {
        owner = { workspaceId, title: workspace.title ?? null, path: workspace.path ?? null };
        break;
      }
    }
    const meta = await readMeta(sessionId);
    const dirs = await findSessionDirs(sessionId);
    const diskMs = dirs.reduce((max, d) => Math.max(max, d.mtimeMs), 0);
    items.push({
      sessionId,
      title: meta.title,
      createdAt: meta.createdAt,
      updatedAt: diskMs || meta.createdAt || null,
      workspace: owner,
      onDisk: dirs.length > 0,
      locations: dirs.map((d) => d.slug),
    });
  }
  items.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return { items, total: items.length, home: HOME, store: STORE };
}

async function unarchive(ctx, sessionId) {
  const registry = typeof ctx.get === 'function' ? ctx.get('workspaceRegistry') : undefined;
  if (registry && typeof registry.unarchiveSession === 'function') {
    await registry.unarchiveSession(sessionId);
    return 'workspaceRegistry';
  }
  const store = await readStore();
  const next = store.global.archivedSessionIds.filter((v) => v !== sessionId);
  if (next.length === store.global.archivedSessionIds.length) return 'noop';
  store.global.archivedSessionIds = next;
  await writeStore(store);
  return 'store';
}

async function destroy(ctx, sessionId) {
  const steps = { sessionId, unarchive: null, storeCleaned: false, dirsRemoved: [], projRemoved: false };
  const problems = [];

  try {
    steps.unarchive = await unarchive(ctx, sessionId);
  } catch (e) {
    problems.push(`移出归档表失败：${e?.message || e}`);
  }

  try {
    const store = await readStore();
    let touched = false;
    if (store.global.archivedSessionIds.includes(sessionId)) {
      store.global.archivedSessionIds = store.global.archivedSessionIds.filter((v) => v !== sessionId);
      touched = true;
    }
    for (const workspace of Object.values(store.tables.workspaces)) {
      if (Array.isArray(workspace?.sessionIds) && workspace.sessionIds.includes(sessionId)) {
        workspace.sessionIds = workspace.sessionIds.filter((v) => v !== sessionId);
        touched = true;
      }
    }
    if (touched) {
      await writeStore(store);
      steps.storeCleaned = true;
    }
  } catch (e) {
    problems.push(`清理 workspace 引用失败：${e?.message || e}`);
  }

  for (const hit of await findSessionDirs(sessionId)) {
    try {
      await fs.rm(hit.dir, { recursive: true, force: true });
      steps.dirsRemoved.push(hit.slug);
    } catch (e) {
      problems.push(`删除会话目录失败（${hit.slug}）：${e?.message || e}`);
    }
  }

  try {
    await fs.rm(path.join(PROJ_DIR, `${sessionId}.json`), { force: true });
    steps.projRemoved = true;
  } catch (e) {
    problems.push(`删除投影缓存失败：${e?.message || e}`);
  }

  if (problems.length) steps.problems = problems;
  return steps;
}

/* ------------------------------------------------------------------ HTTP 层 */

function sendJson(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** 收集本次要处理的目标：单个 sessionId，或 all=true 时全部归档会话。 */
async function targets(ctx, body) {
  if (body && body.all === true) {
    const snap = await snapshot();
    return snap.items.map((i) => i.sessionId);
  }
  const sessionId = body?.sessionId;
  if (typeof sessionId !== 'string' || !ID_RE.test(sessionId)) {
    throw Object.assign(new Error('sessionId 不合法'), { status: 400 });
  }
  // 只管理归档会话：非归档 id 一律拒绝，避免误删活跃会话。
  const store = await readStore();
  if (!store.global.archivedSessionIds.includes(sessionId)) {
    throw Object.assign(new Error('该会话当前不在归档列表中'), { status: 409 });
  }
  return [sessionId];
}

async function handle(ctx, req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const route = url.pathname.replace(/\/+$/, '') || ROUTE;
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'GET' && (route === ROUTE || route === `${ROUTE}/list`)) {
    const snap = await snapshot();
    sendJson(res, 200, { ok: true, ...snap });
    return;
  }

  if (method === 'POST' && (route === `${ROUTE}/restore` || route === `${ROUTE}/delete`)) {
    const body = await readBody(req);
    const list = await targets(ctx, body);
    const results = [];
    for (const sessionId of list) {
      if (route.endsWith('/restore')) {
        try {
          results.push({ sessionId, ok: true, via: await unarchive(ctx, sessionId) });
        } catch (e) {
          results.push({ sessionId, ok: false, error: e?.message || String(e) });
        }
      } else {
        const steps = await destroy(ctx, sessionId);
        results.push({ ok: !steps.problems, ...steps });
      }
    }
    const failed = results.filter((r) => r.ok === false).length;
    sendJson(res, failed ? 207 : 200, { ok: failed === 0, action: route.slice(ROUTE.length + 1), count: results.length, failed, results });
    return;
  }

  sendJson(res, 404, { ok: false, error: '未知接口' });
}

export function apply(ctx) {
  ctx.inject(['webServer'], (scope) => {
    const dispose = scope.webServer.register({
      kind: 'prefix',
      path: ROUTE,
      handler: (req, res) => {
        handle(scope ?? ctx, req, res).catch((e) => {
          try {
            sendJson(res, e?.status || 500, { ok: false, error: e?.message || String(e) });
          } catch {
            /* 响应已发出 */
          }
        });
      },
    });
    return () => {
      try {
        dispose?.();
      } catch {
        /* 已注销 */
      }
    };
  });
}

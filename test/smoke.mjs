// 离线冒烟测试：用 mock ctx 驱动 Host 半边，只读真实 workspace.json。
// 只验证 GET /list 与参数校验分支（400 / 409），**不**触发任何 restore/delete 写入。
// 运行：node test/smoke.mjs
import { apply } from '../lib/index.js';

const routes = [];
const fakeCtx = {
  get: () => undefined,
  inject: (deps, cb) => {
    cb({ get: () => undefined, webServer: { register: (route) => { routes.push(route); return () => {}; } } });
  },
};

apply(fakeCtx);
if (!routes.length) throw new Error('路由未注册');
console.log('route:', routes[0].kind, routes[0].path);

function call(method, url, body) {
  return new Promise((resolve, reject) => {
    const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
    const req = { method, url };
    req[Symbol.asyncIterator] = async function* () { for (const c of chunks) yield c; };
    const res = {
      status: 0,
      writeHead(code) { this.status = code; },
      end(text) { resolve({ status: this.status, body: JSON.parse(text) }); },
    };
    try { routes[0].handler(req, res); } catch (e) { reject(e); }
  });
}

const list = await call('GET', '/dsh-archive-manager/list');
console.log('GET  /list →', list.status, '| total =', list.body.total, '| home =', list.body.home);
if (list.status !== 200 || !Array.isArray(list.body.items)) throw new Error('列表返回形状不正确');
if (list.body.items.some((i) => !/^session-/.test(i.sessionId))) throw new Error('列表含非法会话 id');
for (const it of list.body.items.slice(0, 5)) {
  console.log(`  · ${it.sessionId} | ${it.title || '(无标题)'} | ${it.workspace?.title || '?'} | onDisk=${it.onDisk} | ${it.updatedAt ? new Date(it.updatedAt).toISOString() : '—'}`);
}

const traversal = await call('POST', '/dsh-archive-manager/delete', { sessionId: '../../etc/passwd' });
console.log('POST /delete (路径穿越) →', traversal.status, traversal.body.error);
if (traversal.status !== 400) throw new Error('路径穿越未被拒绝');

const missing = await call('POST', '/dsh-archive-manager/delete', { sessionId: 'session-00000000-0000-0000-0000-000000000000' });
console.log('POST /delete (非归档) →', missing.status, missing.body.error);
if (missing.status !== 409) throw new Error('非归档会话未被拒绝');

const unknown = await call('GET', '/dsh-archive-manager/nope');
console.log('GET  /nope →', unknown.status, unknown.body.error);
if (unknown.status !== 404) throw new Error('未知接口未被拒绝');

console.log('\n全部冒烟检查通过（未写入任何数据）。');

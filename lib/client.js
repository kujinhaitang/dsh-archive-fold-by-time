// dsh-archive-manager — 浏览器半边（零构建链的手写 lazy-CJS 产物）
//
// 形态契约（本机 @xmanrui/dsh-im、lunheng-article-pipeline 同款）：
//   · 由 package.json 的 `dsh.client` + `exports["./client"]` 送出；
//   · 本文件必须是一段 `window.__ModuleLoader__.load({ id, factory })` 脚本；
//   · factory 返回 cordis-plugin 形状（exports.apply / exports.inject）；
//   · 只 require('react')，其余零依赖，样式全部内联。
//
// 落点（两个席位，均已在本机实时插槽目录中确认可用、替换风险 none）：
//   ① sidebar.panellist —— 侧栏「归档会话」入口按钮；
//   ② main（key = 本面板 id）—— 中央「归档会话」管理面板。
// 数据一律经宿主半边 /dsh-archive-manager 路由，浏览器侧不直连文件系统。

window.__ModuleLoader__.load({
  id: 'dsh-archive-manager',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var React = require('react');
    var h = React.createElement;

    var PANEL_ID = 'dsh-archive-manager';
    var API = '/dsh-archive-manager';

    var useState = React.useState;
    var useEffect = React.useEffect;
    var useCallback = React.useCallback;
    var useMemo = React.useMemo;

    var BORDER = '1px solid rgba(128,128,128,.28)';
    var DIM = 'rgba(128,128,128,.95)';

    var S = {
      page: { height: '100%', overflowY: 'auto', padding: '18px 20px', boxSizing: 'border-box', fontSize: '13px', lineHeight: 1.6 },
      head: { display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '14px' },
      title: { fontSize: '16px', fontWeight: 650 },
      sub: { color: DIM, fontSize: '12px', marginTop: '2px' },
      headActions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
      search: { width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: '8px', border: BORDER, background: 'transparent', color: 'inherit', fontSize: '12.5px', outline: 'none', marginBottom: '12px' },
      notice: { padding: '8px 11px', borderRadius: '8px', border: BORDER, marginBottom: '12px', fontSize: '12.5px' },
      card: { border: BORDER, borderRadius: '10px', padding: '11px 13px', marginBottom: '9px' },
      rowTop: { display: 'flex', gap: '10px', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap' },
      name: { fontWeight: 600, wordBreak: 'break-word' },
      meta: { color: DIM, fontSize: '11.5px', marginTop: '4px', wordBreak: 'break-all' },
      actions: { display: 'flex', gap: '7px', flexShrink: 0 },
      empty: { border: BORDER, borderRadius: '10px', padding: '26px 16px', textAlign: 'center', color: DIM },
      mono: { fontFamily: 'ui-monospace,Consolas,monospace', fontSize: '11.5px' },
    };

    function btn(danger, disabled) {
      return {
        border: danger ? '1px solid rgba(220,80,80,.55)' : BORDER,
        background: 'transparent',
        color: danger ? '#d05050' : 'inherit',
        borderRadius: '8px',
        padding: '4px 10px',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: '12px',
        opacity: disabled ? 0.45 : 1,
        whiteSpace: 'nowrap',
      };
    }

    function fmtTime(ms) {
      if (!ms) return '—';
      try {
        var d = new Date(ms);
        var p = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
      } catch (e) {
        return '—';
      }
    }

    function shortId(id) {
      return String(id || '').replace(/^session-/, '').slice(0, 8);
    }

    function ArchiveIcon(props) {
      var size = props && typeof props.size === 'number' ? props.size : 16;
      var active = !!(props && props.active);
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: active ? 2 : 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M3 7h18v3H3z' }),
        h('path', { d: 'M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9' }),
        h('path', { d: 'M10 14h4' })
      );
    }

    /** ① 侧栏入口图标。按钮外壳与选中态由侧栏拥有（点击即 selectPanel(id)），
     *  本组件只按 owner props（size / active）画一枚与内置图标等大的图标；
     *  显示文案来自注册时的 label（'归档会话'）。 */
    function PanelIcon(props) {
      return h(ArchiveIcon, props || {});
    }

    /** ② 中央管理面板。 */
    function Panel() {
      var state = useState(null); var items = state[0]; var setItems = state[1];
      var errS = useState(null); var error = errS[0]; var setError = errS[1];
      var busyS = useState(null); var busy = busyS[0]; var setBusy = busyS[1];
      var qS = useState(''); var query = qS[0]; var setQuery = qS[1];
      var nS = useState(null); var notice = nS[0]; var setNotice = nS[1];
      // 内联二次确认：不依赖 window.confirm（桌面端 webview 可能禁用原生弹窗）
      var cS = useState(null); var confirming = cS[0]; var setConfirming = cS[1];
      // 时间分组粒度：none | week | month | year（默认按月）
      var gS = useState('month'); var groupBy = gS[0]; var setGroupBy = gS[1];
      // 已展开的组；null/空 = 全部折叠（默认），避免长列表一屏铺开
      var oS = useState(null); var openKeys = oS[0]; var setOpenKeys = oS[1];

      var load = useCallback(function () {
        setError(null);
        return fetch(API + '/list', { headers: { accept: 'application/json' } })
          .then(function (r) {
            return r.json().then(function (b) {
              if (!r.ok) throw new Error((b && b.error) || ('HTTP ' + r.status));
              return b;
            });
          })
          .then(function (b) { setItems(Array.isArray(b.items) ? b.items : []); })
          .catch(function (e) {
            setError(e && e.message ? e.message : String(e));
            setItems([]);
          });
      }, []);

      useEffect(function () { load(); }, [load]);

      var ALL = '__all__';
      var CONFIRM = { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' };

      var act = function (kind, sessionId) {
        var label = kind === 'delete' ? '彻底删除' : '恢复';
        setConfirming(null);
        setBusy(sessionId || '*');
        setNotice(null);
        fetch(API + '/' + kind, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(sessionId ? { sessionId: sessionId } : { all: true }),
        })
          .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
          .then(function (out) {
            var body = out.body || {};
            if (out.status >= 400 && out.status !== 207) throw new Error(body.error || ('HTTP ' + out.status));
            var failed = body.failed || 0;
            var done = (body.count || 0) - failed;
            setNotice({
              tone: failed ? 'warn' : 'ok',
              text: label + '完成：成功 ' + done + ' 条' + (failed ? ('，失败 ' + failed + ' 条') : '') + '。',
            });
            return load();
          })
          .catch(function (e) {
            setNotice({ tone: 'err', text: label + '失败：' + (e && e.message ? e.message : String(e)) });
          })
          .then(function () { setBusy(null); });
      };

      var visible = useMemo(function () {
        var list = items || [];
        var q = query.trim().toLowerCase();
        if (!q) return list;
        return list.filter(function (it) {
          var ws = it.workspace || {};
          return String(it.title || '').toLowerCase().indexOf(q) >= 0
            || it.sessionId.toLowerCase().indexOf(q) >= 0
            || String(ws.title || '').toLowerCase().indexOf(q) >= 0
            || String(ws.path || '').toLowerCase().indexOf(q) >= 0;
        });
      }, [items, query]);

      /** 按所选粒度把一个会话落到时间桶。 */
      var bucketOf = function (it) {
        var t = it && it.updatedAt ? new Date(it.updatedAt) : null;
        if (!t || isNaN(t.getTime())) return { key: 'unknown', label: '时间未知' };
        var y = t.getFullYear();
        if (groupBy === 'year') return { key: 'y' + y, label: y + ' 年' };
        if (groupBy === 'month') {
          var m = t.getMonth() + 1;
          return { key: 'm' + y + '-' + m, label: y + ' 年 ' + m + ' 月' };
        }
        // ISO 周：周一为一周起点
        var d = new Date(Date.UTC(y, t.getMonth(), t.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        var iy = d.getUTCFullYear();
        var wk = Math.ceil(((d - Date.UTC(iy, 0, 1)) / 86400000 + 1) / 7);
        return { key: 'w' + iy + '-' + wk, label: iy + ' 年 第 ' + wk + ' 周' };
      };

      // items 已按时间倒序，顺序分桶即得"最新在前"的组序
      var groups = useMemo(function () {
        var out = []; var index = {};
        for (var i = 0; i < visible.length; i++) {
          var b = bucketOf(visible[i]);
          if (!index[b.key]) {
            index[b.key] = { key: b.key, label: b.label, items: [] };
            out.push(index[b.key]);
          }
          index[b.key].items.push(visible[i]);
        }
        return out;
      }, [visible, groupBy]);

      // 默认全部折叠：进面板先看到一列时间节点，而不是一长条会话；
      // 搜索时强制全展开，避免命中的结果被折叠藏起来
      var isOpen = function (key) {
        if (query.trim()) return true;
        return !!(openKeys && openKeys[key]);
      };
      var anyOpen = groups.some(function (g) { return isOpen(g.key); });

      var toggleGroup = function (key) {
        setOpenKeys(function (prev) {
          var next = Object.assign({}, prev || {});
          if (next[key]) delete next[key]; else next[key] = true;
          return next;
        });
      };

      var setAllGroups = function (open) {
        if (!open) { setOpenKeys({}); return; }
        var next = {};
        for (var i = 0; i < groups.length; i++) next[groups[i].key] = true;
        setOpenKeys(next);
      };

      var groupHeader = function (g) {
        var open = isOpen(g.key);
        return h('button', {
          key: 'g:' + g.key, type: 'button', onClick: function () { toggleGroup(g.key); },
          style: {
            display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
            background: 'transparent', color: 'inherit', border: 'none', borderBottom: BORDER,
            padding: '7px 2px', margin: '12px 0 8px', cursor: 'pointer',
            font: 'inherit', fontSize: '12.5px', textAlign: 'left',
          },
        },
          h('span', { style: { display: 'inline-block', width: '10px', opacity: 0.65 } }, open ? '▾' : '▸'),
          h('span', { style: { fontWeight: 600 } }, g.label),
          h('span', { style: { color: DIM } }, g.items.length + ' 条'));
      };

      // 折叠时不产出卡片行，组头之后直接接下一组 —— 长列表因此收成一屏
      var rows = useMemo(function () {
        var out = [];
        if (groupBy === 'none') {
          for (var i = 0; i < visible.length; i++) out.push({ type: 'item', it: visible[i] });
          return out;
        }
        for (var g = 0; g < groups.length; g++) {
          out.push({ type: 'group', group: groups[g] });
          if (!isOpen(groups[g].key)) continue;
          for (var j = 0; j < groups[g].items.length; j++) out.push({ type: 'item', it: groups[g].items[j] });
        }
        return out;
      }, [groups, groupBy, visible, openKeys, query]);

      var toneStyle = function (tone) {
        if (tone === 'err') return { borderColor: 'rgba(220,80,80,.55)', color: '#d05050' };
        if (tone === 'warn') return { borderColor: 'rgba(214,158,46,.6)', color: '#b8860b' };
        return {};
      };

      var body;
      if (error) {
        body = h('div', { style: Object.assign({}, S.empty, { color: '#d05050' }) },
          h('div', null, '读取归档会话失败：' + error),
          h('div', { style: { marginTop: '10px' } },
            h('button', { type: 'button', style: btn(false, false), onClick: function () { setItems(null); load(); } }, '重试')));
      } else if (items === null) {
        body = h('div', { style: S.empty }, '正在读取归档会话…');
      } else if (!items.length) {
        body = h('div', { style: S.empty },
          '当前没有被归档的会话。',
          h('div', { style: { fontSize: '12px', marginTop: '6px' } }, '在左侧会话列表中把不再需要的会话归档后，它们会集中出现在这里。'));
      } else if (!visible.length) {
        body = h('div', { style: S.empty }, '没有匹配「' + query.trim() + '」的归档会话。');
      } else {
        body = h('div', null, rows.map(function (row) {
          if (row.type === 'group') return groupHeader(row.group);
          var it = row.it;
          var ws = it.workspace || {};
          var isBusy = busy !== null;
          return h('div', { key: it.sessionId, style: S.card },
            h('div', { style: S.rowTop },
              h('div', { style: { minWidth: 0, flex: '1 1 240px' } },
                h('div', { style: S.name }, it.title || ('未命名会话 · ' + shortId(it.sessionId))),
                h('div', { style: S.meta },
                  (ws.title ? String(ws.title) : '未知工作区') + (ws.path ? (' · ' + ws.path) : ''),
                  h('br'),
                  h('span', { style: S.mono }, it.sessionId),
                  h('span', null, ' · 最后活动 ' + fmtTime(it.updatedAt) + (it.onDisk ? '' : ' · 磁盘数据已缺失'))),
              ),
              h('div', { style: S.actions },
                confirming === it.sessionId
                  ? h('span', { style: CONFIRM },
                      h('span', null, '彻底删除？'),
                      h('button', {
                        type: 'button', style: btn(true, isBusy), disabled: isBusy,
                        onClick: function () { act('delete', it.sessionId); },
                      }, '确认删除'),
                      h('button', {
                        type: 'button', style: btn(false, isBusy), disabled: isBusy,
                        onClick: function () { setConfirming(null); },
                      }, '取消'))
                  : [
                      h('button', {
                        key: 'restore', type: 'button', style: btn(false, isBusy), disabled: isBusy,
                        onClick: function () { act('restore', it.sessionId); },
                      }, busy === it.sessionId ? '处理中…' : '恢复'),
                      h('button', {
                        key: 'delete', type: 'button', style: btn(true, isBusy), disabled: isBusy,
                        onClick: function () { setConfirming(it.sessionId); },
                      }, '删除'),
                    ]),
            ));
        }));
      }

      var countLine = items === null
        ? '正在读取…'
        : ('共 ' + items.length + ' 条已归档会话' + (query && visible.length !== items.length ? '，匹配 ' + visible.length + ' 条' : ''));

      return h('div', { style: S.page },
        h('div', { style: S.head },
          h('div', null,
            h('div', { style: S.title }, '归档会话'),
            h('div', { style: S.sub }, countLine)),
          h('div', { style: S.headActions },
            h('select', {
              value: groupBy, title: '按时间分组',
              onChange: function (e) { setGroupBy(e.target.value); },
              style: {
                font: 'inherit', fontSize: '12px', padding: '3px 6px', borderRadius: '7px',
                border: BORDER, background: 'transparent', color: 'inherit',
              },
            },
              h('option', { value: 'none' }, '不分组'),
              h('option', { value: 'week' }, '按周'),
              h('option', { value: 'month' }, '按月'),
              h('option', { value: 'year' }, '按年')),
            h('button', {
              type: 'button', style: btn(false, busy !== null || groupBy === 'none'),
              disabled: busy !== null || groupBy === 'none',
              onClick: function () { setAllGroups(!anyOpen); },
            }, anyOpen ? '折叠全部' : '展开全部'),
            h('button', { type: 'button', style: btn(false, busy !== null), disabled: busy !== null, onClick: function () { load(); } }, '刷新'),
            h('button', {
              type: 'button', style: btn(false, busy !== null || !items || !items.length),
              disabled: busy !== null || !items || !items.length,
              onClick: function () { act('restore', null); },
            }, '全部恢复'),
            confirming === ALL
              ? h('span', { style: CONFIRM },
                  h('span', null, '彻底删除全部 ' + (items ? items.length : 0) + ' 条？'),
                  h('button', {
                    type: 'button', style: btn(true, busy !== null), disabled: busy !== null,
                    onClick: function () { act('delete', null); },
                  }, '确认'),
                  h('button', {
                    type: 'button', style: btn(false, busy !== null), disabled: busy !== null,
                    onClick: function () { setConfirming(null); },
                  }, '取消'))
              : h('button', {
                  type: 'button', style: btn(true, busy !== null || !items || !items.length),
                  disabled: busy !== null || !items || !items.length,
                  onClick: function () { setConfirming(ALL); },
                }, '全部删除'))),
        items && items.length ? h('input', {
          style: S.search, type: 'search', value: query, placeholder: '按标题、会话 id、工作区名或路径过滤…',
          onChange: function (e) { setQuery(e.target.value); },
        }) : null,
        notice ? h('div', { style: Object.assign({}, S.notice, toneStyle(notice.tone)) }, notice.text) : null,
        body,
        h('div', { style: { marginTop: '16px', color: DIM, fontSize: '11.5px' } },
          '恢复 = 把会话移出归档列表，重新回到所属工作区；删除 = 连同磁盘会话数据一并移除，不可撤销。数据经宿主侧 /dsh-archive-manager 处理。'));
    }

    function apply(ctx) {
      try {
        ctx.inject(['slots'], function (scope) {
          scope.slots.inject('sidebar.panellist', function () {
            return scope.slots.register(
              { name: 'sidebar.panellist', id: PANEL_ID, order: 70, label: function () { return '归档会话'; } },
              function (props) { return h(PanelIcon, Object.assign({}, props, { ctx: scope })); }
            );
          });
          scope.slots.inject('main', function () {
            return scope.slots.register(
              { name: 'main', key: PANEL_ID },
              function (props) { return h(Panel, Object.assign({}, props, { ctx: scope })); }
            );
          });
        });
      } catch (e) {
        console.error('[dsh-archive-manager] 面板注册失败：', e);
      }
    }

    exports.apply = apply;
    exports.inject = [];
    return module.exports;
  },
});

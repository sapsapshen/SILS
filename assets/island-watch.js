/* 页面报错守望：异常不该让岛悄悄停摆或消失，而该把问题摆到岛上。
   三路来源：window error、unhandledrejection、岛自己的帧循环（internals.onError）。
   同一句话只提醒一次；消息截到 120 字，只走 textContent 原子，不碰 innerHTML。 */
(() => {
  'use strict';
  const MAX = 120;
  const ERROR_ID = 'page-error';
  let last = '';
  let pending = null;

  const t = (key, vars) => {
    const i18n = typeof window !== 'undefined' ? window.MSI18N : null;
    return i18n && typeof i18n.t === 'function' ? i18n.t(key, vars) : key;
  };

  const textOf = reason => {
    let raw = reason;
    if (raw && typeof raw === 'object' && 'message' in raw) raw = raw.message;
    let text = '';
    try { text = typeof raw === 'string' ? raw : String(raw == null ? '' : raw); } catch { text = ''; }
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) text = 'Unknown error';
    return text.length > MAX ? `${text.slice(0, MAX - 1)}…` : text;
  };

  function report(reason, where) {
    const Island = typeof window !== 'undefined' ? window.Island : null;
    if (!Island || !Island.enabled) { pending = [reason, where]; return; }
    const message = textOf(reason);
    if (!message || message === last) return;        // 同一句话不反复刷屏
    const source = typeof where === 'string' ? where : '';
    const label = t('island.errorLabel', { message });
    try {
      Island.start({
        id: ERROR_ID,
        group: 'error',
        priority: 3,                                 // 压过专注计时与阅读进度
        alert: true,
        label,
        // 点按收起态的胶囊先把整段原因展开；关掉靠展开面里那颗按钮。
        onPress: () => Island.expand(ERROR_ID),
        compact: { leading: { glyph: 'alert' }, trailing: { text: t('island.errorBadge') } },
        expanded: {
          leading: { label: t('island.errorTitle') },
          center: {
            title: message,
            subtitle: source ? t('island.errorSource', { source }) : t('island.errorHint')
          },
          bottom: [{
            buttons: [{ key: 'dismiss', label: t('island.errorDismiss'), onPress: () => Island.end(ERROR_ID) }]
          }]
        }
      });
      last = message;
    } catch { /* 守望自己出错，不能再把页面拖下水 */ }
  }

  window.addEventListener('error', event => {
    // 资源加载失败（img/script）没有 message：不是本模块的职责。
    if (!event || (!event.error && !event.message)) return;
    const file = typeof event.filename === 'string' ? event.filename.split('/').pop() : '';
    report(event.error || event.message, file && event.lineno ? `${file}:${event.lineno}` : '');
  });
  window.addEventListener('unhandledrejection', event => report(event && event.reason, ''));

  // 脚本按 defer 顺序执行，岛与 focus 先挂好；万一顺序变了就等挂载后再接。
  const attach = () => {
    const Island = window.Island;
    if (Island && Island.internals && typeof Island.internals.onError === 'function') {
      Island.internals.onError((error, where) => report(error, where === 'frame' ? t('island.errorFrame') : ''));
    }
    if (pending) {
      const [reason, where] = pending;
      pending = null;
      report(reason, where);
    }
  };
  const doc = typeof document !== 'undefined' ? document : null;
  if (doc && doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();

  window.IslandWatch = { report: reason => report(reason, ''), ERROR_ID };
})();

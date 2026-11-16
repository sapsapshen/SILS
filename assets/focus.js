/* 专注计时：一条倒计时活动 + 今日累计。
   状态与时序在这里，几何一概不问——它只调 window.Island 的 start/update/end。
   所有外部依赖（时钟、存储、岛、文案）都可注入，为的是能在 node 里跑真实的
   状态机而不是桩：时钟回拨、跨日归零、存储被拒这些路径没法在浏览器里造。 */
(() => {
  'use strict';

  const TODAY_KEY = 'ms-cookbook-focus';
  const DEFAULT_TARGET_MS = 25 * 60_000;
  const MAX_SESSIONS = 30;              // 明细上限：一个键不能无界增长
  const STALE_MS = 24 * 3600_000;       // active 超过一天不再恢复
  // 上游 upload 预设用 7s（alert 自身约 6s 再加一拍）：留出读完的时间。
  const ALERT_END_MS = 7000;
  const TIMER_ID = 'focus-timer';

  let now = () => Date.now();
  let storage = null;
  let island = null;
  let t = key => key;
  let locale = () => 'zh-CN';
  let ready = false;

  let phase = 'none';                   // none | running | paused | complete
  let targetMs = 0;
  let startedAt = 0;                    // 本段 running 的起点（epoch ms）
  let accumulatedMs = 0;                // 之前各段之和
  let completionAt = 0;
  let date = '';
  let todayMs = 0;
  let sessions = [];
  let handle = null;

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const pad = n => String(n).padStart(2, '0');
  const localDate = ms => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const sum = list => list.reduce((total, item) => total + (Number(item.ms) || 0), 0);

  function read() {
    let raw = null;
    try { raw = storage ? storage.getItem(TODAY_KEY) : null; } catch { return fresh(); }
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { return fresh(); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fresh();
    const today = localDate(now());
    if (parsed.date !== today) return fresh();                        // 跨日归零
    const sessions = Array.isArray(parsed.sessions)
      ? parsed.sessions.filter(item => item && Number.isFinite(item.ms) && Number.isFinite(item.endedAt)).slice(-MAX_SESSIONS)
      : [];
    const totalMs = Number.isFinite(parsed.totalMs) ? parsed.totalMs : sum(sessions);
    return {
      date: today,
      totalMs,
      sessions,
      active: parsed.active && Number.isFinite(parsed.active.targetMs) ? parsed.active : null
    };
  }
  const fresh = () => ({ date: localDate(now()), totalMs: 0, sessions: [], active: null });

  // 任何一环写不进去（隐私模式、配额）都不该打断会话本身。
  function persist() {
    const record = {
      date: localDate(now()),
      totalMs: todayMs,
      sessions: sessions.slice(-MAX_SESSIONS),
      active: phase === 'running' || phase === 'paused'
        ? { targetMs, startedAt: phase === 'running' ? startedAt : 0, accumulatedMs, paused: phase === 'paused', savedAt: now() }
        : null
    };
    try { if (storage) storage.setItem(TODAY_KEY, JSON.stringify(record)); } catch { /* 累计只活在内存里 */ }
  }

  // 跨日归零：读取处也要检查，否则第二天回来的人会看到昨天的累计。
  function rollover() {
    const today = localDate(now());
    if (today !== date) { date = today; todayMs = 0; sessions = []; }
  }

  const remaining = () => {
    if (phase === 'none') return 0;
    if (phase === 'complete') return 0;
    const elapsed = accumulatedMs + (phase === 'running' ? now() - startedAt : 0);
    // 时钟回拨时 elapsed 为负：夹回 target，绝不倒扣成超过目标的剩余。
    return clamp(targetMs - elapsed, 0, targetMs);
  };
  const elapsed = () => targetMs - remaining();

  function formatMs(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(total / 60)}:${pad(total % 60)}`;
  }

  const buttons = () => [
    phase === 'paused'
      ? { key: 'resume', label: t('island.resume'), onPress: () => resume() }
      : { key: 'pause', label: t('island.pause'), onPress: () => pause() },
    { key: 'extend', label: t('island.extend'), onPress: () => extend(5 * 60_000) },
    { key: 'end', label: t('island.end'), onPress: () => stop() }
  ];

  function spec(extra) {
    const left = remaining();
    return Object.assign({
      id: TIMER_ID,
      group: 'focus',
      priority: 1,
      // 主胶囊放倒计时：副胶囊只剩约 20pt，"24:58" 这种宽度会被裁（见设计文档 §4.3）。
      label: phase === 'paused' ? t('island.paused') : t('island.focusLabel', { time: formatMs(left) }),
      compact: {
        leading: { glyph: 'lotus' },
        trailing: phase === 'paused' ? { text: t('island.paused') } : { until: now() + left, format: 'mm:ss' }
      },
      minimal: { leading: { glyph: 'lotus' } },
      expanded: {
        leading: { label: t('island.focus') },
        // 顶行右侧放今日累计：它比标题更需要一眼看到，标题本身已在 leading 标签里。
        trailing: { text: t('island.today', { time: formatMs(todayMs) }) },
        bottom: [
          // 大数字就是剩余时间本身：它自走，不需要每秒 update 一次活动。
          { until: now() + left, format: 'mm:ss', big: true },
          { buttons: buttons() }
        ]
      }
    }, extra || {});
  }

  const show = partial => { if (handle) handle.update(partial); };

  function start(targetOverride) {
    if (phase === 'running') return;
    targetMs = Number.isFinite(targetOverride) && targetOverride > 0 ? targetOverride : DEFAULT_TARGET_MS;
    accumulatedMs = 0;
    startedAt = now();
    phase = 'running';
    if (island) handle = island.start(spec());
    persist();
  }

  function pause() {
    if (phase !== 'running') return;
    accumulatedMs += now() - startedAt;
    startedAt = 0;
    phase = 'paused';
    show(spec());
    persist();
  }

  function resume() {
    if (phase !== 'paused') return;
    startedAt = now();
    phase = 'running';
    show(spec());
    persist();
  }

  function extend(ms) {
    if (phase !== 'running' && phase !== 'paused') return;
    targetMs = Math.max(0, targetMs + (Number.isFinite(ms) ? ms : 0));
    show(spec());
    persist();
  }

  // 记一次会话：todayMs 当场累加，存储写不进去也照样看得见今日累计。
  function record(ms) {
    if (!(ms > 0)) return;
    rollover();
    todayMs += ms;
    sessions.push({ endedAt: now(), ms });
    sessions = sessions.slice(-MAX_SESSIONS);
  }

  function finish(completedMs) {
    record(completedMs);
    handle = null;
    phase = 'none';
    targetMs = 0;
    accumulatedMs = 0;
    persist();
  }

  function stop() {
    if (phase !== 'running' && phase !== 'paused') return;
    const spent = elapsed();
    const label = t('island.stoppedBody', { time: formatMs(spent) });
    finish(spent);
    if (island && spent > 0) {
      const ended = island.start({ id: 'focus-ended', group: 'focus', priority: 1, label,
        compact: { leading: { glyph: 'lotus' }, trailing: { text: formatMs(spent) } },
        expanded: { center: { title: t('island.focus'), subtitle: label } } });
      ended.update({ alert: true });
      completionAt = now();
      handle = ended;
      phase = 'complete';
    }
  }

  // 一帧：到点就汇报，alert 过后再结束活动。tick 由岛的帧循环调用，也可被测试直接驱动。
  function tick() {
    rollover();
    if (phase === 'running' && remaining() <= 0) {
      const spent = targetMs;
      const alerting = handle;
      accumulatedMs = targetMs;
      phase = 'complete';
      completionAt = now();
      startedAt = 0;
      accumulatedMs = 0;
      record(spent);                    // 先落账：汇报里的今日累计必须是落账之后的数
      const label = t('island.doneBody', { time: formatMs(spent), today: formatMs(todayMs) });
      if (alerting) {
        // 整片 expanded 都要重写：merge 是按键合并的，只给 leading/center 会把
        // 上一秒的倒计时原子留在底部，读者看到的就是 0:00。
        alerting.update({
          alert: true,
          label,
          compact: { trailing: { text: formatMs(spent) } },
          expanded: {
            leading: { label: t('island.doneTitle') },
            trailing: { text: t('island.today', { time: formatMs(todayMs) }) },
            center: { subtitle: label },
            bottom: [{ value: formatMs(spent) }]
          }
        });
      }
      persist();
      return;
    }
    if (phase === 'complete' && now() - completionAt >= ALERT_END_MS) {
      if (handle) { handle.end(); handle = null; }
      phase = 'none';
      persist();
    }
  }

  // 页面重新进来：按墙钟恢复进行中的会话；超过一天的 active 直接丢掉。
  function restore() {
    const loaded = read();
    date = loaded.date;
    todayMs = loaded.totalMs;
    sessions = loaded.sessions;
    if (loaded.active && Number.isFinite(loaded.active.targetMs)
      && (phase === 'none') && now() - (loaded.active.savedAt || now()) < STALE_MS) {
      targetMs = loaded.active.targetMs;
      accumulatedMs = loaded.active.accumulatedMs || 0;
      if (loaded.active.paused) {
        phase = 'paused';
        startedAt = 0;
      } else {
        startedAt = Number.isFinite(loaded.active.startedAt) && loaded.active.startedAt > 0
          ? loaded.active.startedAt : now() - accumulatedMs;   // 段起点丢了就当作刚刚继续
        phase = 'running';
      }
      if (phase === 'running' && remaining() <= 0) {           // 期间已经走完：不复活
        phase = 'none';
        targetMs = 0;
        accumulatedMs = 0;
      } else if (island) {
        handle = island.start(spec());
      }
    }
    persist();
  }

  // 另一个标签页写了累计：重读那一份，本机进行中的会话不受影响。
  function onExternalWrite(raw) {
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { return; }
    if (!parsed || parsed.date !== localDate(now())) { return; }
    if (Number.isFinite(parsed.totalMs)) todayMs = parsed.totalMs;
    if (Array.isArray(parsed.sessions)) sessions = parsed.sessions.filter(item => item && Number.isFinite(item.ms)).slice(-MAX_SESSIONS);
  }

  const snapshot = () => { rollover(); return { phase, remainingMs: remaining(), targetMs, todayMs }; };

  function init(deps) {
    const o = deps || {};
    if (o.now) now = o.now;
    if ('storage' in o) storage = o.storage;
    if ('island' in o) island = o.island;
    if (o.t) t = o.t;
    if (o.locale) locale = o.locale;
    ready = true;
    return FocusTimer;
  }

  // ---- 进度活动 ----
  const PROGRESS_ID = 'reading-progress';
  let progressSeen = false;
  let progressTitle = '';
  let lastProgress = null;

  function chapterTitleFor(id) {
    const list = (typeof window !== 'undefined' && window.BOOK_DATA && window.BOOK_DATA.chapters) || [];
    const found = list.find(c => c.id === id);
    return found ? found.title : '';
  }

  // 阅读进度：常驻阅读视图的那一条。数字来自 reading.js 的去抖广播，这里绝不
  // 自己再监听 scroll——那等于在 40 万字的正文上多算一遍布局。
  function progressFrom(detail) {
    if (!island || !detail) return;
    lastProgress = detail;
    if (typeof document !== 'undefined' && document.body && document.body.dataset.view !== 'reader') return;
    const value = clamp(Math.round(detail.percent || 0), 0, 100);
    if (detail.chapter) progressTitle = chapterTitleFor(detail.chapter);
    const spec = {
      id: PROGRESS_ID,
      group: 'reading',
      priority: 0,
      label: t('island.readingLabel', { percent: value }),
      compact: { leading: { glyph: 'bookmark' }, trailing: { text: `${value}%` } },
      // 副胶囊只剩约 20pt：这里放 20pt 的环，不放字。
      minimal: { leading: { glyph: 'bookmark' }, bubble: { ring: value / 100 } },
      expanded: {
        leading: { label: t('island.reading') },
        center: { title: progressTitle, subtitle: t('island.chapterProgress') },
        bottom: { bar: value / 100 }
      }
    };
    if (progressSeen) island.update(PROGRESS_ID, spec);
    else { island.start(spec); progressSeen = true; }
  }

  // 语言切换后把两条活动的文案重念一遍：内容没变，只是换了张字。
  function refreshText() {
    rollover();
    if (phase === 'running' || phase === 'paused') show(spec());
    if (progressSeen && lastProgress) progressFrom(lastProgress);
  }

  // ---- 浏览器装配 ----
  // node 单测里这段根本不执行：init 注入的桩就是全部依赖。
  function boot() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (!window.Island || !document.getElementById) return;
    const root = document.getElementById('islandRoot');
    if (!root) return;
    let store = null;
    try { store = window.localStorage; } catch { store = null; }
    const i18n = window.MSI18N || null;
    init({
      storage: store,
      island: window.Island,
      t: i18n ? (key, vars) => i18n.t(key, vars) : (key => key),
      locale: i18n ? () => i18n.locale() : () => 'zh-CN'
    });
    window.Island.mount(root, {});
    restore();
    window.addEventListener('purplebook:progress', event => progressFrom(event.detail));
    if (i18n) i18n.on(refreshText);
    window.addEventListener('storage', event => {
      if (event.key === TODAY_KEY && event.newValue) onExternalWrite(event.newValue);
    });
    window.Island.internals.onFrame(() => tick());
    const button = document.getElementById('focusTimerButton');
    if (!button) return;
    const sync = () => {
      const snap = snapshot();
      document.body.dataset.focusTimer = snap.phase === 'none' ? '' : snap.phase;
      // 三态循环里 paused 仍是一次活着的会话（再点就继续），所以也算按下。
      button.setAttribute('aria-pressed', String(snap.phase === 'running' || snap.phase === 'paused'));
    };
    button.addEventListener('click', () => {
      const snap = snapshot();
      if (snap.phase === 'none') start(DEFAULT_TARGET_MS);
      else if (snap.phase === 'paused') resume();
      else pause();
      sync();
    });
    window.Island.internals.onFrame(sync);
    sync();
  }

  const FocusTimer = {
    TODAY_KEY,
    DEFAULT_TARGET_MS,
    init,
    start: target => ready && start(target),
    pause: () => { if (ready) pause(); },
    resume: () => { if (ready) resume(); },
    extend: ms => { if (ready) extend(ms); },
    stop: () => { if (ready) stop(); },
    tick: () => { if (ready) tick(); },
    restore: () => { if (ready) restore(); },
    onExternalWrite,
    progressFrom,
    refreshText,
    snapshot: () => (ready ? snapshot() : { phase: 'none', remainingMs: 0, targetMs: 0, todayMs: 0 })
  };
  window.FocusTimer = FocusTimer;
  boot();
})();

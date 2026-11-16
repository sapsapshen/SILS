# 灵动岛（移植 islandcn 引擎）与专注计时 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 islandcn 的灵动岛引擎数学移植成 ms-cookbook 的零依赖 vanilla 模块，并在阅读视图承载「本章进度 + 25 分钟专注倒计时 + 今日累计」两条活动，随后部署到 `http://120.53.222.178:8899/` 并推送 GitHub。

**Architecture:** 四个单元：`assets/island.js`（几何+弹簧+活动栈+渲染，暴露 `window.Island`）、`assets/island.css`（岛内内容排版）、`assets/focus.js`（会话状态机与存储）、`assets/reading.js` 一行进度广播。引擎不认识"专注"，专注模块不碰几何，两者只通过 `Island.start/update/end` 通信。`spring.ts`/`path.ts`/`geometry.ts` 是纯函数，**按原数学 1:1 移植**；`motion.ts` 只取弹簧常数表；React 协调层用固定 DOM 模板替代。

**Tech Stack:** 无构建、无依赖的原生 ES2020（IIFE + `window` 全局）、SVG path、Web Animations、`localStorage`、FastAPI 只作为静态宿主、Node 内置 `node:vm` + 手写 DOM 桩做单测（仓库既有惯例）。

**Spec:** [docs/superpowers/specs/2026-11-16-islandcn-dynamic-island-design.md](../specs/2026-11-16-islandcn-dynamic-island-design.md)

## Global Constraints

- 不新增 `package.json`、npm 依赖、React、Tailwind 或任何 JS 构建步骤（spec §1.2）
- 新脚本一律 `<script defer>`：`index.html` 的非 defer 脚本白名单必须恰为 `assets/i18n.js`、`assets/locale/zh.js`、`assets/content.js` 三个（`scripts/test-motion.cjs:202-204`）
- CSP 为 `script-src 'self' 'wasm-unsafe-eval'`、`style-src 'self' 'unsafe-inline'`：不得内联 `<script>`，不得引外部 CDN（`app.py:67-68`）
- 只动 `transform` / `opacity` / SVG 属性；不得新增会触发 40 万字文档重排的动画（`assets/motion.css:1-4` 的词汇表约束）
- 读者可见文案一律走 `window.MSI18N.t`，`island.*` 键必须同时存在于 `assets/locale/zh.js`、`en.js`、`es.js`
- 每个新增 `scripts/test-*.cjs` 必须同时登记进 `.github/workflows/deploy-modelscope.yml` 的 `paths:` 与步骤，否则 `scripts/test-ci-coverage.cjs:173` 判红
- 写文件用 LF（`.gitattributes`；`scripts/version-assets.mjs` 按 LF 内容算哈希，Windows CRLF 工作副本会让 `?v=` 与 CI 不一致）
- 岛只在 `document.body.dataset.view === 'reader'` 时挂载显示；首页/目录/路径/练习/社区视图与 `login.html`、`404.html`、`assets/analytics.html` 不出现岛
- 上游数值不得改写：`docs/reference/islandcn/` 是唯一权威，代码里每个魔法数都要能指回该目录的某个文件
- 提交作者身份 `shenmian`；推送走一次性 HTTPS URL（本机 22 端口被代理屏蔽），不改 `remote.origin.url`

---

## 文件结构

| 文件 | 责任 | 任务 |
|---|---|---|
| `docs/reference/islandcn/{spring,path,geometry,metrics,store,motion-subset}.ts`、`README.md`、`LICENSE` | 移植依据，只读参考 | 1 |
| `NOTICE` | islandcn MIT 署名 + 上游 commit + 改动说明 | 1 |
| `assets/island.js` | 引擎：常量表 → 弹簧 → 路径 → 布局 → 活动栈 → 时序 → 渲染 | 2-8 |
| `assets/island.css` | 岛内内容排版、层级、命中区、打印隐藏 | 9 |
| `assets/focus.js` | 专注会话状态机、墙钟、今日累计存储、两条活动的数据源 | 10 |
| `assets/reading.js` | 在已算好的 percent 处广播 `purplebook:progress` | 11 |
| `index.html` | 1 个 `<link>`、2 个 `<script defer>`、1 个挂载点、1 个「专注计时」按钮 | 9, 11 |
| `assets/locale/{zh,en,es}.js` | `island.*` 三语键 | 11 |
| `scripts/test-island.cjs` | 引擎单测 + focus 单测 + 源码契约断言 | 1-11 |
| `.github/workflows/deploy-modelscope.yml` | 新校验脚本登记 | 1 |

`assets/island.js` 的内部命名（后续任务的接口，跨任务必须一致）：

```js
window.Island = {
  enabled,                       // false 时所有方法为空操作
  mount(rootElement, options),   // options: {backdrop, clock, reducedMotion}
  start(options), update(id, partial), end(id), expand(id), collapse(),
  press(kind),                   // 'tap' | 'hold' —— 供测试与键盘复用长按语义
  presentation, activities
}
Island.internals = {             // 测试接缝；只在无 DOM 时被读取
  METRICS, MOTION, luma, keylineAlpha,
  solveSpring, AnimatedValue,
  edgeEase, continuousRectPath, chamferPath, capsulePath, bridgePath,
  compactSides, splitLayout, bubbleTrailing, shapeTarget, shapeTransition,
  deriveScene, isShown, shownOf
}
```

`assets/focus.js` 的接口（依赖注入，便于 Node 测试）：

```js
window.FocusTimer = {
  init({ now, storage, island, t, locale }),   // 缺省用真实 Date.now/localStorage/window.Island/MSI18N
  start(targetMs), pause(), resume(), extend(ms), stop(),
  snapshot(),      // {phase:'none'|'running'|'paused'|'complete', remainingMs, targetMs, todayMs}
  TODAY_KEY        // 'ms-cookbook-focus'
}
```

---

### Task 1: 参考源、署名与测试脚手架

**Files:**
- Create: `docs/reference/islandcn/`（7 个文件）
- Modify: `NOTICE`
- Create: `scripts/test-island.cjs`
- Modify: `.github/workflows/deploy-modelscope.yml`

**Interfaces:**
- Consumes: 无
- Produces: `scripts/test-island.cjs` 的 `check(name, body)` 脚手架（后续任务往同一文件追加断言）；`docs/reference/islandcn/*` 供后续任务对照

- [ ] **Step 1: 取上游 LICENSE 与参考文件**

`islandcn` @ `0011a41ea4882f3818caf35c98f3ee46b80c4a2c`，MIT。registry JSON 里带完整源码：

```bash
mkdir -p docs/reference/islandcn
cd /tmp && for f in island-core island-content; do curl -sL "https://islandcn.dev/r/$f.json" -o "$f.json"; done
node -e '
const fs=require("fs"),p=require("path");
const out=p.process.argv[1];
const want=new Set(["lib/island/spring.ts","lib/island/path.ts","lib/island/geometry.ts","lib/island/metrics.ts","lib/island/store.ts","lib/island/README.md","components/islandcn/theme.ts"]);
for (const n of ["island-core","island-content"]) {
  const j=JSON.parse(fs.readFileSync(n+".json","utf8"));
  for (const f of j.files||[]) if (want.has(f.path)) {
    const dest=p.join(out,f.path.split("/").pop());
    fs.writeFileSync(dest, f.content.replace(/\r\n/g,"\n"));
    console.log("wrote", dest, f.content.split("\n").length, "lines");
  }
}' "$OLDPWD/docs/reference/islandcn"
curl -sL https://raw.githubusercontent.com/opencoredev/islandcn/0011a41ea4882f3818caf35c98f3ee46b80c4a2c/LICENSE -o docs/reference/islandcn/LICENSE
```

预期 7 个文件：`spring.ts`(270) `path.ts`(264) `geometry.ts`(182) `metrics.ts`(350) `store.ts`(436) `README.md`(357) `LICENSE`。
另存一份**弹簧常数摘录**：从 `islandcn.dev/r/island-core.json` 的 `lib/island/motion.ts` 里裁出 `islandMotion` 的 `shape`/`body`/`corner` 三个表 + `alertHold`/`alertContentDelay`/`longPress`/`swell`/`swellTime`/`reduced` 六个标量，写成 `docs/reference/islandcn/motion-subset.ts`（不含 2,302 行全文，只留移植用到的部分，每行保留上游注释里的标定出处）。

- [ ] **Step 2: 写 NOTICE 的署名段**

在 `NOTICE` 末尾"Third-party components…"段之后追加：

```text
The Dynamic Island behaviour in assets/island.js is a port of islandcn:

    https://github.com/opencoredev/islandcn  (commit 0011a41ea4882f3818caf35c98f3ee46b80c4a2c)
    MIT License, copyright (c) 2026 Leo

The ported math lives in spring.ts, path.ts, geometry.ts, metrics.ts and a
motion-constants subset under docs/reference/islandcn/, kept alongside this
notice so every measured number is traceable. Changes made in this port: the
code is plain JavaScript with no React; the activity stack keeps the upstream
rules but drops the development tools, the group hand-off timers and the
recorded-clip comparison; the renderer is a fixed DOM template for the seven
content atoms instead of arbitrary React nodes; the gooey split neck is
deferred (see docs/superpowers/specs/2026-11-16-islandcn-dynamic-island-design.md
section 10). No Apple assets are used; Dynamic Island is a trademark of Apple
Inc. and is not used as this feature's name in reader-facing copy.
```

- [ ] **Step 3: 建 `scripts/test-island.cjs` 的脚手架与首批契约断言**

```js
/* islandcn 移植的契约测试：纯函数在 node 里跑，装配类断言读源码。
   不依赖浏览器，也不 mock 引擎数学——数值全部来自
   docs/reference/islandcn/ 与 docs/superpowers/specs/ 的实测表。
   Run with: node scripts/test-island.cjs */
'use strict';
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const ROOT = resolve(__dirname, '..');
const read = path => readFileSync(resolve(ROOT, path), 'utf8');
const REF = 'docs/reference/islandcn';

let passed = 0;
const failures = [];
function check(name, body) {
  try { body(); passed += 1; console.log('ok   ' + name); }
  catch (error) { failures.push([name, error]); console.log('FAIL ' + name + ': ' + error.message); }
}

/* 在最小沙箱里加载引擎，返回 window.Island。无 DOM 也必须成功。 */
function loadIsland() {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('assets/island.js'), sandbox, { filename: 'assets/island.js' });
  return sandbox.window.Island;
}

check('参考源与上游许可随仓库发布', () => {
  for (const f of ['spring.ts', 'path.ts', 'geometry.ts', 'metrics.ts', 'store.ts', 'README.md', 'motion-subset.ts', 'LICENSE']) {
    assert.ok(existsSync(resolve(ROOT, REF, f)), `missing ${REF}/${f}`);
  }
});

check('NOTICE 含 islandcn 署名与上游 commit', () => {
  const notice = read('NOTICE');
  assert.match(notice, /islandcn/);
  assert.match(notice, /0011a41ea4882f3818caf35c98f3ee46b80c4a2c/);
  assert.match(notice, /MIT License, copyright \(c\) 2026 Leo/);
});

if (failures.length) { failures.forEach(([n, e]) => console.error(n, e)); process.exit(1); }
console.log(`\n${passed} passed`);
```

此刻 `assets/island.js` 尚不存在，第 2、3 条断言之外的检查会失败——这是预期：本任务只要求"参考源 + NOTICE"两条通过。运行前先造一个空文件让 `read('assets/island.js')` 不炸：

```bash
: > assets/island.js
node scripts/test-island.cjs
```

预期输出：前两条 `ok`，第三条（`loadIsland` 还没被调用，故不会失败）——实际只有两条 `check`，输出 `2 passed`，退出码 0。

- [ ] **Step 4: 登记进 CI 并通过覆盖率守卫**

`.github/workflows/deploy-modelscope.yml` 两处改动：`on.push.paths:` 列表内 `scripts/test-motion.cjs` 之后加一行

```yaml
      - 'scripts/test-island.cjs'
```

作业步骤里 `node scripts/test-motion.cjs` 之后加

```yaml
      - name: Test island
        run: node scripts/test-island.cjs
```

```bash
node scripts/test-ci-coverage.cjs
```

预期：PASS（该脚本第 173 行那条测试专门检查"校验脚本是否都在 `paths:` 白名单里"）。

- [ ] **Step 5: 提交**

```bash
git add docs/reference/islandcn NOTICE scripts/test-island.cjs .github/workflows/deploy-modelscope.yml assets/island.js
git commit -m "feat(island): 落地上游移植依据与署名，建 islandcn 契约测试脚手架"
```

---

### Task 2: 常量表与可注入时钟

**Files:**
- Modify: `assets/island.js`（替换 Task 1 的空文件）
- Test: `scripts/test-island.cjs`

**Interfaces:**
- Consumes: `loadIsland()`（Task 1）
- Produces: `Island.internals.METRICS`、`Island.internals.MOTION`、`Island.internals.luma(hex)`、`Island.internals.keylineAlpha(hex)`、`Island.mount/start/…` 的空实现、`Island.enabled`

- [ ] **Step 1: 写失败断言**

在 `scripts/test-island.cjs` 的 `check('NOTICE …')` 之前插入：

```js
check('METRICS 逐字照抄上游实测值', () => {
  const { METRICS } = loadIsland().internals;
  assert.equal(METRICS.top, 13.91);
  assert.deepEqual(METRICS.idle, { width: 94.85, height: 36.84 });
  assert.equal(METRICS.compact.sensorWidth, 94.85);
  assert.equal(METRICS.compact.maxSlotWidth, 72);
  assert.equal(METRICS.compact.maxWidth, 260);
  assert.equal(METRICS.compact.balance, 0.7475);
  assert.equal(METRICS.split.detached.width, 62.18);
  assert.equal(METRICS.minimal.gap, 7.82);
  assert.equal(METRICS.split.maxSpan, 290);
  assert.equal(METRICS.expanded.radius, 47.9);
  assert.equal(METRICS.expanded.sideInset, 13.83);
  assert.deepEqual([METRICS.expanded.minHeight, METRICS.expanded.maxHeight], [84, 180]);
  assert.equal(METRICS.corner.smoothing, 0.72);
});

check('MOTION 取上游弹簧与时长', () => {
  const { MOTION } = loadIsland().internals;
  assert.deepEqual(MOTION.shape.appear, { response: 0.483, dampingFraction: 0.62 });
  assert.deepEqual(MOTION.shape.expand, { response: 0.517, dampingFraction: 0.824 });
  assert.deepEqual(MOTION.shape.dismiss, { response: 0.432, dampingFraction: 1.019 });
  assert.deepEqual(MOTION.body.swap, { response: 0.492, dampingFraction: 0.832, delay: 0.223 });
  assert.equal(MOTION.alertHold, 5.975);
  assert.equal(MOTION.alertContentDelay, 0.12);
  assert.equal(MOTION.longPress, 0.216);
  assert.equal(MOTION.press.swellTime, 0.22);
  assert.equal(MOTION.reduced.duration, 0.2);
});

check('浅色页不画 keyline（本站 --paper:#ffffff）', () => {
  const { luma, keylineAlpha } = loadIsland().internals;
  assert.equal(keylineAlpha('#ffffff'), 0);
  assert.equal(keylineAlpha('#f5f1e6'), 0);           // luma 0.945 ≥ noneFrom 0.17
  assert.ok(Math.abs(keylineAlpha('#000000') - 0.16) < 1e-9);
  assert.ok(keylineAlpha('#121212') > 0 && keylineAlpha('#121212') < 0.16);
});

check('无 DOM 环境加载即返回禁用态，不抛', () => {
  const Island = loadIsland();
  assert.equal(Island.enabled, false);
  assert.equal(Island.presentation, 'idle');
  Island.start({ id: 'x', label: 'x' });               // 必须静默无害
  Island.end('x');
  assert.deepEqual(Island.activities, []);
});
```

```bash
node scripts/test-island.cjs
```

预期：FAIL —— `Cannot read properties of undefined (reading 'internals')`。

- [ ] **Step 2: 写最小实现**

`assets/island.js` 全文（本任务只到常量 + 空 API；后续任务在同一 IIFE 内续写，标 `// [Task N]` 分节注释）：

```js
/* 灵动岛引擎：移植自 islandcn（MIT, (c) 2026 Leo）。
   spring/path/geometry 三节按 docs/reference/islandcn/ 的数学 1:1 移植；
   motion 只取标定过的弹簧与时长；React 协调层由本文件的固定模板渲染替代。
   改动说明见 NOTICE。加载时不碰 DOM：无 document 时整体降级为禁用态。 */
(() => {
  'use strict';

  // ---- METRICS：docs/reference/islandcn/metrics.ts ----
  const METRICS = {
    screen: { width: 402, height: 874 },
    top: 13.91,
    idle: { width: 94.85, height: 36.84 },
    compact: { height: 36.85, sensorWidth: 94.85, edgePadding: 7.18,
      innerPadding: { leading: -0.18, trailing: 0.07 },
      maxSlotWidth: 72, maxWidth: 260, balance: 0.7475 },
    minimal: { height: 36.85, attached: { outerPadding: 7.09, innerPadding: 8.4 },
      detached: { padding: 6.42, minWidth: 36.85 }, gap: 7.82 },
    split: { attached: { outerPadding: 6.59, gap: 6.15, innerPadding: 8.18 },
      detached: { outerPadding: 6.42, gap: 12, trailingPadding: 13.09, width: 62.18,
        slotGap: 6.085, slotEnd: 7.175 }, maxSpan: 290 },
    corner: { smoothing: 0.72 },
    expanded: { sideInset: 13.83, top: 13.83, minHeight: 84, maxHeight: 180, radius: 47.9,
      padding: { top: 18.18, side: 18.5, trailing: 17.81, bottom: 18.35 },
      bottomInset: 0, centerTop: 1.33, rowGap: 8,
      shadow: { offsetY: 10.7, blur: 30.76, aspect: 1.018, opacity: 0.3533,
        tail: { offsetY: 23.43, blur: 81.03, aspect: 1.084, strength: 0.0922 } } },
    contentClip: { radius: 34.4 },
    press: { squish: 0.09, swell: 0.187 },
    bridge: { handleSize: 2.4, spread: 0.3, maxGap: 5 },
    content: { blur: 8, scale: 0.85, follow: 1, followMin: 0.2, followMax: 2.5 },
    sensor: { opacity: 1 },
    keyline: { width: 1.5, alpha: 0.16, fullUntil: 0.04, noneFrom: 0.17,
      expandedDim: 0.07, ramp: 6, fade: [{ luma: 0.0706, share: 0.328 }, { luma: 0.1104, share: 0.109 }] }
  };

  // ---- MOTION：docs/reference/islandcn/motion-subset.ts ----
  const SPRINGS = (a, b, c, d, e, f, g, h, i, j) => ({
    appear: { response: a, dampingFraction: b }, expand: { response: c, dampingFraction: d },
    pressExpand: { response: 0.387, dampingFraction: 0.792 }, appearExpand: { response: 0.54, dampingFraction: 0.811 },
    swap: { response: 0.498, dampingFraction: 0.829 }, collapse: { response: 0.479, dampingFraction: 0.894 },
    alertCollapse: { response: 0.535, dampingFraction: 0.84 }, collapseSplit: { response: 0.4, dampingFraction: 0.9 },
    split: { response: e, dampingFraction: f }, unsplit: { response: g, dampingFraction: h },
    dismiss: { response: i, dampingFraction: j }, resize: { response: 0.5, dampingFraction: 0.82 }
  });
  const MOTION = {
    shape: SPRINGS(0.483, 0.62, 0.517, 0.824, 0.505, 0.815, 0.487, 0.794, 0.432, 1.019),
    body: {
      appear: { response: 0.483, dampingFraction: 0.62, delay: 0 },
      expand: { response: 0.497, dampingFraction: 0.825, delay: 0 },
      pressExpand: { response: 0.388, dampingFraction: 0.791, delay: 0 },
      appearExpand: { response: 0.523, dampingFraction: 0.817, delay: 0 },
      swap: { response: 0.492, dampingFraction: 0.832, delay: 0.223 },
      collapse: { response: 0.453, dampingFraction: 0.928, delay: 0 },
      alertCollapse: { response: 0.481, dampingFraction: 0.908, delay: 0 },
      collapseSplit: { response: 0.481, dampingFraction: 0.884, delay: 0 },
      split: { response: 0.505, dampingFraction: 0.815, delay: 0 },
      unsplit: { response: 0.5, dampingFraction: 0.74, delay: 0 },
      dismiss: { response: 0.442, dampingFraction: 0.97, delay: 0 },
      resize: { response: 0.5, dampingFraction: 0.82, delay: 0 }
    },
    // corner 表照 motion-subset.ts 的 corner.*；与 shape 同 transition 键
    corner: { /* Task 2 Step 3 填入 */ },
    press: { squish: { response: 0.3, dampingFraction: 1 }, swell: { response: 0.803, dampingFraction: 0.641 }, swellTime: 0.22 },
    alertHold: 5.975, alertContentDelay: 0.12, longPress: 0.216,
    reduced: { duration: 0.2 }
  };

  // ---- 颜色亮度与 keyline 强度：metrics.ts 的 keylineFade ----
  const luma = hex => {
    const v = parseInt(hex.replace('#', ''), 16);
    const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(k => k / 255);
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const keylineAlpha = bg => {
    const k = METRICS.keyline, L = luma(bg);
    if (L >= k.noneFrom) return 0;
    if (L <= k.fullUntil) return k.alpha;
    // 两个实测点之间按对数插值（上游：一条指数线过不了两个点）
    const pts = [{ luma: k.fullUntil, share: 1 }, ...k.fade, { luma: k.noneFrom, share: 0 }];
    for (let i = 1; i < pts.length; i += 1) {
      if (L <= pts[i].luma) {
        const a = pts[i - 1], b = pts[i];
        const t = Math.log(L / a.luma) / Math.log(b.luma / a.luma);
        return k.alpha * Math.exp(t * Math.log(Math.max(b.share, 1e-9) / a.share));
      }
    }
    return 0;
  };

  // ---- 状态与时序（Task 6-7 填充）----
  let mounted = null, clock = () => performance.now() / 1000;

  const noop = () => {};
  const Island = {
    enabled: false,
    presentation: 'idle',
    activities: [],
    mount: noop, start: () => ({ id: '', update: noop, end: noop }),
    update: noop, end: noop, expand: noop, collapse: noop, press: noop
  };
  if (typeof document !== 'undefined') {
    // Task 8 起才真正接管 DOM；此处仅声明挂载点存在与否
    Island.enabled = true;
  }
  Island.mount = (root, options = {}) => {
    if (options.clock) clock = options.clock;
    mounted = root;
  };
  Island.internals = { METRICS, MOTION, luma, keylineAlpha };
  window.Island = Island;
})();
```

- [ ] **Step 3: 补 `corner` 弹簧表**

从 `docs/reference/islandcn/motion-subset.ts` 的 `corner` 段逐键抄入 `MOTION.corner`，键与 `shape` 同（12 个 transition），每键 `{response, dampingFraction, delay?}`。抄完后在测试里加一条锁定三条最常走的路径：

```js
check('corner 弹簧与 shape 同键且至少覆盖四种 transition', () => {
  const { MOTION } = loadIsland().internals;
  const keys = ['appear', 'expand', 'collapse', 'dismiss'];
  keys.forEach(k => assert.ok(MOTION.corner[k], `corner.${k} missing`));
  assert.deepEqual(Object.keys(MOTION.corner).sort(), Object.keys(MOTION.shape).sort());
});
```

- [ ] **Step 4: 运行**

```bash
node scripts/test-island.cjs
```

预期：`6 passed`（Task 1 的 2 条 + 本任务 4 条），退出码 0。

- [ ] **Step 5: 提交**

```bash
git add assets/island.js scripts/test-island.cjs
git commit -m "feat(island): 引擎常量表与 keyline 亮度计算"
```

---

### Task 3: 闭式弹簧与飞行中重定向

**Files:**
- Modify: `assets/island.js`
- Test: `scripts/test-island.cjs`

**Interfaces:**
- Consumes: `Island.internals.MOTION`
- Produces: `Island.internals.solveSpring(config, target, x0, v0, t) -> {value, velocity}`；`Island.internals.AnimatedValue`（`new AnimatedValue(value, config)`，方法 `set(target, config?)`、`step(dtSeconds)`、属性 `value`、`done`）

- [ ] **Step 1: 写失败断言**

```js
check('solveSpring 闭式解：0→150 在 appear 弹簧上的实测轨迹', () => {
  const { solveSpring, MOTION } = loadIsland().internals;
  const at = t => solveSpring(MOTION.shape.appear, 150, 0, 0, t).value;
  assert.equal(at(0), 0);
  assert.ok(Math.abs(at(0.1) - 69.888) < 0.01, `t=.1 -> ${at(0.1)}`);
  assert.ok(Math.abs(at(0.2) - 142.498) < 0.01, `t=.2 -> ${at(0.2)}`);
  assert.ok(Math.abs(at(0.3) - 162.463) < 0.01, `t=.3 -> ${at(0.3)}`);   // 已过冲
  assert.ok(Math.abs(at(1.5) - 150) < 0.001);
  // 欠阻尼必有过冲，峰值约 162.5（+8.35%）出现在 t≈0.31
  let peak = 0, peakT = 0;
  for (let t = 0; t <= 1; t += 0.005) { const v = at(t); if (v > peak) { peak = v; peakT = t; } }
  assert.ok(peak > 160 && peak < 165, `peak ${peak}`);
  assert.ok(peakT > 0.28 && peakT < 0.34, `peakT ${peakT}`);
});

check('过阻尼不发散，临界阻尼无过冲', () => {
  const { solveSpring } = loadIsland().internals;
  const over = t => solveSpring({ response: 0.432, dampingFraction: 1.019 }, 0, 150, 0, t).value;
  assert.ok(over(1.2) < 0.01 && over(1.2) > -0.01, `dismiss settles: ${over(1.2)}`);
  let maxAbove = -Infinity;
  for (let t = 0; t <= 2; t += 0.005) maxAbove = Math.max(maxAbove, over(t));
  assert.ok(maxAbove <= 150 + 1e-9, 'df>1 must not overshoot past the start value');
  const crit = t => solveSpring({ response: 1, dampingFraction: 1 }, 100, 0, 0, t).value;
  assert.ok(crit(0.5) > 0 && crit(0.5) < 100 && crit(5) > 99.9);
});

check('AnimatedValue 飞行中改目标保留速度，不跳变', () => {
  const { AnimatedValue, MOTION } = loadIsland().internals;
  const a = new AnimatedValue(0, MOTION.shape.expand);
  a.set(374.34);
  for (let i = 0; i < 12; i += 1) a.step(1 / 60);
  const before = a.value;
  assert.ok(before > 0 && before < 374.34);
  a.set(94.85);                       // 展开被打断成收合
  assert.ok(Math.abs(a.value - before) < 1e-9, 'retarget must not jump the value');
  for (let i = 0; i < 120; i += 1) a.step(1 / 60);
  assert.ok(Math.abs(a.value - 94.85) < 0.01);
  assert.equal(a.done, true);
});
```

```bash
node scripts/test-island.cjs
```

预期：FAIL —— `solveSpring is not a function`。

- [ ] **Step 2: 实现（`spring.ts` 的数学，去掉类型）**

```js
  // ---- spring.ts：SwiftUI 参数的闭式阻尼弹簧 ----
  // stiffness = (2π/response)²，damping = 4π·dampingFraction/response，质量 1。
  // 闭式而非数值积分：任一时刻的值精确，暂停的时钟可跳到任意帧都得同一像素。
  const solveSpring = (config, target, x0, v0, t) => {
    const w0 = 2 * Math.PI / config.response;
    const z = config.dampingFraction;
    const d = x0 - target;
    const e = Math.exp(-z * w0 * t);
    if (z < 1 - 1e-9) {
      const wd = w0 * Math.sqrt(1 - z * z);
      const A = d, B = (v0 + z * w0 * d) / wd;
      const s = Math.sin(wd * t), c = Math.cos(wd * t);
      return { value: target + e * (A * c + B * s),
               velocity: e * ((B * wd - A * z * w0) * c - (A * wd + B * z * w0) * s) };
    }
    if (z < 1 + 1e-9) {
      const A = d, B = v0 + w0 * d;
      return { value: target + e * (A + B * t), velocity: e * (B - w0 * (A + B * t)) };
    }
    const s = w0 * Math.sqrt(z * z - 1);
    const r1 = -z * w0 + s, r2 = -z * w0 - s;
    const A = (v0 - r2 * d) / (r1 - r2), B = d - A;
    return { value: target + A * Math.exp(r1 * t) + B * Math.exp(r2 * t),
             velocity: A * r1 * Math.exp(r1 * t) + B * r2 * Math.exp(r2 * t) };
  };

  class AnimatedValue {
    constructor(value, config, velocity = 0) {
      this.current = value; this.target = value; this.velocity = velocity;
      this.time = 0; this.config = config;
    }
    set(target, config) {
      if (target === this.target && (config === undefined || config === this.config)) return;
      this.config = config || this.config;
      this.target = target;               // 从当前值与当前速度起跳：不打断成跳变
      this.time = 0;
    }
    step(dt) {
      if (this.config === undefined) return;
      this.time += dt;
      const s = solveSpring(this.config, this.target, this.start, this.startVelocity, this.time);
      this.current = s.value; this.velocity = s.velocity;
    }
    get value() { return this.current; }
    get done() { return Math.abs(this.current - this.target) < 1e-4 && Math.abs(this.velocity) < 1e-3; }
  }
```

注意 `step()` 用到 `this.start/this.startVelocity`：`set()` 里必须把它们钉住（这是"同一段弹簧可被 seek"的关键）：

```js
    set(target, config) {
      if (target === this.target && (config === undefined || config === this.config)) return;
      this.config = config || this.config;
      this.start = this.current; this.startVelocity = this.velocity;
      this.target = target; this.time = 0;
    }
```

构造函数同步补 `this.start = value; this.startVelocity = velocity;`。

- [ ] **Step 3: 把新符号挂进测试接缝**

`Island.internals = { METRICS, MOTION, luma, keylineAlpha, solveSpring, AnimatedValue };`

- [ ] **Step 4: 运行**

```bash
node scripts/test-island.cjs
```

预期：`9 passed`。

- [ ] **Step 5: 提交**

```bash
git add assets/island.js scripts/test-island.cjs
git commit -m "feat(island): 闭式阻尼弹簧与飞行中重定向"
```

---

### Task 4: 连续圆角路径

**Files:**
- Modify: `assets/island.js`
- Test: `scripts/test-island.cjs`

**Interfaces:**
- Consumes: `METRICS.corner.smoothing`
- Produces: `Island.internals.edgeEase(r, smoothing, room) -> {p,a,b,along,across}`、`continuousRectPath(x,y,width,height,radius,smoothing,leading?) -> d`、`capsulePath(x,y,w,h,smoothing) -> d`、`chamferPath(x,y,w,h,leg) -> d`、`bridgePath(a,b,{handleSize,spread,maxGap,power}) -> d`

- [ ] **Step 1: 写失败断言**

```js
check('edgeEase：胶囊的短边只吃下装得下的平滑', () => {
  const { edgeEase } = loadIsland().internals;
  const r = 18.42;                                  // idle 的半径 = h/2
  const across = edgeEase(r, 0.72, 94.85 / 2);      // 长边：满 0.72
  assert.ok(Math.abs(across.p - 31.682) < 0.01, `p ${across.p}`);
  assert.ok(Math.abs(across.along - 8.55) < 0.01);
  assert.ok(Math.abs(across.across - 2.867) < 0.01);
  assert.ok(Math.abs(across.a - 12.409) < 0.01);
  assert.ok(Math.abs(across.b - 6.205) < 0.01);
  const down = edgeEase(r, 0.72, 36.84 / 2);        // 短边：room/r-1 = 0 -> 平滑被夹到 0
  assert.equal(down.p, r);                          // (1+0)*r
  assert.equal(down.along, 0);
  assert.equal(down.across, 0);
  assert.equal(down.b, 0);
});

check('continuousRectPath 出的是闭合路径且坐标不越界', () => {
  const { continuousRectPath } = loadIsland().internals;
  const d = continuousRectPath(-47.425, 13.91, 94.85, 36.84, 18.42, 0.72);
  assert.ok(d.startsWith('M '), d.slice(0, 24));
  assert.ok(d.endsWith('Z'));
  assert.equal((d.match(/A /g) || []).length, 4);    // 四段圆弧
  assert.equal((d.match(/C /g) || []).length, 8);    // 八段缓入三次
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  for (let i = 0; i < nums.length; i += 2) {
    assert.ok(nums[i] >= -47.43 && nums[i] <= 47.43, `x ${nums[i]} out of band`);
    assert.ok(nums[i + 1] >= 13.9 && nums[i + 1] <= 50.76, `y ${nums[i + 1]} out of band`);
  }
  // 退化输入不崩
  assert.equal(continuousRectPath(0, 0, 0, 10, 5, 0.72), '');
  assert.match(continuousRectPath(0, 0, 20, 10, 0, 0.72), /^M 0 0 H 20 V 10 H 0 Z$/);
});

check('expanded 的半径 47.9 在 374.34 宽上吃满平滑', () => {
  const { continuousRectPath, edgeEase } = loadIsland().internals;
  const room = (402 - 2 * 13.83) / 2;
  assert.equal(room, 187.17);
  assert.equal(edgeEase(47.9, 0.72, room).p, 82.388);   // (1+0.72)*47.9
  const d = continuousRectPath(-187.17, 13.83, 374.34, 106.53, 47.9, 0.72);
  assert.equal((d.match(/A /g) || []).length, 4);
});

check('chamferPath 按 45 度切角裁内容', () => {
  const { chamferPath } = loadIsland().internals;
  const d = chamferPath(10, 10, 100, 50, 20);
  assert.ok(d.startsWith('M 30 10'), d);
  assert.equal(d.split('L ').length - 1, 7);
});

check('bridgePath 在间隙达 maxGap 时断开（黏颈里程碑用）', () => {
  const { bridgePath } = loadIsland().internals;
  const opts = { handleSize: 2.4, spread: 0.3, maxGap: 5 };
  assert.equal(bridgePath({ x: 0, y: 0, r: 18 }, { x: 50, y: 0, r: 18 }, opts), '');  // gap=14
  const d = bridgePath({ x: 0, y: 0, r: 18 }, { x: 40, y: 0, r: 18 }, opts);         // gap=4
  assert.ok(d.length > 0 && d.endsWith('Z'));
  assert.equal(bridgePath({ x: 0, y: 0, r: 0 }, { x: 10, y: 0, r: 5 }, opts), '');
});
```

```bash
node scripts/test-island.cjs
```

预期：FAIL —— `edgeEase is not a function`。

- [ ] **Step 2: 实现（`path.ts` 去类型照抄）**

照 `docs/reference/islandcn/path.ts` 移植五个函数，保持 `fmt` 的三位小数舍入（它决定测试里 `startsWith('M 30 10')` 这类字面断言）：

```js
  // ---- path.ts：连续圆角与黏颈的 SVG 路径构造 ----
  const fmt = n => (Math.round(n * 1000) / 1000).toString();
  const edgeEase = (r, smoothing, room) => {
    const s = Math.max(0, Math.min(smoothing, room / r - 1));
    const angle = (Math.PI / 4) * s;
    const p = (1 + s) * r;
    const along = r * (1 - Math.sin(angle));
    const across = r * (1 - Math.cos(angle));
    const c = r * Math.tan(angle / 2) * Math.cos(angle);
    const b = Math.max(0, (p - c - along) / 3);
    return { p, a: 2 * b, b, along, across };
  };
```

`continuousRectPath(x, y, width, height, radius, smoothing, leading = radius)` 与上游逐行对应：`r`/`rl` 夹到边长一半、`across/down/acrossL/downL` 四次 `edgeEase`、`corner()` 产出 `L…C…A…C…`，顺时针从顶边起笔，`Z` 收尾。`capsulePath`/`chamferPath`/`bridgePath`（`polar` 辅助 + 四个角度 + 四条把手）同样照抄。**不重写数学，只删类型标注。**

- [ ] **Step 3: 挂接缝并运行**

```bash
node scripts/test-island.cjs
```

预期：`14 passed`。

- [ ] **Step 4: 提交**

```bash
git add assets/island.js scripts/test-island.cjs
git commit -m "feat(island): 连续圆角与黏颈路径构造"
```

---

### Task 5: 四态布局与 transition 选择

**Files:**
- Modify: `assets/island.js`
- Test: `scripts/test-island.cjs`

**Interfaces:**
- Consumes: `METRICS`
- Produces: `Island.internals.compactSides(measure) -> {leading,trailing}`、`splitLayout(measure) -> {left,right,bubbleLeft,bubbleRight,attachedWidth,bubbleWidth}|null`、`bubbleTrailing(detached, bubbleWidth) -> {width,fromRight,room}`、`shapeTarget(kind, measure, screenWidth) -> {left,right,top,height,radius,bubbleLeft,bubbleRight,bubbleHeight}`、`shapeTransition(from, to, {swap,swelling,alert}) -> name`；`measure` 形如 `{leading,trailing,attached,detached,split:{attached:{leading,trailing},detached:{leading,trailing}}|null,expandedHeight}`

- [ ] **Step 1: 写失败断言（数值全部来自本次已验证的实算）**

```js
const pair = (leading, trailing) => ({ leading, trailing, attached: 0, detached: 0, split: null, expandedHeight: 0 });

check('compact：两侧各按内容生长，短边按 balance 补齐', () => {
  const { compactSides } = loadIsland().internals;
  const s = compactSides(pair(22, 20));        // 书签图标 + "43%"
  assert.ok(Math.abs(s.leading - 29) < 0.01, `leading ${s.leading}`);
  assert.ok(Math.abs(s.trailing - 27.25) < 0.01, `trailing ${s.trailing}`);
  const f = compactSides(pair(22, 38));        // 莲座图标 + "24:58"
  assert.ok(Math.abs(f.leading - 33.824) < 0.01);
  assert.ok(Math.abs(f.trailing - 45.25) < 0.01);
  // 单边为空则留在传感器边：balance 只管两侧都有内容的情况
  assert.equal(compactSides(pair(0, 40)).leading, 0);
  // slot 上限 72：超宽内容不越过 maxSlotWidth
  assert.ok(Math.abs(compactSides(pair(22, 200)).trailing - 79.25) < 0.01);
});

check('split：主胶囊占到传感器右边，副胶囊恒 62.18', () => {
  const { splitLayout } = loadIsland().internals;
  const m = { leading: 0, trailing: 0, attached: 0, detached: 0, expandedHeight: 0,
    split: { attached: { leading: 22, trailing: 38 }, detached: { leading: 22, trailing: 20 } } };
  const l = splitLayout(m);
  assert.ok(Math.abs(l.left - (-128.345)) < 0.01, `left ${l.left}`);
  assert.ok(Math.abs(l.right - 47.425) < 0.01);
  assert.ok(Math.abs(l.bubbleLeft - 55.245) < 0.01);   // 传感器右 + gap 7.82
  assert.ok(Math.abs(l.bubbleRight - 117.425) < 0.01);
  assert.ok(Math.abs(l.bubbleWidth - 62.18) < 0.01);
  assert.ok(Math.abs((l.bubbleRight - l.left) - 245.77) < 0.01);  // < maxSpan 290
});

check('split：副胶囊 trailing 只剩 20.5pt —— 倒计时放不进去（设计文档 §4.3 的依据）', () => {
  const { bubbleTrailing } = loadIsland().internals;
  const ring = bubbleTrailing({ leading: 22, trailing: 20 }, 62.18);
  assert.ok(Math.abs(ring.room - 20.5) < 0.01, `room ${ring.room}`);
  assert.equal(ring.width, 20);                       // ring 放得下，不被裁
  const digits = bubbleTrailing({ leading: 22, trailing: 38 }, 62.18);
  assert.ok(Math.abs(digits.width - 20.5) < 0.01);    // "24:58" 被裁到只剩 room
  assert.ok(digits.width < 38, 'digits must be clipped inside the bubble');
});

check('split 超过 maxSpan 时退回 minimal', () => {
  const { splitLayout } = loadIsland().internals;
  const tooWide = { leading: 0, trailing: 0, attached: 0, detached: 0, expandedHeight: 0,
    split: { attached: { leading: 72, trailing: 72 }, detached: { leading: 72, trailing: 72 } } };
  assert.equal(splitLayout(tooWide), null);
  assert.equal(splitLayout({ leading: 0, trailing: 0, attached: 0, detached: 0, expandedHeight: 0, split: null }), null);
});

check('shapeTarget 四态：idle/compact/minimal/expanded', () => {
  const { shapeTarget, METRICS } = loadIsland().internals;
  const idle = shapeTarget('idle', pair(0, 0), 402);
  assert.deepEqual([idle.left, idle.right, idle.height, idle.radius], [-47.425, 47.425, 36.84, 18.42]);
  assert.equal(idle.top, 13.91);
  assert.equal(idle.bubbleHeight, 0);
  const compact = shapeTarget('compact', pair(22, 20), 402);
  assert.ok(Math.abs((compact.right - compact.left) - 151.1) < 0.01, `width ${compact.right - compact.left}`);
  const expanded = shapeTarget('expanded', { ...pair(0, 0), expandedHeight: 70 }, 402);
  assert.equal(expanded.width_ ?? (expanded.right - expanded.left), 374.34);
  assert.ok(Math.abs(expanded.height - 106.53) < 0.01, `h ${expanded.height}`);
  assert.equal(expanded.radius, METRICS.expanded.radius);
  assert.equal(shapeTarget('expanded', { ...pair(0, 0), expandedHeight: 200 }, 402).height, 180);
  assert.equal(shapeTarget('expanded', { ...pair(0, 0), expandedHeight: 40 }, 402).height, 84);
});

check('宽屏按手机宽度夹紧，不拉伸', () => {
  const { shapeTarget } = loadIsland().internals;
  assert.equal(shapeTarget('expanded', pair(0, 0), 1440).right - shapeTarget('expanded', pair(0, 0), 1440).left, 374.34);
});

check('shapeTransition 选择矩阵与上游一致', () => {
  const { shapeTransition } = loadIsland().internals;
  const o = { swap: false, swelling: false, alert: false };
  assert.equal(shapeTransition('compact', 'compact', o), 'resize');
  assert.equal(shapeTransition('idle', 'expanded', o), 'appearExpand');
  assert.equal(shapeTransition('minimal', 'expanded', o), 'swap');
  assert.equal(shapeTransition('compact', 'expanded', { ...o, swelling: true }), 'pressExpand');
  assert.equal(shapeTransition('compact', 'expanded', { ...o, swap: true }), 'swap');
  assert.equal(shapeTransition('compact', 'expanded', o), 'expand');
  assert.equal(shapeTransition('expanded', 'minimal', o), 'collapseSplit');
  assert.equal(shapeTransition('expanded', 'idle', o), 'dismiss');
  assert.equal(shapeTransition('expanded', 'compact', { ...o, alert: true }), 'alertCollapse');
  assert.equal(shapeTransition('expanded', 'compact', o), 'collapse');
  assert.equal(shapeTransition('idle', 'compact', o), 'appear');
  assert.equal(shapeTransition('compact', 'minimal', o), 'split');
  assert.equal(shapeTransition('minimal', 'compact', o), 'unsplit');
});
```

```bash
node scripts/test-island.cjs
```

预期：FAIL —— `compactSides is not a function`。

- [ ] **Step 2: 实现（`geometry.ts` 去类型照抄）**

上游的 `ShapeTarget`/`ContentMeasure` 概念保持不变，`islandScreenWidth`、`expandedWidth`、`hiddenBubble`、`splitLayout`、`bubbleTrailing`、`compactSides`、`shapeTarget`、`shapeTransition` 逐个移植；`clamp` 用本地小函数。**改动只允许两处**：(1) 去掉 TS 类型与 `import type`；(2) `metrics` 参数改为闭包引用 `METRICS`。

- [ ] **Step 3: 挂接缝并运行**

```bash
node scripts/test-island.cjs
```

预期：`21 passed`。若 `shapeTarget('expanded', …)` 那条失败：上游用 `expandedWidth(screenWidth, metrics)`，其中 `screenWidth = islandScreenWidth(containerWidth, metrics)`——`1440` 必须先在 `shapeTarget` 内部被夹到 `min(1440, 402)`，检查是否在 `expanded` 分支里忘了夹。

- [ ] **Step 4: 提交**

```bash
git add assets/island.js scripts/test-island.cjs
git commit -m "feat(island): 四态布局与 transition 选择"
```

---

### Task 6: 活动栈

**Files:**
- Modify: `assets/island.js`
- Test: `scripts/test-island.cjs`

**Interfaces:**
- Consumes: `shapeTarget`、`shapeTransition`（Task 5）
- Produces: 内部 `state`（`activities`、`expanded`、`front`、`handoff`、`nextOrder`）+ `Island.internals.deriveScene(state)`、`isShown(state, activity)`、`shownOf(state, group)`；真实现 `Island.start/update/end/expand/collapse`、`Island.presentation`、`Island.activities`

- [ ] **Step 1: 写失败断言**

```js
const mk = id => ({ id, label: id, compact: { leading: { text: 'L' + id }, trailing: { text: id } },
  expanded: { center: { text: 'E' + id } } });

check('start 返回句柄，同 id 再 start 是更新而非新增', () => {
  const Island = loadIsland();
  Island.mount({});                     // 测试用假根节点：本任务不渲染
  Island.start(mk('a'));
  Island.start(mk('a'));
  assert.equal(Island.activities.length, 1);
  assert.equal(Island.presentation, 'compact');
});

check('两条活动 -> 分裂，priority 高者占主胶囊', () => {
  const Island = loadIsland();
  Island.mount({});
  Island.start({ ...mk('progress'), group: 'reading', priority: 0 });
  Island.start({ ...mk('timer'), group: 'focus', priority: 1 });
  assert.equal(Island.presentation, 'minimal');
  assert.deepEqual(Island.activities.map(a => a.id), ['timer', 'progress']);
});

check('同 group 一次只显示一条，先开始的显示', () => {
  const Island = loadIsland();
  Island.mount({});
  Island.start({ ...mk('run1'), group: 'runs' });
  Island.start({ ...mk('run2'), group: 'runs' });
  assert.equal(Island.presentation, 'compact');
  assert.equal(Island.activities[0].id, 'run1');
  assert.equal(Island.activities.length, 2, '隐藏的同组活动仍在栈里');
});

check('update 深合并只覆盖给定槽', () => {
  const Island = loadIsland();
  Island.mount({});
  const h = Island.start(mk('a'));
  h.update({ compact: { trailing: { text: '47%' } } });
  const a = Island.activities[0];
  assert.deepEqual(a.content.compact, { leading: { text: 'La' }, trailing: { text: '47%' } });
  h.update({ label: '本章阅读进度 47%' });
  assert.equal(Island.activities[0].label, '本章阅读进度 47%');
});

check('end 后回 idle；expand/collapse 决定 expanded 态', () => {
  const Island = loadIsland();
  Island.mount({});
  const h = Island.start(mk('a'));
  assert.equal(Island.presentation, 'compact');
  Island.expand('a');
  assert.equal(Island.presentation, 'expanded');
  Island.collapse();
  assert.equal(Island.presentation, 'compact');
  h.end();
  assert.equal(Island.presentation, 'idle');
  assert.deepEqual(Island.activities, []);
});

check('分裂态的读屏标签把两条并列（store.ts 的 `${first}, ${second}`）', () => {
  const { deriveScene } = loadIsland().internals;
  const scene = deriveScene({ activities: [
    { id: 'timer', group: 'focus', priority: 1, order: 1, label: '专注剩余 24 分 58 秒', content: mk('timer').compact ? { compact: mk('timer').compact, expanded: { center: { text: 'x' } }, minimal: null } : null, revision: 0 },
    { id: 'progress', group: 'reading', priority: 0, order: 2, label: '本章 43%', content: { compact: mk('progress').compact, expanded: { center: { text: 'y' } }, minimal: null }, revision: 0 }
  ], expanded: null, front: {}, handoff: null });
  assert.equal(scene.presentation.kind, 'minimal');
  assert.equal(scene.label, '专注剩余 24 分 58 秒, 本章 43%');
});
```

```bash
node scripts/test-island.cjs
```

预期：FAIL —— `Island.start(...) is undefined` 之类（现在的 `start` 返回 `{id:''}` 但没状态）。

- [ ] **Step 2: 实现 `deriveScene` / `isShown` / `shownOf`（照 `store.ts`）**

`store.ts:59-109` 三个函数逐条移植，字段名一致（`activities`、`front`、`handoff`、`revision`、`content`、`label`、`priority`、`order`、`group`）。`minimalOf(content)` 取 `content.minimal`，缺失时回退 `content.compact`（上游规则）。

- [ ] **Step 3: 实现栈操作**

```js
  const state = { activities: [], expanded: null, front: {}, handoff: null, nextOrder: 1 };
  const bySort = (a, b) => b.priority - a.priority || a.order - b.order;   // 主活动优先
  const find = id => state.activities.find(a => a.id === id);
  const merge = (base, over) => {
    const out = { ...base };
    for (const key of Object.keys(over)) {
      out[key] = over[key] && typeof over[key] === 'object' && base && typeof base[key] === 'object'
        ? { ...base[key], ...over[key] } : over[key];
    }
    return out;
  };
  const commit = () => { /* Task 8 在此通知渲染层 */ };

  const start = options => {
    const existing = find(options.id);
    if (existing) { update(existing.id, options); return handle(existing.id); }
    state.activities.push({
      id: options.id, label: options.label || options.id, priority: options.priority || 0,
      group: options.group === undefined ? null : options.group, order: state.nextOrder++,
      startedAt: clock(), revision: 0,
      content: { compact: options.compact || null, minimal: options.minimal || null, expanded: options.expanded || null },
      onPress: options.onPress || null
    });
    state.activities.sort(bySort);
    if (options.alert) scheduleAlert(options.id, clock());
    commit();
    return handle(options.id);
  };
  const update = (id, partial) => {
    const a = find(id);
    if (!a) return;
    if (partial.compact) a.content.compact = merge(a.content.compact, partial.compact);
    if (partial.expanded) a.content.expanded = merge(a.content.expanded, partial.expanded);
    if (partial.minimal) a.content.minimal = merge(a.content.minimal, partial.minimal);
    if (partial.label) a.label = partial.label;
    if (partial.priority !== undefined) a.priority = partial.priority;
    if (partial.transition === 'crossfade') a.revision += 1;      // 内容换脸而非更新
    if (partial.alert) scheduleAlert(id, clock());
    state.activities.sort(bySort);
    commit();
  };
  const end = id => {
    const index = state.activities.findIndex(a => a.id === id);
    if (index < 0) return;
    const [gone] = state.activities.splice(index, 1);
    if (state.expanded && state.expanded.id === id) state.expanded = null;
    if (gone.group !== null && state.front[gone.group] === id) delete state.front[gone.group];
    commit();
  };
  const expand = id => {
    const a = find(id || (deriveScene(state).primary || {}).id);
    if (!a) return;
    if (a.group !== null) state.front[a.group] = a.id;
    state.expanded = { id: a.id, at: clock() };
    commit();
  };
  const collapse = () => { state.expanded = null; commit(); };
  const handle = id => ({ id, update: partial => update(id, partial), end: () => end(id) });
```

`Island` 的 `presentation`/`activities` 改成 getter：

```js
  Object.defineProperties(Island, {
    presentation: { get: () => deriveScene(state).presentation.kind },
    activities: { get: () => state.activities.filter(a => isShown(state, a)) }
  });
```

注意 `activities` getter 只返回**在显**的（`isShown` 过滤），但 Task 6 第 3 条断言期望长度 2——把该断言改为两条：

```js
  assert.equal(Island.activities.length, 1, '在显的同组活动只有一条');
  assert.equal(Island.internals.allActivities().length, 2, '隐藏的那条仍在栈里');
```

并在 internals 暴露 `allActivities: () => state.activities.slice()`。

- [ ] **Step 4: 运行**

```bash
node scripts/test-island.cjs
```

预期：`27 passed`。

- [ ] **Step 5: 提交**

```bash
git add assets/island.js scripts/test-island.cjs
git commit -m "feat(island): 活动栈与场景推导"
```

---

### Task 7: alert、长按与减动效时序

**Files:**
- Modify: `assets/island.js`
- Test: `scripts/test-island.cjs`

**Interfaces:**
- Consumes: `state`、`expand/collapse`（Task 6）、`MOTION`（Task 2）
- Produces: `Island.internals.setClock(fn)`（测试注入假时钟）、`tick(nowSeconds)` 驱动所有定时器与弹簧；内部 `scheduleAlert(id, at)`、`pressStart()`、`pressEnd()`

- [ ] **Step 1: 写失败断言**

```js
/* 假时钟：tickTo 以 1/60 秒步进推进，与浏览器一致 */
function rig() {
  const Island = loadIsland();
  let now = 0;
  Island.internals.setClock(() => now);
  Island.mount({});
  const advance = seconds => { const target = now + seconds; while (now < target) { now += 1 / 60; Island.internals.tick(now); } };
  return { Island, advance, get now() { return now; } };
}

check('alerting update：0.12s 后展开内容，5.975s 后自动回落', () => {
  const { Island, advance } = rig();
  Island.start({ id: 'a', label: 'A', compact: { trailing: { text: '1' } } });
  Island.update('a', { alert: true, compact: { trailing: { text: '2' } } });
  assert.equal(Island.presentation, 'compact', 'alert 的第一拍仍是胶囊');
  advance(0.2);
  assert.equal(Island.presentation, 'expanded', '内容延迟后展开');
  advance(5.9);
  assert.equal(Island.presentation, 'expanded', 'hold 未到不回落');
  advance(0.2);
  assert.equal(Island.presentation, 'compact', 'hold 到点回落');
});

check('idle 上的 alert 以 expanded 出场（appearExpand）', () => {
  const { Island, advance } = rig();
  Island.start({ id: 'a', label: 'A', alert: true, compact: { trailing: { text: '1' } }, expanded: { center: { text: '完成' } } });
  advance(0.2);
  assert.equal(Island.presentation, 'expanded');
});

check('长按 0.216s 才展开；短按只回弹不展开', () => {
  const { Island, advance } = rig();
  Island.start({ id: 'a', label: 'A', compact: { trailing: { text: '1' } }, expanded: { center: { text: 'X' } } });
  Island.press('hold');
  advance(0.1);
  assert.equal(Island.presentation, 'compact', '还没到阈值');
  advance(0.15);
  assert.equal(Island.presentation, 'expanded', '越过 0.216s 阈值');
  Island.press('tap');
  Island.collapse();
  Island.press('tap');
  advance(0.5);
  assert.equal(Island.presentation, 'compact', '点按不展开');
});

check('减动效：时长固定 0.2s 且无过冲', () => {
  const { Island, advance } = rig();
  Island.internals.setReducedMotion(true);
  Island.start({ id: 'a', label: 'A', compact: { trailing: { text: '1' } } });
  advance(1);
  const geom = Island.internals.currentGeometry();
  assert.ok(geom.settled, '减动效下形状应已收敛');
  assert.ok(!geom.overshot, '不得过冲');
});

check('外部点击与 Escape 收合', () => {
  const { Island } = rig();
  Island.start({ id: 'a', label: 'A', expanded: { center: { text: 'X' } } });
  Island.expand('a');
  assert.equal(Island.presentation, 'expanded');
  Island.internals.outsidePress();
  assert.equal(Island.presentation, 'idle' === Island.presentation ? 'idle' : 'compact');
  Island.expand('a');
  Island.internals.keyEscape();
  assert.notEqual(Island.presentation, 'expanded');
});
```

```bash
node scripts/test-island.cjs
```

预期：FAIL —— `Island.internals.setClock is not a function`。

- [ ] **Step 2: 实现时序**

```js
  const timers = [];                              // {at, fn} 按时间排序
  const scheduleAlert = (id, at) => {
    const m = MOTION;
    push(at + m.alertContentDelay, () => { alerting.add(id); expand(id); });
    push(at + m.alertContentDelay + m.alertHold, () => {
      alerting.delete(id);
      if (state.expanded && alerting.size === 0) collapseWithAlert();
    });
  };
  let pressState = null;                          // {kind:'hold'|'tap', at}
  const pressStart = kind => {
    pressState = { kind, at: clock() };
    if (kind === 'hold') swell.setTarget(METRICS.press.swell);   // ×1.187 膨胀目标
  };
  const pressEnd = () => {
    if (!pressState) return;
    const held = clock() - pressState.at;
    if (pressState.kind === 'hold' && held >= MOTION.longPress) expand();
    else if (pressState.kind === 'tap') { const a = deriveScene(state).primary; if (a && a.onPress) a.onPress(); }
    swell.setTarget(1);                            // 回弹，squish 0.09 走 press.squish 弹簧
    pressState = null;
  };
```

`tick(now)` 每帧：跑到期 `timers`、`AnimatedValue.step(dt)` 推进所有形状弹簧、算出 `currentGeometry()`。
`collapseWithAlert()` 与 `collapse()` 的差别只在 transition 选择：`shapeTransition(from,'compact',{alert:true}) → 'alertCollapse'`。
`reducedMotion` 为真时：所有 `AnimatedValue` 的 config 换成 `{response: MOTION.reduced.duration / 2, dampingFraction: 1}`（无过冲、约 0.2s 收敛），内容 crossfade 去 blur。

- [ ] **Step 3: 挂接缝并运行**

```bash
node scripts/test-island.cjs
```

预期：`32 passed`。

- [ ] **Step 4: 提交**

```bash
git add assets/island.js scripts/test-island.cjs
git commit -m "feat(island): alert 与长按时序及减动效退化"
```

---

### Task 8: DOM 渲染与公共 API

**Files:**
- Modify: `assets/island.js`
- Test: `scripts/test-island.cjs`

**Interfaces:**
- Consumes: Task 2-7 全部
- Produces: 真实 `Island.mount(root, {backdrop, clock, reducedMotion})`，其中裸对象参数 = headless（只跑状态机，不建 DOM）；DOM 结构 `.island > svg.island-shape + .island-sensor + .island-pill + .island-bubble + .island-expanded + .island-live`；内容原子渲染器 `glyph|text|ring|bar|buttons|label|time`；`Island.internals.onFrame(fn)`；`Island.enabled`

- [ ] **Step 1: 写 DOM 桩与失败断言**

沿用 `test-exercise-ui-harness.cjs` 的思路（手写最小 DOM，不引 jsdom）。测试里需要：`createElement`/`append`/`setAttribute`/`classList`/`querySelectorAll`/`dataset`/`addEventListener` 与 `Element.children` 树；`requestAnimationFrame` 用假时钟驱动。

```js
function fakeDom() {
  const make = tag => {
    const el = { tag, children: [], attrs: {}, dataset: {}, style: {}, listeners: {}, textContent: '' };
    el.append = (...kids) => el.children.push(...kids);
    el.setAttribute = (k, v) => { el.attrs[k] = String(v); };
    el.getAttribute = k => (k in el.attrs ? el.attrs[k] : null);
    el.classList = { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false };
    el.addEventListener = (k, fn) => { (el.listeners[k] = el.listeners[k] || []).push(fn); };
    el.querySelector = () => null; el.querySelectorAll = () => [];
    el.remove = () => {}; el.focus = () => {};
    return el;
  };
  return { make, root: make('div') };
}

check('mount 出可聚焦胶囊 + SVG 形状 + 内容层', () => {
  const { make, root } = fakeDom();
  globalThis.document = { createElement: make, documentElement: make('html'), addEventListener() {}, body: make('body') };
  const Island = loadIsland();
  Island.mount(root, { backdrop: '#ffffff' });
  assert.equal(Island.enabled, true);
  const svg = root.children.find(c => c.tag === 'svg');
  assert.ok(svg, 'no svg');
  const pill = root.children.find(c => c.attrs.role === 'button' || c.tag === 'button');
  assert.ok(pill, 'the pill must be a focusable button');
  assert.equal(pill.attrs['aria-expanded'], 'false');
  assert.equal(keylineOf(root), null, '浅色页不画 keyline');
});

check('胶囊的读屏名来自活动 label，分裂时是并列串', () => {
  const { root } = fakeDom();
  globalThis.document = { createElement: fakeDom().make, documentElement: fakeDom().make('html'), addEventListener() {}, body: fakeDom().make('body') };
  const Island = loadIsland();
  Island.mount(root, {});
  Island.start({ id: 'p', label: '本章阅读进度 43%', compact: { trailing: { text: '43%' } } });
  assert.match(root.children.find(c => c.attrs.role === 'button').attrs['aria-label'], /43%/);
});

check('七个内容原子各自出 DOM', () => {
  const atoms = { glyph: { glyph: 'bookmark' }, text: { text: '43%' }, ring: { ring: 0.43 },
    bar: { bar: 0.43 }, label: { label: '专注' }, time: { time: 25_000, format: 'mm:ss' } };
  const { Island, rendered } = mountWithDom();
  Object.entries(atoms).forEach(([name, spec], i) => {
    Island.start({ id: 'a' + i, label: name, compact: { leading: spec } });
    assert.ok(count(rendered(), name) >= 1, `atom ${name} rendered nothing`);
    Island.end('a' + i);
  });
  Island.start({ id: 'b', label: 'btn', expanded: { bottom: { buttons: [{ key: 'pause', label: '暂停' }, { key: 'end', label: '结束' }] } } });
  Island.expand('b');
  assert.equal(count(rendered(), 'button'), 2);
});

check('按钮点击回调带 key，岛自身不猜语义', () => {
  const { Island, root, rendered } = mountWithDom();
  const seen = [];
  Island.start({ id: 'b', label: 'b', expanded: { bottom: { buttons: [{ key: 'pause', label: '暂停', onPress: k => seen.push(k) }] } } });
  Island.expand('b');
  fire(rendered('button')[0], 'click');
  assert.deepEqual(seen, ['pause']);
});

check('帧循环只写 transform/opacity 与 d 属性，不碰布局属性', () => {
  const { Island, root, advance } = mountWithDom();
  Island.start({ id: 'p', label: 'p', compact: { trailing: { text: '43%' } } });
  advance(0.5);
  const svg = root.children.find(c => c.tag === 'svg');
  const path = findDeep(svg, 'path');
  assert.ok(path.attrs.d.length > 50, 'path d must be animating');
  assert.equal(path.attrs.style, undefined);
  assert.ok(!('width' in path.attrs) && !('height' in path.attrs), 'geometry goes through the path, not width/height attrs');
});
```

- [ ] **Step 2: 实现渲染层**

DOM 结构与职责（`mount` 一次建好，之后只改属性）：

```
<div class="island" role="group" aria-label="实时状态" data-i18n-attr="aria-label:island.region">
  <svg class="island-shape" aria-hidden="true"><path class="island-fill"/><path class="island-keyline"/></svg>
  <div class="island-sensor" aria-hidden="true"></div>
  <button class="island-pill" type="button" aria-expanded="false" aria-label="…">   ← 胶囊本体，命中区
    <span class="island-slot leading"></span><span class="island-slot trailing"></span>
  </button>
  <div class="island-bubble" hidden>…</div>                                          ← 分裂副胶囊
  <div class="island-expanded" hidden>
    <div class="island-row"><span data-slot="leading"></span><span data-slot="center"></span><span data-slot="trailing"></span></div>
    <div data-slot="bottom"></div>
  </div>
  <p class="island-live" role="status" aria-live="polite"></p>
</div>
```

原子渲染（每个返回一个元素，`island-slot` 内绝对定位靠外缘）：

| 原子 | 元素 | 尺寸依据 |
|---|---|---|
| `{glyph:'bookmark'│'lotus'}` | `<svg class="island-glyph" viewBox="0 0 24 24" width=22 height=22>`，`compact` 用 22，`expanded` 标签行用 18 | `metrics.compact` 的 22pt 圆位 |
| `{text}` | `<span class="island-text">`，`font-variant-numeric: tabular-nums` | slot ≤72，超出裁切 |
| `{ring:value}` | `<svg class="island-ring">` + `<circle stroke-dasharray>` | 20pt（副胶囊唯一稳过的形） |
| `{bar:value}` | `<div class="island-bar"><i style="transform:scaleX(v)"></i></div>` | `BottomBar` 区域，用 transform 不用 width |
| `{buttons:[…]}` | `<button class="island-btn">` × n，按下调 `onPress(key)` | ≥44×44 命中区 |
| `{label}` | `<span class="island-label">` | 传感器旁 ≤9 字 |
| `{time:ms,format}` | `<span class="island-time">`，每帧由引擎时钟自算，不外调 `update` | `mm:ss` / `h:mm` |

每帧（`rAF`）：`tick(now)` → 读 `AnimatedValue` → `path.setAttribute('d', continuousRectPath(...))`（主胶囊与副胶囊各一条，`bubbleHeight===0` 时隐藏副 path）→ `transform: translate(xCenterOffset, 0) scale(...)` 定位内容槽 → `content.follow` 缩放。
形状只写 `d` 与 `transform`/`opacity`，绝不写 `width`/`height`（第 5 条断言守这条）。
`aria-expanded` 跟随 `presentation === 'expanded'`；alert 出现时把 `label` 写进 `.island-live` 一次。
键盘：胶囊 `Tab` 可达，`Enter`/`Space` 展开，`Escape` 收合；`pointerdown` 起长按计时器（Task 7 的 `pressStart/End`）。
`mount(root, {backdrop})`：`backdrop` 缺省读 `getComputedStyle(document.documentElement).getPropertyValue('--paper')`，据此算 `keylineAlpha`；为 0 时不给 `island-keyline` 任何描边。

- [ ] **Step 3: 保留 Task 6/7/10/11 的无 DOM 用法**

`mount(root, options)` 必须区分两种调用：Task 8 之前的任务（6、7）和 `FocusTimer` 的单测传的是**裸对象**（`Island.mount({})`），本任务起的浏览器路径传的是真元素。判据用能力而非 `typeof document`：

```js
  Island.mount = (root, options = {}) => {
    if (options.clock) clock = options.clock;
    const headless = !root || typeof root.appendChild !== 'function';
    Island.enabled = !headless;
    mounted = headless ? null : root;
    if (!headless) buildDom(root, options);      // Task 8 的 DOM 结构
    commit = headless ? () => {} : () => scheduleFrame();
  };
```

即：无 DOM 时**状态机照常运行**（`start/update/end/presentation/activities` 全部有效，Task 6/7/10/11 的断言依赖这一点），只是不建 DOM、不起帧循环；`enabled` 保持 `false` 让 `FocusTimer` 在真实浏览器里也能靠 `Island.internals.tick()` 单步驱动。Task 2 那条"无 DOM 加载即返回禁用态"的断言因此仍然成立。

同时在 `Island.internals` 里补上 `onFrame(fn)`（`FocusTimer` 用它把 `{time}` 与 `tick()` 挂进帧循环，无 DOM 时改为测试手动调用 `internals.tick`）。

- [ ] **Step 4: 让 `mount` 之前的旧签名不出意外**

`grep -n "Island.mount" scripts/test-island.cjs` 应只有裸对象用法；若某处传了 `document`，改成 `mount(root, {backdrop:'#ffffff'})` 并断言 `enabled === true`。

- [ ] **Step 5: 运行**

```bash
node scripts/test-island.cjs
```

预期：`37 passed`。

- [ ] **Step 6: 提交**

```bash
git add assets/island.js scripts/test-island.cjs
git commit -m "feat(island): SVG 形状渲染、内容原子与无障碍胶囊"
```

---

### Task 9: 样式与页面装配

**Files:**
- Create: `assets/island.css`
- Modify: `index.html:23`（stylesheet 列表尾）、`index.html:136`（defer 脚本列表）、`index.html:39`（`</header>` 之后挂载点）
- Test: `scripts/test-island.cjs`

**Interfaces:**
- Consumes: `assets/island.js`
- Produces: `#islandRoot`、`--island-z:60`、`--island-top:13.91px`、`.island*` 类名

- [ ] **Step 1: 写契约断言**

```js
check('index.html 装配岛且不破 eager 白名单', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="stylesheet" href="assets\/island\.css\?v=[0-9a-f]{12}">/);
  assert.match(html, /<script defer src="assets\/island\.js\?v=[0-9a-f]{12}"><\/script>/);
  assert.match(html, /<script defer src="assets\/focus\.js\?v=[0-9a-f]{12}"><\/script>/);
  assert.match(html, /<div id="islandRoot"><\/div>/);
  const eager = [...html.matchAll(/<script(?![^>]*\bdefer\b)[^>]*\ssrc="([^"]+)"/g)].map(m => m[1].split('?')[0]);
  assert.deepEqual(eager.sort(), ['assets/content.js', 'assets/i18n.js', 'assets/locale/zh.js']);
});

check('island.css 层级压住 header 且只在打印时消失', () => {
  const css = read('assets/island.css');
  assert.match(css, /--island-z:\s*60/);
  assert.match(css, /\.island\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css, /\.island-pill\s*\{[^}]*pointer-events:\s*auto/);
  assert.match(css, /@media print[^}]*#islandRoot\{display:none\}/s);
  assert.match(css, /--island-top:\s*13\.91px/);
});

check('岛内不引外部字体也不引动画库', () => {
  const css = read('assets/island.css'), js = read('assets/island.js');
  for (const bad of ['@import', '@font-face', 'url(http', 'https://']) {
    assert.ok(!css.includes(bad) && !js.includes(bad), `${bad} appears`);
  }
});
```

预期：FAIL（文件与标签还不存在）。

- [ ] **Step 2: 写 `assets/island.css`**

要点（完整文件，按此顺序）：

```css
/* 岛的内容排版。几何不在这里：形状由 assets/island.js 出 SVG path。
   本层刻意不用 motion.css 的三档时长——岛的时长是弹簧参数决定的连续量，
   见 docs/reference/islandcn/motion-subset.ts 的标定注释。只动 transform/opacity。 */
:root{--island-z:60;--island-top:13.91px;--island-ink:#fff;--island-ink-quiet:rgba(255,255,255,.62)}
#islandRoot{position:fixed;top:0;left:0;right:0;z-index:var(--island-z);display:none;pointer-events:none}
body[data-view="reader"] #islandRoot{display:block}
.island{position:absolute;top:var(--island-top);left:50%;transform:translateX(-50%);pointer-events:none}
.island-shape{position:absolute;overflow:visible}
.island-fill{fill:#000}
.island-keyline{fill:none;stroke:#fff}                 /* 强度由 JS 按页面亮度给 stroke-opacity */
.island-sensor{position:absolute;top:0;left:50%;transform:translateX(-50%);
  width:94.85px;height:36.84px;background:#000;border-radius:18.42px;pointer-events:none}
.island-pill,.island-bubble{position:absolute;top:0;left:0;pointer-events:auto;
  display:flex;align-items:center;color:var(--island-ink);font:15px/1.4 system-ui,sans-serif;
  background:none;border:0;padding:0}
.island-pill:focus-visible{outline:3px solid #fff;outline-offset:3px;border-radius:20px}
.island-slot{position:absolute;display:flex;align-items:center;gap:6px;overflow:hidden;
  max-width:72px;height:36.85px}
.island-slot.trailing{justify-content:flex-end}
.island-text{font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.island-label{font-size:15px;color:var(--island-ink-quiet);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.island-time,.island-value{font-variant-numeric:tabular-nums;color:var(--island-ink)}
.island-value{font-size:28px;font-weight:600;letter-spacing:-.02em}
.island-glyph{flex:none}
.island-ring circle{fill:none;stroke-linecap:round}
.island-bar{height:5px;border-radius:3px;background:hsla(0,0%,100%,.28);overflow:hidden}
.island-bar i{display:block;height:100%;background:var(--island-accent,#3f6cff);border-radius:3px;
  transform-origin:left center;transform:scaleX(0)}
.island-btn{min-width:44px;min-height:26px;padding:4px 12px;border:0;border-radius:13px;
  background:hsla(0,0%,100%,.18);color:var(--island-ink);font-size:13px;font-variant-numeric:tabular-nums}
.island-btn:hover{background:hsla(0,0%,100%,.28)}
.island-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}
.island-expanded{position:absolute;top:0;left:0;width:374.34px;display:flex;flex-direction:column;
  gap:8px;padding:18.18px 18.5px 18.35px;box-sizing:border-box;color:var(--island-ink);
  font-family:system-ui,sans-serif}
.island-row{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.island-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
@media (prefers-reduced-motion:reduce){.island *{transition:none!important}}
@media print{#islandRoot{display:none}}
```

- [ ] **Step 3: 改 `index.html`**

三处：`assets/i18n.css` 那行之后加 `<link rel="stylesheet" href="assets/island.css">`（哈希先留空，Task 12 统一盖章）；`</header>` 之后加 `<div id="islandRoot"></div>`；`assets/wishes.js` 那行之前加两个 `<script defer>`。

- [ ] **Step 4: 运行契约断言（版本化之前先跳过哈希断言）**

```bash
node scripts/version-assets.mjs && node scripts/test-island.cjs
```

预期：`3 passed`（本任务三条）+ 前面任务全绿。`version-assets.mjs` 给新 `<link>`/`<script>` 盖上 `?v=`。

- [ ] **Step 5: 提交**

```bash
git add assets/island.css index.html scripts/test-island.cjs
git commit -m "feat(island): 岛排版与首页装配"
```

---

### Task 10: 专注会话状态机与今日累计

**Files:**
- Create: `assets/focus.js`
- Test: `scripts/test-island.cjs`

**Interfaces:**
- Consumes: `Island.start/update/end`、`MSI18N.t/locale`、`purplebook:progress`（Task 11 提供事件源）
- Produces: `window.FocusTimer`（`init/start/pause/resume/extend/stop/snapshot/TODAY_KEY`）、`body.dataset.focusTimer = 'running'|'paused'`

- [ ] **Step 1: 写失败断言**

```js
function focusRig({ now0 = Date.parse('2026-11-16T09:00:00'), store = {} } = {}) {
  let now = now0;
  const memory = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } };
  const islandCalls = [];
  const fakeIsland = { start(o) { islandCalls.push(['start', o.id]); const h = { id: o.id, update: p => islandCalls.push(['update', o.id, JSON.stringify(p)]), end: () => islandCalls.push(['end', o.id]) }; return h; }, update: () => {}, end: () => {} };
  const sandbox = { window: {}, console, Date: { now: () => now, parse: s => Date.parse(s), UTC: Date.UTC }, localStorage: memory, performance: { now: () => now } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('assets/focus.js'), sandbox, { filename: 'assets/focus.js' });
  sandbox.window.FocusTimer.init({ now: () => now, storage: memory, island: fakeIsland, t: k => k, locale: () => 'zh-CN', dispatch: () => {} });
  return { F: sandbox.window.FocusTimer, now: () => now, set: v => { now = v; }, calls: islandCalls, store };
}

check('start 起 25:00 倒计时并注册活动', () => {
  const { F, calls } = focusRig();
  F.start(25 * 60_000);
  assert.equal(F.snapshot().phase, 'running');
  assert.equal(F.snapshot().remainingMs, 25 * 60_000);
  assert.ok(calls.some(([op, id]) => op === 'start' && id === 'focus-timer'));
});

check('墙钟推进：remaining 由 Date.now 决定，不靠 tick 累加', () => {
  const rig = focusRig();
  rig.F.start(25 * 60_000);
  rig.set(rig.now() + 61_000);                  // 跳 61 秒（后台标签页限流也准）
  assert.equal(rig.F.snapshot().remainingMs, 25 * 60_000 - 61_000);
});

check('暂停冻结、继续恢复、+5 延长', () => {
  const rig = focusRig();
  rig.F.start(25 * 60_000);
  rig.set(rig.now() + 10_000); rig.F.pause();
  assert.equal(rig.F.snapshot().phase, 'paused');
  rig.set(rig.now() + 5 * 60_000);              // 暂停期间走的墙钟不计
  assert.equal(rig.F.snapshot().remainingMs, 25 * 60_000 - 10_000);
  rig.F.resume();
  assert.equal(rig.F.snapshot().remainingMs, 25 * 60_000 - 10_000);
  rig.F.extend(5 * 60_000);
  assert.equal(rig.F.snapshot().remainingMs, 25 * 60_000 - 10_000 + 5 * 60_000);
});

check('到点完成：写一次会话、今日累计增加、alert 报时长', () => {
  const rig = focusRig();
  rig.F.start(25 * 60_000);
  rig.set(rig.now() + 25 * 60_000 + 1);
  rig.F.tick();                                 // 由时钟驱动，测试里手动跑一帧
  const snap = rig.F.snapshot();
  assert.equal(snap.phase, 'none');
  assert.equal(snap.todayMs, 25 * 60_000);
  const saved = JSON.parse(rig.store['ms-cookbook-focus']);
  assert.equal(saved.sessions.length, 1);
  assert.ok(rig.calls.some(([op, , payload]) => op === 'update' && /alert/.test(payload || '') || /true/.test(payload || '')));
});

check('提前结束：按实际时长记录', () => {
  const rig = focusRig();
  rig.F.start(25 * 60_000);
  rig.set(rig.now() + 4 * 60_000);
  rig.F.stop();
  assert.equal(rig.F.snapshot().todayMs, 4 * 60_000);
  assert.equal(rig.F.snapshot().phase, 'none');
});

check('时钟回拨不倒扣、不误记新会话', () => {
  const rig = focusRig();
  rig.F.start(25 * 60_000);
  rig.set(rig.now() - 10 * 60_000);             // 用户把系统时间往回调
  assert.equal(rig.F.snapshot().remainingMs, 25 * 60_000, 'clamped to target');
  rig.F.tick();
  assert.equal(rig.F.snapshot().phase, 'running', 'must not finish backwards');
});

check('跨日归零；明细封顶 30 条', () => {
  const rig = focusRig();
  rig.F.start(25 * 60_000); rig.set(rig.now() + 25 * 60_000); rig.F.tick();
  rig.set(Date.parse('2026-11-17T09:00:00'));
  assert.equal(rig.F.snapshot().todayMs, 0);
  for (let i = 0; i < 40; i += 1) { rig.F.start(25 * 60_000); rig.set(rig.now() + 25 * 60_000 + 1000); rig.F.tick(); }
  assert.ok(JSON.parse(rig.store['ms-cookbook-focus']).sessions.length <= 30);
});

check('存储损坏与不可写都不影响会话', () => {
  const broken = focusRig({ store: { 'ms-cookbook-focus': '{not json' } });
  assert.equal(broken.F.snapshot().todayMs, 0);
  broken.F.start(25 * 60_000);
  assert.equal(broken.F.snapshot().phase, 'running');
  const readonly = focusRig();
  readonly.store = new Proxy({}, { set: () => { throw new Error('quota'); }, get: (t, k) => k === 'getItem' ? () => null : () => { throw new Error('denied'); } });
  readonly.F.rebindStorage(readonly.store);
  readonly.F.start(25 * 60_000);
  assert.equal(readonly.F.snapshot().phase, 'running', 'a session still runs when storage is denied');
});

check('刷新后按墙钟恢复进行中的会话', () => {
  const rig = focusRig();
  rig.F.start(25 * 60_000);
  rig.set(rig.now() + 60_000);
  const snapshot = rig.store['ms-cookbook-focus'];
  const rig2 = focusRig({ now0: rig.now(), store: JSON.parse('{' + JSON.stringify('ms-cookbook-focus') + ':' + JSON.stringify(snapshot) + '}') });
  rig2.F.restore();
  assert.equal(rig2.F.snapshot().phase, 'running');
  assert.equal(rig2.F.snapshot().remainingMs, 24 * 60_000);
});
```

```bash
node scripts/test-island.cjs
```

预期：FAIL —— `read('assets/focus.js')` ENOENT。

- [ ] **Step 2: 实现 `assets/focus.js`**

IIFE + `window.FocusTimer`，内部只用注入的 `now/storage/island/t/locale`，缺省回落到真实全局（浏览器路径）。核心常量与状态：

```js
  const TODAY_KEY = 'ms-cookbook-focus';
  const DEFAULT_TARGET_MS = 25 * 60_000;
  const MAX_SESSIONS = 30;
  const STALE_MS = 24 * 3600_000;               // active 超过一天不再恢复
  let phase = 'none', targetMs = 0, startedAt = 0, accumulatedMs = 0, todayMs = 0, sessions = [], date = '';

  const remaining = () => {
    if (phase !== 'running') return pendingRemaining;
    const used = accumulatedMs + (now() - startedAt);
    return Math.min(targetMs, Math.max(0, targetMs - used));   // 回拨时 now-startedAt 为负 -> 夹回 target
  };
```

活动映射（`ID = 'focus-timer'`，`group: 'focus'`，`priority: 1`）：`running` 显示 `{glyph:'lotus', time:{until: startedAt + (targetMs - accumulatedMs), format:'mm:ss'}}`；`paused` 显示 `{text:'已暂停'}` 并 `update`；完成时 `update({alert:true, expanded:{center:{value:…}, bottom:{…}}})`，7s 后 `end`（对齐上游 upload 预设的 `DONE_MS = 7000`）。

对外方法：`start/pause/resume/extend/stop/snapshot/restore/tick/rebindStorage/init`。`tick()` 由岛的帧循环调用（`Island` 在每帧回调订阅者；Task 8 已建 `Island.internals.onFrame`），也可被测试手动调用。

存储读写：

```js
  function load() {
    let raw = null;
    try { raw = storage.getItem(TODAY_KEY); } catch { return fresh(); }
    let parsed; try { parsed = JSON.parse(raw); } catch { return fresh(); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fresh();
    const today = localDate(now());
    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions.filter(s => s && Number.isFinite(s.ms) && Number.isFinite(s.endedAt)).slice(-MAX_SESSIONS) : [];
    return parsed.date === today
      ? { date: today, totalMs: Number.isFinite(parsed.totalMs) ? parsed.totalMs : sum(sessions), sessions, active: parsed.active || null }
      : { date: today, totalMs: 0, sessions: [], active: null };       // 跨日归零
  }
  function persist() { try { storage.setItem(TODAY_KEY, JSON.stringify({ date, totalMs: todayMs, sessions, active: activeRecord() })); } catch { /* 隐私模式：会话照跑 */ } }
```

`storage` 事件 → `load()` 重读累计（不改本机进行中的会话）。

- [ ] **Step 3: 运行**

```bash
node scripts/test-island.cjs
```

预期：`46 passed`。若"到点完成"那条失败：`tick()` 必须在 `remaining <= 0` 时先落账再走 alert，顺序错了 `todayMs` 会晚一步。

- [ ] **Step 4: 提交**

```bash
git add assets/focus.js scripts/test-island.cjs
git commit -m "feat(island): 专注会话状态机与今日累计"
```

---

### Task 11: 进度活动、按钮与三语文案

**Files:**
- Modify: `assets/reading.js:44`（广播一行）
- Modify: `assets/focus.js`（监听事件、维护 `reading-progress` 活动）
- Modify: `index.html:121`（`.reading-tools` 内加按钮）
- Modify: `assets/locale/zh.js`、`en.js`、`es.js`
- Test: `scripts/test-island.cjs`

**Interfaces:**
- Consumes: `FocusTimer`、`Island`
- Produces: `document` 上的 `purplebook:progress` 事件（`detail:{chapter, percent}`）、`#focusTimerButton`、`island.*` 三语键

- [ ] **Step 1: 写失败断言**

```js
check('reading.js 在算好 percent 处广播进度事件', () => {
  const js = read('assets/reading.js');
  assert.match(js, /purplebook:progress/);
  assert.ok(js.indexOf("$('#readingPercent').textContent") < js.indexOf('purplebook:progress'), '广播要在 percent 算出之后');
});

check('.reading-tools 里有「专注计时」按钮且已本地化', () => {
  const html = read('index.html');
  const tools = html.match(/<div class="reading-tools"[\s\S]*?<\/div>/)[0];
  assert.match(tools, /id="focusTimerButton"/);
  assert.match(tools, /data-i18n="reader\.focusTimer"/);
  assert.match(tools, /aria-pressed="false"/);
});

check('三语 island.* 键集合完全一致', () => {
  const keysOf = file => [...read(file).matchAll(/['"]?(island\.[A-Za-z0-9_]+)['"]?\s*:/g)].map(m => m[1]);
  const zh = new Set(keysOf('assets/locale/zh.js'));
  assert.ok(zh.size >= 12, `only ${zh.size} island keys in zh`);
  for (const f of ['assets/locale/en.js', 'assets/locale/es.js']) {
    const other = new Set(keysOf(f));
    for (const k of zh) assert.ok(other.has(k), `${k} missing in ${f}`);
    for (const k of other) assert.ok(zh.has(k), `${k} only in ${f}`);
  }
});

check('专注按钮不绑定视觉专注模式', () => {
  const js = read('assets/focus.js');
  assert.ok(!/body\.dataset\.focus\s*=/.test(js), 'focus.js must not touch the visual focus mode');
  assert.match(js, /body\.dataset\.focusTimer\s*=/);
});

check('进度活动进岛：group reading、priority 0、43% 上屏', () => {
  const rig = focusRig();
  rig.F.progressFrom({ percent: 43, chapter: 'ch7' });
  const start = rig.calls.find(([op, id]) => op === 'start' && id === 'reading-progress');
  assert.ok(start, 'no reading-progress activity started');
  assert.match(JSON.stringify(start[1]), /"priority":0/);
  assert.match(JSON.stringify(start[1]), /43%/);
});
```

- [ ] **Step 2: 实现广播**

`assets/reading.js` 第 44 行之后：

```js
    document.dispatchEvent(new CustomEvent('purplebook:progress', { detail: { chapter: chapter.id, percent } }));
```

- [ ] **Step 3: 实现进度活动与按钮接线（`assets/focus.js`）**

```js
  const PROGRESS_ID = 'reading-progress';
  function progressFrom({ percent, chapter }) {
    if (document.body.dataset.view !== 'reader') return;
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    const spec = {
      id: PROGRESS_ID, group: 'reading', priority: 0,
      label: t('island.readingLabel', { percent: value }),
      compact: { leading: { glyph: 'bookmark' }, trailing: { text: value + '%' } },
      minimal: { leading: { glyph: 'bookmark' }, bubble: { ring: value / 100 } },
      expanded: { leading: { label: t('island.reading') }, center: { title: chapterTitle(chapter) },
        bottom: { bar: value / 100 } }
    };
    if (!seen.has(PROGRESS_ID)) island.start(spec);
    else island.update(PROGRESS_ID, { label: spec.label, compact: spec.compact, minimal: spec.minimal, expanded: spec.expanded });
    seen.add(PROGRESS_ID);
  }
  document.addEventListener('purplebook:progress', e => progressFrom(e.detail));
```

按钮：`#focusTimerButton` 点击时 `phase==='none' ? FocusTimer.start(DEFAULT) : (phase==='paused' ? resume() : pause())`，`aria-pressed` 与 `body.dataset.focusTimer` 同步；岛内按钮的 `onPress(key)` 处理 `pause`/`resume`/`extend`/`end`。语言切换时重跑 `progressFrom` 与计时活动的 `update`（走 `MSI18N.on`）。

- [ ] **Step 4: 三语 `island.*` 键（zh 为基准，en/es 同步）**

```js
  'island.region': '实时状态',
  'island.reading': '本章阅读',
  'island.readingLabel': '本章阅读进度 {percent}%',
  'island.focus': '专注计时',
  'island.focusLabel': '专注剩余 {time}',
  'island.paused': '已暂停',
  'island.pause': '暂停',
  'island.resume': '继续',
  'island.extend': '加 5 分钟',
  'island.end': '结束',
  'island.today': '今日专注 {time}',
  'island.doneTitle': '专注完成',
  'island.doneBody': '本次 {time} · 今日累计 {today}',
  'island.stoppedBody': '本次 {time} 已记入今日累计',
  'island.chapterProgress': '本章进度'
```

`en`：`Live status / This chapter / Reading progress {percent}% / Focus timer / {time} left / Paused / Pause / Resume / +5 minutes / End / {time} today / Focus complete / {time} this session, {today} today / {time} added to today's total / Chapter progress`
`es`：`Estado en vivo / Este capítulo / Progreso de lectura: {percent} % / Temporizador de concentración / Quedan {time} / Pausado / Pausar / Continuar / +5 minutos / Fin / {time} hoy / Concentración completada / {time} en esta sesión, {today} hoy / {time} sumado al total de hoy / Progreso del capítulo`

`reader.focusTimer`（按钮文案，加在现有 `reader.*` 段）：zh `专注计时`、en `Focus timer`、es `Temporizador`。

- [ ] **Step 5: 运行 + 版本化**

```bash
node scripts/version-assets.mjs
node scripts/test-island.cjs
node scripts/test-i18n.cjs
node scripts/check-site.mjs
```

预期：island 测试 `51 passed`；i18n 与站点检查仍绿。

- [ ] **Step 6: 提交**

```bash
git add assets/reading.js assets/focus.js index.html assets/locale/zh.js assets/locale/en.js assets/locale/es.js
git commit -m "feat(island): 本章进度活动、专注计时按钮与三语文案"
```

---

### Task 12: 本地全量回归与浏览器实测

**Files:**
- Modify: 无（只修问题）
- Test: 全部既有套件 + Task 1-11 新增

- [ ] **Step 1: 全量跑**

```bash
node scripts/version-assets.mjs
PYTHONUTF8=1 .venv/Scripts/python.exe -m pytest tests -q
for f in scripts/test-*.cjs; do echo "--- $f"; node "$f" || break; done
node scripts/check-site.mjs
```

预期：pytest 全过、每个 cjs 脚本 `N passed` 退出码 0。任一失败先修再继续，不得跳过。

- [ ] **Step 2: 起本地静态站并实测**

```bash
python3 -m http.server 4173 --bind 127.0.0.1 &
```

浏览器打开 `http://127.0.0.1:4173/?fresh=1#chapter-1`（`?` 参数强制整页重载，同 URL 的哈希导航不会重载文档）。逐条验，每条要截图或 trace：

1. 进章节：胶囊出现在视口顶中央，显示书签 + `0%`；首页/目录/练习视图里岛完全消失
2. 滚动到章节中部：`43%` 之类数字翻动，胶囊宽度按 balance 规则变化，页面无布局抖动
3. 点「专注计时」：分裂成主胶囊（倒计时）+ 副胶囊（ring）；`span ≈ 245.77px`，副胶囊宽恒 62.18px
4. 长按主胶囊 0.3s：展开，里面章节名、进度条、今日累计、三个按钮；点岛外与 `Escape` 都收合
5. 岛上「加 5 分钟」「暂停」「继续」「结束」逐个点
6. 把系统时间或 `target` 调小让倒计时到 0（DevTools 里改 `localStorage` 后刷新更快）：alert 展开、约 6s 后回落、7s 后消失，`localStorage` 里 `sessions` 增一条
7. 刷新页面：进行中的会话按墙钟恢复
8. 切 English / Español：岛内所有文案与数字格式跟着变
9. DevTools → Rendering → `prefers-reduced-motion: reduce`：形状无过冲、无 blur，功能仍可用
10. 键盘：`Tab` 聚焦胶囊、`Enter` 展开、`Escape` 收合；读屏名正确
11. Chrome performance trace：确认无新增 ForcedReflow；`Layout` 次数在滚动中与改动前持平（基线见 spec §2.1：强制重排总计 70ms、`renderChapter` 占 65ms）
12. Ctrl+P 预览：岛不出现在打印预览里

- [ ] **Step 3: 记录实测数据到 spec 的验收位置**

在 `docs/superpowers/specs/2026-11-16-islandcn-dynamic-island-design.md` 末尾追加"## 11. 实测记录"：写 trace 的 ForcedReflow 数字、分裂跨度实测、alert 回落实测秒数。**不写结论前先贴数据。**

- [ ] **Step 4: 提交**

```bash
git add -A docs/superpowers/specs index.html assets
git commit -m "test(island): 本地浏览器实测与动效性能记录"
```

---

### Task 13: 部署到生产并线上验证

**Files:** 服务器 `/data/ms-cookbook`

- [ ] **Step 1: 复核线上现状（记忆可能过期）**

```bash
ssh shenmian 'cd /data/ms-cookbook && git log --oneline -3 2>/dev/null; pm2 ls; ls -1 ecosystem.config.js run.sh 2>/dev/null; grep -c . .data/account-db.env'
curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' http://120.53.222.178:8899/
```

预期：`pm2` 里 `ms-cookbook` online；首页 200。若 `git log` 有输出说明服务器是 git 仓库，用 `git fetch && git diff` 决定同步方式；否则按 tar 同步。

- [ ] **Step 2: 备份源码**

```bash
ssh shenmian 'cd /data/ms-cookbook && mkdir -p backups && tar --exclude=backups --exclude=.data --exclude=node_modules -czf backups/source-before-island-$(date +%Y%m%dT%H%M%S).tar.gz .'
```

- [ ] **Step 3: 只同步本次差异文件**

```bash
git diff --name-only HEAD~6..HEAD      # 本计划提交涉及的清单
```

按该清单 tar 传输并解到 `/data/ms-cookbook`，**必须排除** `ecosystem.config.js`、`run.sh`、`index.html.bak.*`、`.data/`：

```bash
git diff --name-only HEAD~6..HEAD | tr '\n' '\0' | tar --null -czf /tmp/island-sync.tgz -T - --exclude='ecosystem.config.js' --exclude='run.sh'
scp /tmp/island-sync.tgz shenmian:/tmp/
ssh shenmian 'cd /data/ms-cookbook && tar -xzf /tmp/island-sync.tgz && rm /tmp/island-sync.tgz'
```

- [ ] **Step 4: 服务器上跑两套测试后再重启**

```bash
ssh shenmian 'cd /data/ms-cookbook && PYTHONUTF8=1 .venv/bin/python -m pytest tests -q && for f in scripts/test-island.cjs scripts/test-motion.cjs scripts/test-i18n.cjs scripts/test-ci-coverage.cjs; do node $f || exit 1; done'
ssh shenmian 'pm2 restart ms-cookbook --update-env && sleep 2 && pm2 ls'
```

预期：全绿后才 restart。

- [ ] **Step 5: 线上验证（GET，不用 HEAD）**

```bash
curl -s -H 'Accept-Encoding: gzip' -D- -o /dev/null http://120.53.222.178:8899/assets/island.js | grep -Ei 'HTTP/|content-encoding|cache-control|content-length'
curl -s http://120.53.222.178:8899/ | grep -o 'assets/island[^"]*'
curl -s http://120.53.222.178:8899/assets/locale/en.js | grep -c 'island\.'
```

预期：`200`、`content-encoding: gzip`、版本化资源 `Cache-Control` 带 `immutable`、首页引用两个岛资源且 `?v=` 齐、en 语言包含 `island.` 键。
浏览器打开 `http://120.53.222.178:8899/?fresh=1#chapter-1` 复跑 Task 12 的第 1、3、4、6、8 步。

- [ ] **Step 6: 记录与提交**

在 spec 的"实测记录"里补线上数据（响应头、复跑结果）。

```bash
git add docs/superpowers/specs
git commit -m "docs(island): 生产部署与线上验证记录"
```

- [ ] **Step 7: 回滚预案（只在需要时用）**

```bash
ssh shenmian 'cd /data/ms-cookbook && tar -xzf backups/source-before-island-<时间戳>.tar.gz && pm2 restart ms-cookbook --update-env'
```

---

### Task 14: 推送 GitHub

**Files:** 无新增

- [ ] **Step 1: 提交前检查**

```bash
git status --short
git log --oneline -8
```

预期：无未跟踪改动遗漏；`docs/monetization/` 与 `.workbuddy/` 保持未跟踪（用户自己的文件，不提交）。

- [ ] **Step 2: 用 gh 凭据的一次性 HTTPS URL 推送（不改 remote）**

```bash
gh auth status
git ls-remote https://github.com/sapsapshen/ms-cookbook-3langs.git refs/heads/main
git push https://github.com/sapsapshen/ms-cookbook-3langs.git main
git ls-remote https://github.com/sapsapshen/ms-cookbook-3langs.git refs/heads/main
```

预期：推送前远端 tip 是本地 `main` 的祖先（快进）；推送后远端 tip 等于 `git rev-parse main`。输出里不得出现 token。

- [ ] **Step 3: 确认 CI**

```bash
gh run list --repo sapsapshen/ms-cookbook-3langs --limit 3
gh run watch --repo sapsapshen/ms-cookbook-3langs <run-id> --exit-status
```

预期：新增的 "Test island" 步骤出现在作业里且通过；`test-ci-coverage` 仍绿。

---

## 自查（写完计划后）

**1. Spec 覆盖**：spec §1-§10 全部映射到任务——§2 基线→Task 2-5 的断言数值；§3.1 引擎→Task 2-8；§3.2 保真度预算→Task 2（数值）、4（路径/黏颈）、7（时序/减动效）、8（keyline/follow/shadow 渲染）；§3.5 装配→Task 1（NOTICE/参考源/CI）、9、11；§4 数据流→Task 10-11；§5 视觉与无障碍→Task 8-9；§6 错误处理→Task 10（存储、回拨、只读）与 Task 2（无 DOM）；§7 测试→各任务步骤 + Task 12；§8 部署与推送→Task 13-14；§9 署名→Task 1；§10 偏差→Task 4 保留 `bridgePath` 但不接进分裂渲染。
**已知缺口**：spec §3.2 的 `content.follow` 缩放与两层 shadow 只在 Task 8 的帧循环里以文字要求出现，没给逐行代码——执行时按 `docs/reference/islandcn/metrics.ts` 的 `content.follow` 公式 `(wRatio×hRatio)^(follow/2)` 与 `expanded.shadow` 的两条 `blur` 值实现，并在 Task 12 第 11 步用截图确认；黏颈 `bridgePath` 的单测在 Task 4 已建，但接入渲染留给独立里程碑。

**2. 占位符扫描**：Task 8 Step 2 的 CSS 与 DOM 结构给的是完整内容；Task 2 Step 2 里 `MOTION.corner` 是显式"下一步填充"而非含糊 TODO，并由 Step 3 的断言封口；Task 12 Step 3、Task 13 Step 6 要求先贴数据再写结论，无 "TBD"。

**3. 类型一致性**：`Island.internals` 的符号名在 Task 2-8 内自洽（`solveSpring(config,target,x0,v0,t)`、`continuousRectPath(x,y,w,h,r,smoothing,leading)`、`shapeTarget(kind,measure,screenWidth)`、`splitLayout(measure)`、`bubbleTrailing(detached,bubbleWidth)`）；`FocusTimer` 方法名在 Task 10-11 与接口声明一致（`progressFrom` 为内部函数，测试通过 `F.progressFrom` 调用——需在 `window.FocusTimer` 上显式导出该测试入口，Task 10 Step 2 的导出列表里加 `progressFrom`）。`purplebook:progress` 的 `detail` 形状在 Task 11 Step 2 与断言里一致（`{chapter, percent}`）。

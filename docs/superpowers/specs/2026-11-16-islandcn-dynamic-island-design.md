# 灵动岛（移植 islandcn 引擎）与专注计时 设计文档

日期：2026-11-16
状态：已批准，待实施计划
作者：沈愐 / 阿步

---

## 1. 目标与范围

把 [islandcn](https://github.com/opencoredev/islandcn) 的灵动岛**引擎数学**移植进 SILS，做成阅读视图里常驻的一条活动胶囊，并让它承载一个真正的新功能：**25 分钟专注计时 + 今日累计**。落地后部署到 `http://120.53.222.178:8899/`，代码推 GitHub。

### 1.1 明确纳入

- `assets/island.js`：零依赖 IIFE 引擎（活动栈 + 四态 + 闭式弹簧 + 连续圆角形变），暴露 `window.Island`
- `assets/island.css`：岛内内容排版与 keyline 变量（几何不在 CSS）
- `assets/focus.js`：专注会话状态机 + 今日累计存储 + 把两条活动喂给引擎
- `assets/reading.js` 一行：在已算好的 percent 处广播 `purplebook:progress`
- `index.html`：1 个 stylesheet、2 个 `defer` script、1 个挂载点
- 三语 `island.*` 文案、MIT 署名、`scripts/test-island.cjs` 与其 CI 注册
- 分裂"黏颈"（metaball bridge）作为最后一个独立里程碑

### 1.2 明确排除（YAGNI）

- 不引入 `package.json`、npm 依赖、React、Tailwind 或任何 JS 构建步骤
- 不移植 islandcn 的 React 协调层（`surface.tsx` 2,297 行、`motion.ts` 2,302 行里的编排部分）、`devtools`、`/lab`、`/compare`、录制保真度脚本
- 不做 showcase 页、不做练习运行/语言包加载/发表评论这三类额外活动（首版只有阅读相关两条）
- 不动后端：`app.py`、CSP、缓存策略、账号与评论逻辑零改动
- 不改正文、不改版块结构、不做视觉重设计

### 1.3 关键取舍（已与用户确认）

| 决策 | 结论 | 依据 |
|---|---|---|
| 岛承载什么 | 阅读专注岛：本章进度 + 专注倒计时 | 用户选择 |
| 静止形态 | 阅读视图常驻本章进度；会话存在时自动分裂 | 用户选择 |
| 计时语义 | 倒计时 + 今日累计记录 | 用户选择 |
| 实现方式 | A：移植引擎数学为 vanilla，零依赖 | 用户选择；仓库无 JS 工具链，CSP `script-src 'self' 'wasm-unsafe-eval'` |
| 启动入口 | `.reading-tools` 新增「专注计时」按钮，与现有「专注阅读」纯视觉开关互不绑定 | 现有 `reading.js:21-30` 只管 `body[data-focus]` |
| 胶囊分配 | 倒计时占主胶囊，进度以 20pt ring 进副胶囊 | 与用户初稿相反，理由见 §4.3 |

---

## 2. 现状基线（实测，非估计）

### 2.1 ms-cookbook 侧

| 项目 | 实测值 | 取证 |
|---|---|---|
| JS 工具链 | 根目录无 `package.json`、无 `node_modules`；`scripts/*.mjs` 全部免依赖 | `ls`、`cat package.json` 失败 |
| 前端形态 | 单 HTML + hash 路由；`assets/*.js` 是 IIFE 全局（`window.Motion` / `MSI18N` / `AssetLoader`） | `motion.js:96`、`i18n.js:139`、`asset-loader.js:34` |
| CSP | `script-src 'self' 'wasm-unsafe-eval'`、`style-src 'self' 'unsafe-inline'` | `app.py:67-68` |
| eager 脚本白名单 | `index.html` 只允许 3 个非 defer 脚本，其余必须 `defer` | `test-motion.cjs:202-204` |
| 资源版本化 | `?v=<sha256 前 12 位>`，页面上的 `href/src` 与 JS 字符串数组里的路径两处盖章；先盖 scripts 再盖 pages | `scripts/version-assets.mjs` |
| CI 注册强制 | 每个校验脚本必须同时出现在 workflow 的 `paths:` 与步骤里，否则判红 | `test-ci-coverage.cjs:173` |
| 阅读进度源 | `measureArticle()` 缓存盒子，`updateProgress()` 纯算 `scrollY`（不读布局）；`reading.js:43-44` 在 180ms 去抖后取整并写 `#readingPercent` | `paper.js:479-492`、`reading.js:47-48` |
| header | 高 86px、`position:relative`、`z-index:10`、**非 sticky**；阅读视图 `justify-content:space-between`，中央搜索框 `width:min(100%,440px); margin:0 auto` | `styles.css` `.app-header`、`reader-tools.css:12-15` |
| 页面底色 | `--paper: #ffffff`、`--surface: #f5f1e6` | `styles.css:26-27` |
| 事件总线惯例 | `purplebook:route`、`purplebook:session` | `paper.js:543`、`discussion.js:84` |
| 本地化存储惯例 | `JSON.parse(localStorage.getItem(k))` + try/catch + `persist()`；隐私模式需探测 | `reading.js:6-10`、`exercise-store.js:53` |
| 语言包 | `assets/locale/{zh,en,es}.js` 为手写维护，不由 `build-i18n.py` 生成 | `grep locale scripts/build-i18n.py` 无命中 |

### 2.2 islandcn 侧（`opencoredev/islandcn` @ `0011a41`，MIT，© 2026 Leo）

| 项目 | 实测值 | 取证 |
|---|---|---|
| 安装方式 | `npx shadcn@latest add https://islandcn.dev/r/island-core.json` | README |
| 引擎规模 | 25 文件 9,613 行 TS/TSX（`motion.ts` 2,302、`surface.tsx` 2,297、`config.ts` 452、`store.ts` 436） | 解包 `r/island-core.json` |
| 依赖 | 引擎需 React 19，不加 npm 包；内容套件 `island-content` 带 `@hugeicons/core-free-icons`、`@hugeicons/react` | registry JSON `dependencies` |
| 关键几何 | idle 94.85×36.84 @top 13.91；compact 高 36.85、sensor 留空 94.85、slot 上限 72、maxWidth 260、balance 0.7475；split 副胶囊 62.18、gap 7.82、maxSpan 290；expanded 374.34 宽 / 84–180 高 / radius 47.9 / padding 18.18·18.5·17.81·18.35 / contentClip 34.4 | `lib/island/metrics.ts` |
| 关键动效 | 弹簧为闭式解：`stiffness=(2π/response)²`、`damping=4π·dampingFraction/response`；`shape`/`body`/`corner` 各自一条弹簧，按 transition 取值；`alertHold 5.975`、`alertContentDelay 0.12`、`longPress 0.216`、`swell ×1.187`（response 0.803 / df 0.641）、`press.squish 0.09`、`reduced.duration 0.2` | `lib/island/spring.ts`、`motion.ts:14-52,66-98,1402-1482,1498-1547,1577` |
| keyline | 宽 1.5、α 0.16、luma ≤0.04 满值、≥0.17 不画，中间按两点 (0.0706→0.328)、(0.1104→0.109) 对数插值 | `metrics.ts:250-285` |
| 黏颈 | `bridge.handleSize 2.4`、`spread 0.3`、`maxGap 5`（模拟器在 4.6–4.9 断开） | `metrics.ts:204-219` |
| API | `IslandApi{start,update,end,expand,collapse,activities,presentation}`；`ActivityOptions{id,label,priority,group,alert,onPress,compact,minimal,expanded}`；update 为深合并 | `lib/island/README.md`、SKILL.md §4 |

---

## 3. 架构

四个单元，接口窄、可独立测试。核心边界一句话：**引擎不认识"专注"，专注模块不碰几何。**

```
assets/focus.js  ──(活动 + 内容规格)──▶  assets/island.js  ──▶  SVG path + DOM
      ▲                                        │
      │ purplebook:progress / MSI18N.on        │ 只读一份 metrics 表
      │                                        ▼
assets/reading.js ──1 行广播             assets/island.css（内容排版）
```

### 3.1 A 单元：引擎 `assets/island.js`

四块内部分层，对外只有一个全局：

| 层 | 移植来源 | 职责 |
|---|---|---|
| `spring` | `spring.ts` | `solveSpring(config,x0,v0,t)` 闭式解 + `AnimatedValue`（飞行中 retarget 保留速度，不打断成跳变） |
| `outline` | `metrics.ts` + `path.ts` | 连续圆角（`corner.smoothing 0.72`）出 SVG `d`；四态尺寸与 compact `balance 0.7475` 两侧增长规则 |
| `stack` | `store.ts` | 活动栈：同 id 再 `start` 即更新；`priority` 定主活动；`group` 内一次一条；alert 展开 5.975s 后回落；长按 0.216s 展开 |
| `paint` | 替代 `surface.tsx` | 按固定内容词汇渲染 DOM；几何走 transform/opacity，内容 crossfade |

对外契约（沿用上游签名，`ReactNode` 换成内容规格）：

```js
const h = Island.start({
  id, label,                       // label 读屏念，也是胶囊的按钮名
  priority = 0, group, alert = false, onPress,
  compact:  { leading: spec, trailing: spec },
  minimal:  { leading: spec, bubble: spec },
  expanded: { leading: spec, center: spec, trailing: spec, bottom: spec }
});
h.update(partial);        // 深合并：{compact:{trailing}} 保留 leading
h.end();
Island.expand(id?); Island.collapse();
Island.presentation;      // 'idle' | 'compact' | 'minimal' | 'expanded'
Island.activities;        // 主活动在前
Island.mount(rootEl, { backdrop: '#ffffff' });
Island.enabled;           // 挂载点缺失时为 false，全站静默降级
```

内容词汇只有 7 个原子，这是"不做通用组件库"的边界，也是 1,100 行与 9,613 行的差别所在：

| 原子 | 形如 | 用在 |
|---|---|---|
| `{glyph}` | 内联 SVG，22pt（compact）/18pt（expanded 标签行） | 进度书签、专注莲座 |
| `{text}` | tabular-nums，slot ≤72 | `43%`、`24:58` |
| `{ring}` | 20pt 圆环 | 副胶囊里的进度 |
| `{bar}` | 底部线性条 | expanded 的本章进度 |
| `{buttons}` | 2–3 个圆角按钮 | 暂停/继续、+5分、结束 |
| `{label}` | 传感器旁的上下文标签，≤9 字 | 「专注计时」 |
| `{time}` | 自走时钟，读引擎的同一个 clock | 倒计时（不每帧 `update`） |

`glyph` 用本站已有的图标语言自绘（不装 `@hugeicons`），形似即可，尺寸按上游的 22/18pt 规则。

### 3.2 保真度预算（逐档写明）

**移植（常驻可见项）**

- 全部 `islandMetrics` 数值
- 10 条 transition 的 `shape`/`body`/`corner` 弹簧：appear `.483/.62`、expand `.517/.824`、pressExpand `.387/.792`、swap `.498/.829`、collapse `.479/.894`、alertCollapse `.535/.84`、split `.505/.815`、unsplit `.487/.794`、dismiss `.432/1.019`、resize `.5/.82`
- alert（先用**旧内容立即展开**，`alertContentDelay .12` 后把新内容就地换上，`alertHold 5.975` 后回落；在 idle 岛上出场的 alert 用 `alertHoldIdle 5.969`）
- 长按（`swellTime .22` / `longPress .216`、swell `×1.187`、点按 `squish .09`）
- keyline 全式（本站 `--paper:#fff` luma≈1 ≥ `noneFrom .17`，实测算出 α=0，即浅色页不画带——保留代码路径以备深色与截图）
- `content.follow`：槽位中心保持形状宽高的比例分数，缩放 `(wRatio×hRatio)^(follow/2)`，clamp `0.2–2.5`
- expanded 两层 shadow（blur 30.76 主 + 81.03 尾、opacity 0.3533、offsetY 10.7/23.43）
- reduced-motion：形状用 `reduced.duration 0.2` 无过冲，内容 crossfade 去 blur
- 传感器遮罩（内容从镜头区下穿过时被遮住）

**延后一个里程碑（只在 split↔unsplit 那 0.4–0.5s 出现）**

- `skirt.ts` 的 metaball 黏颈（`handleSize 2.4` / `spread 0.3` / `maxGap 5`）。超预算则退化为副胶囊弹簧入场，并把偏差写进 §10；主活动与副胶囊的位置、尺寸、时序仍按实测值。

**不移植**

- shadow 的 alpha 抖动颗粒（`grain.levels .6`，需要逐像素噪声，收益只在截图对比里可见）
- `devtools`、`/lab` 序列、`group.handoff 1.445 / window 6.014`（我们两条活动属于不同 group，恒并列，用不到交接）

### 3.3 B 单元：`assets/island.css`

只写内容排版（字号、ink 色阶、按钮、ring/bar 的描边）与两个变量 `--island-backdrop`、`--island-z`。几何量不进 CSS：形状由 JS 出 `path`。

`motion.css` 的三档时长不适用岛——岛的时长是弹簧参数决定的连续量。本文件在头部注释里自证这一豁免（`motion.css:1-4` 要求"其他都得在这里自证"），并**只动 transform/opacity**，与动效层的硬约束一致。

### 3.4 C 单元：`assets/focus.js`

见 §4。

### 3.5 D 单元：装配

| 文件 | 改动 |
|---|---|
| `index.html` | `<link rel="stylesheet" href="assets/island.css?v=…">`；`<script defer src="assets/island.js?v=…">` 与 `<script defer src="assets/focus.js?v=…">`；`<div id="islandRoot"></div>` 紧随 `</header>`。脚本顺序：`island.js` 紧接现有 `reading.js` 之后、`focus.js` 再其后（两者都 `defer`，`focus.js` 初始化时 `window.Island` 必已就绪） |
| `assets/locale/{zh,en,es}.js` | 新增 `island.*` 键：主副文案、四个按钮、alert 两句、今日累计、读屏 label |
| `NOTICE` | 增一行 islandcn MIT 署名 + 上游 commit |
| `docs/reference/islandcn/` | 移植所依据的 `metrics.ts`、`config.ts`、`spring.ts`、`path.ts`、`skirt.ts`、`geometry.ts`、`README.md` 与 MIT `LICENSE`，每个魔法数可溯源 |
| `scripts/test-island.cjs` | 见 §7 |
| `.github/workflows/deploy-modelscope.yml` | `paths:` 加 `scripts/test-island.cjs`，步骤加 `node scripts/test-island.cjs` |
| `scripts/version-assets.mjs` | 无需改动：`pages` 列表已含 `index.html`，新资源自动被盖章 |

`login.html`、`404.html`、`analytics.html` 不装岛（登录页与 404 不在阅读视图，无活动可显示）。

---

## 4. 数据流

### 4.1 进度来源（不新增滚动监听）

`reading.js` 已经在 `scroll` 去抖 180ms、`hashchange`、`pagehide` 三条路径上算出同一个整数 percent，只需在写完 `#readingPercent` 后广播一次：

```js
// assets/reading.js:44 之后
document.dispatchEvent(new CustomEvent('purplebook:progress',
  { detail: { chapter: chapter.id, percent } }));
```

选择该接缝的理由：去抖已完成（≤约 5 次/秒），不动 `paper.js` 的 rAF/布局预算，且与 `purplebook:route`/`purplebook:session` 同构。

### 4.2 两条活动

| | `reading-progress` | `focus-timer` |
|---|---|---|
| group / priority | `reading` / 0 | `focus` / 1 |
| 存在条件 | 阅读视图（含暂停中的会话） | 会话存在（`running`/`paused`） |
| compact | `glyph:book` + `text:'43%'` | `glyph:lotus` + `time:'24:58'` |
| minimal | `glyph:book` + `bubble:ring(0.43)`（副胶囊只剩约 20pt，ring 是唯一稳过的形） | 只给 `glyph:lotus`，不给 `trailing`：`"24:58"` 超出副胶囊约 20pt 的余量，分裂时它留在主胶囊，`minimal` 只是超 `maxSpan` 时的降级 |
| expanded | 章节标题 + 本章 `bar` + 今日累计 | 剩余时间大字 + 累计 + 三个按钮 |
| 更新时机 | `purplebook:progress` | 引擎的 `{time}` 自走，仅阶段切换时 `update` |

会话在跑时 `presentation === 'minimal'`（分裂）：priority 1 的倒计时占主胶囊，progress 进副胶囊。

### 4.3 为什么和最初的草图相反

用户草图为 `[🔖 43%] ●[🧘 24:58]`。上游实测副胶囊固定 62.18 宽、22pt 图标之后只剩约 20pt，其文档把 `"4:31"`、`"18 min"` 明确列为**放不下**（超出即省略号或需 bubble 化），而 20pt 的 ring 与 `"43%"` 恰好合适。因此把"需要看数字的"倒计时留在主胶囊、把"一眼看趋势的"进度换成 ring 进副胶囊——语义不变，分配受测量约束。

### 4.4 会话状态机

```
none ──点「专注计时」/岛上按钮──▶ running(target=25min)
running ──暂停──▶ paused ──继续──▶ running
running ──remaining<=0──▶ complete ──alert 5.975s 后──▶ end ──▶ none（记 1 次会话）
running/paused ──结束──▶ ended ──alert「本次 25:10」──▶ end ──▶ none（记实际时长）
running/paused ──+5分──▶ running(remaining+=300s)
```

墙钟规则（`setTimeout` 在后台标签页被限流到约 1 次/秒，累加 tick 必然漂移）：

```js
remaining = clamp(target - (Date.now() - startedAt) - accumulatedMs, 0, target)
```

- `running` 存 `{startedAt, accumulatedMs, target}`；每次 `paused→running` 把这段并入 `accumulatedMs`
- 时钟回拨（改系统时间、时区异常）：`now < startedAt` 判为新会话；`remaining` 恒被 clamp 到 `[0, target]`，绝不倒扣成负
- 刷新与重进阅读页：从存储里的 `active` 恢复并按墙钟重算
- 离开阅读视图：会话继续跑（它是计时器，不属于某个视图），岛整体隐藏；回来时按当前状态重绘
- 到点提醒走 `alert:true`（引擎自动展开、5.975s 后回落），约 7s 后 `h.end()`

### 4.5 存储

单一键 `ms-cookbook-focus`，读写用 `reading.js:6-10` 的 try/catch + `persist()` 模式，并按 `exercise-store.js:53` 的思路探测可写性：

```js
{
  date: '2026-11-16',          // 本地日；不等于今天则 totalMs/sessions 归零
  totalMs: 4_800_000,
  sessions: [{ endedAt, ms }], // 上限 30 条，防无界增长
  active: null | { startedAt, accumulatedMs, target, paused }
}
```

- 任何字段类型不符（手改/截断）→ 整体回退默认值，不抛
- 监听 `storage` 事件重读，避免多标签页互相覆盖累计
- 不可写（隐私模式）→ 会话照跑、累计不写、岛不报错

### 4.6 语言切换

`MSI18N.on` 里重绘两条活动的文案与数字格式（同 `paper.js:569` 的重渲染惯例）；`{time}` 用 `toLocaleTimeString` 的秒级短形，locale 取 `MSI18N.locale()`。

---

## 5. 视觉、无障碍与降级

| 议题 | 决定 |
|---|---|
| 位置 | `position:fixed`，`top:13.91px`，视口水平居中，`z-index:60`（header 是 10） |
| 尺寸 | 按上游规则锁定手机尺寸：宽屏不拉伸，expanded 恒 374.34 |
| 与搜索框重叠 | 阅读视图 header 正中是 `min(100%,440px)` 的搜索框，滚到顶部时 compact（约 150×37）压住中间一段。取舍：**不移除控件、不动布局（0 CLS）**；容器 `pointer-events:none`、胶囊 `pointer-events:auto`；键盘路径 ⌘K / Ctrl K 已存在（`paper.js:257-258`）；`top` 是表里的一个数，评审后若嫌碍眼，改这一个数即可整体挪到 header 下方 |
| 收合 | 点岛外、`Escape`、或再按岛上按钮 |
| keyline | 由 `Island.mount({backdrop:'#ffffff'})` 按实测 luma 计算，浅色页得 α=0，即不画 |
| reduced-motion | 一次 `matchMedia` 判定：弹簧无过冲（`reduced.duration 0.2`）、内容 crossfade 无 blur；`{time}` 仍走秒但不做翻字动画 |
| 读屏 | 每条活动的 `label` 即按钮名（例："本章阅读进度 43%"、"专注剩余 24 分 58 秒"）；胶囊本身是可聚焦 `button`，`aria-expanded` 反映是否展开；alert 时用 `role="status"` 的 live region 播报一次 |
| 键盘 | Tab 可聚焦胶囊，Enter 展开、Escape 收合、展开态下按钮可 Tab 到达 |
| 打印 | `@media print { #islandRoot { display: none } }` |
| 降级 | 挂载点/`#readingProgress` 缺失或内容词汇不认识 → `console.warn` 一次 + `Island.enabled=false`，正文阅读路径完全不受影响 |

---

## 6. 错误处理（只在边界设防）

| 边界 | 行为 |
|---|---|
| `localStorage` 不可读/不可写 | 视为空状态；会话仍可用，累计不写 |
| 存储内容损坏或类型漂移 | 校验后整体回退默认，不逐字段猜 |
| 系统时钟回拨 | `remaining` clamp `[0, target]`；`now < startedAt` 当新会话 |
| 引擎缺挂载点 / 词汇不认识 | 警告一次并整体停用岛，不抛异常 |
| `IntersectionObserver` / View Transitions 缺失 | 已由 `motion.js` 兜底，岛不重复判断 |
| 两标签页并发 | `storage` 事件重读累计；`active` 以最后写入为准（可接受的弱一致） |

---

## 7. 测试

### 7.1 `scripts/test-island.cjs`（纯 Node，仿 `test-exercise-*` 的 `node:vm` + 最小 DOM 桩）

1. `solveSpring` 对已知解析值：`response .483 / df .62` 在若干 `t` 上的位移，以及 `df>1`（dismiss 1.019）不发散
2. `AnimatedValue` 飞行中 retarget 保留速度（展开被打断成收合无跳变）
3. `outline` 产出尺寸：idle 94.85×36.84、compact 两侧 ≤72 与 `balance .7475` 的短边增长、split 主胶囊 + 7.82 gap + 副胶囊 62.18、expanded 374.34 与 contentClip 34.4
4. `maxSpan 290` 超限退回 minimal 的分支
5. 活动栈：同 id 再 start 即更新、`priority` 选主、`group` 内一次一条、深合并只覆盖给定槽
6. alert 时序：`alertContentDelay .12` → 展开 → `alertHold 5.975` → 回落
7. 长按阈值 `0.216`；点按走 `squish .09` 不展开
8. reduced-motion 分支无过冲、无 blur
9. 墙钟倒计时：前进/回拨/跨日的 `remaining` 断言
10. 存储 schema：损坏 JSON、错类型、跨日归零、`sessions` 截到 30

### 7.2 源码契约断言（仿 `test-motion.cjs`）

- `index.html` 里两个岛脚本必须带 `defer`，且 eager 三脚本白名单未被破坏
- 三语 locale 的 `island.*` 键集合完全一致
- `NOTICE` 含 islandcn MIT 行与上游 commit
- `ISLAND_METRICS` 的 6 个关键常数（idle 宽、compact balance、副胶囊 62.18、expanded 374.34/84/180）与本文档一致，防漂移
- `app.py` 与 `requirements.txt` 未被改动

### 7.3 浏览器实测（本地起 uvicorn，`?参数=1` 强制整页重载）

进章节看 compact 进度 → 点「专注计时」看分裂 → 暂停/继续/+5 → 快进到 00:00 看 alert 与回落 → 刷新恢复 → 切 en/es 看文案 → 开 `prefers-reduced-motion` 看无过冲 → Chrome performance trace 确认只动 transform/opacity、无 ForcedReflow 增长（40 万字文档上的硬指标）→ Ctrl+P 预览确认打印隐藏。

### 7.4 回归

```bash
PYTHONUTF8=1 .venv/Scripts/python.exe -m pytest tests -q
for f in scripts/test-*.cjs; do node "$f"; done
node scripts/check-site.mjs
node scripts/version-assets.mjs
```

---

## 8. 部署与回滚

线上现状（8 天前记录，须复核）：`/data/ms-cookbook` + PM2 应用 `ms-cookbook` 监听 `0.0.0.0:8899`，公网 `http://120.53.222.178:8899`；账号库是独立 PostgreSQL 容器，正文/评论/进度仍在 SQLite。`deploy/README.md` 写的是"正式域名 + HTTPS + 回环端口"的**目标态**，与实际 pm2@8899 明文入口不一致——本次沿用已验证的 pm2 流程，不动 TLS。

顺序：

1. `git pull` 前先在服务器 `tar -czf backups/source-before-island-<时间戳>.tar.gz` 备份源码
2. 按哈希差异清单 tar 同步本次改动的文件；**跳过服务器独占**：`ecosystem.config.js`、`run.sh`、`index.html.bak.*`
3. 服务器跑 pytest + node 两套测试
4. `pm2 restart ms-cookbook --update-env`
5. 用 **GET**（HEAD 不触发 gzip）核对 `assets/island.js`/`island.css` 的 `Content-Encoding` 与 `Cache-Control: immutable`
6. 浏览器打开 `http://120.53.222.178:8899/?v=1#chapter-1` 实测上述 7.3 的关键 5 步
7. 回滚：解回 `backups/source-before-island-*.tar.gz` + `pm2 restart`

推送：`scripts/version-assets.mjs` 重打 `?v=` 后提交（作者 shenmian），走 gh 已登录凭据的一次性 HTTPS URL 推 `main`（本机 22 端口被代理屏蔽），`git ls-remote` 验证远端一致。用户已在原始指令中明确要求推送，实测通过后直接推，不再单独等令。

---

## 9. 许可与署名

- islandcn：MIT License, Copyright (c) 2026 Leo。本设计的 `assets/island.js` 是其**衍生移植**，因此：`docs/reference/islandcn/LICENSE` 保留原文；`NOTICE` 增列该组件与"已移植/已修改"的说明（符合 NOTICE 现有"说明你改了什么"的要求）；移植文件头部注释指向参考源与 commit。
- 上游明确声明其"仿的是外观与动效，不含任何 Apple 资产"，本项目同样不使用 Apple 素材；`Dynamic Island` 为 Apple 商标，文案里不作为产品名使用。
- 不引入 `@hugeicons`（其图标为 Hugeicons 免费集 MIT），本站字形自绘，避免署名与体积成本。

---

## 10. 已知偏差与后续

| 偏差 | 影响 | 后续 |
|---|---|---|
| 黏颈（metaball bridge）可能延后 | 分裂/合流那 0.4s 少一次"拉丝"观感 | 独立里程碑，`skirt.ts` 为纯几何，可后补 |
| 内容词汇只有 7 个原子，不是任意 ReactNode | 岛内不能塞自定义组件 | 新增原子按需扩，不改引擎 |
| 只在阅读视图出现 | 首页/目录/练习页无岛 | 若要把语言包/练习包加载也接进来，只需在对应模块再发 `start()` |
| `active` 会话多标签页弱一致 | 两个 tab 同开会话互相覆盖最后写入 | 需要时可加 `BroadcastChannel` 单实例化 |
| 专注时长硬编码 25 分钟 | 无自定义目标 | `+5分` 已覆盖最常见需求，先不做设置面板 |

---

## 11. 实测记录（2026-11-16 本地实现后）

### 11.1 单元与集成测试

`node scripts/test-island.cjs` → **73 passed**。分组：常量表 6、弹簧 4、路径 5、布局 7、活动栈 10、时序 9、渲染 8、装配与三语契约 11、专注状态机 11、跨模块集成 1（其余为参考源/署名 2）。
既有套件同时全绿：`test-motion` 23、`test-asset-loading` 14、`test-reader-copy` 9、`test-ci-coverage` 13、`check-site` PASS、`pytest tests` 176 passed。

### 11.2 浏览器实测（`python3 -m http.server 4173` + Chrome DevTools Protocol，桌面 1280×900）

| 项 | 实测 | 对照上游数值 |
|---|---|---|
| 静止胶囊 | `top 13.91`、`height 36.85`、宽 145.53（由槽位 offsetWidth 驱动） | `metrics.compact.height 36.85`、`top 13.91` ✓ |
| 分裂 | 副胶囊 `width 62.18px @ left 55.24px`，主胶囊左缘 -123.34，总跨度 240.76 | `split.detached.width 62.18`、`minimal.gap 7.82`（47.425+7.82=55.245）、`maxSpan 290` 未超 ✓ |
| 展开 | `374.34 × 106.53`，路径首段起笔 `M -104.782` | `expandedWidth 374.34`；`-187.17 + edgeEase(47.9,0.72,187.17).p(82.388) = -104.782` ✓ |
| 键盘 | 胶囊 `Tab` 可达（`document.activeElement` 即 `.island-pill`），`Enter` 展开、`Escape` 收合 | — |
| 倒计时 | 墙钟跳 61s → `23:59`；暂停期间走的 5 分钟不计入 | §4.4 墙钟规则 ✓ |
| 三语 | en：`Focus timer / 24:37 left / Pause / +5 minutes / End / 3:16 today`；es 同检 | `island.*` 键三语集合一致（测试断言）✓ |
| 完成提醒 | live region 播报「本次 0:03 · 今日累计 3:16」；5.975s 后回落，7s 后活动结束；`sessions` 落账、`active` 清空 | `alertHold 5.975`、上游 upload 预设的 7s ✓ |
| 减动效 | 媒体查询在 `island.js:1125` 读取；引擎分支由单测覆盖（0.2s 无过冲收敛 + 反向证明过冲检测在正常动效下会亮） | `motion.reduced.duration 0.2` ✓ |

### 11.3 性能 trace（页面加载，1× CPU，无网络节流）

- LCP 277 ms（load delay 116 / render delay 152）；CLS 0.0668。
- **最大位移簇的根因是既有的未定尺寸 `.article-image`（0.0655）；岛自身那条位移分数 0.0000**（`button.island-pill`，`position:fixed` 不参与文档布局）。
- 强制同步布局总计 **0.4 ms**，触发者首位是既有的 `paper.js:544`；`island.js` 只剩 `mount` 一次性 3 ms（插入固定子树后的首次布局），**每帧路径已不再出现任何读布局的调用**。
- 375×720 手机档：`documentElement.scrollWidth = 375 = innerWidth`，无横向溢出；分裂跨度 246.77 仍容得下。胶囊遮住页眉中央的搜索按钮（§5 记录的取舍），但阅读工具条里的「搜索」按钮仍可点，移动端没有失去搜索入口。

### 11.4 实测抓到、而单元测试各自都绿的四个缺陷

1. `focus.js` 发的内容原子是 `{time:{until,format}}`，引擎认的是 `{until,format}` → 倒计时显示 `NaN:NaN`。
2. 重画只按 `contentKey` 判断 → 同一条活动的就地更新（百分比、暂停态）永远不上屏。
3. 完成 alert 只重写 `leading/center`，`merge` 保留了上一秒的倒计时原子 → 展开面底部显示 `0:00` 而不是本次时长。
4. 同一帧先 `replaceChildren` 再读 `offsetWidth` → 浏览器把 `measureSlot` 列成全站最大的一条强制重排（15 ms）；改成写完排一个宏任务再读，降到 0。

对应的防护是一条把两个模块放进同一 vm 沙箱、共用同一个假时钟的集成测试，以及忠实的 DOM 桩（`replaceChildren`、`[attr=value]` 选择器、拼接后代的 `textContent`）——桩不忠实，测试就会假绿。

### 11.5 仍未接入的一项

分裂的"黏颈"（`bridgePath` 已在引擎里并带单测）尚未接进副胶囊的进出动画：目前副胶囊按弹簧直接落位，缺那 0.4s 的拉丝。这是 §3.2 预留的独立里程碑。

---

## 12. 生产部署记录（2026-11-16，`http://120.53.222.178:8899`）

部署前发现生产树比 main 落后两次发布，且 `app.py` 的 `import httpx2` 在生产 Python 3.10 上装不出来（`httpx2>=2.16` 要求 ≥3.11）。经确认，发布范围由"只上岛"改为**整包上 main**，并为此做了一次用户空间的运行时升级。

### 12.1 运行时升级（不动系统，不要求 root）

| 项 | 做法 |
|---|---|
| 解释器 | `uv 0.13.8` 装到 `~/.local/bin`；`uv python install 3.12` → CPython 3.12.16（用户空间，无需 sudo） |
| 依赖 | `/data/ms-cookbook/.venv-312`（58MB），按 main 的 `requirements.txt` 安装：fastapi 0.163.1、starlette 1.10.0、authlib 1.9.6、psycopg 3.3.9、tzdata 2026.6、httpx2 |
| 切换点 | `run.sh` 只改第 4 行 `exec .venv/bin/python` → `exec .venv-312/bin/python`；旧 `.venv` 原地保留 |
| 镜像 | `uv` 不读 `pip.conf`，必须显式 `UV_DEFAULT_INDEX=https://mirrors.aliyun.com/pypi/simple/`，否则默认打 pypi.org 在国内极慢（第一次安装就是这么卡住的） |

### 12.2 上线前的闸门（全部在动生产之前完成）

1. 备份 `backups/source-before-island-20261116-155622.tar.gz`（160M，含 `.venv`）。
2. 差异清单：`git ls-files` 939 个文件逐文件哈希比对 → **78 个文件 / 1.9MB** 待传（含 `app.py`、`content.js`、`exercises.js`、两张 webp 头图、`NOTICE`、`404.html`、`deploy/`、`tests/test_production_hardening.py` 等服务器上原本不存在的东西）。
3. 干跑区 `/tmp/ms-next` = 生产树完整副本 + 这 78 个文件：`pytest tests` **176 passed**；`test-island 73`、`test-motion 23`、`test-asset-loading 14`、`test-reader-copy 9`、`test-i18n`、`test-ci-coverage`、`check-site` 全绿。
4. 用新 venv 在 8900 端口做一次启动预检（8899 全程不动）：首页 200、`/api/session` 200、`assets/island.js` 200、友好 404 ✓。
5. 才同步文件 → 备份 `run.sh` 到 `backups/run.sh.before-island-<ts>` → 改解释器 → `pm2 restart ms-cookbook --update-env`。

### 12.3 线上验证

- 首页 200，安全头齐（CSP `script-src 'self' 'wasm-unsafe-eval'`、`nosniff`、`referrer-policy`、`permissions-policy`）→ 11-14 那次整改这次真的上线了。
- 岛资源：`island.js` 18,623B / `island.css` 2,732B / `focus.js` 5,299B 均 `content-encoding: gzip`；带 `?v=` 时 `cache-control: public, max-age=31536000, immutable` ✓（不带 `?v=` 时是 `must-revalidate`，符合预期）。
- API：`/api/session`、`/api/chapters/chapter-1/entries`、`/api/wishes`、`/api/exercises/progress`、`/api/analytics/summary` 全 200；`pm2-err.log` 只有正常的 shutdown/startup 行。
- 浏览器实测：岛 `enabled`，静止为进度胶囊，开计时后分裂（副胶囊 62.18），展开面显示大号剩余时间与三个按钮，读屏名并列；刷新后按墙钟恢复进行中会话 ✓；控制台除既有两项外无岛相关报错。

### 12.4 已知遗留（都不是本次引入）

- 浏览器忽略 `Cross-Origin-Opener-Policy`：`http://120.53.222.178:8899` 不是可信来源，COOP 只在 HTTPS 或 localhost 下生效。要消掉它得上域名 + TLS（`deploy/README.md` 描述的目标态）。
- 「懒加载图片缺显式尺寸」14 处：内容侧既有问题。
- 生产机仍留着旧 `.venv`（Python 3.10）与 `run.sh` 备份，回滚 = 还原 `run.sh` 那一行 + `pm2 restart`；源码回滚 = 解 `backups/source-before-island-*.tar.gz`。
- GitHub Actions 的 `deploy` 作业仍失败在 `Error: Set MODELSCOPE_API_KEY before deploying.`：仓库没配这个 secret，`08c317a`（11-15）那次也是同一句。`verify` 作业与它无关，已绿。
- 生产树上 114 个 `content/i18n/*.json` 与 `requirements.txt`、`使用说明.txt`、一个 yml、一个测试 py 是 CRLF 字节（早先用 tar 从 Windows 工作副本同步留下的），`tr -d '\r'` 后与提交完全一致：JSON 解析、pip、pytest 都不看换行符，也没有 `?v=` 指纹契约，属于无害漂移，本次不动它们。

### 12.5 第二轮：CI 回归与线上实测又抓到六个缺陷

推送后 `verify` 作业先红在 `reading.js: document.dispatchEvent is not a function`：本仓库的
`purplebook:route` / `purplebook:session` 都派发在 **window** 上，我新加的事件却派发到
document，而监听方在 window —— 单元测试各测各的，只有 CI 的 exercise 冒烟把两端接起来才看得见。
改成 `window` 后 `verify` 转绿（`676de05` 之前）。

线上实测（chrome-devtools 驱动真实 Chrome，`http://120.53.222.178:8899`）又抓到五个：

| 缺陷 | 症状 | 根因 | 修法 |
| --- | --- | --- | --- |
| 暂停时按钮"没按下" | `phase='paused'` 而 `aria-pressed=false` | 按钮是 none→start / paused→resume / running→pause 三态循环，`aria-pressed` 只认 running | `running \|\| paused` 都算按下（`648c6f4`） |
| 结束后倒计时永远留在岛上 | `phase='none'` 但 `allActivities()` 仍有 `focus-timer`，胶囊还在走字 | `finish()` 把活动句柄清成 `null`，`stop()` 于是另起一条 alert，旧的那条没人 `end()` | `stop()` 先留住句柄并复用它，跟到点完成那条路径一致；复用时整片 `expanded` 一起重写，不留上一秒的原子（`676de05`） |
| 看不见却能点、能聚焦的幽灵胶囊 | idle 时 `.island-pill` 仍有旧字数，`display` 是 `flex` | ① `paintSlots` 缺 `idle` 分支，字没擦；② `.island-pill` 自己写 `display:flex`，把 UA 的 `[hidden]{display:none}` 顶掉了，`hidden` 属性形同装饰 | 补 `idle` 分支擦净全部槽位；CSS 加 `.island-pill[hidden], .island-bubble[hidden], .island-expanded[hidden] { display: none; }`；`pill.hidden` 在 idle 也置真（`676de05`） |
| 页眉正中浮一颗空的黑色胶囊 | 无活动时形状照画 94.85×36.84 | 上游的 `idle` 是**物理刘海**，网页上没有刘海可合回去；`shapeTarget('idle')` 照搬刘海尺寸 | `idle` 形状目标收到 0 宽，岛随弹簧合拢消失、活动出现时从零长出来；`METRICS.idle` 仍按上游实测保留在常量表（`a377715`） |
| 进度活动被结束后永久哑掉 | 换章后岛不再跟进度，只 `update` 不 `start` | `progressSeen` 自己记"见过没有"，而 `island.start()` 对已存在 id 本来就转成 `update`（幂等），记状态纯属负债 | 去掉 `progressSeen`，恒走 `start()`；同时把测试 rig 的假岛改成同样会去重，否则这类 bug 在测试里根本测不出来（`397b55a`） |

减动效用例的收敛窗口按新行程实测从 0.3s 放宽到 0.4s（0→150px 在 0.317s 才进阈值），并把口径写进用例名。

### 12.6 线上实测的方法坑（两条都会给出假结果）

- **后台标签页不给帧**：`document.hidden === true` 时 rAF 被节流到 0 帧，`d`、字数全空，看着像"形状画不出来"。Qoder 的 in-app Browser 面板没开就是 `viewport=0x0, visibilityState=hidden`，`take_screenshot` 直接报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`。要用真实 Chrome（`frames=43/700ms` 这种计数确认有帧）再取证。
- **前提没自检就下结论**：正文渐进渲染时 `scrollHeight` 还没长出来，`scrollTop = sh*0.25` 会被夹回 0；`scroll-behavior: smooth` 下同步读 `scrollTop` 拿到的还是旧值。这两点合起来一度让我以为"滚动不派发进度"。先打印 `scrollHeight / barWidth / pct` 再判断，结论立刻变成 `49% → 本章阅读进度 49%`。
- **哈希差异要分两层**：`tr -d '\r'` 的比对能找内容差异，却会**盖掉换行符漂移**；`index.html` 的 `?v=` 是按 LF 内容算的，所以必须再拿 `git cat-file blob` 的哈希跟生产上的原始字节比一次，才查得出 `paper.css` / `i18n.css` / `login.css` 在服务上是 CRLF、指纹却在声明 LF 这件事。修完服务器侧 `test-exercise-wiring` 从 21/2 变 23/0。
- **本地 `test-exercise-wiring` 的 2 条红是 Windows 假红**：`08c317a` 只把 `version-assets.mjs` 改成按 LF 算，`test-exercise-wiring.cjs` 仍按工作副本原始字节算；`.gitattributes` 声明了 `*.js/*.cjs/*.mjs/*.py/*.md` 却没管 `*.css` / `*.html`，`core.autocrlf=true` 下这些在 Windows 检出成 CRLF。在 `08c317a` 的干净 worktree 里跑同样得 21/2，失败文件名与 pin 一致 —— 与本次改动无关，也没有为了让它变绿去改那两个 CSS。

## 13. 悬停说明（2026-11-19 追加）

岛上的图标与数字（书签 + `43%`、莲座 + `24:58`）没有自解释力；鼠标停在岛上时应
在鼠标旁给一句同义说明，而不是要求读者先点开。

| 决策 | 结论 |
|---|---|
| 文案来源 | 活动的 `label`——也就是读屏拿到的那一句（文案只在 `assets/locale/*.js` 维护一份） |
| 倒计时 | `label` 生成于活动出现那一刻，不会自走；提示从当前呈现里找 `{until}` 原子并换成现读剩余，其余活动按更新后的 label 显示 |
| 分裂态 | `scene.label` 已经并列两条活动（`first.label, second.label`），提示原样使用 |
| 触发 | `.island` 上的 `pointermove`，仅 `pointerType === 'mouse'`；`pointerdown`/`pointerleave`/拖动/触摸立即收起 |
| 位置 | 提示是 `#islandRoot` 的 `position:fixed` 兄弟节点，不是 `.island` 的子节点——整岛拖动写的是 `.island` 的 transform，挂在下面会被带着偏。默认落在指针右下 `14px`，贴右/下缘翻到另一侧，再夹进视口 `8px` |
| 尺寸 | 只在可见且文案变化时读一次 `offsetWidth/offsetHeight`；倒计时每秒只换数字，等宽字体宽度不变，`measure=false` 不读布局 |
| 指针/读屏 | `pointer-events:none`（否则提示挡住鼠标会 leave→重弹循环）；`aria-hidden`，胶囊的 `aria-label` 本来就有同一句，不重复播报 |
| 排版 | 最大宽 280px，长报错原因换行而不是截断；深底白字 13px |

验收：`scripts/test-island.cjs` 的「悬停提示：鼠标旁说明岛内内容，跟手、会翻边、
离开/触摸即收」覆盖弹出、跟手、右/下缘翻边、悬停期间倒计时刷新、岛收起后消失、
触摸不触发；CSS 契约断言覆盖 `pointer-events:none` 与 `[hidden]{display:none}`。

### 13.1 生产部署（2026-11-19，`http://120.53.222.178:8899`）

沿用 PM2 + tar 流程，只动本功能的四个文件；`index.html` 在服务端就地改两处 `?v=`
指纹，保留服务器独有的企业入口/`/cases`/`/teams` 内容（这些不在本地 Git 树里）。

| 项 | 值 |
|---|---|
| 备份 | `backups/source-before-island-hint-20261119-090705.tar.gz`（136M） |
| 同步 | `assets/island.js`、`assets/island.css`、`scripts/test-island.cjs`、本设计文档 |
| 指纹 | `island.js?v=6eb9569f4c20`、`island.css?v=6b657b8ce3d5` |
| 预检 | 服务端 `test-island` 79、`test-asset-loading` 14、`test-motion` 23、`test-i18n`、`test-ci-coverage`、`pytest test_static_delivery + test_production_hardening` 27 全绿 |
| 重启 | `pm2 restart ms-cookbook --update-env`；`restart_time` 16→17，PID 3295978 online |
| 线上 | `/`、`/api/session` 200；生产 `island.js`/`island.css` SHA-256 与本地逐字节一致 |
| 浏览器 | 真实 Chrome：提示距指针 `13.997/14.002px`，文本 `专注剩余 24:58`（`aria-label` 仍 `25:00`），移开即 `hidden` |

回滚：解开上述备份 + `pm2 restart ms-cookbook --update-env`。

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

/* 引擎在 vm 沙箱里跑，它造出的对象带的是沙箱的 Object 原型；本 realm 的字面量
   与它 deepStrictEqual 会因原型不同判不等，而值完全正确。比较结构前先把两边
   搬回同一 realm，这样断言比的仍然是值与形状，不会退化成宽松比较。 */
const plain = value => JSON.parse(JSON.stringify(value));
function sameShape(actual, expected, message) {
  assert.deepEqual(plain(actual), plain(expected), message);
}

/* 在最小沙箱里加载引擎，返回 window.Island。无 DOM 也必须成功。 */
function loadIsland() {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('assets/island.js'), sandbox, { filename: 'assets/island.js' });
  return sandbox.window.Island;
}

check('METRICS 逐字照抄上游实测值', () => {
  const { METRICS } = loadIsland().internals;
  assert.equal(METRICS.top, 13.91);
  sameShape(METRICS.idle, { width: 94.85, height: 36.84 });
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
  sameShape(MOTION.shape.appear, { response: 0.483, dampingFraction: 0.62 });
  sameShape(MOTION.shape.expand, { response: 0.517, dampingFraction: 0.824 });
  sameShape(MOTION.shape.dismiss, { response: 0.432, dampingFraction: 1.019 });
  sameShape(MOTION.body.swap, { response: 0.492, dampingFraction: 0.832, delay: 0.223 });
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
  sameShape(Island.activities, []);
});

check('corner 与 press 弹簧照上游，圆角在多数 transition 上慢于边', () => {
  const { MOTION } = loadIsland().internals;
  sameShape(MOTION.corner.expand, { response: 0.448, dampingFraction: 0.87, delay: 0.018 });
  sameShape(MOTION.corner.swap, { response: 0.41, dampingFraction: 0.888, delay: 0.244 });
  sameShape(MOTION.corner.alertCollapse, { response: 0.47, dampingFraction: 0.86, delay: 0.009 });
  sameShape(MOTION.press.swell, { response: 0.803, dampingFraction: 0.641 });
  sameShape(MOTION.press.release, { response: 0.3, dampingFraction: 1.5 });
  assert.equal(MOTION.press.swellTime, 0.22);
  assert.equal(MOTION.press.decide, 0.1);
  assert.equal(MOTION.longPressBubble, 0.224);
  // 上游事实：胶囊到胶囊时半径恒为高度一半，这两条 corner 弹簧与 body 同值
  sameShape(MOTION.corner.split, MOTION.body.split);
  sameShape(MOTION.corner.unsplit, MOTION.body.unsplit);
});

check('corner/body/shape 的 transition 键集合彼此一致', () => {
  const { MOTION } = loadIsland().internals;
  const keys = table => Object.keys(MOTION[table]).sort().join(',');
  assert.equal(keys('corner'), keys('shape'));
  assert.equal(keys('body'), keys('shape'));
  assert.equal(keys('shape').split(',').length, 12, '上游 shapeTransitions 有 12 条');
});

check('solveSpring 闭式解：0→150 在 appear 弹簧上的实测轨迹', () => {
  const { solveSpring, MOTION } = loadIsland().internals;
  const at = t => solveSpring(MOTION.shape.appear, 150, 0, 0, t).value;
  assert.equal(at(0), 0);
  assert.ok(Math.abs(at(0.1) - 69.888) < 0.01, `t=.1 -> ${at(0.1)}`);
  assert.ok(Math.abs(at(0.2) - 142.498) < 0.01, `t=.2 -> ${at(0.2)}`);
  assert.ok(Math.abs(at(0.3) - 162.463) < 0.01, `t=.3 -> ${at(0.3)}`);   // 已过冲
  assert.ok(Math.abs(at(1.5) - 150) < 0.001, `t=1.5 -> ${at(1.5)}`);
  // 欠阻尼必有过冲：峰值约 162.5（+8.35%）出现在 t≈0.31
  let peak = 0, peakT = 0;
  for (let t = 0; t <= 1; t += 0.005) { const value = at(t); if (value > peak) { peak = value; peakT = t; } }
  assert.ok(peak > 160 && peak < 165, `peak ${peak}`);
  assert.ok(peakT > 0.28 && peakT < 0.34, `peakT ${peakT}`);
  assert.equal(solveSpring(MOTION.shape.appear, 150, 0, 0, 0).velocity, 0);
});

check('过阻尼不发散，临界阻尼无过冲', () => {
  const { solveSpring } = loadIsland().internals;
  const over = t => solveSpring({ response: 0.432, dampingFraction: 1.019 }, 0, 150, 0, t).value;
  assert.ok(Math.abs(over(1.2)) < 0.01, `dismiss settles at ${over(1.2)}`);
  let maxAbove = -Infinity;
  for (let t = 0; t <= 2; t += 0.005) maxAbove = Math.max(maxAbove, over(t));
  assert.ok(maxAbove <= 150 + 1e-9, 'df>1 must not overshoot past the start value');
  const crit = t => solveSpring({ response: 1, dampingFraction: 1 }, 100, 0, 0, t).value;
  assert.ok(crit(0.5) > 0 && crit(0.5) < 100, `crit(0.5) ${crit(0.5)}`);
  assert.ok(crit(5) > 99.9, `crit(5) ${crit(5)}`);
});

check('AnimatedValue 飞行中改目标保留速度，不跳变', () => {
  const { AnimatedValue, MOTION } = loadIsland().internals;
  const a = new AnimatedValue(0, MOTION.shape.expand);
  a.set(374.34);
  for (let i = 0; i < 12; i += 1) a.step(1 / 60);
  const before = a.value;
  assert.ok(before > 0 && before < 374.34, `mid-flight ${before}`);
  a.set(94.85);                       // 展开被打断成收合
  assert.equal(a.value, before, 'retarget must not jump the value');
  for (let i = 0; i < 180; i += 1) a.step(1 / 60);
  assert.ok(Math.abs(a.value - 94.85) < 0.01, `settled ${a.value}`);
  assert.equal(a.done, true);
});

check('同一 set 重复调用不起新弹簧（避免每帧重置时钟）', () => {
  const { AnimatedValue, MOTION } = loadIsland().internals;
  const a = new AnimatedValue(0, MOTION.shape.appear);
  a.set(150);
  for (let i = 0; i < 6; i += 1) a.step(1 / 60);
  const first = a.value;
  a.set(150);
  a.step(1 / 60);
  assert.ok(a.value > first, 're-setting the same target must keep the spring running, not restart it');
});

/* 走一遍 SVG path，取出所有被画的点。'A' 的前五个数是 rx ry rot largeArc sweep，
   只有结尾是坐标——不区分的话边界断言会把半径当成 x 坐标。 */
function pathPoints(d) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) || [];
  const points = [];
  let command = 'M';
  for (let k = 0; k < tokens.length; k += 1) {
    if (/^[A-Za-z]$/.test(tokens[k])) { command = tokens[k]; continue; }
    const numbers = [Number(tokens[k])];                       // 参数从当前位置起算
    while (k + 1 < tokens.length && !/^[A-Za-z]$/.test(tokens[k + 1])) { k += 1; numbers.push(Number(tokens[k])); }
    const pairs = command === 'A' ? numbers.slice(5) : numbers;
    for (let n = 0; n + 1 < pairs.length; n += 2) points.push([pairs[n], pairs[n + 1]]);
  }
  return points;
}

check('edgeEase：胶囊的短边只吃下装得下的平滑', () => {
  const { edgeEase } = loadIsland().internals;
  const r = 18.42;                                  // idle 的半径 = 高度一半
  const across = edgeEase(r, 0.72, 94.85 / 2);      // 长边：满 0.72
  assert.ok(Math.abs(across.p - 31.682) < 0.01, `p ${across.p}`);
  assert.ok(Math.abs(across.along - 8.55) < 0.01, `along ${across.along}`);
  assert.ok(Math.abs(across.across - 2.867) < 0.01, `across ${across.across}`);
  assert.ok(Math.abs(across.a - 12.409) < 0.01, `a ${across.a}`);
  assert.ok(Math.abs(across.b - 6.205) < 0.01, `b ${across.b}`);
  assert.ok(across.a === 2 * across.b, 'a 必须是 b 的两倍，否则两侧把手不对称');
  const down = edgeEase(r, 0.72, 36.84 / 2);        // 短边：room/r-1 = 0，平滑被夹到 0
  assert.equal(down.p, r);                          // (1+0)·r
  assert.equal(down.along, r);                      // angle=0 -> 圆弧端点回到 r 处
  assert.equal(down.across, 0);
  assert.equal(down.b, 0);
  assert.equal(down.a, 0);
  // 夹到 0 的意义：短端就是一段标准半圆，肩膀消失——胶囊的高度因此精确。
});

check('continuousRectPath 出闭合路径且所有落点不越出盒子', () => {
  const { continuousRectPath } = loadIsland().internals;
  const d = continuousRectPath(-47.425, 13.91, 94.85, 36.84, 18.42, 0.72);
  assert.ok(d.startsWith('M '), d.slice(0, 24));
  assert.ok(d.endsWith('Z'));
  assert.equal((d.match(/A /g) || []).length, 4, '四段圆弧');
  assert.equal((d.match(/C /g) || []).length, 8, '八个缓入把手');
  // 起笔在顶边 (1+s)·r 处
  assert.ok(d.startsWith('M -15.743 13.91'), `起笔 ${d.slice(0, 20)}`);
  for (const [x, y] of pathPoints(d)) {
    assert.ok(x >= -47.43 && x <= 47.43, `x ${x} 越出水平范围`);
    assert.ok(y >= 13.9 && y <= 50.76, `y ${y} 越出垂直范围`);
  }
  assert.equal(continuousRectPath(0, 0, 0, 10, 5, 0.72), '');
  assert.equal(continuousRectPath(0, 0, 20, 10, 0, 0.72), 'M 0 0 H 20 V 10 H 0 Z');
});

check('expanded 的半径 47.9 在 374.34 宽上吃满平滑', () => {
  const { continuousRectPath, edgeEase } = loadIsland().internals;
  const room = (402 - 2 * 13.83) / 2;
  assert.ok(Math.abs(room - 187.17) < 0.01, `room ${room}`);
  assert.ok(Math.abs(edgeEase(47.9, 0.72, room).p - 82.388) < 0.01, 'p 应为 (1+0.72)·47.9');
  const d = continuousRectPath(-187.17, 13.83, 374.34, 106.53, 47.9, 0.72);
  assert.equal((d.match(/A /g) || []).length, 4);
  for (const [x, y] of pathPoints(d)) {
    assert.ok(Math.abs(x) <= 187.18 && y >= 13.82 && y <= 120.37, `expanded 落点越界 ${x},${y}`);
  }
});

check('chamferPath 按 45 度切角裁内容，切角夹到边长一半', () => {
  const { chamferPath } = loadIsland().internals;
  assert.equal(chamferPath(10, 10, 100, 50, 20),
    'M 30 10 L 90 10 L 110 30 L 110 40 L 90 60 L 30 60 L 10 40 L 10 30 Z');
  // 5×5 的盒子里 20 的切角只能吃到 2.5：四条直边缩成点，形状仍是闭合八段
  assert.equal(chamferPath(0, 0, 5, 5, 20),
    'M 2.5 0 L 2.5 0 L 5 2.5 L 5 2.5 L 2.5 5 L 2.5 5 L 0 2.5 L 0 2.5 Z');
  assert.equal(chamferPath(0, 0, 0, 10, 3), '');
});

check('bridgePath 在间隙达 maxGap 时断开（黏颈里程碑用）', () => {
  const { bridgePath } = loadIsland().internals;
  const opts = { handleSize: 2.4, spread: 0.3, maxGap: 5 };
  assert.equal(bridgePath({ x: 0, y: 0, r: 18 }, { x: 50, y: 0, r: 18 }, opts), '');  // gap 14
  const d = bridgePath({ x: 0, y: 0, r: 18 }, { x: 40, y: 0, r: 18 }, opts);          // gap 4
  assert.ok(d.length > 0 && d.endsWith('Z'), '未断开时必须是一条闭合的颈');
  assert.equal((d.match(/C /g) || []).length, 2, '颈由两条三次曲线构成');
  assert.equal(bridgePath({ x: 0, y: 0, r: 0 }, { x: 10, y: 0, r: 5 }, opts), '');
  // 颈随间隙变细：同样的两圆，靠得越近接点离轴越远（spread 未被淡出）
  const spread = d2 => Math.max(...pathPoints(d2).map(([, y]) => Math.abs(y)));
  assert.ok(spread(bridgePath({ x: 0, y: 0, r: 18 }, { x: 37, y: 0, r: 18 }, opts))
    > spread(d), '更接近的两圆应给出更饱满的颈');
});

const emptyMeasure = (leading = 0, trailing = 0) => ({
  leading, trailing, attached: 0, detached: 0, split: null, expandedHeight: 0
});

check('compact：两侧各按内容生长，短边按 balance 补齐', () => {
  const { compactSides } = loadIsland().internals;
  const progress = compactSides(emptyMeasure(22, 20));       // 书签图标 + "43%"
  assert.ok(Math.abs(progress.leading - 29) < 0.01, `leading ${progress.leading}`);
  assert.ok(Math.abs(progress.trailing - 27.25) < 0.01, `trailing ${progress.trailing}`);
  const focus = compactSides(emptyMeasure(22, 38));          // 莲座图标 + "24:58"
  assert.ok(Math.abs(focus.leading - 33.824) < 0.01, `leading ${focus.leading}`);
  assert.ok(Math.abs(focus.trailing - 45.25) < 0.01, `trailing ${focus.trailing}`);
  // 一侧为空时留在传感器边：balance 只管两侧都有内容的情况
  assert.equal(compactSides(emptyMeasure(0, 40)).leading, 0);
  // slot 上限 72：超宽内容不越过 maxSlotWidth
  assert.ok(Math.abs(compactSides(emptyMeasure(22, 200)).trailing - 79.25) < 0.01);
  // balance 的真实作用：短边长到"对方原始伸展"的 74.75%，不是内容宽度的 74.75%
  const lopsided = compactSides(emptyMeasure(8, 60));
  assert.ok(Math.abs(lopsided.leading - 67.25 * 0.7475) < 0.01, `balance 未生效：${lopsided.leading}`);
  assert.ok(Math.abs(lopsided.trailing - 67.25) < 0.01, `长边不该被缩短：${lopsided.trailing}`);
});

check('split：主胶囊占到传感器右边，副胶囊恒 62.18', () => {
  const { splitLayout } = loadIsland().internals;
  const m = { ...emptyMeasure(), split: { attached: { leading: 22, trailing: 38 }, detached: { leading: 22, trailing: 20 } } };
  const l = splitLayout(m);
  assert.ok(Math.abs(l.left - (-128.345)) < 0.01, `left ${l.left}`);
  assert.ok(Math.abs(l.right - 47.425) < 0.01, `right ${l.right}`);
  assert.ok(Math.abs(l.bubbleLeft - 55.245) < 0.01, `bubbleLeft ${l.bubbleLeft}`);  // 传感器右 + gap 7.82
  assert.ok(Math.abs(l.bubbleRight - 117.425) < 0.01, `bubbleRight ${l.bubbleRight}`);
  assert.ok(Math.abs(l.bubbleWidth - 62.18) < 0.01, `bubbleWidth ${l.bubbleWidth}`);
  assert.ok(Math.abs((l.bubbleRight - l.left) - 245.77) < 0.01, 'span 应小于 maxSpan 290');
  // trailing 内容再宽，副胶囊也不跟着长：上游实测 "7" 与 "12:45" 都是 62.18
  const wide = splitLayout({ ...emptyMeasure(), split: { attached: { leading: 22, trailing: 38 }, detached: { leading: 22, trailing: 60 } } });
  assert.ok(Math.abs(wide.bubbleWidth - 62.18) < 0.01, `副胶囊被内容撑大了：${wide.bubbleWidth}`);
});

check('split：副胶囊 trailing 只剩 20.5pt，倒计时放不进去（设计文档 §4.3）', () => {
  const { bubbleTrailing } = loadIsland().internals;
  const ring = bubbleTrailing({ leading: 22, trailing: 20 }, 62.18);
  assert.ok(Math.abs(ring.room - 20.5) < 0.01, `room ${ring.room}`);
  assert.equal(ring.width, 20, '20pt 的 ring 恰好不被裁');
  const digits = bubbleTrailing({ leading: 22, trailing: 38 }, 62.18);
  assert.ok(Math.abs(digits.width - 20.5) < 0.01, `"24:58" 被裁到只剩 room：${digits.width}`);
  assert.ok(digits.width < 38, '数字必须被裁，所以倒计时不能进副胶囊');
  assert.ok(Math.abs(digits.fromRight - 17.425) < 0.01, `中心位置 ${digits.fromRight}`);
});

check('split 超过 maxSpan 时退回 minimal；没有 split 内容时也退回', () => {
  const { splitLayout } = loadIsland().internals;
  assert.equal(splitLayout({ ...emptyMeasure(), split: { attached: { leading: 72, trailing: 72 }, detached: { leading: 72, trailing: 72 } } }), null);
  assert.equal(splitLayout(emptyMeasure()), null);
});

check('shapeTarget 四态的尺寸与顶部偏移', () => {
  const { shapeTarget, METRICS } = loadIsland().internals;
  const idle = shapeTarget('idle', emptyMeasure(), 402);
  assert.deepEqual([idle.left, idle.right, idle.height, idle.radius], [-47.425, 47.425, 36.84, 18.42]);
  assert.equal(idle.top, 13.91);
  assert.equal(idle.bubbleHeight, 0);
  const compact = shapeTarget('compact', emptyMeasure(22, 20), 402);
  assert.ok(Math.abs((compact.right - compact.left) - 151.1) < 0.01, `compact 宽 ${compact.right - compact.left}`);
  assert.equal(compact.height, METRICS.compact.height);
  // 宽屏不拉伸：岛始终按手机宽度排
  for (const screen of [402, 1440, 2560]) {
    const wide = shapeTarget('expanded', { ...emptyMeasure(), expandedHeight: 40 }, screen);
    assert.ok(Math.abs((wide.right - wide.left) - 374.34) < 0.01, `${screen} 屏展开宽 ${wide.right - wide.left}`);
  }
  const height = content => shapeTarget('expanded', { ...emptyMeasure(), expandedHeight: content }, 402).height;
  assert.equal(height(40), 84);            // minHeight 兜住
  assert.ok(Math.abs(height(70) - 106.53) < 0.01, `70 -> ${height(70)}`);
  assert.ok(Math.abs(height(120) - 156.53) < 0.01, `120 -> ${height(120)}`);
  assert.equal(height(200), 180);          // maxHeight 兜住
  assert.equal(shapeTarget('expanded', { ...emptyMeasure(), expandedHeight: 70 }, 402).radius, 47.9);
  const minimal = shapeTarget('minimal', { ...emptyMeasure(), split: { attached: { leading: 22, trailing: 38 }, detached: { leading: 22, trailing: 20 } } }, 402);
  assert.equal(minimal.bubbleHeight, METRICS.minimal.height);
  assert.ok(minimal.bubbleRight > minimal.right, '副胶囊必须在主胶囊右边');
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
  // 每条选出来的名字都必须在三张弹簧表里存在，否则会取到 undefined 弹簧
  const { MOTION } = loadIsland().internals;
  for (const name of shapeTransitionsIn(MOTION)) {
    assert.ok(MOTION.shape[name] && MOTION.body[name] && MOTION.corner[name], `${name} 缺弹簧`);
  }
});

function shapeTransitionsIn(MOTION) {
  const froms = ['idle', 'compact', 'minimal', 'expanded'];
  const flags = [{}, { swap: true }, { swelling: true }, { alert: true }];
  const names = new Set();
  for (const a of froms) for (const b of froms) for (const f of flags) {
    names.add(loadIsland().internals.shapeTransition(a, b, { swap: false, swelling: false, alert: false, ...f }));
  }
  return [...names];
}

const mk = id => ({
  id, label: id,
  compact: { leading: { text: 'L' + id }, trailing: { text: id } },
  expanded: { center: { text: 'E' + id } }
});

check('start 返回句柄，同 id 再 start 是更新而非新增', () => {
  const Island = loadIsland();
  Island.mount({});
  Island.start(mk('a'));
  Island.start(mk('a'));
  assert.equal(Island.activities.length, 1);
  assert.equal(Island.presentation, 'compact');
});

check('句柄的 update/end 只作用于自己那条活动', () => {
  const Island = loadIsland();
  Island.mount({});
  const first = Island.start(mk('a'));
  Island.start(mk('b'));
  first.end();
  sameShape(Island.activities.map(a => a.id), ['b']);
  first.end();                                  // 已结束再结束必须无害
  assert.equal(Island.activities.length, 1);
});

check('两条活动 -> 分裂，priority 高者占主胶囊', () => {
  const Island = loadIsland();
  Island.mount({});
  Island.start({ ...mk('progress'), group: 'reading', priority: 0 });
  Island.start({ ...mk('timer'), group: 'focus', priority: 1 });
  assert.equal(Island.presentation, 'minimal');
  sameShape(Island.activities.map(a => a.id), ['timer', 'progress']);
});

check('同 group 一次只显示一条，先开始的显示', () => {
  const Island = loadIsland();
  Island.mount({});
  Island.start({ ...mk('run1'), group: 'runs' });
  Island.start({ ...mk('run2'), group: 'runs' });
  assert.equal(Island.presentation, 'compact');
  assert.equal(Island.activities[0].id, 'run1');
  assert.equal(Island.activities.length, 1, '在显的同组活动只有一条');
  assert.equal(Island.internals.allActivities().length, 2, '隐藏的那条仍在栈里');
});

check('update 深合并只覆盖给定槽', () => {
  const Island = loadIsland();
  Island.mount({});
  const h = Island.start(mk('a'));
  h.update({ compact: { trailing: { text: '47%' } } });
  sameShape(Island.activities[0].content.compact, { leading: { text: 'La' }, trailing: { text: '47%' } });
  h.update({ label: '本章阅读进度 47%' });
  assert.equal(Island.activities[0].label, '本章阅读进度 47%');
  h.update({ expanded: { bottom: { bar: 0.47 } } });
  sameShape(Island.activities[0].content.expanded, { center: { text: 'Ea' }, bottom: { bar: 0.47 } });
});

check('crossfade 更新换 revision，普通更新不换', () => {
  const Island = loadIsland();
  Island.mount({});
  const h = Island.start(mk('a'));
  assert.equal(Island.activities[0].revision, 0);
  h.update({ compact: { trailing: { text: '2' } } });
  assert.equal(Island.activities[0].revision, 0, '同一内容的更新不该换脸');
  h.update({ transition: 'crossfade', compact: { trailing: { text: '第三章' } } });
  assert.equal(Island.activities[0].revision, 1, '换内容必须 bump revision，渲染层据此替换图层');
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
  sameShape(Island.activities, []);
});

check('分裂态的读屏标签把两条并列（store.ts 的 `${first}, ${second}`）', () => {
  const Island = loadIsland();
  Island.mount({});
  Island.start({ id: 'timer', group: 'focus', priority: 1, label: '专注剩余 24 分 58 秒', compact: { trailing: { text: '24:58' } } });
  Island.start({ id: 'progress', group: 'reading', priority: 0, label: '本章 43%', compact: { trailing: { text: '43%' } } });
  assert.equal(Island.internals.scene().label, '专注剩余 24 分 58 秒, 本章 43%');
  Island.expand('progress');
  assert.equal(Island.internals.scene().label, '本章 43%', '展开单条时只念那一条');
});

check('expand 一条隐藏的同组活动会把它顶到前面', () => {
  const Island = loadIsland();
  Island.mount({});
  Island.start({ ...mk('run1'), group: 'runs' });
  Island.start({ ...mk('run2'), group: 'runs' });
  Island.expand('run2');
  assert.equal(Island.presentation, 'expanded');
  assert.equal(Island.activities[0].id, 'run2');
});

check('主活动次序：priority 优先，其次先开始', () => {
  const Island = loadIsland();
  Island.mount({});
  Island.start({ id: 'low', label: 'low', priority: 0, compact: { trailing: { text: 'a' } } });
  Island.start({ id: 'mid', label: 'mid', priority: 5, compact: { trailing: { text: 'b' } } });
  Island.start({ id: 'high', label: 'high', priority: 9, compact: { trailing: { text: 'c' } } });
  Island.start({ id: 'mid2', label: 'mid2', priority: 5, compact: { trailing: { text: 'd' } } });
  sameShape(Island.activities.map(a => a.id), ['high', 'mid', 'mid2', 'low']);
});

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

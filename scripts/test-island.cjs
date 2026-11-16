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

/* 在最小沙箱里加载引擎，返回 window.Island。无 DOM 也必须成功。
   要测真渲染路径就把 DOM 桩作为沙箱全局传进去——引擎跑在 vm 里，
   它看到的 document 是沙箱的全局，不是外层 realm 的 globalThis。 */
function loadIsland(globals) {
  const sandbox = Object.assign({ window: {}, console }, globals || {});
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

/* 假时钟环境：advance 以 1/60 秒步进，最后一帧正好停在目标时刻，
   这样 5.975 这类边界不会因浮点误差差一帧。 */
function rig(options) {
  const Island = loadIsland();
  let now = 0;
  Island.internals.setClock(() => now);
  // root 用裸对象（无 appendChild）走 headless，options 才是配置所在
  Island.mount({}, Object.assign({}, options || {}));
  const advance = seconds => {
    const target = now + seconds;
    while (now < target) { now = Math.min(target, now + 1 / 60); Island.internals.tick(now); }
  };
  return { Island, advance };
}
const trailingText = Island => {
  const a = Island.activities[0];
  return a && a.content.compact && a.content.compact.trailing ? a.content.compact.trailing.text : null;
};

check('alerting update：先用旧内容立即展开，0.12s 换上新内容，5.975s 后回落', () => {
  const { Island, advance } = rig();
  Island.start({ id: 'a', label: 'A', compact: { trailing: { text: '1' } } });
  Island.update('a', { alert: true, compact: { trailing: { text: '2' } } });
  // 上游语义（motion.ts 的 alertContentDelay 注释）：展开用的是**旧**内容，
  // 新内容 0.12s 后就地换上。反过来会让岛上先闪一次空槽。
  assert.equal(Island.presentation, 'expanded', 'alert 立刻展开');
  assert.equal(trailingText(Island), '1', '展开的第一帧还是旧内容');
  advance(0.2);
  assert.equal(trailingText(Island), '2', '内容延迟之后才换');
  assert.equal(Island.presentation, 'expanded');
  advance(5.7);
  assert.equal(Island.presentation, 'expanded', 'hold 未到不回落');
  advance(0.3);
  assert.equal(Island.presentation, 'compact', 'hold 到点回落');
});

check('idle 上的 alert 以 expanded 出场，并按 alertHoldIdle 回落', () => {
  const { Island, advance } = rig();
  Island.start({ id: 'a', label: 'A', alert: true, compact: { trailing: { text: '1' } }, expanded: { center: { text: '完成' } } });
  assert.equal(Island.presentation, 'expanded', 'idle 岛的 alert 直接以展开出场');
  advance(5.9);
  assert.equal(Island.presentation, 'expanded', 'alertHoldIdle 5.969 还没到');
  advance(0.1);
  // 提醒回落只收起展开面，活动本身还在栈里 —— 结束活动是调用方的事（上游
  // upload 预设就是这么做的：alert 之后另起一个 7s 定时器再 end）。
  assert.equal(Island.presentation, 'compact', '回落到该活动自己的胶囊');
  Island.end('a');
  assert.equal(Island.presentation, 'idle');
});

check('alert 期间结束活动不会留下过期的回落定时器', () => {
  const { Island, advance } = rig();
  Island.start({ id: 'a', label: 'A', alert: true, compact: { trailing: { text: '1' } }, expanded: { center: { text: 'x' } } });
  Island.end('a');
  assert.equal(Island.presentation, 'idle');
  advance(8);
  assert.equal(Island.presentation, 'idle', '已消失的活动不该再把岛展开');
});

check('长按 0.216s 才展开；短按不展开', () => {
  const { Island, advance } = rig();
  Island.start({ id: 'a', label: 'A', compact: { trailing: { text: '1' } }, expanded: { center: { text: 'X' } } });
  Island.press('hold');
  advance(0.1);
  assert.equal(Island.presentation, 'compact', '还没到阈值');
  advance(0.15);
  assert.equal(Island.presentation, 'expanded', '越过 0.216s 阈值');
  Island.release();
  Island.collapse();
  Island.press('tap');
  advance(0.5);
  assert.equal(Island.presentation, 'compact', '点按不展开');
});

check('点按触发 onPress，长按不触发', () => {
  const { Island, advance } = rig();
  const seen = [];
  Island.start({ id: 'a', label: 'A', onPress: () => seen.push('tap'), compact: { trailing: { text: '1' } }, expanded: { center: { text: 'X' } } });
  Island.press('tap');
  sameShape(seen, ['tap']);
  Island.press('hold');
  advance(0.3);
  Island.release();
  sameShape(seen, ['tap'], '长按只展开，不该同时触发 onPress');
});

check('外部点击与 Escape 收合', () => {
  const { Island } = rig();
  Island.start({ id: 'a', label: 'A', compact: { trailing: { text: '1' } }, expanded: { center: { text: 'X' } } });
  Island.expand('a');
  assert.equal(Island.presentation, 'expanded');
  Island.internals.outsidePress();
  assert.equal(Island.presentation, 'compact');
  Island.expand('a');
  Island.internals.keyEscape();
  assert.equal(Island.presentation, 'compact');
});

check('减动效：约 0.2s 收敛且全程不过冲', () => {
  const { Island, advance } = rig({ reducedMotion: true });
  Island.start({ id: 'a', label: 'A', compact: { leading: { glyph: 'bookmark' }, trailing: { text: '43%' } } });
  advance(0.3);
  const geometry = Island.internals.currentGeometry();
  assert.equal(geometry.settled, true, `未收敛：${JSON.stringify(geometry)}`);
  assert.equal(geometry.overshot, false, '减动效不得过冲');
  Island.expand('a');
  advance(0.3);
  assert.equal(Island.internals.currentGeometry().settled, true, '展开也必须已收敛');
  assert.equal(Island.internals.currentGeometry().overshot, false);
});

check('正常动效下宽度弹簧确实过冲（证明过冲检测不是恒假）', () => {
  const { Island, advance } = rig();
  Island.start({ id: 'a', label: 'A', compact: { leading: { glyph: 'bookmark' }, trailing: { text: '43%' } } });
  let overshot = false;
  for (let i = 0; i < 40; i += 1) { advance(1 / 60); if (Island.internals.currentGeometry().overshot) overshot = true; }
  assert.equal(overshot, true, 'appear 弹簧的 8.35% 过冲必须能被观察到');
});

check('currentGeometry 给出可直接画 path 的盒尺寸', () => {
  const { Island, advance } = rig();
  Island.start({ id: 'a', label: 'A', compact: { leading: { glyph: 'bookmark' }, trailing: { text: '43%' } } });
  advance(1.5);
  const geometry = Island.internals.currentGeometry();
  assert.ok(Math.abs((geometry.right - geometry.left) - 151.1) < 0.6, `静止宽度 ${geometry.right - geometry.left}`);
  assert.ok(Math.abs(geometry.height - 36.85) < 0.01, `高度 ${geometry.height}`);
  assert.ok(Math.abs(geometry.top - 13.91) < 0.01);
  assert.equal(geometry.kind, 'compact');
  assert.equal(geometry.bubbleHeight, 0);
});

/* 手写最小 DOM（沿用 test-exercise-ui-harness.cjs 的思路，不引 jsdom）。
   只实现引擎真正用到的能力；appendChild 必须存在，mount 用它区分真 DOM 与
   headless。offsetWidth 可写，供槽位实测的测试设置宽度。 */
function makeElement(tag) {
  const classes = new Set();
  const el = {
    tag, children: [], attrs: {}, dataset: {}, style: {}, listeners: {},
    textContent: '', hidden: false, offsetWidth: 0, offsetHeight: 0,
    classList: {
      add: (...names) => names.forEach(n => classes.add(n)),
      remove: (...names) => names.forEach(n => classes.delete(n)),
      toggle: (n, on) => (on ? classes.add(n) : classes.delete(n)),
      contains: n => classes.has(n)
    }
  };
  Object.defineProperty(el, 'className', {
    get: () => [...classes].join(' '),
    set: value => { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(n => classes.add(n)); }
  });
  el.append = (...kids) => kids.forEach(kid => el.children.push(kid));
  el.appendChild = kid => { el.children.push(kid); return kid; };
  el.setAttribute = (k, v) => {
    el.attrs[k] = String(v);
    if (k === 'class') el.className = v;
  };
  el.getAttribute = k => (k in el.attrs ? el.attrs[k] : null);
  el.addEventListener = (k, fn) => { (el.listeners[k] = el.listeners[k] || []).push(fn); };
  el.querySelector = selector => findAll(el, selector)[0] || null;
  el.querySelectorAll = selector => findAll(el, selector);
  el.remove = () => {};
  el.focus = () => {};
  return el;
}
function findAll(el, selector, out = []) {
  for (const kid of el.children || []) {
    if (matches(kid, selector)) out.push(kid);
    findAll(kid, selector, out);
  }
  return out;
}
function matches(el, selector) {
  if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));
  if (selector.startsWith('[')) {
    const name = selector.slice(1, -1).split('=')[0];
    return el.attrs[name] !== undefined;
  }
  return el.tag === selector;
}
function makeDocument() {
  return {
    createElement: makeElement,
    createElementNS: (ns, tag) => makeElement(tag),
    documentElement: makeElement('html'),
    body: makeElement('body'),
    addEventListener() {},
    querySelector: () => null
  };
}

/* 真 DOM 路径：mount 拿到带 appendChild 的节点，于是建结构、起帧循环。 */
function mountWithDom(options) {
  const document = makeDocument();
  const root = makeElement('div');
  const Island = loadIsland({
    document,
    getComputedStyle: () => ({ getPropertyValue: () => ' #ffffff ' }),
    matchMedia: () => ({ matches: false, addEventListener() {} })
  });
  let now = 0;
  Island.mount(root, Object.assign({ clock: () => now }, options || {}));
  const advance = seconds => {
    const target = now + seconds;
    while (now < target) { now = Math.min(target, now + 1 / 60); Island.internals.tick(now); }
  };
  return { Island, root, document, advance, rendered: () => root };
}
const findDeep = (el, selector) => (el && el.querySelector ? el.querySelector(selector) : null);
const keylineOf = root => findDeep(root, '.island-keyline');
const count = (el, selector) => findAll(el, selector).length;
function fire(el, kind, init) {
  (el.listeners[kind] || []).forEach(fn => fn(Object.assign({ preventDefault() {}, stopPropagation() {}, target: el, key: '' }, init || {})));
}

check('mount 出可聚焦胶囊 + SVG 形状 + 内容层', () => {
  const { Island, root } = mountWithDom({ backdrop: '#ffffff' });
  assert.equal(Island.enabled, true, '有真 DOM 就必须启用');
  assert.ok(findDeep(root, 'svg'), '没有 svg 形状层');
  assert.ok(findDeep(root, '.island-fill'), '没有填充 path');
  const pill = findDeep(root, 'button');
  assert.ok(pill, '胶囊必须是可聚焦的 button');
  assert.equal(pill.attrs.type, 'button', '别把表单默认行为带进来');
  assert.equal(pill.attrs['aria-expanded'], 'false');
  assert.ok(findDeep(root, '.island-live'), '需要一条读屏播报');
  const keyline = keylineOf(root);
  assert.ok(!keyline || keyline.attrs['stroke-opacity'] === undefined || Number(keyline.attrs['stroke-opacity']) === 0,
    '浅色页不画 keyline');
});

check('胶囊的读屏名来自活动 label，分裂时并列', () => {
  const { Island, root } = mountWithDom();
  Island.start({ id: 'p', label: '本章阅读进度 43%', compact: { trailing: { text: '43%' } } });
  Island.internals.tick(0.1);
  assert.match(findDeep(root, 'button').attrs['aria-label'], /43%/);
  Island.start({ id: 't', label: '专注剩余 24 分 58 秒', group: 'focus', priority: 1, compact: { trailing: { text: '24:58' } } });
  Island.internals.tick(0.2);
  assert.match(findDeep(root, 'button').attrs['aria-label'], /专注剩余 24 分 58 秒, 本章阅读进度 43%/);
});

check('七个内容原子各自出 DOM', () => {
  const atoms = [
    ['glyph', { glyph: 'bookmark' }, '.island-glyph'],
    ['text', { text: '43%' }, '.island-text'],
    ['ring', { ring: 0.43 }, '.island-ring'],
    ['bar', { bar: 0.43 }, '.island-bar'],
    ['label', { label: '专注' }, '.island-label'],
    ['time', { time: 25000, format: 'mm:ss' }, '.island-time']
  ];
  const { Island, root, advance } = mountWithDom();
  atoms.forEach(([name, spec, selector], i) => {
    Island.start({ id: 'atom' + i, label: name, compact: { leading: spec } });
    advance(1 / 60);
    assert.ok(count(root, selector) >= 1, `原子 ${name} 什么都没画`);
    Island.end('atom' + i);
    advance(1 / 60);
  });
  Island.start({
    id: 'btn', label: '按钮',
    expanded: { bottom: { buttons: [{ key: 'pause', label: '暂停' }, { key: 'end', label: '结束' }] } }
  });
  Island.expand('btn');
  Island.internals.tick(0.2);
  assert.ok(count(root, '.island-btn') >= 2, `展开面里没有按钮：${count(root, '.island-btn')}`);
});

check('按钮点击回调带 key，岛不猜语义', () => {
  const { Island, root } = mountWithDom();
  const seen = [];
  Island.start({
    id: 'btn', label: 'b',
    expanded: { bottom: { buttons: [{ key: 'pause', label: '暂停', onPress: k => seen.push(k) }] } }
  });
  Island.expand('btn');
  Island.internals.tick(0.2);
  fire(findDeep(root, '.island-btn'), 'click');
  sameShape(seen, ['pause']);
});

check('帧循环把弹簧写进 d 与命中盒，而不是任何布局属性', () => {
  const { Island, root, advance } = mountWithDom();
  Island.start({ id: 'p', label: 'p', compact: { leading: { glyph: 'bookmark' }, trailing: { text: '43%' } } });
  advance(1.5);
  const fill = findDeep(root, '.island-fill');
  assert.ok(fill.attrs.d.length > 100, 'path d 必须是完整的形变路径');
  for (const key of ['width', 'height', 'x', 'y', 'style']) {
    assert.equal(fill.attrs[key], undefined, `path 上不该有 ${key}`);
  }
  const pill = findDeep(root, 'button');
  for (const key of ['width', 'height', 'top', 'left']) {
    assert.equal(pill.attrs[key], undefined, '命中区走 style，不用属性');
  }
  // 命中区必须与画出来的形状一致，否则点得到却看不见（或反之）
  const points = pathPoints(fill.attrs.d);
  const drawn = Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x));
  const hit = parseFloat(pill.style.width);
  assert.ok(Math.abs(drawn - hit) < 0.5, `画出来 ${drawn}px 而可点 ${hit}px`);
  assert.ok(Math.abs(hit - 150.9) < 1.2, `静止胶囊宽应约 151px，实测 ${hit}`);
});

check('形状随帧变化：从 idle 长到紧凑的过程中 d 一直在改', () => {
  const { Island, root, advance } = mountWithDom();
  const before = findDeep(root, '.island-fill').attrs.d;
  Island.start({ id: 'p', label: 'p', compact: { leading: { glyph: 'bookmark' }, trailing: { text: '43%' } } });
  advance(0.2);
  const mid = findDeep(root, '.island-fill').attrs.d;
  advance(1.4);
  const after = findDeep(root, '.island-fill').attrs.d;
  assert.notEqual(mid, before, '弹簧没驱动到路径上');
  assert.notEqual(after, mid, '中途就没再更新');
  assert.notEqual(after, before);
});

check('分裂时副胶囊出现，收起时隐藏', () => {
  const { Island, root, advance } = mountWithDom();
  Island.start({ id: 'p', label: 'p', group: 'reading', compact: { leading: { glyph: 'bookmark' }, trailing: { text: '43%' } } });
  advance(1);
  assert.equal(findDeep(root, '.island-bubble').hidden, true, '单活动不该有副胶囊');
  Island.start({ id: 't', label: 't', group: 'focus', priority: 1, compact: { leading: { glyph: 'lotus' }, trailing: { text: '24:58' } } });
  advance(1);
  assert.equal(findDeep(root, '.island-bubble').hidden, false, '两条活动必须画出副胶囊');
  Island.end('t');
  advance(1);
  assert.equal(findDeep(root, '.island-bubble').hidden, true);
});

check('键盘与外部点击接到收合/展开', () => {
  const { Island, root } = mountWithDom();
  Island.start({ id: 'a', label: 'a', compact: { trailing: { text: '1' } }, expanded: { center: { text: 'X' } } });
  const pill = findDeep(root, 'button');
  fire(pill, 'keydown', { key: 'Enter' });
  Island.internals.tick(0.1);
  assert.equal(Island.presentation, 'expanded', 'Enter 该展开');
  assert.equal(pill.attrs['aria-expanded'], 'true');
  fire(pill, 'keydown', { key: 'Escape' });
  Island.internals.tick(0.1);
  assert.notEqual(Island.presentation, 'expanded', 'Escape 该收合');
});

check('index.html 装配岛且不破 eager 白名单', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="stylesheet" href="assets\/island\.css\?v=[0-9a-f]{12}">/);
  assert.match(html, /<script defer src="assets\/island\.js\?v=[0-9a-f]{12}"><\/script>/);
  assert.match(html, /<div id="islandRoot"><\/div>/);
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
  const eager = [...html.matchAll(/<script(?![^>]*\bdefer\b)[^>]*\ssrc="([^"]+)"/g)].map(m => m[1].split('?')[0]);
  assert.ok(scripts.some(s => s.startsWith('assets/island.js')), 'island.js 没被引用');
  assert.deepEqual(eager.sort(), ['assets/content.js', 'assets/i18n.js', 'assets/locale/zh.js'],
    '岛必须 defer：首页只允许三个必要脚本先跑');
});

check('island.css 压住 header、只在阅读视图出现、打印时消失', () => {
  const css = read('assets/island.css');
  assert.match(css, /--island-z:\s*60/);
  assert.match(css, /--island-top:\s*13\.91px/);
  assert.match(css, /#islandRoot\s*\{[^}]*position:\s*fixed/);
  assert.match(css, /#islandRoot\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css, /\.island-pill[^{]*\{[^}]*pointer-events:\s*auto/s);
  assert.match(css, /body\[data-view="reader"\] #islandRoot\s*\{\s*display:\s*block/);
  assert.match(css, /@media print\s*\{\s*#islandRoot\s*\{\s*display:\s*none;?\s*\}\s*\}/);
});

check('岛内不声明 transition，也不引任何外部资源', () => {
  const css = read('assets/island.css'), js = read('assets/island.js');
  // 时长全部由 JS 弹簧逐帧积分；这里出现 transition 就等于两套时钟打架。
  assert.equal((css.match(/transition:/g) || []).length, 0, 'island.css 里不该有 transition');
  assert.equal((css.match(/animation:/g) || []).length, 0, 'island.css 里不该有 animation');
  for (const bad of ['@import', '@font-face', 'url(', 'src="http', 'href="http', 'fetch(', 'XMLHttpRequest']) {
    assert.ok(!css.includes(bad), `island.css 出现外部依赖 ${bad}`);
    assert.ok(!js.includes(bad), `island.js 出现外部依赖 ${bad}`);
  }
  // SVG 命名空间是 XML 标识符，不是网络地址：它必须存在且仅此一处。
  assert.equal((js.match(/http:\/\/www\.w3\.org\/2000\/svg/g) || []).length, 1, 'SVG 命名空间应只声明一次');
});

/* focus.js 的运行环境：假时钟 + 内存存储 + 记录调用的岛桩。
   Date 被换成继承原生 Date 的假类，所以 focus.js 里的 toLocaleDateString /
   getFullYear 等仍然按真语义工作，只是"现在"由测试控制。 */
function focusRig(config) {
  const options = config || {};
  let now = options.now0 === undefined ? 1763300000000 : options.now0;
  const memory = new Map(Object.entries(options.store || {}));
  const storage = options.readonly
    ? { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } }
    : {
      getItem: key => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => { memory.set(key, value); },
      removeItem: key => { memory.delete(key); }
    };
  const calls = [];
  const handles = {};
  const island = {
    mount: () => {},
    start: spec => {
      calls.push(['start', spec.id, spec]);
      const handle = {
        id: spec.id,
        update: partial => calls.push(['update', spec.id, partial]),
        end: () => { calls.push(['end', spec.id]); delete handles[spec.id]; }
      };
      handles[spec.id] = handle;
      return handle;
    },
    update: (id, partial) => calls.push(['update', id, partial]),
    end: id => { calls.push(['end', id]); delete handles[id]; }
  };
  class FakeDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(now); }
    static now() { return now; }
  }
  const sandbox = { window: {}, console, Date: FakeDate, performance: { now: () => now } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('assets/focus.js'), sandbox, { filename: 'assets/focus.js' });
  const F = sandbox.window.FocusTimer;
  F.init({ now: () => now, storage, island, t: key => key, locale: () => 'zh-CN' });
  const set = value => { now = value; };
  const advance = ms => { now += ms; F.tick(); };
  const findCall = (op, id) => calls.find(c => c[0] === op && c[1] === id);
  return {
    F, set, advance, now: () => now, calls, island, handles, findCall,
    saved: () => (memory.has('ms-cookbook-focus') ? JSON.parse(memory.get('ms-cookbook-focus')) : null),
    raw: key => (memory.has(key) ? memory.get(key) : null)
  };
}
const MINUTE = 60_000;

check('start 起 25:00 倒计时并注册 focus-timer 活动', () => {
  const rig = focusRig();
  rig.F.start(25 * MINUTE);
  const snap = rig.F.snapshot();
  assert.equal(snap.phase, 'running');
  assert.equal(snap.remainingMs, 25 * MINUTE);
  assert.equal(snap.targetMs, 25 * MINUTE);
  const start = rig.findCall('start', 'focus-timer');
  assert.ok(start, '没有注册 focus-timer 活动');
  assert.equal(start[2].group, 'focus');
  assert.equal(start[2].priority, 1, '倒计时必须是主活动，才能占住主胶囊');
});

check('墙钟推进：remaining 由时钟差算出，不靠 tick 累加', () => {
  const rig = focusRig();
  rig.F.start(25 * MINUTE);
  rig.advance(61_000);                    // 一次跳 61 秒：后台标签页限流也准
  assert.equal(rig.F.snapshot().remainingMs, 25 * MINUTE - 61_000);
  rig.advance(5 * MINUTE);                // 中间不 tick，再来一次大跳
  assert.equal(rig.F.snapshot().remainingMs, 25 * MINUTE - 61_000 - 5 * MINUTE);
});

check('暂停冻结时长、继续接上、+5 延长', () => {
  const rig = focusRig();
  rig.F.start(25 * MINUTE);
  rig.advance(10_000);
  rig.F.pause();
  assert.equal(rig.F.snapshot().phase, 'paused');
  rig.advance(5 * MINUTE);                // 暂停期间走的墙钟不计
  assert.equal(rig.F.snapshot().remainingMs, 25 * MINUTE - 10_000);
  rig.F.resume();
  assert.equal(rig.F.snapshot().remainingMs, 25 * MINUTE - 10_000);
  rig.advance(1_000);
  assert.equal(rig.F.snapshot().remainingMs, 25 * MINUTE - 11_000);
  rig.F.extend(5 * MINUTE);
  assert.equal(rig.F.snapshot().remainingMs, 25 * MINUTE - 11_000 + 5 * MINUTE);
  assert.equal(rig.F.snapshot().targetMs, 30 * MINUTE);
});

check('到点：记一次完整会话、今日累计增加、alert 报时长，7 秒后活动结束', () => {
  const rig = focusRig();
  rig.F.start(25 * MINUTE);
  rig.advance(25 * MINUTE + 1);
  let snap = rig.F.snapshot();
  assert.equal(snap.phase, 'complete');
  assert.equal(snap.todayMs, 25 * MINUTE);
  const alert = rig.findCall('update', 'focus-timer');
  assert.ok(alert && alert[2].alert === true, '完成必须以 alert 汇报');
  const saved = rig.saved();
  assert.equal(saved.sessions.length, 1);
  assert.equal(saved.sessions[0].ms, 25 * MINUTE);
  rig.advance(6_000);
  assert.equal(rig.F.snapshot().phase, 'complete', '7s 之前活动还在，读者来得及看');
  rig.advance(1_500);
  assert.equal(rig.F.snapshot().phase, 'none');
  assert.ok(rig.findCall('end', 'focus-timer'), '提醒之后必须结束活动');
});

check('提前结束：按实际专注时长记录，并以 alert 汇报后收起', () => {
  const rig = focusRig();
  rig.F.start(25 * MINUTE);
  rig.advance(4 * MINUTE);
  rig.F.stop();
  assert.equal(rig.F.snapshot().todayMs, 4 * MINUTE, '累计当场就记上了');
  assert.equal(rig.F.snapshot().phase, 'complete', '结束也是一次汇报，先展开再收');
  assert.equal(rig.saved().sessions[0].ms, 4 * MINUTE);
  rig.advance(7_500);
  assert.equal(rig.F.snapshot().phase, 'none');
  assert.ok(rig.findCall('end', 'focus-ended'), '汇报结束后必须收掉活动');
});

check('时钟回拨不倒扣，也不误判成完成', () => {
  const rig = focusRig();
  rig.F.start(25 * MINUTE);
  rig.set(rig.now() - 10 * MINUTE);
  assert.equal(rig.F.snapshot().remainingMs, 25 * MINUTE, 'remaining 必须夹在 [0, target]');
  rig.F.tick();
  assert.equal(rig.F.snapshot().phase, 'running', '不能因为时间往回走就宣布结束');
});

check('跨日归零，明细封顶 30 条', () => {
  const rig = focusRig();
  rig.F.start(25 * MINUTE);
  rig.advance(25 * MINUTE + 1);
  rig.advance(8_000);
  assert.equal(rig.F.snapshot().todayMs, 25 * MINUTE);
  rig.set(rig.now() + 25 * MINUTE * 60);        // 第二天
  assert.equal(rig.F.snapshot().todayMs, 0, '跨日必须归零');
  for (let i = 0; i < 40; i += 1) {
    rig.F.start(25 * MINUTE);
    rig.advance(25 * MINUTE + 1);
    rig.advance(8_000);
  }
  assert.ok(rig.saved().sessions.length <= 30, `明细未被截断：${rig.saved().sessions.length}`);
});

check('存储损坏或不可写都不影响会话', () => {
  const broken = focusRig({ store: { 'ms-cookbook-focus': '{not json' } });
  assert.equal(broken.F.snapshot().todayMs, 0);
  broken.F.start(25 * MINUTE);
  assert.equal(broken.F.snapshot().phase, 'running');

  const wrong = focusRig({ store: { 'ms-cookbook-focus': JSON.stringify({ date: 'x', totalMs: 'abc', sessions: [{ ms: 'no' }, { ms: 5, endedAt: 1 }] }) } });
  assert.equal(wrong.F.snapshot().todayMs, 0, '字段类型不符要整体回退默认，不逐字段猜');

  const readonly = focusRig({ readonly: true });
  readonly.F.start(25 * MINUTE);
  assert.equal(readonly.F.snapshot().phase, 'running', '存储被拒绝时会话照跑');
  readonly.advance(25 * MINUTE + 1);
  assert.equal(readonly.F.snapshot().phase, 'complete', '完成照常');
  assert.equal(readonly.F.snapshot().todayMs, 25 * MINUTE, '累计只存在于内存');
});

check('刷新后按墙钟恢复进行中的会话', () => {
  const rig = focusRig();
  rig.F.start(25 * MINUTE);
  rig.advance(MINUTE);
  const saved = rig.saved();
  assert.ok(saved.active, '进行中的会话必须落盘');
  const rig2 = focusRig({ now0: rig.now(), store: { 'ms-cookbook-focus': JSON.stringify(saved) } });
  rig2.F.restore();
  assert.equal(rig2.F.snapshot().phase, 'running');
  assert.equal(rig2.F.snapshot().remainingMs, 24 * MINUTE);
  assert.ok(rig2.findCall('start', 'focus-timer'), '恢复时要把活动重新挂上');
});

check('超过一天的 active 不再恢复（与跨日归零分开的两道闸）', () => {
  const rig = focusRig();
  rig.F.start(25 * MINUTE);
  const saved = rig.saved();
  const later = rig.now() + 25 * 60 * MINUTE;
  const localDate = ms => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  saved.date = localDate(later);            // 让"日期是今天"这一关通过，只测 savedAt 那道
  const stale = focusRig({ now0: later, store: { 'ms-cookbook-focus': JSON.stringify(saved) } });
  stale.F.restore();
  assert.equal(stale.F.snapshot().phase, 'none');
});

check('storage 事件让另一个标签页的累计可见', () => {
  const memory = {};
  const rig = focusRig({ store: memory });
  rig.F.start(25 * MINUTE);
  rig.advance(25 * MINUTE + 1);
  rig.advance(8_000);
  const other = JSON.parse(JSON.stringify(rig.saved()));
  other.totalMs += 10 * MINUTE;
  other.sessions.push({ endedAt: rig.now(), ms: 10 * MINUTE });
  rig.F.onExternalWrite(JSON.stringify(other));           // 模拟 storage 事件
  assert.equal(rig.F.snapshot().todayMs, 25 * MINUTE + 10 * MINUTE);
});

check('reading.js 在算好 percent 处广播进度事件', () => {
  const js = read('assets/reading.js');
  assert.match(js, /purplebook:progress/);
  assert.ok(js.indexOf("$('#readingPercent').textContent") < js.indexOf('purplebook:progress'),
    '广播必须在 percent 已经算出之后，否则岛要自己再测一遍');
  assert.equal((js.match(/purplebook:progress/g) || []).length, 1, '只允许一个广播点');
});

check('阅读工具条里有「专注计时」按钮，且与视觉专注分开', () => {
  const html = read('index.html');
  const tools = html.match(/<div class="reading-tools"[\s\S]*?<\/div>/)[0];
  assert.match(tools, /id="focusTimerButton"/);
  assert.match(tools, /data-i18n="reader\.focusTimer"/);
  assert.match(tools, /aria-pressed="false"/);
  assert.ok(tools.indexOf('id="focusReading"') < tools.indexOf('id="focusTimerButton"'),
    '两个开关并排，但必须是两个 id');
  assert.match(html, /<script defer src="assets\/focus\.js\?v=[0-9a-f]{12}"><\/script>/);
});

check('focus.js 不接管视觉专注模式', () => {
  const js = read('assets/focus.js');
  assert.ok(!/body\.dataset\.focus\s*=/.test(js), 'focus.js 写 body.dataset.focus 会抢掉「专注阅读」开关');
  assert.match(js, /body\.dataset\.focusTimer\s*=/);
});

check('三语 island.* 键集合完全一致', () => {
  const keysOf = file => [...read(file).matchAll(/'(island\.[A-Za-z0-9_]+)'\s*:/g)].map(m => m[1]);
  const zh = new Set(keysOf('assets/locale/zh.js'));
  assert.ok(zh.size >= 14, `zh 只有 ${zh.size} 个 island 键`);
  for (const file of ['assets/locale/en.js', 'assets/locale/es.js']) {
    const other = new Set(keysOf(file));
    for (const key of zh) assert.ok(other.has(key), `${key} 在 ${file} 里缺失`);
    for (const key of other) assert.ok(zh.has(key), `${key} 只存在于 ${file}`);
  }
  for (const file of ['assets/locale/zh.js', 'assets/locale/en.js', 'assets/locale/es.js']) {
    assert.match(read(file), /'reader\.focusTimer'\s*:/, `${file} 缺 reader.focusTimer`);
  }
});

check('占位符三语齐备：文案里用的变量必须真的传得进去', () => {
  const files = ['assets/locale/zh.js', 'assets/locale/en.js', 'assets/locale/es.js'];
  const varsOf = (text, key) => {
    const line = text.match(new RegExp(`'${key}':\\s*'([^']*)'`));
    assert.ok(line, `${key} 不在 ${text.slice(0, 40)}…`);
    return [...line[1].matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  };
  for (const key of ['island.readingLabel', 'island.focusLabel', 'island.today', 'island.doneBody', 'island.stoppedBody']) {
    const expected = varsOf(read(files[0]), key);
    files.forEach(file => assert.deepEqual(varsOf(read(file), key), expected, `${key} 的占位符在 ${file} 里不一致`));
  }
  const focus = read('assets/focus.js');
  assert.match(focus, /t\('island\.doneBody',\s*\{\s*time[^}]*today[^}]*\}\)/, 'doneBody 需要 time 与 today 两个变量');
});

check('岛缺席时专注会话仍能跑：boot 早退，不抛', () => {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // 没有 document：boot() 必须直接返回
  vm.runInContext(read('assets/focus.js'), sandbox, { filename: 'assets/focus.js' });
  assert.ok(sandbox.window.FocusTimer, '没有页面也不该挡住模块加载');
  sandbox.window.FocusTimer.init({ storage: null, island: null, t: k => k });
  sandbox.window.FocusTimer.start(25 * MINUTE);
  assert.equal(sandbox.window.FocusTimer.snapshot().phase, 'running');
});

check('进度活动注册为 reading/0，数字直接上屏', () => {
  const rig = focusRig();
  rig.F.progressFrom({ percent: 43, chapter: 'chapter-7' });
  const start = rig.findCall('start', 'reading-progress');
  assert.ok(start, '没有注册 reading-progress 活动');
  assert.equal(start[2].group, 'reading');
  assert.equal(start[2].priority, 0, '倒计时才是主活动，进度进副胶囊');
  assert.equal(start[2].compact.trailing.text, '43%');
  assert.equal(start[2].minimal.bubble.ring, 0.43, '副胶囊用环而不是字');
  rig.F.progressFrom({ percent: 47, chapter: 'chapter-7' });
  const update = rig.calls.filter(c => c[0] === 'update' && c[1] === 'reading-progress');
  assert.equal(update.length, 1, '第二次必须是 update 而不是重复 start');
  assert.equal(update[0][2].compact.trailing.text, '47%');
});

check('语言切换重发两条活动的文案', () => {
  const rig = focusRig();
  rig.F.progressFrom({ percent: 30, chapter: 'chapter-7' });
  rig.F.start(25 * MINUTE);
  const before = rig.calls.length;
  rig.F.refreshText();
  assert.ok(rig.calls.length > before, '切语言后必须把文案重新送进岛里');
  const focusUpdate = rig.calls.slice(before).filter(c => c[1] === 'focus-timer');
  assert.ok(focusUpdate.length >= 1, '倒计时活动的文案没重发');
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

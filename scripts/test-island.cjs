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

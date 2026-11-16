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

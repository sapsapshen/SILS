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

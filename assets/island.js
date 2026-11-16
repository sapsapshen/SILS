/* 灵动岛引擎：移植自 islandcn（MIT, copyright (c) 2026 Leo），署名见 NOTICE。
   spring / path / geometry 三节按 docs/reference/islandcn/ 的数学移植；
   motion 只取标定过的弹簧与时长；React 协调层由本文件的固定模板渲染替代。
   加载时不碰 DOM：无 document 时整体降级为禁用态，阅读路径不受影响。 */
(() => {
  'use strict';
  window.Island = { enabled: false };
})();

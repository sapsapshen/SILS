/* 头部语言下拉框：写 ms-cookbook.language 后重载本页。
   与首页共用同一个存储键与三个可选值；外链加载，因为站点 CSP 禁止内联脚本。 */
(function () {
  'use strict';
  var KEY = 'ms-cookbook.language';
  function init() {
    var sel = document.querySelector('.app-header .language-select');
    if (!sel) return;
    try {
      var saved = localStorage.getItem(KEY);
      if (saved) sel.value = saved;
    } catch (e) { /* 存储被禁用时保持默认 */ }
    sel.addEventListener('change', function () {
      try { localStorage.setItem(KEY, sel.value); } catch (e) { /* noop */ }
      location.reload();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

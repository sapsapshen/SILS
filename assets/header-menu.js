/* 全站统一头部菜单开关。
   说明：首页的同一交互实现在 assets/paper.js 里，但 paper.js 是阅读器整包（依赖 #article 等
   DOM），不能直接给静态页引用。这里是从 paper.js 里抽出的等价逻辑（约 20 行），
   不是另造一套交互；行为与首页一致：点「目录」打开、点关闭按钮或点遮罩关闭、Esc 关闭。 */
(function () {
  'use strict';
  function init() {
    var btn = document.getElementById('menuButton');
    var dlg = document.getElementById('siteMenu');
    if (!btn || !dlg) return;

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (typeof dlg.showModal === 'function' && !dlg.open) {
        try { dlg.showModal(); } catch (err) { dlg.setAttribute('open', ''); }
      } else {
        dlg.setAttribute('open', '');
      }
    });

    dlg.addEventListener('click', function (e) {
      var target = e.target;
      // 点关闭按钮
      var closer = target.closest ? target.closest('[data-close]') : null;
      if (closer) { close(); return; }
      // 点遮罩（dialog 自身矩形外）
      if (target === dlg) {
        var r = dlg.getBoundingClientRect();
        var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) close();
      }
    });

    dlg.addEventListener('cancel', function () { /* Esc 由浏览器关闭，无需处理 */ });

    function close() {
      if (typeof dlg.close === 'function' && dlg.open) {
        try { dlg.close(); } catch (err) { dlg.removeAttribute('open'); }
      } else {
        dlg.removeAttribute('open');
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

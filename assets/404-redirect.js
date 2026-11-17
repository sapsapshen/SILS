/* 404 页兜底：地址里带着真实存在的路由 hash 时，送回主站对应页面。
   例：/index.html#chapter-15 曾经会落到「这一页不在书里」，而 chapter-15 实际存在。
   本地 CSP 为 script-src 'self'，所以这里必须是外部文件，不能写内联。 */
(function () {
  var hash = window.location.hash || '';
  if (!hash) return;
  var known = /^#(chapter-\d+|home|contents|paths|practice|contribute)(\/|$)/;
  if (known.test(hash)) {
    window.location.replace('/' + hash);
  }
})();

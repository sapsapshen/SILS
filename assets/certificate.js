/* The certificate is derived from the same progress rows the reader panel
   uses. It is a keepsake: no payment, no exam seats, no official credential. */
(function () {
  'use strict';
  var status = document.querySelector('#certStatus');
  var login = document.querySelector('#certLogin');
  var data = null;
  function t(key) {
    return window.MSI18N && window.MSI18N.t ? window.MSI18N.t(key) : key;
  }
  function render() {
    if (!data) return;
    if (!data.signedIn) {
      status.textContent = t('certificate.signIn');
      login.hidden = false;
    } else if (!data.completed) {
      status.textContent = t('certificate.empty');
      login.hidden = true;
    } else {
      status.textContent = '';
      login.hidden = true;
    }
    document.querySelector('#certName').textContent = data.name || '—';
    document.querySelector('#certProgress').textContent = t('certificate.progressFormat')
      .replace('{completed}', String(data.completed)).replace('{total}', String(data.total));
    document.querySelector('#certChapters').textContent = String(data.chapters);
    document.querySelector('#certDate').textContent = new Date().toLocaleDateString();
    var fill = document.querySelector('#certBarFill');
    fill.style.width = (data.total ? Math.min(100, data.completed * 100 / data.total) : 0) + '%';
  }
  document.querySelector('#certPrint').addEventListener('click', function () { window.print(); });
  fetch('/api/certificate/progress', { credentials: 'same-origin' })
    .then(function (response) { return response.ok ? response.json() : null; })
    .then(function (payload) { data = payload; render(); })
    .catch(function () { status.textContent = t('admin.error'); });
  try {
    if (window.MSI18N && window.MSI18N.on) window.MSI18N.on(render);
  } catch (error) { /* language switch is optional */ }
})();

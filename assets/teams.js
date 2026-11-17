// 企业询价表单。CSP 是 script-src 'self'，所以逻辑必须放在外部文件里。
(function () {
  var form = document.getElementById('leadForm');
  var status = document.getElementById('leadStatus');
  var button = document.getElementById('submitBtn');
  if (!form || !status || !button) return;

  var tSafe = function (key, fallback) {
    try {
      if (window.MSI18N && window.MSI18N.has(key)) return window.MSI18N.t(key);
    } catch (error) { /* fall back to the page's own text */ }
    return fallback;
  };

  function setStatus(text, state) {
    status.textContent = text;
    if (state) status.setAttribute('data-state', state);
    else status.removeAttribute('data-state');
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var data = {
      name: (form.elements.name.value || '').trim(),
      email: (form.elements.email.value || '').trim(),
      org: (form.elements.org.value || '').trim(),
      size: form.elements.size.value || '',
      interest: form.elements.interest.value || 'other',
      note: (form.elements.note.value || '').trim()
    };

    if (!data.name) { setStatus(tSafe('teams.status.nameRequired', '请填写称呼。'), 'error'); form.elements.name.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      setStatus(tSafe('teams.status.emailInvalid', '邮箱格式看起来不对，请检查。'), 'error'); form.elements.email.focus(); return;
    }

    button.disabled = true;
    setStatus(tSafe('teams.status.sending', '正在提交…'), '');

    fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (payload) {
        if (response.ok) {
          setStatus(tSafe('teams.status.sent', '已收到，我们会在 24 小时内用邮件回复你。'), 'success');
          form.reset();
          return;
        }
        var message = (payload && (payload.detail || payload.error)) || tSafe('teams.status.failed', '提交失败，请稍后再试。');
        setStatus(String(message), 'error');
      });
    }).catch(function () {
      setStatus(tSafe('teams.status.network', '网络异常，没能提交。请稍后重试或直接发邮件。'), 'error');
    }).then(function () {
      button.disabled = false;
    });
  });
})();

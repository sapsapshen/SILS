/*
 * Login form controller. Kept in a file rather than inline so the site can
 * enforce `script-src 'self'` without `'unsafe-inline'`.
 */
(() => {
  'use strict';
  const form = document.querySelector('#loginForm');
  const email = document.querySelector('#loginEmail');
  const password = document.querySelector('#loginPassword');
  const submit = document.querySelector('#loginSubmit');
  const status = document.querySelector('#loginStatus');
  const returnTo = new URLSearchParams(location.search).get('return_to') || '#home';
  const t = key => window.MSI18N.t(key);
  const failureKey = {
    401: 'login.badCredentials',
    403: 'login.badOrigin',
    429: 'login.rateLimited',
    503: 'login.unavailable'
  };
  function setStatus(text, state) {
    status.textContent = text;
    status.dataset.state = state || '';
    const invalid = state === 'error' ? 'true' : 'false';
    email.setAttribute('aria-invalid', invalid);
    password.setAttribute('aria-invalid', invalid);
  }
  fetch('/api/session', {credentials: 'same-origin'}).then(response => response.ok ? response.json() : null).then(data => {
    if (!data || !data.oauthLoginEnabled) return;
    const box = document.querySelector('#oauthLogin');
    box.hidden = false;
    box.querySelector('a').href = '/auth/oauth/login?return_to=' + encodeURIComponent(returnTo);
  }).catch(() => {});
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const emailValue = email.value.trim();
    const passwordValue = password.value;
    if (!emailValue || !passwordValue) {
      setStatus(t('login.missing'), 'error');
      (!emailValue ? email : password).focus();
      return;
    }
    submit.disabled = true;
    setStatus(t('login.pending'), '');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email: emailValue, password: passwordValue, return_to: returnTo})
      });
      if (!response.ok) {
        setStatus(t(failureKey[response.status] || 'login.failed'), 'error');
        submit.disabled = false;
        return;
      }
      let data = {};
      try { data = await response.json(); } catch { /* A 200 without JSON still returns home. */ }
      setStatus(t('login.success'), 'success');
      location.replace(data.return_to || '/');
    } catch {
      setStatus(t('login.network'), 'error');
      submit.disabled = false;
    }
  });
  email.focus();
})();

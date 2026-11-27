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
  let csrf = '';
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
    if (!data) return;
    csrf = data.csrf || '';
    if (!data.oauthLoginEnabled) return;
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
  const registerForm = document.querySelector('#registerForm');
  const registerEmail = document.querySelector('#registerEmail');
  const registerPassword = document.querySelector('#registerPassword');
  const registerConfirm = document.querySelector('#registerConfirm');
  const registerName = document.querySelector('#registerName');
  const registerSubmit = document.querySelector('#registerSubmit');
  const registerStatus = document.querySelector('#registerStatus');
  const registerFailureKey = {
    403: 'login.registerBadOrigin',
    409: 'login.registerDuplicate',
    422: 'login.registerFormat',
    429: 'login.registerRateLimited',
    503: 'login.registerUnavailable'
  };
  function setRegisterStatus(text, state) {
    registerStatus.textContent = text;
    registerStatus.dataset.state = state || '';
    const invalid = state === 'error' ? 'true' : 'false';
    for (const field of [registerEmail, registerPassword, registerConfirm]) {
      field.setAttribute('aria-invalid', invalid);
    }
  }
  registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    const emailValue = registerEmail.value.trim();
    const passwordValue = registerPassword.value;
    if (!emailValue || !passwordValue) {
      setRegisterStatus(t('login.registerMissing'), 'error');
      (!emailValue ? registerEmail : registerPassword).focus();
      return;
    }
    if (passwordValue.length < 8 || !/[A-Za-z]/.test(passwordValue) || !/\d/.test(passwordValue)) {
      setRegisterStatus(t('login.registerWeak'), 'error');
      registerPassword.focus();
      return;
    }
    if (passwordValue !== registerConfirm.value) {
      setRegisterStatus(t('login.registerMismatch'), 'error');
      registerConfirm.focus();
      return;
    }
    registerSubmit.disabled = true;
    setRegisterStatus(t('login.registerPending'), '');
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {'Content-Type': 'application/json', 'x-csrf-token': csrf},
        body: JSON.stringify({
          email: emailValue, password: passwordValue,
          display_name: registerName.value.trim(), return_to: returnTo,
        })
      });
      if (!response.ok) {
        setRegisterStatus(t(registerFailureKey[response.status] || 'login.registerFailed'), 'error');
        registerSubmit.disabled = false;
        return;
      }
      let data = {};
      try { data = await response.json(); } catch { /* still return home */ }
      setRegisterStatus(t('login.registerSuccess'), 'success');
      location.replace(data.return_to || '/');
    } catch {
      setRegisterStatus(t('login.registerNetwork'), 'error');
      registerSubmit.disabled = false;
    }
  });
  email.focus();
})();

/*
 * 账户区会话渲染：与首页同一套（/api/session 读状态；已登录=名字+退出；未登录=登录链接）。
 *
 * 之前的登录按钮是纯静态 <a href="/auth/login?return_to=…">，从不读会话，登录回来
 * 仍显示「登录」；这里改成服务端会话说了算，绝不用 localStorage 存任何登录标记。
 * 已登录形态照抄首页 assets/discussion.js 的 renderAccount()：
 *   <div class="reading-account"><span class="account-name">名字</span><button>退出</button></div>
 */
(function () {
  'use strict';

  var slot = document.querySelector('.header-account-area .header-login');
  if (!slot) return;

  var session = null;
  var csrf = '';
  var fallback = slot.outerHTML;

  function t(key, text) {
    try {
      if (window.MSI18N && window.MSI18N.has(key)) return window.MSI18N.t(key);
    } catch (error) { /* fall through to the page's own text */ }
    return text;
  }

  function loginHref() {
    // 页内回跳（口径已定）：/cases → %2Fcases，/courses.html → %2Fcourses.html
    return '/auth/login?return_to=' + encodeURIComponent(location.pathname + location.search);
  }

  function renderLoggedOut() {
    var stale = document.querySelector('.header-account-area .reading-account');
    if (stale) stale.remove();
    slot = document.querySelector('.header-account-area .header-login');
    if (!slot) {
      var node = document.createElement('div');
      node.innerHTML = fallback;
      slot = node.firstElementChild;
      document.querySelector('.header-account-area').append(slot);
    }
    slot.href = loginHref();
    slot.textContent = t('discussion.loginShort', '登录');
    slot.setAttribute('data-i18n', 'discussion.loginShort');
  }

  function renderLoggedIn(name) {
    var current = document.querySelector('.header-account-area .header-login');
    var box = document.createElement('div');
    box.className = 'reading-account';

    var who = document.createElement('span');
    who.className = 'account-name';
    who.textContent = name;
    box.append(who);

    // 与首页 renderAccount() 的产物逐字一致：<button type="button">退出</button>，无额外类名。
    var out = document.createElement('button');
    out.type = 'button';
    out.textContent = t('discussion.logout', '退出');
    out.addEventListener('click', logout);
    box.append(out);

    if (current) current.replaceWith(box);
    else document.querySelector('.header-account-area').append(box);
  }

  async function logout() {
    var button = document.querySelector('.header-account-area .reading-account button');
    if (button) button.disabled = true;
    try {
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrf }
      });
    } catch (error) { /* the refresh below shows the truth either way */ }
    await load();
  }

  async function load() {
    try {
      var response = await fetch('/api/session', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('session unavailable');
      session = await response.json();
      csrf = session.csrf || '';
      if (session.user && session.user.name) renderLoggedIn(session.user.name);
      else renderLoggedOut();
    } catch (error) {
      renderLoggedOut();
      return;
    }
    window.dispatchEvent(new CustomEvent('purplebook:session', { detail: session }));
  }

  // 语言切换后「登录 / 退出」跟着词典走，已登录形态保持不变。
  try {
    if (window.MSI18N && window.MSI18N.on) {
      window.MSI18N.on(function () {
        var out = document.querySelector('.header-account-area .reading-account button');
        if (out) out.textContent = t('discussion.logout', '退出');
        else renderLoggedOut();
      });
    }
  } catch (error) { /* no i18n runtime on this page */ }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();

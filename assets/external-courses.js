/**
 * SILS extended-courses page renderer.
 *
 * Self-contained on purpose: it does not touch paper.js routing or BOOK_DATA,
 * so the 35-chapter reader stays untouched. Language preference reuses the
 * same localStorage key as the main site (ms-cookbook.language).
 */
(function () {
  'use strict';

  var DATA = window.EXTERNAL_COURSES;
  var STORAGE_KEY = 'ms-cookbook.language';
  var LANGS = ['zh', 'en', 'es'];
  var LANG_NAMES = { zh: '中文', en: 'English', es: 'Español' };
  var filter = 'all';

  function currentLang() {
    var saved = '';
    try { saved = localStorage.getItem(STORAGE_KEY) || ''; } catch (_) { /* storage disabled */ }
    saved = saved.toLowerCase();
    if (saved.indexOf('zh') === 0) return 'zh';
    if (saved.indexOf('es') === 0) return 'es';
    if (saved.indexOf('en') === 0) return 'en';
    return 'zh';
  }

  function ui() { return DATA.ui[currentLang()] || DATA.ui.zh; }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function renderHeader() {
    var lang = currentLang();
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
    document.getElementById('backLink').textContent = '← ' + ui().back;
    document.getElementById('langSwitch').innerHTML = LANGS.map(function (code) {
      return '<button type="button" data-lang="' + code + '"' +
        (code === lang ? ' aria-current="true" class="is-active"' : '') +
        '>' + LANG_NAMES[code] + '</button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('#langSwitch button'), function (btn) {
      btn.addEventListener('click', function () {
        try { localStorage.setItem(STORAGE_KEY, btn.dataset.lang); } catch (_) { /* noop */ }
        render();
      });
    });
  }

  function renderFilters() {
    var labels = ui();
    var options = [
      { key: 'all', label: labels.filterAll },
      { key: 'shared', label: labels.filterShared },
      { key: 'sils', label: labels.filterSils },
      { key: 'mymaic', label: labels.filterMymaic }
    ];
    document.getElementById('filters').innerHTML = options.map(function (opt) {
      return '<button type="button" data-filter="' + opt.key + '"' +
        (opt.key === filter ? ' aria-pressed="true" class="is-active"' : ' aria-pressed="false"') +
        '>' + esc(opt.label) + '</button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('#filters button'), function (btn) {
      btn.addEventListener('click', function () { filter = btn.dataset.filter; render(); });
    });
  }

  function renderCourses() {
    var labels = ui();
    var lang = currentLang();
    var list = DATA.courses.filter(function (course) {
      if (filter === 'all') return true;
      return course.audience === filter || course.audience === 'shared';
    });

    if (!list.length) {
      document.getElementById('courseGrid').innerHTML = '<p class="empty">' + esc(labels.empty) + '</p>';
      return;
    }

    document.getElementById('courseGrid').innerHTML = list.map(function (course) {
      var chapters = course.silsChapters.map(function (n) {
        return '<a href="index.html#chapter-' + n + '">' + String(n).padStart(2, '0') + '</a>';
      }).join('');
      return '<article class="course-card">' +
        '<div class="course-top"><span class="course-repo">' + esc(course.repo) + '</span>' +
        '<span class="course-license">' + esc(labels.license) + ': ' + esc(course.license) + '</span></div>' +
        '<h2>' + esc((course.title[lang] || course.title.zh)) + '</h2>' +
        '<p class="course-summary">' + esc((course.summary[lang] || course.summary.zh)) + '</p>' +
        '<dl class="course-meta">' +
        '<div><dt>' + esc(labels.lessons) + '</dt><dd>' + esc(course.lessons) + '</dd></div>' +
        '<div><dt>' + esc(labels.language) + '</dt><dd>' + esc(course.languages) + '</dd></div>' +
        '<div><dt>' + esc(labels.stars) + '</dt><dd>' + course.stars.toLocaleString('en-US') + '</dd></div>' +
        '<div><dt>' + esc(labels.relevance) + '</dt><dd>SILS ' + course.relevance.sils + '/5 · MyMAIC ' + course.relevance.mymaic + '/5</dd></div>' +
        '</dl>' +
        '<p class="course-chapters"><span>' + esc(labels.chapters) + '：</span>' + chapters + '</p>' +
        '<a class="course-open" href="' + esc(course.url) + '" target="_blank" rel="noopener noreferrer">' +
        esc(labels.openRepo) + '</a>' +
        '</article>';
    }).join('');
  }

  function render() {
    var labels = ui();
    document.title = labels.pageTitle + ' · SILS';
    document.getElementById('pageTitle').textContent = labels.pageTitle;
    document.getElementById('pageSubtitle').textContent = labels.pageSubtitle;
    document.getElementById('policy').textContent = labels.policy;
    document.getElementById('verified').textContent = labels.verified + ': ' + DATA.verifiedOn;
    renderHeader();
    renderFilters();
    renderCourses();
  }

  if (!DATA) return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();

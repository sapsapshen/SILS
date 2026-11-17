/**
 * Chapter-tail extension cards for the SILS reader.
 *
 * paper.js calls window.renderChapterCourses(chapter) at the end of every
 * renderChapter(), so the block follows the reader through route changes and
 * language switches alike. Everything it shows comes from the same catalogue
 * the /courses page uses (assets/external-courses-data.js), which stores links
 * and attribution only -- no course text is copied into the chapter.
 *
 * Rendering is a pure function of (chapter number, language); the DOM write is
 * the last step, so scripts/test-chapter-courses.cjs can assert on the markup
 * without a browser.
 */
(function () {
  'use strict';

  var DATA = window.EXTERNAL_COURSES;
  var LANGS = ['zh', 'en', 'es'];
  var MAX_CARDS = 4;

  function currentLang() {
    var value = window.MSI18N && window.MSI18N.lang ? String(window.MSI18N.lang) : 'zh';
    value = value.toLowerCase();
    for (var i = 0; i < LANGS.length; i += 1) {
      if (value.indexOf(LANGS[i]) === 0) return LANGS[i];
    }
    return 'zh';
  }

  function ui(language) {
    if (!DATA || !DATA.ui) return {};
    return DATA.ui[language] || DATA.ui.zh || {};
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function formatCount(template, count) {
    return String(template == null ? '' : template).replace('{n}', String(count));
  }

  /* Matches the chapter's own number, not its index: BOOK_DATA gives chapter-27
     number 27, and the catalogue's silsChapters entries are the same numbers the
     /courses page links to (#chapter-27). Sorted by SILS relevance first and
     stars second, so the strongest fit is the card a reader sees first. */
  function coursesForChapter(number) {
    if (!DATA || !DATA.courses) return [];
    var target = Number(number);
    if (!isFinite(target)) return [];
    return DATA.courses.filter(function (course) {
      return (course.silsChapters || []).indexOf(target) !== -1;
    }).sort(function (a, b) {
      var ra = a.relevance && a.relevance.sils ? a.relevance.sils : 0;
      var rb = b.relevance && b.relevance.sils ? b.relevance.sils : 0;
      return rb - ra || (b.stars || 0) - (a.stars || 0);
    });
  }

  function cardHtml(course, labels, language) {
    var title = (course.title && (course.title[language] || course.title.zh)) || course.repo;
    var summary = (course.summary && (course.summary[language] || course.summary.zh)) || '';
    return '<li class="chapter-course">' +
      '<div class="cc-top"><span class="cc-repo">' + esc(course.repo) + '</span>' +
      '<span class="cc-license">' + esc(labels.license) + ': ' + esc(course.license) + '</span></div>' +
      '<h3>' + esc(title) + '</h3>' +
      '<p class="cc-summary">' + esc(summary) + '</p>' +
      '<a class="cc-open" href="' + esc(course.url) + '" target="_blank" rel="noopener noreferrer">' +
      esc(labels.openRepo) + '</a>' +
      '</li>';
  }

  /* Returns {count, html}. count is the full match count -- the "see all" link
     reports it, while html carries at most MAX_CARDS of them. An unmatched
     chapter gets html:'' so the reader can hide the block instead of printing
     an empty heading. */
  function section(number, language) {
    var lang = LANGS.indexOf(language) === -1 ? 'zh' : language;
    var labels = ui(lang);
    var matches = coursesForChapter(number);
    if (!matches.length) return { count: 0, html: '' };
    var shown = matches.slice(0, MAX_CARDS);
    return {
      count: matches.length,
      html: '<div class="cc-head"><h2 id="chapterCoursesTitle">' + esc(labels.chapterTitle) + '</h2>' +
        '<p class="cc-intro">' + esc(labels.chapterIntro) + '</p></div>' +
        '<ul class="cc-list">' + shown.map(function (course) {
          return cardHtml(course, labels, lang);
        }).join('') + '</ul>' +
        '<div class="cc-foot"><span class="cc-note">' + esc(labels.chapterNote) + '</span>' +
        '<a class="cc-all" href="courses.html">' +
        esc(formatCount(labels.viewAll, (DATA.courses || []).length)) + '</a></div>',
    };
  }

  function render(chapter) {
    var host = document.getElementById('chapterCourses');
    if (!host || !chapter || !DATA) return;
    var result = section(chapter.number, currentLang());
    if (!result.html) {
      host.innerHTML = '';
      host.hidden = true;
      return;
    }
    host.innerHTML = result.html;
    host.hidden = false;
  }

  window.ChapterCourses = { forChapter: coursesForChapter, section: section };
  window.renderChapterCourses = render;
})();

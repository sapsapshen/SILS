/* Admin dashboard controller. All data comes from the admin-scoped API;
   the page itself never reads or writes the account database. */
(function () {
  'use strict';
  var status = document.querySelector('#adminStatus');
  var body = document.querySelector('#adminLearnersBody');
  var empty = document.querySelector('#adminEmpty');
  var t = function (key) { return window.MSI18N && window.MSI18N.t ? window.MSI18N.t(key) : key; };

  function setStatus(message, state) {
    status.textContent = message;
    status.dataset.state = state || '';
  }
  function cell(text) {
    var td = document.createElement('td');
    td.textContent = text === undefined || text === null ? '' : String(text);
    return td;
  }
  function formatDate(stamp) {
    if (!stamp) return t('admin.never');
    var date = new Date(Number(stamp) * 1000);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
  }
  function render(data) {
    document.querySelector('#adminLearners').textContent = data.total;
    document.querySelector('#adminExercises').textContent = data.exerciseCount;
    document.querySelector('#adminPassed').textContent = data.learners.reduce(function (sum, row) { return sum + row.passed; }, 0);
    document.querySelector('#adminHighlights').textContent = data.learners.reduce(function (sum, row) { return sum + row.highlights; }, 0);
    body.textContent = '';
    data.learners.forEach(function (learner) {
      var tr = document.createElement('tr');
      tr.append(cell(learner.name), cell(learner.email),
        cell(learner.completed + ' / ' + data.exerciseCount), cell(learner.highlights),
        cell(learner.comments), cell(formatDate(learner.lastLoginAt)));
      body.append(tr);
    });
    empty.hidden = data.learners.length > 0;
    setStatus('', '');
  }

  fetch('/api/admin/learners', { credentials: 'same-origin' })
    .then(function (response) {
      if (response.status === 401 || response.status === 403) throw new Error('denied');
      if (!response.ok) throw new Error('failed');
      return response.json();
    })
    .then(render)
    .catch(function (error) {
      setStatus(t(error.message === 'denied' ? 'admin.denied' : 'admin.error'), 'error');
      empty.hidden = true;
    });
})();

/* Admin dashboard controller. All data comes from the admin-scoped API;
   the page itself never reads or writes the account database. */
(function () {
  'use strict';
  var status = document.querySelector('#adminStatus');
  var body = document.querySelector('#adminLearnersBody');
  var empty = document.querySelector('#adminEmpty');
  var leadsBody = document.querySelector('#adminLeadsBody');
  var leadsEmpty = document.querySelector('#adminLeadsEmpty');
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
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
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
  }

  var STATUS_LABELS = { new: 'admin.leadNew', contacted: 'admin.leadContacted', closed: 'admin.leadClosed' };

  function renderLeads(data) {
    leadsBody.textContent = '';
    document.querySelector('#adminLeads').textContent = data.total || 0;
    data.items.forEach(function (lead) {
      var tr = document.createElement('tr');
      var statusCell = document.createElement('td');
      var select = document.createElement('select');
      select.className = 'admin-lead-status';
      select.setAttribute('aria-label', t('admin.colLeadStatus'));
      Object.keys(STATUS_LABELS).forEach(function (key) {
        var option = document.createElement('option');
        option.value = key;
        option.textContent = t(STATUS_LABELS[key]);
        if (lead.status === key) option.selected = true;
        select.append(option);
      });
      select.addEventListener('change', function () {
        select.disabled = true;
        fetch('/api/admin/leads/' + encodeURIComponent(lead.id), {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: select.value })
        }).then(function (response) {
          if (!response.ok) throw new Error('failed');
          select.dataset.saved = '1';
        }).catch(function () {
          setStatus(t('admin.error'), 'error');
        }).then(function () { select.disabled = false; });
      });
      statusCell.append(select);
      var note = lead.note ? lead.note : '';
      tr.append(cell(formatDate(lead.created)), cell(lead.name), cell(lead.email),
        cell(lead.org || '—'), cell(lead.size || '—'), cell(lead.interest || '—'),
        cell(note || '—'), statusCell);
      leadsBody.append(tr);
    });
    leadsEmpty.hidden = data.items.length > 0;
  }

  function load(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (response) {
      if (response.status === 401 || response.status === 403) throw new Error('denied');
      if (!response.ok) throw new Error('failed');
      return response.json();
    });
  }

  Promise.all([load('/api/admin/learners'), load('/api/admin/leads')])
    .then(function (results) {
      render(results[0]);
      renderLeads(results[1]);
      setStatus('', '');
    })
    .catch(function (error) {
      setStatus(t(error.message === 'denied' ? 'admin.denied' : 'admin.error'), 'error');
      empty.hidden = true;
      leadsEmpty.hidden = true;
    });
})();

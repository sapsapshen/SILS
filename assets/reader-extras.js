/* Reader extras: bookmarks + "ask this chapter" AI.
 *
 * Kept out of paper.js on purpose: paper.js owns routing and rendering, and a
 * failure here must not take the reader down. Everything is guarded, and the
 * buttons only appear once a chapter is on screen.
 */
(() => {
  'use strict';
  const STORE = 'sils.bookmarks.v1';
  const COPY = {
    zh: {
      bookmark: '收藏', saved: '已收藏', bookmarks: '我的收藏', empty: '还没有收藏。读到一个想回看的章节时，点「收藏」。',
      remove: '移除', review: '复习', ask: '问 AI', askTitle: '问这一章', askPlaceholder: '例如：这一章的方法在什么情况下会失效？',
      send: '提问', thinking: '正在读这一章…', failed: 'AI 暂时不可用，请稍后再试。', tooShort: '问题太短了。',
      close: '关闭', noChapter: '请先打开一章再提问。', open: '打开',
    },
    en: {
      bookmark: 'Save', saved: 'Saved', bookmarks: 'Saved chapters', empty: 'Nothing saved yet. Use “Save” on a chapter you want to revisit.',
      remove: 'Remove', review: 'Review', ask: 'Ask AI', askTitle: 'Ask this chapter', askPlaceholder: 'e.g. When does the method in this chapter break down?',
      send: 'Ask', thinking: 'Reading the chapter…', failed: 'AI is unavailable. Please try again.', tooShort: 'That question is too short.',
      close: 'Close', noChapter: 'Open a chapter before asking.', open: 'Open',
    },
    es: {
      bookmark: 'Guardar', saved: 'Guardado', bookmarks: 'Capitulos guardados', empty: 'Aun no hay nada guardado. Usa «Guardar» en un capitulo que quieras repasar.',
      remove: 'Quitar', review: 'Repasar', ask: 'Preguntar a la IA', askTitle: 'Pregunta sobre este capitulo', askPlaceholder: 'p. ej. Cuando falla el metodo de este capitulo?',
      send: 'Preguntar', thinking: 'Leyendo el capitulo…', failed: 'La IA no esta disponible. Intentalo de nuevo.', tooShort: 'La pregunta es demasiado corta.',
      close: 'Cerrar', noChapter: 'Abre un capitulo antes de preguntar.', open: 'Abrir',
    },
  };
  const lang = () => (window.MSI18N && window.MSI18N.lang) || 'zh';
  const t = (key) => (COPY[lang()] || COPY.zh)[key];

  const read = () => {
    try { return JSON.parse(localStorage.getItem(STORE) || '[]').filter((x) => x && x.id); }
    catch { return []; }
  };
  const write = (list) => {
    try { localStorage.setItem(STORE, JSON.stringify(list.slice(-120))); } catch { /* storage disabled */ }
  };
  const currentId = () => {
    const match = location.hash.match(/chapter-(\d{1,2})/);
    return match ? `chapter-${Number(match[1])}` : '';
  };
  const currentTitle = () => (document.getElementById('chapterTitle')?.textContent || '').trim();
  const chapterHref = (id) => `#${id}`;

  function style() {
    if (document.getElementById('readerExtrasStyle')) return;
    const el = document.createElement('style');
    el.id = 'readerExtrasStyle';
    el.textContent = `
      .re-panel{position:fixed;right:18px;bottom:18px;z-index:80;width:min(380px,calc(100vw - 24px));max-height:70vh;overflow:auto;
        background:var(--surface,#fff);color:var(--ink,#171412);border:1px solid var(--line,rgba(23,20,18,.16));border-radius:16px;
        box-shadow:0 18px 50px rgba(0,0,0,.18);padding:16px;font:14px/1.6 system-ui,sans-serif}
      .re-panel[hidden]{display:none}
      .re-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
      .re-head h2{font-size:16px;margin:0}
      .re-x{border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer;line-height:1}
      .re-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}
      .re-item{display:flex;gap:8px;justify-content:space-between;align-items:flex-start;border-bottom:1px solid var(--line,rgba(0,0,0,.08));padding-bottom:8px}
      .re-item a{color:inherit;text-decoration:none;font-weight:600}
      .re-item button{border:0;background:transparent;color:#b42318;cursor:pointer;font-size:12px}
      .re-empty{color:var(--ink-2,#6b625c);margin:8px 0}
      .re-ask textarea{width:100%;min-height:76px;resize:vertical;border:1px solid var(--line,rgba(0,0,0,.18));border-radius:10px;padding:8px 10px;font:inherit;background:transparent;color:inherit}
      .re-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}
      .re-actions button{border:1px solid var(--line,rgba(0,0,0,.18));background:transparent;color:inherit;border-radius:999px;padding:6px 14px;cursor:pointer}
      .re-actions .re-primary{background:var(--brand,#8a580c);border-color:transparent;color:#fff}
      .re-answer{white-space:pre-wrap;margin-top:10px;border-top:1px solid var(--line,rgba(0,0,0,.08));padding-top:10px}
      .re-status{font-size:12px;color:var(--ink-2,#6b625c);margin-top:6px}
      .re-tools{display:inline-flex;gap:6px;margin-left:6px}
      @media(max-width:640px){.re-panel{right:8px;bottom:8px;max-height:76vh}}
    `;
    document.head.appendChild(el);
  }

  function buttons() {
    const tools = document.querySelector('.reading-tools');
    if (!tools || tools.querySelector('[data-re-bookmark]')) return;
    const saved = document.createElement('button');
    saved.type = 'button';
    saved.dataset.reBookmark = '1';
    saved.textContent = read().some((x) => x.id === currentId()) ? t('saved') : t('bookmark');
    saved.addEventListener('click', () => {
      const id = currentId();
      if (!id) return;
      const list = read();
      const exists = list.some((x) => x.id === id);
      const next = exists ? list.filter((x) => x.id !== id) : [...list, { id, title: currentTitle(), at: Date.now() }];
      write(next);
      saved.textContent = exists ? t('bookmark') : t('saved');
      renderBookmarks();
    });
    const shelf = document.createElement('button');
    shelf.type = 'button';
    shelf.textContent = t('bookmarks');
    shelf.addEventListener('click', () => togglePanel());
    const ask = document.createElement('button');
    ask.type = 'button';
    ask.textContent = t('ask');
    ask.addEventListener('click', () => openAsk());
    const wrap = document.createElement('span');
    wrap.className = 're-tools';
    wrap.append(saved, shelf, ask);
    tools.appendChild(wrap);
  }

  let panel;
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('section');
    panel.className = 're-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    document.body.appendChild(panel);
    return panel;
  }

  function renderBookmarks() {
    const el = ensurePanel();
    el.replaceChildren();
    const head = document.createElement('div');
    head.className = 're-head';
    const title = document.createElement('h2');
    title.textContent = t('bookmarks');
    const close = document.createElement('button');
    close.className = 're-x';
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', t('close'));
    close.addEventListener('click', () => { el.hidden = true; });
    head.append(title, close);
    el.appendChild(head);
    const list = read().sort((a, b) => b.at - a.at);
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 're-empty';
      p.textContent = t('empty');
      el.appendChild(p);
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 're-list';
    list.forEach((item) => {
      const li = document.createElement('li');
      li.className = 're-item';
      const a = document.createElement('a');
      a.href = chapterHref(item.id);
      a.textContent = `${item.id.replace('chapter-', '第 ')} 章 · ${item.title || item.id}`;
      a.addEventListener('click', () => { location.hash = chapterHref(item.id); el.hidden = true; });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = t('remove');
      remove.addEventListener('click', () => {
        write(read().filter((x) => x.id !== item.id));
        renderBookmarks();
        const saved = document.querySelector('[data-re-bookmark]');
        if (saved) saved.textContent = t('bookmark');
      });
      li.append(a, remove);
      ul.appendChild(li);
    });
    el.appendChild(ul);
  }

  function togglePanel() {
    const el = ensurePanel();
    if (!el.hidden) { el.hidden = true; return; }
    renderBookmarks();
    el.hidden = false;
  }

  function openAsk() {
    const id = currentId();
    if (!id) { window.alert(t('noChapter')); return; }
    const el = ensurePanel();
    el.replaceChildren();
    const head = document.createElement('div');
    head.className = 're-head';
    const title = document.createElement('h2');
    title.textContent = t('askTitle');
    const close = document.createElement('button');
    close.className = 're-x'; close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', t('close'));
    close.addEventListener('click', () => { el.hidden = true; });
    head.append(title, close);
    const form = document.createElement('form');
    form.className = 're-ask';
    const area = document.createElement('textarea');
    area.placeholder = t('askPlaceholder');
    area.required = true;
    const actions = document.createElement('div');
    actions.className = 're-actions';
    const send = document.createElement('button');
    send.type = 'submit'; send.className = 're-primary'; send.textContent = t('send');
    actions.appendChild(send);
    const status = document.createElement('p');
    status.className = 're-status';
    const answer = document.createElement('div');
    answer.className = 're-answer';
    form.append(area, actions, status);
    el.append(head, form, answer);
    el.hidden = false;
    area.focus();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const question = area.value.trim();
      if (question.length < 3) { status.textContent = t('tooShort'); return; }
      send.disabled = true;
      status.textContent = t('thinking');
      answer.textContent = '';
      try {
        const response = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, chapter: id, language: lang() }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.answer) throw new Error('failed');
        answer.textContent = payload.answer;
        status.textContent = '';
      } catch {
        status.textContent = t('failed');
      } finally {
        send.disabled = false;
      }
    });
  }

  function boot() {
    style();
    const sync = () => {
      buttons();
      const saved = document.querySelector('[data-re-bookmark]');
      if (saved) saved.textContent = read().some((x) => x.id === currentId()) ? t('saved') : t('bookmark');
    };
    sync();
    window.addEventListener('hashchange', () => setTimeout(sync, 80));
    if (window.MSI18N && window.MSI18N.on) window.MSI18N.on(sync);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

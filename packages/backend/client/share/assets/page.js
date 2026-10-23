/* Client share page. Vanilla JS, no build step, no dependencies. Driven by the
   /api/public/share/:slug endpoints; the slug comes from <body data-slug>.
   Views: gate → shortlist (hearts, uncapped) → final (ticks, capped) →
   submitted → delivery. */
(function () {
  'use strict';

  const SLUG = document.body.dataset.slug || '';
  const API = '/api/public/share/' + encodeURIComponent(SLUG);
  const app = document.getElementById('app');
  const COARSE = window.matchMedia('(pointer: coarse)').matches;
  const TAP = COARSE ? 'tap' : 'click';

  let state = null;        // SharePublicState from the server
  const favs = new Set();  // shortlist (filenames)
  const fin = new Set();   // final picks (subset of favs)
  let view = 'shortlist';  // 'shortlist' | 'final' (within the proofing phase)
  let filter = 'all';      // 'all' | 'favs'
  let grid = null;         // active Grid

  // ── Small helpers ─────────────────────────────────────────────────────────
  const HEART = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
  const ICON = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + HEART + '"/></svg>',
    tickDot: '<span class="dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg></span>',
    eye: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6A3 3 0 0 0 13.4 13.4M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.3 6.3A17.3 17.3 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 4.2-.9"/></svg>',
    close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    prev: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    down: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 4v12M6 10l6 6 6-6M4 20h16"/></svg>',
    tick: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
  const thumbUrl = (f) => API + '/thumb/' + encodeURIComponent(f);
  const previewUrl = (f) => API + '/preview/' + encodeURIComponent(f);
  const downloadUrl = (f) => API + '/download/' + encodeURIComponent(f);

  function fmtBytes(n) {
    if (!n) return '';
    if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
    if (n < 1024 * 1024 * 1024) return Math.round(n / 1024 / 1024) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  }

  async function api(pathName, opts) {
    const r = await fetch(API + pathName, Object.assign({ credentials: 'same-origin' }, opts || {}));
    if (r.status === 401) return { unauth: true };
    let body = null;
    try { body = await r.json(); } catch (e) { body = null; }
    if (!r.ok) throw new Error((body && body.message) || 'Something went wrong');
    return { data: body && body.data };
  }

  function post(pathName, payload) {
    return api(pathName, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
  }

  // Save-as deterrent (friction, not protection): no context menu or drag on
  // photos. iOS long-press is suppressed by the -webkit-touch-callout rule.
  document.addEventListener('contextmenu', (ev) => { if (ev.target && ev.target.tagName === 'IMG') ev.preventDefault(); });
  document.addEventListener('dragstart', (ev) => { if (ev.target && ev.target.tagName === 'IMG') ev.preventDefault(); });

  function syncSets() {
    favs.clear();
    fin.clear();
    state.items.forEach((it) => {
      if (it.selected) favs.add(it.file);
      if (it.final) fin.add(it.file);
    });
  }

  function route() {
    Lightbox.close();
    if (grid) grid.destroy();
    grid = null;
    filter = 'all';
    if (!state) renderGate();
    else if (state.phase === 'delivery') renderDelivery();
    else if (state.phase === 'submitted') renderSubmitted();
    else if (view === 'final') renderFinal();
    else renderShortlist();
    window.scrollTo(0, 0);
  }

  function setStatus(msg, isErr) {
    const s = document.getElementById('status');
    if (!s) return;
    s.textContent = msg || '';
    s.className = 'status' + (isErr ? ' err' : '');
  }

  // ── Gate ──────────────────────────────────────────────────────────────────
  function renderGate() {
    const brand = document.body.dataset.brand || 'Your photographer';
    const album = document.body.dataset.album || 'Private gallery';
    app.replaceChildren(el(
      '<div class="gate">'
      + '<div class="brand"><span class="brand-mark" aria-hidden="true"></span>' + esc(brand) + '</div>'
      + '<div class="card">'
      + '<div class="intro"><span class="eyebrow">A private gallery for you</span>'
      + '<h1>' + esc(album) + '</h1>'
      + '<p class="muted">' + esc(brand) + ' has shared these photos with you. Enter the password from your message to open the gallery.</p></div>'
      + '<form id="gateForm">'
      + '<label for="pw">Password</label>'
      + '<div class="field"><input id="pw" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false"/>'
      + '<button type="button" class="icon-btn" id="pwToggle" aria-label="Show password">' + ICON.eye + '</button></div>'
      + '<button type="submit" class="btn primary block" id="go">Open gallery</button>'
      + '<p id="gerr" class="status err" aria-live="polite"></p>'
      + '<span class="hint">You’ll stay signed in on this device for 7 days.</span>'
      + '</form></div>'
      + '<div class="foot">Private link · please don’t forward it</div>'
      + '</div>',
    ));
    const form = document.getElementById('gateForm');
    const pw = document.getElementById('pw');
    const go = document.getElementById('go');
    const err = document.getElementById('gerr');
    const toggle = document.getElementById('pwToggle');
    toggle.onclick = () => {
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      toggle.innerHTML = show ? ICON.eyeOff : ICON.eye;
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      pw.focus();
    };
    form.onsubmit = (ev) => {
      ev.preventDefault();
      if (!pw.value) { pw.focus(); return; }
      go.disabled = true;
      err.textContent = '';
      post('/auth', { password: pw.value })
        .then((res) => {
          if (res.unauth) throw new Error('Incorrect password');
          state = res.data; syncSets(); route();
        })
        .catch((e) => { err.textContent = e.message; go.disabled = false; pw.select(); });
    };
    pw.focus();
  }

  // ── Justified grid ────────────────────────────────────────────────────────
  // Rows of a target height, each scaled to fill the width exactly so every
  // photo shows uncropped. Tiles are created once and moved between rows on
  // relayout, so images never reload. Options: heart (shortlist toggle),
  // tick (final-pick toggle), save (delivery), onOpen, isOn(file).
  function Grid(container, items, opts) {
    this.container = container;
    this.items = items;
    this.opts = opts || {};
    this.tiles = new Map();
    this.visible = items;
    items.forEach((it, i) => this.tiles.set(it.file, this.makeTile(it, i)));
    this.layout();
    let raf = 0;
    this.ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => this.layout());
    });
    this.ro.observe(container);
  }

  Grid.prototype.makeTile = function (it, index) {
    const o = this.opts;
    const on = o.isOn ? o.isOn(it.file) : false;
    const tile = el(
      '<div class="tile' + (on ? ' on' : '') + (o.tick ? ' pick' : '') + '" data-file="' + esc(it.file) + '">'
      + '<img alt="" loading="lazy" decoding="async"/>'
      + '<button type="button" class="open" aria-label="Open photo ' + (index + 1) + '"></button>'
      + (o.heart ? '<button type="button" class="mark heart" aria-label="Add to shortlist" aria-pressed="' + on + '">' + ICON.heart + '</button>' : '')
      + (o.tick ? '<button type="button" class="mark tickbtn" aria-label="Choose" aria-pressed="' + on + '">' + ICON.tickDot + '</button>' : '')
      + (o.save ? '<button type="button" class="save" aria-label="Save photo">' + ICON.down + 'Save</button>' : '')
      + '</div>',
    );
    const img = tile.querySelector('img');
    img.onload = () => img.classList.add('ok');
    img.src = thumbUrl(it.file);
    tile.querySelector('.open').onclick = () => o.onOpen && o.onOpen(it.file);
    const mark = tile.querySelector('.mark');
    if (mark) mark.onclick = (ev) => { ev.stopPropagation(); o.onToggle && o.onToggle(it.file); };
    const save = tile.querySelector('.save');
    if (save) save.onclick = (ev) => { ev.stopPropagation(); saveFile(it.file, save); };
    return tile;
  };

  Grid.prototype.setVisible = function (items) {
    this.visible = items;
    this.layout();
  };

  Grid.prototype.layout = function () {
    const W = this.container.clientWidth;
    if (!W) return;
    const wide = W >= 900;
    const gap = wide ? 6 : 4;
    const target = wide ? 240 : Math.min(150, Math.round(W * 0.42));
    const aspect = (it) => (it.w > 0 && it.h > 0 ? it.w / it.h : 1.5);
    const rows = [];
    let row = [];
    let sum = 0;
    const commit = (h) => {
      const r = document.createElement('div');
      r.className = 'row';
      const hh = Math.round(h);
      let used = 0;
      row.forEach((it, i) => {
        const tile = this.tiles.get(it.file);
        const last = i === row.length - 1;
        const w = last ? Math.max(1, W - gap * (row.length - 1) - used) : Math.round(aspect(it) * h);
        used += w;
        tile.style.width = w + 'px';
        tile.style.height = hh + 'px';
        r.appendChild(tile);
      });
      rows.push(r);
      row = [];
      sum = 0;
    };
    for (const it of this.visible) {
      row.push(it);
      sum += aspect(it);
      const h = (W - gap * (row.length - 1)) / sum;
      if (h <= target) commit(h);
    }
    if (row.length) {
      // Last row: never taller than the target, and a lone photo caps at ~60%
      // of the width so it doesn't become a banner.
      const natural = (W - gap * (row.length - 1)) / sum;
      let h = Math.min(target, natural);
      if (row.length === 1) h = Math.min(h, (W * 0.6) / sum);
      if (h < natural) {
        const r = document.createElement('div');
        r.className = 'row';
        row.forEach((it) => {
          const tile = this.tiles.get(it.file);
          tile.style.width = Math.round(aspect(it) * h) + 'px';
          tile.style.height = Math.round(h) + 'px';
          r.appendChild(tile);
        });
        rows.push(r);
        row = [];
      } else {
        commit(h);
      }
    }
    this.container.replaceChildren.apply(this.container, rows);
  };

  Grid.prototype.setOn = function (file, on) {
    const t = this.tiles.get(file);
    if (!t) return;
    t.classList.toggle('on', on);
    const mark = t.querySelector('.mark');
    if (mark) mark.setAttribute('aria-pressed', String(on));
  };

  Grid.prototype.destroy = function () { this.ro.disconnect(); };

  // ── Shared chrome ─────────────────────────────────────────────────────────
  function header(sub, toolsHtml, opts) {
    const o = opts || {};
    return '<div class="head' + (o.back ? ' with-back' : '') + '">'
      + (o.back ? '<button type="button" class="icon-btn back" aria-label="Back to the gallery">' + ICON.back + '</button>' : '')
      + '<div class="ident">'
      + (o.eyebrow !== undefined
        ? '<span class="eyebrow">' + o.eyebrow + '</span>'
        : '<div class="brand"><span class="brand-mark" aria-hidden="true"></span>' + esc(state.brandName) + '</div>')
      + '<h1>' + (o.title || esc(state.albumName)) + '</h1>'
      + '<span class="sub">' + sub + '</span></div>'
      + (toolsHtml || '')
      + '</div>';
  }

  /** Debounced persist of a set to an endpoint; one timer per endpoint. */
  const timers = {};
  const SAVING = 'Saving…';
  function persist(endpoint, set) {
    setStatus(SAVING);
    clearTimeout(timers[endpoint]);
    timers[endpoint] = setTimeout(() => {
      post(endpoint, { files: Array.from(set) })
        .then((res) => {
          if (res.data) state = res.data;
          // Only clear our own "Saving…"; a cap warning shown since stays.
          const s = document.getElementById('status');
          if (s && s.textContent === SAVING) setStatus('');
        })
        .catch((e) => setStatus(e.message, true));
    }, 250);
  }
  function flushPersist(endpoint, set) {
    clearTimeout(timers[endpoint]);
    return post(endpoint, { files: Array.from(set) });
  }

  // ── Shortlist (step 1) ────────────────────────────────────────────────────
  function filterPills() {
    return '<div class="tools" role="group" aria-label="Show">'
      + '<button type="button" class="pill' + (filter === 'all' ? ' on' : '') + '" data-filter="all">All · ' + state.items.length + '</button>'
      + '<button type="button" class="pill' + (filter === 'favs' ? ' on' : '') + '" data-filter="favs">' + ICON.heart.replace('<svg', '<svg width="14" height="14" style="fill:var(--accent)"') + ' Shortlist · <span data-favcount>' + favs.size + '</span></button>'
      + '</div>';
  }

  function bindFilter(root) {
    root.querySelectorAll('[data-filter]').forEach((b) => {
      b.onclick = () => {
        filter = b.dataset.filter;
        root.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('on', x === b));
        applyFilter();
      };
    });
  }

  function visibleItems() {
    return filter === 'favs' ? state.items.filter((it) => favs.has(it.file)) : state.items;
  }

  function applyFilter() {
    if (!grid) return;
    const items = visibleItems();
    grid.setVisible(items);
    const empty = document.getElementById('empty');
    if (empty) empty.hidden = items.length > 0;
  }

  function shortlistCtaHtml() {
    return '<div class="prog"><span class="lbl"><span data-favcount>' + favs.size + '</span> shortlisted</span>'
      + '<span class="sub2">You’ll choose ' + state.cap + ' of these to send</span></div>'
      + '<button type="button" class="btn primary" data-next>Choose final ' + state.cap + '</button>';
  }

  function updateShortlistCounts() {
    const n = favs.size;
    document.querySelectorAll('[data-favcount]').forEach((x) => { x.textContent = n; });
    document.querySelectorAll('[data-next]').forEach((b) => { b.disabled = n === 0; });
    Lightbox.sync();
  }

  function renderShortlist() {
    const sub = plural(state.items.length, 'photo') + ' · heart everything you like — you’ll choose your final ' + state.cap + ' at the end';
    app.replaceChildren(el(
      '<div class="shell">'
      + header(sub, filterPills() + '<div class="progress">' + shortlistCtaHtml() + '</div>')
      + '<div class="main"><div class="grid" id="grid"></div><p class="empty" id="empty" hidden>Nothing shortlisted yet — ' + TAP + ' the heart on the photos you love.</p>'
      + '<p id="status" class="status" aria-live="polite"></p></div>'
      + '<div class="foot-bar">' + shortlistCtaHtml() + '</div>'
      + '</div>',
    ));
    bindFilter(app);
    grid = new Grid(document.getElementById('grid'), state.items, {
      heart: true,
      isOn: (f) => favs.has(f),
      onToggle: toggleFav,
      onOpen: (file) => Lightbox.open(visibleItems().map((it) => it.file), file, 'select'),
    });
    document.querySelectorAll('[data-next]').forEach((b) => { b.onclick = goFinal; });
    updateShortlistCounts();
  }

  /** Toggle one shortlist entry and persist. Uncapped; always succeeds. */
  function toggleFav(file) {
    if (!state || state.phase !== 'proofing') return false;
    if (favs.has(file)) { favs.delete(file); fin.delete(file); }
    else favs.add(file);
    if (grid) grid.setOn(file, favs.has(file));
    if (filter === 'favs') applyFilter();
    updateShortlistCounts();
    persist('/select', favs);
    return true;
  }

  function goFinal() {
    if (favs.size === 0) return;
    // Make sure the shortlist is saved before the step that depends on it.
    flushPersist('/select', favs)
      .then((res) => { if (res.data) state = res.data; view = 'final'; route(); })
      .catch((e) => setStatus(e.message, true));
  }

  // ── Final picks (step 2) ──────────────────────────────────────────────────
  function finalProgHtml() {
    return '<div class="prog"><span class="lbl"><span data-fincount>' + fin.size + '</span> of ' + state.cap + ' chosen</span>'
      + '<div class="bar"><span data-finbar></span></div></div>';
  }
  function finalCtaHtml() {
    return finalProgHtml() + '<button type="button" class="btn primary" data-submit>Send</button>';
  }

  function updateFinalCounts() {
    const n = fin.size;
    document.querySelectorAll('[data-fincount]').forEach((x) => { x.textContent = n; });
    document.querySelectorAll('[data-finbar]').forEach((x) => { x.style.width = Math.min(100, Math.round((n / Math.max(1, state.cap)) * 100)) + '%'; });
    document.querySelectorAll('[data-submit]').forEach((b) => {
      b.disabled = n === 0;
      b.textContent = n === 0 ? 'Send' : 'Send ' + plural(n, 'photo');
    });
    Lightbox.sync();
  }

  function renderFinal() {
    const short = state.items.filter((it) => favs.has(it.file));
    const sub = 'From your ' + short.length + ' shortlisted. ' + (COARSE ? 'Tap' : 'Click') + ' a photo to view it, ' + TAP + ' the circle to choose it.';
    app.replaceChildren(el(
      '<div class="shell">'
      + header(sub,
        '<button type="button" class="pill wide-only" data-clear>Clear</button><div class="progress">' + finalCtaHtml() + '</div>',
        { back: true, eyebrow: 'Step 2 of 2 · ' + esc(state.albumName), title: 'Choose your final ' + state.cap })
      + '<div class="main"><div class="final-prog phone-only">' + finalProgHtml() + '<button type="button" class="pill" data-clear>Clear</button></div>'
      + '<p id="status" class="status above" aria-live="polite"></p>'
      + '<div class="grid" id="grid"></div></div>'
      + '<div class="foot-bar"><button type="button" class="btn primary block" data-submit>Send</button></div>'
      + '</div>',
    ));
    app.querySelector('.back').onclick = goBack;
    app.querySelectorAll('[data-clear]').forEach((b) => { b.onclick = clearFinal; });
    grid = new Grid(document.getElementById('grid'), short, {
      tick: true,
      isOn: (f) => fin.has(f),
      onToggle: toggleFinal,
      onOpen: (file) => Lightbox.open(short.map((it) => it.file), file, 'final'),
    });
    document.querySelectorAll('[data-submit]').forEach((b) => { b.onclick = confirmSubmit; });
    updateFinalCounts();
  }

  function goBack() {
    flushPersist('/final', fin).catch(() => {});
    view = 'shortlist';
    route();
  }

  /** Toggle one final pick and persist. Returns false if the cap blocked it. */
  function toggleFinal(file) {
    if (!state || state.phase !== 'proofing' || !favs.has(file)) return false;
    if (fin.has(file)) {
      fin.delete(file);
    } else {
      if (fin.size >= state.cap) {
        setStatus('You can choose up to ' + plural(state.cap, 'photo') + '. Un-choose one to swap it.', true);
        return false;
      }
      fin.add(file);
    }
    if (grid) grid.setOn(file, fin.has(file));
    updateFinalCounts();
    persist('/final', fin);
    return true;
  }

  function clearFinal() {
    if (fin.size === 0) return;
    fin.forEach((f) => grid && grid.setOn(f, false));
    fin.clear();
    updateFinalCounts();
    persist('/final', fin);
  }

  function confirmSubmit() {
    const n = fin.size;
    if (n === 0) return;
    const extra = favs.size - n;
    const overlay = el(
      '<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="mTitle"><div class="modal">'
      + '<h2 id="mTitle">Send your ' + plural(n, 'final pick') + '?</h2>'
      + '<p class="muted">' + (extra > 0 ? 'The other ' + plural(extra, 'photo') + ' on your shortlist won’t be edited. ' : '') + 'Once sent, your choice is final and can’t be changed.</p>'
      + '<div class="actions"><button type="button" class="btn" id="mCancel">Keep choosing</button><button type="button" class="btn primary" id="mOk">Send</button></div>'
      + '</div></div>',
    );
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#mCancel').onclick = close;
    overlay.querySelector('#mOk').onclick = () => { close(); doSubmit(); };
    overlay.querySelector('#mOk').focus();
  }

  function doSubmit() {
    document.querySelectorAll('[data-submit]').forEach((b) => { b.disabled = true; });
    setStatus('Sending…');
    flushPersist('/final', fin)
      .then(() => post('/submit'))
      .then((res) => { state = res.data; syncSets(); view = 'shortlist'; route(); })
      .catch((e) => { setStatus(e.message, true); updateFinalCounts(); });
  }

  // ── Submitted ─────────────────────────────────────────────────────────────
  function renderSubmitted() {
    const picked = state.items.filter((it) => it.final);
    const extras = state.items.filter((it) => it.selected && !it.final);
    app.replaceChildren(el(
      '<div class="shell">'
      + header('Your final picks have been sent')
      + '<div class="main">'
      + '<div class="info"><div class="title"><span class="tick">' + ICON.tick + '</span>Your ' + plural(picked.length, 'final pick') + ' are in</div>'
      + '<p class="muted">' + esc(state.whatsNext) + '</p></div>'
      + (picked.length ? '<div class="sec"><strong>Your final picks</strong><span>' + picked.length + '</span></div><div class="grid" id="grid"></div>' : '')
      + (extras.length ? '<div class="sec dim"><strong>Also on your shortlist</strong><span>' + extras.length + ' · not being edited</span></div><div class="grid dim" id="grid2"></div>'
        + '<p class="hint" style="margin-top:18px">Want any of the extras edited too? Just reply to the message I sent you.</p>' : '')
      + '</div></div>',
    ));
    if (picked.length) {
      grid = new Grid(document.getElementById('grid'), picked, {
        onOpen: (file) => Lightbox.open(picked.map((it) => it.file), file, 'view'),
      });
    }
    if (extras.length) {
      // Second grid: not tracked as `grid` (no relayout hooks needed beyond its own observer).
      new Grid(document.getElementById('grid2'), extras, {
        onOpen: (file) => Lightbox.open(extras.map((it) => it.file), file, 'view'),
      });
    }
  }

  // ── Delivery ──────────────────────────────────────────────────────────────
  function renderDelivery() {
    // A download-everything share has no picks: every photo is downloadable.
    // A proofing share delivers only the client's final picks.
    const files = state.kind === 'delivery' ? state.items : state.items.filter((it) => it.final);
    const size = fmtBytes(state.downloadBytes);
    const sub = 'Your final photos are ready · ' + plural(files.length, 'photo') + ' · full resolution';
    const dl = '<a class="btn primary" href="' + API + '/download-all" download>' + ICON.down + 'Download all (' + files.length + (size ? ' · ' + size : '') + ')</a>';
    app.replaceChildren(el(
      '<div class="shell">'
      + header(sub, '<div class="progress"><div class="dl-wrap" style="margin:0">' + dl + '<span class="hint">One zip file, or save photos one at a time below.</span></div></div>')
      + '<div class="main">'
      + '<div class="dl-wrap phone-only">' + dl + '<span class="hint">One zip file' + (COARSE ? ' — on a phone, Wi‑Fi is a good idea' : '') + '. Or save photos one at a time below.</span></div>'
      + '<div class="sec"><strong>Your photos</strong><span>' + (COARSE ? 'Tap a photo to view · Save keeps it on your phone' : 'Click a photo to view') + '</span></div>'
      + '<div class="grid" id="grid"></div>'
      + '<p id="status" class="status" aria-live="polite"></p>'
      + '<p class="hint" style="margin-top:18px">Thank you for choosing ' + esc(state.brandName) + '</p>'
      + '</div></div>',
    ));
    grid = new Grid(document.getElementById('grid'), files, {
      save: true,
      onOpen: (file) => Lightbox.open(files.map((it) => it.file), file, 'download'),
    });
  }

  /** Save one original. On touch devices use the share sheet (which offers
   *  "Save Image"); elsewhere a plain download. */
  async function saveFile(file, btn) {
    const label = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }
    try {
      const canShare = COARSE && navigator.share && navigator.canShare;
      if (!canShare) {
        const a = document.createElement('a');
        a.href = downloadUrl(file);
        a.download = file;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      const r = await fetch(downloadUrl(file), { credentials: 'same-origin' });
      if (!r.ok) throw new Error('Could not fetch the photo');
      const blob = await r.blob();
      const f = new File([blob], file, { type: blob.type || 'image/jpeg' });
      if (navigator.canShare({ files: [f] })) {
        try { await navigator.share({ files: [f] }); } catch (e) { /* cancelled */ }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setStatus(e.message, true);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = label; }
    }
  }

  // ── Lightbox ──────────────────────────────────────────────────────────────
  // Full-screen preview with swipe/arrow/keyboard navigation, prev/next
  // preloading, double-tap zoom, and the back gesture closing it. Modes:
  // 'select' (shortlist heart), 'final' (choose tick), 'view' (read-only),
  // 'download' (Save button).
  const Lightbox = (function () {
    let lb = null; // { files, idx, mode, el, img, zoomed, pushed }
    let viaHistory = false;

    function preload(i) {
      if (!lb || i < 0 || i >= lb.files.length) return;
      const im = new Image();
      im.src = previewUrl(lb.files[i]);
    }

    function sync() {
      if (!lb) return;
      const file = lb.files[lb.idx];
      if (lb.img.dataset.file !== file) {
        lb.img.dataset.file = file;
        lb.img.classList.add('loading');
        unzoom();
        lb.img.src = previewUrl(file);
        preload(lb.idx + 1);
        preload(lb.idx - 1);
      }
      lb.el.querySelector('.pos').textContent = (lb.idx + 1) + ' / ' + lb.files.length;
      const cnt = lb.el.querySelector('.cnt .lbl');
      if (cnt) cnt.textContent = lb.mode === 'final' ? fin.size + ' of ' + state.cap : favs.size + ' shortlisted';
      const act = lb.el.querySelector('.btn.act');
      const note = lb.el.querySelector('.lb-note');
      if (act && lb.mode === 'select') {
        const on = favs.has(file);
        act.classList.toggle('off', !on);
        act.setAttribute('aria-pressed', String(on));
        act.querySelector('.lbl').textContent = on ? 'Shortlisted' : 'Add to shortlist';
        note.textContent = on ? 'Tap again to remove it from your shortlist' : '';
        note.classList.remove('err');
      }
      if (act && lb.mode === 'final') {
        const on = fin.has(file);
        act.classList.toggle('off', !on);
        act.setAttribute('aria-pressed', String(on));
        act.querySelector('.lbl').textContent = on ? 'Chosen' : 'Choose this photo';
        note.textContent = on ? 'Tap again to un-choose it' : '';
        note.classList.remove('err');
      }
    }

    function unzoom() {
      if (!lb) return;
      lb.zoomed = false;
      lb.img.style.transform = '';
    }

    function zoomAt(x, y) {
      if (!lb) return;
      if (lb.zoomed) { unzoom(); return; }
      const r = lb.img.getBoundingClientRect();
      const px = Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100));
      const py = Math.max(0, Math.min(100, ((y - r.top) / r.height) * 100));
      lb.img.style.transformOrigin = px + '% ' + py + '%';
      lb.img.style.transform = 'scale(2.5)';
      lb.zoomed = true;
    }

    function step(d) {
      if (!lb || lb.files.length < 2) return;
      lb.idx = (lb.idx + d + lb.files.length) % lb.files.length;
      sync();
    }

    function keys(ev) {
      if (ev.key === 'Escape') close();
      else if (ev.key === 'ArrowLeft') step(-1);
      else if (ev.key === 'ArrowRight') step(1);
    }

    function onPop() { if (lb) { viaHistory = true; close(); } }

    function close() {
      if (!lb) return;
      document.removeEventListener('keydown', keys);
      window.removeEventListener('popstate', onPop);
      lb.el.remove();
      const pushed = lb.pushed;
      lb = null;
      document.body.style.overflow = '';
      if (pushed && !viaHistory && history.state && history.state.lb) history.back();
      viaHistory = false;
    }

    function open(files, file, mode) {
      close();
      const idx = Math.max(0, files.indexOf(file));
      const pickable = mode === 'select' || mode === 'final';
      const icon = mode === 'final' ? ICON.tickDot : ICON.heart;
      const node = el(
        '<div class="lb" role="dialog" aria-modal="true" aria-label="Photo viewer">'
        + '<div class="lb-top"><button type="button" class="icon-btn x" aria-label="Close">' + ICON.close + '</button>'
        + '<span class="pos"></span>'
        + (pickable ? '<span class="cnt">' + icon + '<span class="lbl"></span></span>' : '')
        + '</div>'
        + '<div class="lb-stage"><img class="lb-img loading" alt=""/>'
        + '<button type="button" class="icon-btn lb-nav prev" aria-label="Previous photo">' + ICON.prev + '</button>'
        + '<button type="button" class="icon-btn lb-nav next" aria-label="Next photo">' + ICON.next + '</button>'
        + '<span class="lb-tip">' + (COARSE ? 'Swipe to move between photos · double-tap to zoom' : 'Arrow keys to move · double-click to zoom') + '</span>'
        + '</div>'
        + '<div class="lb-bottom">'
        + (pickable ? '<button type="button" class="btn primary act ' + mode + '" aria-pressed="false">' + icon + '<span class="lbl"></span></button><p class="lb-note"></p>' : '')
        + (mode === 'download' ? '<button type="button" class="btn primary dl">' + ICON.down + 'Save this photo</button>' : '')
        + '</div></div>',
      );
      document.body.appendChild(node);
      document.body.style.overflow = 'hidden';
      lb = { files, idx, mode, el: node, img: node.querySelector('.lb-img'), zoomed: false, pushed: false };

      lb.img.onload = () => lb && lb.img.classList.remove('loading');
      node.querySelector('.x').onclick = close;
      node.querySelector('.prev').onclick = () => step(-1);
      node.querySelector('.next').onclick = () => step(1);
      if (files.length < 2) node.querySelectorAll('.lb-nav').forEach((b) => { b.style.display = 'none'; });
      const stage = node.querySelector('.lb-stage');
      stage.onclick = (ev) => { if (ev.target === stage) close(); };
      lb.img.ondblclick = (ev) => zoomAt(ev.clientX, ev.clientY);

      const act = node.querySelector('.btn.act');
      if (act) {
        act.onclick = () => {
          const ok = mode === 'final' ? toggleFinal(lb.files[lb.idx]) : toggleFav(lb.files[lb.idx]);
          if (!ok && mode === 'final') {
            const note = node.querySelector('.lb-note');
            note.textContent = 'You can choose up to ' + plural(state.cap, 'photo') + '. Un-choose one to swap it.';
            note.classList.add('err');
          }
        };
      }
      const dl = node.querySelector('.btn.dl');
      if (dl) dl.onclick = () => saveFile(lb.files[lb.idx], dl);

      // Touch: horizontal swipe steps (unless zoomed); a quick second tap zooms.
      let x0 = null, y0 = null, lastTap = 0;
      stage.addEventListener('touchstart', (ev) => {
        if (ev.touches.length !== 1) { x0 = null; return; }
        x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY;
      }, { passive: true });
      stage.addEventListener('touchend', (ev) => {
        if (ev.touches.length > 0) return;
        const t = ev.changedTouches[0];
        const now = Date.now();
        if (x0 !== null) {
          const dx = t.clientX - x0, dy = t.clientY - y0;
          if (!lb.zoomed && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { step(dx < 0 ? 1 : -1); x0 = null; lastTap = 0; return; }
          if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && ev.target === lb.img) {
            if (now - lastTap < 300) { zoomAt(t.clientX, t.clientY); lastTap = 0; }
            else lastTap = now;
          }
        }
        x0 = null;
      }, { passive: true });

      document.addEventListener('keydown', keys);
      // Android/browser back closes the viewer instead of leaving the page.
      try { history.pushState({ lb: 1 }, ''); lb.pushed = true; } catch (e) { /* ignore */ }
      window.addEventListener('popstate', onPop);
      sync();
    }

    return { open, close, step, sync };
  })();

  // ── Boot ──────────────────────────────────────────────────────────────────
  api('/list', {})
    .then((res) => { state = res.unauth ? null : res.data; if (state) syncSets(); route(); })
    .catch(() => { state = null; route(); });
})();

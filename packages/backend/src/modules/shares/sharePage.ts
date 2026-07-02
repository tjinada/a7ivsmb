// Standalone client proofing page served at /s/:slug on the share host. It is
// deliberately NOT part of the React PWA: a single self-contained HTML document
// with inline CSS + vanilla JS, so there is no service worker, no app shell,
// and nothing that could leak the owner gallery. The slug is injected server
// side; everything else is driven by the /api/public/share/:slug endpoints.

const JS_CORE = `
const API = '/api/public/share/' + SLUG;
let state = null;
const sel = new Set();
const $ = (id) => document.getElementById(id);

function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;');
}
function previewUrl(file){ return API + '/preview/' + encodeURIComponent(file); }
function setStatus(msg, isErr){
  const s = $('status'); if(!s) return;
  s.textContent = msg || '';
  s.className = 'status' + (isErr ? ' err' : '');
}

async function api(pathName, opts){
  const r = await fetch(API + pathName, Object.assign({ credentials: 'same-origin' }, opts || {}));
  if(r.status === 401) return { unauth: true };
  let body = null;
  try { body = await r.json(); } catch(e) { body = null; }
  if(!r.ok) throw new Error((body && body.message) || 'Something went wrong');
  return { data: body && body.data };
}
`;

const JS_VIEWS = `
let cells = new Map();

function syncSel(){ sel.clear(); state.items.forEach((it) => { if(it.selected) sel.add(it.file); }); }

function route(){
  lbClose();
  if(!state){ renderGate(); return; }
  if(state.phase === 'delivery') renderDelivery();
  else if(state.phase === 'submitted') renderSubmitted();
  else renderProofing();
}

function renderGate(){
  $('app').innerHTML =
    '<div class="card center">'
    + '<h1>Private gallery</h1>'
    + '<p class="muted">Enter the password you were given to view the photos.</p>'
    + '<input id="pw" type="password" placeholder="Password" autocomplete="off"/>'
    + '<button id="go" class="btn primary">Unlock</button>'
    + '<p id="gerr" class="status err"></p>'
    + '</div>';
  const go = $('go'), pw = $('pw');
  function attempt(){
    go.disabled = true; $('gerr').textContent = '';
    api('/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password: pw.value }) })
      .then((res) => { state = res.data; syncSel(); route(); })
      .catch((e) => { $('gerr').textContent = e.message; go.disabled = false; });
  }
  go.onclick = attempt;
  pw.addEventListener('keydown', (ev) => { if(ev.key === 'Enter') attempt(); });
  pw.focus();
}

function renderProofing(){
  cells = new Map();
  $('app').innerHTML =
    '<div class="bar"><div><strong>' + escapeHtml(state.albumName) + '</strong>'
    + '<div class="muted">Tap to choose your favourites</div></div>'
    + '<div class="counter"><span id="cnt">' + sel.size + '</span> / ' + state.cap + '</div></div>'
    + '<div class="grid" id="grid"></div>'
    + '<div class="footer"><p id="status" class="status"></p>'
    + '<button id="submit" class="btn primary">Submit selection</button></div>';
  const grid = $('grid');
  const files = state.items.map((it) => it.file);
  state.items.forEach((it, i) => {
    const fig = document.createElement('figure');
    fig.className = 'cell' + (sel.has(it.file) ? ' on' : '');
    fig.innerHTML = '<img loading="lazy" src="' + previewUrl(it.file) + '" alt=""/><span class="tick">✓</span>'
      + '<button type="button" class="expand" aria-label="View larger">⤢</button>';
    fig.onclick = () => toggleSel(it.file);
    fig.querySelector('.expand').onclick = (ev) => { ev.stopPropagation(); openLightbox(files, i, 'select'); };
    cells.set(it.file, fig);
    grid.appendChild(fig);
  });
  updateSubmit();
  $('submit').onclick = confirmSubmit;
}

/** Repaint everything selection-dependent (grid ticks, counters, lightbox). */
function applySelUi(){
  cells.forEach((fig, file) => fig.classList.toggle('on', sel.has(file)));
  const c = $('cnt'); if(c) c.textContent = sel.size;
  updateSubmit();
  lbSync();
}

/** Toggle one file's selection and persist. Returns false if the cap blocked it. */
function toggleSel(file){
  if(sel.has(file)){ sel.delete(file); }
  else {
    if(sel.size >= state.cap){ setStatus('You can pick at most ' + state.cap + ' photos.', true); return false; }
    sel.add(file);
  }
  applySelUi();
  setStatus('Saving…');
  api('/select', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ files: Array.from(sel) }) })
    .then((res) => { state = res.data; setStatus(''); })
    .catch((e) => setStatus(e.message, true));
  return true;
}

function updateSubmit(){
  const b = $('submit');
  if(!b) return;
  b.disabled = sel.size === 0;
  b.textContent = sel.size === 0
    ? 'Submit selection'
    : 'Submit ' + sel.size + ' photo' + (sel.size === 1 ? '' : 's');
}

function confirmSubmit(){
  const n = sel.size;
  if(n === 0) return;
  const remaining = state.cap - n;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML =
    '<div class="modal">'
    + '<h2>Submit your selection?</h2>'
    + '<p class="muted">You have selected ' + n + ' of ' + state.cap + ' photo' + (state.cap === 1 ? '' : 's') + '.'
    + (remaining > 0 ? ' You can still choose up to ' + remaining + ' more.' : '')
    + '</p>'
    + '<p class="muted">Once you submit, your selection is final and cannot be changed.</p>'
    + '<div class="modal-actions">'
    + '<button class="btn" id="mCancel">Keep choosing</button>'
    + '<button class="btn primary" id="mOk">Submit</button>'
    + '</div></div>';
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if(e.target === overlay) close(); });
  $('mCancel').onclick = close;
  $('mOk').onclick = () => { close(); doSubmit(); };
}

function doSubmit(){
  const b = $('submit'); b.disabled = true; setStatus('Submitting…');
  api('/submit', { method:'POST' })
    .then((res) => { state = res.data; route(); })
    .catch((e) => { setStatus(e.message, true); b.disabled = false; });
}
`;

// Full-screen lightbox: full-aspect previews with swipe/arrow navigation.
// Modes: 'select' (proofing; Select/Deselect button drives the same selection
// logic as the grid), 'view' (submitted; read-only), 'download' (delivery).
const JS_LIGHTBOX = `
let lb = null; // { files, idx, mode, el }

function lbSync(){
  if(!lb) return;
  const file = lb.files[lb.idx];
  const img = lb.el.querySelector('.lb-img');
  if(img.dataset.file !== file){
    img.dataset.file = file;
    img.src = previewUrl(file);
  }
  lb.el.querySelector('.lb-pos').textContent = (lb.idx + 1) + ' / ' + lb.files.length;
  const cnt = lb.el.querySelector('.lb-cnt');
  if(cnt) cnt.textContent = sel.size + ' / ' + state.cap + ' picked';
  const act = lb.el.querySelector('.lb-action');
  if(act && lb.mode === 'select'){
    act.textContent = sel.has(file) ? 'Deselect' : 'Select';
    act.classList.toggle('primary', !sel.has(file));
  }
  if(act && lb.mode === 'download'){
    act.href = API + '/download/' + encodeURIComponent(file);
  }
}

function lbClose(){
  if(!lb) return;
  document.removeEventListener('keydown', lbKeys);
  lb.el.remove();
  lb = null;
}

function lbStep(d){
  if(!lb) return;
  lb.idx = (lb.idx + d + lb.files.length) % lb.files.length;
  const note = lb.el.querySelector('.lb-note');
  if(note) note.textContent = '';
  lbSync();
}

function lbKeys(ev){
  if(ev.key === 'Escape') lbClose();
  else if(ev.key === 'ArrowLeft') lbStep(-1);
  else if(ev.key === 'ArrowRight') lbStep(1);
}

function openLightbox(files, idx, mode){
  lbClose();
  const el = document.createElement('div');
  el.className = 'lb';
  el.innerHTML =
    '<div class="lb-top"><span class="lb-pos"></span>'
    + (mode === 'select' ? '<span class="lb-cnt"></span>' : '')
    + '<button type="button" class="lb-x" aria-label="Close">✕</button></div>'
    + '<div class="lb-stage"><img class="lb-img" alt=""/></div>'
    + '<button type="button" class="lb-nav lb-prev" aria-label="Previous">‹</button>'
    + '<button type="button" class="lb-nav lb-next" aria-label="Next">›</button>'
    + '<div class="lb-bottom">'
    + (mode === 'select' ? '<p class="lb-note"></p><button type="button" class="btn lb-action"></button>' : '')
    + (mode === 'download' ? '<a class="btn primary lb-action" href="#">Download</a>' : '')
    + '</div>';
  document.body.appendChild(el);
  lb = { files, idx, mode, el };

  el.querySelector('.lb-x').onclick = lbClose;
  el.querySelector('.lb-prev').onclick = () => lbStep(-1);
  el.querySelector('.lb-next').onclick = () => lbStep(1);
  if(files.length < 2){
    el.querySelector('.lb-prev').style.display = 'none';
    el.querySelector('.lb-next').style.display = 'none';
  }
  // Tap the empty stage area (not the photo) to close.
  el.querySelector('.lb-stage').onclick = (ev) => { if(ev.target === ev.currentTarget) lbClose(); };
  const act = el.querySelector('.lb-action');
  if(act && mode === 'select'){
    act.onclick = () => {
      const ok = toggleSel(lb.files[lb.idx]);
      const note = lb.el.querySelector('.lb-note');
      if(note) note.textContent = ok ? '' : 'You can pick at most ' + state.cap + ' photos.';
    };
  }

  // Swipe left/right to navigate (touch devices).
  let x0 = null;
  el.addEventListener('touchstart', (ev) => { x0 = ev.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (ev) => {
    if(x0 === null) return;
    const dx = ev.changedTouches[0].clientX - x0;
    x0 = null;
    if(Math.abs(dx) > 40) lbStep(dx < 0 ? 1 : -1);
  }, { passive: true });

  document.addEventListener('keydown', lbKeys);
  lbSync();
}
`;

const JS_DELIVERY = `
function renderSubmitted(){
  const picked = state.items.filter((it) => it.selected);
  const n = state.selectedCount;
  $('app').innerHTML =
    '<div class="card center">'
    + '<h1>Thank you!</h1>'
    + '<p class="muted">Your selection of ' + n + ' photo' + (n === 1 ? '' : 's')
    + ' has been sent. You\\'ll be able to download the final edits here once they are released.</p>'
    + '</div>'
    + (picked.length ? '<h2 class="sec">Your selection (' + picked.length + ')</h2><div class="grid" id="grid"></div>' : '');
  if(!picked.length) return;
  const files = picked.map((it) => it.file);
  const grid = $('grid');
  picked.forEach((it, i) => {
    const fig = document.createElement('figure');
    fig.className = 'cell';
    fig.innerHTML = '<img loading="lazy" src="' + previewUrl(it.file) + '" alt=""/>';
    fig.onclick = () => openLightbox(files, i, 'view');
    grid.appendChild(fig);
  });
}

function renderDelivery(){
  const picked = state.items.filter((it) => it.selected);
  const files = picked.map((it) => it.file);
  $('app').innerHTML =
    '<div class="bar"><div><strong>' + escapeHtml(state.albumName) + '</strong>'
    + '<div class="muted">Your final images are ready</div></div>'
    + '<a class="btn primary" href="' + API + '/download-all">Download all</a></div>'
    + '<div class="grid" id="grid"></div>';
  const grid = $('grid');
  picked.forEach((it, i) => {
    const fig = document.createElement('figure');
    fig.className = 'cell';
    fig.innerHTML = '<img loading="lazy" src="' + previewUrl(it.file) + '" alt=""/>'
      + '<a class="dl" href="' + API + '/download/' + encodeURIComponent(it.file) + '">Download</a>';
    fig.onclick = () => openLightbox(files, i, 'download');
    fig.querySelector('.dl').onclick = (ev) => ev.stopPropagation();
    grid.appendChild(fig);
  });
}

api('/list', {})
  .then((res) => { state = res.unauth ? null : res.data; if(state) syncSel(); route(); })
  .catch(() => renderGate());
`;

const CLIENT_JS = JS_CORE + JS_VIEWS + JS_LIGHTBOX + JS_DELIVERY;

const PAGE_CSS = `
:root{ --bg:#0b0d10; --surface:#15181d; --border:#262b33; --text:#e7e9ee; --muted:#9aa3b2; --primary:#4f7cff; }
*{ box-sizing:border-box; }
html,body{ margin:0; background:var(--bg); color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
#app{ max-width:1100px; margin:0 auto; padding:16px 14px 96px; }
h1{ font-size:20px; margin:0 0 8px; }
h2.sec{ font-size:15px; font-weight:600; color:var(--muted); margin:26px 0 10px; }
.muted{ color:var(--muted); font-size:14px; line-height:1.45; }
.card{ background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:22px;
  max-width:360px; margin:14vh auto 0; }
.center{ text-align:center; }
.card input{ width:100%; margin:14px 0 12px; padding:11px 12px; border-radius:10px; border:1px solid var(--border);
  background:var(--bg); color:var(--text); font-size:15px; outline:none; }
.card input:focus{ border-color:var(--primary); }
.btn{ display:inline-block; text-decoration:none; text-align:center; cursor:pointer; border:1px solid var(--border);
  background:var(--surface); color:var(--text); padding:10px 16px; border-radius:10px; font-size:14px; font-weight:600; }
.btn.primary{ background:var(--primary); border-color:var(--primary); color:#fff; width:100%; }
.btn:disabled{ opacity:.45; cursor:default; }
.bar{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }
.bar .btn{ width:auto; flex:none; }
.counter{ font-size:15px; font-weight:700; white-space:nowrap; }
.grid{ display:grid; gap:8px; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); }
.cell{ position:relative; margin:0; aspect-ratio:1/1; border-radius:12px; overflow:hidden; background:var(--surface);
  border:2px solid transparent; cursor:pointer; }
.cell img{ width:100%; height:100%; object-fit:cover; display:block; }
.cell.on{ border-color:var(--primary); }
.cell .tick{ position:absolute; top:8px; right:8px; width:26px; height:26px; border-radius:50%;
  background:var(--primary); color:#fff; display:none; align-items:center; justify-content:center; font-size:15px; }
.cell.on .tick{ display:flex; }
.cell .expand{ position:absolute; top:6px; left:6px; width:38px; height:38px; border-radius:50%; border:none;
  background:rgba(0,0,0,.5); color:#fff; font-size:17px; display:flex; align-items:center; justify-content:center;
  cursor:pointer; padding:0; }
.cell .dl{ position:absolute; left:8px; right:8px; bottom:8px; text-align:center; padding:7px;
  background:rgba(0,0,0,.6); color:#fff; text-decoration:none; border-radius:8px; font-size:13px; font-weight:600; }
.footer{ position:fixed; left:0; right:0; bottom:0; background:linear-gradient(transparent,var(--bg) 28%);
  padding:14px; }
.footer .btn{ max-width:1072px; margin:0 auto; display:block; }
.status{ text-align:center; min-height:18px; margin:0 0 8px; font-size:13px; color:var(--muted); }
.status.err{ color:#ff6b6b; }
.overlay{ position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; align-items:center;
  justify-content:center; padding:24px; z-index:100; }
.modal{ background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:20px;
  max-width:340px; width:100%; }
.modal h2{ font-size:17px; margin:0 0 10px; }
.modal .muted{ margin:0 0 10px; }
.modal-actions{ display:flex; gap:10px; margin-top:16px; }
.modal-actions .btn{ flex:1; width:auto; }
.lb{ position:fixed; inset:0; z-index:200; background:rgba(4,6,9,.96); display:flex; flex-direction:column; }
.lb-top{ display:flex; align-items:center; gap:14px; padding:12px 14px; color:var(--muted); font-size:14px; }
.lb-top .lb-cnt{ font-weight:700; color:var(--text); }
.lb-x{ margin-left:auto; width:38px; height:38px; border-radius:50%; border:none;
  background:rgba(255,255,255,.08); color:#fff; font-size:16px; cursor:pointer; }
.lb-stage{ flex:1; min-height:0; display:flex; align-items:center; justify-content:center; padding:0 8px; }
.lb-img{ max-width:100%; max-height:100%; object-fit:contain; border-radius:6px; }
.lb-nav{ position:absolute; top:50%; transform:translateY(-50%); width:44px; height:64px; border:none;
  background:rgba(255,255,255,.06); color:#fff; font-size:28px; cursor:pointer; border-radius:10px; }
.lb-prev{ left:6px; }
.lb-next{ right:6px; }
.lb-bottom{ padding:12px 14px calc(14px + env(safe-area-inset-bottom)); }
.lb-bottom .btn{ width:100%; max-width:420px; margin:0 auto; display:block; }
.lb-note{ text-align:center; color:#ff6b6b; font-size:13px; min-height:18px; margin:0 0 8px; }
`;

/** Render the full standalone client page for a share slug. */
export function renderSharePage(slug: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<meta name="robots" content="noindex, nofollow"/>
<title>Private gallery</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<div id="app"><div class="card center"><p class="muted">Loading…</p></div></div>
<script>const SLUG=${JSON.stringify(slug)};</script>
<script>${CLIENT_JS}</script>
</body>
</html>`;
}

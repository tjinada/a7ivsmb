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
function syncSel(){ sel.clear(); state.items.forEach((it) => { if(it.selected) sel.add(it.file); }); }

function route(){
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
  $('app').innerHTML =
    '<div class="bar"><div><strong>' + escapeHtml(state.albumName) + '</strong>'
    + '<div class="muted">Tap to choose your favourites</div></div>'
    + '<div class="counter"><span id="cnt">' + sel.size + '</span> / ' + state.cap + '</div></div>'
    + '<div class="grid" id="grid"></div>'
    + '<div class="footer"><p id="status" class="status"></p>'
    + '<button id="submit" class="btn primary">Submit selection</button></div>';
  const grid = $('grid');
  state.items.forEach((it) => {
    const fig = document.createElement('figure');
    fig.className = 'cell' + (sel.has(it.file) ? ' on' : '');
    fig.innerHTML = '<img loading="lazy" src="' + previewUrl(it.file) + '" alt=""/><span class="tick">✓</span>';
    fig.onclick = () => toggle(it.file, fig);
    grid.appendChild(fig);
  });
  updateSubmit();
  $('submit').onclick = doSubmit;
}

function toggle(file, fig){
  if(sel.has(file)){ sel.delete(file); }
  else {
    if(sel.size >= state.cap){ setStatus('You can pick at most ' + state.cap + ' photos.', true); return; }
    sel.add(file);
  }
  fig.classList.toggle('on');
  $('cnt').textContent = sel.size;
  updateSubmit();
  setStatus('Saving…');
  api('/select', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ files: Array.from(sel) }) })
    .then((res) => { state = res.data; setStatus(''); })
    .catch((e) => setStatus(e.message, true));
}

function updateSubmit(){ const b = $('submit'); if(b) b.disabled = sel.size === 0; }

function doSubmit(){
  const b = $('submit'); b.disabled = true; setStatus('Submitting…');
  api('/submit', { method:'POST' })
    .then((res) => { state = res.data; route(); })
    .catch((e) => { setStatus(e.message, true); b.disabled = false; });
}
`;

const JS_DELIVERY = `
function renderSubmitted(){
  const n = state.selectedCount;
  $('app').innerHTML =
    '<div class="card center">'
    + '<h1>Thank you!</h1>'
    + '<p class="muted">Your selection of ' + n + ' photo' + (n === 1 ? '' : 's')
    + ' has been sent. You\\'ll be able to download the final edits here once they are released.</p>'
    + '</div>';
}

function renderDelivery(){
  const picked = state.items.filter((it) => it.selected);
  let html =
    '<div class="bar"><div><strong>' + escapeHtml(state.albumName) + '</strong>'
    + '<div class="muted">Your final images are ready</div></div>'
    + '<a class="btn primary" href="' + API + '/download-all">Download all</a></div>'
    + '<div class="grid">';
  picked.forEach((it) => {
    html += '<figure class="cell"><img loading="lazy" src="' + previewUrl(it.file) + '" alt=""/>'
      + '<a class="dl" href="' + API + '/download/' + encodeURIComponent(it.file) + '">Download</a></figure>';
  });
  html += '</div>';
  $('app').innerHTML = html;
}

api('/list', {})
  .then((res) => { state = res.unauth ? null : res.data; if(state) syncSel(); route(); })
  .catch(() => renderGate());
`;

const CLIENT_JS = JS_CORE + JS_VIEWS + JS_DELIVERY;

const PAGE_CSS = `
:root{ --bg:#0b0d10; --surface:#15181d; --border:#262b33; --text:#e7e9ee; --muted:#9aa3b2; --primary:#4f7cff; }
*{ box-sizing:border-box; }
html,body{ margin:0; background:var(--bg); color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
#app{ max-width:1100px; margin:0 auto; padding:16px 14px 96px; }
h1{ font-size:20px; margin:0 0 8px; }
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
.cell .dl{ position:absolute; left:8px; right:8px; bottom:8px; text-align:center; padding:7px;
  background:rgba(0,0,0,.6); color:#fff; text-decoration:none; border-radius:8px; font-size:13px; font-weight:600; }
.footer{ position:fixed; left:0; right:0; bottom:0; background:linear-gradient(transparent,var(--bg) 28%);
  padding:14px; }
.footer .btn{ max-width:1072px; margin:0 auto; display:block; }
.status{ text-align:center; min-height:18px; margin:0 0 8px; font-size:13px; color:var(--muted); }
.status.err{ color:#ff6b6b; }
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

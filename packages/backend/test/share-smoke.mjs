// Phase 7 client-share round trip. Backend must be running; pass its base URL
// and the owner password (defaults suit `pnpm dev`):
//   node test/share-smoke.mjs [base] [password]
// Needs an album photos-dev/Albums/SmokeTest/Edited with a few JPGs.
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// Password defaults to APP_PASS from the repo-root .env, like the backend.
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });
const base = process.argv[2] ?? 'http://localhost:3000';
const password = process.argv[3] ?? process.env.APP_PASS ?? 'admin';
const j = (o) => JSON.stringify(o);

async function call(url, opts = {}) {
  const r = await fetch(`${base}${url}`, { redirect: 'manual', ...opts });
  const type = r.headers.get('content-type') ?? '';
  const body = type.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { status: r.status, type, body, cookie: r.headers.get('set-cookie') };
}

// Owner: log in and create a proofing share.
const login = await call('/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password }),
});
const token = login.body.data.token;
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const created = await call('/api/gallery/shares', {
  method: 'POST', headers: auth,
  body: JSON.stringify({ albumPath: 'Albums/SmokeTest', cap: 2, password: 'smoke-pass', kind: 'proofing' }),
});
console.log('CREATE   ', created.status, j({ slug: created.body.data?.slug, previews: created.body.data?.previewCount }));
const { slug, id } = created.body.data;
const pub = `/api/public/share/${slug}`;

// Client: page, gate, unlock, state with dims, thumb, select, submit.
const page = await call(`/s/${slug}`);
const html = page.body.toString();
console.log('PAGE     ', page.status, j({ inlineScript: /<script>(?!<)/.test(html), dataSlug: html.includes(`data-slug="${slug}"`), assets: html.includes('/share-assets/page.js') }));
console.log('LOCKED   ', (await call(`${pub}/list`)).status);
const unlock = await call(`${pub}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'smoke-pass' }) });
const cookie = unlock.cookie?.split(';')[0] ?? '';
const st = unlock.body.data;
console.log('UNLOCK   ', unlock.status, j({ brand: st.brandName, phase: st.phase, items: st.items.map((i) => [i.file, i.w, i.h]) }));
const h = { Cookie: cookie, 'Content-Type': 'application/json' };
const file = st.items[0].file;
const thumb = await call(`${pub}/thumb/${encodeURIComponent(file)}`, { headers: h });
const prev = await call(`${pub}/preview/${encodeURIComponent(file)}`, { headers: h });
console.log('THUMB    ', thumb.status, thumb.type, thumb.body.length, 'bytes; preview', prev.body.length, 'bytes');
console.log('TRAVERSE ', (await call(`${pub}/thumb/..%2F..%2Fshares.json`, { headers: h })).status);
// Shortlist is uncapped (3 > cap 2 is fine); final picks are capped.
const all = st.items.map((i) => i.file);
const sel = await call(`${pub}/select`, { method: 'POST', headers: h, body: JSON.stringify({ files: all.slice(0, 3) }) });
console.log('SHORTLIST', sel.status, j({ selectedCount: sel.body.data?.selectedCount, finalCount: sel.body.data?.finalCount }));
const over = await call(`${pub}/final`, { method: 'POST', headers: h, body: JSON.stringify({ files: all.slice(0, 3) }) });
console.log('OVER-CAP ', over.status, over.body.message);
const early = await call(`${pub}/submit`, { method: 'POST', headers: h });
console.log('NO-FINAL ', early.status, early.body.message);
const fin = await call(`${pub}/final`, { method: 'POST', headers: h, body: JSON.stringify({ files: [file, 'not-shortlisted.jpg'] }) });
console.log('FINAL    ', fin.status, j({ finalCount: fin.body.data?.finalCount, final: fin.body.data?.items.filter((i) => i.final).map((i) => i.file) }));
const sub = await call(`${pub}/submit`, { method: 'POST', headers: h });
console.log('SUBMIT   ', sub.status, j({ phase: sub.body.data?.phase, finalCount: sub.body.data?.finalCount, selectedCount: sub.body.data?.selectedCount }));
const locked = await call(`${pub}/select`, { method: 'POST', headers: h, body: JSON.stringify({ files: all }) });
console.log('LOCKED2  ', locked.status, locked.body.message);

// Owner releases delivery; client sees size and can download.
console.log('DELIVER  ', (await call(`/api/gallery/shares/${id}/delivery`, { method: 'POST', headers: auth })).status);
const del = await call(`${pub}/list`, { headers: h });
console.log('DELIVERY ', del.status, j({ phase: del.body.data?.phase, downloadBytes: del.body.data?.downloadBytes }));
const dl = await call(`${pub}/download/${encodeURIComponent(file)}`, { headers: h });
console.log('DOWNLOAD ', dl.status, dl.type, dl.body.length, 'bytes');
// Shortlisted-but-not-final must not be downloadable.
console.log('NOT-FINAL', (await call(`${pub}/download/${encodeURIComponent(all[1])}`, { headers: h })).status);

// Clean up.
console.log('REVOKE   ', (await call(`/api/gallery/shares/${id}`, { method: 'DELETE', headers: auth })).status);
console.log('INACTIVE ', (await call(`/s/${slug}`)).status);

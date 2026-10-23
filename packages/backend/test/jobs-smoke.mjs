// Phase 9 workflow round trip. Backend must be running; pass its base URL
// and the owner password (defaults suit `pnpm dev`):
//   node test/jobs-smoke.mjs [base] [password]
// Needs a dated folder photos-dev/2026-10-22 and an album
// photos-dev/Albums/SmokeTest with JPGs in Edited/. Cleans up after itself.
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });
const base = process.argv[2] ?? 'http://localhost:3000';
const password = process.argv[3] ?? process.env.APP_PASS ?? 'admin';
const FOLDER = '2026-10-22';
const ALBUM = 'Albums/SmokeTest';

async function call(url, method = 'GET', body) {
  const r = await fetch(`${base}${url}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await r.json();
  return { status: r.status, data: json.data, message: json.message };
}
const show = (label, r, pick = (d) => ({ step: d?.step, album: d?.albumPath, mode: d?.pickMode, shots: d?.shots, edited: d?.edited })) =>
  console.log(label.padEnd(12), r.status, r.status < 300 ? JSON.stringify(pick(r.data)) : r.message);

let token = '';
const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password }),
});
token = (await login.json()).data.token;

// A leftover job from an aborted run would 409 the create.
const stale = await call(`/api/jobs/by-folder?path=${encodeURIComponent(FOLDER)}`);
if (stale.status === 200) await call(`/api/jobs/${stale.data.id}`, 'DELETE');

const created = await call('/api/jobs', 'POST', { folderPath: FOLDER });
show('CREATE', created);
const id = created.data.id;
show('DUPLICATE', await call('/api/jobs', 'POST', { folderPath: FOLDER }));
show('NOT-DATED', await call('/api/jobs', 'POST', { folderPath: ALBUM }));
show('BY-FOLDER', await call(`/api/jobs/by-folder?path=${FOLDER}`));
show('EDIT-NOALB', await call(`/api/jobs/${id}`, 'PATCH', { step: 'edit' }));
show('SKIP-AHEAD', await call(`/api/jobs/${id}`, 'PATCH', { albumPath: ALBUM, step: 'pick' }));
show('EDIT', await call(`/api/jobs/${id}`, 'PATCH', { albumPath: ALBUM, step: 'edit' }));
show('BY-ALBUM', await call(`/api/jobs/by-album?path=${encodeURIComponent(ALBUM)}`));
show('PICK', await call(`/api/jobs/${id}`, 'PATCH', { step: 'pick' }));
show('DLV-NOMODE', await call(`/api/jobs/${id}`, 'PATCH', { step: 'deliver' }));
show('BACK-EDIT', await call(`/api/jobs/${id}`, 'PATCH', { step: 'edit' }));
show('PICK', await call(`/api/jobs/${id}`, 'PATCH', { step: 'pick' }));
show('DELIVER-ALL', await call(`/api/jobs/${id}`, 'PATCH', { pickMode: 'all', step: 'deliver' }));
show('DONE-NOSHR', await call(`/api/jobs/${id}`, 'PATCH', { step: 'done' }));

const share = await call('/api/gallery/shares', 'POST', { albumPath: ALBUM, password: 'smoke-pass', kind: 'delivery' });
console.log('SHARE'.padEnd(12), share.status, share.data?.phase);
show('LINK-SHARE', await call(`/api/jobs/${id}`, 'PATCH', { shareId: share.data.id }), (d) => ({ shareId: !!d.shareId, phase: d.share?.phase }));
show('DONE', await call(`/api/jobs/${id}`, 'PATCH', { step: 'done' }), (d) => ({ step: d.step, at: Object.keys(d.stepAt) }));
show('AFTER-DONE', await call(`/api/jobs/${id}`, 'PATCH', { step: 'deliver' }));
const list = await call('/api/jobs');
console.log('LIST'.padEnd(12), list.status, list.data.length, 'job(s)');

await call(`/api/gallery/shares/${share.data.id}`, 'DELETE');
show('DELETE', await call(`/api/jobs/${id}`, 'DELETE'), () => ({ ok: true }));

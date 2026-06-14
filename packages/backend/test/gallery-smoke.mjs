// Phase 3 gallery validation. Backend must be running on :3000.
//   node test/gallery-smoke.mjs
const base = 'http://localhost:3000';

async function login() {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  });
  return (await r.json()).data.token;
}

async function probe(token, url) {
  const r = await fetch(`${base}${url}`, { headers: { Authorization: `Bearer ${token}` } });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, type: r.headers.get('content-type'), bytes: buf.length, disp: r.headers.get('content-disposition') };
}

const token = await login();
const j = (o) => JSON.stringify(o);
console.log('THUMB    ', j(await probe(token, '/api/gallery/thumb?path=sample.jpg')));
console.log('THUMB2   ', j(await probe(token, '/api/gallery/thumb?path=sample.jpg')));
console.log('PREVIEW  ', j(await probe(token, '/api/gallery/preview?path=sample.jpg')));
console.log('ORIGINAL ', j(await probe(token, '/api/gallery/original?path=sample.jpg')));
console.log('BADIMG   ', j(await probe(token, '/api/gallery/thumb?path=DSC_TEST.JPG')));
console.log('TRAVERSAL', j(await probe(token, '/api/gallery/thumb?path=../../package.json')));

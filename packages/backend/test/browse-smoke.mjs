// Phase 3 (folder-aware) validation. Backend running on :3000.
const base = 'http://localhost:3000';
const login = async () => (await (await fetch(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin' }),
})).json()).data.token;

const token = await login();
const H = { Authorization: `Bearer ${token}` };

const getJson = async (url) => {
  const r = await fetch(`${base}${url}`, { headers: H });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const getBin = async (url) => {
  const r = await fetch(`${base}${url}`, { headers: H });
  return { status: r.status, type: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength };
};

const root = await getJson('/api/gallery/browse');
console.log('ROOT folders =', root.body.data.folders.map((f) => f.name), 'items =', root.body.data.items.length);

const jpg = await getJson('/api/gallery/browse?path=' + encodeURIComponent('June Photos JPG'));
console.log('JPG items =', jpg.body.data.items.map((i) => `${i.name}:${i.kind}`), 'parent =', JSON.stringify(jpg.body.data.parent));

const raw = await getJson('/api/gallery/browse?path=' + encodeURIComponent('June Photos RAW'));
console.log('RAW items =', raw.body.data.items.map((i) => `${i.name}:${i.kind}`));

const thumb = await getBin('/api/gallery/thumb?path=' + encodeURIComponent('June Photos JPG/DSC0001.JPG'));
console.log('THUMB', JSON.stringify(thumb));

const trav = await getJson('/api/gallery/browse?path=' + encodeURIComponent('../..'));
console.log('TRAVERSAL status =', trav.status);

const base = 'http://localhost:3000';
const j = async (url, opts) => { const r = await fetch(base+url, opts); return { status: r.status, body: await r.json().catch(()=>null) }; };
const token = (await (await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin'})})).json()).data.token;
const H = { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' };

// rate DSC1 so we can verify the rating entry is removed on delete
await j('/api/gallery/rating', { method:'PUT', headers:H, body: JSON.stringify({path:'DSC1.JPG', stars:5}) });

// ZIP DSC1 + DSC3
const zr = await fetch(base+'/api/gallery/zip', { method:'POST', headers:H, body: JSON.stringify({paths:['DSC1.JPG','DSC3.ARW']}) });
const buf = Buffer.from(await zr.arrayBuffer());
const isZip = buf.slice(0,2).toString('latin1') === 'PK';
const txt = buf.toString('latin1');
console.log('ZIP status', zr.status, 'bytes', buf.length, 'PK', isZip, 'hasDSC1', txt.includes('DSC1.JPG'), 'hasDSC3', txt.includes('DSC3.ARW'));

// DELETE DSC2
const d1 = await j('/api/gallery/delete', { method:'POST', headers:H, body: JSON.stringify({paths:['DSC2.JPG']}) });
console.log('DELETE DSC2', d1.status, JSON.stringify(d1.body.data));

// DELETE rated DSC1
const d2 = await j('/api/gallery/delete', { method:'POST', headers:H, body: JSON.stringify({paths:['DSC1.JPG']}) });
console.log('DELETE DSC1', d2.status, JSON.stringify(d2.body.data));

// traversal
const t = await j('/api/gallery/delete', { method:'POST', headers:H, body: JSON.stringify({paths:['../escape.jpg']}) });
console.log('TRAVERSAL status', t.status);

// what remains
const b = await j('/api/gallery/browse', { headers:H });
console.log('REMAINING', b.body.data.items.map(i=>i.name).join(', ') || '(none)');
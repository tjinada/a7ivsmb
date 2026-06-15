import { Client } from 'basic-ftp';
import { Readable } from 'node:stream';
const up = async (c, name, content) => { await c.uploadFrom(Readable.from(Buffer.from(content)), name); };
const c = new Client(15000);
try {
  await c.access({ host: '127.0.0.1', port: 2121, user: 'camera', password: 'camerapass', secure: false });
  await up(c, 'DSC_AUTO.JPG', 'fake-jpeg-bytes');
  await up(c, 'DSC_AUTO.ARW', 'fake-raw-bytes');
  console.log('UPLOAD_OK');
} catch (e) { console.error('UPLOAD_ERR', e.message); } finally { c.close(); }
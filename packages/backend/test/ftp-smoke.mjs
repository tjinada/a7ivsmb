// Phase 2 smoke test: log in to the embedded FTP server and upload a file,
// the way the camera would. Run with the backend already started (FTP_ENABLED).
//   node test/ftp-smoke.mjs
import { Client } from 'basic-ftp';
import { writeFileSync } from 'node:fs';

const port = Number(process.env.FTP_PORT ?? 2121);
const user = process.env.FTP_USER ?? 'camera';
const pass = process.env.FTP_PASS ?? 'camerapass';

const local = 'smoke-upload.txt';
writeFileSync(local, `hello from camera ${new Date().toISOString()}\n`);

const client = new Client(15000);
try {
  await client.access({ host: '127.0.0.1', port, user, password: pass, secure: false });
  await client.uploadFrom(local, 'DSC_TEST.JPG');
  console.log('UPLOAD_OK');
} catch (err) {
  console.error('UPLOAD_FAIL', err.message);
  process.exitCode = 1;
} finally {
  client.close();
}

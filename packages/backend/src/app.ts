// Load env first, before anything reads `config`.
import './env.js';

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config, assertConfig } from './config/index.js';
import { errorHandler, requestLogger } from './middleware/index.js';
import { sendSuccess } from './utils/response.js';
import { logger } from './utils/logger.js';
import { authRoutes } from './modules/auth/index.js';
import { ftpRoutes, initFtp } from './modules/ftp/index.js';
import { galleryRoutes } from './modules/gallery/index.js';
import { ownerShareRoutes, publicShareRoutes, renderSharePage, initShares } from './modules/shares/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(cors({
  origin: config.isDevelopment ? ['http://localhost:5173'] : true,
  credentials: true,
}));
app.use(express.json());
app.use(requestLogger);

// Option B isolation: the public client-share surface lives on its own host
// (config.shareHost) with no Cloudflare Access. On that host the owner API and
// PWA shell must not exist, so `ownerOnly` 404s them. When shareHost is unset
// (dev), isolation is off and everything is reachable on one host.
const onShareHost = (req: Request): boolean => !!config.shareHost && req.hostname === config.shareHost;
const ownerOnly = (req: Request, res: Response, next: NextFunction): void => {
  if (onShareHost(req)) {
    res.status(404).json({ status: 'error', message: 'Not found' });
    return;
  }
  next();
};

app.get('/api/health', (_req, res) => {
  sendSuccess(res, { status: 'ok', timestamp: new Date().toISOString(), version: '0.1.0' });
});

// ── Public client-share surface (available on any host; password-gated) ──────
app.use('/api/public/share', publicShareRoutes);
app.get('/s/:slug', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(renderSharePage(req.params.slug));
});

// ── Owner API (404 on the share host) ────────────────────────────────────────
app.use('/api/auth', ownerOnly, authRoutes);
app.use('/api/ftp', ownerOnly, ftpRoutes);
app.use('/api/gallery/shares', ownerOnly, ownerShareRoutes);
app.use('/api/gallery', ownerOnly, galleryRoutes);

// Serve the built frontend in production (single-container deploy). The owner
// PWA (static assets + SPA shell) is never served on the share host.
if (config.isProduction) {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  const staticHandler = express.static(frontendPath);
  app.use((req, res, next) => (onShareHost(req) ? next() : staticHandler(req, res, next)));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || onShareHost(req)) return next();
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

app.use('/api/*', (_req, res) => {
  res.status(404).json({ status: 'error', message: 'API endpoint not found' });
});

// Final catch-all (e.g. unmatched paths on the share host).
app.use((_req, res) => {
  res.status(404).json({ status: 'error', message: 'Not found' });
});

app.use(errorHandler);

assertConfig();

app.listen(config.port, () => {
  logger.info(`sonycamera-transfer backend on port ${config.port} (${config.nodeEnv})`, 'Server');
});

// Start the embedded FTP receive server (best-effort; HTTP runs regardless).
void initFtp();
// Load client-share state into memory.
void initShares();

export default app;

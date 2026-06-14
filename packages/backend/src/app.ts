// Load env first, before anything reads `config`.
import './env.js';

import express, { type Express } from 'express';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(cors({
  origin: config.isDevelopment ? ['http://localhost:5173'] : true,
  credentials: true,
}));
app.use(express.json());
app.use(requestLogger);

app.get('/api/health', (_req, res) => {
  sendSuccess(res, { status: 'ok', timestamp: new Date().toISOString(), version: '0.1.0' });
});

// API routes (more mounted in their phases: monitor)
app.use('/api/auth', authRoutes);
app.use('/api/ftp', ftpRoutes);
app.use('/api/gallery', galleryRoutes);

// Serve the built frontend in production (single-container deploy)
if (config.isProduction) {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

app.use('/api/*', (_req, res) => {
  res.status(404).json({ status: 'error', message: 'API endpoint not found' });
});

app.use(errorHandler);

assertConfig();

app.listen(config.port, () => {
  logger.info(`sonycamera-transfer backend on port ${config.port} (${config.nodeEnv})`, 'Server');
});

// Start the embedded FTP receive server (best-effort; HTTP runs regardless).
void initFtp();

export default app;

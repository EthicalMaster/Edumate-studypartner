/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { authRouter } from './server/routes/auth.routes.js';
import { checkConnection } from './server/db/connection.js';

// Server entry point

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Global parsing middlewares
  app.use(express.json());
  app.use(cookieParser());

  // API Routes FIRST
  app.get('/api/health', async (_req, res) => {
    const dbConnected = await checkConnection();
    res.json({
      status: 'ok',
      service: 'edumate-backend',
      database: dbConnected ? 'connected' : 'disconnected (set DATABASE_URL in local environment)',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount Authentication Router
  app.use('/api/auth', authRouter);

  // Vite middleware for development vs static build for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[EDUMATE] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[EDUMATE] Failed to start server:', err);
  process.exit(1);
});

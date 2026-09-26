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
import { quizRouter } from './server/routes/quiz.routes.js';
import { leaderboardRouter } from './server/routes/leaderboard.routes.js';
import { materialRouter } from './server/routes/material.routes.js';
import { retrievalRouter } from './server/routes/retrieval.routes.js';
import { aiRouter } from './server/routes/ai.routes.js';
import { analyticsRouter } from './server/routes/analytics.routes.js';
import { adaptiveRouter } from './server/routes/adaptive.routes.js';
import { checkConnection } from './server/db/connection.js';
import { pythonEmbeddingRunner } from './server/services/embedding/python-embedding-runner.js';

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

  // Explicit download endpoints for verified Phase 7 embedding files
  app.get('/download/python-embedding-runner.ts', (_req, res) => {
    const filePath = path.resolve(process.cwd(), 'server', 'services', 'embedding', 'python-embedding-runner.ts');
    res.download(filePath, 'python-embedding-runner.ts');
  });

  app.get('/download/embedder.py', (_req, res) => {
    const filePath = path.resolve(process.cwd(), 'server', 'services', 'embedding', 'embedder.py');
    res.download(filePath, 'embedder.py');
  });

  app.get('/download/python-runner.test.ts', (_req, res) => {
    const filePath = path.resolve(process.cwd(), 'server', 'test', 'python-runner.test.ts');
    res.download(filePath, 'python-runner.test.ts');
  });

  app.get('/download/env.example', (_req, res) => {
    const filePath = path.resolve(process.cwd(), '.env.example');
    res.download(filePath, '.env.example', { dotfiles: 'allow' });
  });

  app.get('/download/.env.example', (_req, res) => {
    const filePath = path.resolve(process.cwd(), '.env.example');
    res.download(filePath, '.env.example', { dotfiles: 'allow' });
  });

  // Mount Authentication Router
  app.use('/api/auth', authRouter);

  // Mount Leaderboard Router
  app.use('/api/leaderboard', leaderboardRouter);

  // Mount Study Materials Router
  app.use('/api/materials', materialRouter);

  // Mount Retrieval & Resource Governance Router
  app.use('/api/retrieval', retrievalRouter);
  app.use('/api/quotas', (req, res, next) => {
    req.url = '/quotas';
    retrievalRouter(req, res, next);
  });

  // Mount AI Gateway Router (Phase 8)
  app.use('/api/ai', aiRouter);

  // Mount Learning Analytics Router (Phase 8.5)
  app.use('/api/analytics', analyticsRouter);

  // Mount Adaptive Student Model Router (Phase 11)
  app.use('/api/adaptive', adaptiveRouter);
  app.use('/api/student-model', adaptiveRouter);

  // Mount Quiz Router (handles /api/quizzes, /api/quiz-sessions, /api/quiz-results, /api/quiz-history)
  app.use('/api/quizzes', quizRouter);
  app.use('/api/quiz-sessions', (req, res, next) => {
    // Rewrites /api/quiz-sessions/* to /sessions/* on quizRouter
    req.url = `/sessions${req.url === '/' ? '' : req.url}`;
    quizRouter(req, res, next);
  });
  app.use('/api/quiz-results', (req, res, next) => {
    // Rewrites /api/quiz-results/* to /results/* on quizRouter
    req.url = `/results${req.url === '/' ? '' : req.url}`;
    quizRouter(req, res, next);
  });
  app.use('/api/quiz-history', (req, res, next) => {
    // Rewrites /api/quiz-history to /history/attempts on quizRouter
    req.url = `/history/attempts`;
    quizRouter(req, res, next);
  });

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

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[AVEN] Server running on http://0.0.0.0:${PORT}`);
    try {
      const dbConnected = await checkConnection();
      if (dbConnected) {
        console.log('[AVEN] PostgreSQL database connection verified.');
      } else {
        console.warn('[AVEN] Running without PostgreSQL connection (check DATABASE_URL).');
      }
    } catch (err) {
      console.warn('[AVEN] Database health check warning:', err);
    }

    // Asynchronously pre-warm the real BGE embedding engine without blocking HTTP or DB startup
    pythonEmbeddingRunner.waitUntilReady().catch((err) => {
      console.warn(`[AVEN] Asynchronous BGE embedding engine pre-warm warning: ${err.message}`);
    });
  });
}

startServer().catch((err) => {
  console.error('[AVEN] Failed to start server:', err);
  process.exit(1);
});

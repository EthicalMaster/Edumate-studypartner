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

  // Mount Leaderboard Router
  app.use('/api/leaderboard', leaderboardRouter);

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
    console.log(`[EDUMATE] Server running on http://0.0.0.0:${PORT}`);
    try {
      const dbConnected = await checkConnection();
      if (dbConnected) {
        console.log('[EDUMATE] PostgreSQL database connection verified.');
      } else {
        console.warn('[EDUMATE] Running without PostgreSQL connection (check DATABASE_URL).');
      }
    } catch (err) {
      console.warn('[EDUMATE] Database health check warning:', err);
    }
  });
}

startServer().catch((err) => {
  console.error('[EDUMATE] Failed to start server:', err);
  process.exit(1);
});

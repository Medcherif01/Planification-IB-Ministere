import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import generateHandler from './api/generate';
import planificationsHandler from './api/planifications';
import examsHandler from './api/exams';
import ibCriteriaHandler from './api/ib-criteria';
import modRequestsHandler from './api/modification-requests';
import templateHandler from './api/template';
import usersHandler from './api/users';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parsers
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Routes
  app.all('/api/generate', (req, res) => generateHandler(req as any, res as any));
  app.all('/api/planifications', (req, res) => planificationsHandler(req as any, res as any));
  app.all('/api/exams', (req, res) => examsHandler(req as any, res as any));
  app.all('/api/ib-criteria', (req, res) => ibCriteriaHandler(req as any, res as any));
  app.all('/api/modification-requests', (req, res) => modRequestsHandler(req as any, res as any));
  app.all('/api/template', (req, res) => templateHandler(req as any, res as any));
  app.all('/api/users', (req, res) => usersHandler(req as any, res as any));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Database offline error middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (
      err.name === 'MongooseError' ||
      err.name === 'MongoNetworkError' ||
      err.name === 'MongoServerSelectionError' ||
      err.message?.includes('buffering timed out') ||
      err.message?.includes('ECONNREFUSED')
    ) {
      console.warn('[AI Studio] Database offline — returning mock empty response');
      if (req.method === 'GET') {
        return res.json(req.path.endsWith('s') || req.path.endsWith('s/') ? [] : {});
      }
      return res.status(503).json({ error: 'Service temporarily unavailable (database offline)' });
    }
    console.error('[Server Error]', err);
    res.status(500).json({ error: 'Internal Server Error', message: err?.message || String(err) });
  });

  // Vite middleware for dev or static files for prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: 3000 },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});

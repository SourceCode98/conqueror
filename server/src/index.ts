import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { gamesRouter } from './routes/games.js';
import { setupWebSocket } from './ws/wsServer.js';
import db from './db/index.js'; // ensure DB is initialized

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// API routes
app.use('/api/auth', authRouter);
app.use('/api/games', gamesRouter);

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Serve built client in production
if (!config.isDev) {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
setupWebSocket(wss);

httpServer.listen(config.port, () => {
  console.log(`Conqueror server running on port ${config.port}`);
});

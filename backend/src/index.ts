import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { env } from './config/env';
import authRoutes from './routes/auth';
import settingsRoutes from './routes/settings';
import serverRoutes from './routes/servers';
import siteRoutes from './routes/sites';
import domainRoutes from './routes/domains';
import deployRoutes from './routes/deploys';
import panicRoutes from './routes/panic';
import logRoutes from './routes/logs';
import dashboardRoutes from './routes/dashboard';
import backupRoutes from './routes/backups';

const app = express();
const httpServer = createServer(app);

const io = new SocketServer(httpServer, {
  cors: {
    origin: env.FRONTEND_URL,
    credentials: true,
  },
});

app.use(helmet());
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/deploys', deployRoutes);
app.use('/api/panic', panicRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/backups', backupRoutes);

// Initialize deploy queue worker
import('./services/queue.service').then(() => {
  console.log('Deploy queue worker started');
});

// Start monitoring
import { startMonitoring } from './services/monitoring.service';
startMonitoring();

// Initialize backup scheduler
import('./services/backup-scheduler.service').then(({ setupBackupSchedule }) => {
  setupBackupSchedule();
  console.log('Backup scheduler initialized');
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Join deploy room for real-time logs
  socket.on('deploy:subscribe', (deployId: string) => {
    socket.join(`deploy:${deployId}`);
    console.log(`Socket ${socket.id} subscribed to deploy:${deployId}`);
  });

  socket.on('deploy:unsubscribe', (deployId: string) => {
    socket.leave(`deploy:${deployId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Export io for use in other modules
export { io };

httpServer.listen(env.PORT, () => {
  console.log(`Server running on http://localhost:${env.PORT}`);
});

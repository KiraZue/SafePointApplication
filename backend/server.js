const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

// Initialize SQLite3 database (creates tables synchronously)
const db = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const reportRoutes = require('./routes/reportRoutes');
const User = require('./models/User');
const EmergencyReport = require('./models/EmergencyReport');
const http = require('http');
const { Server } = require('socket.io');
const { setIO } = require('./controllers/reportController');
const { sendPushNotification } = require('./utils/notification');

dotenv.config();

const app = express();
const server = http.createServer(app);

// ============================================
// SOCKET.IO CONFIGURATION (Optimized)
// ============================================
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

app.use(cors());
app.use(express.json());

// ============================================
// ROUTES
// ============================================
app.use('/api/users', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', require('./routes/notificationRoutes'));

app.get('/', (req, res) => {
  res.send('API is running...');
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    connections: io.engine.clientsCount,
    db: 'sqlite3',
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    connections: io.engine.clientsCount,
    db: 'sqlite3',
  });
});

// ============================================
// SOCKET.IO EVENT HANDLERS (Real-time)
// ============================================

let connectedClients = 0;

io.on('connection', (socket) => {
  connectedClients++;
  console.log('[Socket.io] Client connected:', socket.id, '| Total clients:', connectedClients);

  try {
    // Send initial active reports on connection
    const active = EmergencyReport.find({ status: { $ne: 'RESOLVED' } });
    socket.emit('reports:active', active);
    console.log('[Socket.io] Sent', active.length, 'active reports to', socket.id);
  } catch (err) {
    console.error('[Socket.io] Error sending initial reports:', err.message);
  }

  // Client can request full report list
  socket.on('reports:request_all', () => {
    try {
      const allReports = EmergencyReport.find({}, { sort: { createdAt: -1 }, limit: 100 });
      socket.emit('reports:all', allReports);
      console.log('[Socket.io] Sent all reports to', socket.id);
    } catch (err) {
      console.error('[Socket.io] Error sending all reports:', err.message);
    }
  });

  // Handle status update from client (real-time collaboration)
  socket.on('report:update_status', async (data) => {
    try {
      const { reportId, status, userId } = data;

      if (!reportId || !status || !userId) {
        socket.emit('report:update_error', { message: 'Missing required fields' });
        return;
      }

      const report = EmergencyReport.findById(reportId);
      if (!report) {
        socket.emit('report:update_error', { message: 'Report not found' });
        return;
      }

      const alreadyApplied = report.statusHistory.some(
        h => h.status === status && (h.updatedBy?._id || h.updatedBy) === userId
      );

      if (!alreadyApplied) {
        report.status = status;
        report.statusHistory.push({ status, updatedBy: userId, timestamp: new Date() });

        const populated = await EmergencyReport.save(report);

        // Broadcast to ALL clients
        io.emit('report:updated', populated);
        console.log('[Socket.io] Broadcasted status update for report:', reportId);

        // Send targeted push notification to the report owner
        try {
          if (populated.user && populated.user._id) {
            const updater = User.findById(userId);
            const updaterName = updater ? `${updater.firstName} ${updater.lastName}` : 'Someone';
            const updaterRole = updater?.role ? ` (${updater.role})` : '';

            await sendPushNotification({
              userIds: [populated.user._id],
              title: `🔄 Status Updated: ${status}`,
              body: `${updaterName}${updaterRole} updated your ${populated.type} report to: ${status}`,
              data: { type: 'STATUS_UPDATE', reportId: populated._id, status },
            });
          }
        } catch (pushErr) {
          console.error('[Push] Failed to send status update notification:', pushErr);
        }
      }
    } catch (err) {
      console.error('[Socket.io] Error updating status:', err.message);
      socket.emit('report:update_error', { message: err.message });
    }
  });

  // Handle Wi-Fi Direct group notification
  socket.on('wifi:group_started', async (data) => {
    try {
      const { userId, groupName } = data;
      const user = User.findById(userId);
      console.log(`[Socket.io] Wi-Fi Direct group started by ${user?.firstName} (${groupName})`);

      await sendPushNotification({
        title: '📶 Wi-Fi Direct Group Started',
        body: `${user?.firstName} ${user?.lastName} started a group: "${groupName}". Connect to stay safe offline.`,
        data: { type: 'WIFI_GROUP_STARTED', userId, groupName },
      });
    } catch (err) {
      console.error('[Socket.io] Error notifying Wi-Fi group:', err.message);
    }
  });

  // Handle acknowledgment from client
  socket.on('report:acknowledge', async (data) => {
    try {
      const { reportId, userId } = data;

      if (!reportId || !userId) {
        socket.emit('report:update_error', { message: 'Missing required fields' });
        return;
      }

      const report = EmergencyReport.findById(reportId);
      if (!report) {
        socket.emit('report:update_error', { message: 'Report not found' });
        return;
      }

      const alreadyAcked = report.statusHistory.some(
        h => h.status === 'ACKNOWLEDGED' && (h.updatedBy?._id || h.updatedBy) === userId
      );

      if (!alreadyAcked) {
        if (report.status === 'REPORTED') report.status = 'ACKNOWLEDGED';

        report.statusHistory.push({
          status: 'ACKNOWLEDGED',
          updatedBy: userId,
          timestamp: new Date(),
        });

        const populated = await EmergencyReport.save(report);

        // Broadcast to ALL clients
        io.emit('report:updated', populated);
        console.log('[Socket.io] Broadcasted acknowledgment for report:', reportId);
      }
    } catch (err) {
      console.error('[Socket.io] Error acknowledging report:', err.message);
      socket.emit('report:update_error', { message: err.message });
    }
  });

  // Ping/pong for connection health monitoring
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  socket.on('disconnect', (reason) => {
    connectedClients--;
    console.log('[Socket.io] Client disconnected:', socket.id, '| Reason:', reason, '| Remaining:', connectedClients);
  });

  socket.on('error', (error) => {
    console.error('[Socket.io] Socket error:', socket.id, error.message);
  });
});

// Inject Socket.io instance into report controller
setIO(io);

// ============================================
// PERIODIC CLEANUP (Optional)
// ============================================

const cleanupOldReports = () => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = EmergencyReport.deleteMany({
      status: 'RESOLVED',
      updatedAt: { $lt: thirtyDaysAgo },
    });

    if (result.deletedCount > 0) {
      console.log('[Cleanup] Deleted', result.deletedCount, 'old resolved reports');
    }
  } catch (err) {
    console.error('[Cleanup] Error:', err.message);
  }
};

const scheduleCleanup = () => {
  const now = new Date();
  const night = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 3, 0, 0);
  const msToMidnight = night.getTime() - now.getTime();
  setTimeout(() => {
    cleanupOldReports();
    setInterval(cleanupOldReports, 24 * 60 * 60 * 1000);
  }, msToMidnight);
};

// Uncomment to enable automatic cleanup:
// scheduleCleanup();

// ============================================
// DATABASE SEEDER
// ============================================

const seedAdmin = async () => {
  try {
    const count = User.countDocuments();
    if (count === 0) {
      console.log('[Seeder] No users found. Creating default admin...');
      await User.create({
        firstName: 'System',
        lastName: 'Admin',
        userCode: 'ADMIN01',
        password: 'password123',
        role: 'Admin',
        registered: true,
      });
      console.log('[Seeder] ✓ Default Admin Created');
      console.log('[Seeder]   UserCode: ADMIN01');
      console.log('[Seeder]   Password: password123');
    } else {
      console.log('[Seeder] Database already has', count, 'users. Skipping seed.');
    }
  } catch (error) {
    console.error('[Seeder] Error:', error.message);
  }
};

seedAdmin();

// ============================================
// BONJOUR / mDNS DISCOVERY
// ============================================
let bonjourInstance = null;
const PORT = process.env.PORT || 5000;

const startBonjour = () => {
  try {
    console.log('[Bonjour] Initializing discovery service...');
    bonjourInstance = require('bonjour')();

    const service = bonjourInstance.publish({
      name: 'SafePoint Backend',
      type: 'http',
      port: PORT,
      txt: { path: '/api/health' },
    });

    service.on('error', (err) => {
      console.error('[Bonjour] Publication error:', err);
    });

    service.on('up', () => {
      console.log('[Bonjour] Service is UP!');
      console.log('[Bonjour] Service published: SafePoint Backend (http)');
      console.log(`[Bonjour]   Type: _http._tcp.local.`);
      console.log(`[Bonjour]   Port: ${PORT}`);
      console.log('[Bonjour]   Check path: /api/health');
    });
  } catch (err) {
    console.error('[Bonjour] Critical failure starting Bonjour:', err.message);
  }
};

console.log('[Bonjour] Discovery service will start in 5 seconds...');
setTimeout(startBonjour, 5000);

// ============================================
// SERVER STARTUP
// ============================================

server.listen(PORT, () => {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log(`║  Server running on port ${PORT}                        ║`);
  console.log('║  Database: SQLite3 (safepoint.db)                    ║');
  console.log('║  Socket.io real-time enabled                         ║');
  console.log(`║  Health check: http://localhost:${PORT}/health          ║`);
  console.log('╚═══════════════════════════════════════════════════════╝');
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

const gracefulShutdown = (signal) => {
  console.log(`\n[${signal}] Shutting down gracefully...`);

  io.close(() => {
    console.log('[Socket.io] All connections closed');
  });

  server.close(() => {
    console.log('[HTTP] Server closed');
    // Close the SQLite database connection
    try { db.close(); console.log('[SQLite] Database closed'); } catch { }
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Shutdown] Forcing shutdown...');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================
// ERROR HANDLERS
// ============================================

process.on('unhandledRejection', (err) => {
  console.error('[Unhandled Rejection]', err.message);
  console.error(err.stack);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err.message);
  console.error(err.stack);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

module.exports = { app, server, io };
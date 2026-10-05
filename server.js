import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './server/config/db.js';
import { seedFleetData } from './server/seed/seedData.js';

// Route imports
import authRoutes from './server/routes/authRoutes.js';
import vehicleRoutes from './server/routes/vehicleRoutes.js';
import driverRoutes from './server/routes/driverRoutes.js';
import tripRoutes from './server/routes/tripRoutes.js';
import fuelRoutes from './server/routes/fuelRoutes.js';
import maintenanceRoutes from './server/routes/maintenanceRoutes.js';
import expenseRoutes from './server/routes/expenseRoutes.js';
import notificationRoutes from './server/routes/notificationRoutes.js';
import dashboardRoutes from './server/routes/dashboardRoutes.js';
import analyticsRoutes from './server/routes/analyticsRoutes.js';
import aiRoutes from './server/routes/aiRoutes.js';
import deviceRoutes from './server/routes/deviceRoutes.js';
import deliveryRoutes from './server/routes/deliveryRoutes.js';
import { startDeliveryWorker } from './server/notify/worker.js';
import { startRetentionWorker } from './server/gps/retention.js';
import { startBillingWorker } from './server/services/billing.js';
import gpsReportRoutes from './server/routes/gpsReportRoutes.js';
import geofenceRoutes from './server/routes/geofenceRoutes.js';
import trackingRoutes from './server/routes/trackingRoutes.js';
import gpsRoutes from './server/routes/gpsRoutes.js';
import { startGpsServers } from './server/gps/tcpServer.js';
import organizationRoutes from './server/routes/organizationRoutes.js';
import platformRoutes from './server/routes/platformRoutes.js';
import billingRoutes from './server/routes/billingRoutes.js';
import publicRoutes from './server/routes/publicRoutes.js';
import { apiLimiter, rateLimitDisabled, trustProxySetting } from './server/middleware/rateLimit.js';
import { errorHandler, notFound } from './server/middleware/errorMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Database Connection & Auto Seed
  await connectDB();
  await seedFleetData();

  // Behind a reverse proxy set TRUST_PROXY (e.g. 1) so client IPs, and therefore rate limits, are the real ones
  app.set('trust proxy', trustProxySetting());
  if (rateLimitDisabled()) console.warn('[FLEETNOVA] Rate limiting is DISABLED (RATE_LIMIT_DISABLED=true).');

  // Middleware
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', apiLimiter);
  app.use(express.urlencoded({ extended: true }));

  // REST API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/organization', organizationRoutes);
  app.use('/api/platform', platformRoutes);
  app.use('/api/billing', billingRoutes);
  app.use('/api/gps', gpsRoutes);
  app.use('/api/devices', deviceRoutes);
  app.use('/api/tracking', trackingRoutes);
  app.use('/api/geofences', geofenceRoutes);
  app.use('/api/reports', gpsReportRoutes);
  app.use('/api/delivery', deliveryRoutes);
  app.use('/api/vehicles', vehicleRoutes);
  app.use('/api/drivers', driverRoutes);
  app.use('/api/trips', tripRoutes);
  app.use('/api/fuel', fuelRoutes);
  app.use('/api/maintenance', maintenanceRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/ai', aiRoutes);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      success: true,
      service: 'FLEETNOVA Smart Fleet Management System',
      status: 'operational',
      timestamp: new Date().toISOString()
    });
  });

  app.use('/api', notFound);

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // Mount Vite Dev Server middleware
    const { createServer: createViteServer } = await import('vite');

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true'
      },
      appType: 'spa'
    });

    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.resolve(__dirname, 'dist');

    app.use(express.static(distPath));

    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  // Error Handler
  app.use(errorHandler);

  // Start Server
  app.listen(Number(PORT), process.env.HOST || 'localhost', () => {
    console.log('');
    console.log('==========================================');
    console.log('FLEETNOVA SERVER RUNNING');
    console.log('==========================================');
    console.log(`Website: http://localhost:${PORT}`);
    console.log(`Health:  http://localhost:${PORT}/api/health`);
    console.log(`FleetAI: http://localhost:${PORT}/api/ai/chat`);
    console.log('');
  });

  // GPS tracker listeners (Teltonika TCP)
  startGpsServers();
  // Email / SMS delivery of alerts (queue worker)
  startDeliveryWorker();
  startRetentionWorker();
  // Re-checks open QPay invoices and finishes interrupted payments
  startBillingWorker();
}

startServer().catch((err) => {
  console.error('[FLEETNOVA] Fatal server error:', err);
  process.exit(1);
});
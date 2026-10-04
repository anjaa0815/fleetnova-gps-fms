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
import { errorHandler } from './server/middleware/errorMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Database Connection & Auto Seed
  await connectDB();
  await seedFleetData();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // REST API Routes
  app.use('/api/auth', authRoutes);
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
  app.listen(Number(PORT), 'localhost', () => {
    console.log('');
    console.log('==========================================');
    console.log('FLEETNOVA SERVER RUNNING');
    console.log('==========================================');
    console.log(`Website: http://localhost:${PORT}`);
    console.log(`Health:  http://localhost:${PORT}/api/health`);
    console.log(`FleetAI: http://localhost:${PORT}/api/ai/chat`);
    console.log('');
  });
}

startServer().catch((err) => {
  console.error('[FLEETNOVA] Fatal server error:', err);
  process.exit(1);
});
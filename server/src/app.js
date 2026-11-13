const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const datasetRoutes = require('./routes/datasets');
const authRoutes = require('./routes/auth');

function createApp() {
  const app = express();
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        connectSrc: ["'self'", process.env.CLIENT_API_ORIGIN || 'http://localhost:5000', 'ws://localhost:5173'],
        imgSrc: ["'self'", 'data:'],
      },
    },
  }));
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => {
    const database = mongoose.connection.readyState === 1 ? 'connected' : 'unavailable';
    const status = database === 'connected' ? 'ok' : 'degraded';
    res.status(database === 'connected' ? 200 : 503).json({ status, database, message: 'DataLens API is running' });
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/datasets', datasetRoutes);
  return app;
}

module.exports = createApp;

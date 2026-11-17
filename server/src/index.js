require('dotenv').config();
const mongoose = require('mongoose');
const createApp = require('./app');
const readConfig = require('./config');
const config = readConfig();

async function startServer() {
  if (config.mongodbUri) {
    try {
      await mongoose.connect(config.mongodbUri);
      console.log('Connected to MongoDB');
    } catch (error) {
      console.error('MongoDB connection failed:', error.message);
      if (config.isProduction) throw error;
    }
  } else {
    console.warn('MONGODB_URI is not set. Authentication and saved datasets require MongoDB.');
  }

  createApp().listen(config.port, () => console.log(`DataLens API listening on port ${config.port}`));
}

startServer().catch((error) => {
  console.error('DataLens could not start:', error.message);
  process.exitCode = 1;
});

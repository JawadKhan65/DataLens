require('dotenv').config();
const mongoose = require('mongoose');
const createApp = require('./app');

const port = process.env.PORT || 5000;
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('Set JWT_SECRET to at least 32 characters before starting DataLens in production.');
}

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch((error) => console.error('MongoDB connection failed:', error.message));
} else {
  console.warn('MONGODB_URI is not set. Authentication and saved datasets require MongoDB.');
}

createApp().listen(port, () => console.log(`DataLens API listening on port ${port}`));

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const datasetRoutes = require('./routes/datasets');
const authRoutes = require('./routes/auth');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'DataLens API is running' }));
app.use('/api/auth', authRoutes);
app.use('/api/datasets', datasetRoutes);

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`DataLens API listening on port ${port}`));

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch((error) => console.error('MongoDB connection failed:', error.message));
} else {
  console.warn('MONGODB_URI is not set. Authentication and saved datasets require MongoDB.');
}

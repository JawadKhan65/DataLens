require('dotenv').config();
const express = require('express');
const cors = require('cors');
const datasetRoutes = require('./routes/datasets');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'DataLens API is running' }));
app.use('/api/datasets', datasetRoutes);

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`DataLens API listening on port ${port}`));

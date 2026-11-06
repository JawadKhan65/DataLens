const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const Dataset = require('../models/Dataset');
const requireAuth = require('../middleware/requireAuth');
const mongoose = require('mongoose');

const router = express.Router();
router.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Database is unavailable. Start MongoDB and try again.' });
  next();
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (file.originalname.toLowerCase().endsWith('.csv')) callback(null, true);
    else callback(new Error('Only CSV files are allowed.'));
  },
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const datasets = await Dataset.find({ userId: req.userId }).sort({ createdAt: -1 }).select('-preview');
    res.json(datasets.map((dataset) => ({ ...dataset.toObject(), reportAvailable: true })));
  } catch (error) {
    res.status(500).json({ message: 'Could not load datasets.' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const dataset = await Dataset.findOne({ _id: req.params.id, userId: req.userId });
    if (!dataset) return res.status(404).json({ message: 'Dataset not found.' });
    res.json(dataset);
  } catch (error) {
    res.status(400).json({ message: 'Could not load this report.' });
  }
});

router.post('/analyze', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Choose a CSV file to upload.' });

  try {
    const records = parse(req.file.buffer.toString('utf8'), {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
    });
    const columns = Object.keys(records[0] || {});
    const columnSummary = columns.map((name) => {
      const values = records.map((row) => row[name]);
      const presentValues = values.filter((value) => value !== '' && value !== null && value !== undefined);
      const numericValues = presentValues.map(Number).filter(Number.isFinite);
      const isNumeric = presentValues.length > 0 && numericValues.length === presentValues.length;
      const result = { name, type: isNumeric ? 'numeric' : 'categorical', totalCount: values.length, missingCount: values.length - presentValues.length };

      if (isNumeric && numericValues.length) {
        const sorted = [...numericValues].sort((a, b) => a - b);
        const mean = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
        const middle = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
        const variance = numericValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / numericValues.length;
        Object.assign(result, { mean: round(mean), median: round(median), standardDeviation: round(Math.sqrt(variance)), min: sorted[0], max: sorted[sorted.length - 1] });
      } else {
        result.uniqueCount = new Set(presentValues).size;
      }
      return result;
    });
    const preview = records.slice(0, 200);
    const duplicateCount = records.length - new Set(records.map((row) => JSON.stringify(row))).size;
    const report = { fileName: req.file.originalname, rowCount: records.length, columnCount: columns.length, columns: columnSummary, duplicateCount, preview };
    if (mongooseReady()) {
      const saved = await Dataset.create({ userId: req.userId, name: req.file.originalname, originalName: req.file.originalname, ...report });
      report.id = saved.id;
      report.createdAt = saved.createdAt;
    } else report.saved = false;
    res.json(report);
  } catch (error) {
    res.status(400).json({ message: 'The CSV could not be read. Check that it has a header row and valid CSV formatting.' });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Dataset name is required.' });
  try {
    const dataset = await Dataset.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, { name }, { new: true, runValidators: true }).select('-preview');
    if (!dataset) return res.status(404).json({ message: 'Dataset not found.' });
    res.json(dataset);
  } catch (error) {
    res.status(400).json({ message: 'Could not rename this dataset.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const dataset = await Dataset.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!dataset) return res.status(404).json({ message: 'Dataset not found.' });
    res.json({ message: 'Dataset deleted.' });
  } catch (error) {
    res.status(400).json({ message: 'Could not delete this dataset.' });
  }
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'CSV files must be smaller than 10 MB.' });
  res.status(400).json({ message: error.message || 'Upload failed.' });
});

function round(value) { return Math.round(value * 100) / 100; }
function mongooseReady() { return mongoose.connection.readyState === 1; }

module.exports = router;

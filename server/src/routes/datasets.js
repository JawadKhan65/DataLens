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
        Object.assign(result, {
          mean: round(mean), median: round(median), standardDeviation: round(Math.sqrt(variance)), min: sorted[0], max: sorted[sorted.length - 1],
          histogram: makeHistogram(numericValues),
        });
      } else {
        result.uniqueCount = new Set(presentValues).size;
        result.topCategories = makeTopCategories(presentValues);
      }
      return result;
    });
    const preview = records.slice(0, 200);
    const duplicateCount = records.length - new Set(records.map((row) => JSON.stringify(row))).size;
    const numericNames = columnSummary.filter((column) => column.type === 'numeric').map((column) => column.name).slice(0, 6);
    const correlationMatrix = numericNames.map((rowName) => numericNames.map((columnName) => calculateCorrelation(records, rowName, columnName)));
    const report = { fileName: req.file.originalname, rowCount: records.length, columnCount: columns.length, columns: columnSummary, correlationNames: numericNames, correlationMatrix, duplicateCount, preview };
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

function makeHistogram(values) {
  const minimum = values.reduce((current, value) => Math.min(current, value), Infinity);
  const maximum = values.reduce((current, value) => Math.max(current, value), -Infinity);
  if (minimum === maximum) return [{ range: String(round(minimum)), count: values.length }];
  const binCount = Math.min(12, Math.max(5, Math.ceil(Math.sqrt(values.length))));
  const binSize = (maximum - minimum) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    range: `${round(minimum + index * binSize)}–${round(index === binCount - 1 ? maximum : minimum + (index + 1) * binSize)}`,
    count: 0,
  }));
  values.forEach((value) => { bins[Math.min(binCount - 1, Math.floor((value - minimum) / binSize))].count += 1; });
  return bins;
}

function makeTopCategories(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(String(value), (counts.get(String(value)) || 0) + 1));
  return [...counts.entries()].sort((first, second) => second[1] - first[1]).slice(0, 12).map(([name, count]) => ({ name, count }));
}

function calculateCorrelation(records, firstName, secondName) {
  const pairs = records.map((row) => [row[firstName], row[secondName]])
    .filter(([first, second]) => first !== '' && second !== '' && first !== null && second !== null)
    .map(([first, second]) => [Number(first), Number(second)])
    .filter(([first, second]) => Number.isFinite(first) && Number.isFinite(second));
  if (pairs.length < 2) return null;
  const firstMean = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const secondMean = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  const numerator = pairs.reduce((sum, pair) => sum + (pair[0] - firstMean) * (pair[1] - secondMean), 0);
  const firstSpread = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair[0] - firstMean) ** 2, 0));
  const secondSpread = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair[1] - secondMean) ** 2, 0));
  return firstSpread && secondSpread ? round(numerator / (firstSpread * secondSpread)) : null;
}

module.exports = router;

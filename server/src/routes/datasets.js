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
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 8));
    const filter = { userId: req.userId };
    const search = String(req.query.search || '').trim().slice(0, 100);
    const days = Number.parseInt(req.query.days, 10);
    if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' };
    if ([7, 30].includes(days)) filter.createdAt = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };

    const [items, total, totalRowsResult] = await Promise.all([
      Dataset.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('-preview'),
      Dataset.countDocuments(filter),
      Dataset.aggregate([{ $match: { userId: req.userId } }, { $group: { _id: null, rows: { $sum: '$rowCount' }, count: { $sum: 1 } } }]),
    ]);
    const totals = totalRowsResult[0] || { rows: 0, count: 0 };
    res.json({
      items: items.map((dataset) => ({ ...dataset.toObject(), reportAvailable: true })),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
      totalDatasets: totals.count,
      totalRows: totals.rows,
    });
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
      columns: (headers) => validateHeaders(headers),
      skip_empty_lines: true,
      bom: true,
      trim: true,
      max_record_size: 1024 * 1024,
    });
    if (!records.length) return res.status(400).json({ message: 'This CSV has headers but no data rows.' });
    const columns = Object.keys(records[0] || {});
    const columnSummary = columns.map((name) => {
      const values = records.map((row) => row[name]);
      const presentValues = values.filter((value) => value !== '' && value !== null && value !== undefined);
      const numericValues = presentValues.map(Number).filter(Number.isFinite);
      const isNumeric = presentValues.length > 0 && numericValues.length / presentValues.length >= 0.8;
      const invalidCount = isNumeric ? presentValues.length - numericValues.length : 0;
      const result = {
        name,
        type: isNumeric ? 'numeric' : 'categorical',
        totalCount: values.length,
        missingCount: values.length - presentValues.length + invalidCount,
        invalidCount,
      };

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
    res.status(400).json({ message: csvErrorMessage(error) });
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
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function validateHeaders(headers) {
  const cleanedHeaders = headers.map((header) => String(header || '').trim());
  if (!cleanedHeaders.length || cleanedHeaders.some((header) => !header)) {
    throw new Error('The CSV must have a non-empty name for every column in its first row.');
  }
  const duplicates = cleanedHeaders.filter((header, index) => cleanedHeaders.indexOf(header) !== index);
  if (duplicates.length) throw new Error(`Duplicate column name: ${duplicates[0]}. Rename duplicate headers and upload again.`);
  return cleanedHeaders;
}

function csvErrorMessage(error) {
  if (error.message.startsWith('Duplicate column name:') || error.message.startsWith('The CSV must')) return error.message;
  if (error.code === 'CSV_RECORD_INCONSISTENT_COLUMNS' || error.code === 'CSV_RECORD_INCONSISTENT_FIELDS_LENGTH') {
    return 'Some rows have a different number of values than the header. Check the CSV row separators and commas.';
  }
  if (error.code === 'CSV_MAX_RECORD_SIZE') return 'A CSV row is larger than the 1 MB per-row limit.';
  if (error.code === 'CSV_QUOTE_NOT_CLOSED' || error.code === 'CSV_INVALID_CLOSING_QUOTE') {
    return 'A quoted value is not formatted correctly. Check quotation marks in the CSV.';
  }
  if (error.code === 'CSV_INVALID_RECORD_LENGTH') return 'The CSV contains a row with an invalid number of values.';
  return 'The CSV could not be read. Check that it has a header row and valid CSV formatting.';
}

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

const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (file.originalname.toLowerCase().endsWith('.csv')) callback(null, true);
    else callback(new Error('Only CSV files are allowed.'));
  },
});

router.post('/analyze', upload.single('file'), (req, res) => {
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
      const result = { name, type: isNumeric ? 'numeric' : 'categorical', missingCount: values.length - presentValues.length };

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
    const preview = records.slice(0, 8);
    const duplicateCount = records.length - new Set(records.map((row) => JSON.stringify(row))).size;
    res.json({ fileName: req.file.originalname, rowCount: records.length, columnCount: columns.length, columns: columnSummary, duplicateCount, preview });
  } catch (error) {
    res.status(400).json({ message: 'The CSV could not be read. Check that it has a header row and valid CSV formatting.' });
  }
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'CSV files must be smaller than 10 MB.' });
  res.status(400).json({ message: error.message || 'Upload failed.' });
});

function round(value) { return Math.round(value * 100) / 100; }

module.exports = router;

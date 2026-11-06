const mongoose = require('mongoose');

const datasetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  originalName: { type: String, required: true },
  rowCount: { type: Number, default: 0 },
  columnCount: { type: Number, default: 0 },
  columns: { type: Array, default: [] },
  duplicateCount: { type: Number, default: 0 },
  preview: { type: Array, default: [] },
}, { timestamps: true });

module.exports = mongoose.model('Dataset', datasetSchema);

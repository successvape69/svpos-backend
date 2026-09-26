const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
  totalSpent: { type: Number, default: 0 },
  outstanding: { type: Number, default: 0 }, // piutang pelanggan
  points: { type: Number, default: 0 }, // reward points (1 poin per 10k belanja)
  transactionCount: { type: Number, default: 0 },
  lastTransaction: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Customer', CustomerSchema);

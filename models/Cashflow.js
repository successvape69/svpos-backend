const mongoose = require('mongoose');
const CashflowSchema = new mongoose.Schema({
  type: { type: String, enum: ['capital', 'income', 'expense', 'restock'], required: true },
  amount: { type: Number, required: true },
  description: String,
  date: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Cashflow', CashflowSchema);
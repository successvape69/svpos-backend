const mongoose = require('mongoose');
const ShiftSchema = new mongoose.Schema({
  cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cashierName: { type: String, required: true },
  openedAt: { type: Date, default: Date.now },
  openedCash: { type: Number, default: 0 },   // uang awal (modal kasir)
  closedAt: { type: Date, default: null },
  closedCash: { type: Number, default: 0 },    // uang akhir (dihitung manual)
  totalSales: { type: Number, default: 0 },    // total omzet shift
  totalOrders: { type: Number, default: 0 },
  totalDiscount: { type: Number, default: 0 },
  totalHPP: { type: Number, default: 0 },
  totalRefund: { type: Number, default: 0 },
  expectedCash: { type: Number, default: 0 },  // openedCash + totalSales
  notes: { type: String, default: '' },
  status: { type: String, enum: ['open', 'closed'], default: 'open' }
});
module.exports = mongoose.model('Shift', ShiftSchema);

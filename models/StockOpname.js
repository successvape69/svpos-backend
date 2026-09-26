const mongoose = require('mongoose');
const StockOpnameSchema = new mongoose.Schema({
  opnameId: { type: String, unique: true },
  date: { type: Date, default: Date.now },
  items: [
    {
      productId: String,
      productName: String,
      systemStock: Number,
      physicalStock: Number,
      diff: Number
    }
  ],
  totalDiff: Number,
  createdBy: String,
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('StockOpname', StockOpnameSchema);

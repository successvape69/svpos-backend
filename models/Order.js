const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true },
  customerId: { type: String }, // link ke customer atau null kalo guest
  items: [
    {
      productId: String,
      productName: String,
      quantity: Number,
      price: Number, // harga jual
      purchasePrice: { type: Number, default: 0 }, // snapshot HPP saat jual
      subtotal: Number
    }
  ],
  originalTotal: { type: Number, default: 0 }, // total sebelum diskon
  discount: { type: Number, default: 0 }, // persentase diskon (0-100)
  totalAmount: { type: Number, default: 0 }, // total setelah diskon
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  orderStatus: { type: String, enum: ['pending', 'confirmed', 'completed', 'cancelled', 'returned'], default: 'pending' },
  source: { type: String, enum: ['pos', 'web'], default: 'pos' }, // POS atau web order
  midtransOrderId: { type: String },
  midtransTransactionId: { type: String },
  midtransPaymentType: { type: String },
  midtransSnapToken: { type: String },
  midtransRedirectUrl: { type: String },
  // histori retur (bisa beberapa kali)
  returns: [
    {
      at: { type: Date, default: Date.now },
      reason: String,
      itemIndexes: [Number],
      refundAmount: Number
    }
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', OrderSchema);

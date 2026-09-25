const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true },
  customerId: { type: String }, // link ke customer atau null kalo guest
  items: [
    {
      productId: String,
      productName: String,
      quantity: Number,
      price: Number,
      subtotal: Number
    }
  ],
  totalAmount: Number,
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  orderStatus: { type: String, enum: ['pending', 'confirmed', 'completed', 'cancelled'], default: 'pending' },
  source: { type: String, enum: ['pos', 'web'], default: 'pos' }, // POS atau web order
  midtransOrderId: { type: String },
  midtransTransactionId: { type: String },
  midtransPaymentType: { type: String },
  midtransSnapToken: { type: String },
  midtransRedirectUrl: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', OrderSchema);

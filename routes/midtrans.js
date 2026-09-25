const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { snap, isConfigured } = require('../config/midtrans');
const auth = require('../middleware/auth');

// Create Snap token for an existing order (auth required)
router.post('/snap-token', auth, async (req, res) => {
  try {
    if (!isConfigured || !snap) return res.status(503).json({ error: 'Midtrans not configured. Set MIDTRANS_SERVER_KEY/CLIENT_KEY.' });
    const { orderId } = req.body;
    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.midtransSnapToken) {
      return res.json({ snapToken: order.midtransSnapToken, redirectUrl: order.midtransRedirectUrl || null });
    }
    const parameters = {
      transaction_details: {
        order_id: orderId,
        gross_amount: order.totalAmount
      },
      credit_card: { secure: true },
      // ponytail: key is item_details (not customer_detail) per Midtrans Snap
      item_details: order.items.map(i => ({ id: i.productId, price: i.price, quantity: i.quantity, name: i.productName })),
      customer_details: {
        first_name: order.customerId || 'Guest',
        email: `customer_${orderId}@svpos.local`
      },
      callbacks: { finish: process.env.FRONTEND_URL || undefined }
    };
    const snapRes = await snap.createTransaction(parameters);
    // midtrans-client returns { token, redirect_url }
    const token = snapRes.token || snapRes;
    const redirectUrl = snapRes.redirect_url || null;
    order.midtransSnapToken = token;
    order.midtransRedirectUrl = redirectUrl;
    order.midtransOrderId = orderId;
    await order.save();
    res.json({ snapToken: token, redirectUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Midtrans webhook handler (no auth — Midtrans calls it directly)
router.post('/webhook', async (req, res) => {
  try {
    const crypto = require('crypto');
    const { order_id, transaction_status, payment_type, status_code, gross_amount, signature_key, transaction_id } = req.body;
    // Verify signature if keys configured
    if (process.env.MIDTRANS_SERVER_KEY) {
      const expected = crypto.createHash('sha512').update(`${order_id}${status_code}${gross_amount}${process.env.MIDTRANS_SERVER_KEY}`).digest('hex');
      if (signature_key && signature_key !== expected) return res.status(401).json({ error: 'Invalid signature' });
    }
    const order = await Order.findOne({ orderId: order_id });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const statusMap = { capture: 'paid', settlement: 'paid', pending: 'pending', deny: 'failed', expire: 'failed', cancel: 'failed', failure: 'failed', refund: 'failed' };
    order.paymentStatus = statusMap[transaction_status] || 'pending';
    order.midtransTransactionId = transaction_id || order.midtransTransactionId;
    order.midtransPaymentType = payment_type;
    order.updatedAt = new Date();
    if (order.paymentStatus === 'paid') order.orderStatus = 'confirmed';
    await order.save();
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

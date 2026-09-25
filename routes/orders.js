const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Product = require('../models/Product');

// Create order (POS atau web)
router.post('/orders', async (req, res) => {
  try {
    const { customerId, items, totalAmount, source } = req.body;
    
    // Check and update stock
    for (const item of items) {
      const prod = await Product.findById(item.productId);
      if (!prod || prod.stock < item.quantity) {
        return res.status(400).json({ error: `Stok ${prod ? prod.name : 'produk'} tidak cukup` });
      }
    }

    const order = new Order({
      orderId: `ORD-${Date.now()}`,
      customerId: customerId || null,
      items,
      totalAmount,
      source: source || 'pos',
      paymentStatus: 'pending',
      orderStatus: 'pending'
    });
    await order.save();

    // Decrement stock
    for (const item of items) {
      await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -item.quantity } });
    }

    // Update customer stats kalo ada
    if (customerId) {
      await Customer.findByIdAndUpdate(
        customerId,
        {
          $inc: { totalSpent: totalAmount, transactionCount: 1 },
          lastTransaction: new Date()
        }
      );
    }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get orders (filter by status/source)
router.get('/orders', async (req, res) => {
  try {
    const { status, source } = req.query;
    const filter = {};
    if (status) filter.orderStatus = status;
    if (source) filter.source = source;
    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single order
router.get('/orders/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update order status (POS staff confirm/complete) — restores stock on cancel
router.patch('/orders/:orderId', async (req, res) => {
  try {
    const { orderStatus, paymentStatus } = req.body;
    const prev = await Order.findOne({ orderId: req.params.orderId });
    if (!prev) return res.status(404).json({ error: 'Order not found' });
    const wasCancelled = prev.orderStatus === 'cancelled';
    const nowCancelled = orderStatus === 'cancelled' && !wasCancelled;
    if (nowCancelled) {
      for (const item of prev.items) {
        try { await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } }); } catch(_e){}
      }
    }
    const update = { updatedAt: new Date() };
    if (orderStatus) update.orderStatus = orderStatus;
    if (paymentStatus) update.paymentStatus = paymentStatus;
    const order = await Order.findOneAndUpdate({ orderId: req.params.orderId }, update, { new: true });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

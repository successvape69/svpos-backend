const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Customer = require('../models/Customer');

// Create order (POS atau web)
router.post('/orders', async (req, res) => {
  try {
    const { customerId, items, totalAmount, source } = req.body;
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

// Update order status (POS staff confirm/complete)
router.patch('/orders/:orderId', async (req, res) => {
  try {
    const { orderStatus, paymentStatus } = req.body;
    const order = await Order.findOneAndUpdate(
      { orderId: req.params.orderId },
      { orderStatus, paymentStatus, updatedAt: new Date() },
      { new: true }
    );
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

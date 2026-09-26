const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Product = require('../models/Product');

// Create order (POS atau web) — dukung diskon (%)
router.post('/orders', async (req, res) => {
  try {
    const { customerId, items, source, discount = 0 } = req.body;

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'items wajib diisi' });
    }

    // Validasi stok dulu
    for (const item of items) {
      const prod = await Product.findById(item.productId);
      if (!prod || prod.stock < item.quantity) {
        return res.status(400).json({ error: `Stok ${prod ? prod.name : 'produk'} tidak cukup` });
      }
    }

    const originalTotal = items.reduce((s, it) => s + (it.price || 0) * (it.quantity || 0), 0);
    const disc = Math.min(Math.max(Number(discount) || 0, 0), 100); // clamp 0-100
    const totalAmount = Math.round(originalTotal * (1 - disc / 100));

    const order = new Order({
      orderId: `ORD-${Date.now()}`,
      customerId: customerId || null,
      items,
      originalTotal,
      discount: disc,
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

// ===================== RETUR / REFUND =====================
// POST /orders/:orderId/return — retur barang, stok dikembalikan
router.post('/orders/:orderId/return', async (req, res) => {
  try {
    const { reason, itemIndexes } = req.body; // itemIndexes: opsional, array index item yang diretur
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (['cancelled', 'returned'].includes(order.orderStatus)) {
      return res.status(400).json({ error: 'Order sudah dibatalkan/diretur' });
    }
    if (order.orderStatus === 'pending') {
      return res.status(400).json({ error: 'Order belum dibayar, gunakan Batalkan saja' });
    }

    // Retur sebagian (index item) atau seluruh order
    const idxs = Array.isArray(itemIndexes) && itemIndexes.length
      ? itemIndexes.filter(i => i >= 0 && i < order.items.length)
      : order.items.map((_, i) => i);

    let refundAmount = 0;
    for (const i of idxs) {
      const item = order.items[i];
      refundAmount += item.subtotal || (item.price * item.quantity);
      await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } });
    }

    // Kalau retur semua item → status returned, kalau sebagian tetap completed
    const fullReturn = idxs.length === order.items.length;
    const update = { updatedAt: new Date() };
    if (fullReturn) {
      update.orderStatus = 'returned';
      // Kurangi stats customer (totalSpent & transactionCount) kalau full return
      if (order.customerId) {
        await Customer.findByIdAndUpdate(order.customerId, {
          $inc: { totalSpent: -order.totalAmount, transactionCount: -1 }
        });
      }
    }
    update.$push = { returns: { at: new Date(), reason: reason || '', itemIndexes: idxs, refundAmount } };

    const updated = await Order.findOneAndUpdate({ orderId: req.params.orderId }, update, { new: true });
    res.json({ success: true, order: updated, refundAmount, fullReturn });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

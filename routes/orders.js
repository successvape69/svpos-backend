const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const authMiddleware = require('../middleware/auth');

// Rumus reward: 1 poin per Rp 10.000 belanja (lunas)
function calcPoints(amount) { return Math.floor((amount || 0) / 10000); }

// Create order (POS atau web) — publik agar toko online bisa order langsung
router.post('/orders', async (req, res) => {
  try {
    const { customerId, items, source, discount = 0, paymentStatus: reqPay='pending', orderStatus: reqOrd='pending', progress: reqProg='antri' } = req.body;

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'items wajib diisi' });
    }
    const validPay = ['pending','paid','failed'].includes(reqPay) ? reqPay : 'pending';
    const validOrd = ['pending','confirmed','completed','cancelled','returned'].includes(reqOrd) ? reqOrd : 'pending';
    const validProg = ['antri','proses','selesai','diambil'].includes(reqProg) ? reqProg : 'antri';

    // Enrich items dari DB (isi price/subtotal bila tak dikirim frontend) + validasi stok + isi purchasePrice snapshot
    const enriched = [];
    for (const item of items) {
      const prod = await Product.findById(item.productId);
      if (!prod) return res.status(400).json({ error: `Produk ${item.productId} tidak ditemukan` });
      if (prod.stock < item.quantity) {
        return res.status(400).json({ error: `Stok ${prod.name} tidak cukup` });
      }
      const price = Number(item.price ?? prod.price);
      const purchasePrice = Number(prod.purchasePrice || 0);
      const quantity = Number(item.quantity);
      const subtotal = price * quantity;
      enriched.push({
        productId: String(prod._id),
        productName: item.productName || prod.name,
        price,
        purchasePrice,
        quantity,
        subtotal
      });
    }

    const originalTotal = enriched.reduce((s, it) => s + it.subtotal, 0);
    const disc = Math.min(Math.max(Number(discount) || 0, 0), 100); // clamp 0-100
    const totalAmount = Math.round(originalTotal * (1 - disc / 100));

    const order = new Order({
      orderId: `ORD-${Date.now()}`,
      customerId: customerId || null,
      items: enriched,
      originalTotal,
      discount: disc,
      totalAmount,
      source: source || 'pos',
      paymentStatus: validPay,
      orderStatus: validOrd,
      progress: validProg
    });
    await order.save();

    // Decrement stock
    for (const it of enriched) {
      await Product.findByIdAndUpdate(it.productId, { $inc: { stock: -it.quantity } });
    }

    // Update customer: piutang vs lunas + reward points
    if (customerId) {
      const pts = calcPoints(totalAmount);
      if (validPay === 'pending') {
        await Customer.findByIdAndUpdate(customerId, { $inc: { outstanding: totalAmount, transactionCount: 1 }, lastTransaction: new Date() });
      } else if (validPay === 'paid') {
        await Customer.findByIdAndUpdate(customerId, { $inc: { totalSpent: totalAmount, transactionCount: 1, points: pts }, lastTransaction: new Date() });
      } else {
        await Customer.findByIdAndUpdate(customerId, { $inc: { transactionCount: 1 }, lastTransaction: new Date() });
      }
    }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get orders — admin/kasir only
router.get('/orders', authMiddleware, async (req, res) => {
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

// Get single order — admin/kasir only
router.get('/orders/:orderId', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update order status / payment / progress — admin/kasir only
router.patch('/orders/:orderId', authMiddleware, async (req, res) => {
  try {
    const { orderStatus, paymentStatus, progress } = req.body;
    const prev = await Order.findOne({ orderId: req.params.orderId });
    if (!prev) return res.status(404).json({ error: 'Order not found' });

    const wasCancelled = prev.orderStatus === 'cancelled';
    const nowCancelled = orderStatus === 'cancelled' && !wasCancelled;
    if (nowCancelled) {
      for (const item of prev.items) {
        try { await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } }); } catch(_e){}
      }
      // batalkan piutang/lunas
      if (prev.customerId) {
        if (prev.paymentStatus === 'pending') {
          await Customer.findByIdAndUpdate(prev.customerId, { $inc: { outstanding: -prev.totalAmount } });
        } else if (prev.paymentStatus === 'paid') {
          await Customer.findByIdAndUpdate(prev.customerId, { $inc: { totalSpent: -prev.totalAmount } });
        }
      }
    }

    // pelunasan piutang: pending -> paid (settlement) + tambah poin
    const settlePiutang = prev.paymentStatus === 'pending' && paymentStatus === 'paid' && !nowCancelled;
    if (settlePiutang && prev.customerId) {
      const pts = calcPoints(prev.totalAmount);
      await Customer.findByIdAndUpdate(prev.customerId, { $inc: { outstanding: -prev.totalAmount, totalSpent: prev.totalAmount, points: pts } });
    }

    // cancel: potong poin jika order sudah paid
    if (nowCancelled && prev.paymentStatus === 'paid' && prev.customerId) {
      const pts = calcPoints(prev.totalAmount);
      await Customer.findByIdAndUpdate(prev.customerId, { $inc: { points: -pts } });
    }

    const update = { updatedAt: new Date() };
    if (orderStatus) update.orderStatus = orderStatus;
    if (paymentStatus) update.paymentStatus = paymentStatus;
    if (progress && ['antri','proses','selesai','diambil'].includes(progress)) update.progress = progress;
    const order = await Order.findOneAndUpdate({ orderId: req.params.orderId }, update, { new: true });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /orders/:orderId/return — admin/kasir only
router.post('/orders/:orderId/return', authMiddleware, async (req, res) => {
  try {
    const { reason, itemIndexes } = req.body;
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (['cancelled', 'returned'].includes(order.orderStatus)) {
      return res.status(400).json({ error: 'Order sudah dibatalkan/diretur' });
    }
    if (order.orderStatus === 'pending') {
      return res.status(400).json({ error: 'Order belum dibayar, gunakan Batalkan saja' });
    }

    const idxs = Array.isArray(itemIndexes) && itemIndexes.length
      ? itemIndexes.filter(i => i >= 0 && i < order.items.length)
      : order.items.map((_, i) => i);

    let refundAmount = 0;
    for (const i of idxs) {
      const item = order.items[i];
      refundAmount += item.subtotal || (item.price * item.quantity);
      await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } });
    }
    // ponytail: refund belum potong diskon; add when butuh refund proporsional = refundAmount * (1 - discount/100)

    const fullReturn = idxs.length === order.items.length;
    const setFields = { updatedAt: new Date() };
    if (fullReturn) {
      setFields.orderStatus = 'returned';
      if (order.customerId) {
        const pts = calcPoints(order.totalAmount);
        if (order.paymentStatus === 'paid') {
          await Customer.findByIdAndUpdate(order.customerId, { $inc: { totalSpent: -order.totalAmount, transactionCount: -1, points: -pts } });
        } else if (order.paymentStatus === 'pending') {
          await Customer.findByIdAndUpdate(order.customerId, { $inc: { outstanding: -order.totalAmount, transactionCount: -1 } });
        } else {
          await Customer.findByIdAndUpdate(order.customerId, { $inc: { transactionCount: -1 } });
        }
      }
    }

    const updated = await Order.findOneAndUpdate(
      { orderId: req.params.orderId },
      { $set: setFields, $push: { returns: { at: new Date(), reason: reason || '', itemIndexes: idxs, refundAmount } } },
      { new: true }
    );
    res.json({ success: true, order: updated, refundAmount, fullReturn });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const Shift = require('../models/Shift');
const Order = require('../models/Order');
const Product = require('../models/Product');
const authMiddleware = require('../middleware/auth');

// Get all shifts (admin sees all, kasir sees own)
router.get('/shifts', authMiddleware, async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { cashierId: req.user._id };
    const shifts = await Shift.find(filter).sort({ openedAt: -1 }).limit(100);
    res.json(shifts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current open shift for logged-in cashier
router.get('/shifts/current', authMiddleware, async (req, res) => {
  try {
    const shift = await Shift.findOne({ cashierId: req.user._id, status: 'open' });
    if (!shift) return res.json({ shift: null });
    res.json({ shift });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Open shift
router.post('/shifts/open', authMiddleware, async (req, res) => {
  try {
    const existing = await Shift.findOne({ cashierId: req.user._id, status: 'open' });
    if (existing) return res.status(400).json({ error: 'Shift sudah dibuka. Tutup dulu shift lama.' });

    const openedCash = Number(req.body.openedCash || 0);
    const shift = new Shift({
      cashierId: req.user._id,
      cashierName: req.user.username,
      openedCash,
      expectedCash: openedCash
    });
    await shift.save();
    res.json({ success: true, shift });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Close shift
router.patch('/shifts/close/:id', authMiddleware, async (req, res) => {
  try {
    const { closedCash, notes } = req.body;
    const shift = await Shift.findById(req.params.id);
    if (!shift) return res.status(404).json({ error: 'Shift tidak ditemukan' });
    if (shift.status === 'closed') return res.status(400).json({ error: 'Shift sudah ditutup' });
    if (String(shift.cashierId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Bukan shift kamu' });
    }

    // Hitung statistik order dalam rentang shift
    const orders = await Order.find({
      createdAt: { $gte: shift.openedAt, $lte: new Date() },
      orderStatus: 'completed',
      paymentStatus: 'paid'
    });

    let totalSales = 0, totalOrders = 0, totalDiscount = 0, totalHPP = 0, totalRefund = 0;
    const allProds = await Product.find({});
    const prodMap = {};
    allProds.forEach(p => prodMap[p._id] = p.purchasePrice || 0);

    for (const o of orders) {
      totalSales += o.totalAmount || 0;
      totalOrders += 1;
      totalDiscount += (o.originalTotal || o.totalAmount) - o.totalAmount;
      for (const it of o.items) {
        const hpp = it.purchasePrice > 0 ? it.purchasePrice : (prodMap[it.productId] || 0);
        totalHPP += hpp * (it.quantity || 0);
      }
    }

    // Refund/retur
    const refundOrders = await Order.find({
      createdAt: { $gte: shift.openedAt, $lte: new Date() },
      orderStatus: 'returned'
    });
    for (const ro of refundOrders) {
      totalRefund += ro.totalAmount || 0;
    }

    const expectedCash = shift.openedCash + totalSales - totalRefund;
    const variance = Number(closedCash) - expectedCash;

    shift.closedAt = new Date();
    shift.closedCash = Number(closedCash || 0);
    shift.totalSales = totalSales;
    shift.totalOrders = totalOrders;
    shift.totalDiscount = totalDiscount;
    shift.totalHPP = totalHPP;
    shift.totalRefund = totalRefund;
    shift.expectedCash = expectedCash;
    shift.notes = notes || '';
    shift.status = 'closed';
    await shift.save();

    res.json({ success: true, shift, variance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shift report detail
router.get('/shifts/:id', authMiddleware, async (req, res) => {
  try {
    const shift = await Shift.findById(req.params.id);
    if (!shift) return res.status(404).json({ error: 'Shift tidak ditemukan' });
    res.json({ shift });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const authMiddleware = require('../middleware/auth');

// GET /reports — statistik penjualan (admin only)
router.get('/reports', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { start, end } = req.query;
    const filter = { orderStatus: 'completed', paymentStatus: 'paid' };

    if (start || end) {
      filter.createdAt = {};
      if (start) filter.createdAt.$gte = new Date(start);
      if (end) filter.createdAt.$lte = new Date(end);
    }

    const orders = await Order.find(filter);
    
    const summary = {
      totalRevenue: orders.reduce((s, o) => s + o.totalAmount, 0),
      totalOrders: orders.length,
      originalTotal: orders.reduce((s, o) => s + (o.originalTotal || o.totalAmount), 0),
      totalDiscount: orders.reduce((s, o) => s + ((o.originalTotal || o.totalAmount) - o.totalAmount), 0),
      productStats: {}
    };

    orders.forEach(o => {
      o.items.forEach(it => {
        if (!summary.productStats[it.productName]) {
          summary.productStats[it.productName] = { qty: 0, revenue: 0 };
        }
        summary.productStats[it.productName].qty += it.quantity;
        summary.productStats[it.productName].revenue += it.subtotal || (it.price * it.quantity);
      });
    });

    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /reports/export — export CSV (admin only)
router.get('/reports/export', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { start, end } = req.query;
    const filter = { orderStatus: { $ne: 'cancelled' } };
    if (start || end) {
      filter.createdAt = {};
      if (start) filter.createdAt.$gte = new Date(start);
      if (end) filter.createdAt.$lte = new Date(end);
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 });
    
    let csv = 'Order ID,Tanggal,Pelanggan,Total Original,Diskon (%),Total Bayar,Status Order,Status Bayar,Items\n';
    orders.forEach(o => {
      const itemsStr = o.items.map(it => `${it.productName} (x${it.quantity})`).join('; ');
      csv += `${o.orderId},${o.createdAt.toISOString()},${o.customerId || 'Guest'},${o.originalTotal || o.totalAmount},${o.discount || 0},${o.totalAmount},${o.orderStatus},${o.paymentStatus},"${itemsStr}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=laporan-penjualan.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

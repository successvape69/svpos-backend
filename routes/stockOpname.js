const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const StockOpname = require('../models/StockOpname');

// POST opname — body: items: [{productId, physicalStock}], createdBy optional (admin only)
router.post('/stock-opname', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { items, createdBy } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items required' });

    const opnameItems = [];
    for (const it of items) {
      const prod = await Product.findById(it.productId);
      if (!prod) return res.status(400).json({ error: `Product ${it.productId} not found` });
      const systemStock = prod.stock || 0;
      const physicalStock = Number(it.physicalStock);
      const diff = physicalStock - systemStock;
      opnameItems.push({
        productId: String(prod._id),
        productName: prod.name,
        systemStock,
        physicalStock,
        diff
      });
      await Product.findByIdAndUpdate(prod._id, { stock: physicalStock });
    }

    const totalDiff = opnameItems.reduce((s, i) => s + i.diff, 0);
    const record = new StockOpname({
      opnameId: `OPN-${Date.now()}`,
      date: new Date(),
      items: opnameItems,
      totalDiff,
      createdBy: createdBy || 'system'
    });
    await record.save();
    res.json({ success: true, opname: record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET history (admin only)
router.get('/stock-opname', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const list = await StockOpname.find().sort({ createdAt: -1 }).limit(50);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

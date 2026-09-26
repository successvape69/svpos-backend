const express = require('express');
const router = express.Router();
const Cashflow = require('../models/Cashflow');
const Order = require('../models/Order');

// GET /cashflow/summary — hitung total kas & modal yang bisa dibelanjakan
router.get('/cashflow/summary', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    
    const flows = await Cashflow.find();
    const orders = await Order.find({ orderStatus: 'completed', paymentStatus: 'paid' });

    let capital = 0;
    let expenses = 0;
    let restocks = 0;

    flows.forEach(f => {
      if (f.type === 'capital') capital += f.amount;
      else if (f.type === 'expense') expenses += f.amount;
      else if (f.type === 'restock') restocks += f.amount;
    });

    const totalSales = orders.reduce((s, o) => s + o.totalAmount, 0);
    const availableFunds = (capital + totalSales) - (expenses + restocks);

    res.json({
      capital,
      totalSales,
      expenses,
      restocks,
      availableFunds,
      flows: flows.sort((a,b)=>b.date - a.date)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /cashflow — catat modal, pengeluaran, atau restock
router.post('/cashflow', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { type, amount, description } = req.body;
    if (!type || !amount) return res.status(400).json({ error: 'Type & amount required' });

    const flow = new Cashflow({ type, amount: Number(amount), description });
    await flow.save();
    res.json({ success: true, flow });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

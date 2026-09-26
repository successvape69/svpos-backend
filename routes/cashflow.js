const express = require('express');
const router = express.Router();
const Cashflow = require('../models/Cashflow');
const Order = require('../models/Order');
const Product = require('../models/Product');
const authMiddleware = require('../middleware/auth');

// Hitung HPP pakai snapshot; fallback ke harga beli produk sekarang bila snapshot kosong
async function calcHPP(orders) {
  const allProds = await Product.find({});
  const prodMap = {};
  allProds.forEach(p => { prodMap[p._id] = p.purchasePrice || 0; });

  let total = 0;
  for (const o of orders) {
    for (const it of (o.items || [])) {
      const hpp = it.purchasePrice > 0 ? it.purchasePrice : (prodMap[it.productId] || 0);
      total += hpp * (it.quantity || 0);
    }
  }
  return total;
}

// GET /cashflow/summary — posisi modal & laba dipisah
// Rumus user (benar):
//  modalPosisi(t) = modalPosisi(t-1) + HPP_hari_ini - restock_hari_ini
// collapsed: modalPosisi = capital + sum(HPP) - sum(restock)
//  Kas total (fisik di laci) = modalPosisi + labaBersih
//  labaKotor = omzet(setelah diskon) - HPP
//  labaBersih = labaKotor - biayaOperasional
// -> restock HANYA potong modal, JANGAN potong laba. Operasional potong laba, jangan potong modal.
router.get('/cashflow/summary', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const flows = await Cashflow.find();
    const paidOrders = await Order.find({ orderStatus: 'completed', paymentStatus: 'paid' });

    let capital = 0;
    let expenses = 0;
    let restocks = 0;

    flows.forEach(f => {
      if (f.type === 'capital') capital += f.amount;
      else if (f.type === 'expense') expenses += f.amount;
      else if (f.type === 'restock') restocks += f.amount;
    });

    const totalSales = paidOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const totalOriginal = paidOrders.reduce((s, o) => s + (o.originalTotal || o.totalAmount || 0), 0);
    const totalDiscount = Math.max(totalOriginal - totalSales, 0);
    const totalHPP = await calcHPP(paidOrders);

    const grossProfit = totalSales - totalHPP;
    const netProfit = grossProfit - expenses;

    // uang bisa belanja restock — HANYA dari modal, bukan dari laba
    const modalPosisi = capital + totalHPP - restocks;

    // kas fisik total (jika digabung) — untuk validasi, bukan untuk belanja
    const kasTotal = modalPosisi + netProfit; // = capital + totalSales - restocks - expenses

    res.json({
      capital,
      restocks,
      totalSales,
      totalOriginal,
      totalDiscount,
      totalHPP,
      grossProfit,
      expenses,
      netProfit,
      modalPosisi,      // <-- ini "uang bisa dibelanjakan untuk restock"
      kasTotal,         // total cash fisik
      retainedEarnings: netProfit,
      // backward compat (old frontend field)
      availableFunds: modalPosisi,
      flows: flows.sort((a, b) => b.date - a.date)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /cashflow — catat modal, pengeluaran, atau restock
router.post('/cashflow', authMiddleware, async (req, res) => {
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

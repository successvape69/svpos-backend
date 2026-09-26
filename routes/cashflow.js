const express = require('express');
const router = express.Router();
const Cashflow = require('../models/Cashflow');
const Order = require('../models/Order');

// Hitung HPP (cost of goods sold) dari order paid+completed berdasarkan snapshot purchasePrice
function calcHPP(orders) {
  let total = 0;
  for (const o of orders) {
    for (const it of (o.items || [])) {
      // fallback: kalau snapshot purchasePrice 0 / belum ada, HPP dianggap 0 (jangan tebak)
      total += (it.purchasePrice || 0) * (it.quantity || 0);
    }
  }
  return total;
}

// GET /cashflow/summary — Kas, Modal, HPP, Laba
// Definisi:
//  - Kas = capital + totalSales - (restocks + expenses)  [uang tersedia buat restock]
//  - Modal Toko = capital + HPP dari barang yang sudah terjual (atau capital kalau HPP 0) — modal stok terikat di barang dagang
//  - Modal Awal = capital (cash injection)
//  - totalSales = omzet (paid+completed)
//  - HPP = sum(purchasePrice*qty) dari order lunas
//  - Laba Kotor = totalSales - HPP - totalDiscount (diskon adalah pengurang omzet)
//  - Laba Bersih = Laba Kotor - expenses
//  - Biaya operasional (expense) TIDAK mengurangi modal, hanya mengurangi laba.
router.get('/cashflow/summary', async (req, res) => {
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

    const totalHPP = calcHPP(paidOrders); // dibutuhkan purchasePrice snapshot di Order.items

    const grossProfit = totalSales - totalHPP; // sebelum biaya operasional
    const netProfit = grossProfit - expenses; // biaya operasional baru potong di sini

    // Kas tersedia buat restock/belanja: kas fisik
    const availableFunds = (capital + totalSales) - (expenses + restocks);

    // Modal terikat di stok = (Modal awal yang dibelanjakan) vs HPP keluar
    // Interpretasi praktis: Modal toko saat ini = capital - netProfit negatif? Untuk sederhana: modal = capital.
    // HPP dipakai untuk ukur laba, bukan untuk kurangi modal langsung.

    // Ringkasan laba/pos keuangan buat dashboard
    const summary = {
      capital,
      restocks,
      totalSales,
      totalOriginal,
      totalDiscount,
      totalHPP,           // <-- HPP penjualan (modal yang ikut terjual)
      grossProfit,        // laba kotor
      expenses,           // biaya operasional (potong laba bersih)
      netProfit,          // laba bersih
      availableFunds,     // kas tersedia (bisa belanja restock)
      // posisi modal (informasional)
      // modalToko = capital (uang pemilik) ; laba ditahan = netProfit kalau positif
      retainedEarnings: netProfit, // laba ditahan (bisa minus)
      flows: flows.sort((a, b) => b.date - a.date)
    };

    res.json(summary);
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

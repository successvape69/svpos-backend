const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Cashflow = require('../models/Cashflow');
const Shift = require('../models/Shift');

// GET /backup — export data
router.get('/backup', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const backup = {
    products: await Product.find(),
    customers: await Customer.find(),
    orders: await Order.find(),
    cashflow: await Cashflow.find(),
    shifts: await Shift.find(),
    timestamp: new Date()
  };
  res.json(backup);
});

// POST /restore — import data (WARNING: replaces all)
router.post('/restore', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { products, customers, orders, cashflow, shifts } = req.body;
  await Product.deleteMany({});
  await Customer.deleteMany({});
  await Order.deleteMany({});
  await Cashflow.deleteMany({});
  await Shift.deleteMany({});
  if (products && products.length) await Product.insertMany(products);
  if (customers && customers.length) await Customer.insertMany(customers);
  if (orders && orders.length) await Order.insertMany(orders);
  if (cashflow && cashflow.length) await Cashflow.insertMany(cashflow);
  if (shifts && shifts.length) await Shift.insertMany(shifts);
  res.json({ success: true });
});

module.exports = router;
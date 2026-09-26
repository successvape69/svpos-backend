const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');

// Create customer
router.post('/customers', async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const customer = new Customer({ name, phone, email });
    await customer.save();
    res.json({ success: true, customer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all customers
router.get('/customers', async (req, res) => {
  try {
    const customers = await Customer.find().sort({ name: 1 });
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single customer
router.get('/customers/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update customer
router.patch('/customers/:id', async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { name, phone, email, updatedAt: new Date() },
      { new: true }
    );
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete customer
router.delete('/customers/:id', async (req, res) => {
  try {
    await Customer.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lookup customer by phone — public (untuk portal pelanggan web)
router.get('/customers/lookup/:phone', async (req, res) => {
  try {
    const phone = req.params.phone.replace(/[^0-9]/g, '');
    const customer = await Customer.findOne({ phone });
    if (!customer) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });

    // Ambil order pelanggan (public, hanya info dasar)
    const Order = require('../models/Order');
    const orders = await Order.find({ customerId: customer._id }).sort({ createdAt: -1 }).limit(20);

    res.json({
      name: customer.name,
      phone: customer.phone,
      points: customer.points || 0,
      totalSpent: customer.totalSpent || 0,
      transactionCount: customer.transactionCount || 0,
      orders: orders.map(o => ({
        orderId: o.orderId,
        items: o.items.map(i => ({ name: i.productName, qty: i.quantity, price: i.price })),
        totalAmount: o.totalAmount,
        paymentStatus: o.paymentStatus,
        orderStatus: o.orderStatus,
        progress: o.progress,
        source: o.source,
        createdAt: o.createdAt
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

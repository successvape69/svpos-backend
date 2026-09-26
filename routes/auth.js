const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const JWT_SECRET = process.env.JWT_SECRET || 'svpos_secret_key_change_me';

// POST /auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // Default admin hardcoded (backward compatible)
  if (username === 'admin' && password === 'admin123') {
    const token = jwt.sign({ username: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
    return res.json({ token, user: { username: 'admin', role: 'admin' } });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User tidak ditemukan' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Password salah' });
    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /auth/users — admin only
router.get('/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Akses ditolak' });
  try {
    const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/users — admin only (tambah user baru)
router.post('/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Akses ditolak' });
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username & password wajib' });
    const hash = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hash, role: role === 'admin' ? 'admin' : 'kasir' });
    await user.save();
    res.status(201).json({ success: true, user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(400).json({ error: err.code === 11000 ? 'Username sudah dipakai' : err.message });
  }
});

// PATCH /:id — admin only (ubah role atau password)
router.patch('/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Akses ditolak' });
  try {
    const update = {};
    if (req.body.role) update.role = req.body.role === 'admin' ? 'admin' : 'kasir';
    if (req.body.password) update.password = await bcrypt.hash(req.body.password, 10);
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, fields: { password: 0 } });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /:id — admin only
router.delete('/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Akses ditolak' });
  try {
    if (req.user.id === req.params.id) return res.status(400).json({ error: 'Tidak bisa hapus akun sendiri' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;

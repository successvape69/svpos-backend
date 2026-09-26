const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB connect
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB error:', err));

// Routes
const orderRoutes = require('./routes/orders');
const customerRoutes = require('./routes/customers');
const productRoutes = require('./routes/products');
const authRoutes = require('./routes/auth');
const midtransRoutes = require('./routes/midtrans');
const stockOpnameRoutes = require('./routes/stockOpname');
const authMiddleware = require('./middleware/auth');

app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend live' });
});

app.use('/api/auth', authRoutes);
app.use('/api/midtrans', midtransRoutes);
app.use('/api', authMiddleware, orderRoutes);
app.use('/api', authMiddleware, stockOpnameRoutes);
app.use('/api', customerRoutes);
app.use('/api', productRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running port ${PORT}`));

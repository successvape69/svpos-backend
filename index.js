const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connect
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB error:', err));

// Routes
const orderRoutes = require('./routes/orders');
const customerRoutes = require('./routes/customers');

app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend live' });
});

app.use('/api', orderRoutes);
app.use('/api', customerRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running port ${PORT}`));

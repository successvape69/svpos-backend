const midtransClient = require('midtrans-client');

const isConfigured = !!process.env.MIDTRANS_SERVER_KEY;
const snap = isConfigured ? new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
}) : null;

module.exports = { snap, isConfigured };

'use strict';
require('dotenv').config();

const express = require('express');
const app = express();

// Twilio sends form-urlencoded bodies for webhook POSTs
app.use(express.urlencoded({ extended: false }));

// ── Voice call routes ──────────────────────────────────────────────────────────
// 1. Twilio calls this when a call comes in
app.post('/voice/inbound',  require('./routes/inbound'));
// 2. Identifies which form the caller needs
app.post('/voice/route',    require('./routes/route'));
// 3. Main conversation loop — one request per caller turn
app.post('/voice/respond',  require('./routes/respond'));
// 4. Form complete — reads out reference number and hangs up
app.post('/voice/confirm',  require('./routes/confirm'));

// Health check (useful for deployment)
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nGovBB voice server running on http://localhost:${PORT}`);
  console.log(`\nTwilio webhook → POST http://localhost:${PORT}/voice/inbound`);
  console.log('Expose publicly with:  ngrok http ' + PORT);
  if (!process.env.GROQ_API_KEY) {
    console.warn('\n⚠️  GROQ_API_KEY is not set — add it to server/.env\n');
  }
});

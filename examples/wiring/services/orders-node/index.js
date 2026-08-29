// orders service (Node). The wire contract it PRODUCES lives in code as a
// plain schema object — the extractor picks it up.
const express = require('express');
const app = express();

const ChargePayload = { order_id: 'string', amount: 'number' };

app.post('/orders', async (req, res) => {
  const payload = { order_id: String(req.body.id), amount: Number(req.body.total) };
  await fetch(process.env.BILLING_URL + '/charge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  res.json({ ok: true });
});

app.listen(8080);

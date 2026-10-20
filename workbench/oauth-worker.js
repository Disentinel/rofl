// A Cloudflare Worker that trades the code GitHub sends the workbench back with for a token, holding the OAuth App's secret the page cannot.
// Deploy: `npx wrangler deploy workbench/oauth-worker.js --name rofl-oauth --compatibility-date 2026-10-01`, then
// `npx wrangler secret put CLIENT_ID` and `npx wrangler secret put CLIENT_SECRET`; its address goes in EXCHANGE of workbench/github.ts.
const ORIGIN = 'https://disentinel.github.io';

export default {
  async fetch(req, env) {
    const cors = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return new Response('POST {code}', { status: 405, headers: cors });
    const { code } = await req.json().catch(() => ({}));
    if (!code) return Response.json({ error: 'no code' }, { status: 400, headers: cors });
    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: env.CLIENT_ID, client_secret: env.CLIENT_SECRET, code }),
    });
    const j = await r.json();
    return Response.json(j.access_token ? { access_token: j.access_token } : { error: j.error, error_description: j.error_description }, { headers: cors });
  },
};

// A Cloudflare Worker holding the secrets of the workbench's two GitHub sign-ins (workbench/github.ts), which the page cannot hold.
// POST JSON {kind, code, code_verifier} trades a code (PKCE) for a token; {kind, revoke: token} revokes one, `revoked` only when GitHub said so (204).
// No refresh token is ever passed on.
// `kind` is 'app', the GitHub App "ROFL Workbench", or 'oauth', the OAuth App "ROFL Workbench (full access)"; anything else is refused unasked.
// Deploy: `npx wrangler deploy workbench/oauth-worker.js --name rofl-oauth --compatibility-date 2026-10-01`, then `npx wrangler secret put` each of
// APP_CLIENT_ID, APP_CLIENT_SECRET, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET; its address goes in EXCHANGE of workbench/github.ts.
const ORIGIN = 'https://disentinel.github.io';
const APPS = { app: ['APP_CLIENT_ID', 'APP_CLIENT_SECRET'], oauth: ['OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET'] };
const text = (x) => typeof x === 'string' && x.length > 0;

export default {
  async fetch(req, env) {
    const cors = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST' };
    const no = (error, status = 400) => Response.json({ error }, { status, headers: cors });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return no('POST {kind, code, code_verifier | revoke}', 405);
    const { kind, code, code_verifier, revoke } = await req.json().catch(() => ({})) ?? {};
    const pair = typeof kind === 'string' && Object.hasOwn(APPS, kind) ? APPS[kind] : null;
    if (!pair || [code, revoke].filter(text).length !== 1 || (code && !text(code_verifier))) return no('kind app or oauth, and a code with its code_verifier, or revoke');
    const [id, secret] = pair.map((k) => env[k]);
    if (!text(id) || !text(secret)) return no(`the ${kind} app's secrets are not set`, 500);
    if (revoke) {
      const r = await fetch(`https://api.github.com/applications/${id}/token`, {
        method: 'DELETE', body: JSON.stringify({ access_token: revoke }),
        headers: { authorization: `Basic ${btoa(`${id}:${secret}`)}`, accept: 'application/vnd.github+json', 'user-agent': 'rofl-workbench' },
      });
      return Response.json({ revoked: r.status === 204 }, { headers: cors });
    }
    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: id, client_secret: secret, code, code_verifier }),
    });
    const j = await r.json().catch(() => ({}));
    return Response.json(j.access_token ? { access_token: j.access_token } : { error: j.error, error_description: j.error_description }, { headers: cors });
  },
};

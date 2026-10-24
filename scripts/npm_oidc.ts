// node --experimental-strip-types scripts/npm_oidc.ts <package>...: npm's sign-in by trusted publishing, tried for each package the way
// `npm publish` and `npm stage publish` try it (npm's lib/utils/oidc.js): GitHub's id token for the audience npm:registry.npmjs.org, then
// POST /-/npm/v1/oidc/token/exchange/package/<name>. npm itself swallows every failure of this and goes on with no credentials, which
// ends in ENEEDAUTH; this says which step failed and what the registry answered. It prints the token's claims the registry matches
// (repository, workflow, environment), never a token.
// Exit 0 every package signed in, or not in GitHub Actions (nothing tried, said); 1 the registry refused one; 2 no id token to exchange.
const REGISTRY = 'https://registry.npmjs.org/';
if (process.env.GITHUB_ACTIONS !== 'true') { console.log('npm sign-in: not in GitHub Actions, the sign-in by trusted publishing is not tried'); process.exit(0); }
const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, request = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
if (!url || !request) {
  console.log('npm sign-in: no ACTIONS_ID_TOKEN_REQUEST_URL or _TOKEN: the job has no `permissions: id-token: write`, so npm has no id token and publishes as nobody (ENEEDAUTH)');
  process.exit(2);
}
const at = new URL(url);
at.searchParams.append('audience', `npm:${new URL(REGISTRY).hostname}`);
const gh = await fetch(at, { headers: { Accept: 'application/json', Authorization: `Bearer ${request}` } });
const id: string | undefined = gh.ok ? (await gh.json()).value : undefined;
if (!id) { console.log(`npm sign-in: GitHub gave no id token (${gh.status})`); process.exit(2); }
const claims = JSON.parse(Buffer.from(id.split('.')[1], 'base64url').toString('utf8'));
console.log(`npm sign-in: GitHub's id token says repository ${claims.repository}, workflow ${claims.workflow_ref}, environment ${claims.environment ?? '(none)'}, ref ${claims.ref}`);
let refused = 0;
for (const name of process.argv.slice(2)) {
  const r = await fetch(new URL(`/-/npm/v1/oidc/token/exchange/package/${name.replace('/', '%2f')}`, REGISTRY), { method: 'POST', headers: { Accept: 'application/json', Authorization: `Bearer ${id}` } });
  const text = await r.text();
  let body: { token?: unknown, message?: string, error?: string } = {};
  try { body = JSON.parse(text); } catch { /* the answer is said as text */ }
  const ok = r.ok && typeof body.token === 'string';
  if (!ok) refused++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: the registry answered ${r.status}${ok ? ' with a token' : `: ${body.message ?? body.error ?? text.slice(0, 300)}`}`);
}
process.exit(refused ? 1 : 0);

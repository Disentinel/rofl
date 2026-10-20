// The workbench's two GitHub sign-ins (workbench/github.ts, as built), the links it reads with them (nearLink of workbench/bench.ts) and their
// worker (workbench/oauth-worker.js), against a GitHub played here: storages, location, the clock and fetch are fakes, nothing reaches the network.
// `node --experimental-strip-types scripts/workbench_auth.ts GITHUB_JS WORKER_JS` prints, as JSON, every wrong thing it saw; test:workbench runs it
// on the build and on copies with a planted defect.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as path from 'node:path';

const [lib, workerSrc] = process.argv.slice(2);
const EXCHANGE = 'https://rofl-oauth.example.workers.dev/', OAUTH = 'Ov23-full-access';
const bad: string[] = [];
let clock = Date.parse('2026-10-20T12:00:00Z');   // the page's clock, moved by the test
Date.now = () => clock;
const want = (ok: unknown, what: string) => { if (!ok) bad.push(what); };

// two copies of the module, whatever the source holds: one with no worker (the pasted token), one with the worker and the full-access app set up
const text = readFileSync(lib, 'utf8');
const set = (k: string, v: string, t: string) => { if (!new RegExp(`export const ${k} = '[^']*';`).test(t)) bad.push(`no ${k} constant in the build`); return t.replace(new RegExp(`export const ${k} = '[^']*';`), `export const ${k} = '${v}';`); };
const pasted = path.join(path.dirname(lib), 'github-pasted.js'), configured = path.join(path.dirname(lib), 'github-configured.js');
writeFileSync(pasted, set('EXCHANGE', '', text));
writeFileSync(configured, set('OAUTH_CLIENT_ID', OAUTH, set('EXCHANGE', EXCHANGE, text)));

class Store {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  has(s: string) { return [...this.m].some(([k, v]) => k.includes(s) || v.includes(s)); }
}
type Sent = { url: string; method: string; auth?: string; body?: any };
type Answer = { status: number; body?: unknown };
/** One browser tab over a played GitHub: `route` answers each request, every request is kept in `sent`, and after 200 the network is gone. */
function tab(route: (s: Sent) => Answer | undefined, local = new Store()) {
  const t = { local, session: new Store(), sent: [] as Sent[], went: [] as string[], prompted: 0, pasted: null as string | null };
  const g = globalThis as any;
  g.localStorage = t.local; g.sessionStorage = t.session;
  g.location = { search: '?gh=me/priv/a.rofl.md', origin: 'https://disentinel.github.io', pathname: '/rofl/', set href(u: string) { t.went.push(u); } };
  g.prompt = () => { t.prompted++; return t.pasted; };
  g.fetch = async (url: string, init: any = {}) => {
    const s: Sent = { url, method: init.method ?? 'GET', auth: init.headers?.authorization, body: init.body ? JSON.parse(init.body) : undefined };
    t.sent.push(s);
    if (t.sent.length > 200) throw new TypeError('network gone');
    const a = route(s) ?? { status: 404, body: { message: 'Not Found' } };
    return new Response(a.status === 204 ? null : typeof a.body === 'string' ? a.body : JSON.stringify(a.body ?? {}), { status: a.status });
  };
  return t;
}
let n = 0;
const fresh = (file: string) => import(`${file}?${n++}`);
const worker = (s: Sent) => s.url === EXCHANGE;
const authorize = (t: { went: string[]; sent: Sent[] }) => [...t.went, ...t.sent.map((s) => s.url)].filter((u) => u.startsWith('https://github.com/login/oauth/authorize'));
const s256 = (v: string) => createHash('sha256').update(v).digest('base64url');
/** A played GitHub where `me` owns `me/priv`, `other/priv` is someone else's, and tokens are known by `logins`. */
const github = (logins: Record<string, string>, more: (s: Sent) => Answer | undefined = () => undefined) => (s: Sent): Answer | undefined => {
  const tok = s.auth?.replace('Bearer ', '') ?? '';
  return more(s) ?? (s.url === 'https://api.github.com/user' ? (logins[tok] ? { status: 200, body: { login: logins[tok] } } : { status: 401 })
    : s.url.startsWith('https://api.github.com/repos/me/priv/contents/') && logins[tok] === 'me' ? { status: 200, body: 'Declared as facts:' }
    : s.url === 'https://api.github.com/repos/me/priv' && logins[tok] === 'me' ? { status: 200, body: {} } : undefined);
};
const said = async (what: string, f: () => Promise<void>) => { try { await f(); } catch (e) { bad.push(`${what}: threw ${(e as Error).message}`); } };

/** Signed in with the app through the played sign-in, the link of `me/priv` opened: the module and the tab. */
async function appSignIn(route: (s: Sent) => Answer | undefined, local?: Store) {
  const t = tab(route, local), gh = await fresh(configured);
  await gh.signIn();
  const u = new URL(t.went.at(-1) ?? 'https://x/');
  const q = new URLSearchParams({ code: 'app-code', state: u.searchParams.get('state') ?? '' });
  const back = gh.back(q), who = await gh.finish(q);
  gh.scope('me/priv');
  return { t, gh, u, q, back, who };
}
const appTokens = (s: Sent): Answer | undefined => worker(s) && s.body?.kind === 'app' && s.body.code === 'app-code' && s.body.code_verifier ? { status: 200, body: { access_token: 'ghu_1' } } : undefined;
const OWN = 'https://api.github.com/repos/me/priv/contents/a.rofl.md?ref=main';

// the way it ships until the worker is deployed: Sign in takes a pasted token, keeps it in this browser, reads with it and says the old sentences
await said('pasted token', async () => {
  const t = tab(github({ ghp_pasted: 'me' })), gh = await fresh(pasted);
  t.pasted = 'ghp_pasted';
  const who = await gh.signIn();
  gh.scope('me/priv');
  want(t.prompted === 1 && who?.token === 'ghp_pasted' && !t.went.length, `pasted token: Sign in did not ask for a token and keep it (prompted ${t.prompted}, went to ${t.went.join(' ')})`);
  want(t.local.has('ghp_pasted'), 'pasted token: not kept in this browser');
  want(await gh.read(OWN) === 'Declared as facts:', 'pasted token: the own private repository was not read with it');
  const why = await gh.whyNot('other/priv', 'main', 'a.rofl.md');
  want(why.say === '@me cannot read other/priv: it does not exist, or this account has no access to it. Ask its owner for access, or sign in with another account.' && !why.full, `pasted token: a repository it cannot read said ${JSON.stringify(why)}`);
  await gh.signOut();
  want(!t.local.has('ghp_pasted') && !t.sent.some(worker), 'pasted token: sign out did not just forget it');
});

// happy path: the app's sign-in with PKCE, the own private repository read with the app's token, nothing offering more
await said('app sign-in', async () => {
  const { t, gh, u, back, who } = await appSignIn(github({ ghu_1: 'me' }, appTokens));
  want(u.origin + u.pathname === 'https://github.com/login/oauth/authorize' && u.searchParams.get('client_id') === 'Iv23lihoSE5hsdbSbtXb' && !u.searchParams.get('scope'), `app sign-in: went to ${u}`);
  const traded = t.sent.find(worker)?.body;
  want(u.searchParams.get('code_challenge_method') === 'S256' && traded?.code_verifier?.length >= 43 && u.searchParams.get('code_challenge') === s256(traded.code_verifier),
    `app sign-in: no PKCE: challenge ${u.searchParams.get('code_challenge')} by ${u.searchParams.get('code_challenge_method')}, verifier ${traded?.code_verifier}`);
  want(back === '?gh=me/priv/a.rofl.md', `app sign-in: came back to ${back}`);
  want(who?.login === 'me' && who.kind === 'app' && !who.full, `app sign-in: signed in as ${JSON.stringify(who)}`);
  const text = await gh.read(OWN);
  want(text === 'Declared as facts:' && t.sent.at(-1)?.auth === 'Bearer ghu_1', `app sign-in: the own private repository read ${text} with ${t.sent.at(-1)?.auth}`);
  want(t.local.has('ghu_1') && !t.session.has('ghu_1') && !t.local.has('refresh'), 'app sign-in: the token is not kept in this browser alone, or a refresh token is');
  const why = await gh.whyNot('me/priv', 'main', 'gone.rofl.md');
  want(!why.full && !authorize(t).slice(1).length, `app sign-in: a missing file offered full access: ${JSON.stringify(why)}`);
});

// the token goes to the repository the page opened, and nowhere else: not up and out of it, not to a ?url= link at GitHub's API
await said('token scope', async () => {
  const { t, gh } = await appSignIn(github({ ghu_1: 'me' }, appTokens));
  const authed = () => t.sent.filter((s) => s.auth && !worker(s)).map((s) => s.url);
  const before = authed().length;
  for (const u of ['https://api.github.com/repos/me/priv/contents/../../../../user/installations', 'https://api.github.com/repos/me/priv/contents/%2e%2e/%2e%2e/%2e%2e/%2e%2e/repos/victim/secret/contents/x',
    'https://api.github.com/repos/me/priv/contents/..%2f..%2f..%2f..%2fuser', 'https://api.github.com/repos/me/privy/contents/x', 'https://api.github.com/user/installations', 'https://evil.example/repos/me/priv/contents/x'])
    await gh.read(u);
  gh.scope();   // a ?url= link
  await gh.read('https://api.github.com/user'); await gh.read('https://api.github.com/repos/me/priv/contents/a.rofl.md');
  want(authed().length === before, `token scope: the token went to ${authed().slice(before).join(', ')}`);
  gh.scope('ME/Priv');
  want(await gh.read(OWN) === 'Declared as facts:' && authed().length === before + 1, 'token scope: the opened repository, named in another case, is not read with the token');
  // the paths a notebook names, made into addresses inside the repository or none at all
  const { nearLink } = await import(path.join(path.dirname(lib), 'bench.js'));
  const asked: string[] = [];
  const at = nearLink('https://github.com/me/priv/blob/a%26b/dir/a.rofl.md', async (u: string) => { asked.push(u); return 'x'; }, true);
  for (const p of ['../../../../user/installations', '../../../../repos/victim/secret/contents/x', '%2e%2e/%2e%2e/user', 'dir/./a', 'dir//a', '..', 'dir/%2E%2E/%2e%2E/x', 'dir/a b#c?.md'])
    await at.near.read(p);
  const out = asked.filter((u) => { const x = new URL(u); return !x.pathname.startsWith('/repos/me/priv/contents/') || /%2e|%2f/i.test(x.pathname) || [...x.searchParams.keys()].join() !== 'ref'; });
  want(!out.length && asked.length === 1 && asked[0] === 'https://api.github.com/repos/me/priv/contents/dir/a%20b%23c%3F.md?ref=a%26b', `a notebook's paths: asked for ${asked.join(', ')}`);
  want(at.url === 'https://api.github.com/repos/me/priv/contents/dir/a.rofl.md?ref=a%26b' && at.ref === 'a&b', `a ref with & in it: ${at.url}, ref ${at.ref}`);
  // a link outside GitHub is refused before anything is fetched, with a sentence saying what opens
  for (const l of ['https://evil.example/n.rofl.md', 'http://github.com/me/priv/blob/main/a.rofl.md', 'https://github.com.evil.example/me/priv/blob/main/a.rofl.md', 'evil.example/n.rofl.md']) {
    const got = (() => { try { return `opened ${nearLink(l, async () => undefined).url}`; } catch (e) { return (e as Error).message; } })();
    want(got === 'Only GitHub links open here: github.com/owner/repo/blob/…', `a link outside GitHub, ${l}: ${got}`);
  }
  want(nearLink('https://raw.githubusercontent.com/me/priv/main/a.rofl.md', async () => undefined).repo === 'me/priv', 'a raw GitHub link is refused');
  want(!readFileSync(path.join(path.dirname(lib), 'page.js'), 'utf8').includes('a site that lets other pages read it'), 'the page still offers to read other sites');
});

// someone else's repository the app is not installed on: why, the install link and a button; nothing elevated without the click
await said('not installed', async () => {
  const installed: string[] = ['me'];
  const { t, gh } = await appSignIn(github({ ghu_1: 'me' }, (s) => appTokens(s)
    ?? (s.url.startsWith('https://api.github.com/user/installations') ? { status: 200, body: { installations: installed.map((login) => ({ account: { login } })) } } : undefined)));
  const before = authorize(t).length;
  gh.scope('other/priv');
  want(await gh.read('https://api.github.com/repos/other/priv/contents/a.rofl.md?ref=main') === undefined, 'not installed: someone else\'s repository was read');
  const why = await gh.whyNot('other/priv', 'main', 'a.rofl.md');
  want(why.say === 'other has not installed ROFL Workbench. Ask them to install it (https://github.com/apps/rofl-workbench/installations/new), or sign in with full access.' && why.full === true,
    `not installed, someone else's: said ${JSON.stringify(why)}`);
  want(authorize(t).length === before, `not installed, someone else's: elevated without a click, to ${authorize(t).slice(before).join(' ')}`);
  await gh.elevate();
  const up = new URL(authorize(t).at(-1) ?? 'https://x/');
  want(authorize(t).length === before + 1 && up.searchParams.get('client_id') === OAUTH && up.searchParams.get('scope') === 'repo' && up.searchParams.get('code_challenge_method') === 'S256', `the click on full access went to ${up}`);
  const mine = await gh.whyNot('me/other', 'main', 'a.rofl.md');
  installed.length = 0;
  const own = await gh.whyNot('me/other', 'main', 'a.rofl.md');
  want(own.say === 'ROFL Workbench cannot read me/other until it is installed on your account. Install ROFL Workbench on your account: https://github.com/apps/rofl-workbench/installations/new' && !own.full, `not installed, the own account: said ${JSON.stringify(own)}`);
  want(mine.say.startsWith('@me cannot read me/other: it does not exist, or this account has no access to it. Ask its owner for access') && mine.full === true, `installed and still unreadable: said ${JSON.stringify(mine)}`);
  // the install page is a link, and only that address: another app's, named in a path, stays text
  const html = gh.linked('me/x has no file https://github.com/apps/evil/installations/new at main. Install: https://github.com/apps/rofl-workbench/installations/new');
  want((html.match(/<a /g) ?? []).length === 1 && html.includes('<a href="https://github.com/apps/rofl-workbench/installations/new">'), `the install link: ${html}`);
});

// full access: kept in this tab alone, through a reload, until sign out or two hours after it was issued; both tokens revoked before sign out forgets them
await said('full access', async () => {
  let revokes = true;
  const route = github({ ghu_1: 'me', gho_F: 'me' }, (s) => appTokens(s)
    ?? (worker(s) && s.body?.kind === 'oauth' && s.body.code === 'full-code' && s.body.code_verifier ? { status: 200, body: { access_token: 'gho_F' } } : undefined)
    ?? (worker(s) && s.body?.revoke ? { status: 200, body: { revoked: revokes } } : undefined));
  const full = async (g: any, tt: { went: string[] }) => {
    await g.elevate();
    return g.finish(new URLSearchParams({ code: 'full-code', state: new URL(tt.went.at(-1)!).searchParams.get('state')! }));
  };
  const { t, gh } = await appSignIn(route);
  const who = await full(gh, t);
  want(who?.full && gh.signedIn()?.token === 'gho_F', `full access: signed in as ${JSON.stringify(who)}`);
  await gh.read(OWN);
  want(t.sent.at(-1)?.auth === 'Bearer gho_F', 'full access: reads do not use the full-access token');
  want(!t.local.has('gho_F'), 'full access: the token reached localStorage');
  want(t.session.has('gho_F'), 'full access: the token is not kept in this tab');
  const reloaded = tab(route, t.local), gh2 = await fresh(configured);
  want(gh2.signedIn()?.token === 'ghu_1' && !reloaded.local.has('gho_F') && !reloaded.session.has('gho_F'), `full access: a new tab still holds the token: ${gh2.signedIn()?.token}`);
  const t2 = tab(route, t.local);   // back in the first tab, reloaded: its storage, a fresh page
  (globalThis as any).sessionStorage = t.session;
  want((await fresh(configured)).signedIn()?.token === 'gho_F', 'full access: a reload of the tab lost the token');
  // GitHub does not confirm the revoke: both tokens kept, and the sign out says so
  revokes = false;
  const failed = await gh.signOut().then(() => 'signed out', (e: Error) => e.message);
  want(failed === 'Could not revoke the token at GitHub; it is still valid. Try Sign out again, or revoke it at github.com/settings/applications.', `a revoke refused: sign out said ${failed}`);
  want(t.local.has('ghu_1') && t.session.has('gho_F'), 'a revoke refused: a token GitHub still takes was forgotten');
  revokes = true; t2.sent.length = 0;
  await gh.signOut();
  const revoked = t2.sent.filter((s) => worker(s) && s.body?.revoke).map((s) => `${s.body.kind}:${s.body.revoke}`).sort();
  want(revoked.join(' ') === 'app:ghu_1 oauth:gho_F', `sign out revoked ${revoked.join(' ') || 'nothing'}`);
  want(!t.local.has('ghu_1') && !t.session.has('gho_F') && !gh.signedIn(), 'sign out left a token in a storage');
  // two hours after it was issued: its timer is armed for then, and the first use after revokes it although the timer never fired
  const realTimeout = globalThis.setTimeout, H2 = 2 * 60 * 60 * 1000;
  try {
    const a = await appSignIn(route);
    await full(a.gh, a.t);
    let armed = -1, fire: () => Promise<void> = async () => {};
    (globalThis as any).setTimeout = (f: () => Promise<void>, ms: number) => { armed = ms; fire = f; return 0; };
    a.gh.armFull(() => {});
    want(armed === H2, `the full-access timer is armed for ${armed} ms, not two hours`);
    clock += H2 - 1;
    await a.gh.read(OWN);
    want(a.t.sent.at(-1)?.auth === 'Bearer gho_F', 'a moment before two hours the full-access token is not used');
    clock += 1;
    const n0 = a.t.sent.length;
    await a.gh.read(OWN);
    const after = a.t.sent.slice(n0);
    want(after.some((s) => worker(s) && s.body?.revoke === 'gho_F') && after.at(-1)?.auth === 'Bearer ghu_1' && !a.t.session.has('gho_F') && await a.gh.checkFull() === '',
      `at two hours the full-access token is not revoked before use: ${after.map((s) => `${s.url} ${s.auth ?? JSON.stringify(s.body)}`).join(', ')}`);
    // the timer firing at two hours, GitHub not confirming the revoke: forgotten anyway, and said once
    const b = await appSignIn(route);
    await full(b.gh, b.t);
    const told: string[] = [];
    b.gh.armFull((n: string) => told.push(n));
    clock += H2; revokes = false;
    await fire();
    want(told.join('|') === 'The full-access token expired but GitHub did not confirm it revoked; revoke it at github.com/settings/applications.' && !b.t.session.has('gho_F') && await b.gh.checkFull() === '',
      `the timer at two hours, the revoke refused: said ${JSON.stringify(told)}, token kept ${b.t.session.has('gho_F')}`);
  } finally { globalThis.setTimeout = realTimeout; revokes = true; }
});

// a code that came back to a sign-in this tab did not start, or with no state, is refused before anything is traded
await said('foreign state', async () => {
  const t = tab(github({}, appTokens)), gh = await fresh(configured);
  await gh.signIn();
  for (const q of [new URLSearchParams({ code: 'app-code', state: 'forged' }), new URLSearchParams({ code: 'app-code' })]) {
    const got = await gh.finish(q).then((w: unknown) => `signed in as ${JSON.stringify(w)}`, (e: Error) => e.message);
    want(got === 'The sign-in came back to a page that did not start it. Sign in again.', `a foreign state ${q}: ${got}`);
  }
  want(!t.sent.some(worker), `a foreign state: ${t.sent.filter(worker).length} codes traded`);
});

// an expired token: one request, then signed out with a sentence; no refresh, no retry
await said('expired', async () => {
  const { t, gh } = await appSignIn((s) => s.url.startsWith('https://api.github.com/repos/') ? { status: 401 } : github({ ghu_1: 'me' }, appTokens)(s));
  const before = t.sent.length;
  const c = await gh.read(OWN);
  want(c === undefined && t.sent.length - before === 1, `expired: ${t.sent.length - before} requests, not 1: ${t.sent.slice(before, before + 4).map((s) => s.url).join(', ')}`);
  want(!gh.signedIn() && !t.local.has('ghu_1'), 'expired: still signed in');
  const why = await gh.whyNot('me/priv', 'main', 'a.rofl.md');
  want(why.say === 'Your GitHub sign-in has expired. Sign in again.', `expired: said ${JSON.stringify(why)}`);
});

// the worker: only 'app' or 'oauth', a code with its verifier or a revoke, reach GitHub, each with its own app's secret; no refresh token passes
await said('worker', async () => {
  const w = path.join(path.dirname(lib), 'oauth-worker.mjs');
  copyFileSync(workerSrc, w);
  const { default: wk } = await fresh(w);
  const env = { APP_CLIENT_ID: 'app-id', APP_CLIENT_SECRET: 'app-secret', OAUTH_CLIENT_ID: 'oauth-id', OAUTH_CLIENT_SECRET: 'oauth-secret' };
  let gone = 204;
  const t = tab((s) => s.url === 'https://github.com/login/oauth/access_token' ? { status: 200, body: { access_token: 'tok', refresh_token: 'ref', expires_in: 1 } } : { status: gone });
  const ask = (body: unknown, e: object = env, method = 'POST', type = 'application/json') => wk.fetch(new Request('https://w/', { method, headers: { 'content-type': type }, ...method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {} }), e)
    .catch((x: Error) => Response.json({ threw: x.message }, { status: 599 })) as Promise<Response>;
  for (const [body, why] of [[{ kind: 'evil', code: 'c', code_verifier: 'v' }, 'kind evil'], [{ code: 'c', code_verifier: 'v' }, 'no kind'], [{ kind: 'app' }, 'no code'],
    [{ kind: '__proto__', code: 'c', code_verifier: 'v' }, 'kind __proto__'], [{ kind: 'constructor', code: 'c', code_verifier: 'v' }, 'kind constructor'], [{ kind: 'toString', code: 'c', code_verifier: 'v' }, 'kind toString'],
    [{ kind: ['app'], code: 'c', code_verifier: 'v' }, 'kind [app]'], [{ kind: ['oauth'], revoke: 't' }, 'kind [oauth]'], [{ kind: 1, code: 'c', code_verifier: 'v' }, 'kind 1'],
    [{ kind: 'app', code: 'c' }, 'a code with no code_verifier'], [{ kind: 'app', refresh_token: 'r' }, 'a refresh'],
    [{ kind: 'app', code: 'c', code_verifier: 'v', revoke: 't' }, 'a code and a revoke at once'], ['not json', 'not JSON'], [null, 'null']] as const) {
    const r = await ask(body);
    want(r.status === 400, `worker, ${why}: answered ${r.status}, not 400`);
  }
  want((await ask(null, env, 'GET')).status === 405, 'worker: a GET was not refused');
  want((await ask({ kind: 'oauth', code: 'c', code_verifier: 'v' }, { APP_CLIENT_ID: 'app-id', APP_CLIENT_SECRET: 'app-secret' })).status === 500, 'worker: an app with no secrets set was not refused');
  want(!t.sent.length, `worker: a refused request reached GitHub: ${t.sent.map((s) => `${s.url} ${JSON.stringify(s.body)}`).join(', ')}`);
  const code = await (await ask({ kind: 'app', code: 'c', code_verifier: 'v' })).json();
  want(code.access_token === 'tok' && !('refresh_token' in code) && JSON.stringify(t.sent[0]?.body) === '{"client_id":"app-id","client_secret":"app-secret","code":"c","code_verifier":"v"}',
    `worker: a code for the app traded as ${JSON.stringify(t.sent[0]?.body)}, answered ${JSON.stringify(code)}`);
  const rv = await (await ask({ kind: 'oauth', revoke: 'gho' })).json();
  want(rv.revoked && t.sent[1]?.method === 'DELETE' && t.sent[1]?.url === 'https://api.github.com/applications/oauth-id/token' && t.sent[1]?.auth === `Basic ${btoa('oauth-id:oauth-secret')}` && t.sent[1]?.body?.access_token === 'gho',
    `worker: a revoke went as ${JSON.stringify(t.sent[1])}`);
  gone = 404;
  want((await (await ask({ kind: 'oauth', revoke: 'gho' })).json()).revoked === false, 'worker: a revoke GitHub answered 404 was said to be revoked');
});

// the page runs no script but its own and ELK pinned by its hash, and fetches only from its own files, GitHub and the worker
await said('policy', async () => {
  const root = path.dirname(path.dirname(lib));
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(readFileSync(path.join(root, 'index.html'), 'utf8'))?.[1] ?? '';
  const d: Record<string, string> = Object.fromEntries(csp.split(';').map((x) => x.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ')]));
  const pic = readFileSync(path.join(root, 'lib/pictures.js'), 'utf8'), elk = /export const ELK = '([^']+)'/.exec(pic)?.[1];
  want(elk && d['script-src'] === `'self' ${elk}` && d['object-src'] === "'none'" && d['base-uri'] === "'none'" && d['img-src'] === "'self' data:"
    && /^'self' https:\/\/api\.github\.com https:\/\/raw\.githubusercontent\.com https:\/\/[^\s/]+$/.test(d['connect-src'] ?? ''), `policy: the page's Content-Security-Policy is "${csp}"`);
  want(pic.includes('s.integrity = CDN[src];') && /sha384-[A-Za-z0-9+/]{64}/.test(pic) && pic.includes("s.crossOrigin = 'anonymous';"), 'policy: ELK is loaded without its hash');
});

console.log(JSON.stringify(bad));

// The workbench's two GitHub sign-ins (workbench/github.ts, as built) and their worker (workbench/oauth-worker.js), against a GitHub played here:
// storages, location and fetch are fakes, nothing reaches the network. `node --experimental-strip-types scripts/workbench_auth.ts GITHUB_JS WORKER_JS`
// prints, as JSON, every wrong thing it saw; test:workbench runs it on the build and on copies with a planted defect.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

const [lib, workerSrc] = process.argv.slice(2);
const EXCHANGE = 'https://rofl-oauth.example.workers.dev/', OAUTH = 'Ov23-full-access';
const bad: string[] = [];
const want = (ok: unknown, what: string) => { if (!ok) bad.push(what); };

// a copy of the module with the worker and the full-access app set up, as they will be once deployed
const text = readFileSync(lib, 'utf8');
for (const k of ['EXCHANGE', 'OAUTH_CLIENT_ID']) if (!text.includes(`export const ${k} = '';`)) bad.push(`${k} is not empty in the build, so the pasted-token sign-in is not what ships`);
const configured = path.join(path.dirname(lib), 'github-configured.js');
writeFileSync(configured, text.replace("export const EXCHANGE = '';", `export const EXCHANGE = '${EXCHANGE}';`).replace("export const OAUTH_CLIENT_ID = '';", `export const OAUTH_CLIENT_ID = '${OAUTH}';`));

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
/** A played GitHub where `me` owns `me/priv`, `other/priv` is someone else's, and tokens are known by `logins`. */
const github = (logins: Record<string, string>, more: (s: Sent) => Answer | undefined = () => undefined) => (s: Sent): Answer | undefined => {
  const tok = s.auth?.replace('Bearer ', '') ?? '';
  return more(s) ?? (s.url === 'https://api.github.com/user' ? (logins[tok] ? { status: 200, body: { login: logins[tok] } } : { status: 401 })
    : s.url.startsWith('https://api.github.com/repos/me/priv/contents/') && logins[tok] === 'me' ? { status: 200, body: 'Declared as facts:' }
    : s.url === 'https://api.github.com/repos/me/priv' && logins[tok] === 'me' ? { status: 200, body: {} } : undefined);
};
const said = async (what: string, f: () => Promise<void>) => { try { await f(); } catch (e) { bad.push(`${what}: threw ${(e as Error).message}`); } };

/** Signed in with the app through the played sign-in: the module and the tab. */
async function appSignIn(route: (s: Sent) => Answer | undefined, local?: Store) {
  const t = tab(route, local), gh = await fresh(configured);
  await gh.signIn();
  const u = new URL(t.went.at(-1) ?? 'https://x/');
  const q = new URLSearchParams({ code: 'app-code', state: u.searchParams.get('state') ?? '' });
  return { t, gh, u, q, back: gh.back(q), who: await gh.finish(q) };
}
const appTokens = (s: Sent): Answer | undefined => worker(s) && s.body?.kind === 'app' && s.body.code === 'app-code' ? { status: 200, body: { access_token: 'ghu_1', refresh_token: 'ghr_1', expires_in: 28800 } } : undefined;

// the way it ships: no worker yet, so Sign in takes a pasted token, keeps it in this browser, reads with it and says the old sentences
await said('pasted token', async () => {
  const t = tab(github({ ghp_pasted: 'me' })), gh = await fresh(lib);
  t.pasted = 'ghp_pasted';
  const who = await gh.signIn();
  want(t.prompted === 1 && who?.token === 'ghp_pasted' && !t.went.length, `pasted token: Sign in did not ask for a token and keep it (prompted ${t.prompted}, went to ${t.went.join(' ')})`);
  want(t.local.has('ghp_pasted'), 'pasted token: not kept in this browser');
  want(await gh.read('https://api.github.com/repos/me/priv/contents/a.rofl.md?ref=main') === 'Declared as facts:', 'pasted token: the own private repository was not read with it');
  const why = await gh.whyNot('other/priv', 'main', 'a.rofl.md');
  want(why.say === '@me cannot read other/priv: it does not exist, or this account has no access to it. Ask its owner for access, or sign in with another account.' && !why.full, `pasted token: a repository it cannot read said ${JSON.stringify(why)}`);
  await gh.signOut();
  want(!t.local.has('ghp_pasted') && !t.sent.some(worker), 'pasted token: sign out did not just forget it');
});

// happy path: the app's sign-in, the own private repository read with the app's token, nothing offering more
await said('app sign-in', async () => {
  const { t, gh, u, back, who } = await appSignIn(github({ ghu_1: 'me' }, appTokens));
  want(u.origin + u.pathname === 'https://github.com/login/oauth/authorize' && u.searchParams.get('client_id') === 'Iv23lihoSE5hsdbSbtXb' && !u.searchParams.get('scope'), `app sign-in: went to ${u}`);
  want(back === '?gh=me/priv/a.rofl.md', `app sign-in: came back to ${back}`);
  want(who?.login === 'me' && who.kind === 'app' && !who.full, `app sign-in: signed in as ${JSON.stringify(who)}`);
  const text = await gh.read('https://api.github.com/repos/me/priv/contents/a.rofl.md?ref=main');
  want(text === 'Declared as facts:' && t.sent.at(-1)?.auth === 'Bearer ghu_1', `app sign-in: the own private repository read ${text} with ${t.sent.at(-1)?.auth}`);
  want(t.local.has('ghr_1') && !t.session.has('ghu_1'), 'app sign-in: the token and its refresh are not kept in this browser');
  const why = await gh.whyNot('me/priv', 'main', 'gone.rofl.md');
  want(!why.full && !authorize(t).slice(1).length, `app sign-in: a missing file offered full access: ${JSON.stringify(why)}`);
});

// 1. someone else's repository the app is not installed on: why, the install link and a button; nothing elevated without the click
await said('not installed', async () => {
  const installed: string[] = ['me'];
  const { t, gh } = await appSignIn(github({ ghu_1: 'me' }, (s) => appTokens(s)
    ?? (s.url.startsWith('https://api.github.com/user/installations') ? { status: 200, body: { installations: installed.map((login) => ({ account: { login } })) } } : undefined)));
  const before = authorize(t).length;
  want(await gh.read('https://api.github.com/repos/other/priv/contents/a.rofl.md?ref=main') === undefined, 'not installed: someone else\'s repository was read');
  const why = await gh.whyNot('other/priv', 'main', 'a.rofl.md');
  want(why.say === 'other has not installed ROFL Workbench. Ask them to install it (https://github.com/apps/rofl-workbench/installations/new), or sign in with full access.' && why.full === true,
    `not installed, someone else's: said ${JSON.stringify(why)}`);
  want(authorize(t).length === before, `not installed, someone else's: elevated without a click, to ${authorize(t).slice(before).join(' ')}`);
  gh.elevate();
  const up = new URL(authorize(t).at(-1) ?? 'https://x/');
  want(authorize(t).length === before + 1 && up.searchParams.get('client_id') === OAUTH && up.searchParams.get('scope') === 'repo', `the click on full access went to ${up}`);
  const mine = await gh.whyNot('me/other', 'main', 'a.rofl.md');
  installed.length = 0;
  const own = await gh.whyNot('me/other', 'main', 'a.rofl.md');
  want(own.say === 'ROFL Workbench cannot read me/other until it is installed on your account. Install ROFL Workbench on your account: https://github.com/apps/rofl-workbench/installations/new' && !own.full, `not installed, the own account: said ${JSON.stringify(own)}`);
  want(mine.say.startsWith('@me cannot read me/other: it does not exist, or this account has no access to it. Ask its owner for access') && mine.full === true, `installed and still unreadable: said ${JSON.stringify(mine)}`);
});

// 2. full access: kept in this tab alone, gone with it, and both tokens revoked on sign out
await said('full access', async () => {
  const route = github({ ghu_1: 'me', gho_F: 'me' }, (s) => appTokens(s)
    ?? (worker(s) && s.body?.kind === 'oauth' && s.body.code === 'full-code' ? { status: 200, body: { access_token: 'gho_F' } } : undefined)
    ?? (worker(s) && s.body?.revoke ? { status: 200, body: { revoked: true } } : undefined));
  const { t, gh } = await appSignIn(route);
  gh.elevate();
  const state = new URL(t.went.at(-1)!).searchParams.get('state')!;
  const who = await gh.finish(new URLSearchParams({ code: 'full-code', state }));
  want(who?.full && gh.signedIn()?.token === 'gho_F', `full access: signed in as ${JSON.stringify(who)}`);
  await gh.read('https://api.github.com/repos/me/priv/contents/a.rofl.md?ref=main');
  want(t.sent.at(-1)?.auth === 'Bearer gho_F', 'full access: reads do not use the full-access token');
  want(!t.local.has('gho_F'), 'full access: the token reached localStorage');
  want(t.session.has('gho_F'), 'full access: the token is not kept in this tab');
  const reloaded = tab(route, t.local), gh2 = await fresh(configured);
  want(gh2.signedIn()?.token === 'ghu_1' && !reloaded.local.has('gho_F') && !reloaded.session.has('gho_F'), `full access: a new tab still holds the token: ${gh2.signedIn()?.token}`);
  const t2 = tab(route, t.local);   // back in the first tab
  (globalThis as any).sessionStorage = t.session;
  await gh.signOut();
  const revoked = t2.sent.filter((s) => worker(s) && s.body?.revoke).map((s) => `${s.body.kind}:${s.body.revoke}`).sort();
  want(revoked.join(' ') === 'app:ghu_1 oauth:gho_F', `sign out revoked ${revoked.join(' ') || 'nothing'}`);
  want(!t.local.has('ghu_1') && !t.session.has('gho_F') && !gh.signedIn(), 'sign out left a token in a storage');
});

// 3. a code that came back to a sign-in this tab did not start, or with no state, is refused before anything is traded
await said('foreign state', async () => {
  const t = tab(github({}, appTokens)), gh = await fresh(configured);
  await gh.signIn();
  for (const q of [new URLSearchParams({ code: 'app-code', state: 'forged' }), new URLSearchParams({ code: 'app-code' })]) {
    const got = await gh.finish(q).then((w: unknown) => `signed in as ${JSON.stringify(w)}`, (e: Error) => e.message);
    want(got === 'The sign-in came back to a page that did not start it. Sign in again.', `a foreign state ${q}: ${got}`);
  }
  want(!t.sent.some(worker), `a foreign state: ${t.sent.filter(worker).length} codes traded`);
});

// 4. an expired app token: refreshed once and tried again; when that fails too, signed out with a sentence, no loop
await said('expired', async () => {
  let refreshes = 0, renewed = true;
  const route = github({ ghu_1: 'me', ghu_r1: 'me', ghu_r2: 'me' }, (s) => appTokens(s) ?? (worker(s) && s.body?.refresh_token ? (refreshes++, renewed
    ? { status: 200, body: { access_token: `ghu_r${refreshes}`, refresh_token: `ghr_r${refreshes}` } } : { status: 401, body: { error: 'bad_refresh_token' } }) : undefined));
  const live = new Set(['ghu_1']);
  const { t, gh } = await appSignIn((s) => s.url.startsWith('https://api.github.com/repos/') && !live.has(s.auth?.replace('Bearer ', '') ?? '') ? { status: 401 } : route(s));
  live.clear(); live.add('ghu_r1');
  const [a, b] = await Promise.all([1, 2].map(() => gh.read('https://api.github.com/repos/me/priv/contents/a.rofl.md?ref=main')));
  want(a === 'Declared as facts:' && b === a && refreshes === 1, `expired: two reads gave ${a}, ${b} after ${refreshes} refreshes, not one`);
  want(gh.signedIn()?.token === 'ghu_r1' && t.local.has('ghr_r1'), 'expired: the refreshed token is not kept');
  live.clear();
  const before = t.sent.length;
  const c = await gh.read('https://api.github.com/repos/me/priv/contents/a.rofl.md?ref=main');
  want(c === undefined && refreshes === 2 && t.sent.length - before === 3, `refreshed and still refused: ${refreshes - 1} refreshes, ${t.sent.length - before} requests, not 1 and 3`);
  want(!gh.signedIn(), 'refreshed and still refused: still signed in');
  const why = await gh.whyNot('me/priv', 'main', 'a.rofl.md');
  want(why.say === 'Your GitHub sign-in has expired or was revoked. Sign in again.', `refreshed and still refused: said ${JSON.stringify(why)}`);
  // the refresh itself refused
  const second = await appSignIn((s) => s.url.startsWith('https://api.github.com/repos/') ? { status: 401 } : route(s));
  renewed = false; refreshes = 0;
  const d = await second.gh.read('https://api.github.com/repos/me/priv/contents/a.rofl.md?ref=main');
  want(d === undefined && refreshes === 1 && !second.gh.signedIn() && !second.t.local.has('ghu_1'), `the refresh refused: ${refreshes} refreshes, signed in ${JSON.stringify(second.gh.signedIn())}`);
  want((await second.gh.whyNot('me/priv', 'main', 'a.rofl.md')).say === 'Your GitHub sign-in has expired or was revoked. Sign in again.', 'the refresh refused: no sentence saying sign in again');
});

// the worker: only 'app' or 'oauth', and one whole request, reach GitHub, each with its own app's secret
await said('worker', async () => {
  const w = path.join(path.dirname(lib), 'oauth-worker.mjs');
  copyFileSync(workerSrc, w);
  const { default: wk } = await fresh(w);
  const env = { APP_CLIENT_ID: 'app-id', APP_CLIENT_SECRET: 'app-secret', OAUTH_CLIENT_ID: 'oauth-id', OAUTH_CLIENT_SECRET: 'oauth-secret' };
  const t = tab((s) => s.url === 'https://github.com/login/oauth/access_token' ? { status: 200, body: { access_token: 'tok', refresh_token: 'ref', expires_in: 1 } } : { status: 204 });
  const ask = (body: unknown, e: object = env, method = 'POST') => wk.fetch(new Request('https://w/', { method, ...method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {} }), e)
    .catch((x: Error) => Response.json({ threw: x.message }, { status: 599 })) as Promise<Response>;
  for (const [body, why] of [[{ kind: 'evil', code: 'c' }, 'kind evil'], [{ code: 'c' }, 'no kind'], [{ kind: 'app' }, 'no code'], [{ kind: '__proto__', code: 'c' }, 'kind __proto__'],
    [{ kind: 'oauth', refresh_token: 'r' }, 'a refresh for the full-access app'], [{ kind: 'app', code: 'c', revoke: 't' }, 'a code and a revoke at once'], ['not json', 'not JSON'], [null, 'null']] as const) {
    const r = await ask(body);
    want(r.status === 400, `worker, ${why}: answered ${r.status}, not 400`);
  }
  want((await ask(null, env, 'GET')).status === 405, 'worker: a GET was not refused');
  want((await ask({ kind: 'oauth', code: 'c' }, { APP_CLIENT_ID: 'app-id', APP_CLIENT_SECRET: 'app-secret' })).status === 500, 'worker: an app with no secrets set was not refused');
  want(!t.sent.length, `worker: a refused request reached GitHub: ${t.sent.map((s) => `${s.url} ${JSON.stringify(s.body)}`).join(', ')}`);
  const code = await (await ask({ kind: 'app', code: 'c' })).json();
  want(code.access_token === 'tok' && code.refresh_token === 'ref' && t.sent[0]?.body?.client_id === 'app-id' && t.sent[0]?.body?.client_secret === 'app-secret', `worker: a code for the app traded as ${JSON.stringify(t.sent[0]?.body)}`);
  await ask({ kind: 'app', refresh_token: 'r' });
  want(t.sent[1]?.body?.grant_type === 'refresh_token' && t.sent[1]?.body?.refresh_token === 'r' && t.sent[1]?.body?.client_id === 'app-id', `worker: a refresh went as ${JSON.stringify(t.sent[1]?.body)}`);
  const rv = await (await ask({ kind: 'oauth', revoke: 'gho' })).json();
  want(rv.revoked && t.sent[2]?.method === 'DELETE' && t.sent[2]?.url === 'https://api.github.com/applications/oauth-id/token' && t.sent[2]?.auth === `Basic ${btoa('oauth-id:oauth-secret')}` && t.sent[2]?.body?.access_token === 'gho',
    `worker: a revoke went as ${JSON.stringify(t.sent[2])}`);
});

console.log(JSON.stringify(bad));

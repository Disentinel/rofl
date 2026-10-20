// Signing in to GitHub, so that a link opens whatever the viewer's account can read, and a link it cannot read says why. Two sign-ins, the safer first:
// - APP_CLIENT_ID, APP_SLUG: the GitHub App "ROFL Workbench". Repository permissions Contents and Metadata read-only, nothing else; webhook off;
//   "Expire user authorization tokens" on (a token lasts 8 hours; its refresh token is never kept, and an expired sign-in is simply made again,
//   which GitHub grants without asking); "Request user authorization (OAuth) during installation" on; installable by any account;
//   callback https://disentinel.github.io/rofl/. It reads only where its owner installed it.
// - OAUTH_CLIENT_ID: the OAuth App "ROFL Workbench (full access)", scope `repo`, same callback. Asked for only by a click, when the app cannot read a
//   repository; its token can write to every private repository of the account, so this page keeps it in the tab alone and revokes it on sign out
//   or two hours after it was issued, whichever comes first.
// Both flows carry a state and PKCE. EXCHANGE is the address of workbench/oauth-worker.js, which holds both secrets: it trades codes for tokens and
// revokes them. Until EXCHANGE is set there is no sign-in to trade a code with, and Sign in takes a pasted token instead.
// A token goes only to the repository the page opened (and to /user, /user/installations, which this module asks itself).
export const APP_CLIENT_ID = 'Iv23lihoSE5hsdbSbtXb';
export const APP_SLUG = 'rofl-workbench';
export const OAUTH_CLIENT_ID = 'Ov23liOts5dq6uxKHKad';
export const EXCHANGE = '';
const KEY = 'rofl-workbench:github', FULL = `${KEY}:full`, STATE = `${KEY}:state`;

type Kind = 'app' | 'oauth';
/** `kind` names the app a token came from, for revoking it; a pasted token has none. `full`: the full-access one. */
export type Who = { token: string; login: string; kind?: Kind; full?: boolean; at?: number };
const load = (s: Storage, k: string): Who | null => { try { return JSON.parse(s.getItem(k) ?? 'null'); } catch { return null; } };
const app = () => load(localStorage, KEY);
export const signedIn = (): Who | null => load(sessionStorage, FULL) ?? app();
const drop = (w: Who) => { try { (w.full ? sessionStorage : localStorage).removeItem(w.full ? FULL : KEY); } catch {} };

const trade = async (body: object) => {
  const r = await fetch(EXCHANGE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  return { r, j: await r?.json().catch(() => ({})) ?? {} };
};

/** Both sign-ins ended at GitHub, then here. A token GitHub did not confirm revoked is kept, and the sign out fails saying so. */
export async function signOut() {
  let kept = false;
  for (const w of [load(sessionStorage, FULL), app()]) {
    if (!w) continue;
    if (w.kind && EXCHANGE && (await trade({ kind: w.kind, revoke: w.token })).j.revoked !== true) { kept = true; continue; }
    drop(w);
  }
  if (kept) throw new Error('Could not revoke the token at GitHub; it is still valid. Try Sign out again, or revoke it at github.com/settings/applications.');
}

// the full-access token, two hours after it was issued: revoked and forgotten, on its timer while the tab is awake and before any use, as a timer
// sleeps in a background tab
const FULL_FOR = 2 * 60 * 60 * 1000;
let notice = '';
async function expire() {
  const w = load(sessionStorage, FULL);
  if (!w || Date.now() - (w.at ?? 0) < FULL_FOR) return;
  drop(w);
  if (w.kind && EXCHANGE && (await trade({ kind: w.kind, revoke: w.token })).j.revoked !== true)
    notice = 'The full-access token expired but GitHub did not confirm it revoked; revoke it at github.com/settings/applications.';
}
/** The full-access token's lifetime checked: what to tell the viewer about it, once, or ''. */
export async function checkFull() { await expire(); const n = notice; notice = ''; return n; }
let timer: ReturnType<typeof setTimeout> | undefined;
/** `then` called when the full-access token held now runs out, with what checkFull says. */
export function armFull(then: (notice: string) => void) {
  clearTimeout(timer);
  const w = load(sessionStorage, FULL);
  if (w) timer = setTimeout(async () => then(await checkFull()), Math.max(0, (w.at ?? 0) + FULL_FOR - Date.now()));
}

async function keep(token: string, more: Partial<Who> = {}): Promise<Who> {
  const r = await fetch('https://api.github.com/user', { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(r.status === 401 ? 'GitHub did not accept that token' : `GitHub answered ${r.status}`);
  const who: Who = { token, login: (await r.json()).login as string, ...more };
  try { if (who.full) sessionStorage.setItem(FULL, JSON.stringify(who)); else localStorage.setItem(KEY, JSON.stringify(who)); } catch {}
  return who;
}

const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function go(kind: Kind, params: Record<string, string>) {
  const state = crypto.randomUUID(), verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem(STATE, JSON.stringify({ state, kind, verifier, back: location.search }));
  location.href = `https://github.com/login/oauth/authorize?${new URLSearchParams({ ...params, state, code_challenge: challenge, code_challenge_method: 'S256', redirect_uri: location.origin + location.pathname })}`;
}

/** Off to GitHub to sign in with the app, the page's query kept to come back to; with no app set up, a pasted token. */
export async function signIn(): Promise<Who | null> {
  if (!APP_CLIENT_ID || !EXCHANGE) {
    const t = prompt('A GitHub token that can read the repository (GitHub → Settings → Developer settings → Personal access tokens). It stays in this browser.');
    return t?.trim() ? keep(t.trim()) : null;
  }
  await go('app', { client_id: APP_CLIENT_ID });
  return null;
}

/** Off to GitHub for the full-access token. Only ever called from the click on its button. */
export const elevate = async () => { if (OAUTH_CLIENT_ID && EXCHANGE) await go('oauth', { client_id: OAUTH_CLIENT_ID, scope: 'repo' }); };

/** Back from GitHub with `?code`: the query the page had before it left, or null when this is not a return. */
export function back(q: URLSearchParams): string | null {
  if (!q.has('code')) return null;
  try { return JSON.parse(sessionStorage.getItem(STATE) ?? 'null')?.back ?? ''; } catch { return ''; }
}

/** The token GitHub's code trades for: the app's kept in this browser, the full-access one in this tab. */
export async function finish(q: URLSearchParams): Promise<Who | null> {
  let saved: { state?: string; kind?: Kind; verifier?: string } | null = null;
  try { saved = JSON.parse(sessionStorage.getItem(STATE) ?? 'null'); sessionStorage.removeItem(STATE); } catch {}
  if (q.get('error')) throw new Error(`GitHub did not sign you in: ${q.get('error_description') ?? q.get('error')}`);
  // back from installing the app, which no state of this page started: a token already held reads what was just installed, and with none, one sign-in
  if (q.has('installation_id') && saved?.state !== q.get('state')) {
    if (app()?.kind === 'app') return signedIn();
    throw new Error('ROFL Workbench is installed. Sign in with GitHub to open what it can read.');
  }
  if (!saved || !saved.kind || saved.state !== q.get('state')) throw new Error('The sign-in came back to a page that did not start it. Sign in again.');
  const { r, j } = await trade({ kind: saved.kind, code: q.get('code'), code_verifier: saved.verifier });
  if (!j.access_token) throw new Error(`GitHub gave no token: ${j.error_description ?? j.error ?? (r ? r.status : 'the sign-in service could not be reached')}`);
  return keep(j.access_token, saved.kind === 'app' ? { kind: 'app' } : { kind: 'oauth', full: true, at: Date.now() });
}

let opened = '';
/** The repository a link opened, `owner/repo`; the token goes to it alone. None for any other link. */
export const scope = (repo?: string) => { opened = repo?.toLowerCase() ?? ''; };
const ours = (url: string) => {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  return u.origin === 'https://api.github.com' && !!opened && !/%2e|%2f|%5c/i.test(u.pathname) && u.pathname.toLowerCase().startsWith(`/repos/${opened}/`);
};

let lapsed = false;
/** `url` fetched as the viewer when `auth`. A token GitHub no longer accepts ends that sign-in: no retry. */
async function call(url: string, init: RequestInit = {}, auth = false): Promise<Response | null> {
  if (auth) await expire();
  const who = auth ? signedIn() : null;
  const r = await fetch(url, who ? { ...init, headers: { ...init.headers as object, authorization: `Bearer ${who.token}` } } : init).catch(() => null);
  if (r?.status === 401 && who) { drop(who); lapsed = true; }
  return r;
}

/** A file read as the viewer: through GitHub's API with their token when it is of the repository opened, anything else as it is. */
export const read = (url: string) => call(url, url.includes('/contents/') ? { headers: { accept: 'application/vnd.github.raw' } } : {}, ours(url))
  .then((r) => r?.ok ? r.text() : undefined, () => undefined);

const INSTALL = `https://github.com/apps/${APP_SLUG}/installations/new`;
/** A sentence of whyNot, already escaped, with the app's install page as a link, and no other. */
export const linked = (html: string) => html.split(INSTALL).join(`<a href="${INSTALL}">${INSTALL}</a>`);

/** Why `path` of `repo` at `ref` could not be read, in a sentence that says what to do; `full`: offer the full-access sign-in, on a click. */
export async function whyNot(repo: string, ref: string, path: string): Promise<{ say: string; full?: boolean }> {
  const said = (say: string, full = false) => ({ say, ...full ? { full } : {} });
  const r = lapsed ? null : await call(`https://api.github.com/repos/${repo}`, {}, true);
  if (lapsed) { lapsed = false; return said('Your GitHub sign-in has expired. Sign in again.'); }
  const who = signedIn();
  if (!r) return said('GitHub could not be reached.');
  if (r.status === 403 || r.status === 429) {
    const m: string = (await r.json().catch(() => ({}))).message ?? '';
    if (/OAuth App access restrictions/i.test(m)) return said(`The ${repo.split('/')[0]} organization does not let this page read its repositories. An owner approves it in the organization's settings, Third-party access, or you sign in with a token.`);
    if (r.headers.get('x-ratelimit-remaining') === '0') return said(who ? 'Your account has used up its GitHub requests for the hour. Try again later.' : 'GitHub\'s limit for reading without an account is used up. Sign in with GitHub to go on.');
    return said(`GitHub refused to show ${repo}: ${m}`);
  }
  if (r.status === 404) {
    if (!who) return said(`${repo} is private or does not exist. Sign in with GitHub to open what your account can read.`);
    const owner = repo.split('/')[0], full = !!OAUTH_CLIENT_ID && !!EXCHANGE;
    const noAccess = `@${who.login} cannot read ${repo}: it does not exist, or this account has no access to it. Ask its owner for access, or sign in with another account.`;
    if (who.kind !== 'app' || !APP_SLUG) return said(noAccess);
    const i = await call('https://api.github.com/user/installations?per_page=100', {}, true);
    const on: { account?: { login?: string } }[] = i?.ok ? (await i.json().catch(() => ({}))).installations ?? [] : [];
    if (on.some((x) => x.account?.login?.toLowerCase() === owner.toLowerCase()))
      return said(`${noAccess}${full ? ` If you can read it on GitHub, ROFL Workbench may not be given this repository: ask its owner to add it, or sign in with full access.` : ''}`, full);
    if (who.login.toLowerCase() === owner.toLowerCase()) {
      try { sessionStorage.setItem(STATE, JSON.stringify({ back: location.search })); } catch {}   // back from installing, this link opens again
      return said(`ROFL Workbench cannot read ${repo} until it is installed on your account. Install ROFL Workbench on your account: ${INSTALL}`);
    }
    return said(`${owner} has not installed ROFL Workbench. Ask them to install it (${INSTALL})${full ? ', or sign in with full access' : ''}.`, full);
  }
  if (!r.ok) return said(`GitHub answered ${r.status} for ${repo}.`);
  const b = await call(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`, { method: 'HEAD' }, true);
  if (b?.status === 404 || b?.status === 422) return said(`${repo} has no branch, tag or commit ${ref}.`);
  return said(`${repo} has no file ${path} at ${ref}.`);
}

// Signing in to GitHub, so that a link opens whatever the viewer's account can read, and a link it cannot read says why.
// CLIENT_ID is the OAuth App's and EXCHANGE the address of workbench/oauth-worker.js, which trades the code GitHub sends back for a token
// (the trade needs the app's secret, so it cannot happen in the page). Until both are set, Sign in takes a pasted token instead.
export const CLIENT_ID = '';
export const EXCHANGE = '';
const KEY = 'rofl-workbench:github';

export type Who = { token: string; login: string };
export const signedIn = (): Who | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } };
export const signOut = () => { try { localStorage.removeItem(KEY); } catch {} };

async function keep(token: string): Promise<Who> {
  const r = await fetch('https://api.github.com/user', { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(r.status === 401 ? 'GitHub did not accept that token' : `GitHub answered ${r.status}`);
  const who = { token, login: (await r.json()).login as string };
  try { localStorage.setItem(KEY, JSON.stringify(who)); } catch {}
  return who;
}

/** Off to GitHub to sign in, the page's query kept to come back to; with no app set up, a pasted token. */
export async function signIn(): Promise<Who | null> {
  if (!CLIENT_ID || !EXCHANGE) {
    const t = prompt('A GitHub token that can read the repository (GitHub → Settings → Developer settings → Personal access tokens). It stays in this browser.');
    return t?.trim() ? keep(t.trim()) : null;
  }
  const state = crypto.randomUUID();
  sessionStorage.setItem(`${KEY}:state`, JSON.stringify({ state, back: location.search }));
  location.href = `https://github.com/login/oauth/authorize?${new URLSearchParams({ client_id: CLIENT_ID, scope: 'repo', state, redirect_uri: location.origin + location.pathname })}`;
  return null;
}

/** Back from GitHub with `?code`: the query the page had before it left, or null when this is not a return. */
export function back(q: URLSearchParams): string | null {
  if (!q.has('code')) return null;
  try { return JSON.parse(sessionStorage.getItem(`${KEY}:state`) ?? 'null')?.back ?? ''; } catch { return ''; }
}

/** The token GitHub's code trades for, kept in this browser. */
export async function finish(q: URLSearchParams): Promise<Who> {
  let saved: { state?: string } | null = null;
  try { saved = JSON.parse(sessionStorage.getItem(`${KEY}:state`) ?? 'null'); sessionStorage.removeItem(`${KEY}:state`); } catch {}
  if (q.get('error')) throw new Error(`GitHub did not sign you in: ${q.get('error_description') ?? q.get('error')}`);
  if (!saved || saved.state !== q.get('state')) throw new Error('The sign-in came back to a page that did not start it. Sign in again.');
  const r = await fetch(EXCHANGE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: q.get('code') }) }).catch(() => null);
  const j = await r?.json().catch(() => ({})) ?? {};
  if (!j.access_token) throw new Error(`GitHub gave no token: ${j.error_description ?? j.error ?? (r ? r.status : 'the sign-in service could not be reached')}`);
  return keep(j.access_token);
}

/** A file read as the viewer: its contents through GitHub's API with their token, anything else as it is. */
export const read = (url: string, who: Who | null) => fetch(url, who && url.startsWith('https://api.github.com/')
  ? { headers: { authorization: `Bearer ${who.token}`, ...url.includes('/contents/') ? { accept: 'application/vnd.github.raw' } : {} } } : undefined)
  .then((r) => r.ok ? r.text() : undefined, () => undefined);

/** Why `path` of `repo` at `ref` could not be read, in a sentence that says what to do. */
export async function whyNot(repo: string, ref: string, path: string, who: Who | null): Promise<string> {
  const headers = who ? { authorization: `Bearer ${who.token}` } : undefined;
  const r = await fetch(`https://api.github.com/repos/${repo}`, { headers }).catch(() => null);
  if (!r) return 'GitHub could not be reached.';
  if (r.status === 401) { signOut(); return 'Your GitHub sign-in has expired or was revoked. Sign in again.'; }
  if (r.status === 403 || r.status === 429) {
    const m: string = (await r.json().catch(() => ({}))).message ?? '';
    if (/OAuth App access restrictions/i.test(m)) return `The ${repo.split('/')[0]} organization does not let this page read its repositories. An owner approves it in the organization's settings, Third-party access, or you sign in with a token.`;
    if (r.headers.get('x-ratelimit-remaining') === '0') return who ? 'Your account has used up its GitHub requests for the hour. Try again later.' : 'GitHub\'s limit for reading without an account is used up. Sign in with GitHub to go on.';
    return `GitHub refused to show ${repo}: ${m}`;
  }
  if (r.status === 404) return who ? `@${who.login} cannot read ${repo}: it does not exist, or this account has no access to it. Ask its owner for access, or sign in with another account.`
    : `${repo} is private or does not exist. Sign in with GitHub to open what your account can read.`;
  if (!r.ok) return `GitHub answered ${r.status} for ${repo}.`;
  const b = await fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`, { headers, method: 'HEAD' }).catch(() => null);
  if (b?.status === 404 || b?.status === 422) return `${repo} has no branch, tag or commit ${ref}.`;
  return `${repo} has no file ${path} at ${ref}.`;
}

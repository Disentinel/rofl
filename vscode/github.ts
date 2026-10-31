// A notebook opened from GitHub: the editor's own GitHub sign-in reads it and every file it reads, each into a copy under the extension's storage,
// and the copy opens as any notebook on disk. A link the account cannot read says why.
import * as vscode from 'vscode';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { builtin, globRe, normal, parseFront } from '../notebook/front.ts';

/** `https://github.com/o/r/blob/ref/path`, its raw form, or `o/r/path@ref` (ref main). */
export function ghOf(link: string): { repo: string; ref: string; path: string } | undefined {
  const s = link.trim(), u = /^https?:\/\//.test(s) ? new URL(s) : null;
  const m = !u ? /^([^/\s]+)\/([^/\s]+)\/([^@\s]+)(?:@(\S+))?$/.exec(s)
    : u.hostname === 'github.com' ? /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)$/.exec(u.pathname)
    : u.hostname === 'raw.githubusercontent.com' ? /^\/([^/]+)\/([^/]+)\/(?:refs\/heads\/)?([^/]+)\/(.+)$/.exec(u.pathname) : null;
  if (!m) return undefined;
  return u ? { repo: `${m[1]}/${m[2]}`, ref: m[3], path: decodeURIComponent(m[4]) } : { repo: `${m[1]}/${m[2]}`, ref: m[4] ?? 'main', path: m[3] };
}

const api = (token: string) => (url: string, accept = 'application/vnd.github+json') =>
  fetch(`https://api.github.com/${url}`, { headers: { authorization: `Bearer ${token}`, accept, 'user-agent': 'rofl-vscode' } }).catch(() => null);

/** Why `path` of `repo` at `ref` could not be read, in a sentence that says what to do. */
async function whyNot(get: ReturnType<typeof api>, login: string, repo: string, ref: string, path: string): Promise<string> {
  const r = await get(`repos/${repo}`);
  if (!r) return 'GitHub could not be reached.';
  if (r.status === 401) return 'GitHub no longer accepts this sign-in. Sign out of GitHub in the Accounts menu and open the link again.';
  if (r.status === 403 || r.status === 429) {
    const m: string = (await r.json().catch(() => ({}))).message ?? '';
    if (/OAuth App access restrictions/i.test(m)) return `The ${repo.split('/')[0]} organization does not let Visual Studio Code read its repositories. An owner approves it in the organization's settings, Third-party access.`;
    if (r.headers.get('x-ratelimit-remaining') === '0') return 'This account has used up its GitHub requests for the hour. Try again later.';
    return `GitHub refused to show ${repo}: ${m}`;
  }
  if (r.status === 404) return `@${login} cannot read ${repo}: it does not exist, or this account has no access to it. Ask its owner for access, or sign in with another account in the Accounts menu.`;
  if (!r.ok) return `GitHub answered ${r.status} for ${repo}.`;
  const c = await get(`repos/${repo}/commits/${encodeURIComponent(ref)}`);
  if (c?.status === 404 || c?.status === 422) return `${repo} has no branch, tag or commit ${ref}.`;
  return `${repo} has no file ${path} at ${ref}.`;
}

/** The notebook, the files its `reads:` and `code:` name, and the data its code imports, copied under `store`; the copy of the notebook. */
export async function fetchNotebook(link: string, store: string): Promise<string> {
  const at = ghOf(link);
  if (!at) throw new Error(`Not a GitHub link to a notebook: ${link}. Give https://github.com/owner/repo/blob/ref/path.rofl.md or owner/repo/path.rofl.md@ref.`);
  const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
  const get = api(session.accessToken), root = join(store, 'github', ...at.repo.split('/'), at.ref);
  const text = async (p: string) => { const r = await get(`repos/${at.repo}/contents/${p.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(at.ref)}`, 'application/vnd.github.raw'); return r?.ok ? r.text() : undefined; };
  let tree: Promise<string[]> | undefined;
  const files = () => tree ??= get(`repos/${at.repo}/git/trees/${encodeURIComponent(at.ref)}?recursive=1`)
    .then(async (r) => r?.ok ? ((await r.json()).tree as { path: string; type: string }[]).filter((e) => e.type === 'blob').map((e) => e.path) : []);
  const want = [at.path], seen = new Set<string>();
  for (let p; (p = want.shift()) !== undefined;) {
    if (seen.has(p)) continue;
    seen.add(p);
    const t = await text(p);
    if (t === undefined) { if (p === at.path) throw new Error(await whyNot(get, session.account.label, at.repo, at.ref, at.path)); continue; }
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), t);
    const dir = p.replace(/[^/]*$/, '');
    if (p.endsWith('.rofl.md')) {
      const front = parseFront(t);
      for (const r of front.reads) if (builtin(r) === undefined) want.push(normal(dir + r));
      for (const g of front.code) { const re = globRe(normal(dir + g)); want.push(...(await files()).filter((f) => re.test(f))); }
    } else if (/\.[cm]?[jt]sx?$/.test(p)) {
      for (const m of t.matchAll(/(?:\brequire\s*\(\s*|\bimport\s*\(\s*|\bfrom\s+|\bimport\s+)(['"])(\.\.?(?:\/[^'"]*)?)\1/g)) {
        const f = normal(dir + m[2]);
        if (!/\.[cm]?[jt]sx?$/.test(f)) want.push(f, `${f}.json`);
      }
    }
  }
  return join(root, at.path);
}

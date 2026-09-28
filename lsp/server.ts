// rofl-lsp --stdio — a language server for `.rofl` and `.rofl.md`: diagnostics, hover, definition, references, the outline, completion. What it knows is lsp/know.ts.
// It reads the open texts, the model's files beside it, and the `.rofl` and `.rofl.md` files a front matter's `reads:` names and a `.rofl` file's `.rofl` neighbours
// are, once every link is followed, inside a workspace folder (with none, in the file's own directory). Nothing else: it runs no code, asks no model, opens no port,
// never reads `code:`.
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { know, type Known, type Site } from './know.ts';
import { libFiles, MODEL_FILES, PHRASE_FILES } from '../notebook/front.ts';
import { Vocabulary } from '../src/say.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LIB = new Set([...MODEL_FILES, ...PHRASE_FILES, 'facts/kernel-phrases.rofl', 'facts/ring1-phrases.rofl']);
const WAIT = Number(process.env.ROFL_LSP_DEBOUNCE ?? 250), LARGEST = 16 << 20;

const open = new Map<string, string>(), known = new Map<string, Known>(), due = new Map<string, NodeJS.Timeout>();
const kept = new Map<string, { stamp: string; k: Known }>();
let roots: string[] = [];

const fileOf = (uri: string) => uri.startsWith('file:') ? fileURLToPath(uri) : uri;
const uriOf = (file: string) => pathToFileURL(file).href;
const ours = (f: string) => f.endsWith('.rofl') || f.endsWith('.rofl.md');
const real = (f: string) => { try { return realpathSync(f); } catch { return undefined; } };
const under = (f: string, dir: string) => f === dir || f.startsWith(dir + path.sep);
/** A file a text names may be read: what it is after every link is a `.rofl` or `.rofl.md` inside a workspace folder, or with no folder beside the text. */
const allowed = (p: string, by: string) => { const r = real(p); return !!r && ours(r) && (roots.length ? roots.some((x) => under(r, real(x) ?? x)) : path.dirname(r) === path.dirname(real(by) ?? by)); };

/** An open text, else a regular file of at most 16 MB on disk; null for something there that is not one. */
function text(file: string): string | undefined | null {
  const t = open.get(file); if (t !== undefined) return t;
  try { const s = statSync(file); return s.isFile() && s.size <= LARGEST ? readFileSync(file, 'utf8') : null; } catch { return undefined; }
}
const lib = (f: string) => LIB.has(f) ? text(path.join(ROOT, f)) : undefined;
/** What a front matter's `reads:` names, from the file's directory as the kernel resolves it; only a `.rofl` or `.rofl.md`. */
const readsOf = (file: string) => (name: string) => { const p = named(file, name); return allowed(p, file) ? text(p) : exists(p) ? null : undefined; };
const exists = (p: string) => { try { statSync(p); return true; } catch { return false; } };
const named = (file: string, name: string) => path.resolve(path.dirname(file), name.replace(/^~(?=\/|$)/, os.homedir()));

function analyse(uri: string): Known | undefined {
  clearTimeout(due.get(uri)); due.delete(uri);
  const file = fileOf(uri), t = open.get(file); if (t === undefined) return known.get(uri);
  let k: Known;
  try { k = know(file, t, lib, readsOf(file)); }
  catch (e) { k = { diags: [{ line: 0, col: 0, end: 1, severity: 1, message: `the language server failed on this text: ${(e as Error).message}` }], sites: [], vocab: new Vocabulary(), sentences: [] }; }
  known.set(uri, k);
  notify('textDocument/publishDiagnostics', { uri, diagnostics: k.diags.map((d) => ({ range: range(d), severity: d.severity, source: 'rofl', message: d.message })) });
  return k;
}
const current = (uri: string) => due.has(uri) || !known.has(uri) ? analyse(uri) : known.get(uri);

/** The files a text stands on, each as the language server knows it: the model and what it reads for a `.rofl.md`, the kernel and the neighbours for a `.rofl`. */
function around(uri: string, k: Known): [string, Known][] {
  const file = fileOf(uri), out: string[] = [];
  if (k.front) out.push(...libFiles(file, k.front).model.map((f) => path.join(ROOT, f)), ...k.front.reads.map((r) => named(file, r)).filter((f) => allowed(f, file)));
  else {
    out.push(path.join(ROOT, 'boot.rofl'));
    const dir = path.dirname(file);
    if (roots.length) try { out.push(...readdirSync(dir).map((f) => path.join(dir, f)).filter((f) => f.endsWith('.rofl') && allowed(f, file))); } catch {}
  }
  return [[file, k] as [string, Known], ...[...new Set(out)].filter((f) => f !== file).flatMap((f): [string, Known][] => {
    const t = text(f); if (typeof t !== 'string') return [];
    const stamp = `${t.length}:${open.has(f) ? t : statSync(f).mtimeMs}`;
    let c = kept.get(f);
    if (c?.stamp !== stamp) kept.set(f, c = { stamp, k: know(f, t, lib, readsOf(f), false) });
    return [[f, c.k]];
  })];
}

/** The words of the model's phrase files, which a `.rofl` file is read in too. */
let phrases: Vocabulary | undefined;
const words = () => { if (!phrases) { phrases = new Vocabulary(); for (const f of LIB) if (f.includes('phrases')) phrases.addText(lib(f) ?? ''); } return phrases; };

const range = (s: { line: number; col: number; end: number }) => ({ start: { line: s.line, character: s.col }, end: { line: s.line, character: s.end } });
const loc = (file: string, s: Site) => ({ uri: uriOf(file), range: range(s) });

/** The relation under the cursor: a site's span, or else a word some site names. */
function relAt(uri: string, k: Known, line: number, ch: number): string | undefined {
  const s = k.sites.find((x) => x.line === line && x.col <= ch && ch <= x.end);
  if (s) return s.rel;
  const l = open.get(fileOf(uri))?.split('\n')[line] ?? '';
  for (const m of l.matchAll(/[a-z_][\w]*/g)) if (m.index <= ch && ch <= m.index + m[0].length && k.sites.some((x) => x.rel === m[0])) return m[0];
}

const shown = (f: string) => { const r = roots.find((x) => f.startsWith(x + path.sep)); return r ? path.relative(r, f) : f.startsWith(ROOT) ? `rofl/${path.relative(ROOT, f)}` : f; };

function hover(uri: string, k: Known, rel: string) {
  const all = around(uri, k), sites = all.flatMap(([f, x]) => x.sites.filter((s) => s.rel === rel).map((s) => ({ f, s })));
  const defs = sites.filter((x) => x.s.def), arities = [...new Set(sites.map((x) => x.s.arity).filter((a) => a !== undefined))];
  const books = [...new Set(sites.map((x) => x.s.book).filter(Boolean))];
  const forms = [...new Set([...all.map(([, x]) => x.vocab), words()].flatMap((v) => v.templates.filter((t) => t.rel === rel).map((t) => t.src)))];
  return [
    `**${rel}**${arities.length ? ` — arity ${arities.join(' or ')}` : ''}${books.length ? ` · book ${books.join(', ')}` : ''}`,
    ...(forms.length ? [forms.slice(0, 6).map((f) => `- ${f}`).join('\n')] : []),
    defs.length ? `concluded at ${defs.slice(0, 8).map(({ f, s }) => `${shown(f)}:${s.line + 1}`).join(', ')}${defs.length > 8 ? `, and ${defs.length - 8} more` : ''}` : 'concluded nowhere this file stands on',
    `used ${sites.length - defs.length} ${sites.length - defs.length === 1 ? 'time' : 'times'}`,
  ].join('\n\n');
}

type Msg = { id?: number | string; method?: string; params?: any };
const handlers: Record<string, (p: any) => unknown> = {
  initialize: (p) => {
    roots = (p.workspaceFolders ?? (p.rootUri ? [{ uri: p.rootUri }] : [])).map((f: { uri: string }) => fileOf(f.uri));
    return { capabilities: { textDocumentSync: { openClose: true, change: 1 }, hoverProvider: true, definitionProvider: true, referencesProvider: true, documentSymbolProvider: true, completionProvider: {},
      workspace: { workspaceFolders: { supported: true, changeNotifications: true } } }, serverInfo: { name: 'rofl-lsp' } };
  },
  shutdown: () => null,
  exit: () => process.exit(0),
  'workspace/didChangeWorkspaceFolders': ({ event }) => { roots = [...roots.filter((r) => !event.removed.some((f: { uri: string }) => fileOf(f.uri) === r)), ...event.added.map((f: { uri: string }) => fileOf(f.uri))]; },
  'textDocument/didOpen': ({ textDocument: d }) => { open.set(fileOf(d.uri), d.text); analyse(d.uri); },
  'textDocument/didChange': ({ textDocument: d, contentChanges: c }) => {
    open.set(fileOf(d.uri), c[c.length - 1].text);
    clearTimeout(due.get(d.uri));
    due.set(d.uri, setTimeout(() => analyse(d.uri), WAIT));
  },
  'textDocument/didClose': ({ textDocument: d }) => { open.delete(fileOf(d.uri)); known.delete(d.uri); clearTimeout(due.get(d.uri)); due.delete(d.uri); notify('textDocument/publishDiagnostics', { uri: d.uri, diagnostics: [] }); },
  'textDocument/hover': ({ textDocument: d, position: p }) => {
    const k = current(d.uri), rel = k && relAt(d.uri, k, p.line, p.character);
    return k && rel ? { contents: { kind: 'markdown', value: hover(d.uri, k, rel) } } : null;
  },
  'textDocument/definition': ({ textDocument: d, position: p }) => {
    const k = current(d.uri), rel = k && relAt(d.uri, k, p.line, p.character);
    return k && rel ? around(d.uri, k).flatMap(([f, x]) => x.sites.filter((s) => s.rel === rel && s.def).map((s) => loc(f, s))) : null;
  },
  'textDocument/references': ({ textDocument: d, position: p, context }) => {
    const k = current(d.uri), rel = k && relAt(d.uri, k, p.line, p.character);
    return k && rel ? around(d.uri, k).flatMap(([f, x]) => x.sites.filter((s) => s.rel === rel && (!s.def || context?.includeDeclaration)).map((s) => loc(f, s))) : null;
  },
  'textDocument/documentSymbol': ({ textDocument: d }) => {
    const k = current(d.uri), seen = new Set<string>();
    return (k?.sites ?? []).filter((s) => s.def && !seen.has(s.rel) && seen.add(s.rel)).map((s) => ({ name: s.rel, detail: s.arity === undefined ? '' : `/${s.arity}`, kind: 12, range: range(s), selectionRange: range(s) }));
  },
  'textDocument/completion': ({ textDocument: d }) => {
    const k = current(d.uri); if (!k) return [];
    if (k.front) return k.sentences.map((s) => ({ label: s, kind: 1 }));
    const rels = new Map<string, number | undefined>();
    for (const [, x] of around(d.uri, k)) for (const s of x.sites) if (!rels.has(s.rel)) rels.set(s.rel, s.arity);
    return [...rels].map(([rel, n]) => ({ label: rel, kind: 3, detail: n === undefined ? '' : `/${n}` }));
  },
};

function send(m: object) {
  const body = JSON.stringify({ jsonrpc: '2.0', ...m });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}
function notify(method: string, params: object) { send({ method, params }); }

function handle(m: Msg) {
  const h = m.method && handlers[m.method];
  if (m.id === undefined) { if (h) try { h(m.params); } catch (e) { process.stderr.write(`${m.method}: ${(e as Error).stack}\n`); } return; }
  if (!h) return send({ id: m.id, error: { code: -32601, message: `${m.method} is not served` } });
  try { send({ id: m.id, result: h(m.params) ?? null }); } catch (e) { send({ id: m.id, error: { code: -32603, message: (e as Error).message } }); }
}

// a header longer than 64 KB is dropped; a message said to be longer than 32 MB ends the server, since nothing after it can be trusted to start a frame
const HEADER = 64 << 10, BODY = 32 << 20;
let buf = Buffer.alloc(0);
process.stdin.on('data', (d: Buffer) => {
  buf = Buffer.concat([buf, d]);
  for (;;) {
    const h = buf.indexOf('\r\n\r\n');
    if (h < 0) { if (buf.length > HEADER) { process.stderr.write(`dropped ${buf.length} bytes with no header\n`); buf = Buffer.alloc(0); } return; }
    const n = Number(/Content-Length: *(\d+)/i.exec(buf.subarray(0, h).toString())?.[1]);
    if (h > HEADER) { const c = buf.lastIndexOf('Content-Length:', h); buf = buf.subarray(c > 0 ? c : h + 4); continue; }   // junk before a header: resync on it
    if (!Number.isFinite(n)) { buf = buf.subarray(h + 4); continue; }
    if (n > BODY) { process.stderr.write(`a message of ${n} bytes is over ${BODY}; ending\n`); process.exit(1); }
    if (buf.length < h + 4 + n) return;
    const body = buf.subarray(h + 4, h + 4 + n).toString('utf8');
    buf = buf.subarray(h + 4 + n);
    try { handle(JSON.parse(body)); } catch (e) { process.stderr.write(`not JSON-RPC: ${(e as Error).message}\n`); }
  }
});
process.stdin.on('end', () => process.exit(0));

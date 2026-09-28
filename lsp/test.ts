// npm run test:lsp — the language server against the tree and against planted defects, under a minute; `-- --all` sweeps docs/ too, in about two.
// 1. Every `.rofl` and `.rofl.md` in the tree: no error but on the files listed below, each of which must have one; no warning but those listed.
// 2. One planted defect per feature, through lsp/know.ts: a broken rule, a refused program, a sentence not read; hover, definition, references, outline, completion on a known relation.
// 3. The server over stdio, as it is and with a planted defect in its code for each feature, which must turn it red.
import { spawn } from 'node:child_process';
import { globSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { know, type Known } from './know.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), t0 = performance.now();
const get = (p: string) => { try { return readFileSync(p, 'utf8'); } catch { return undefined; } };
const lib = (f: string) => get(path.join(ROOT, f));
const knownAt = (f: string, text = readFileSync(path.join(ROOT, f), 'utf8')) => know(path.join(ROOT, f), text, lib, (r) => get(path.resolve(path.dirname(path.join(ROOT, f)), r)));

// the files that are refused as they are, with why; a golden world among them is refused in facts/goldens.rofl too
const REFUSED: Record<string, string> = {
  'examples/checks/async-refused.rofl': 'a world written to be refused: @async',
  'examples/checks/not-as-a-name.rofl': 'a world written to be refused: not as a relation name',
  'examples/checks/premise-arity.rofl': 'a world written to be refused: a kernel relation at the wrong arity',
  'examples/checks/refused.rofl': 'a world written to be refused: a syntax error',
  'examples/checks/unstratifiable.rofl': 'a world written to be refused: no stratification',
  'examples/ring1/l1.dense.rofl': 'ring 1 in the dense form, which the goldens record as refused',
  // renderings of the model the reader cannot read back as a world; no golden loads docs/
  'docs/js/js-attrs.rofl.md': 'the reader writes $var(?X)', 'docs/js/js-pack-home.rofl.md': 'the reader writes ?X', 'docs/js/js-vocabulary.rofl.md': 'the reader writes ?X',
  'docs/js/js-phrases.rofl.md': 'the reader writes a backtick', 'docs/rings/boot.rofl.md': 'the reader writes ?X', 'docs/rings/host.rofl.md': 'the reader writes ?X',
  'docs/rings/ring1.rofl.md': 'the reader writes ?X', 'docs/rings/safety.rofl.md': 'the reader writes ?X',
};
const WARNED: string[] = [];
const ALL = process.argv.includes('--all');

type Swept = { f: string; errors: string[]; warnings: string[]; ms: number };
if (process.argv[2] === '--slice') {
  const [k, n] = process.argv[3].split('/').map(Number), out: Swept[] = [];
  // the largest first, each to the slice with the least so far: the reader's time grows with the text
  const load = Array(n).fill(0), mine: string[] = [];
  for (const f of files().map((f) => [f, readFileSync(path.join(ROOT, f)).length] as const).sort((a, b) => b[1] - a[1])) {
    const j = load.indexOf(Math.min(...load)); load[j] += f[1]; if (j === k) mine.push(f[0]);
  }
  for (const f of mine) {
    const t = performance.now(), d = knownAt(f).diags, said = (s: number) => d.filter((x) => x.severity === s).map((x) => `${x.line + 1}:${x.col + 1} ${x.message.split('\n')[0]}`);
    out.push({ f, errors: said(1), warnings: said(2), ms: Math.round(performance.now() - t) });
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}
/** Every file of the tree; without `--all`, not the renderings under docs/, which are no world, take the reader three quarters of the time and would not fit the minute. */
function files() {
  return globSync('**/*.{rofl,rofl.md}', { cwd: ROOT }).filter((f) => !/(^|\/)(node_modules|dist|target|vscode-break-[\w-]+)\//.test(f) && (ALL || !f.startsWith('docs/'))).sort();
}

const bad: string[] = [];
const expect = (ok: boolean, what: string) => { if (!ok) bad.push(what); };

// 1. the tree, in as many processes as there are cores
const node = (args: string[], input?: string) => new Promise<string>((done) => {
  const p = spawn(process.execPath, ['--experimental-strip-types', ...args], { stdio: ['pipe', 'pipe', 'inherit'] });
  let s = ''; p.stdout.on('data', (d) => { s += d; });
  const kill = setTimeout(() => p.kill(), 55_000);
  p.on('close', () => { clearTimeout(kill); done(s); });
  p.stdin.end(input);
});
const n = Math.max(2, availableParallelism());
const sweeping = Promise.all([...Array(n).keys()].map((k) => node([fileURLToPath(import.meta.url), '--slice', `${k}/${n}`, ...(ALL ? ['--all'] : [])]).then((s) => JSON.parse(s || '[]') as Swept[])));

// 2. planted defects, one per feature
const review = knownAt('examples/review.rofl.md'), lines = readFileSync(path.join(ROOT, 'examples/review.rofl.md'), 'utf8').split('\n');
const lineOf = (s: string) => lines.findIndex((l) => l.includes(s));
{
  const d = know('/x/broken.rofl', 'a(1).\nb(X) :- a(X).\nc(X) :- a(X) b(X).\n', lib, () => undefined).diags;
  expect(d.length === 1 && d[0].line === 2 && d[0].col === 13 && d[0].severity === 1, `a broken rule on line 3: ${JSON.stringify(d)}`);
  const r = know('/x/cycle.rofl', 'p() :- a(), not q().\nq() :- a(), not p().\na().\n', lib, () => undefined).diags;
  expect(r.length === 1 && r[0].line === 0 && /refused: .*settled nothing while p, q/.test(r[0].message), `an unstratifiable program: ${JSON.stringify(r)}`);
  const text = lines.join('\n') + '\nA change C is late if C touches a module M and M is frozen by a team T.\n';
  const m = know(path.join(ROOT, 'examples/late.rofl.md'), text, lib, () => undefined).diags.filter((x) => x.severity === 1);
  expect(m.some((x) => x.line === lines.length && x.col === 47 && /^not read: M is frozen by a team T; the nearest sentences: "a team T owns a module M"/.test(x.message)), `a sentence not read: ${JSON.stringify(m)}`);
  expect(m.every((x) => x.line === lines.length), `a sentence not read marks only its line: ${JSON.stringify(m)}`);
  const f = know(path.join(ROOT, 'examples/front.rofl.md'), '---\nreads: [nowhere.rofl.md]\n---\n\nA thing X is odd if X is odd.\n', lib, () => undefined).diags;
  expect(f.some((x) => x.line === 1 && x.message === 'nowhere.rofl.md: not read'), `a world it reads that is not there: ${JSON.stringify(f)}`);
}

const sites = (k: Known, rel: string, def: boolean) => k.sites.filter((s) => s.rel === rel && s.def === def).map((s) => s.line);
expect(sites(review, 'blocked', true).join() === String(lineOf('<a id="blocked">')), `blocked is concluded at its anchor: ${sites(review, 'blocked', true)}`);
expect(sites(review, 'needs', false).includes(lineOf('<a id="blocked">')), `needs is used in the rule for blocked: ${sites(review, 'needs', false)}`);
expect(sites(review, 'author', false).includes(lineOf('2. if C is written by')), 'author is used in an alternative');
expect(review.sentences.includes('a change C is blocked by a team T'), `completion offers the file's own sentence: ${review.sentences.slice(0, 12)}`);
const counter = knownAt('examples/counter.rofl'), ctext = readFileSync(path.join(ROOT, 'examples/counter.rofl'), 'utf8').split('\n');
const heads = counter.sites.filter((s) => s.def);
expect(heads.length > 0 && heads.every((s) => ctext[s.line].slice(s.col, s.end) === s.rel), `every head of counter.rofl is where its name is: ${heads.slice(0, 3).map((s) => `${s.rel}@${s.line}:${s.col}`)}`);

// 3. the server over stdio: a broken file gets its error, a hover and a definition answer; each planted defect must turn this red
type Rpc = { diags: any[]; hover: any; def: any; refs: any; symbols: any; completion: any };
async function converse(server: string): Promise<Rpc> {
  const broken = pathToFileURL(path.join(ROOT, 'examples/broken.rofl')).href, rv = pathToFileURL(path.join(ROOT, 'examples/review.rofl.md')).href;
  const msgs = [
    { id: 1, method: 'initialize', params: { rootUri: pathToFileURL(ROOT).href, capabilities: {} } },
    { method: 'textDocument/didOpen', params: { textDocument: { uri: broken, languageId: 'rofl', version: 1, text: 'a(1).\nb(X) :- a(X).\nc(X) :- a(X) b(X).\n' } } },
    { method: 'textDocument/didOpen', params: { textDocument: { uri: rv, languageId: 'markdown', version: 1, text: lines.join('\n') } } },
    { id: 2, method: 'textDocument/hover', params: { textDocument: { uri: rv }, position: { line: lineOf('<a id="blocked">'), character: 10 } } },
    { id: 3, method: 'textDocument/definition', params: { textDocument: { uri: rv }, position: { line: lineOf('<a id="blocked">'), character: lines[lineOf('<a id="blocked">')].indexOf('C needs T') + 3 } } },
    { id: 4, method: 'textDocument/references', params: { textDocument: { uri: rv }, position: { line: lineOf('<a id="needs">'), character: 10 }, context: { includeDeclaration: false } } },
    { id: 5, method: 'textDocument/documentSymbol', params: { textDocument: { uri: rv } } },
    { id: 6, method: 'textDocument/completion', params: { textDocument: { uri: broken }, position: { line: 0, character: 0 } } },
    { id: 7, method: 'shutdown' }, { method: 'exit' },
  ];
  const out = await node([server, '--stdio'], msgs.map((m) => { const b = JSON.stringify({ jsonrpc: '2.0', ...m }); return `Content-Length: ${Buffer.byteLength(b)}\r\n\r\n${b}`; }).join(''));
  const got: any[] = [];
  for (let b = Buffer.from(out); b.length;) {
    const h = b.indexOf('\r\n\r\n'); if (h < 0) break;
    const len = Number(/Content-Length: (\d+)/.exec(b.subarray(0, h).toString())?.[1]);
    got.push(JSON.parse(b.subarray(h + 4, h + 4 + len).toString())); b = b.subarray(h + 4 + len);
  }
  const res = (id: number) => got.find((m) => m.id === id)?.result;
  return { diags: got.filter((m) => m.method === 'textDocument/publishDiagnostics' && m.params.uri === broken).flatMap((m) => m.params.diagnostics), hover: res(2), def: res(3), refs: res(4), symbols: res(5), completion: res(6) };
}
function judge(r: Rpc): string[] {
  const out: string[] = [], line = (x: any) => x?.range?.start?.line;
  if (!(r.diags.length === 1 && line(r.diags[0]) === 2 && r.diags[0].range.start.character === 13)) out.push(`diagnostics: ${JSON.stringify(r.diags)}`);
  if (!/\*\*blocked\*\* — arity 2/.test(r.hover?.contents?.value ?? '') || !r.hover.contents.value.includes(`examples/review.rofl.md:${lineOf('<a id="blocked">') + 1}`)) out.push(`hover: ${JSON.stringify(r.hover)}`);
  if (!(r.def?.length === 1 && line(r.def[0]) === lineOf('<a id="needs">'))) out.push(`definition: ${JSON.stringify(r.def)}`);
  if (!(r.refs?.length && r.refs.every((x: any) => x.uri.endsWith('review.rofl.md')) && r.refs.some((x: any) => line(x) === lineOf('<a id="blocked">')))) out.push(`references: ${JSON.stringify(r.refs)}`);
  if (!['owns', 'needs', 'covered', 'blocked', 'mergeable'].every((s) => r.symbols?.some((x: any) => x.name === s))) out.push(`symbols: ${JSON.stringify(r.symbols)}`);
  if (!(r.completion?.some((x: any) => x.label === 'b') && r.completion.some((x: any) => x.label === 'gathered'))) out.push(`completion: ${JSON.stringify(r.completion)?.slice(0, 200)}`);
  return out;
}
const SERVER = path.join(ROOT, 'lsp/server.ts');
const MUTANTS: Record<string, [RegExp, string]> = {
  'drops diagnostics': [/diagnostics: k\.diags\.map/, 'diagnostics: k.diags.slice(0, 0).map'],
  'hover says nothing': [/return k && rel \? \{ contents/, 'return false && rel ? { contents'],
  'definition takes uses': [/s\.rel === rel && s\.def\)\.map/, 's.rel === rel && !s.def).map'],
  'references give the heads': [/\(!s\.def \|\| context\?\.includeDeclaration\)/, '(s.def || context?.includeDeclaration)'],
  'outline empty': [/return \(k\?\.sites \?\? \[\]\)\.filter\(\(s\) => s\.def/, 'return (k?.sites ?? []).filter((s) => !s.def'],
  'completion without the kernel': [/for \(const \[, x\] of around\(d\.uri, k\)\)/, 'for (const x of [k])'],
};
const src = readFileSync(SERVER, 'utf8');
const conversations = () => Promise.all([['as it is', SERVER] as const, ...Object.entries(MUTANTS).map(([name, [at, plant]]) => {
  if (!at.test(src)) throw new Error(`${name}: the planted defect did not apply`);
  const f = path.join(ROOT, `lsp/mutant-${name.replace(/ /g, '-')}.ts`);
  writeFileSync(f, src.replace(at, plant));
  return [name, f] as const;
})].map(async ([name, f]) => { try { return { name, red: judge(await converse(f)) }; } finally { if (f !== SERVER) rmSync(f, { force: true }); } }));

const swept = await sweeping; console.log(`swept in ${((performance.now() - t0) / 1000).toFixed(1)} s`); const talks = await conversations();
const all = swept.flat();
expect(all.length === files().length, `swept ${all.length} of ${files().length} files`);
for (const s of all) {
  if (REFUSED[s.f]) expect(s.errors.length > 0, `${s.f}: ${REFUSED[s.f]}, yet no error`);
  else expect(!s.errors.length, `${s.f}: ${s.errors.join(' · ')}`);
  expect(!s.warnings.length === !WARNED.includes(s.f), `${s.f}: warnings ${s.warnings.join(' · ') || 'none'}`);
}
for (const f of Object.keys(REFUSED).filter((f) => ALL || !f.startsWith('docs/'))) expect(all.some((s) => s.f === f), `${f} is listed as refused and is not in the tree`);
for (const t of talks) {
  if (t.name === 'as it is') { for (const r of t.red) bad.push(`the server: ${r}`); console.log(`${t.red.length ? 'FAIL' : 'ok  '} the server over stdio`); }
  else { expect(t.red.length > 0, `planted "${t.name}" stayed green`); console.log(`${t.red.length ? 'ok  ' : 'FAIL'} planted "${t.name}": red`); }
}
const slow = [...all].sort((a, b) => b.ms - a.ms).slice(0, 3).map((s) => `${s.f} ${s.ms} ms`).join(', ');
console.log(`${all.length} files swept: ${all.filter((s) => s.errors.length).length} with errors, all listed as refused; ${all.filter((s) => s.warnings.length).length} with warnings; slowest ${slow}`);
for (const b of bad) console.log(`FAIL ${b}`);
console.log(`${bad.length ? 'FAIL' : 'ok'}: npm run test:lsp, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(bad.length ? 1 : 0);

// npm run test:lsp — the language server against the tree and against planted defects, under a minute; `-- --all` sweeps docs/ too, in about two.
// 1. Every `.rofl` and `.rofl.md` in the tree: no error but on the files listed below, each of which must have one; no warning but those listed.
// 2. One planted defect per feature, through lsp/know.ts: a broken rule, a refused program, a sentence not read; hover, definition, references, outline, completion on a known relation.
// 3. The server over stdio, as it is and with a planted defect in its code for each feature, which must turn it red: what it answers, what it will not read
//    (a link to outside the workspace, a .rofl outside it), and a frame too long or a header lost in junk.
import { spawn } from 'node:child_process';
import { globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { know, type Known } from './know.ts';
import { builtin } from '../notebook/front.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), t0 = performance.now();
const get = (p: string) => { try { return readFileSync(p, 'utf8'); } catch { return undefined; } };
const lib = (f: string) => get(path.join(ROOT, f));
const knownAt = (f: string, text = readFileSync(path.join(ROOT, f), 'utf8')) => know(path.join(ROOT, f), text, lib, (r) => get(builtin(r) ? path.join(ROOT, builtin(r)!) : path.resolve(path.dirname(path.join(ROOT, f)), r)));

// the files that are refused as they are, with why; a golden world among them is refused in facts/goldens.rofl too
const REFUSED: Record<string, string> = {
  'examples/checks/async-refused.rofl': 'a world written to be refused: @async',
  'examples/checks/not-as-a-name.rofl': 'a world written to be refused: not as a relation name',
  'examples/checks/premise-arity.rofl': 'a world written to be refused: a kernel relation at the wrong arity',
  'examples/checks/refused.rofl': 'a world written to be refused: a syntax error',
  'examples/checks/unstratifiable.rofl': 'a world written to be refused: no stratification',
  'examples/ring1/l1.dense.rofl': 'ring 1 in the dense form, which the goldens record as refused',
  'examples/checks/agg-int-range-literal.rofl': 'a world written to be refused: a literal of 2^60 (check_refuses in facts/checks.rofl)',
  'guide/examples/typo.rofl.md': 'the guide\'s world written with a typo, to show what a sentence not read looks like',
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
  expect(r.length === 1 && r[0].line === 0 && /refused: .*nothing on the cycle p -\/-> q -\/-> p can be settled first/.test(r[0].message), `an unstratifiable program: ${JSON.stringify(r)}`);
  const text = lines.join('\n') + '\nA change C is late if C touches a module M and M is frozen by a team T.\n';
  const m = know(path.join(ROOT, 'examples/late.rofl.md'), text, lib, () => undefined).diags.filter((x) => x.severity === 1);
  expect(m.some((x) => x.line === lines.length && x.col === 47 && /^not read: M is frozen by a team T; the nearest sentences: "a team T owns a module M"/.test(x.message)), `a sentence not read: ${JSON.stringify(m)}`);
  expect(m.every((x) => x.line === lines.length), `a sentence not read marks only its line: ${JSON.stringify(m)}`);
  const f = know(path.join(ROOT, 'examples/front.rofl.md'), '---\nreads: [nowhere.rofl.md]\n---\n\nA thing X is odd if X is odd.\n', lib, () => undefined).diags;
  expect(f.some((x) => x.line === 1 && x.message === 'nowhere.rofl.md: not read'), `a world it reads that is not there: ${JSON.stringify(f)}`);
  const kept = know(path.join(ROOT, 'examples/front.rofl.md'), '---\nreads: [/etc/hosts]\n---\n', lib, () => null).diags;
  expect(kept.length === 1 && kept[0].severity === 2 && /^\/etc\/hosts: not read here/.test(kept[0].message), `a file it will not read: ${JSON.stringify(kept)}`);
  const eof = know('/x/eof.rofl', 'a(1).\nb(X) :- a(X\n\n', lib, () => undefined).diags;
  expect(eof.length === 1 && eof[0].line === 1 && eof[0].col === 11, `a text that ends inside a rule is marked after its last word: ${JSON.stringify(eof)}`);
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
  const got = parse(await node([server, '--stdio'], frames(msgs)));
  const res = (id: number) => got.find((m) => m.id === id)?.result;
  return { diags: got.filter((m) => m.method === 'textDocument/publishDiagnostics' && m.params.uri === broken).flatMap((m) => m.params.diagnostics), hover: res(2), def: res(3), refs: res(4), symbols: res(5), completion: res(6) };
}
const frames = (msgs: object[]) => msgs.map((m) => { const b = JSON.stringify({ jsonrpc: '2.0', ...m }); return `Content-Length: ${Buffer.byteLength(b)}\r\n\r\n${b}`; }).join('');
function parse(out: string): any[] {
  const got: any[] = [];
  for (let b = Buffer.from(out); b.length;) {
    const h = b.indexOf('\r\n\r\n'); if (h < 0) break;
    const len = Number(/Content-Length: (\d+)/.exec(b.subarray(0, h).toString())?.[1]);
    got.push(JSON.parse(b.subarray(h + 4, h + 4 + len).toString())); b = b.subarray(h + 4 + len);
  }
  return got;
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
  'reads through a link': [/return allowed\(p, file\) \? text\(p\)/, 'return ours(p) ? text(p)'],
  'reads outside the workspace': [/roots\.some\(\(x\) => under\(r, real\(x\) \?\? x\)\)/, 'true'],
  'no shipped vocabulary': [/if \(b !== undefined\) return b \? text\(path\.join\(ROOT, b\)\) : undefined;/, ''],
  'a rofl: name as a path from the root': [/return b \? text\(path\.join\(ROOT, b\)\) : undefined;/, 'return text(path.join(ROOT, name.slice(5)));'],
  'waits on a huge frame': [/process\.exit\(1\); \}/, '}'],
  'deaf after junk': [/buf = buf\.subarray\(c > 0 \? c : h \+ 4\)/, 'buf = buf.subarray(h + 4)'],
  'outline empty': [/return \(k\?\.sites \?\? \[\]\)\.filter\(\(s\) => s\.def/, 'return (k?.sites ?? []).filter((s) => !s.def'],
  'completion without the kernel': [/for \(const \[, x\] of around\(d\.uri, k\)\)/, 'for (const x of [k])'],
};
const src = readFileSync(SERVER, 'utf8');
const conversations = () => Promise.all([['as it is', SERVER] as const, ...Object.entries(MUTANTS).map(([name, [at, plant]]) => {
  if (!at.test(src)) throw new Error(`${name}: the planted defect did not apply`);
  const f = path.join(ROOT, `lsp/mutant-${name.replace(/ /g, '-')}.ts`);
  writeFileSync(f, src.replace(at, plant));
  return [name, f] as const;
})].map(async ([name, f]) => { try { const [r, c, w] = await Promise.all([converse(f), confined(f), framing(f)]); return { name, red: [...judge(r), ...c, ...w] }; } finally { if (f !== SERVER) rmSync(f, { force: true }); } }));

// 4. what the server will not read: a link named .rofl to a file outside the workspace, a .rofl outside it and a `rofl:` name that is no vocabulary,
// next to a .rofl inside it and a shipped vocabulary that it reads
async function confined(server: string): Promise<string[]> {
  const tmp = mkdtempSync(path.join(tmpdir(), 'rofl-lsp-')), ws = path.join(tmp, 'ws'), out = path.join(tmp, 'outside'), TOKEN = 'canary_7f3a9e';
  try {
    mkdirSync(ws); mkdirSync(out);
    writeFileSync(path.join(out, 'secret.txt'), `${TOKEN}(1).\n`); writeFileSync(path.join(out, 'plain.rofl'), `${TOKEN}(2).\n`);
    symlinkSync(path.join(out, 'secret.txt'), path.join(ws, 'creds.rofl'));
    writeFileSync(path.join(ws, 'ok.rofl'), 'okrel(1).\n');
    const md = pathToFileURL(path.join(ws, 'nb.rofl.md')).href, a = pathToFileURL(path.join(ws, 'a.rofl')).href;
    const said = await node([server, '--stdio'], frames([
      { id: 1, method: 'initialize', params: { rootUri: pathToFileURL(ws).href, capabilities: {} } },
      { method: 'textDocument/didOpen', params: { textDocument: { uri: md, languageId: 'markdown', version: 1, text: '---\nreads: [creds.rofl, ok.rofl, ../outside/plain.rofl, rofl:visual/graph.rofl.md, rofl:visual/../package.json]\n---\n\nA thing X is odd if X is odd.\n' } } },
      { method: 'textDocument/didOpen', params: { textDocument: { uri: a, languageId: 'rofl', version: 1, text: 'a(1).\n' } } },
      { id: 2, method: 'textDocument/completion', params: { textDocument: { uri: a }, position: { line: 0, character: 0 } } },
      { id: 3, method: 'shutdown' }, { method: 'exit' }]));
    const got = parse(said), diags = got.filter((m) => m.params?.uri === md).flatMap((m) => m.params.diagnostics), labels = got.find((m) => m.id === 2)?.result?.map((i: any) => i.label) ?? [];
    const kept = (n: string) => diags.some((d: any) => d.severity === 2 && d.message.startsWith(`${n}: not read here`));
    return [
      ...(said.includes(TOKEN) ? [`the canary ${TOKEN} is in what the server said`] : []),
      ...(!kept('creds.rofl') || !kept('../outside/plain.rofl') ? [`no warning for what it would not read: ${JSON.stringify(diags)}`] : []),
      ...(diags.some((d: any) => d.message.includes('ok.rofl')) || !labels.includes('okrel') ? [`the .rofl inside the workspace was not read: ${JSON.stringify(diags)} ${labels}`] : []),
      // a file shipped with ROFL is read from outside the workspace; a `rofl:` name ROFL does not ship is not read at all
      ...(diags.some((d: any) => d.message.includes('rofl:visual/graph')) ? [`the shipped vocabulary was not read: ${JSON.stringify(diags)}`] : []),
      ...(said.includes('Relation-Oriented') || !diags.some((d: any) => d.severity === 1 && d.message === 'rofl:visual/../package.json: not read') ? [`rofl:visual/../package.json was read or not refused: ${JSON.stringify(diags)}`] : []),
    ];
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
/** The server's stdin kept open: after `input`, does it end or answer within a second. */
const within = (server: string, input: string) => new Promise<{ ended: boolean; out: string }>((done) => {
  const p = spawn(process.execPath, ['--experimental-strip-types', server, '--stdio'], { stdio: ['pipe', 'pipe', 'ignore'] });
  let out = '', ended = false;
  let sent = false;
  const stop = (why: string) => { p.kill(); done({ ended, out: why + out }); }, late = setTimeout(() => stop('never started: '), 20_000);
  // the second is the server's, not its start's: `input` goes once it has answered an initialize
  p.stdout.on('data', (d) => { out += d; if (!sent && out.includes('"id":0')) { sent = true; clearTimeout(late); out = ''; p.stdin.write(input); setTimeout(() => stop(''), 1_000); } });
  p.on('exit', () => { ended = true; });
  p.stdin.on('error', () => {});
  p.stdin.write(frames([{ id: 0, method: 'initialize', params: { capabilities: {} } }]));
});
async function framing(server: string): Promise<string[]> {
  const [huge, junk] = await Promise.all([within(server, 'Content-Length: 999999999\r\n\r\nabc'), within(server, 'x'.repeat(70_000) + frames([{ id: 1, method: 'initialize', params: { capabilities: {} } }]))]);
  return [...(huge.ended ? [] : ['a frame said to be 1 GB wedged the server instead of ending it']), ...(parse(junk.out).some((m) => m.id === 1) ? [] : ['70 KB with no header left the server deaf to the next frame'])];
}

const swept = await sweeping; console.log(`swept in ${((performance.now() - t0) / 1000).toFixed(1)} s`); const talks = await conversations();
const all = swept.flat();
expect(all.length === files().length, `swept ${all.length} of ${files().length} files`);
// a fixture written to be refused says so on its first lines, `-- expect-refusal: <text>` (`<!-- ... -->` in sentences), as the goldens read it;
// the goldens and tests/agg_worlds.rs hold it to those words in its world
const fixture = (f: string): string | undefined => /^(?:-- |<!-- )expect-refusal: (.+?)(?: -->)?[ \t]*$/m.exec(readFileSync(path.join(ROOT, f), 'utf8').split('\n').slice(0, 5).join('\n'))?.[1].trim();
for (const s of all) {
  expect(!s.warnings.length === !WARNED.includes(s.f), `${s.f}: warnings ${s.warnings.join(' · ') || 'none'}`);
  // whether a fixture is refused, and in which words, is its world's to say: under the stock evaluator, beside the world below, which the file alone has not
  if (fixture(s.f)) continue;
  if (REFUSED[s.f]) expect(s.errors.length > 0, `${s.f}: ${REFUSED[s.f]}, yet no error`);
  else expect(!s.errors.length, `${s.f}: ${s.errors.join(' · ')}`);
}
for (const f of Object.keys(REFUSED).filter((f) => ALL || !f.startsWith('docs/'))) expect(all.some((s) => s.f === f), `${f} is listed as refused and is not in the tree`);
for (const t of talks) {
  if (t.name === 'as it is') { for (const r of t.red) bad.push(`the server: ${r}`); console.log(`${t.red.length ? 'FAIL' : 'ok  '} the server over stdio: what it answers, what it will not read, its framing`); }
  else { expect(t.red.length > 0, `planted "${t.name}" stayed green`); console.log(`${t.red.length ? 'ok  ' : 'FAIL'} planted "${t.name}": red`); }
}
const slow = [...all].sort((a, b) => b.ms - a.ms).slice(0, 3).map((s) => `${s.f} ${s.ms} ms`).join(', ');
console.log(`${all.length} files swept: ${all.filter((s) => s.errors.length).length} with errors, all listed as refused or written to be; ${all.filter((s) => s.warnings.length).length} with warnings; slowest ${slow}`);
for (const b of bad) console.log(`FAIL ${b}`);
console.log(`${bad.length ? 'FAIL' : 'ok'}: npm run test:lsp, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(bad.length ? 1 : 0);

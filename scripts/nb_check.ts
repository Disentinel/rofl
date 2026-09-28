// npm run test:nb — the notebook's behavioural gate: the example notebooks by exit code and a few answer lines, and planted defects that must
// turn it red. The invariants it stands for are named in examples/notebook/self.rofl.md; each check below names its own.
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { worlds } from './goldens.ts';
import type { NbLine } from '../notebook/kernel.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const NB = path.join(ROOT, 'examples/notebook');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'nb-check-'));
const t0 = performance.now();

type Out = { code: number; out: string; stdout?: string };
const node = (script: string, args: string[], env: Record<string, string> = {}, root = ROOT): Promise<Out> => new Promise((done) => {
  const p = spawn(process.execPath, ['--experimental-strip-types', path.join(root, script), ...args], { env: { ...process.env, ROFL_NB_DAEMON: '0', ...env } });
  let out = '', stdout = '';
  p.stdout.on('data', (d) => { out += d; stdout += d; }); p.stderr.on('data', (d) => { out += d; });
  const kill = setTimeout(() => p.kill(), 280_000);
  p.on('close', (code) => { clearTimeout(kill); done({ code: code ?? -1, out, stdout }); });
});
const cli = (args: string[], env: Record<string, string> = {}, root = ROOT) => node('notebook/cli.ts', args, env, root);

const put = (to: string, text: string) => { mkdirSync(path.dirname(to), { recursive: true }); writeFileSync(to, text); };
/** A copy of a notebook, with its text changed, next to a copy of every file its front matter names; `also` replaces some of them. */
function planted(name: string, from: string, change: (t: string) => string, also: [string, string][] = []): string {
  const text = readFileSync(path.join(NB, from), 'utf8');
  for (const f of [...(text.split(/^---$/m)[1] ?? '').matchAll(/^\s+- (.+)$/gm)].map((m) => path.join('examples/notebook', m[1]))) put(path.join(tmp, name, f), readFileSync(path.join(ROOT, f), 'utf8'));
  for (const [f, edit] of also) put(path.join(tmp, name, f), edit);
  const file = path.join(tmp, name, 'examples/notebook', from);
  put(file, change(text));
  return file;
}
/** A source with one planted line; a pattern that no longer matches is a check that plants nothing, so it throws. */
function mutate(file: string, at: RegExp, plant: (m: string) => string): string {
  const src = readFileSync(path.join(ROOT, file), 'utf8'), out = src.replace(at, plant);
  if (out === src) throw new Error(`${file}: the planted defect did not apply`);
  return out;
}
/** The tree, linked, with its own copy of notebook/ in which one file is replaced. */
function linked(name: string, file: string, text: string): string {
  const root = path.join(tmp, name);
  mkdirSync(path.join(root, 'notebook'), { recursive: true });
  for (const e of readdirSync(ROOT)) if (e !== 'notebook' && e !== '.git') symlinkSync(path.join(ROOT, e), path.join(root, e));
  for (const f of readdirSync(path.join(ROOT, 'notebook'))) copyFileSync(path.join(ROOT, 'notebook', f), path.join(root, 'notebook', f));
  writeFileSync(path.join(root, file), text);
  return root;
}

const REVIEW = path.join(NB, 'review.rofl.md');
const withCell = (cell: string, kind = 'rofl') => (t: string) => `${t}\n\`\`\`${kind}\n${cell}\n\`\`\`\n`;
const withNatural = withCell('No change touches a module nobody owns.', 'natural');
const smallJs = readFileSync(path.join(NB, 'small.js'), 'utf8'), spinning = smallJs + '\nexport function spin(n) {\n  return n ? spin(n - 1) : 0;\n}\n';

// the planted defects' trees
// every defect a run of this file must turn red goes into one copy of the code, each on its own line, so one run names them all
const runLine = /^  const r = kernel\.run\(path\.relative\(ROOT, path\.resolve\(file\)\), text, input\);/m;
const redFile = planted('red', 'self.rofl.md', (t) => t, [
  ['notebook/world.ts', mutate('notebook/world.ts', /^  const b = readBook\(/m, (m) => `  console.log('read');\n${m}`)],
  ['notebook/kernel.ts', mutate('notebook/kernel.ts', /^export class Kernel \{/m, (m) => `import { readFileSync } from 'node:fs';\nexport const peek = (f: string) => readFileSync(f, 'utf8');\n\n${m}`)],
  ['notebook/front.ts', mutate('notebook/front.ts', /^export function normal\(p: string\): string \{/m, (m) => `${m}\n  if (!p) process.exit(3);`)],
  ['notebook/cli.ts', mutate('notebook/cli.ts', runLine, (m) => `${m}\n  writeFileSync(file, text + JSON.stringify(r));\n  spawn('claude', ['-p', 'check this']);`)],
  ['vscode/worker.ts', mutate('vscode/worker.ts', /const r = runFile\(file, kernel, text, unsaved\);/, (m) => `${m} translateText(file, text, claude, kernel);`)],
]);
// and every one it cannot see into another: the run must name each as out of sight, outside the boundary
const cellsLine = /^    const cells = cellsOf\(text\);/m;
const blindFile = planted('blind', 'self.rofl.md', (t) => t, [['notebook/kernel.ts', mutate('notebook/kernel.ts', cellsLine, (m) => `${m}\n    void import("node:fs").then((fs) => fs.readFileSync(path));\n    globalThis["process"].stdout.write("x");`)]]);
const unpopulated = planted('unpopulated', 'review.rofl.md', (t) => t.replace('never waits_on(C, payments)', 'never waits_onn(C, payments)'));
const failing = planted('review', 'review.rofl.md', withCell('never C is blocked by T'));
const unread = planted('unread', 'review.rofl.md', withCell('A change C is frobbed if C wibbles the moon.'));
const loose = planted('loose', 'review.rofl.md', withCell('A change C touches a module M if C is written by some person.'));
const extend = planted('extend', 'review.rofl.md', withCell('A change C is blocked by a team T if C is written by some person and T owns some module.\n\nextends blocked\n\n? C is blocked by `payments`'));
const collide = planted('collide', 'review.rofl.md', withCell('A change C is blocked by a team T if C is written by some person and T owns some module.\n\n? C is blocked by `payments`'));
const recursion = planted('recursion', 'small.rofl.md', (t) => t, [['examples/notebook/small.js', spinning]]);
const natural = planted('natural', 'review.rofl.md', withNatural);
const unparsed = planted('unparsed', 'review.rofl.md', withCell('whynot calls itself(c2)\nwhy calls itself(c2)', 'datalog'));
// the command line run from a tree whose kernel exits 0 before it answers: a gate executed by the code it checks
const exec = linked('exec', 'notebook/kernel.ts', mutate('notebook/kernel.ts', /^  run\(path: string, text: string, input: Inputs\): NbResult \{/m, (m) => `${m}\n    new Function('return process')().exit(0);`));
const fake = (name: string, answer: string) => { const f = path.join(tmp, name); writeFileSync(f, `#!/bin/sh\ncat > /dev/null\necho "$0" >> ${path.join(tmp, 'called')}\ncat <<'EOF'\n${answer}\nEOF\n`); chmodSync(f, 0o755); return f; };
const good = fake('good.sh', 'Here it is.\n```rofl\nA module M is unowned if some change touches M, unless some team owns M.\n\nnever M is unowned\n```');
const bad = fake('bad.sh', '```rofl\nA module M is gloriously unowned whenever nobody.\n```');
const translateOk = planted('tr-ok', 'review.rofl.md', withNatural);
const translateBad = planted('tr-bad', 'review.rofl.md', withNatural);
const translateGone = planted('tr-gone', 'review.rofl.md', withNatural);
const spy = fake('spy.sh', 'x');
// what the first user of the notebook hit auditing the ledger (examples/notebook/ledger.FRICTION.md), each where it could mislead
const friction = planted('friction', 'review.rofl.md', (t) => `${t}
\`\`\`datalog
flagged[audit](C) :- blocked(C, _).

? flagged(C)
? blocked(C, T), touches(C, M)
\`\`\`

\`\`\`rofl
never blocked(C, payments)
\`\`\`

\`\`\`rofl
A change C is stalled if C wibbles.

never C is stalled
\`\`\`

\`\`\`datalog
held_up(C) :- stalled(C).

never held_up(C)
\`\`\`

\`\`\`natural
Payments blocks nothing.
\`\`\`

\`\`\`datalog
never blocked(C, payments)
\`\`\`
`);
const holey = planted('holey', 'review.rofl.md', withCell('short_name(C, L) :- blocked(C, _), L is str_len(C) - 1.\n\nnever short_name(C, L)', 'datalog'));
// a what-if in the notebook against the same notebook over a world without the fact
const excised = planted('excise', 'review.rofl.md', withCell('excise `c1` is approved by `ben`'));
const without = planted('without', 'review.rofl.md', (t) => t, [['examples/review.rofl.md', readFileSync(path.join(ROOT, 'examples/review.rofl.md'), 'utf8').replace('- `c1` is approved by `ben`.\n', '')]]);
put(path.join(tmp, 'badread/examples/notebook/bad.rofl'), 'p(1).\np(2).\nq(`x`).\n');
put(path.join(tmp, 'badread/examples/notebook/badread.rofl.md'), '---\nreads:\n  - bad.rofl\n---\n\n```datalog\n? p(X)\n```\n');
const slow = path.join(tmp, 'slow.sh'); writeFileSync(slow, '#!/bin/sh\ncat > /dev/null\nexec sleep 30\n'); chmodSync(slow, 0o755);
// the barrel stops re-exporting one handler file: the never must name what the dispatcher no longer reaches
const xdirRed = planted('xdir-red', 'xdir.rofl.md', (t) => t, [['examples/notebook/xdir/handlers/index.ts', "export { handleGet, handlePut } from './store-handlers.js';\n"]]);
const translateSlow = planted('tr-slow', 'review.rofl.md', withNatural);

// the kept kernel (notebook/serve.ts) answers what a fresh process answers, after a cell edit, a code edit and a kill -9; and a daemon
// that keys its answer on the notebook's text alone, blind to the code, is caught by the same comparison
const staleRoot = linked('stale', 'notebook/serve.ts', mutate('notebook/serve.ts', /runFile\(file, k\)/, () => `(memo[file + readFileSync(file, 'utf8')] ??= runFile(file, k))`).replace(/^const ROOT/m, 'const memo: Record<string, ReturnType<typeof runFile>> = {};\nconst ROOT'));
const kept = async (name: string, root: string) => {
  const file = planted(name, 'small.rofl.md', (t) => t);
  const sock = path.join(tmp, `${name}.sock`), env = { ROFL_NB_DAEMON: '1', ROFL_NB_SOCKET: sock, ROFL_NB_IDLE: '60', ROFL_NB_CLAUDE: spy };
  const strip = (o: Out) => { try { const r = JSON.parse(o.stdout ?? ''); const load = r.ms.load; delete r.ms; return { r: `${o.code} ${JSON.stringify(r)}`, load }; } catch { return { r: o.out, load: -1 }; } };
  const step = async () => { const [d, p] = await Promise.all([cli([file, '--json'], env, root), cli([file, '--json'], {}, root)]); return { daemon: strip(d), fresh: strip(p) }; };
  const steps = [await step()];
  writeFileSync(file, withCell('never C is unawaited')(readFileSync(file, 'utf8'))); steps.push(await step());
  writeFileSync(path.join(path.dirname(file), 'small.js'), spinning); steps.push(await step());
  spawnSync('pkill', ['-9', '-f', sock]); steps.push(await step());
  spawnSync('pkill', ['-f', sock]);
  return steps;
};
const keptRuns = Promise.all([kept('kept', ROOT), kept('kept-stale', staleRoot)]);
// one daemon per tree: a run after an engine edit starts a new daemon, and the new one retires the old
const retired = (async () => {
  const root = linked('retire', 'notebook/front.ts', readFileSync(path.join(ROOT, 'notebook/front.ts'), 'utf8')), dir = path.join(tmp, 'retire-tmp');
  mkdirSync(dir);
  const env = { ROFL_NB_DAEMON: '1', TMPDIR: dir, ROFL_NB_IDLE: '60' }, serve = path.join(root, 'notebook/serve.ts');
  const live = () => `${spawnSync('pgrep', ['-f', serve], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean).length} daemons, sockets ${readdirSync(dir).filter((f) => f.endsWith('.sock')).length}`;
  await cli([REVIEW], env, root);
  const before = live();
  writeFileSync(path.join(root, 'notebook/front.ts'), readFileSync(path.join(ROOT, 'notebook/front.ts'), 'utf8') + '// edited\n');
  const second = await cli([REVIEW], env, root);
  await new Promise((r) => setTimeout(r, 1000));
  const after = live();
  spawnSync('pkill', ['-f', serve]);
  return { code: second.code, out: `before the edit: ${before}; after: ${after}`, stdout: second.stdout };
})();

const before = (f: string) => readFileSync(f, 'utf8');
const reviewText = before(REVIEW), selfText = before(path.join(NB, 'self.rofl.md')), naturalText = before(natural), badText = before(translateBad);

const layering = node('scripts/nb_layers.ts', []);
const [review, small, self, reviewJson, fails, notRead, rewrite, extended, collided, recurse, red, blind, unpop, early, nat, trOk, trBad, trGone, unparsedOut, fr, badRead, trSlow, spat, ex, wo, hol, xdir, xdirFails] = await Promise.all([
  cli([REVIEW], { ROFL_NB_CLAUDE: spy }), cli([path.join(NB, 'small.rofl.md')]), cli([path.join(NB, 'self.rofl.md'), '--json'], { ROFL_NB_CLAUDE: spy }), cli([REVIEW, '--json']),
  cli([failing]), cli([unread]), cli([loose]), cli([extend]), cli([collide]), cli([recursion]), cli([redFile]), cli([blindFile, '--json']), cli([unpopulated]), cli([path.join(exec, 'examples/notebook/review.rofl.md')], {}, exec), cli([natural]),
  cli(['translate', translateOk], { ROFL_NB_CLAUDE: good }), cli(['translate', translateBad], { ROFL_NB_CLAUDE: bad }), cli(['translate', translateGone], { ROFL_NB_CLAUDE: path.join(tmp, 'no-such-claude') }), cli([unparsed]),
  cli([friction]), cli([path.join(tmp, 'badread/examples/notebook/badread.rofl.md')]), cli(['translate', translateSlow], { ROFL_NB_CLAUDE: slow, ROFL_NB_CLAUDE_TIMEOUT: '2' }),
  cli([path.join(NB, 'spat.rofl.md')]), cli([excised, '--json']), cli([without, '--json']), cli([holey]),
  cli([path.join(NB, 'xdir.rofl.md')]), cli([xdirRed]),
]);
const layered = await layering;
const [keptOk, keptStale] = await keptRuns;

const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, o?: Out) => results.push([name, ok, ok || !o ? '' : `exit ${o.code}\n${o.out.slice(-1500)}`]);
const has = (o: Out, s: string) => o.out.includes(s);
/** The verdict the run printed last, or in --json its status: an exit code alone is no verdict, since the code under check can exit early. */
const VERDICTS: Record<string, string> = { 'every never holds, every cell read': 'ok', 'a never fails': 'fails', 'not everything was read': 'unread', 'every never holds, some only as far as the model sees': 'blind' };
const verdict = (o: Out): string | null => {
  const text = o.stdout ?? '';
  if (text.startsWith('{')) { try { return JSON.parse(text).status ?? null; } catch { return null; } }
  const m = [...text.matchAll(/: ([a-z ,]+)$/gm)].map((x) => VERDICTS[x[1]]).filter(Boolean);
  return m.length ? m[m.length - 1] : null;
};
const STATUS = ['ok', 'fails', 'unread', 'blind'];
const is = (o: Out, code: number) => o.code === code && verdict(o) === STATUS[code];

check('review: exit 0 and its answers', is(review, 0) && has(review, '`c2` is blocked by `platform`') && has(review, 'never C is blocked by `payments`  ->  holds'), review);
check('review: whynot answers', has(review, 'it stops at: not `c2` is blocked by something, and `c2` is blocked by `platform` does'), review);
check('small: exit 0, an answer at its file:line', is(small, 0) && has(small, '[load() at small.js:7] is unawaited') && has(small, 'never C recurses  ->  holds'), small);
/** The rows a run could not see, and those outside the boundary I6 step 4 names: imports into the unscanned engine, reader, scanner and proof folder, and calls on keys pinned here. */
const BOUNDARY = [/"(\.\.\/src\/|\.\.\/scripts\/|\.\.\/scanners\/|\.\/fold\.ts)/, /^unseen\(\w+, "(get|fork|assert)"\)$/];
const unseen = (o: Out) => { const r = JSON.parse(o.stdout ?? ''); return r.cells.flatMap((c: { lines: { unsure?: { answers: { literal: string; sentence: string }[] } }[] }) => c.lines.flatMap((l) => l.unsure?.answers ?? [])) as { literal: string; sentence: string }[]; };
const outside = (o: Out) => { try { return unseen(o).filter((a) => !BOUNDARY.some((b) => b.test(a.literal))); } catch { return [{ literal: 'no JSON', sentence: o.out.slice(-300) }]; } };
check('self: exit 3 (the gate): every never holds, some as far as it sees', is(self, 3) && unseen(self).length > 0, self);
check('I3 every row self cannot see is of a kind I6 names', outside(self).length === 0, { code: self.code, out: JSON.stringify(outside(self)) });
check('I6 a print planted in the kernel turns self red', is(red, 1) && has(red, 'console.log() at notebook/world.ts'), red);
check('I6 a node:fs import and read planted in the kernel turns self red', is(red, 1) && has(red, 'readFileSync() at notebook/kernel.ts'), red);
check('I6 an exit planted in the kernel turns self red', is(red, 1) && has(red, 'process.exit() at notebook/front.ts'), red);
check('I4 a write planted in a run turns self red', is(red, 1) && has(red, 'never C writes outside translation  ->  FAILS'), red);
check('I5 a process started in a run turns self red', is(red, 1) && has(red, 'never C starts a process outside the model call  ->  FAILS'), red);
check('I5 the model handed over on the editor\'s run path turns self red', is(red, 1) && has(red, '[translateText() at vscode/worker.ts:8] hands the model over outside translation'), red);
check('I3 a dynamic import of node:fs in the kernel is named out of sight, outside the boundary', is(blind, 3) && outside(blind).some((a) => /import\(\)/.test(a.literal) && /notebook\/kernel\.ts:\d+/.test(a.sentence)) && outside(blind).some((a) => /"readFileSync"/.test(a.literal)), { code: blind.code, out: JSON.stringify(outside(blind)) });
check('I3 a computed globalThis["process"] write in the kernel is named out of sight, outside the boundary', is(blind, 3) && outside(blind).some((a) => /"write"/.test(a.literal) && /notebook\/kernel\.ts:\d+/.test(a.sentence)), { code: blind.code, out: JSON.stringify(outside(blind)) });
check('I2 a kernel that exits early is not green', early.code === 0 && verdict(early) === null && !is(early, 0), early);
check('I1 a never over a relation nothing can populate fails with the reason', is(unpop, 1) && has(unpop, 'FAILS · 0 · nothing in the model can put a row here'), unpop);
check('I2 a failing never is exit 1 and names its row', is(fails, 1) && has(fails, 'FAILS · 1') && has(fails, '`c2` is blocked by `platform`'), fails);
check('I2 an unread cell is exit 2 and named', is(notRead, 2) && has(notRead, 'not read: C wibbles the moon'), notRead);
check('I2 a failing never over code is exit 1', is(recurse, 1) && has(recurse, 'never C recurses  ->  FAILS · 1') && has(recurse, 'small.js:12'), recurse);
check('I7 a cell concluding a model sentence with a loose variable is refused, exit 2', is(rewrite, 2) && has(rewrite, 'would rewrite the model'), rewrite);
check('I7 a bound conclusion into a model relation, marked `extends`, is allowed and labelled', is(extended, 1) && has(extended, '`c1` is blocked by `payments`') && has(extended, "note: extends the model's blocked"), extended);
check('I7 the same conclusion without the marker is refused, naming the sentence it collided with', is(collided, 2) && has(collided, 'lands in the model\'s own sentence "C is blocked by T" (blocked)') && has(collided, 'extends blocked') && !has(collided, '`c1` is blocked by `payments`'), collided);
check('B a never in a cell whose rule was left out is not asked, not FAILS or holds', is(fr, 2) && has(fr, 'never C is stalled  ->  not asked') && !has(fr, 'never C is stalled  ->  FAILS') && !has(fr, 'never C is stalled  ->  holds'), fr);
check('B a never resting on a relation nothing defines is not asked and says which', has(fr, 'never held_up(C)  ->  not asked: it rests on stalled, which nothing defines'), fr);
check('I1 a whynot that does not parse is an error of its cell, a why says so on its line, the other cells still answer, exit 2', is(unparsedOut, 2) && has(unparsedOut, 'error: whynot calls itself(c2): ') && /why calls itself\(c2\)\n +line 1: expected/.test(unparsedOut.out) && has(unparsedOut, '`c2` is blocked by `platform`'), unparsedOut);
check('I1 an untranslated natural cell is named, not dropped', is(nat, 0) && has(nat, 'not translated yet'), nat);
check('xdir: a call reaches across directories, through a barrel and a TypeScript `.js` specifier', is(xdir, 0) && has(xdir, '? handler(F, N)  ->  3 answers') && has(xdir, 'never undispatched(N)  ->  holds') && has(xdir, 'calls [function keys() at xdir/lib/store.ts:3]'), xdir);
check('  and a handler the barrel stops re-exporting is named', is(xdirFails, 1) && has(xdirFails, 'never undispatched(N)  ->  FAILS · 1') && has(xdirFails, 'undispatched("handleList")'), xdirFails);
check('I1 every directive line of review is answered', (() => { const r = JSON.parse(reviewJson.stdout ?? ''); const asked = (reviewText.match(/^(\?|never|why|whynot|unsure) /gm) ?? []).length; const said = r.cells.flatMap((c: { lines: { unsure?: unknown }[] }) => c.lines.flatMap((l) => l.unsure ? [l, l] : [l])).length; return asked === said && asked > 0; })(), reviewJson);
check('I4 a run writes nothing into the file', before(REVIEW) === reviewText && before(path.join(NB, 'self.rofl.md')) === selfText && before(natural) === naturalText);
check('I5 a run never calls a model', !(() => { try { return readFileSync(path.join(tmp, 'called'), 'utf8').includes('spy.sh'); } catch { return false; } })());
const ok = before(translateOk);
check('I5 a translation that reads is inserted under its natural cell, which stays', trOk.code === 0 && ok.includes('No change touches a module nobody owns.\n```\n\n```rofl\nA module M is unowned') && ok.startsWith(reviewText.slice(0, 200)), trOk);
check('I5 a translation that does not read after a retry is not written, exit 2', trBad.code === 2 && before(translateBad) === badText && has(trBad, 'nothing written') && readFileSync(path.join(tmp, 'called'), 'utf8').split('\n').filter((l) => l.endsWith('bad.sh')).length === 2, trBad);
check('I5 translate says on stderr before the model answers, and it is not on stdout', trOk.out.includes('Claude is writing the cell (usually 30–120 s)…') && trOk.out.indexOf('usually 30–120 s') < trOk.out.indexOf('translated') && !trOk.stdout!.includes('usually 30–120 s') && trBad.out.includes('the first try did not read (') && trBad.out.includes('); asking again…') && !trBad.stdout!.includes('asking again'), trOk);
check('E1 a legible proof keeps every line and every fact of the engine\'s', (() => {
  const r = JSON.parse(reviewJson.stdout ?? ''); const l = r.cells.flatMap((c: { lines: NbLine[] }) => c.lines).find((x: NbLine) => x.kind === 'why');
  const raw = (l?.whyRaw ?? '').split('\n'), nice = (l?.why ?? '').split('\n');
  return raw.length > 3 && raw.length === nice.length && raw.every((x: string, k: number) => !/\[axiom\]$/.test(x) || nice[k].endsWith('(given)') && nice[k].includes(x.replace(/ \[axiom\]$/, '').trim()))
    && !/@tick|\?_\$|#\d|\[main\]/.test(l?.why ?? '');
})(), reviewJson);
check('E2 a relation a read world derives answers in the sentence the notebook gives it', is(spat, 1) && has(spat, 'never Ch is alone on D at S  ->  FAILS · 4') && has(spat, '- `kit` is alone on `thu` at 1060'), spat);
check('E3 an excise in the notebook moves the lines the same as the notebook over a world without the fact', (() => {
  const lines = (o: Out) => JSON.parse(o.stdout ?? '').cells.flatMap((c: { lines: NbLine[] }) => c.lines) as NbLine[];
  const moved = lines(ex).find((l) => l.kind === 'excise')?.answers.filter((a) => !a.sentence.startsWith(' ')) ?? [];
  const after = new Map(lines(wo).filter((l) => l.kind !== 'excise').map((l) => [l.text, l.total]));
  const before = new Map(lines(ex).filter((l) => l.kind !== 'excise').map((l) => [l.text, l.total]));
  const said = new Map(moved.map((a) => { const m = /^(.*): (\d+) -> (\d+)$/.exec(a.sentence)!; return [m[1], [Number(m[2]), Number(m[3])]]; }));
  return moved.length > 0 && [...before].every(([t, n]) => (said.get(t)?.[0] ?? n) === n && (said.get(t)?.[1] ?? n) === after.get(t));
})(), { code: ex.code, out: (ex.stdout ?? '') + (wo.stdout ?? '') });
check('E5 a never over a rule that met an expression it could not evaluate holds only as far as it sees', is(hol, 3) && has(hol, 'note: the rule for short name met an expression it could not evaluate') && has(hol, 'never short_name(C, L)  ->  holds as far as it sees · it rests on short name'), hol);
check('F1 an empty relation asked in one book the program writes in another says which', has(fr, 'flagged is written in [audit], not in [main]: ask flagged[audit](...)'), fr);
check('F2 a positional never works in a rofl cell', has(fr, 'never blocked(C, payments)  ->  holds'), fr);
check('F4 a datalog cell under a natural cell answers it', has(fr, 'note: answered by the cell below it') && !has(fr, 'not translated yet'), fr);
check('F5 a conjunctive question is refused with what to write instead', is(fr, 2) && has(fr, 'a question is one literal; write a rule that joins these'), fr);
check('F3 an error in a read file is at that file\'s line', is(badRead, 2) && has(badRead, 'bad.rofl:3: unexpected character'), badRead);
check('F6 a model that does not answer is stopped in bounded time and said', trSlow.code === 2 && has(trSlow, 'gave no answer in 2 s'), trSlow);
check('I5 no model to call is exit 2 and said plainly', trGone.code === 2 && has(trGone, 'not installed'), trGone);
// the first contact: what the tool is, a file that is not there, a file that is not a notebook
const [help, bare, nope, prose] = await Promise.all([cli(['--help']), cli([]), cli(['nope.rofl.md']), cli(['README.md'])]);
check('C1 --help is the cheat sheet, exit 0; no arguments, the same and exit 2', help.code === 0 && ['```natural', 'whynot', 'excise', 'Exit: 0', 'ROFL_NB_DAEMON=0', 'review.rofl.md'].every((w) => has(help, w)) && bare.code === 2 && has(bare, 'whynot'), help);
check('C2 a notebook that is not there is named, exit 2', nope.code === 2 && has(nope, 'nope.rofl.md: no such file') && !has(nope, 'ENOENT'), nope);
check('C3 a file that is not a .rofl.md is refused in one line, exit 2', prose.code === 2 && has(prose, 'not a notebook') && prose.out.split('\n').filter((l) => l.includes('README.md')).length === 1, prose);
check('a cell edit over kept code answers what the whole world answers (scripts/nb_layers.ts)', layered.code === 0 && /^same$/m.test(layered.out), layered);
for (const g of ['model', 'asked', 'kernel', 'why']) check(`  and with its ${g} guard spoilt, it does not`, new RegExp(`^--break ${g}: differ: ${g}$`, 'm').test(layered.out), layered);
check('the kept kernel answers what a fresh process answers: first run, a cell edit, a code edit, after kill -9', keptOk.every((s) => s.daemon.r === s.fresh.r) && keptOk[1].daemon.load === 0 && keptOk[0].fresh.r !== keptOk[1].fresh.r && keptOk[1].fresh.r !== keptOk[2].fresh.r, { code: 0, out: JSON.stringify(keptOk.map((s) => [s.daemon.load, s.daemon.r === s.fresh.r, s.daemon.r.slice(0, 300), s.fresh.r.slice(0, 300)])) });
check('  and a kept kernel blind to the code files, it does not', keptStale[2].daemon.r !== keptStale[2].fresh.r && keptStale[1].daemon.r === keptStale[1].fresh.r, { code: 0, out: JSON.stringify(keptStale.map((s) => s.daemon.r === s.fresh.r)) });
const retire = await retired;
check('an engine edit leaves one daemon per tree: the new one retires the old', retire.code === 0 && retire.out === 'before the edit: 1 daemons, sockets 1; after: 1 daemons, sockets 1', retire);
check('a notebook is a world the goldens load, each of them', ['notebook_review', 'notebook_small', 'notebook_self', 'notebook_xdir'].every((n) => worlds().some((w) => w.name === n)));

for (const [name, ok, why] of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${why ? `\n${why.replace(/^/gm, '     ')}` : ''}`);
const bad2 = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - bad2}/${results.length} notebook checks, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(bad2 ? 1 : 0);

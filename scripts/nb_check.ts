// npm run test:nb — the notebook's behavioural gate (what runs around the kernel is npm run test:nb:product): the example notebooks by exit code and a few answer lines, and planted defects that must
// turn it red. The invariants it stands for are named in examples/notebook/self.rofl.md; each check below names its own.
import { chmodSync, existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { NbLine } from '../notebook/kernel.ts';
import { check, cli, fake, good, has, is, linked, mutate, NB, planted, put, report, REVIEW, ROOT, smallJs, spinning, spy, tmp, verdict, withCell, withNatural, type Out } from './nb_lib.ts';

const t0 = performance.now();

// the planted defects' trees
// every defect a run of this file must turn red goes into one copy of the code, each on its own line, so one run names them all
const runLine = /^  const r = kernel\.run\(path\.relative\(ROOT, path\.resolve\(file\)\), text, input\);/m;
const redFile = planted('red', 'self.rofl.md', (t) => t, [
  ['notebook/world.ts', mutate('notebook/world.ts', /^  const b = readBook\(/m, (m) => `  console.log('read');\n${m}`)],
  ['notebook/kernel.ts', mutate('notebook/kernel.ts', /^export class Kernel \{/m, (m) => `import { readFileSync } from 'node:fs';\nexport const peek = (f: string) => readFileSync(f, 'utf8');\n\n${m}`)],
  ['notebook/front.ts', mutate('notebook/front.ts', /^export function normal\(p: string\): string \{/m, (m) => `${m}\n  if (!p) process.exit(3);`)],
  ['notebook/cli.ts', mutate('notebook/cli.ts', runLine, (m) => `${m}\n  writeFileSync(file, text + JSON.stringify(r));\n  spawn('claude', ['-p', 'check this']);`)],
  ['notebook/reader.ts', mutate('notebook/reader.ts', /^export const readable = /m, (m) => `export const leak = (f: string) => openSync(f, 'w');\n${m}`)],
  ['notebook/model.ts', mutate('notebook/model.ts', /^  const runnable = /m, (m) => `  spawn('which', [bin]);\n${m}`)],
  ['vscode/worker.ts', mutate('vscode/worker.ts', /const r = runFile\(file, kernel, text, unsaved\);/, (m) => `${m} translateText(file, text, llm, kernel);`)],
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
// and a name in a question over code: a node is not its name, so a never over the name could only hold
const recursion = planted('recursion', 'small.rofl.md', withCell('never `spin` calls `spin`\nnever `nosuchfunction` calls some function\nnever F calls F'), [['examples/notebook/small.js', spinning]]);
const natural = planted('natural', 'review.rofl.md', withNatural);
const unparsed = planted('unparsed', 'review.rofl.md', withCell('whynot calls itself(c2)\nwhy calls itself(c2)', 'datalog'));
// the command line run from a tree whose kernel exits 0 before it answers: a gate executed by the code it checks
const exec = linked('exec', 'notebook/kernel.ts', mutate('notebook/kernel.ts', /^  run\(path: string, text: string, input: Inputs\): NbResult \{/m, (m) => `${m}\n    new Function('return process')().exit(0);`));
const bad = fake('bad.sh', '```rofl\nA module M is gloriously unowned whenever nobody.\n```');
const translateOk = planted('tr-ok', 'review.rofl.md', withNatural);
const translateBad = planted('tr-bad', 'review.rofl.md', withNatural);
const translateGone = planted('tr-gone', 'review.rofl.md', withNatural);
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
// a relative require the model cannot resolve: the never over the rest holds only as far as the model sees
const cjsLost = planted('cjs-lost', 'cjs.rofl.md', (t) => t, [['examples/notebook/cjs/cart.js', `${readFileSync(path.join(NB, 'cjs/cart.js'), 'utf8')}\nexports.tax = require('./missing');\n`], ['examples/notebook/cjs/package.json', readFileSync(path.join(NB, 'cjs/package.json'), 'utf8')]]);
// a name misspelt in a world, and one only a cell's rule mentions
const misspelt = planted('misspelt', 'review.rofl.md', withCell('A change C is escalated if C is blocked by `legal`.\n\nnever C is blocked by `legal`\nnever C is blocked by `paymnets`'));
// a rule that climbs for ever
const runaway = path.join(tmp, 'runaway/runaway.rofl.md');
put(runaway, '```datalog\nn(0).\nn(Y) :- n(X), Y is X + 1.\n\n? n(5)\n```\n');

const before = (f: string) => readFileSync(f, 'utf8');
const reviewText = before(REVIEW), selfText = before(path.join(NB, 'self.rofl.md')), naturalText = before(natural), badText = before(translateBad);

// what an outside user met on unfamiliar code
const kept2 = smallJs + "\nexport async function keep() {\n  const p = load('c');\n  return p;\n}\n\nclass Cache {\n  async #fetch(k) { return k; }\n  get(k) { this.#fetch(k); }\n}\n";
const outsider = planted('outsider', 'small.rofl.md', (t) => withCell('A function F is risky if F contains a throw T.\n\n? F is risky')(t.replace('  - small.js', '  - small.js\n  - broken.js')),
  [['examples/notebook/small.js', kept2], ['examples/notebook/broken.js', 'export function (\n']]);
const lines3 = planted('lines3', 'review.rofl.md', withCell('A change C is lonely if C is written by some person.\nA team T is busy if some change is blocked by T.\nA change C is idle if C is written by some person, unless C is blocked by some team.\n\n? C is lonely\n? T is busy\n? C is idle'));
const partial = planted('tr-part', 'review.rofl.md', (t) => `${withNatural(t)}\n\`\`\`natural\n  \n\`\`\`\n\n\`\`\`natural\nEvery change is approved.\n\`\`\`\n`);
const none = planted('tr-none', 'review.rofl.md', (t) => t);
const once = path.join(tmp, 'once.sh'), count = path.join(tmp, 'once.count');
writeFileSync(once, `#!/bin/sh\ncat > /dev/null\necho x >> ${count}\n[ $(wc -l < ${count}) -gt 1 ] && exec sleep 30\ncat <<'EOF'\n\`\`\`rofl\nA module M is unowned if some change touches M, unless some team owns M.\n\nnever M is unowned\n\`\`\`\nEOF\n`); chmodSync(once, 0o755);
// every run a check reads, started only when a check chosen reads it; the three over the self notebook's size first, so that each is the first of a shard
const RUNS: Record<string, () => Promise<Out>> = {
  self: () => cli([path.join(NB, 'self.rofl.md'), '--json'], { ROFL_NB_CLAUDE: spy }),
  red: () => cli([redFile]),
  blind: () => cli([blindFile, '--json']),
  review: () => cli([REVIEW], { ROFL_NB_CLAUDE: spy }),
  small: () => cli([path.join(NB, 'small.rofl.md')]),
  reviewJson: () => cli([REVIEW, '--json']),
  fails: () => cli([failing]),
  notRead: () => cli([unread]),
  rewrite: () => cli([loose]),
  extended: () => cli([extend]),
  collided: () => cli([collide]),
  recurse: () => cli([recursion]),
  unpop: () => cli([unpopulated]),
  early: () => cli([path.join(exec, 'examples/notebook/review.rofl.md')], {}, exec),
  nat: () => cli([natural]),
  trOk: () => cli(['translate', translateOk], { ROFL_NB_CLAUDE: good }),
  trBad: () => cli(['translate', translateBad], { ROFL_NB_CLAUDE: bad }),
  trGone: () => cli(['translate', translateGone], { ROFL_NB_CLAUDE: path.join(tmp, 'no-such-claude') }),
  unparsedOut: () => cli([unparsed]),
  fr: () => cli([friction]),
  badRead: () => cli([path.join(tmp, 'badread/examples/notebook/badread.rofl.md')]),
  trSlow: () => cli(['translate', translateSlow], { ROFL_NB_CLAUDE: slow, ROFL_NB_MODEL_TIMEOUT: '2' }),
  spat: () => cli([path.join(NB, 'spat.rofl.md')]),
  ex: () => cli([excised, '--json']),
  wo: () => cli([without, '--json']),
  hol: () => cli([holey]),
  xdir: () => cli([path.join(NB, 'xdir.rofl.md')]),
  xdirFails: () => cli([xdirRed]),
  cjs: () => cli([path.join(NB, 'cjs.rofl.md')]),
  cjsBlind: () => cli([cjsLost]),
  climb: () => cli([runaway], { ROFL_NB_LIMIT: '3' }),
  heavy: () => cli([runaway], { ROFL_NB_LIMIT: '100', ROFL_NB_MEMORY: '0.3' }),
  nmWorld: () => cli([misspelt]),
  out: () => cli([outsider]),
  three: () => cli([lines3]),
  part: () => cli(['translate', partial], { ROFL_NB_CLAUDE: once, ROFL_NB_MODEL_TIMEOUT: '3' }),
  nothing: () => cli(['translate', none]),
};
let review!: Out, small!: Out, self!: Out, reviewJson!: Out, fails!: Out, notRead!: Out, rewrite!: Out, extended!: Out, collided!: Out, recurse!: Out, red!: Out, blind!: Out, unpop!: Out, early!: Out, nat!: Out, trOk!: Out, trBad!: Out, trGone!: Out, unparsedOut!: Out, fr!: Out, badRead!: Out, trSlow!: Out, spat!: Out, ex!: Out, wo!: Out, hol!: Out, xdir!: Out, xdirFails!: Out, cjs!: Out, cjsBlind!: Out, climb!: Out, heavy!: Out, nmWorld!: Out, out!: Out, three!: Out, part!: Out, nothing!: Out;
type Test = { name: string; needs: string[]; ok: () => boolean; o?: () => Out };
const TESTS: Test[] = [];
/** A check, by the runs it reads; it is judged once they are done. */
const test = (name: string, needs: string[], ok: () => boolean, o?: () => Out) => void TESTS.push({ name, needs, ok, o });


test('review: exit 0 and its answers', ['review'], () => is(review, 0) && has(review, '`c2` is blocked by `platform`') && has(review, 'never C is blocked by `payments`  ->  holds'), () => review);
test('review: whynot answers', ['review'], () => has(review, 'it stops at: not `c2` is blocked by some team, and `c2` is blocked by `platform` does'), () => review);
test('small: exit 0, an answer at its file:line', ['small'], () => is(small, 0) && has(small, '[load() at small.js:7] is unawaited') && has(small, 'never C recurses  ->  holds'), () => small);
/** The rows a run could not see, and those outside the boundary I6 step 4 names: imports into the unscanned engine, reader, scanner and proof folder, and calls on keys pinned here. */
const BOUNDARY = [/"(\.\.\/src\/|\.\.\/scripts\/|\.\.\/scanners\/|\.\/fold\.ts)/, /^unseen\(\w+, "(get|fork|assert)"\)$/];
const unseen = (o: Out) => { const r = JSON.parse(o.stdout ?? ''); return r.cells.flatMap((c: { lines: { unsure?: { answers: { literal: string; sentence: string }[] } }[] }) => c.lines.flatMap((l) => l.unsure?.answers ?? [])) as { literal: string; sentence: string }[]; };
const outside = (o: Out) => { try { return unseen(o).filter((a) => !BOUNDARY.some((b) => b.test(a.literal))); } catch { return [{ literal: 'no JSON', sentence: o.out.slice(-300) }]; } };
test('self: exit 3 (the gate): every never holds, some as far as it sees', ['self'], () => is(self, 3) && unseen(self).length > 0, () => self);
test('I3 every row self cannot see is of a kind I6 names', ['self'], () => outside(self).length === 0, () => ({ code: self.code, out: JSON.stringify(outside(self)) }));
test('I6 a print planted in the kernel turns self red', ['red'], () => is(red, 1) && has(red, 'console.log() at notebook/world.ts'), () => red);
test('I6 a node:fs import and read planted in the kernel turns self red', ['red'], () => is(red, 1) && has(red, 'readFileSync() at notebook/kernel.ts'), () => red);
test('I6 an exit planted in the kernel turns self red', ['red'], () => is(red, 1) && has(red, 'process.exit() at notebook/front.ts'), () => red);
test('I4 a write planted in a run turns self red', ['red'], () => is(red, 1) && has(red, 'never C writes outside translation  ->  FAILS'), () => red);
test('I4 a file opened to write beside the repository reads, in notebook/reader.ts, turns self red (one opened to read does not)', ['red'], () => is(red, 1) && /\[openSync\(\) at notebook\/reader\.ts:\d+\] writes outside translation/.test(red.out) && (red.out.match(/openSync\(\) at notebook\/reader\.ts/g) ?? []).length === 1, () => red);
test('I5 a process started in a run turns self red', ['red'], () => is(red, 1) && has(red, 'never C starts a process outside the model call  ->  FAILS'), () => red);
test('I5 a process started beside the harness call, in notebook/model.ts, turns self red', ['red'], () => is(red, 1) && /\[spawn\(\) at notebook\/model\.ts:\d+\] starts a process outside the model call/.test(red.out), () => red);
test('I5 the model handed over on the editor\'s run path turns self red', ['red'], () => is(red, 1) && /\[translateText\(\) at vscode\/worker\.ts:\d+\] hands the model over outside translation/.test(red.out), () => red);
test('I3 a dynamic import of node:fs in the kernel is named out of sight, outside the boundary', ['blind'], () => is(blind, 3) && outside(blind).some((a) => /import\(\)/.test(a.literal) && /notebook\/kernel\.ts:\d+/.test(a.sentence)) && outside(blind).some((a) => /"readFileSync"/.test(a.literal)), () => ({ code: blind.code, out: JSON.stringify(outside(blind)) }));
test('I3 a computed globalThis["process"] write in the kernel is named out of sight, outside the boundary', ['blind'], () => is(blind, 3) && outside(blind).some((a) => /"write"/.test(a.literal) && /notebook\/kernel\.ts:\d+/.test(a.sentence)), () => ({ code: blind.code, out: JSON.stringify(outside(blind)) }));
test('I2 a kernel that exits early is not green', ['early'], () => early.code === 0 && verdict(early) === null && !is(early, 0), () => early);
test('I1 a never over a relation nothing can populate fails with the reason', ['unpop'], () => is(unpop, 1) && has(unpop, 'FAILS · 0 · nothing in the model can put a row here'), () => unpop);
test('I2 a failing never is exit 1 and names its row', ['fails'], () => is(fails, 1) && has(fails, 'FAILS · 1') && has(fails, '`c2` is blocked by `platform`'), () => fails);
test('I2 an unread cell is exit 2 and named', ['notRead'], () => is(notRead, 2) && has(notRead, 'not read: C wibbles the moon'), () => notRead);
test('I2 a failing never over code is exit 1', ['recurse'], () => is(recurse, 1) && has(recurse, 'never C recurses  ->  FAILS · 1') && has(recurse, 'small.js:12'), () => recurse);
test('I7 a cell concluding a model sentence with a loose variable is refused, exit 2', ['rewrite'], () => is(rewrite, 2) && has(rewrite, 'would rewrite the model'), () => rewrite);
test('I7 a bound conclusion into a model relation, marked `extends`, is allowed and labelled', ['extended'], () => is(extended, 1) && has(extended, '`c1` is blocked by `payments`') && has(extended, "note: extends the model's blocked"), () => extended);
test('I7 the same conclusion without the marker is refused, naming the sentence it collided with', ['collided'], () => is(collided, 2) && has(collided, 'lands in the model\'s own sentence "C is blocked by T" (blocked)') && has(collided, 'extends blocked') && !has(collided, '`c1` is blocked by `payments`'), () => collided);
test('B a never in a cell whose rule was left out is not asked, not FAILS or holds', ['fr'], () => is(fr, 2) && has(fr, 'never C is stalled  ->  not asked') && !has(fr, 'never C is stalled  ->  FAILS') && !has(fr, 'never C is stalled  ->  holds'), () => fr);
test('B a never resting on a relation nothing defines is not asked and says which', ['fr'], () => has(fr, 'never held_up(C)  ->  not asked: it rests on stalled, which nothing defines'), () => fr);
test('I1 a whynot that does not parse is an error of its cell, a why says so on its line, the other cells still answer, exit 2', ['unparsedOut'], () => is(unparsedOut, 2) && has(unparsedOut, 'error: whynot calls itself(c2): ') && /why calls itself\(c2\)\n +line 1: expected/.test(unparsedOut.out) && has(unparsedOut, '`c2` is blocked by `platform`'), () => unparsedOut);
test('I1 an untranslated natural cell is named, not dropped', ['nat'], () => is(nat, 0) && has(nat, 'not translated yet'), () => nat);
test('xdir: a call reaches across directories, through a barrel and a TypeScript `.js` specifier', ['xdir'], () => is(xdir, 0) && has(xdir, '? handler(F, N)  ->  3 answers') && has(xdir, 'never undispatched(N)  ->  holds') && has(xdir, 'calls [function keys() at xdir/lib/store.ts:3]'), () => xdir);
test('  and a handler the barrel stops re-exporting is named', ['xdirFails'], () => is(xdirFails, 1) && has(xdirFails, 'never undispatched(N)  ->  FAILS · 1') && has(xdirFails, 'undispatched("handleList")'), () => xdirFails);
test('cjs: calls and depends cross files through require, module.exports and exports.a', ['cjs'], () => is(cjs, 0) && has(cjs, 'never unreached(N)  ->  holds') && has(cjs, '"cjs/index.js" depends on "cjs/format.js"') && has(cjs, '"cjs/index.js" depends on "cjs/package.json"') && !has(cjs, 'not resolved'), () => cjs);
test('I3 a relative require that resolves to no file makes a holding never blind, exit 3, and the head names it', ['cjsBlind'], () => is(cjsBlind, 3) && has(cjsBlind, 'note: 1 relative import or require was not resolved') && /cjs\/cart\.js:\d+ "\.\/missing"/.test(cjsBlind.out) && has(cjsBlind, 'never unreached(N)  ->  holds as far as it sees · 1 relative import or require was not resolved'), () => cjsBlind);
test('I1 every directive line of review is answered', ['reviewJson'], () => (() => { const r = JSON.parse(reviewJson.stdout ?? ''); const asked = (reviewText.match(/^(\?|never|why|whynot|unsure) /gm) ?? []).length; const said = r.cells.flatMap((c: { lines: { unsure?: unknown }[] }) => c.lines.flatMap((l) => l.unsure ? [l, l] : [l])).length; return asked === said && asked > 0; })(), () => reviewJson);
test('I4 a run writes nothing into the file', ['review', 'self', 'nat'], () => before(REVIEW) === reviewText && before(path.join(NB, 'self.rofl.md')) === selfText && before(natural) === naturalText);
test('I5 a run never calls a model', ['review', 'self'], () => !(() => { try { return readFileSync(path.join(tmp, 'called'), 'utf8').includes('spy.sh'); } catch { return false; } })());
test('I5 a translation that reads is inserted under its natural cell, which stays', ['trOk'], () => trOk.code === 0 && before(translateOk).includes('No change touches a module nobody owns.\n```\n\n```rofl\nA module M is unowned') && before(translateOk).startsWith(reviewText.slice(0, 200)), () => trOk);
test('I5 a translation that does not read after a retry is not written, exit 2', ['trBad'], () => trBad.code === 2 && before(translateBad) === badText && has(trBad, 'nothing written') && readFileSync(path.join(tmp, 'called'), 'utf8').split('\n').filter((l) => l.endsWith('bad.sh')).length === 2, () => trBad);
test('I5 translate says when the notebook reads files outside its folder, whose sentences go to the model with the request', ['trOk'], () => has(trOk, "review.rofl.md: note: reads files outside this notebook's folder: ../review.rofl.md, and what they say goes to the model with the request"), () => trOk);
test('I5 translate says on stderr before the model answers, and it is not on stdout', ['trOk', 'trBad'], () => trOk.out.includes('Claude is writing the cell (usually 30–120 s)…') && trOk.out.indexOf('usually 30–120 s') < trOk.out.indexOf('translated') && !trOk.stdout!.includes('usually 30–120 s') && trBad.out.includes('the first try did not read (') && trBad.out.includes('); asking again…') && !trBad.stdout!.includes('asking again'), () => trOk);
test('E1 a legible proof keeps every line and every fact of the engine\'s', ['reviewJson'], () => (() => {
  const r = JSON.parse(reviewJson.stdout ?? ''); const l = r.cells.flatMap((c: { lines: NbLine[] }) => c.lines).find((x: NbLine) => x.kind === 'why');
  const raw = (l?.whyRaw ?? '').split('\n'), nice = (l?.why ?? '').split('\n');
  return raw.length > 3 && raw.length === nice.length && raw.every((x: string, k: number) => !/\[axiom\]$/.test(x) || nice[k].endsWith('(given)') && nice[k].includes(x.replace(/ \[axiom\]$/, '').trim()))
    && !/@tick|\?_\$|\?\d|#\d|\[main\]/.test(l?.why ?? '');
})(), () => reviewJson);
test('E2 a relation a read world derives answers in the sentence the notebook gives it', ['spat'], () => is(spat, 1) && has(spat, 'never Ch is alone on D at S  ->  FAILS · 4') && has(spat, '- `kit` is alone on `thu` at 1060'), () => spat);
test('E3 an excise in the notebook moves the lines the same as the notebook over a world without the fact', ['ex', 'wo'], () => (() => {
  const lines = (o: Out) => JSON.parse(o.stdout ?? '').cells.flatMap((c: { lines: NbLine[] }) => c.lines) as NbLine[];
  const moved = lines(ex).find((l) => l.kind === 'excise')?.answers.filter((a) => !a.sentence.startsWith(' ')) ?? [];
  const after = new Map(lines(wo).filter((l) => l.kind !== 'excise').map((l) => [l.text, l.total]));
  const before = new Map(lines(ex).filter((l) => l.kind !== 'excise').map((l) => [l.text, l.total]));
  const said = new Map(moved.map((a) => { const m = /^(.*): (\d+) -> (\d+)$/.exec(a.sentence)!; return [m[1], [Number(m[2]), Number(m[3])]]; }));
  return moved.length > 0 && [...before].every(([t, n]) => (said.get(t)?.[0] ?? n) === n && (said.get(t)?.[1] ?? n) === after.get(t));
})(), () => ({ code: ex.code, out: (ex.stdout ?? '') + (wo.stdout ?? '') }));
test('E5 a never over a rule that met an expression it could not evaluate holds only as far as it sees', ['hol'], () => is(hol, 3) && has(hol, 'note: the rule for short name met an expression it could not evaluate') && has(hol, 'never short_name(C, L)  ->  holds as far as it sees · it rests on short name'), () => hol);
test('I1 a never over a backticked name no fact holds is blind, not holds, and says to ask by variable or by name', ['recurse'], () => has(recurse, 'never `spin` calls `spin`  ->  holds as far as it sees · `spin` names nothing in the model')
  && has(recurse, 'ask with a variable (never X calls X) or by name, as in: F answers to "spin"') && has(recurse, 'never `nosuchfunction` calls some function  ->  holds as far as it sees · `nosuchfunction` names nothing'), () => recurse);
test('  and with a variable it fails on the function that calls itself', ['recurse'], () => has(recurse, 'never F calls F  ->  FAILS · 1') && has(recurse, '[function spin() at small.js:11] calls [function spin() at small.js:11]'), () => recurse);
test('  and over a world: a misspelt name is said, one a cell\'s rule mentions is not, one a fact has is not (review)', ['nmWorld', 'review'], () => is(nmWorld, 3) && has(nmWorld, 'never C is blocked by `paymnets`  ->  holds as far as it sees · `paymnets` names nothing in the model, so this line cannot match: check the spelling')
  && has(nmWorld, 'never C is blocked by `legal`  ->  holds\n') && !has(review, 'names nothing'), () => nmWorld);
test('H2 a rule that climbs for ever stops at ROFL_NB_LIMIT, says the budget ran out and the run was cut short, exit 3', ['climb'], () => is(climb, 3) && has(climb, '? n(5)  ->  at least 1 answer, cut short · the budget ran out before every answer was found') && has(climb, 'CUT SHORT') && climb.ms! < 20_000, () => climb);
test('H2 the same runaway with the time far off stops at ROFL_NB_MEMORY gigabytes of heap instead, exit 3', ['heavy'], () => is(heavy, 3) && has(heavy, 'the budget ran out') && heavy.ms! < 30_000, () => heavy);
test('F1 an empty relation asked in one book the program writes in another says which', ['fr'], () => has(fr, 'flagged is written in [audit], not in [main]: ask flagged[audit](...)'), () => fr);
test('F2 a positional never works in a rofl cell', ['fr'], () => has(fr, 'never blocked(C, payments)  ->  holds'), () => fr);
test('F4 a datalog cell under a natural cell answers it', ['fr'], () => has(fr, 'note: answered by the cell below it') && !has(fr, 'not translated yet'), () => fr);
test('F5 a conjunctive question is refused with what to write instead', ['fr'], () => is(fr, 2) && has(fr, 'a question is one literal; write a rule that joins these'), () => fr);
test('M1 a notebook that reads a file outside its folder says so; one reading only inside does not', ['review', 'small', 'badRead'], () => has(review, "review.rofl.md: note: reads files outside this notebook's folder: ../review.rofl.md") && !has(small, 'outside this notebook') && !has(badRead, 'outside this notebook'), () => review);
test('F3 an error in a read file is at that file\'s line', ['badRead'], () => is(badRead, 2) && has(badRead, 'bad.rofl:3: unexpected character'), () => badRead);
test('F6 a model that does not answer is stopped in bounded time and said', ['trSlow'], () => trSlow.code === 2 && has(trSlow, 'gave no answer in 2 s'), () => trSlow);
const argv = () => { try { return readFileSync(path.join(tmp, 'argv'), 'utf8').trim().split('\n'); } catch { return []; } };
test('H1 the model is called with no MCP server and no settings, from a directory of its own outside the notebook\'s project, gone after', ['review', 'self', 'trOk', 'trBad'], () => argv().length > 0 && argv().every((l) => l.includes('[--tools][][--strict-mcp-config][--setting-sources][][--no-session-persistence] ') && l.includes(` ${realpathSync(os.tmpdir())}/rofl-nb-model-`) && !existsSync(l.split(' ').pop()!)), () => ({ code: 0, out: argv().join('\n') }));
test('I5 no model to call is exit 2 and said plainly', ['trGone'], () => trGone.code === 2 && has(trGone, 'not installed'), () => trGone);
const at = (s: string) => `small.js:${kept2.split('\n').findIndex((l) => l.includes(s)) + 1}]`;
test('U1 a sentence not read names the nearest the vocabulary has', ['out'], () => /not read: F contains a throw T; the nearest sentences: [^\n]*throw/.test(out.out), () => out);
test('U2 three rules one to a line are read as three', ['three'], () => is(three, 0) && has(three, '? C is lonely  ->  2 answers') && has(three, '? T is busy  ->  1 answer') && has(three, '? C is idle  ->  1 answer'), () => three);
test('U3 translate keeps the cell that landed when a later one hangs, and sends no empty cell', ['part'], () => part.code === 2 && before(partial).includes('nobody owns.\n```\n\n```rofl\nA module M is unowned') && has(part, 'an empty natural cell, skipped') && readFileSync(count, 'utf8').split('\n').length === 3, () => part);
test('U3 translate over no natural cell says so, exit 0', ['nothing'], () => nothing.code === 0 && has(nothing, 'no natural cells to translate') && before(none) === reviewText, () => nothing);
test('U4 a promise kept and returned is not unawaited; one standing as a statement is', ['out'], () => has(out, `[load() at ${at("load('b')")} is unawaited`) && !has(out, at('const p')), () => out);
test('U5 a private method call is labelled as written', ['out'], () => has(out, `[this.#fetch() at ${at('this.#fetch(k);')} is unawaited`), () => out);
test('U6 a code file that did not parse is named on the verdict line', ['out'], () => / — not everything was read: not parsed: broken\.js \(exit 2; see npm run nb -- --help\)$/.test(out.stdout!.trim()), () => out);

// `--only PATTERN` the checks whose name it matches; `--shard I/N` the I-th of N fixed parts, which together hold every check once;
// `--shards N` each part's checks, that they hold every check once, and that a part dropping one is seen to
const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const order = Object.keys(RUNS);
const home = (t: Test, n: number) => Math.min(...t.needs.map((r) => order.indexOf(r))) % n;
const parts = (n: number, at = home) => Array.from({ length: n }, (_, i) => TESTS.filter((t) => at(t, n) === i));
const whole = (ps: Test[][]) => ps.flat().length === TESTS.length && new Set(ps.flat()).size === TESTS.length;
const shards = Number(arg('--shards') ?? 0), shard = arg('--shard'), only = arg('--only');
if (shards) {
  parts(shards).forEach((p, i) => console.log(`shard ${i + 1}/${shards}: ${p.length} checks, runs ${[...new Set(p.flatMap((t) => t.needs))].join(' ')}\n${p.map((t) => `  ${t.name}`).join('\n')}`));
  const dropped = !whole(parts(shards, (t, n) => t === TESTS[0] ? -1 : home(t, n)));
  console.log(`${whole(parts(shards)) ? 'ok  ' : 'FAIL'} the ${shards} shards hold each of the ${TESTS.length} checks once\n${dropped ? 'ok  ' : 'FAIL'} a partition that drops a check is seen to`);
  process.exit(whole(parts(shards)) && dropped ? 0 : 1);
}
let chosen = TESTS;
if (shard) {
  const [i, n] = shard.split('/').map(Number);
  if (!(i >= 1 && i <= n)) throw new Error(`--shard takes I/N with 1 <= I <= N, not ${shard}`);
  if (!whole(parts(n))) throw new Error(`the ${n} shards do not hold each check once: npm run test:nb -- --shards ${n}`);
  chosen = parts(n)[i - 1];
}
if (only) chosen = chosen.filter((t) => new RegExp(only).test(t.name));
const got: Record<string, Out> = Object.fromEntries(await Promise.all([...new Set(chosen.flatMap((t) => t.needs))].map(async (r) => [r, await RUNS[r]()])));
({ review, small, self, reviewJson, fails, notRead, rewrite, extended, collided, recurse, red, blind, unpop, early, nat, trOk, trBad, trGone, unparsedOut, fr, badRead, trSlow, spat, ex, wo, hol, xdir, xdirFails, cjs, cjsBlind, climb, heavy, nmWorld, out, three, part, nothing } = got);
for (const t of chosen) {
  let ok = false, o: Out | undefined;
  try { ok = t.ok(); o = t.o?.(); } catch (e) { o = { code: -1, out: `the check threw, a run it reads not named among its needs? ${(e as Error).stack}` }; }
  check(t.name, ok, o);
}
report(`notebook checks${shard ? `, shard ${shard}` : ''}${only ? `, matching ${only}` : ''}`, t0);

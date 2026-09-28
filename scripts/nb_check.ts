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

const [review, small, self, reviewJson, fails, notRead, rewrite, extended, collided, recurse, red, blind, unpop, early, nat, trOk, trBad, trGone, unparsedOut, fr, badRead, trSlow, spat, ex, wo, hol, xdir, xdirFails, cjs, cjsBlind, climb, heavy, nmWorld] = await Promise.all([
  cli([REVIEW], { ROFL_NB_CLAUDE: spy }), cli([path.join(NB, 'small.rofl.md')]), cli([path.join(NB, 'self.rofl.md'), '--json'], { ROFL_NB_CLAUDE: spy }), cli([REVIEW, '--json']),
  cli([failing]), cli([unread]), cli([loose]), cli([extend]), cli([collide]), cli([recursion]), cli([redFile]), cli([blindFile, '--json']), cli([unpopulated]), cli([path.join(exec, 'examples/notebook/review.rofl.md')], {}, exec), cli([natural]),
  cli(['translate', translateOk], { ROFL_NB_CLAUDE: good }), cli(['translate', translateBad], { ROFL_NB_CLAUDE: bad }), cli(['translate', translateGone], { ROFL_NB_CLAUDE: path.join(tmp, 'no-such-claude') }), cli([unparsed]),
  cli([friction]), cli([path.join(tmp, 'badread/examples/notebook/badread.rofl.md')]), cli(['translate', translateSlow], { ROFL_NB_CLAUDE: slow, ROFL_NB_MODEL_TIMEOUT: '2' }),
  cli([path.join(NB, 'spat.rofl.md')]), cli([excised, '--json']), cli([without, '--json']), cli([holey]),
  cli([path.join(NB, 'xdir.rofl.md')]), cli([xdirRed]), cli([path.join(NB, 'cjs.rofl.md')]), cli([cjsLost]), cli([runaway], { ROFL_NB_LIMIT: '3' }), cli([runaway], { ROFL_NB_LIMIT: '100', ROFL_NB_MEMORY: '0.3' }),
  cli([misspelt]),
]);


check('review: exit 0 and its answers', is(review, 0) && has(review, '`c2` is blocked by `platform`') && has(review, 'never C is blocked by `payments`  ->  holds'), review);
check('review: whynot answers', has(review, 'it stops at: not `c2` is blocked by some team, and `c2` is blocked by `platform` does'), review);
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
check('I5 a process started beside the harness call, in notebook/model.ts, turns self red', is(red, 1) && /\[spawn\(\) at notebook\/model\.ts:\d+\] starts a process outside the model call/.test(red.out), red);
check('I5 the model handed over on the editor\'s run path turns self red', is(red, 1) && has(red, '[translateText() at vscode/worker.ts:9] hands the model over outside translation'), red);
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
check('cjs: calls and depends cross files through require, module.exports and exports.a', is(cjs, 0) && has(cjs, 'never unreached(N)  ->  holds') && has(cjs, '"cjs/index.js" depends on "cjs/format.js"') && has(cjs, '"cjs/index.js" depends on "cjs/package.json"') && !has(cjs, 'not resolved'), cjs);
check('I3 a relative require that resolves to no file makes a holding never blind, exit 3, and the head names it', is(cjsBlind, 3) && has(cjsBlind, 'note: 1 relative import or require was not resolved') && /cjs\/cart\.js:\d+ "\.\/missing"/.test(cjsBlind.out) && has(cjsBlind, 'never unreached(N)  ->  holds as far as it sees · 1 relative import or require was not resolved'), cjsBlind);
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
    && !/@tick|\?_\$|\?\d|#\d|\[main\]/.test(l?.why ?? '');
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
check('I1 a never over a backticked name no fact holds is blind, not holds, and says to ask by variable or by name', has(recurse, 'never `spin` calls `spin`  ->  holds as far as it sees · `spin` names nothing in the model')
  && has(recurse, 'ask with a variable (never X calls X) or by name, as in: F answers to "spin"') && has(recurse, 'never `nosuchfunction` calls some function  ->  holds as far as it sees · `nosuchfunction` names nothing'), recurse);
check('  and with a variable it fails on the function that calls itself', has(recurse, 'never F calls F  ->  FAILS · 1') && has(recurse, '[function spin() at small.js:11] calls [function spin() at small.js:11]'), recurse);
check('  and over a world: a misspelt name is said, one a cell\'s rule mentions is not, one a fact has is not (review)', is(nmWorld, 3) && has(nmWorld, 'never C is blocked by `paymnets`  ->  holds as far as it sees · `paymnets` names nothing in the model, so this line cannot match: check the spelling')
  && has(nmWorld, 'never C is blocked by `legal`  ->  holds\n') && !has(review, 'names nothing'), nmWorld);
check('H2 a rule that climbs for ever stops at ROFL_NB_LIMIT, says the budget ran out, exit 3', is(climb, 3) && has(climb, '? n(5)  ->  1 answer · the budget ran out before every answer was found') && climb.ms! < 20_000, climb);
check('H2 the same runaway with the time far off stops at ROFL_NB_MEMORY gigabytes of heap instead, exit 3', is(heavy, 3) && has(heavy, 'the budget ran out') && heavy.ms! < 30_000, heavy);
check('F1 an empty relation asked in one book the program writes in another says which', has(fr, 'flagged is written in [audit], not in [main]: ask flagged[audit](...)'), fr);
check('F2 a positional never works in a rofl cell', has(fr, 'never blocked(C, payments)  ->  holds'), fr);
check('F4 a datalog cell under a natural cell answers it', has(fr, 'note: answered by the cell below it') && !has(fr, 'not translated yet'), fr);
check('F5 a conjunctive question is refused with what to write instead', is(fr, 2) && has(fr, 'a question is one literal; write a rule that joins these'), fr);
check('M1 a notebook that reads a file outside its folder says so; one reading only inside does not', has(review, "review.rofl.md: note: reads files outside this notebook's folder: ../review.rofl.md") && !has(small, 'outside this notebook') && !has(badRead, 'outside this notebook'), review);
check('F3 an error in a read file is at that file\'s line', is(badRead, 2) && has(badRead, 'bad.rofl:3: unexpected character'), badRead);
check('F6 a model that does not answer is stopped in bounded time and said', trSlow.code === 2 && has(trSlow, 'gave no answer in 2 s'), trSlow);
const argv = (() => { try { return readFileSync(path.join(tmp, 'argv'), 'utf8').trim().split('\n'); } catch { return []; } })();
check('H1 the model is called with no MCP server and no settings, from a directory of its own outside the notebook\'s project, gone after', argv.length > 0 && argv.every((l) => l.includes('[--tools][][--strict-mcp-config][--setting-sources][] ') && l.includes(` ${realpathSync(os.tmpdir())}/rofl-nb-model-`) && !existsSync(l.split(' ').pop()!)), { code: 0, out: argv.join('\n') });
check('I5 no model to call is exit 2 and said plainly', trGone.code === 2 && has(trGone, 'not installed'), trGone);


// what an outside user met on unfamiliar code
const kept2 = smallJs + "\nexport async function keep() {\n  const p = load('c');\n  return p;\n}\n\nclass Cache {\n  async #fetch(k) { return k; }\n  get(k) { this.#fetch(k); }\n}\n";
const outsider = planted('outsider', 'small.rofl.md', (t) => withCell('A function F is risky if F contains a throw T.\n\n? F is risky')(t.replace('  - small.js', '  - small.js\n  - broken.js')),
  [['examples/notebook/small.js', kept2], ['examples/notebook/broken.js', 'export function (\n']]);
const lines3 = planted('lines3', 'review.rofl.md', withCell('A change C is lonely if C is written by some person.\nA team T is busy if some change is blocked by T.\nA change C is idle if C is written by some person, unless C is blocked by some team.\n\n? C is lonely\n? T is busy\n? C is idle'));
const partial = planted('tr-part', 'review.rofl.md', (t) => `${withNatural(t)}\n\`\`\`natural\n  \n\`\`\`\n\n\`\`\`natural\nEvery change is approved.\n\`\`\`\n`);
const none = planted('tr-none', 'review.rofl.md', (t) => t);
const once = path.join(tmp, 'once.sh'), count = path.join(tmp, 'once.count');
writeFileSync(once, `#!/bin/sh\ncat > /dev/null\necho x >> ${count}\n[ $(wc -l < ${count}) -gt 1 ] && exec sleep 30\ncat <<'EOF'\n\`\`\`rofl\nA module M is unowned if some change touches M, unless some team owns M.\n\nnever M is unowned\n\`\`\`\nEOF\n`); chmodSync(once, 0o755);
const [out, three, part, nothing] = await Promise.all([cli([outsider]), cli([lines3]), cli(['translate', partial], { ROFL_NB_CLAUDE: once, ROFL_NB_MODEL_TIMEOUT: '3' }), cli(['translate', none])]);
const at = (s: string) => `small.js:${kept2.split('\n').findIndex((l) => l.includes(s)) + 1}]`;
check('U1 a sentence not read names the nearest the vocabulary has', /not read: F contains a throw T; the nearest sentences: [^\n]*throw/.test(out.out), out);
check('U2 three rules one to a line are read as three', is(three, 0) && has(three, '? C is lonely  ->  2 answers') && has(three, '? T is busy  ->  1 answer') && has(three, '? C is idle  ->  1 answer'), three);
check('U3 translate keeps the cell that landed when a later one hangs, and sends no empty cell', part.code === 2 && before(partial).includes('nobody owns.\n```\n\n```rofl\nA module M is unowned') && has(part, 'an empty natural cell, skipped') && readFileSync(count, 'utf8').split('\n').length === 3, part);
check('U3 translate over no natural cell says so, exit 0', nothing.code === 0 && has(nothing, 'no natural cells to translate') && before(none) === reviewText, nothing);
check('U4 a promise kept and returned is not unawaited; one standing as a statement is', has(out, `[load() at ${at("load('b')")} is unawaited`) && !has(out, at('const p')), out);
check('U5 a private method call is labelled as written', has(out, `[this.#fetch() at ${at('this.#fetch(k);')} is unawaited`), out);
check('U6 a code file that did not parse is named on the verdict line', / — not everything was read: not parsed: broken\.js \(exit 2; see npm run nb -- --help\)$/.test(out.stdout!.trim()), out);

// what a newcomer meets, each where the output could mislead: a bare word where a name goes, the engine's words in a proof, a list the reader does not claim,
// a what-if counted as answers, a natural cell answered by a cell in another section, a note that calls a cell above "further down", a world with no cells
const newcomer = path.join(tmp, 'newcomer/newcomer.rofl.md'), world = path.join(tmp, 'newcomer/world.rofl.md');
put(newcomer, `---
model: none
---

Declared as facts:

- <a id="on_the_line"></a>A car X is on the line
- <a id="short_of"></a>A car X is short of a part P
- <a id="in_stock"></a>A part P is in stock
- <a id="to_be_painted"></a>A car X is to be painted a colour C

The cars:

- \`car\` is on the line.
- \`van\` is on the line.
- \`van\` is short of \`door\`.
- \`car\` is to be painted \`pink\`.
- bike is on the line.
- \`level 1\` is on the line.

> The quoted cars:

- \`bus\` is on the line.

<a id="comes_out"></a>A car X comes out a colour C if X is to be painted C and C is in stock.

A car X passes the gate if X leaves the line.

\`\`\`rofl
A car X leaves the line if X is on the line, unless X is short of some part.
? X leaves the line
never X comes out white
why \`car\` leaves the line
whynot \`cab\` is in stock
excise \`van\` is short of \`door\`
\`\`\`

\`\`\`natural
list the cars
\`\`\`

## Later

\`\`\`rofl
? X passes the gate
\`\`\`
`);
put(world, readFileSync(path.join(ROOT, 'examples/review.rofl.md'), 'utf8'));
const [nc, ncTimed, wd, vocab, vocab0] = await Promise.all([cli([newcomer]), cli([newcomer, '--timing']), cli([world]), cli(['vocab']), cli(['vocab', 'unawaited'])]);
check('N1 a bare word where a name goes says to put it in backticks, in a question and in a list', has(nc, 'never X comes out white: white is not a sentence word here: names go in backticks: `white`') && has(nc, 'bike is on the line: bike is not a sentence word here'), nc);
check('N2 a proof has no engine variable: a blank is some <noun>, a relation is its sentence', has(nc, 'not `car` is short of some part (nothing says so)') && has(nc, 'nothing says `cab` is in stock, and no rule concludes it') && !/\?\d|no rule concludes '/.test(nc.out), nc);
check('N3 a list the reader does not claim, and a name with a space, are said in the writer\'s words', has(nc, 'a list of facts goes under a plain line of its own ending in a colon') && has(nc, '`level 1` is not a name') && !/LIST|FACT|line \d+: expected/.test(nc.out), nc);
check('N4 an excise counts the lines that move, and they are not answers', has(nc, 'excise `van` is short of `door`  ->  2 lines move') && has(nc, '\n    ? X leaves the line: 1 -> 2\n      now also: `van` leaves the line'), nc);
check('N5 a natural cell is not answered by a cell in another section; a prose rule over a cell above it is not "further down"', has(nc, 'note: not translated yet') && !has(nc, 'further down'), nc);
check('N6 the last line counts what was asked and, off exit 0, says why and the code; timings only with --timing', is(nc, 2) && /: 2 questions answered, 2 explained, 1 what-if — not everything was read \(exit 2; see npm run nb -- --help\)$/.test(nc.stdout!.trim())
  && !/^load \d+ ms/m.test(nc.out) && /^load \d+ ms/m.test(ncTimed.out) && has(fails, '— FAILS at line '), nc);
check('N7 a world with no cells says so, exit 0', is(wd, 0) && has(wd, '0 cells: this is a world (facts and rules), not a notebook'), wd);
check('N8 vocab starts with a few sentences to start from, then by area; a word it lacks names the nearest', vocab.code === 0 && vocab.stdout!.startsWith('Start here') && has(vocab, 'are not listed here') && has(vocab, '\ncallgraph: resolution\n') && has(vocab, '\n  a call C resolves to a function F   (resolves)\n')
  && vocab0.code === 0 && has(vocab0, '0 sentences with "unawaited"') && /The nearest: [^\n]*await/.test(vocab0.out), vocab0);

report('notebook checks', t0);

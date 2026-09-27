// npm run test:nb — the notebook's behavioural gate: the example notebooks by exit code and a few answer lines, and planted defects that must
// turn it red. The invariants it stands for are named in examples/notebook/self.rofl.md; each check below names its own.
import { spawn } from 'node:child_process';
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
const cli = (args: string[], env: Record<string, string> = {}, root = ROOT): Promise<Out> => new Promise((done) => {
  const p = spawn(process.execPath, ['--experimental-strip-types', path.join(root, 'notebook/cli.ts'), ...args], { env: { ...process.env, ...env } });
  let out = '', stdout = '';
  p.stdout.on('data', (d) => { out += d; stdout += d; }); p.stderr.on('data', (d) => { out += d; });
  const kill = setTimeout(() => p.kill(), 280_000);
  p.on('close', (code) => { clearTimeout(kill); done({ code: code ?? -1, out, stdout }); });
});

/** A copy of a notebook, with its text changed, next to what it names. */
function planted(name: string, from: string, change: (t: string) => string, also: [string, string][] = []): string {
  const dir = path.join(tmp, name, 'examples/notebook'); mkdirSync(dir, { recursive: true });
  for (const [src, edit] of also) { const to = path.join(tmp, name, src); mkdirSync(path.dirname(to), { recursive: true }); writeFileSync(to, edit); }
  const file = path.join(dir, path.basename(from));
  writeFileSync(file, change(readFileSync(path.join(NB, from), 'utf8')));
  return file;
}
/** A source with one planted line; a pattern that no longer matches is a check that plants nothing, so it throws. */
function mutate(file: string, at: RegExp, plant: (m: string) => string): string {
  const src = readFileSync(path.join(ROOT, file), 'utf8'), out = src.replace(at, plant);
  if (out === src) throw new Error(`${file}: the planted defect did not apply`);
  return out;
}
const copyTree = (name: string, files: string[]) => { for (const f of files) { const to = path.join(tmp, name, f); mkdirSync(path.dirname(to), { recursive: true }); copyFileSync(path.join(ROOT, f), to); } };

const SELF_CODE = ['notebook/kernel.ts', 'notebook/world.ts', 'notebook/book.ts', 'notebook/front.ts', 'notebook/cli.ts', 'playground/host.ts', 'vscode/extension.ts', 'vscode/worker.ts', 'vscode/serial.ts', 'vscode/render.ts'];
const REVIEW = path.join(NB, 'review.rofl.md');
const withCell = (cell: string) => (t: string) => `${t}\n\`\`\`rofl\n${cell}\n\`\`\`\n`;

// the planted defects' trees
// every defect a run of this file must turn red goes into one copy of the code, each on its own line, so one run names them all
const runLine = /^  const r = kernel\.run\(path\.relative\(ROOT, path\.resolve\(file\)\), text, input\);/m;
const redFile = planted('red', 'self.rofl.md', (t) => t, [
  ['notebook/world.ts', mutate('notebook/world.ts', /^  const b = readBook\(/m, (m) => `  console.log('read');\n${m}`)],
  ['notebook/kernel.ts', mutate('notebook/kernel.ts', /^export class Kernel \{/m, (m) => `import { readFileSync } from 'node:fs';\nexport const peek = (f: string) => readFileSync(f, 'utf8');\n\n${m}`)],
  ['notebook/front.ts', mutate('notebook/front.ts', /^export function normal\(p: string\): string \{/m, (m) => `${m}\n  if (!p) process.exit(3);`)],
  ['notebook/cli.ts', mutate('notebook/cli.ts', runLine, (m) => `${m}\n  writeFileSync(file, text + JSON.stringify(r));\n  spawnSync('claude', ['-p', 'check this']);`)],
  ['vscode/worker.ts', mutate('vscode/worker.ts', /const r = runFile\(file, kernel, text, unsaved\);/, (m) => `${m} translateText(file, text, claude, kernel);`)],
]);
copyTree('red', SELF_CODE.filter((f) => !['notebook/world.ts', 'notebook/kernel.ts', 'notebook/front.ts', 'notebook/cli.ts', 'vscode/worker.ts'].includes(f)));
// and every one it cannot see into another: the run must name each as out of sight, outside the boundary
const cellsLine = /^    const cells = cellsOf\(text\);/m;
const blindFile = planted('blind', 'self.rofl.md', (t) => t, [['notebook/kernel.ts', mutate('notebook/kernel.ts', cellsLine, (m) => `${m}\n    void import("node:fs").then((fs) => fs.readFileSync(path));\n    globalThis["process"].stdout.write("x");`)]]);
copyTree('blind', SELF_CODE.filter((f) => f !== 'notebook/kernel.ts'));
const unpopulated = planted('unpopulated', 'review.rofl.md', (t) => t.replace('never waits_on(C, payments)', 'never waits_onn(C, payments)'));
copyTree('unpopulated', ['examples/review.rofl.md']);
copyTree('review', ['examples/review.rofl.md']);
const failing = planted('review', 'review.rofl.md', withCell('never C is blocked by T'));
const unread = planted('unread', 'review.rofl.md', withCell('A change C is frobbed if C wibbles the moon.'));
copyTree('unread', ['examples/review.rofl.md']);
const loose = planted('loose', 'review.rofl.md', withCell('A change C touches a module M if C is written by some person.'));
copyTree('loose', ['examples/review.rofl.md']);
const extend = planted('extend', 'review.rofl.md', withCell('A change C is blocked by a team T if C is written by some person and T owns some module.\n\nextends blocked\n\n? C is blocked by `payments`'));
const collide = planted('collide', 'review.rofl.md', withCell('A change C is blocked by a team T if C is written by some person and T owns some module.\n\n? C is blocked by `payments`'));
copyTree('collide', ['examples/review.rofl.md']);
copyTree('extend', ['examples/review.rofl.md']);
const recursion = planted('recursion', 'small.rofl.md', (t) => t, [['examples/notebook/small.js', readFileSync(path.join(NB, 'small.js'), 'utf8') + '\nexport function spin(n) {\n  return n ? spin(n - 1) : 0;\n}\n']]);
const natural = planted('natural', 'review.rofl.md', (t) => `${t}\n\`\`\`natural\nNo change touches a module nobody owns.\n\`\`\`\n`);
copyTree('natural', ['examples/review.rofl.md']);
const unparsed = planted('unparsed', 'review.rofl.md', (t) => `${t}\n\`\`\`datalog\nwhynot calls itself(c2)\nwhy calls itself(c2)\n\`\`\`\n`);
copyTree('unparsed', ['examples/review.rofl.md']);
// the command line run from a tree whose kernel exits 0 before it answers: a gate executed by the code it checks
const exec = path.join(tmp, 'exec');
mkdirSync(path.join(exec, 'notebook'), { recursive: true });
for (const e of readdirSync(ROOT)) if (e !== 'notebook' && e !== '.git') symlinkSync(path.join(ROOT, e), path.join(exec, e));
for (const f of readdirSync(path.join(ROOT, 'notebook'))) copyFileSync(path.join(ROOT, 'notebook', f), path.join(exec, 'notebook', f));
writeFileSync(path.join(exec, 'notebook/kernel.ts'), mutate('notebook/kernel.ts', /^  run\(path: string, text: string, input: Inputs\): NbResult \{/m, (m) => `${m}\n    new Function('return process')().exit(0);`));
const fake = (name: string, answer: string) => { const f = path.join(tmp, name); writeFileSync(f, `#!/bin/sh\ncat > /dev/null\necho "$0" >> ${path.join(tmp, 'called')}\ncat <<'EOF'\n${answer}\nEOF\n`); chmodSync(f, 0o755); return f; };
const good = fake('good.sh', 'Here it is.\n```rofl\nA module M is unowned if some change touches M, unless some team owns M.\n\nnever M is unowned\n```');
const bad = fake('bad.sh', '```rofl\nA module M is gloriously unowned whenever nobody.\n```');
const translateOk = planted('tr-ok', 'review.rofl.md', (t) => `${t}\n\`\`\`natural\nNo change touches a module nobody owns.\n\`\`\`\n`);
copyTree('tr-ok', ['examples/review.rofl.md']);
const translateBad = planted('tr-bad', 'review.rofl.md', (t) => `${t}\n\`\`\`natural\nNo change touches a module nobody owns.\n\`\`\`\n`);
copyTree('tr-bad', ['examples/review.rofl.md']);
const translateGone = planted('tr-gone', 'review.rofl.md', (t) => `${t}\n\`\`\`natural\nNo change touches a module nobody owns.\n\`\`\`\n`);
copyTree('tr-gone', ['examples/review.rofl.md']);
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
copyTree('friction', ['examples/review.rofl.md']);
// a what-if in the notebook against the same notebook over a world without the fact
const excised = planted('excise', 'review.rofl.md', withCell('excise `c1` is approved by `ben`'));
copyTree('excise', ['examples/review.rofl.md']);
const without = planted('without', 'review.rofl.md', (t) => t);
mkdirSync(path.join(tmp, 'without/examples'), { recursive: true });
writeFileSync(path.join(tmp, 'without/examples/review.rofl.md'), readFileSync(path.join(ROOT, 'examples/review.rofl.md'), 'utf8').replace('- `c1` is approved by `ben`.\n', ''));
mkdirSync(path.join(tmp, 'badread/examples/notebook'), { recursive: true });
writeFileSync(path.join(tmp, 'badread/examples/notebook/bad.rofl'), 'p(1).\np(2).\nq(`x`).\n');
writeFileSync(path.join(tmp, 'badread/examples/notebook/badread.rofl.md'), '---\nreads:\n  - bad.rofl\n---\n\n```datalog\n? p(X)\n```\n');
const slow = path.join(tmp, 'slow.sh'); writeFileSync(slow, '#!/bin/sh\ncat > /dev/null\nexec sleep 30\n'); chmodSync(slow, 0o755);
const translateSlow = planted('tr-slow', 'review.rofl.md', (t) => `${t}\n\`\`\`natural\nNo change touches a module nobody owns.\n\`\`\`\n`);
copyTree('tr-slow', ['examples/review.rofl.md']);

const before = (f: string) => readFileSync(f, 'utf8');
const reviewText = before(REVIEW), selfText = before(path.join(NB, 'self.rofl.md')), naturalText = before(natural), badText = before(translateBad);

const layering = new Promise<Out>((done) => {
  const p = spawn(process.execPath, ['--experimental-strip-types', path.join(ROOT, 'scripts/nb_layers.ts')]);
  let out = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => done({ code: code ?? -1, out }));
});
const [review, small, self, reviewJson, fails, notRead, rewrite, extended, collided, recurse, red, blind, unpop, early, nat, trOk, trBad, trGone, unparsedOut, fr, badRead, trSlow, spat, ex, wo] = await Promise.all([
  cli([REVIEW], { ROFL_NB_CLAUDE: spy }), cli([path.join(NB, 'small.rofl.md')]), cli([path.join(NB, 'self.rofl.md'), '--json'], { ROFL_NB_CLAUDE: spy }), cli([REVIEW, '--json']),
  cli([failing]), cli([unread]), cli([loose]), cli([extend]), cli([collide]), cli([recursion]), cli([redFile]), cli([blindFile, '--json']), cli([unpopulated]), cli([path.join(exec, 'examples/notebook/review.rofl.md')], {}, exec), cli([natural]),
  cli(['translate', translateOk], { ROFL_NB_CLAUDE: good }), cli(['translate', translateBad], { ROFL_NB_CLAUDE: bad }), cli(['translate', translateGone], { ROFL_NB_CLAUDE: path.join(tmp, 'no-such-claude') }), cli([unparsed]),
  cli([friction]), cli([path.join(tmp, 'badread/examples/notebook/badread.rofl.md')]), cli(['translate', translateSlow], { ROFL_NB_CLAUDE: slow, ROFL_NB_CLAUDE_TIMEOUT: '2' }),
  cli([path.join(NB, 'spat.rofl.md')]), cli([excised, '--json']), cli([without, '--json']),
]);
const layered = await layering;

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
check('I1 every directive line of review is answered', (() => { const r = JSON.parse(reviewJson.stdout ?? ''); const asked = (reviewText.match(/^(\?|never|why|whynot|unsure) /gm) ?? []).length; const said = r.cells.flatMap((c: { lines: { unsure?: unknown }[] }) => c.lines.flatMap((l) => l.unsure ? [l, l] : [l])).length; return asked === said && asked > 0; })(), reviewJson);
check('I4 a run writes nothing into the file', before(REVIEW) === reviewText && before(path.join(NB, 'self.rofl.md')) === selfText && before(natural) === naturalText);
check('I5 a run never calls a model', !(() => { try { return readFileSync(path.join(tmp, 'called'), 'utf8').includes('spy.sh'); } catch { return false; } })());
const ok = before(translateOk);
check('I5 a translation that reads is inserted under its natural cell, which stays', trOk.code === 0 && ok.includes('No change touches a module nobody owns.\n```\n\n```rofl\nA module M is unowned') && ok.startsWith(reviewText.slice(0, 200)), trOk);
check('I5 a translation that does not read after a retry is not written, exit 2', trBad.code === 2 && before(translateBad) === badText && has(trBad, 'nothing written') && readFileSync(path.join(tmp, 'called'), 'utf8').split('\n').filter((l) => l.endsWith('bad.sh')).length === 2, trBad);
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
check('F1 an empty relation asked in one book the program writes in another says which', has(fr, 'flagged is written in [audit], not in [main]: ask flagged[audit](...)'), fr);
check('F2 a positional never works in a rofl cell', has(fr, 'never blocked(C, payments)  ->  holds'), fr);
check('F4 a datalog cell under a natural cell answers it', has(fr, 'note: answered by the cell below it') && !has(fr, 'not translated yet'), fr);
check('F5 a conjunctive question is refused with what to write instead', is(fr, 2) && has(fr, 'a question is one literal; write a rule that joins these'), fr);
check('F3 an error in a read file is at that file\'s line', is(badRead, 2) && has(badRead, 'bad.rofl:3: unexpected character'), badRead);
check('F6 a model that does not answer is stopped in bounded time and said', trSlow.code === 2 && has(trSlow, 'gave no answer in 2 s'), trSlow);
check('I5 no model to call is exit 2 and said plainly', trGone.code === 2 && has(trGone, 'not installed'), trGone);
check('a cell edit over kept code answers what the whole world answers (scripts/nb_layers.ts)', layered.code === 0 && /^same$/m.test(layered.out), layered);
for (const g of ['model', 'asked', 'kernel', 'why']) check(`  and with its ${g} guard spoilt, it does not`, new RegExp(`^--break ${g}: differ: ${g}$`, 'm').test(layered.out), layered);
check('a notebook is a world the goldens load, each of them', ['notebook_review', 'notebook_small', 'notebook_self'].every((n) => worlds().some((w) => w.name === n)));

for (const [name, ok, why] of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${why ? `\n${why.replace(/^/gm, '     ')}` : ''}`);
const bad2 = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - bad2}/${results.length} notebook checks, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(bad2 ? 1 : 0);

// npm run test:nb — the notebook's behavioural gate: the example notebooks by exit code and a few answer lines, and planted defects that must
// turn it red. The invariants it stands for are named in examples/notebook/self.rofl.md; each check below names its own.
import { spawn } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { worlds } from './goldens.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const NB = path.join(ROOT, 'examples/notebook');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'nb-check-'));
const t0 = performance.now();

type Out = { code: number; out: string };
const cli = (args: string[], env: Record<string, string> = {}): Promise<Out> => new Promise((done) => {
  const p = spawn(process.execPath, ['--experimental-strip-types', path.join(ROOT, 'notebook/cli.ts'), ...args], { env: { ...process.env, ...env } });
  let out = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  const kill = setTimeout(() => p.kill(), 110_000);
  p.on('close', (code) => { clearTimeout(kill); done({ code: code ?? -1, out }); });
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

const SELF_CODE = ['notebook/kernel.ts', 'notebook/world.ts', 'notebook/book.ts', 'notebook/front.ts', 'notebook/cli.ts', 'playground/host.ts'];
const REVIEW = path.join(NB, 'review.rofl.md');
const withCell = (cell: string) => (t: string) => `${t}\n\`\`\`rofl\n${cell}\n\`\`\`\n`;

// the planted defects' trees
copyTree('io', SELF_CODE.filter((f) => f !== 'notebook/world.ts'));
const ioFile = planted('io', 'self.rofl.md', (t) => t, [['notebook/world.ts', mutate('notebook/world.ts', /^  const b = readBook\(/m, (m) => `  console.log('read');\n${m}`)]]);
const readFile = planted('read', 'self.rofl.md', (t) => t, [['notebook/kernel.ts', mutate('notebook/kernel.ts', /^export class Kernel \{/m, (m) => `import { readFileSync } from 'node:fs';\nexport const peek = (f: string) => readFileSync(f, 'utf8');\n\n${m}`)]]);
copyTree('read', SELF_CODE.filter((f) => f !== 'notebook/kernel.ts'));
const writes = planted('writes', 'self.rofl.md', (t) => t, [['notebook/cli.ts', mutate('notebook/cli.ts', /^  const r = kernel\.run\(path\.relative\(ROOT, path\.resolve\(file\)\), text, input\);/m, (m) => `${m}\n  writeFileSync(file, text + JSON.stringify(r));`)]]);
copyTree('writes', SELF_CODE.filter((f) => f !== 'notebook/cli.ts'));
const spawns = planted('spawns', 'self.rofl.md', (t) => t, [['notebook/cli.ts', mutate('notebook/cli.ts', /^  const r = kernel\.run\(path\.relative\(ROOT, path\.resolve\(file\)\), text, input\);/m, (m) => `${m}\n  spawnSync('claude', ['-p', 'check this']);`)]]);
copyTree('spawns', SELF_CODE.filter((f) => f !== 'notebook/cli.ts'));
const exitFile = planted('exit', 'self.rofl.md', (t) => t, []);
copyTree('exit', SELF_CODE.filter((f) => f !== 'notebook/front.ts'));
mkdirSync(path.join(tmp, 'exit/notebook'), { recursive: true });
writeFileSync(path.join(tmp, 'exit/notebook/front.ts'), mutate('notebook/front.ts', /^export function normal\(p: string\): string \{/m, (m) => `${m}\n  if (!p) process.exit(3);`));
copyTree('review', ['examples/review.rofl.md']);
const failing = planted('review', 'review.rofl.md', withCell('never C is blocked by T'));
const unread = planted('unread', 'review.rofl.md', withCell('A change C is frobbed if C wibbles the moon.'));
copyTree('unread', ['examples/review.rofl.md']);
const loose = planted('loose', 'review.rofl.md', withCell('A change C touches a module M if C is written by some person.'));
copyTree('loose', ['examples/review.rofl.md']);
const extend = planted('extend', 'review.rofl.md', withCell('A change C is blocked by a team T if C is written by some person and T owns some module.\n\n? C is blocked by `payments`'));
copyTree('extend', ['examples/review.rofl.md']);
const recursion = planted('recursion', 'small.rofl.md', (t) => t, [['examples/notebook/small.js', readFileSync(path.join(NB, 'small.js'), 'utf8') + '\nexport function spin(n) {\n  return n ? spin(n - 1) : 0;\n}\n']]);
const natural = planted('natural', 'review.rofl.md', (t) => `${t}\n\`\`\`natural\nNo change touches a module nobody owns.\n\`\`\`\n`);
copyTree('natural', ['examples/review.rofl.md']);
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

const before = (f: string) => readFileSync(f, 'utf8');
const reviewText = before(REVIEW), selfText = before(path.join(NB, 'self.rofl.md')), naturalText = before(natural), badText = before(translateBad);

const [review, small, self, reviewJson, fails, notRead, rewrite, extended, recurse, io, read, wrote, spawned, exit, nat, trOk, trBad, trGone] = await Promise.all([
  cli([REVIEW], { ROFL_NB_CLAUDE: spy }), cli([path.join(NB, 'small.rofl.md')]), cli([path.join(NB, 'self.rofl.md')], { ROFL_NB_CLAUDE: spy }), cli([REVIEW, '--json']),
  cli([failing]), cli([unread]), cli([loose]), cli([extend]), cli([recursion]), cli([ioFile]), cli([readFile]), cli([writes]), cli([spawns]), cli([exitFile]), cli([natural]),
  cli(['translate', translateOk], { ROFL_NB_CLAUDE: good }), cli(['translate', translateBad], { ROFL_NB_CLAUDE: bad }), cli(['translate', translateGone], { ROFL_NB_CLAUDE: path.join(tmp, 'no-such-claude') }),
]);

const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, o?: Out) => results.push([name, ok, ok || !o ? '' : `exit ${o.code}\n${o.out.slice(-1500)}`]);
const has = (o: Out, s: string) => o.out.includes(s);

check('review: exit 0 and its answers', review.code === 0 && has(review, '`c2` is blocked by `platform`') && has(review, 'never C is blocked by `payments`  ->  holds'), review);
check('review: whynot answers', has(review, 'failed premise: not `c2` is blocked by'), review);
check('small: exit 0, an answer at its file:line', small.code === 0 && has(small, '[load() at small.js:7] is unawaited') && has(small, 'never C recurses  ->  holds'), small);
check('self: exit 0 (the gate)', self.code === 0, self);
check('I2 a failing never is exit 1 and names its row', fails.code === 1 && has(fails, 'FAILS · 1') && has(fails, '`c2` is blocked by `platform`'), fails);
check('I2 an unread cell is exit 2 and named', notRead.code === 2 && has(notRead, 'not read: C wibbles the moon'), notRead);
check('I2 a failing never over code is exit 1', recurse.code === 1 && has(recurse, 'never C recurses  ->  FAILS · 1') && has(recurse, 'small.js:12'), recurse);
check('I6 a print planted in the kernel turns self red', io.code === 1 && has(io, 'console.log() at notebook/world.ts'), io);
check('I6 a node:fs import and read planted in the kernel turns self red', read.code === 1 && has(read, 'readFileSync() at notebook/kernel.ts'), read);
check('I4 a write planted in a run turns self red', wrote.code === 1 && has(wrote, 'never C writes outside translation  ->  FAILS'), wrote);
check('I5 a process started in a run turns self red', spawned.code === 1 && has(spawned, 'never C starts a process outside the model call  ->  FAILS'), spawned);
check('I6 an exit planted in the kernel turns self red', exit.code === 1 && has(exit, 'process.exit() at notebook/front.ts'), exit);
check('I7 a cell concluding a model sentence with a loose variable is refused, exit 2', rewrite.code === 2 && has(rewrite, 'would rewrite the model'), rewrite);
check('I7 as stated does not hold: a bound conclusion extends a model relation', extended.code === 1 && has(extended, '`c1` is blocked by `payments`'), extended);
check('I1 an untranslated natural cell is named, not dropped', nat.code === 0 && has(nat, 'not translated yet'), nat);
check('I1 every directive line of review is answered', (() => { const r = JSON.parse(reviewJson.out.slice(reviewJson.out.indexOf('{'))); const asked = (reviewText.match(/^(\?|never|why|whynot|unsure) /gm) ?? []).length; const said = r.cells.flatMap((c: { lines: { unsure?: unknown }[] }) => c.lines.flatMap((l) => l.unsure ? [l, l] : [l])).length; return asked === said && asked > 0; })(), reviewJson);
check('I4 a run writes nothing into the file', before(REVIEW) === reviewText && before(path.join(NB, 'self.rofl.md')) === selfText && before(natural) === naturalText);
check('I5 a run never calls a model', !(() => { try { return readFileSync(path.join(tmp, 'called'), 'utf8').includes('spy.sh'); } catch { return false; } })());
const ok = before(translateOk);
check('I5 a translation that reads is inserted under its natural cell, which stays', trOk.code === 0 && ok.includes('No change touches a module nobody owns.\n```\n\n```rofl\nA module M is unowned') && ok.startsWith(reviewText.slice(0, 200)), trOk);
check('I5 a translation that does not read after a retry is not written, exit 2', trBad.code === 2 && before(translateBad) === badText && has(trBad, 'nothing written') && readFileSync(path.join(tmp, 'called'), 'utf8').split('\n').filter((l) => l.endsWith('bad.sh')).length === 2, trBad);
check('I5 no model to call is exit 2 and said plainly', trGone.code === 2 && has(trGone, 'not installed'), trGone);
check('a notebook is a world the goldens load, each of them', ['notebook_review', 'notebook_small', 'notebook_self'].every((n) => worlds().some((w) => w.name === n)));

for (const [name, ok, why] of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${why ? `\n${why.replace(/^/gm, '     ')}` : ''}`);
const bad2 = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - bad2}/${results.length} notebook checks, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(bad2 ? 1 : 0);

// npm run test:workbench: the workbench as `npm run workbench` builds it, loaded the way its page loads it, with no browser. Every example runs and
// says its verdicts, each coloured by its meaning; every draw gives a picture with marks and its failing tag; a translation whose first cell checks
// nothing is asked again and its second kept. Then each planted defect, made in a copy of the build, must turn it red for its own reason.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const tmp = mkdtempSync(path.join(os.tmpdir(), 'rofl-workbench-'));
const built = path.join(tmp, 'as-built');
const b = spawnSync(process.execPath, ['--experimental-strip-types', path.join(ROOT, 'scripts/workbench.ts'), '--out', built], { encoding: 'utf8', timeout: 60_000 });
if (b.status !== 0) { console.error(b.stdout, b.stderr); process.exit(1); }

/** What each notebook of examples/visual must say, run through the built modules (they are not published): the lines that fail, the pictures it
 *  draws and the tag a failing never gives them. */
const WANT: Record<string, { fails: string[]; draws: number; moves?: string }> = {
  'platform-whatif': { fails: ['never A calls up to B', 'never A reaches into B'], draws: 2, moves: '1 line moves' },
  'paint-shop': { fails: ['never M is tagged `unpainted`', 'never N dangles'], draws: 1 },
  'outage-timeline': { fails: ['never A is late'], draws: 1 },
  'coverage-heatmap': { fails: ['never unqueued(K, L)'], draws: 1 },
};
const example = (name: string) => readFileSync(path.join(ROOT, 'examples/visual', `${name}.rofl.md`), 'utf8');
const HOLDS = 'A container A neglects a container B if A owns B, unless A calls B.\n\nnever A neglects B';
const NATURAL = 'Only the service that owns a database may call it.';
const VACUOUS = 'A container A is a risky caller if A calls `billing_dbb`, unless A owns some container.\n\nnever A is a risky caller';
const FACTS = 'Declared as facts:\n\n- <a id="leads"></a>A thing A leads to a thing B\n\nThe facts:\n\n- `a` leads to `b`.\n- `b` leads to `c`.';
const BLANK_DRAW = 'draw graph';
const DRAWS = 'A mark X is a node if X leads to something.\n\nA mark X is a node if something leads to X.\n\nA mark X links to a mark Y if X leads to Y.\n\ndraw graph';
const GOOD = 'A container A is a risky caller if A calls B, B has the shape `database`, unless A owns B.\n\nnever A is a risky caller';

/** Everything wrong with the build in `dir`, said; nothing when it is right. */
async function problems(dir: string): Promise<string[]> {
  const bad: string[] = [];
  writeFileSync(path.join(dir, 'lib/package.json'), '{"type":"module"}');   // node reads the page's modules as the browser does; not published
  const wb = await import(path.join(dir, 'lib/bench.js'));
  const bench = new wb.Bench((p: string) => Promise.resolve(readFileSync(path.join(dir, p), 'utf8')));
  let n = 0;
  const cellsOf = (text: string) => wb.split(text).map((c: object) => ({ id: `c${++n}`, ...c }));
  const html = (l: object) => wb.line(l, []);
  for (const [name, want] of Object.entries(WANT)) {
    const ran = await bench.run(cellsOf(example(name))), lines = ran.result.cells.flatMap((c: { lines: object[] }) => c.lines) as { text: string; verdict: string; kind: string; total: number; view?: { marks: Record<string, { tags: string[] }>; cells?: { tags: string[] }[] } }[];
    if (ran.head.errors.length) bad.push(`${name}: not read: ${ran.head.errors.join('; ')}`);
    const fails = lines.filter((l) => l.verdict === 'fails').map((l) => l.text);
    if (fails.join('|') !== want.fails.join('|')) bad.push(`${name}: fails ${JSON.stringify(fails)}, not ${JSON.stringify(want.fails)}`);
    for (const l of lines.filter((x) => x.verdict === 'fails')) if (!html(l).includes('<span class="verdict fail">✗ FAILS')) bad.push(`${name}: "${l.text}" fails and is not drawn as a failing verdict: ${html(l).slice(0, 160)}`);
    const draws = lines.filter((l) => l.kind === 'draw');
    if (draws.length !== want.draws) bad.push(`${name}: ${draws.length} pictures, not ${want.draws}`);
    for (const d of draws) {
      if (!d.view || !Object.keys(d.view.marks).length) { bad.push(`${name}: "${d.text}" drew no marks`); continue; }
      const tags = [...Object.values(d.view.marks).flatMap((m) => m.tags), ...(d.view.cells ?? []).flatMap((c) => c.tags)];
      if (!tags.includes('failing')) bad.push(`${name}: "${d.text}" has no mark tagged failing, where a never fails`);
      if (!html(d).includes('class="pic" data-view="0"')) bad.push(`${name}: "${d.text}" has no slot for its picture`);
    }
    if (want.moves && !lines.some((l) => l.kind === 'excise' && html(l).includes(want.moves!))) bad.push(`${name}: the what-if does not say ${want.moves}`);
  }
  // a never that holds, in the colour of one that holds, and each verdict's colour a token of its own
  const platform = cellsOf(example('platform-whatif'));
  const held = (await bench.run([...platform, { id: 'h', kind: 'rofl', text: HOLDS }])).byCell.get('h')?.lines[0];
  if (held?.verdict !== 'holds' || !html(held).includes('<span class="verdict pass">✓ holds')) bad.push(`a never that holds is not drawn as one: ${held ? html(held).slice(0, 160) : 'no line'}`);
  // the page's hint is one sentences cell with no front matter: it reads the graph's words by default, holds, and draws
  const hint = (await bench.run([{ id: 'hint', kind: 'rofl', text: wb.HINT }])), hl = hint.byCell.get('hint');
  if (hint.result.status !== 'ok' || hl?.lines.map((l: { verdict: string }) => l.verdict).join(' ') !== 'holds answers' || !Object.keys(hl.lines[1].view?.marks ?? {}).length) bad.push(`the hint does not read, hold and draw: ${hint.result.status}; ${JSON.stringify([...hint.head.errors, ...hl?.errors ?? []])}`);
  const key = (k: string) => ({ key: 'Enter', shiftKey: k === 'shift', metaKey: k === 'meta', ctrlKey: k === 'ctrl' });
  if (wb.runsOn(key('shift'), 'prose') || !wb.runsOn(key('shift'), 'rofl') || !wb.runsOn(key('meta'), 'prose') || !wb.runsOn(key('ctrl'), 'datalog')) bad.push('Shift+Enter in prose runs, or Cmd/Ctrl+Enter or Shift+Enter elsewhere does not');
  if (existsSync(path.join(dir, 'examples'))) bad.push('examples are published with the page');
  const css = readFileSync(path.join(dir, 'index.html'), 'utf8');
  for (const [cls, token] of [['pass', '--pass'], ['fail', '--fail'], ['warn', '--warn']]) if (!css.includes(`.verdict.${cls} { color: var(${token}); }`)) bad.push(`the page does not colour .verdict.${cls} with var(${token})`);
  // a translation by a model that first writes a cell checking nothing, then one that checks something
  const asked: string[] = [];
  const replies = [VACUOUS, GOOD, GOOD];
  const fake = Object.assign(async (prompt: string) => { asked.push(prompt); return { ok: true, text: '```rofl\n' + replies[asked.length - 1] + '\n```' }; }, { who: 'the fake model' });
  const withNatural = [...platform, { id: 'nat', kind: 'natural', text: NATURAL }];
  const t = await bench.translate(withNatural, 'nat', fake);
  if (asked.length !== 2 || !t.said.some((s: string) => s.includes('the first try read, and checks nothing'))) bad.push(`a first cell that checks nothing was not refused and asked again: ${asked.length} calls; ${t.said.join(' / ')}`);
  if (t.code !== 0 || t.cell !== GOOD) bad.push(`the second, good cell was not kept: exit ${t.code}, cell ${JSON.stringify(t.cell)}`);
  // a drawing asked for: a cell whose picture shows nothing is asked again, one that maps the things onto the view's sentences is kept
  const drew: string[] = [], drawing = [BLANK_DRAW, DRAWS, DRAWS];
  const painter = Object.assign(async (prompt: string) => { drew.push(prompt); return { ok: true, text: '```rofl\n' + drawing[drew.length - 1] + '\n```' }; }, { who: 'the fake model' });
  const d = await bench.translate([{ id: 'f', kind: 'rofl', text: FACTS }, { id: 'n', kind: 'natural', text: 'Draw what leads where.' }], 'n', painter);
  if (drew.length !== 2 || !d.said.some((s: string) => s.includes('draws nothing'))) bad.push(`a first cell that draws nothing was not refused and asked again: ${drew.length} calls; ${d.said.join(' / ')}`);
  if (d.code !== 0 || d.cell !== DRAWS) bad.push(`the drawing cell was not kept: exit ${d.code}, ${d.said.join(' / ')}`);
  if (!drew[0]?.includes('a request to draw or diagram something is answered with rules')) bad.push('the prompt does not say how a picture is drawn');
  if (!asked[0]?.includes('? <sentence>') || /\blist <glob>|\bshow <path>/.test(asked[0] ?? '')) bad.push('the prompt offers the model something other than "?" lines to read with');
  return bad;
}

let red = 0;
const say = (ok: boolean, what: string, detail = '') => { if (!ok) red++; console.log(`${ok ? 'ok  ' : 'RED '} ${what}${ok || !detail ? '' : `\n     ${detail}`}`); };
const t0 = performance.now();
const asBuilt = await problems(built);
say(!asBuilt.length, 'as built: every example of examples/visual says its verdicts in their colours and draws its failing marks, the hint reads and draws, no example is published, and a vacuous translation is asked again', asBuilt.join('\n     '));

/** A copy of the build with one defect; red, and for the reason `why` names. */
const PLANTS: [string, (dir: string) => void, RegExp][] = [
  ['the vocabularies left out of the build', (d) => rmSync(path.join(d, 'visual'), { recursive: true }), /rofl:visual\/graph\.rofl\.md: not published with the page/],
  ['the verdict classes flattened', (d) => spoil(d, 'lib/kernel.js', "fails: ['fail',", "fails: ['pass',"), /is not drawn as a failing verdict/],
  ['the verdict colours flattened', (d) => spoil(d, 'index.html', '.verdict.fail { color: var(--fail); }', '.verdict.fail { color: var(--fg); }'), /does not colour \.verdict\.fail/],
  ['an example published', (d) => cpSync(path.join(ROOT, 'examples/visual/paint-shop.rofl.md'), path.join(d, 'examples/paint-shop.rofl.md'), { recursive: true }), /examples are published with the page/],
  ['Shift+Enter running in prose', (d) => spoil(d, 'lib/bench.js', " && kind !== 'prose'", ''), /Shift\+Enter in prose runs/],
  ['the empty-picture gate off', (d) => spoil(d, 'lib/translate.js', '...blank, ', ''), /a first cell that draws nothing was not refused/],
  ['the drawing paragraph out of the prompt', (d) => spoil(d, 'lib/translate.js', 'So a request to draw or diagram something is answered with rules', 'So'), /the prompt does not say how a picture is drawn/],
  ['the vacuous-cell gate off', (d) => spoil(d, 'lib/translate.js', ', ...silent, ...vacuous]', ', ...silent]'), /a first cell that checks nothing was not refused/],
];
function spoil(dir: string, file: string, from: string, to: string) {
  const f = path.join(dir, file), text = readFileSync(f, 'utf8');
  if (!text.includes(from)) throw new Error(`${file}: the planted defect did not apply`);
  writeFileSync(f, text.replace(from, to));
}
for (const [name, plant, why] of PLANTS) {
  const dir = path.join(tmp, name.replace(/\W+/g, '-'));
  cpSync(built, dir, { recursive: true });
  plant(dir);
  const p = await problems(dir);
  say(p.some((x) => why.test(x)), `planted, ${name}: red, because ${why.source.replace(/\\/g, '')}`, p.length ? p.join('\n     ') : 'green');
}
rmSync(tmp, { recursive: true, force: true });
console.log(`${red ? `${red} red` : 'all green'} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(red ? 1 : 0);

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
const UNDECLARED = 'An entity `writer` sends the artifact `pages` to the entity `store`.\n\n? A service S sends an artifact A to a service T';
const DECLARED = 'Declared as facts:\n\n- <a id="sends"></a>A service S sends an artifact A to a service T\n\nThe flows:\n\n- `writer` sends `pages` to `store`.\n\n? A service S sends an artifact A to a service T';
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
  const keys = (['prose', 'rofl', 'datalog', 'natural'] as const).map((k) => `${k}: ${wb.keyAction(key('shift'), k)} ${wb.keyAction(key('meta'), k)} ${wb.keyAction(key('ctrl'), k)}`).join('; ');
  if (keys !== 'prose: null run run; rofl: run run run; datalog: run run run; natural: null translate translate') bad.push(`the keys do the wrong thing (Shift, Cmd, Ctrl+Enter by cell): ${keys}`);
  if (/prose: run/.test(keys)) bad.push('Shift+Enter in prose runs');
  if (/natural: run/.test(keys)) bad.push('Shift+Enter in natural runs');
  if (!/natural: \w+ translate translate/.test(keys)) bad.push('Cmd/Ctrl+Enter in natural does not translate');
  // a domain's own sentence is not a picture's: `reads` labels nothing, and one that does read as a picture's sentence is said
  const reads = (await bench.run([{ id: 'r', kind: 'rofl', text: 'A service S reads a feed F if S is "w", F is "f".\n\nA mark X is a node if X is "w".\n\ndraw graph' }])).byCell.get('r');
  const label = (Object.values(reads?.lines.at(-1)?.view?.marks ?? {}) as { label: string }[]).map((m) => m.label).join();
  if (label !== 'w') bad.push(`a domain sentence "S reads F" relabelled a mark: it is drawn as ${JSON.stringify(label)}`);
  const links = (await bench.run([{ id: 'l', kind: 'rofl', text: 'A service S links to a service T if S is "a", T is "b".\n\ndraw graph' }])).byCell.get('l');
  if (!links?.notes.some((n: string) => n.includes('reads as the picture\'s sentence'))) bad.push(`a domain sentence that reads as a picture's is not said: ${JSON.stringify(links?.notes)}`);
  // newest first reverses what is shown, and neither the notebook's order nor its run
  const logical = cellsOf(example('platform-whatif')).map((c: object, i: number) => ({ ...c, order: (i + 1) * 10 })), before = JSON.stringify(logical);
  const view = wb.shown(logical, true), ran1 = JSON.stringify((await bench.run(logical)).result.cells);
  if (JSON.stringify(view.map((c: { id: string }) => c.id)) !== JSON.stringify(logical.map((c: { id: string }) => c.id).reverse())) bad.push('newest first does not reverse the cells shown');
  if (JSON.stringify(logical) !== before || JSON.stringify((await bench.run(logical)).result.cells) !== ran1) bad.push('newest first changed the notebook: its order or its run');
  // a hyphen in an anchor is said as a name, not left to the parser
  const hy = (await bench.run([{ id: 'h', kind: 'rofl', text: 'Declared as facts:\n\n- <a id="pipeline-config"></a>A thing X is a pipeline config\n\nThe configs:\n\n- `c1` is a pipeline config.' }])).byCell.get('h')?.errors ?? [];
  if (!hy.some((e: string) => e.includes('names no relation, a name is one word: "pipeline_config"'))) bad.push(`a hyphenated anchor is not said as a name: ${JSON.stringify(hy)}`);
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
  // facts: a first cell in sentences nobody declared does not read and is asked again, the declared one is kept; the prompt says how to declare
  const told: string[] = [], facts = [UNDECLARED, DECLARED, DECLARED];
  const modeller = Object.assign(async (prompt: string) => { told.push(prompt); return { ok: true, text: '```rofl\n' + facts[told.length - 1] + '\n```' }; }, { who: 'the fake model' });
  const m = await bench.translate([{ id: 'n', kind: 'natural', text: 'Services send artifacts.' }], 'n', modeller);
  if (told.length !== 2 || m.code !== 0 || m.cell !== DECLARED) bad.push(`a declared fact cell was not kept after an undeclared one: ${told.length} calls, exit ${m.code}; ${m.said.join(' / ')}`);
  if (!told[0]?.includes('A fact is stated in a sentence the notebook declares first')) bad.push('the prompt does not say how a fact is declared');
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
  ['Shift+Enter running in prose', (d) => spoil(d, 'lib/bench.js', "(kind === 'rofl' || kind === 'datalog')", "kind !== 'natural'"), /Shift\+Enter in prose runs/],
  ['Shift+Enter running in natural', (d) => spoil(d, 'lib/bench.js', "(kind === 'rofl' || kind === 'datalog')", "kind !== 'prose'"), /Shift\+Enter in natural runs/],
  ['Cmd/Ctrl+Enter in natural not translating', (d) => spoil(d, 'lib/bench.js', "(kind === 'natural' ? 'translate' : 'run')", "'run'"), /Cmd\/Ctrl\+Enter in natural does not translate/],
  ['the empty-picture gate off', (d) => spoil(d, 'lib/translate.js', '...blank, ', ''), /a first cell that draws nothing was not refused/],
  ['the drawing paragraph out of the prompt', (d) => spoil(d, 'lib/translate.js', 'So a request to draw or diagram something is answered with rules', 'So'), /the prompt does not say how a picture is drawn/],
  ['the label sentence as it was', (d) => spoil(d, 'visual/graph.rofl.md', 'A mark M is labelled S', 'A mark M reads S'), /relabelled a mark/],
  ['the picture-sentence note off', (d) => spoil(d, 'lib/book.js', '...viewLike(clauses, phrases)', ''), /reads as a picture's is not said/],
  ['newest first changing the notebook', (d) => spoil(d, 'lib/bench.js', '[...cells].reverse()', 'cells.reverse()'), /newest first changed the notebook/],
  ['the facts paragraph out of the prompt', (d) => spoil(d, 'lib/translate.js', 'A fact is stated in a sentence the notebook declares first', 'A fact'), /the prompt does not say how a fact is declared/],
  ['the hyphenated anchor let through', (d) => spoil(d, 'lib/read_md.js', "a[2].includes('-') &&", 'false &&'), /a hyphenated anchor is not said as a name/],
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

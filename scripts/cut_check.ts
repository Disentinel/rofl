// npm run test:cut — a run its wall stopped says so wherever its answers show: its status and exit, the command line's lines and last line,
// the VS Code head and cell, the Workbench cell and head. A count reads "at least N, cut short"; a never that found nothing is not known, never holds.
// A memory limit of a megabyte stops a small runaway within milliseconds; the same notebook uncut is the control. Each planted defect, in a copy of
// the kernel, turns it red for its own reason.
import * as path from 'node:path';
import { check, cli, has, linked, mutate, NB, put, report, tmp, type Out } from './nb_lib.ts';
import { SAID, type NbResult } from '../notebook/kernel.ts';
import { render } from '../vscode/render.ts';
import { said, state } from '../workbench/bench.ts';

const t0 = performance.now();
const nb = path.join(tmp, 'cut/cut.rofl.md');
put(nb, '# Cut short\n\n```datalog\nn(0).\nn(Y) :- n(X), X < 30000, Y is X + 1.\ntop(X) :- n(X), X >= 29999.\nlow(X) :- n(X), X < 0.\nearly(X) :- n(X), X < 3.\n\n? n(X)\nnever top(X)\nnever low(X)\nnever early(X)\n```\n');
const TINY = { ROFL_NB_MEMORY: '0.001' };
const last = (o: Out) => o.stdout?.trim().split('\n').pop() ?? '';
const json = (o: Out): NbResult | undefined => { try { return JSON.parse(o.stdout ?? ''); } catch { return undefined; } };

/** What every host shows of a run stopped by its wall; empty when it all says so. */
function cutSaid(text: Out, data: Out): string[] {
  const bad: string[] = [], r = json(data);
  if (text.code !== 1) bad.push(`exit ${text.code}, not 1 (a never found rows before the cut)`);
  if (!/CUT SHORT/.test(last(text))) bad.push(`the last line does not say the run was cut short: ${last(text)}`);
  if (!has(text, '? n(X)  ->  at least ')) bad.push('the question\'s count is not "at least"');
  for (const n of ['top', 'low']) if (!has(text, `never ${n}(X)  ->  not known: the run was cut short`)) bad.push(`never ${n}(X) is not "not known"`);
  if (/never \w+\(X\)  ->  holds/.test(text.out)) bad.push('a never holds over a cut-short run');
  if (!has(text, 'never early(X)  ->  FAILS · at least ')) bad.push('the failing never\'s count is not "at least"');
  if (r?.status !== 'cut') bad.push(`--json status ${r?.status}, not cut`);
  if (!r) return bad;
  const shown = render(r, 'x.1'), cell = shown.cells[0]?.md ?? '';
  if (!shown.head.md.includes(SAID.cut)) bad.push(`the VS Code head does not say cut short: ${shown.head.md.slice(0, 120)}`);
  if (!cell.includes('not known: the run was cut short') || !cell.includes('<summary>at least ')) bad.push('the VS Code cell does not say cut short');
  const out = r.cells[1], html = said(out, []), head = state(out);
  if (!html.includes('not known: the run was cut short')) bad.push('the Workbench cell does not say not known');
  if (!/cut short/.test(head.text)) bad.push(`the Workbench cell's head says ${JSON.stringify(head.text)}`);
  if (!SAID[r.status]?.includes('cut short')) bad.push(`the Workbench head (SAID[status]) says ${SAID[r.status]}`);
  return bad;
}

const [whole, text, data, timed, model] = await Promise.all([
  cli([nb]), cli([nb], TINY), cli([nb, '--json'], TINY), cli([nb], { ROFL_NB_LIMIT: '0' }),
  cli([path.join(NB, 'small.rofl.md')], TINY),
]);
check('the control: uncut, 30001 answers, never top(X) FAILS, nothing says cut short, exit 1',
  whole.code === 1 && has(whole, '? n(X)  ->  30001 answers') && has(whole, 'never top(X)  ->  FAILS · 2') && !/cut short/i.test(whole.out), whole);
const bad = cutSaid(text, data);
check('cut by memory in milliseconds: every host says cut short, counts at least, no never holds', !bad.length && text.ms! < 20_000, { ...text, out: `${bad.join('\n')}\n${text.out}` });
check('cut by time (ROFL_NB_LIMIT=0) says the same', timed.code === 1 && /CUT SHORT/.test(last(timed)) && has(timed, 'never low(X)  ->  not known'), timed);
check('a JS model cut while its code is evaluated says so too (small)', /CUT SHORT/.test(last(model)) && !/  ->  holds( as far as it sees)?\n/.test(model.out) && has(model, 'not known: the run was cut short'), model);

// planted: the kernel's marking gone, and its status gone
const PLANTS: [string, RegExp, string, RegExp][] = [
  ['mark', /        if \(out\.partial\) \{ line\.cut = true;[^\n]*\n/, '', /is not "not known"|a never holds over a cut-short run/],
  ['status', /out\.partial \? 'cut' : /, '', /--json status \w+, not cut/],
];
for (const [name, at, plant, reason] of PLANTS) {
  const root = linked(`plant-${name}`, 'notebook/kernel.ts', mutate('notebook/kernel.ts', at, () => plant));
  const [t, d] = await Promise.all([cli([nb], TINY, root), cli([nb, '--json'], TINY, root)]);
  const said = cutSaid(t, d).join('\n');
  check(`  planted ${name}: red for its own reason`, reason.test(said), { ...t, out: said || t.out });
}
report('cut-short checks', t0);

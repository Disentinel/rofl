// The table as Markdown, or as Vega-Lite with the channels `shows` names.
import { grid, suffix, unquote, type Backend, type View } from './draw.ts';

function markdown(v: View): string {
  const { vals, rows, cols } = grid(v), cell = (s: string) => s.replace(/\|/g, '\\|');
  const out = [`| | ${cols.map((c) => cell(unquote(c))).join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`];
  const tags = (r: string, c: string) => v.cells?.find((x) => x.row === r && x.column === c)?.tags ?? [];
  for (const r of rows) out.push(`| ${cell((v.marks[r]?.label ?? unquote(r)) + suffix(v.marks[r]))} | ${cols.map((c) => cell(vals.filter((f) => f.args[0] === r && f.args[1] === c).map((f) => unquote(f.args[2]) + (f.change ? ` [${f.change}]` : '')).join(', ') + (tags(r, c).length ? ` [${tags(r, c).join(', ')}]` : ''))).join(' | ')} |`);
  return out.join('\n');
}

function vegaLite(v: View): object {
  const { vals, rows } = grid(v);
  const values = rows.map((r) => Object.fromEntries([['row', unquote(r)], ...vals.filter((f) => f.args[0] === r).map((f) => [unquote(f.args[1]), /^-?\d+(\.\d+)?$/.test(f.args[2]) ? Number(f.args[2]) : unquote(f.args[2])]), ['tags', v.marks[r]?.tags.join(' ') ?? '']]));
  const mark = v.facts.find((f) => f.rel === 'draws')?.args[0] ?? 'bar';
  const encoding = Object.fromEntries(v.facts.filter((f) => f.rel === 'shows').map((f) => [unquote(f.args[0]), { field: unquote(f.args[1]), type: unquote(f.args[2]) }]));
  return { $schema: 'https://vega.github.io/schema/vega-lite/v5.json', data: { values }, mark: unquote(mark), encoding: { ...encoding, tooltip: [{ field: 'row' }, { field: 'tags' }] } };
}


export const backends: Backend[] = [{ kind: 'table', format: 'markdown', fence: '', write: markdown }, { kind: 'table', format: 'vega-lite', fence: 'json', when: (v) => v.kind === 'chart' || v.facts.some((f) => f.rel === 'draws'), write: (v) => JSON.stringify(vegaLite(v), null, 1) }];

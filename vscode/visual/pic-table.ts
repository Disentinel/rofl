// A table as HTML: a row's tags on its header, a cell's on the cell.
import { grid, unquote, type View } from '../../notebook/draw.ts';
import { esc, tagsOf, type Picture } from './picture.ts';

export function tableHtml(v: View): string {
  const { vals, rows, cols } = grid(v);
  const cls = (r: string, c: string) => (v.cells ?? []).find((x) => x.row === r && x.column === c)?.tags.join(' ') ?? '';
  return `<table class="view"><thead><tr><th></th>${cols.map((c) => `<th>${esc(unquote(c))}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><th data-mark="${esc(r)}" class="${esc(tagsOf(v, r).join(' '))}">${esc(v.marks[r]?.label ?? unquote(r))}</th>${cols.map((c) => `<td class="${esc(cls(r, c))}">${vals.filter((f) => f.args[0] === r && f.args[1] === c).map((f) => f.change ? `<span class="${f.change}" title="${f.change} in the what-if">${esc(unquote(f.args[2]))}</span>` : esc(unquote(f.args[2]))).join(', ')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

export const pictures: Picture[] = [{ kind: 'table', mount: (el, v) => { el.innerHTML = tableHtml(v); } }];

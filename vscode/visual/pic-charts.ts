// The table's forms, each a draw kind of its own: a chart (its mark what `draws` names), a heatmap, an UpSet, an Euler diagram, a decision table.
import { grid, unquote, type View } from '../../notebook/draw.ts';
import { esc, tagsOf, type Picture } from './picture.ts';

const label = (v: View, r: string) => v.marks[r]?.label ?? unquote(r);
const cellTags = (v: View, r: string, c: string) => (v.cells ?? []).find((x) => x.row === r && x.column === c)?.tags ?? [];
const valueOf = (v: View, r: string, c: string) => v.facts.find((f) => f.rel === 'value' && f.args[0] === r && f.args[1] === c);
const tip = (v: View, r: string) => `<title>${esc(label(v, r))}${tagsOf(v, r).length ? ` [${esc(tagsOf(v, r).join(', '))}]` : ''}</title>`;
const setsOf = (v: View) => [...new Set(v.facts.filter((f) => f.rel === 'value').map((f) => f.args[1]))].sort();
const HUES = ['var(--p-accent)', 'var(--p-pass)', 'var(--p-warn)', '#7c3aed', '#0891b2', 'var(--p-mute)'];
/** A name as a chip: the mark itself, its tags its class, the text over it. */
const chip = (v: View, r: string, x: number, y: number, anchor = 'middle') => {
  const w = label(v, r).length * 6.6 + 10, x0 = anchor === 'middle' ? x - w / 2 : x;
  return `<rect data-mark="${esc(r)}" class="${esc(tagsOf(v, r).join(' '))}" x="${x0}" y="${y - 11}" width="${w}" height="15" rx="3">${tip(v, r)}</rect><text x="${x0 + w / 2}" y="${y}" text-anchor="middle" pointer-events="none">${esc(label(v, r))}</text>`;
};

/** Bars, a line or points: x the column `shows` gives channel x (the row's name by default), y a quantity. */
export function chartSvg(v: View): string {
  const { rows, cols } = grid(v), enc = new Map(v.facts.filter((f) => f.rel === 'shows').map((f) => [unquote(f.args[0]), f.args[1]]));
  const num = (r: string, c: string) => { const f = valueOf(v, r, c); return f && /^-?\d+(\.\d+)?$/.test(f.args[2]) ? Number(f.args[2]) : undefined; };
  const yc = enc.get('y') ?? cols.find((c) => rows.some((r) => num(r, c) !== undefined)), xc = enc.get('x') ?? 'row';
  const pts = rows.filter((r) => yc && num(r, yc) !== undefined).map((r) => ({ id: r, x: xc === 'row' ? label(v, r) : unquote(valueOf(v, r, xc)?.args[2] ?? ''), y: num(r, yc!)! }));
  if (!pts.length) return '<div class="mute" style="padding:8px">no row has a number to plot</div>';
  if (pts.every((p) => /^-?\d+(\.\d+)?$/.test(p.x))) pts.sort((a, b) => Number(a.x) - Number(b.x));
  const mark = unquote(v.facts.find((f) => f.rel === 'draws')?.args[0] ?? 'bar'), lo = Math.min(0, ...pts.map((p) => p.y)), step = nice((Math.max(...pts.map((p) => p.y)) - lo) / 5 || 1), hi = Math.ceil(Math.max(...pts.map((p) => p.y)) / step) * step;
  const W = 680, L = 52, T = 24, H = 200, band = (W - L - 10) / pts.length, tilt = Math.max(...pts.map((p) => p.x.length)) * 6.6 > band - 4;
  const y = (n: number) => T + H - (n - lo) / (hi - lo || 1) * H, cx = (k: number) => L + band * (k + 0.5);
  const out = [`<svg viewBox="0 0 ${W} ${T + H + (tilt ? 80 : 40)}" width="100%" role="img" aria-label="chart">`,
    `<g class="axis">${[...Array(Math.round((hi - lo) / step) + 1).keys()].map((k) => lo + k * step).map((n) => `<line x1="${L}" x2="${W - 8}" y1="${y(n)}" y2="${y(n)}"/><text x="${L - 6}" y="${y(n) + 4}" text-anchor="end">${+n.toFixed(6)}</text>`).join('')}`
    + `${pts.map((p, k) => `<text x="${cx(k)}" y="${T + H + 16}" ${tilt ? `text-anchor="end" transform="rotate(-35 ${cx(k)} ${T + H + 16})"` : 'text-anchor="middle"'}>${esc(p.x)}</text>`).join('')}</g>`];
  if (mark === 'line') out.push(`<polyline points="${pts.map((p, k) => `${cx(k)},${y(p.y)}`).join(' ')}" fill="none" stroke="var(--p-mute)" stroke-width="1.5"/>`);
  pts.forEach((p, k) => {
    out.push(mark === 'bar' ? `<rect data-mark="${esc(p.id)}" class="${esc(tagsOf(v, p.id).join(' '))}" x="${cx(k) - band * 0.35}" y="${Math.min(y(p.y), y(0))}" width="${band * 0.7}" height="${Math.max(1, Math.abs(y(0) - y(p.y)))}" rx="2">${tip(v, p.id)}</rect>`
      : `<circle data-mark="${esc(p.id)}" class="${esc(tagsOf(v, p.id).join(' '))}" cx="${cx(k)}" cy="${y(p.y)}" r="5">${tip(v, p.id)}</circle>`);
    out.push(`<text x="${cx(k)}" y="${y(p.y) - 7}" text-anchor="middle" pointer-events="none">${p.y}</text>`);
    if (tagsOf(v, p.id).length && !tilt) out.push(`<text x="${cx(k)}" y="${T + H + 30}" text-anchor="middle" class="axis" style="fill:var(--p-mute)">[${esc(tagsOf(v, p.id).join(', '))}]</text>`);
  });
  return out.join('') + '</svg>';
}
const nice = (x: number) => { const e = 10 ** Math.floor(Math.log10(x)), f = x / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; };

/** Rows by columns, a cell coloured by its value, one colour a value; a cell's tags outline it, a row's tags mark its name. */
export function heatmapSvg(v: View): string {
  const { vals, rows, cols } = grid(v), kinds = [...new Set(vals.map((f) => unquote(f.args[2])))].sort();
  const L = Math.max(...rows.map((r) => label(v, r).length)) * 6.6 + 18, C = Math.max(56, Math.max(...cols.map((c) => unquote(c).length)) * 6.6 + 10), R = 26, T = 24;
  const W = L + cols.length * C + 10, H = T + rows.length * R, cls = (ts: string[]) => esc(ts.join(' '));
  const out = [`<svg viewBox="0 0 ${Math.max(W, 300)} ${H + 34}" width="${Math.max(W, 300)}" role="img" aria-label="heatmap">`,
    `<g class="axis">${cols.map((c, j) => `<text x="${L + j * C + C / 2}" y="${T - 8}" text-anchor="middle">${esc(unquote(c))}</text>`).join('')}</g>`];
  rows.forEach((r, i) => {
    out.push(tagsOf(v, r).length ? `<rect data-mark="${esc(r)}" class="${cls(tagsOf(v, r))}" x="2" y="${T + i * R + 3}" width="${L - 8}" height="${R - 6}" rx="3">${tip(v, r)}</rect>` : `<rect data-mark="${esc(r)}" x="2" y="${T + i * R + 3}" width="${L - 8}" height="${R - 6}" style="fill:transparent;stroke:none">${tip(v, r)}</rect>`,
      `<text x="8" y="${T + i * R + R / 2 + 4}" pointer-events="none">${esc(label(v, r))}</text>`);
    cols.forEach((c, j) => {
      const f = valueOf(v, r, c), k = f ? kinds.indexOf(unquote(f.args[2])) : -1, tags = [...cellTags(v, r, c), ...(f?.change ? [f.change] : [])];
      const fill = k < 0 ? 'transparent' : `color-mix(in srgb, ${HUES[k % HUES.length]} 40%, transparent)`;
      out.push(`<rect data-mark="${esc(r)}" class="${cls(tags)}" x="${L + j * C + 1}" y="${T + i * R + 1}" width="${C - 2}" height="${R - 2}" style="fill:${fill}${tags.length ? ';stroke-width:2.5' : ';stroke:var(--p-line)'}"><title>${esc(label(v, r))} · ${esc(unquote(c))}: ${f ? esc(unquote(f.args[2])) : 'no value'}${tags.length ? ` [${esc(tags.join(', '))}]` : ''}</title></rect>`,
        f ? `<text x="${L + j * C + C / 2}" y="${T + i * R + R / 2 + 4}" text-anchor="middle" pointer-events="none">${esc(unquote(f.args[2]))}</text>` : '');
    });
  });
  let x = L;
  out.push(kinds.map((k, i) => { const s = `<rect x="${x}" y="${H + 12}" width="12" height="12" style="fill:color-mix(in srgb, ${HUES[i % HUES.length]} 40%, transparent);stroke:var(--p-line)"/><text x="${x + 16}" y="${H + 22}">${esc(k)}</text>`; x += k.length * 6.6 + 34; return s; }).join(''));
  return out.join('') + '</svg>';
}

/** A row's values as the sets it is in (a column a set): each set with its size, each intersection someone is in with its size and its members. */
function members(v: View) {
  const sets = setsOf(v), { rows } = grid(v), of = new Map(rows.map((r) => [r, sets.filter((s) => valueOf(v, r, s))]));
  const by = new Map<string, string[]>();
  for (const r of rows) by.set(of.get(r)!.join('\u0000'), [...by.get(of.get(r)!.join('\u0000')) ?? [], r]);
  return { sets, of, groups: [...by].map(([k, rs]) => ({ in: k.split('\u0000'), rows: rs })) };
}

export function upsetSvg(v: View): string {
  const { sets, of, groups } = members(v), MAX = 8;
  groups.sort((a, b) => b.rows.length - a.rows.length || b.in.length - a.in.length || a.in.join().localeCompare(b.in.join()));
  const N = Math.max(...sets.map((s) => unquote(s).length)) * 6.6 + 12, SB = 70, M = N + SB + 10, R = 22, top = 100;
  const C = Math.max(30, ...groups.flatMap((g) => g.rows.slice(0, MAX).map((r) => label(v, r).length * 6.6 + 16)));
  const big = Math.max(...groups.map((g) => g.rows.length)), setSize = (s: string) => [...of.values()].filter((xs) => xs.includes(s)).length, bigSet = Math.max(...sets.map(setSize));
  const under = top + sets.length * R + 16, deep = Math.min(MAX, Math.max(...groups.map((g) => g.rows.length))) + 1, W = M + groups.length * C + 10;
  const out = [`<svg viewBox="0 0 ${Math.max(W, 300)} ${under + deep * 18 + 8}" width="${Math.max(W, 300)}" role="img" aria-label="upset">`];
  sets.forEach((s, i) => out.push(`<text x="${N - 6}" y="${top + i * R + R / 2 + 4}" text-anchor="end">${esc(unquote(s))}</text>`,
    `<rect x="${N}" y="${top + i * R + 6}" width="${setSize(s) / bigSet * (SB - 20)}" height="${R - 12}" style="fill:var(--p-soft);stroke:var(--p-line)"/><text x="${N + setSize(s) / bigSet * (SB - 20) + 4}" y="${top + i * R + R / 2 + 4}" class="axis">${setSize(s)}</text>`));
  groups.forEach((g, j) => {
    const x = M + j * C + C / 2, h = g.rows.length / big * (top - 30), ys = g.in.map((s) => top + sets.indexOf(s) * R + R / 2);
    out.push(`<rect x="${x - 9}" y="${top - 8 - h}" width="18" height="${h}" style="fill:var(--p-soft);stroke:var(--p-mute)"/><text x="${x}" y="${top - 12 - h}" text-anchor="middle">${g.rows.length}</text>`,
      ys.length > 1 ? `<line x1="${x}" x2="${x}" y1="${Math.min(...ys)}" y2="${Math.max(...ys)}" stroke="var(--p-fg)" stroke-width="2"/>` : '',
      sets.map((s, i) => `<circle cx="${x}" cy="${top + i * R + R / 2}" r="5" style="fill:${g.in.includes(s) ? 'var(--p-fg)' : 'var(--p-line)'};stroke:none"/>`).join(''),
      g.rows.slice(0, MAX).map((r, k) => chip(v, r, x, under + k * 18 + 10)).join(''),
      g.rows.length > MAX ? `<text x="${x}" y="${under + MAX * 18 + 10}" text-anchor="middle" class="axis">+${g.rows.length - MAX}</text>` : '');
  });
  return out.join('') + '</svg>';
}

/** One circle a set, at most three; a row sits in the region of exactly the sets it is in. Every region is drawn, an empty one too. */
export function eulerSvg(v: View): string {
  if (setsOf(v).length > 3) return `<div class="note">${setsOf(v).length} sets: an Euler diagram is drawn for three or fewer, so this is the UpSet</div>${upsetSvg(v)}`;
  const { sets, groups } = members(v), r = 100, W = 680, cx = W / 2, cy = 145;
  const at: [number, number][] = sets.length === 1 ? [[cx, cy]] : sets.length === 2 ? [[cx - 0.55 * r, cy], [cx + 0.55 * r, cy]] : [[cx - 0.55 * r, cy - 0.32 * r], [cx + 0.55 * r, cy - 0.32 * r], [cx, cy + 0.62 * r]];
  const mean = (ps: [number, number][]) => ps.reduce(([a, b], [x, y]) => [a + x / ps.length, b + y / ps.length], [0, 0]), m = mean(at);
  const out = [`<svg viewBox="0 0 ${W} ${Math.max(...at.map(([, y]) => y)) + r + 30}" width="100%" role="img" aria-label="euler">`];
  sets.forEach((s, i) => {
    const [x, y] = at[i], d = Math.hypot(x - m[0], y - m[1]) || 1, [lx, ly] = sets.length === 1 ? [x, y - r - 8] : [x + (x - m[0]) / d * (r + 14), y + (y - m[1]) / d * (r + 14)];
    out.push(`<circle cx="${x}" cy="${y}" r="${r}" style="fill:color-mix(in srgb, ${HUES[i]} 10%, transparent);stroke:${HUES[i]};stroke-width:1.5"/><text x="${lx}" y="${ly + 4}" text-anchor="middle">${esc(unquote(s))}</text>`);
  });
  for (const g of groups) {
    const c = mean(g.in.map((s) => at[sets.indexOf(s)])), [x, y] = g.in.length === sets.length ? m : [c[0] + 0.6 * (c[0] - m[0]), c[1] + 0.6 * (c[1] - m[1])];
    g.rows.forEach((row, k) => out.push(chip(v, row, x, y + 4 + (k - (g.rows.length - 1) / 2) * 17)));
  }
  return out.join('') + '</svg>';
}

/** A decision table: a rule a column, the columns `condition` shows above the ones `action` shows; a rule's tags mark its head, a cell's the cell. */
export function decisionHtml(v: View): string {
  const { rows, cols } = grid(v), acts = new Set(v.facts.filter((f) => f.rel === 'shows' && unquote(f.args[0]) === 'action').map((f) => f.args[1]));
  const line = (c: string) => `<tr><th>${esc(unquote(c))}</th>${rows.map((r) => { const f = valueOf(v, r, c), tags = [...cellTags(v, r, c), ...(f?.change ? [f.change] : [])]; return `<td data-mark="${esc(r)}" class="${esc(tags.join(' '))}">${f ? esc(unquote(f.args[2])) : ''}</td>`; }).join('')}</tr>`;
  const part = (name: string, cs: string[]) => cs.length ? `<tr><th colspan="${rows.length + 1}" class="mute">${name}</th></tr>${cs.map(line).join('')}` : '';
  return `<table class="view" aria-label="decision"><thead><tr><th></th>${rows.map((r) => `<th data-mark="${esc(r)}" class="${esc(tagsOf(v, r).join(' '))}">${esc(label(v, r))}</th>`).join('')}</tr></thead>`
    + `<tbody>${part('conditions', cols.filter((c) => !acts.has(c)))}${part('actions', cols.filter((c) => acts.has(c)))}</tbody></table>`;
}

const mount = (f: (v: View) => string) => (el: HTMLElement, v: View) => { el.innerHTML = f(v); };
export const pictures: Picture[] = [
  { kind: 'chart', mount: mount(chartSvg) }, { kind: 'heatmap', mount: mount(heatmapSvg) },
  { kind: 'euler', mount: mount(eulerSvg) }, { kind: 'upset', mount: mount(upsetSvg) }, { kind: 'decision', mount: mount(decisionHtml) },
];

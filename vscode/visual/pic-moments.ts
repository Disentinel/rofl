// Time as a timeline (points on one axis, labels stacked clear of each other) or a timing diagram (a lane per signal, stepping between states).
import { unquote, type View } from '../../notebook/draw.ts';
import { esc, tagsOf, type Picture } from './picture.ts';

const HATCH = '<pattern id="rofl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--p-warn-bg)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--p-warn)" stroke-width="2"/></pattern>';
const cls = (v: View, id: string) => esc(tagsOf(v, id).join(' '));
const named = (v: View, id: string) => `${v.marks[id]?.label ?? unquote(id)}${tagsOf(v, id).length ? ` [${tagsOf(v, id).join(', ')}]` : ''}`;
const scale = (t0: number, t1: number, a: number, b: number) => (t: number) => a + (t1 === t0 ? 0 : (t - t0) / (t1 - t0)) * (b - a);
const ticks = (t0: number, t1: number) => [...new Set([...Array(6).keys()].map((k) => Math.round(t0 + (t1 - t0) * k / 5)))];

/** Each point on one axis; its label on the first level, above or below by turns, where it clears the label before it. */
export function timelineSvg(v: View): string {
  const ev = v.facts.filter((f) => f.rel === 'happens').map((f) => ({ id: f.args[0], t: Number(f.args[1]) })).sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  const t0 = ev[0].t, t1 = ev.at(-1)!.t, W = 680, x = scale(t0, t1, 24, W - 180), ends: number[] = [];
  const at = ev.map((e) => {
    const w = named(v, e.id).length * 6.6, k = [...Array(ends.length + 1).keys()].find((i) => !(ends[i] > x(e.t) - 3))!;
    ends[k] = x(e.t) + w;
    return { ...e, side: k % 2 ? 1 : -1, depth: Math.floor(k / 2) + 1 };
  });
  const deep = Math.max(...at.map((e) => e.depth)), R = 18, axis = 14 + deep * R;
  const out = [`<svg viewBox="0 0 ${W} ${2 * axis + 24}" width="100%" role="img" aria-label="timeline"><defs>${HATCH}</defs>`,
    `<g class="axis"><line x1="16" x2="${W - 16}" y1="${axis}" y2="${axis}"/>${ticks(t0, t1).map((t) => `<text x="${x(t)}" y="${2 * axis + 18}" text-anchor="middle">${t}</text>`).join('')}</g>`];
  for (const e of at) {
    const y = axis + e.side * e.depth * R;
    out.push(`<g class="axis"><line x1="${x(e.t)}" x2="${x(e.t)}" y1="${axis}" y2="${y + (e.side < 0 ? 4 : -10)}"/></g>`,
      `<text x="${x(e.t) - 3}" y="${y}" pointer-events="none">${esc(named(v, e.id))}</text>`,
      `<circle data-mark="${esc(e.id)}" class="${cls(v, e.id)}" cx="${x(e.t)}" cy="${axis}" r="5"><title>${esc(named(v, e.id))} at ${e.t}</title></circle>`);
  }
  return out.join('') + '</svg>';
}

/** A band per lane, a row per state the lane is ever in (the first it is in at the bottom); an interval is a bar on its state's row. */
export function timingSvg(v: View): string {
  const lane = new Map(v.facts.filter((f) => f.rel === 'lane').map((f) => [f.args[0], unquote(f.args[1])]));
  const state = new Map(v.facts.filter((f) => f.rel === 'in_state').map((f) => [f.args[0], unquote(f.args[1])]));
  const spans = v.facts.filter((f) => f.rel === 'during' && state.has(f.args[0])).map((f) => ({ id: f.args[0], lane: lane.get(f.args[0]) ?? '(no lane)', s: state.get(f.args[0])!, from: Number(f.args[1]), to: Number(f.args[2]) })).sort((a, b) => a.from - b.from);
  if (!spans.length) return '<div class="mute" style="padding:8px">no interval is in a state</div>';
  const t0 = Math.min(...spans.map((s) => s.from)), t1 = Math.max(...spans.map((s) => s.to)), W = 680, L = 170, S = 16, x = scale(t0, t1, L, W - 12);
  const bands = [...new Set(spans.map((s) => s.lane))].sort().map((name) => ({ name, states: [...new Set(spans.filter((s) => s.lane === name).map((s) => s.s))] }));
  const top = new Map<string, number>();
  let y = 8;
  for (const b of bands) { top.set(b.name, y); y += b.states.length * S + 14; }
  const row = (l: string, s: string) => { const b = bands.find((x) => x.name === l)!; return top.get(l)! + (b.states.length - 1 - b.states.indexOf(s)) * S + S / 2; };
  const out = [`<svg viewBox="0 0 ${W} ${y + 18}" width="100%" role="img" aria-label="timing"><defs>${HATCH}</defs>`,
    `<g class="lanes">${bands.map((b) => `<text x="4" y="${top.get(b.name)! + 12}">${esc(b.name)}</text>${b.states.map((s) => `<text x="${L - 6}" y="${row(b.name, s) + 4}" text-anchor="end">${esc(s)}</text>`).join('')}<line x1="4" x2="${W - 8}" y1="${top.get(b.name)! + b.states.length * S + 6}" y2="${top.get(b.name)! + b.states.length * S + 6}"/>`).join('')}</g>`,
    `<g class="axis">${ticks(t0, t1).map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="8" y2="${y - 8}"/><text x="${x(t)}" y="${y + 10}" text-anchor="middle">${t}</text>`).join('')}</g>`];
  for (const b of bands) {
    const mine = spans.filter((s) => s.lane === b.name);
    mine.forEach((s, k) => {
      const next = mine[k + 1];
      if (next && next.from === s.to) out.push(`<line x1="${x(s.to)}" x2="${x(s.to)}" y1="${row(b.name, s.s)}" y2="${row(b.name, next.s)}" stroke="var(--p-mute)"/>`);
      out.push(`<rect data-mark="${esc(s.id)}" class="${cls(v, s.id)}" x="${x(s.from)}" y="${row(b.name, s.s) - 4}" width="${Math.max(3, x(s.to) - x(s.from))}" height="8" rx="2"><title>${esc(b.name)} ${esc(s.s)} from ${s.from} to ${s.to}${tagsOf(v, s.id).length ? ` [${esc(tagsOf(v, s.id).join(', '))}]` : ''}</title></rect>`);
    });
  }
  return out.join('') + '</svg>';
}

export const pictures: Picture[] = [
  { kind: 'timeline', mount: (el, v) => { el.innerHTML = timelineSvg(v); } },
  { kind: 'timing', mount: (el, v) => { el.innerHTML = timingSvg(v); } },
];

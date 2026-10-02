// Time as an SVG: a lane per row, a bar per interval, a diamond per point, an arrow per message.
import { unquote, type Fact, type View } from '../../notebook/draw.ts';
import { esc, tagsOf, type Picture } from './picture.ts';

/** A lane's group, by the lane's name: a click on its label opens or shuts it (zoom). */
const groupOf = (v: View) => new Map(v.facts.filter((f) => f.rel === 'lane_group').map((f) => [unquote(f.args[0]), f.args[1]]));

export function timeSvg(v: View): string {
  const lane = new Map(v.facts.filter((f) => f.rel === 'lane').map((f) => [f.args[0], unquote(f.args[1])]));
  const items = v.facts.filter((f) => ['during', 'happens', 'message'].includes(f.rel)), laneOf = (f: Fact) => lane.get(f.args[0]) ?? '(no lane)';
  const lanes = [...new Set(items.flatMap((f) => f.rel === 'message' ? [unquote(f.args[1]), unquote(f.args[2])] : [laneOf(f)]))].sort(), g = groupOf(v);
  const times = items.flatMap((f) => f.rel === 'during' ? [f.args[1], f.args[2]] : [f.args[f.rel === 'happens' ? 1 : 3]]).map(Number);
  if (!times.length) return '<div class="mute" style="padding:8px">nothing on the time axis</div>';
  const t0 = Math.min(...times), t1 = Math.max(...times), L = 96, W = 680, H = 30, top = 10;
  const x = (t: number) => L + (t1 === t0 ? 0 : (t - t0) / (t1 - t0)) * (W - L - 16), y = (l: string) => top + lanes.indexOf(l) * H;
  const cls = (id: string) => esc(tagsOf(v, id).join(' ')), tip = (id: string) => `<title>${esc(v.marks[id]?.label ?? id)}${tagsOf(v, id).length ? ` [${esc(tagsOf(v, id).join(', '))}]` : ''}</title>`;
  const ticks = [...Array(6).keys()].map((k) => Math.round(t0 + (t1 - t0) * k / 5));
  const out = [`<svg viewBox="0 0 ${W} ${top + lanes.length * H + 26}" width="100%" role="img" aria-label="gantt"><defs><pattern id="rofl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--p-warn-bg)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--p-warn)" stroke-width="2"/></pattern><marker id="rofl-arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="var(--p-mute)"/></marker></defs>`,
    `<g class="lanes">${lanes.map((l) => `<line x1="${L}" x2="${W - 8}" y1="${y(l) + H - 2}" y2="${y(l) + H - 2}"/><text x="4" y="${y(l) + H / 2 + 3}"${g.has(l) ? ` data-group="${esc(g.get(l)!)}"` : ''}>${esc(l)}</text>`).join('')}</g>`,
    `<g class="axis">${ticks.map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${top + lanes.length * H}"/><text x="${x(t) - 12}" y="${top + lanes.length * H + 16}">${t}</text>`).join('')}</g>`];
  for (const f of items) {
    const id = f.args[0];
    if (f.rel === 'during') {
      const x0 = x(Number(f.args[1])), w = Math.max(3, x(Number(f.args[2])) - x0), label = v.marks[id]?.label ?? id;
      out.push(`<rect data-mark="${esc(id)}" class="${cls(id)}" x="${x0}" y="${y(laneOf(f)) + 5}" width="${w}" height="${H - 12}" rx="3">${tip(id)}</rect>`);
      if (w > label.length * 6.6 + 6) out.push(`<text x="${x0 + 4}" y="${y(laneOf(f)) + H / 2 + 3}" pointer-events="none">${esc(label)}</text>`);
    }
    if (f.rel === 'happens') { const cx = x(Number(f.args[1])), cy = y(laneOf(f)) + H / 2 - 1; out.push(`<path data-mark="${esc(id)}" class="${cls(id)}" d="M${cx} ${cy - 7}L${cx + 7} ${cy}L${cx} ${cy + 7}L${cx - 7} ${cy}z">${tip(id)}</path>`); }
    if (f.rel === 'message') out.push(`<line data-mark="${esc(id)}" class="${cls(id)}" x1="${x(Number(f.args[3]))}" x2="${x(Number(f.args[3]))}" y1="${y(unquote(f.args[1])) + H / 2}" y2="${y(unquote(f.args[2])) + H / 2}" marker-end="url(#rofl-arr)">${tip(id)}</line>`);
  }
  return out.join('') + '</svg>';
}

/** Messages as a sequence diagram: a lifeline per lane, time down the page, an arrow per message labelled with its mark. */
export function sequenceSvg(v: View): string {
  const msgs = v.facts.filter((f) => f.rel === 'message').sort((a, b) => Number(a.args[3]) - Number(b.args[3]) || a.args[0].localeCompare(b.args[0]));
  const who = [...new Set(msgs.flatMap((f) => [f.args[1], f.args[2]]))], g = groupOf(v), W = Math.max(360, who.length * 150), top = 34, H = 34;
  const x = (p: string) => 70 + who.indexOf(p) * ((W - 140) / Math.max(1, who.length - 1)), end = top + msgs.length * H + 10;
  const out = [`<svg viewBox="0 0 ${W} ${end + 10}" width="100%" role="img" aria-label="sequence"><defs><marker id="rofl-seq" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="var(--p-mute)"/></marker></defs>`,
    `<g class="lanes">${who.map((p) => `<line x1="${x(p)}" x2="${x(p)}" y1="${top - 8}" y2="${end}"/><text x="${x(p)}" y="${top - 14}" text-anchor="middle"${g.has(unquote(p)) ? ` data-group="${esc(g.get(unquote(p))!)}"` : ''}>${esc(unquote(p))}</text>`).join('')}</g>`];
  msgs.forEach((f, k) => {
    const id = f.args[0], y = top + k * H + H / 2, [a, b] = [x(f.args[1]), x(f.args[2])], label = `${v.marks[id]?.label ?? id} at ${f.args[3]}`;
    out.push(`<line data-mark="${esc(id)}" class="${esc(tagsOf(v, id).join(' '))}" x1="${a}" x2="${b === a ? a + 30 : b}" y1="${y}" y2="${y}" marker-end="url(#rofl-seq)"><title>${esc(label)}</title></line>`,
      `<text x="${(a + b) / 2}" y="${y - 5}" text-anchor="middle" pointer-events="none">${esc(label)}${tagsOf(v, id).length ? ` [${esc(tagsOf(v, id).join(', '))}]` : ''}</text>`);
  });
  return out.join('') + '</svg>';
}

export const pictures: Picture[] = [{ kind: 'time', mount: (el, v) => { el.innerHTML = v.facts.some((f) => f.rel === 'message') ? sequenceSvg(v) : timeSvg(v); } }];

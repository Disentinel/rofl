// Space as an SVG at the geometry the data gives: a point a dot, a box or a region a polygon, a link a line; a map (lonlat) north up on a
// graticule, a plan y down, axes y up with their names. Nothing is laid out, so the positions it reports are the data's, read back.
import { linkTags, unquote, type View } from '../../notebook/draw.ts';
import { shapes } from '../../notebook/draw-space.ts';
import { esc, layouts, tagsOf, type Picture } from './picture.ts';

export function spaceSvg(v: View, el?: HTMLElement): string {
  const at = shapes(v), proj = unquote(v.facts.find((f) => f.rel === 'projection')?.args[0] ?? 'axes');
  const axis = (a: string) => unquote(v.facts.find((f) => f.rel === 'axis' && unquote(f.args[0]) === a)?.args[1] ?? '');
  const pts = [...at.values()].flatMap((s) => s.point ? [s.point] : s.ring ?? []);
  if (!pts.length) return '<div class="mute" style="padding:8px">nothing placed</div>';
  const [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))], [y0, y1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  const pad = proj === 'axes' ? 44 : 24, W = 680, dx = Math.max(1, x1 - x0), dy = Math.max(1, y1 - y0);
  const right = 90;   // room for the labels of the marks furthest right
  const k = proj === 'axes' ? Math.min((W - 2 * pad - right) / dx, 360 / dy) : (W - 2 * pad - right) / dx, H = Math.round(dy * k + 2 * pad);
  const up = proj !== 'plan';   // a map and axes grow up the page, a plan down it
  const X = (x: number) => pad + (x - x0) * k, Y = (y: number) => up ? H - pad - (y - y0) * k : pad + (y - y0) * k;
  const back = (px: number, py: number) => [x0 + (px - pad) / k, up ? y0 + (H - pad - py) / k : y0 + (py - pad) / k].map((n) => Math.round(n * 100) / 100);
  const anchor = (m: string) => { const s = at.get(m); if (!s) return undefined; if (s.point) return s.point; const r = s.ring!.slice(0, -1); return [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length] as [number, number]; };
  const groups = new Set(v.facts.filter((f) => f.rel === 'inside').map((f) => f.args[1]));
  const cls = (m: string) => esc(tagsOf(v, m).join(' '));
  const out = [`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="space"><defs><pattern id="rofl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--p-warn-bg)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--p-warn)" stroke-width="2"/></pattern></defs>`];
  if (proj === 'lonlat') {   // a graticule every ten degrees
    for (let x = Math.ceil(x0 / 10) * 10; x <= x1; x += 10) out.push(`<g class="axis"><line x1="${X(x)}" x2="${X(x)}" y1="${pad / 2}" y2="${H - pad / 2}"/><text x="${X(x) + 2}" y="${H - 4}">${x}°</text></g>`);
    for (let y = Math.ceil(y0 / 10) * 10; y <= y1; y += 10) out.push(`<g class="axis"><line x1="${pad / 2}" x2="${W - pad / 2}" y1="${Y(y)}" y2="${Y(y)}"/><text x="2" y="${Y(y) - 2}">${y}°</text></g>`);
  }
  if (proj === 'axes') out.push(`<g class="axis"><line x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}"/><line x1="${pad}" x2="${pad}" y1="${pad}" y2="${H - pad}"/><text x="${W - pad}" y="${H - pad + 16}" text-anchor="end">${esc(axis('x'))}</text><text x="${pad - 6}" y="${pad - 8}">${esc(axis('y'))}</text></g>`);
  for (const [m, s] of at) if (s.ring) {
    const r = s.ring.map((p) => `${X(p[0])},${Y(p[1])}`).join(' '), group = groups.has(m) || tagsOf(v, m).includes('collapsed');
    out.push(`<polygon ${group ? `data-group="${esc(m)}"` : `data-mark="${esc(m)}"`} class="region ${cls(m)}" points="${r}"><title>${esc(v.marks[m]?.label ?? m)}</title></polygon>`,
      `<text x="${X(s.ring[0][0]) + 4}" y="${up ? Y(Math.max(...s.ring.map((p) => p[1]))) + 14 : Y(s.ring[0][1]) + 14}" pointer-events="none">${esc(v.marks[m]?.label ?? m)}</text>`);
  }
  for (const f of v.facts.filter((x) => x.rel === 'link')) {
    const [a, b] = [anchor(f.args[0]), anchor(f.args[1])]; if (!a || !b) continue;
    out.push(`<line data-mark="${esc(f.args[0])}" class="link ${esc(linkTags(v, f).join(' '))}" x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}"/>`);
  }
  for (const [m, s] of at) if (s.point) out.push(`<circle data-mark="${esc(m)}" data-at="${s.point.join(' ')}" class="${cls(m)}" cx="${X(s.point[0])}" cy="${Y(s.point[1])}" r="6"><title>${esc(v.marks[m]?.label ?? m)}</title></circle>`,
    `<text x="${X(s.point[0]) + 9}" y="${Y(s.point[1]) + 4}" pointer-events="none">${esc(v.marks[m]?.label ?? m)}</text>`);
  // each point as the data puts it, read back from where it was drawn, and where it was drawn on the page (y down), which says which way is up
  if (el) layouts.set(el, () => [...el.querySelectorAll<SVGCircleElement>('circle[data-mark]')].flatMap((c) => {
    const [px, py] = [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))], [x, y] = back(px, py);
    return [`at(${c.dataset.mark}, ${x}, ${y}).`, `drawn_at(${c.dataset.mark}, ${Math.round(px)}, ${Math.round(py)}).`];
  }).sort());
  return out.join('') + '</svg>';
}

export const pictures: Picture[] = [{ kind: 'space', mount: (el, v) => { el.innerHTML = spaceSvg(v, el); } }];

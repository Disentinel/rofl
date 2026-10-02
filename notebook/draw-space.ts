// Space as GeoJSON, the standard a map or a plan is exchanged in (a point a Point, a box or a region a Polygon), and axes as a Vega-Lite point chart.
import { colourOf, linkTags, nodes, unquote, type Backend, type View } from './draw.ts';

const num = Number;
/** Each mark's geometry as GeoJSON coordinates: a point, a box's four corners, a region's corners in order, the ring closed. */
export function shapes(v: View): Map<string, { point?: [number, number]; ring?: [number, number][] }> {
  const out = new Map<string, { point?: [number, number]; ring?: [number, number][] }>();
  for (const f of v.facts) {
    if (f.rel === 'at') out.set(f.args[0], { point: [num(f.args[1]), num(f.args[2])] });
    if (f.rel === 'box') { const [x, y, w, h] = f.args.slice(1).map(num); out.set(f.args[0], { ring: [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]] }); }
  }
  const corners = new Map<string, [number, number, number][]>();
  for (const f of v.facts.filter((x) => x.rel === 'corner')) corners.set(f.args[0], [...(corners.get(f.args[0]) ?? []), [num(f.args[1]), num(f.args[2]), num(f.args[3])]]);
  for (const [m, cs] of corners) { const ring = cs.sort((a, b) => a[0] - b[0]).map(([, x, y]) => [x, y] as [number, number]); out.set(m, { ring: [...ring, ring[0]] }); }
  return out;
}

function geojson(v: View): string {
  const at = shapes(v), mark = (m: string) => ({ mark: m, label: v.marks[m]?.label ?? unquote(m), tags: v.marks[m]?.tags ?? [], from: v.marks[m]?.from ?? [], ...(v.marks[m]?.icon && { icon: v.marks[m].icon }), ...(colourOf(v, v.marks[m]?.tags ?? []) && { colour: colourOf(v, v.marks[m].tags) }) });
  const features = [
    ...nodes(v).flatMap((m) => { const s = at.get(m); return !s ? [] : [{ type: 'Feature', geometry: s.point ? { type: 'Point', coordinates: s.point } : { type: 'Polygon', coordinates: [s.ring] }, properties: mark(m) }]; }),
    ...v.facts.filter((f) => f.rel === 'link').flatMap((f) => {
      const [a, b] = [at.get(f.args[0]), at.get(f.args[1])].map((s) => s?.point ?? s?.ring?.[0]);
      return a && b ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [a, b] }, properties: { link: [f.args[0], f.args[1]], tags: linkTags(v, f) } }] : [];
    }),
  ];
  return JSON.stringify({ type: 'FeatureCollection', ...(v.facts.some((f) => f.rel === 'projection') && { projection: unquote(v.facts.find((f) => f.rel === 'projection')!.args[0]) }), features }, null, 1);
}

function vegaLite(v: View): string {
  const at = shapes(v), axis = (a: string) => unquote(v.facts.find((f) => f.rel === 'axis' && f.args[0] === a)?.args[1] ?? a);
  const values = nodes(v).flatMap((m) => { const p = at.get(m)?.point; return p ? [{ mark: v.marks[m].label, x: p[0], y: p[1], tags: v.marks[m].tags.join(' ') }] : []; });
  return JSON.stringify({ $schema: 'https://vega.github.io/schema/vega-lite/v5.json', data: { values },
    layer: [{ data: { values: v.facts.filter((f) => f.rel === 'link').flatMap((f) => { const [a, b] = [at.get(f.args[0])?.point, at.get(f.args[1])?.point]; return a && b ? [{ x: a[0], y: a[1], x2: b[0], y2: b[1] }] : []; }) },
      mark: 'rule', encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' }, x2: { field: 'x2' }, y2: { field: 'y2' } } },
      { mark: 'point', encoding: { x: { field: 'x', type: 'quantitative', title: axis('x') }, y: { field: 'y', type: 'quantitative', title: axis('y') }, color: { field: 'tags', type: 'nominal' }, tooltip: [{ field: 'mark' }, { field: 'tags' }] } },
      { mark: { type: 'text', dy: -8 }, encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' }, text: { field: 'mark' } } }] }, null, 1);
}

const axes = (v: View) => v.facts.some((f) => f.rel === 'axis') && !v.facts.some((f) => f.rel === 'projection');
export const backends: Backend[] = [{ kind: 'space', format: 'vega-lite', fence: 'json', when: axes, write: vegaLite }, { kind: 'space', format: 'geojson', fence: 'json', write: geojson }];

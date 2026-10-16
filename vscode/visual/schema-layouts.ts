// The schema's layouts beyond ELK's: lanes, a timeline, a matrix, a table, a treemap, a quadrant, rings round a centre, a tidy tree, a ring.
import { layout, type Ctx, type Placed } from './schema.ts';

/** The schema, with every layout here known to it. */
export { schema } from './schema.ts';

type Any = Record<string, any>;
type At = { x: number; y: number };
const nd = (c: Pick<Ctx, 'node'>, id: string) => c.node(id) as Any;

// Swimlanes: each child frame is a horizontal band, bands stand one under another and are all as wide as the widest.
// Inside a band ('lane-steps') boxes stand in a row from left to right, in the order of their `order` (else the order given).
{
  const GAP = 14, STEP = 26;
  const bands = ({ ids, size }: Ctx): Placed => {
    const w = Math.max(...ids.map((id) => size(id).w)), pos: Record<string, At> = {};
    let y = 0;
    for (const id of ids) { const s = size(id); s.w = w; pos[id] = { x: 0, y }; y += s.h + GAP; }
    return { pos };
  };
  layout('lanes', { place: bands, keep: bands });
  const steps = ({ ids, size, node }: Ctx): Placed => {
    const ord = (id: string) => ((node(id) as Any).order ?? 1e6) as number;
    const sorted = [...ids].sort((a, b) => ord(a) - ord(b) || ids.indexOf(a) - ids.indexOf(b)), pos: Record<string, At> = {};
    let x = 0;
    for (const id of sorted) { pos[id] = { x, y: 0 }; x += size(id).w + STEP; }
    return { pos };
  };
  layout('lane-steps', { place: steps, keep: steps });
}

// timeline: x from node.t (number, in the unit of data.timeline), rows by node.lane, boxes packed so they never overlap.
// data.timeline = { px: pixels per unit, t0, ticks: [{t, label, major?}], marks: [{t, label}], lanes: [{id, label}] }
// A frame may carry its own `timeline`. A box with `lane` missing goes to the first lane; a note (no t) goes under all lanes, under its target.
{
  const GAP = 24, ROWGAP = 26, LANEGAP = 10;
  const esc = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  type Row = { end: number; ids: string[]; h: number };
  // no spec: a lane per `lane` value as met, a tick per time, the closest two times a box and a gap apart
  const guess = (ctx: Ctx): Any => {
    const ids = ctx.ids.filter((id) => nd(ctx, id).t != null), ns = ids.map((id) => nd(ctx, id)), ts = [...new Set(ns.map((n) => Number(n.t)))].sort((a, b) => a - b);
    const step = Math.min(...ts.slice(1).map((t, i) => t - ts[i]), Infinity), w = Math.max(0, ...ids.map((id) => ctx.size(id).w));
    return { t0: ts[0] ?? 0, px: isFinite(step) ? (w + GAP) / step : 1, ticks: ts.map((t) => ({ t, label: String(t), major: true })),
      lanes: [...new Set(ns.map((n) => n.lane).filter((l) => l != null))].map((l) => ({ id: l, label: String(l) })) };
  };
  const build = (ctx: Ctx): Placed => {
    const cfg: Any = (ctx.scope && nd(ctx, ctx.scope).timeline) || (ctx.data as Any).timeline || guess(ctx);
    const bare = cfg.axis === false, HEADER = bare ? 0 : 24, AX = bare ? 0 : 40;
    const px = cfg.px ?? 1, t0 = cfg.t0 ?? 0, lanes: Any[] = cfg.lanes?.length ? cfg.lanes : [{ id: '', label: '' }];
    const X = (t: number) => Math.round((t - t0) * px);
    const timed: string[] = [], loose: string[] = [];
    for (const id of ctx.ids) { const n = nd(ctx, id); (n.kind === 'note' || n.t == null ? loose : timed).push(id); }
    const by: Record<string, string[]> = Object.fromEntries(lanes.map((l) => [l.id, []]));
    for (const id of timed) { const n = nd(ctx, id), k = by[n.lane] ? n.lane : lanes[0].id; by[k].push(id); }
    const pos: Record<string, { x: number; y: number; row?: Row }> = {};
    let y = AX, right = 0;
    const bands: { l: Any; top: number; bottom: number }[] = [];
    for (const l of lanes) {
      const items = by[l.id].sort((a, b) => nd(ctx, a).t - nd(ctx, b).t || a.localeCompare(b));
      const rows: Row[] = [];
      for (const id of items) {
        const s = ctx.size(id), x = X(nd(ctx, id).t);
        let r = rows.find((row) => x >= row.end + GAP);
        if (!r) { r = { end: -Infinity, ids: [], h: 0 }; rows.push(r); }
        r.ids.push(id); r.end = x + s.w; r.h = Math.max(r.h, s.h); pos[id] = { x, y: 0, row: r };
        right = Math.max(right, x + s.w);
      }
      const top = y; let yy = y + HEADER;
      for (const r of rows) { for (const id of r.ids) pos[id] = { x: pos[id].x, y: yy }; yy += r.h + ROWGAP; }
      if (!rows.length) yy += 20;
      bands.push({ l, top, bottom: yy - ROWGAP / 2 + 6 });
      y = yy - ROWGAP / 2 + 6 + LANEGAP;
    }
    const laneBottom = y - LANEGAP;
    // loose boxes (notes) go under the lanes, near the first thing they point at
    let ny = laneBottom + 36; const nrows: Row[] = [];
    const anchor = (id: string) => { const l = ctx.links.find((k) => k.s === id && pos[k.t]); return l ? pos[l.t].x : 0; };
    for (const id of loose.sort((a, b) => anchor(a) - anchor(b))) {
      const s = ctx.size(id), x = Math.max(0, anchor(id));
      let r = nrows.find((row) => x >= row.end + GAP);
      if (!r) { r = { end: -Infinity, ids: [], h: 0 }; nrows.push(r); }
      r.ids.push(id); r.end = x + s.w; r.h = Math.max(r.h, s.h); pos[id] = { x, y: 0, row: r }; right = Math.max(right, x + s.w);
    }
    for (const r of nrows) { for (const id of r.ids) pos[id] = { x: pos[id].x, y: ny }; ny += r.h + ROWGAP; }
    const W = Math.max(right, ...((cfg.ticks ?? []).map((t: Any) => X(t.t)))) + 40;
    let d = '';
    const ticksOf: Any[] = cfg.ticks ?? [], LX = Math.max(0, Math.min(...Object.values(pos).map((p) => p.x)));
    bands.forEach((b, i) => {
      d += `<rect class="lane" x="${bare ? 0 : -12}" y="${b.top}" width="${bare ? W - 40 : W + 12}" height="${b.bottom - b.top}" rx="6" opacity="${i % 2 ? .5 : .85}"/>`;
      if (b.l.label && !bare) d += `<text x="${LX + 2}" y="${b.top + 16}" style="fill:var(--fg);font-size:12px;font-weight:700">${esc(b.l.label)}</text>`;
      const room = b.l.label ? b.l.label.length * 7.5 + 24 : 0;
      for (const t of bare ? [] : ticksOf) if (t.label && X(t.t) >= LX + room) d += `<text x="${X(t.t) + 4}" y="${b.top + 16}" style="fill:var(--muted);font-size:11px;font-family:var(--f-mono)">${esc(t.label)}</text>`;
    });
    if (!bare) d += `<line class="axis" x1="-12" y1="${AX - 6}" x2="${W}" y2="${AX - 6}"/>`;
    for (const t of bare ? [] : ticksOf) {
      const x = X(t.t);
      d += `<line class="axis" x1="${x}" y1="${AX - 6}" x2="${x}" y2="${laneBottom}" stroke-dasharray="2 5" opacity="${t.major ? .6 : .3}"/>`;
    }
    for (const m of (cfg.marks ?? []) as Any[]) {
      const x = X(m.t);
      d += `<line x1="${x}" y1="${AX - 6}" x2="${x}" y2="${laneBottom}" stroke="${m.color ?? '#e11d48'}" stroke-width="2" stroke-dasharray="5 4" opacity=".85"/>`;
      d += `<text x="${x + 4}" y="${laneBottom + 14}" style="fill:${m.color ?? '#e11d48'};font-size:11px;font-weight:600">${esc(m.label)}</text>`;
    }
    const out: Record<string, At> = {}; for (const id of Object.keys(pos)) out[id] = { x: pos[id].x, y: pos[id].y };
    return { pos: out, decor: d };
  };
  layout('timeline', { place: build, keep: build });
}

// matrix: a grid of boxes. A box with `row` and `col` (any keys) sits in that cell; a box with `head: 'row'`
// (and `row`) or `head: 'col'` (and `col`) is the head of its row or column. Order of keys = order of the heads,
// then of first appearance. The frame (or data) may carry `blocks: [{ from, to, label? }]`: diagonal key ranges to outline.
// A box with `span: n` spreads over n columns from its own. Boxes without a cell (notes) stand to the right of the grid.
{
  const GAP = 6, SIDE = 40;
  const grid = ({ ids, size, node: nodeOf, scope, data }: Ctx): Placed => {
    const node = (i: string) => nodeOf(i) as Any;
    const rows: string[] = [], cols: string[] = [], at = (a: string[], k: string) => { if (!a.includes(k)) a.push(k); };
    const heads = ids.filter((i) => node(i).head), cells = ids.filter((i) => !node(i).head && node(i).row != null && node(i).col != null), rest = ids.filter((i) => !heads.includes(i) && !cells.includes(i));
    for (const i of heads) { const n = node(i); if (n.head === 'row') at(rows, n.row); else at(cols, n.col); }
    for (const i of cells) { at(rows, node(i).row); at(cols, node(i).col); }
    const rh: Record<string, number> = {}, cw: Record<string, number> = {}, hw = Math.max(0, ...heads.filter((i) => node(i).head === 'row').map((i) => size(i).w)), hh = Math.max(0, ...heads.filter((i) => node(i).head === 'col').map((i) => size(i).h));
    for (const r of rows) rh[r] = 0; for (const c of cols) cw[c] = 0;
    for (const i of heads) { const n = node(i), s = size(i); if (n.head === 'row') rh[n.row] = Math.max(rh[n.row], s.h); else cw[n.col] = Math.max(cw[n.col], s.w); }
    for (const i of cells) { const n = node(i), s = size(i); rh[n.row] = Math.max(rh[n.row], s.h); if (!(n.span > 1)) cw[n.col] = Math.max(cw[n.col], s.w); }
    for (const i of cells) { const n = node(i); if (!(n.span > 1)) continue; const cs = cols.slice(cols.indexOf(n.col), cols.indexOf(n.col) + n.span), have = cs.reduce((a, c) => a + cw[c] + GAP, -GAP), need = size(i).w; if (need > have) cw[cs.at(-1)!] += need - have; }
    const x: Record<string, number> = {}, y: Record<string, number> = {}; let cx = hw ? hw + GAP : 0, cy = hh ? hh + GAP : 0;
    for (const c of cols) { x[c] = cx; cx += cw[c] + GAP; }
    for (const r of rows) { y[r] = cy; cy += rh[r] + GAP; }
    const W = Math.max(0, cx - GAP), H = Math.max(0, cy - GAP), pos: Record<string, At> = {};
    for (const i of cells) { const n = node(i), s = size(i); pos[i] = { x: x[n.col] + (n.span > 1 ? 0 : (cw[n.col] - s.w) / 2), y: y[n.row] + (rh[n.row] - s.h) / 2 }; }
    for (const i of heads) { const n = node(i), s = size(i); pos[i] = n.head === 'row' ? { x: hw - s.w, y: y[n.row] + (rh[n.row] - s.h) / 2 } : { x: x[n.col] + (cw[n.col] - s.w) / 2, y: hh - s.h }; }
    let ry = 0; for (const i of rest) { pos[i] = { x: W + SIDE, y: ry }; ry += size(i).h + GAP; }
    const spec: Any = scope ? node(scope) : data;
    let d = '';
    rows.forEach((r, k) => { if (cols[k] != null && cols[k] === r) d += `<rect class="lane" x="${x[r] - 3}" y="${y[r] - 3}" width="${cw[r] + 6}" height="${rh[r] + 6}" rx="6"></rect>`; });
    for (const r of rows) d += `<line class="axis" x1="0" x2="${W}" y1="${y[r] + rh[r] + GAP / 2}" y2="${y[r] + rh[r] + GAP / 2}"></line>`;
    for (const c of cols) d += `<line class="axis" y1="0" y2="${H}" x1="${x[c] + cw[c] + GAP / 2}" x2="${x[c] + cw[c] + GAP / 2}"></line>`;
    for (const b of (spec?.blocks ?? []) as Any[]) {
      const a = rows.indexOf(b.from), z = rows.indexOf(b.to), ca = cols.indexOf(b.from), cz = cols.indexOf(b.to); if (a < 0 || z < 0 || ca < 0 || cz < 0) continue;
      const X0 = x[cols[ca]] - 8, Y0 = y[rows[a]] - 8, X1 = x[cols[cz]] + cw[cols[cz]] + 8, Y1 = y[rows[z]] + rh[rows[z]] + 8;
      d += `<rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" rx="8" style="fill:none;stroke:var(--accent);stroke-width:2;stroke-dasharray:6 4"></rect>`;
      if (b.label) d += `<text class="sub" x="${X0 + 6}" y="${Y0 - 4}" style="fill:var(--accent)">${String(b.label).replace(/[<&]/g, '')}</text>`;
    }
    return { pos, decor: d };
  };
  layout('matrix', { place: grid, keep: grid });
}

// table: rows of boxes in named columns. A box has `row` (any key) and `col` (key of a column); several boxes in
// one cell stack downward. A box with `head: 'col'` and `col` is the column head. Rows keep the order of first appearance.
// Boxes without row/col (notes) stand to the right.
{
  const GAP = 8, COLGAP = 28, SIDE = 40;
  const table = ({ ids, size, node: nodeOf }: Ctx): Placed => {
    const node = (i: string) => nodeOf(i) as Any;
    const heads = ids.filter((i) => node(i).head), cells = ids.filter((i) => !node(i).head && node(i).row != null && node(i).col != null), rest = ids.filter((i) => !heads.includes(i) && !cells.includes(i));
    const rows: string[] = [], cols: string[] = [], at = (a: string[], k: string) => { if (!a.includes(k)) a.push(k); };
    for (const i of heads) at(cols, node(i).col);
    for (const i of cells) { at(rows, node(i).row); at(cols, node(i).col); }
    const cw: Record<string, number> = Object.fromEntries(cols.map((c) => [c, 0])), stack: Record<string, string[]> = {}, rh: Record<string, number> = Object.fromEntries(rows.map((r) => [r, 0]));
    for (const i of cells) { const n = node(i), k = n.row + '\u0000' + n.col; (stack[k] ??= []).push(i); cw[n.col] = Math.max(cw[n.col], size(i).w); }
    for (const i of heads) cw[node(i).col] = Math.max(cw[node(i).col], size(i).w);
    for (const k in stack) { const r = k.split('\u0000')[0]; rh[r] = Math.max(rh[r], stack[k].reduce((a, i) => a + size(i).h + GAP, -GAP)); }
    const hh = Math.max(0, ...heads.map((i) => size(i).h)), x: Record<string, number> = {}, y: Record<string, number> = {}; let cx = 0, cy = hh ? hh + GAP : 0;
    for (const c of cols) { x[c] = cx; cx += cw[c] + COLGAP; }
    for (const r of rows) { y[r] = cy; cy += rh[r] + GAP * 2; }
    const W = Math.max(0, cx - COLGAP), pos: Record<string, At> = {};
    for (const i of heads) { const n = node(i); pos[i] = { x: x[n.col] + (cw[n.col] - size(i).w) / 2, y: 0 }; }
    for (const k in stack) { const [r, c] = k.split('\u0000'); let yy = y[r] + (rh[r] - stack[k].reduce((a, i) => a + size(i).h + GAP, -GAP)) / 2; for (const i of stack[k]) { pos[i] = { x: x[c] + (cw[c] - size(i).w) / 2, y: yy }; yy += size(i).h + GAP; } }
    let ry = 0; for (const i of rest) { pos[i] = { x: W + SIDE, y: ry }; ry += size(i).h + GAP; }
    let d = '';
    rows.forEach((r, k) => { if (k % 2 === 0) d += `<rect class="lane" x="-8" y="${y[r] - GAP}" width="${W + 16}" height="${rh[r] + GAP * 2}" rx="6" style="opacity:.55"></rect>`; });
    return { pos, decor: d };
  };
  layout('table', { place: table, keep: table });
}

// treemap: tiles whose area follows node.weight (a frame's weight is the sum of its children). The whole nesting is tiled once,
// top-down, so every frame is exactly filled by its children and opening a frame changes nothing around it.
// Sizes are set through node.size (the core reads it); notes stand in a column to the right of the top level.
{
  const PAD = 16, HEAD = 46, DW = 76, DH = 36;
  type R = { x: number; y: number; w: number; h: number };
  const cache = new WeakMap<object, { rect: Record<string, R>; W: number; H: number }>();

  const squarify = (items: { id: string; d: number }[], X: number, Y: number, W: number, H: number, out: Record<string, R>) => {
    const total = items.reduce((a, i) => a + i.d, 0), k = (W * H) / total, list = items.map((i) => ({ id: i.id, a: i.d * k })).sort((p, q) => q.a - p.a);
    type Item = { id: string; a: number };
    const worst = (row: Item[], side: number) => { const s = row.reduce((a, r) => a + r.a, 0), mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a)); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
    let x = X, y = Y, w = W, h = H, row: Item[] = [];
    const flush = () => {
      const s = row.reduce((a, r) => a + r.a, 0);
      if (w >= h) { const rw = s / h; let yy = y; for (const r of row) { out[r.id] = { x, y: yy, w: rw, h: r.a / rw }; yy += r.a / rw; } x += rw; w -= rw; }
      else { const rh = s / w; let xx = x; for (const r of row) { out[r.id] = { x: xx, y, w: r.a / rh, h: rh }; xx += r.a / rh; } y += rh; h -= rh; }
      row = [];
    };
    for (const it of list) { const side = Math.min(w, h); if (row.length && worst([...row, it], side) > worst(row, side)) flush(); row.push(it); }
    if (row.length) flush();
  };

  const build = (data: Any) => {
    const MINW = data.minTile?.w ?? DW, MINH = data.minTile?.h ?? DH, ns = (data.nodes as Any[]).filter((n) => n.kind !== 'note'), kids: Record<string, Any[]> = {};
    for (const n of ns) (kids[n.parent ?? ''] ??= []).push(n);
    const leafW = ns.filter((n) => !kids[n.id]).map((n) => n.weight ?? 1).sort((a, b) => a - b), floor = (leafW[Math.floor(leafW.length * 0.65)] ?? 1) * 1;
    const dem: Record<string, number> = {};
    const demand = (n: Any): number => (dem[n.id] = kids[n.id] ? kids[n.id].reduce((a, c) => a + demand(c), 0) + floor * 4 : Math.max(n.weight ?? 1, floor));
    for (const n of kids[''] ?? []) demand(n);
    const top = kids[''] ?? [], sum = top.reduce((a, n) => a + dem[n.id], 0);
    let S = Math.max(sum * 40, 200000), R!: { rect: Record<string, R>; W: number; H: number };
    for (let it = 0; it < 60; it++) {
      const W = Math.round(Math.sqrt(S * 1.7)), H = Math.round(S / W), rect: Record<string, R> = {};
      const go = (scope: string, x: number, y: number, w: number, h: number) => {
        const items = (kids[scope] ?? []).map((n) => ({ id: n.id as string, d: dem[n.id] })), raw: Record<string, R> = {};
        if (!items.length) return;
        squarify(items, 0, 0, w, h, raw);
        for (const id in raw) { const r = raw[id], x0 = Math.round(r.x), y0 = Math.round(r.y), x1 = Math.round(r.x + r.w), y1 = Math.round(r.y + r.h); rect[id] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
        for (const id in raw) if (kids[id]) go(id, 0, 0, rect[id].w - 2 * PAD, rect[id].h - HEAD - PAD);
      };
      go('', 0, 0, W, H);
      const leaves = ns.filter((n) => !kids[n.id]).map((n) => rect[n.id]);
      R = { rect, W, H };
      if (leaves.filter((r) => r && r.w >= MINW && r.h >= MINH).length >= leaves.length * 0.75) break;
      S *= 1.25;
    }
    return R;
  };

  const place = (ctx: Ctx): Placed => {
    let T = cache.get(ctx.data); if (!T) cache.set(ctx.data, (T = build(ctx.data)));
    const pos: Record<string, At> = {}; let ny = 0;
    for (const id of ctx.ids) {
      const r = T.rect[id], n = nd(ctx, id);
      if (r) {
        pos[id] = { x: r.x, y: r.y };
        n.size = { w: r.w, h: r.h };
        const s = ctx.size(id); if (s !== n.size) { s.w = r.w; s.h = r.h; }
      } else { const s = ctx.size(id); pos[id] = ctx.scope ? { x: 0, y: (T.rect[ctx.scope]?.h ?? 0) + ny } : { x: T.W + 40, y: ny }; ny += s.h + 24; }
    }
    return { pos };
  };
  layout('treemap', { place, keep: place });
}

// quadrant: boxes stand where their numbers (qx, qy in 0..1; high qy is up) put them, two axes cross in the middle,
// the four quarters have names. A box without qx/qy goes to a row under the chart. The spec is {x, y, tl, tr, bl, br, hot, unplaced}
// on data.quadrant (top level) or on the frame's node (field `quadrant`).
{
  const GAP = 18, ML = 40, MT = 34, MB = 34, MR = 12;
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  type It = { id: string; w: number; h: number; tx: number; ty: number };
  type P = It & At;
  const solve = (items: It[], W: number, H: number) => {
    // items: [{id,w,h,tx,ty}] centres; push apart, then clamp into the chart
    const P: P[] = items.map((i) => ({ ...i, x: i.tx, y: i.ty }));
    const clamp = (p: P) => { p.x = Math.min(W - MR - p.w / 2, Math.max(ML + p.w / 2, p.x)); p.y = Math.min(H - MB - p.h / 2, Math.max(MT + p.h / 2, p.y)); };
    for (let it = 0; it < 900; it++) {
      let any = false;
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const a = P[i], b = P[j], dx = b.x - a.x, dy = b.y - a.y, ox = (a.w + b.w) / 2 + GAP - Math.abs(dx), oy = (a.h + b.h) / 2 + GAP - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue; any = true;
        if (ox / (a.w + b.w) < oy / (a.h + b.h)) { const s = (dx >= 0 ? 1 : -1) * ox / 2; a.x -= s; b.x += s; } else { const s = (dy >= 0 ? 1 : -1) * oy / 2; a.y -= s; b.y += s; }
      }
      for (const p of P) { if (it < 600) { p.x += (p.tx - p.x) * 0.04; p.y += (p.ty - p.y) * 0.04; } clamp(p); }
      if (!any && it > 600) break;
    }
    const clean = P.every((a, i) => P.every((b, j) => j <= i || Math.abs(a.x - b.x) >= (a.w + b.w) / 2 + GAP - 1 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2 + GAP - 1));
    return { P, clean };
  };
  const lay = (ctx: Ctx): Placed => {
    const spec: Any = (ctx.scope ? nd(ctx, ctx.scope).quadrant : (ctx.data as Any).quadrant) ?? {};
    const num = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
    const isNote = (id: string) => nd(ctx, id).kind === 'note' && !num(nd(ctx, id).qx);
    const hostOf = (id: string) => { const p = ctx.pairs.find(([a, b]) => (a === id || b === id) && !isNote(a === id ? b : a)); return p && (p[0] === id ? p[1] : p[0]); };
    const placed = ctx.ids.filter((id) => { const n = nd(ctx, id); return isNote(id) ? !!hostOf(id) : num(n.qx ?? n.x) && num(n.qy ?? n.y); }), loose = ctx.ids.filter((id) => !placed.includes(id));
    const total = placed.reduce((s, id) => s + (ctx.size(id).w + GAP) * (ctx.size(id).h + GAP), 0);
    let W = Math.max(980, Math.sqrt(total * 6) * 1.55), H = Math.max(600, W * 0.6), out!: ReturnType<typeof solve>;
    for (let tries = 0; tries < 8; tries++) {
      const at = (id: string) => { const n = nd(ctx, id); return { x: ML + (n.qx ?? n.x) * (W - ML - MR), y: MT + (1 - (n.qy ?? n.y)) * (H - MT - MB) }; };
      const items: It[] = placed.filter((id) => !isNote(id)).map((id) => { const s = ctx.size(id); return { id, w: s.w, h: s.h, tx: at(id).x, ty: at(id).y }; });
      for (const id of placed.filter(isNote)) { const s = ctx.size(id), host = items.find((i) => i.id === hostOf(id));
        const c = host ? { x: host.tx, y: host.ty } : { x: W / 2, y: H / 2 }; items.push({ id, w: s.w, h: s.h, tx: c.x + (c.x > W / 2 ? -1 : 1) * ((host?.w ?? 190) / 2 + s.w / 2 + 50), ty: c.y + (c.y > H / 2 ? -1 : 1) * 90 }); }
      out = solve(items, W, H); if (out.clean) break; W *= 1.18; H *= 1.18;
    }
    const pos: Record<string, At> = {};
    for (const p of out.P) pos[p.id] = { x: p.x - p.w / 2, y: p.y - p.h / 2 };
    // the chart is as wide as its boxes need (the fit looks at boxes), the crossing of the axes stays at the true middle
    const mx = ML + (W - ML - MR) / 2, my = MT + (H - MT - MB) / 2;
    const px = out.P.map((p) => p.x - p.w / 2), pxr = out.P.map((p) => p.x + p.w / 2), py = out.P.map((p) => p.y - p.h / 2), pyb = out.P.map((p) => p.y + p.h / 2);
    const L = Math.min(mx - 40, ...px) - 16, R = Math.max(mx + 40, ...pxr) + 16, T = Math.min(my - 40, ...py) - 30, B = Math.max(my + 40, ...pyb) + 30;
    // the row of boxes without a place
    let rx = 0, rowH = 0, ry = B + 56;
    for (const id of loose) { const s = ctx.size(id); if (rx > 0 && rx + s.w > R - L) { rx = 0; ry += rowH + GAP; rowH = 0; } pos[id] = { x: L + rx, y: ry }; rx += s.w + GAP; rowH = Math.max(rowH, s.h); }
    let d = '';
    const hot = ({ tl: [L, T, mx - L, my - T], tr: [mx, T, R - mx, my - T], bl: [L, my, mx - L, B - my], br: [mx, my, R - mx, B - my] } as Record<string, number[]>)[spec.hot];
    if (hot) d += `<rect class="lane" x="${hot[0]}" y="${hot[1]}" width="${hot[2]}" height="${hot[3]}" rx="8" style="fill:#e0555522"></rect>`;
    d += `<line class="axis" x1="${L}" y1="${my}" x2="${R}" y2="${my}"></line><line class="axis" x1="${mx}" y1="${T}" x2="${mx}" y2="${B}"></line>`;
    d += `<line class="axis" x1="${L}" y1="${T}" x2="${L}" y2="${B}"></line><line class="axis" x1="${L}" y1="${B}" x2="${R}" y2="${B}"></line>`;
    const q = (t: unknown, x: number, y: number, a: string) => t ? `<text class="sub" x="${x}" y="${y}" text-anchor="${a}" style="font-weight:600;font-size:13px">${esc(t)}</text>` : '';
    d += q(spec.tl, L + 8, T + 16, 'start') + q(spec.tr, R - 8, T + 16, 'end') + q(spec.bl, L + 8, B - 8, 'start') + q(spec.br, R - 8, B - 8, 'end');
    if (spec.x) d += `<text class="sub" x="${mx}" y="${B + 24}" text-anchor="middle">${esc(spec.x)}</text>`;
    if (spec.y) d += `<text class="sub" transform="translate(${L - 14},${my}) rotate(-90)" text-anchor="middle">${esc(spec.y)}</text>`;
    if (loose.length) d += `<text class="sub" x="${L}" y="${B + 46}" style="font-weight:600">${esc(spec.unplaced ?? 'Без места на картинке')}</text>`;
    // the frame fits itself to the boxes, so the picture is moved to start at 0,0 and the decor with it
    let x0 = Infinity, y0 = Infinity;
    for (const id of ctx.ids) { x0 = Math.min(x0, pos[id].x); y0 = Math.min(y0, pos[id].y); }
    for (const id of ctx.ids) { pos[id].x -= x0; pos[id].y -= y0; }
    return { pos, decor: `<g transform="translate(${-x0},${-y0})">${d}</g>` };
  };
  layout('quadrant', { place: lay, keep: lay });
}

// radial: one centre box (ring 0, or `centre: true`), rings around it by the node field `ring` (1, 2, 3...).
// A box leans toward the angle of the inner boxes it is linked to; `group` (a string) keeps neighbours together on a ring.
// The spec is {rings: ['1 шаг', ...], centre} on data.radial (top level) or on the frame's node (field `radial`).
{
  const GAP = 16;
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  const circ = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  type Item = { id: string; w: number; h: number; x: number; y: number; fix?: boolean; tx?: number; ty?: number; r?: number };
  const lay = (ctx: Ctx): Placed => {
    const spec: Any = (ctx.scope ? nd(ctx, ctx.scope).radial : (ctx.data as Any).radial) ?? {};
    const ring = (id: string): number => { const n = nd(ctx, id); if (n.kind === 'note' && n.ring == null) { const p = ctx.pairs.find(([a, b]) => (a === id || b === id) && nd(ctx, a === id ? b : a).kind !== 'note'); return p ? Math.max(1, ring(p[0] === id ? p[1] : p[0]) + 1) : 1; } return n.centre || n.ring === 0 ? 0 : Math.max(1, n.ring ?? 1); };
    const byRing: Record<number, string[]> = {}; for (const id of ctx.ids) (byRing[ring(id)] ??= []).push(id);
    const rs = Object.keys(byRing).map(Number).sort((a, b) => a - b);
    const nbr: Record<string, string[]> = {}; for (const [a, b] of ctx.pairs) { (nbr[a] ??= []).push(b); (nbr[b] ??= []).push(a); }
    const ang: Record<string, number> = {}, E: Record<number, { A: number; B: number }> = {}, items: Item[] = [];
    // the centre: one box, or a short row of them
    const c0 = byRing[0] ?? []; let cw = 0, ch = 0; for (const id of c0) { const s = ctx.size(id); cw += s.w + (cw ? GAP : 0); ch = Math.max(ch, s.h); }
    let cx = -cw / 2; for (const id of c0) { const s = ctx.size(id); items.push({ id, w: s.w, h: s.h, x: cx + s.w / 2, y: 0, fix: true }); cx += s.w + GAP; }
    // ellipse semi-axes per ring: wide boxes want more room around than up and down
    let prevA = cw / 2 + 60, prevB = ch / 2 + 50;
    for (const r of rs) {
      if (r === 0) continue;
      const ids = byRing[r], bw = Math.max(...ids.map((i) => ctx.size(i).w)), bh = Math.max(...ids.map((i) => ctx.size(i).h));
      let A = prevA + bw / 2 + 70, B = prevB + bh / 2 + 56;
      // enough perimeter for the boxes on the ring (Ramanujan), the ellipse stays about 1.6 : 1
      const need = ids.reduce((s, i) => s + ctx.size(i).w * 0.62 + ctx.size(i).h * 0.7 + GAP, 0), per = () => Math.PI * (3 * (A + B) - Math.sqrt((3 * A + B) * (A + 3 * B)));
      while (per() < need * 1.08) { A *= 1.08; B *= 1.08; }
      E[r] = { A, B }; prevA = A; prevB = B;
      const pref = ids.map((id, k) => {
        const inn = (nbr[id] ?? []).filter((o) => ang[o] != null);
        const a = inn.length ? Math.atan2(inn.reduce((s, o) => s + Math.sin(ang[o]), 0), inn.reduce((s, o) => s + Math.cos(ang[o]), 0)) : null;
        return { id, k, a };
      });
      // order around the ring: by preferred angle where there is one, else by group and order, then spread evenly with a minimum gap
      const grp = (id: string) => String(nd(ctx, id).group ?? '');
      const sorted = pref.slice().sort((p, q) => (p.a != null && q.a != null ? p.a - q.a : grp(ids[p.k]).localeCompare(grp(ids[q.k])) || p.k - q.k));
      const n = sorted.length, start = -Math.PI / 2 + (r % 2 ? 0 : Math.PI / n);
      sorted.forEach((p, i) => { ang[p.id] = start + (2 * Math.PI * i) / n; });
      // a lean toward the inner neighbours, kept in order
      for (const p of pref) if (p.a != null && n > 1) ang[p.id] = circ(ang[p.id] + 0.35 * circ(p.a - ang[p.id]));
      for (const id of ids) items.push({ id, w: ctx.size(id).w, h: ctx.size(id).h, x: E[r].A * Math.cos(ang[id]), y: E[r].B * Math.sin(ang[id]), tx: E[r].A * Math.cos(ang[id]), ty: E[r].B * Math.sin(ang[id]), r });
    }
    for (let it = 0; it < 800; it++) {
      let any = false;
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j]; if (a.fix && b.fix) continue;
        const dx = b.x - a.x, dy = b.y - a.y, ox = (a.w + b.w) / 2 + GAP - Math.abs(dx), oy = (a.h + b.h) / 2 + GAP - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue; any = true;
        const wa = a.fix ? 0 : b.fix ? 1 : 0.5, wb = 1 - wa;
        if (ox / (a.w + b.w) < oy / (a.h + b.h)) { const s = (dx >= 0 ? 1 : -1) * ox; a.x -= s * wa; b.x += s * wb; } else { const s = (dy >= 0 ? 1 : -1) * oy; a.y -= s * wa; b.y += s * wb; }
      }
      if (it < 500) for (const p of items) if (!p.fix) { p.x += (p.tx! - p.x) * 0.03; p.y += (p.ty! - p.y) * 0.03; }
      if (!any && it > 500) break;
    }
    const pos: Record<string, At> = {}; for (const p of items) pos[p.id] = { x: p.x - p.w / 2, y: p.y - p.h / 2 };
    let x0 = Infinity, y0 = Infinity; for (const id of ctx.ids) { x0 = Math.min(x0, pos[id].x); y0 = Math.min(y0, pos[id].y); }
    let d = '';
    for (const r of rs) if (r > 0) {
      const { A, B } = E[r]; d += `<ellipse class="axis" cx="0" cy="0" rx="${A}" ry="${B}" style="fill:none;stroke-dasharray:3 5"></ellipse>`;
      const lab = (spec.rings ?? [])[r - 1]; if (lab) d += `<text class="sub" x="${A * 0.7071 + 6}" y="${-B * 0.7071 - 4}" style="font-weight:600">${esc(lab)}</text>`;
    }
    for (const id of ctx.ids) { pos[id].x -= x0; pos[id].y -= y0; }
    return { pos, decor: `<g transform="translate(${-x0},${-y0})">${d}</g>` };
  };
  layout('radial', { place: lay, keep: lay });
}

// tidy tree: root on top, children evenly under their parent. Roots are found from the links
// (the node nothing points to; or, for proofs drawn toward the conclusion, the one that points to nothing).
layout('tree', {
  place: (ctx) => {
    const { ids, pairs, size } = ctx, GX = 28, GY = 70, COLS = 6;
    const set = new Set(ids), out: Record<string, string[]> = {}, inn: Record<string, string[]> = {};
    for (const id of ids) { out[id] = []; inn[id] = []; }
    for (const [a, b] of pairs) if (set.has(a) && set.has(b)) { out[a].push(b); inn[b].push(a); }
    const comp: Record<string, number> = {}, comps: string[][] = [];
    for (const id of ids) if (comp[id] == null) {
      const st = [id], m: string[] = []; comp[id] = comps.length;
      while (st.length) { const x = st.pop()!; m.push(x); for (const y of [...out[x], ...inn[x]]) if (comp[y] == null) { comp[y] = comps.length; st.push(y); } }
      comps.push(m);
    }
    const kids: Record<string, string[]> = {}, seen = new Set<string>(), roots: string[] = [];
    for (const m of comps) {
      const src = m.filter((x) => !inn[x].length), snk = m.filter((x) => !out[x].length);
      let up = false, rs = src;
      if (src.length !== 1 && snk.length === 1) { up = true; rs = snk; }
      if (!rs.length) rs = [m[0]];
      const nb = (x: string) => (up ? inn[x] : out[x]);
      const q = [...rs];
      for (const r of rs) { seen.add(r); kids[r] = []; roots.push(r); }
      while (q.length) { const x = q.shift()!; for (const y of nb(x)) if (!seen.has(y)) { seen.add(y); kids[y] = []; kids[x].push(y); q.push(y); } }
      for (const x of m) if (!seen.has(x)) { seen.add(x); kids[x] = []; roots.push(x); }
    }
    if (roots.length > 8) {
      const order: string[] = []; const q = [...roots]; const dep: Record<string, number> = {}; for (const r of roots) dep[r] = 0;
      while (q.length) { const x = q.shift()!; order.push(x); for (const c of kids[x]) { dep[c] = dep[x] + 1; q.push(c); } }
      order.sort((a, b) => dep[a] - dep[b]);
      const cw = Math.max(...ids.map((i) => size(i).w)), chh = Math.max(...ids.map((i) => size(i).h)), pos: Record<string, At> = {};
      order.forEach((x, k) => { pos[x] = { x: (k % 7) * (cw + GX), y: Math.floor(k / 7) * (chh + 24) }; });
      return { pos };
    }
    const all = (x: string): string[] => kids[x].flatMap((c) => [c, ...all(c)]);
    const squash = (x: string) => { const d = all(x); if (d.length > 24) { for (const c of d) kids[c] = []; kids[x] = d; } else for (const c of kids[x]) squash(c); };
    for (const r of roots) squash(r);
    const info: Record<string, { flat?: boolean; cw?: number; chh?: number; n?: number; w: number; hh?: number }> = {};
    const measure = (x: string) => {
      const s = size(x), ch = kids[x];
      for (const c of ch) measure(c);
      const flat = ch.length > 6 && ch.every((c) => !kids[c].length);
      let w = s.w;
      if (flat) {
        const cw = Math.max(...ch.map((c) => size(c).w)), chh = Math.max(...ch.map((c) => size(c).h)), n = Math.min(COLS, ch.length), rows = Math.ceil(ch.length / n);
        w = Math.max(s.w, n * cw + (n - 1) * GX); info[x] = { flat, cw, chh, n, w, hh: rows * chh + (rows - 1) * 20 };
      } else if (ch.length) w = Math.max(s.w, ch.reduce((a, c) => a + info[c].w, 0) + GX * (ch.length - 1));
      info[x] = { ...(info[x] ?? {}), flat, w };
    };
    const pos: Record<string, At> = {};
    const put = (x: string, left: number, y: number) => {
      const s = size(x), i = info[x], ch = kids[x];
      pos[x] = { x: left + (i.w - s.w) / 2, y };
      if (!ch.length) return;
      if (i.flat) {
        const x0 = left + (i.w - (i.n! * i.cw! + (i.n! - 1) * GX)) / 2;
        ch.forEach((c, k) => { pos[c] = { x: x0 + (k % i.n!) * (i.cw! + GX) + (i.cw! - size(c).w) / 2, y: y + s.h + GY * 0.6 + Math.floor(k / i.n!) * (i.chh! + 20) }; });
        return;
      }
      let cx = left + (i.w - (ch.reduce((a, c) => a + info[c].w, 0) + GX * (ch.length - 1))) / 2;
      for (const c of ch) { put(c, cx, y + s.h + GY); cx += info[c].w + GX; }
    };
    // equal row heights per depth are not needed: children hang GY under their own parent
    let left = 0;
    for (const r of roots) { measure(r); put(r, left, 0); left += info[r].w + GX * 2; }
    return { pos };
  },
});

// ring: boxes on a circle in the order the links go round, the first of the sorted ids at the top; the radius keeps neighbours apart
{
  const place = ({ ids, pairs, size }: Ctx): Placed => {
    const order: string[] = [], go = (id: string) => { if (order.includes(id)) return; order.push(id); pairs.filter(([s]) => s === id).forEach(([, t]) => go(t)); };
    [...ids].sort().forEach(go);
    const n = order.length, w = Math.max(0, ...order.map((id) => size(id).w)), h = Math.max(0, ...order.map((id) => size(id).h));
    const r = Math.max(140, n * w * 1.25 / (2 * Math.PI), n > 1 ? Math.hypot(w, h) * 0.75 / Math.sin(Math.PI / n) : 0);
    return { pos: Object.fromEntries(order.map((id, i) => [id, { x: r * Math.cos(2 * Math.PI * i / n - Math.PI / 2) - size(id).w / 2, y: r * Math.sin(2 * Math.PI * i / n - Math.PI / 2) - size(id).h / 2 }])) };
  };
  layout('ring', { place, keep: place });
}

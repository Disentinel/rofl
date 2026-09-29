// A picture of a notebook: the view facts its adapter rules concluded (visual/*.rofl.md), the tags the run itself knows, and text backends.
// Pure: the host collects a view where the world is, the command line prints it, the playground draws it.

export type DrawKind = 'graph' | 'time' | 'table' | 'argument' | 'space' | 'notation' | 'timeline' | 'timing' | 'chart' | 'heatmap' | 'upset' | 'euler' | 'decision'
  | 'architecture' | 'state' | 'process' | 'causal' | 'proof';
type Family = 'graph' | 'time' | 'table' | 'argument' | 'space' | 'notation';
/** A kind's family: the relations it reads, and the picture and text it falls back to when it has none of its own. */
export const FAMILY: Record<DrawKind, Family> = { graph: 'graph', time: 'time', table: 'table', argument: 'argument', space: 'space', notation: 'notation',
  timeline: 'time', timing: 'time', chart: 'table', heatmap: 'table', upset: 'table', euler: 'table', decision: 'table',
  architecture: 'graph', state: 'graph', process: 'graph', causal: 'graph', proof: 'graph' };
export const KINDS = Object.keys(FAMILY) as DrawKind[];
/** The graph and its dialects: the graph's words, a dialect's tags, its own layout and notation. */
export const GRAPHS = KINDS.filter((k) => FAMILY[k] === 'graph' || FAMILY[k] === 'argument');
/** The tags only the renderer writes: from what the model could not see, from a what-if, from a failing never, from a link to no node. */
/** The MIME type of a draw line's output, which VS Code's notebook renderer (vscode/visual/renderer.ts) draws. */
export const VIEW_MIME = 'application/vnd.rofl.view+json';
export const RESERVED = ['unknown', 'blind', 'gone', 'new', 'failing', 'dangling'];

/** One row of a view relation: `from`, the sentences its proof rests on one step down; none when it was given, not derived. */
export type Fact = { rel: string; args: string[]; literal: string; from: string[]; given?: boolean; change?: 'gone' | 'new' };
/** `on`: the terms the proofs of its facts rest on, one step down. */
export type Mark = { label: string; tags: string[]; from: string[]; on: string[]; at?: string[] };
/** `cells`: a table's cells a row of a failing never names by both its row and its column, with that tag. */
export type View = { kind: DrawKind; facts: Fact[]; marks: Record<string, Mark>; notes: string[]; cells?: { row: string; column: string; tags: string[] }[] };

const RELS: Record<Family, [string, number][]> = {
  graph: [['node', 1], ['link', 2], ['inside', 2], ['tagged', 2], ['link_tagged', 3], ['labelled', 2], ['level', 2], ['placed', 3], ['frame', 2], ['collapsed', 1]],
  argument: [['node', 1], ['link', 2], ['inside', 2], ['tagged', 2], ['link_tagged', 3], ['labelled', 2], ['frame', 2], ['collapsed', 1]],
  time: [['lane', 2], ['during', 3], ['happens', 2], ['message', 4], ['in_state', 2], ['tagged', 2], ['labelled', 2], ['frame', 2], ['lane_group', 2], ['collapsed', 1]],
  table: [['value', 3], ['draws', 1], ['shows', 3], ['tagged', 2], ['frame', 2]],
  notation: [['named', 2], ['born', 2], ['partner', 2], ['child', 2], ['frame', 2], ['collapsed', 1]],
  space: [['at', 3], ['box', 5], ['corner', 4], ['link', 2], ['inside', 2], ['tagged', 2], ['labelled', 2], ['axis', 2], ['projection', 1], ['frame', 2], ['collapsed', 1]],
};
/** Every relation a picture reads: the renderer's words, which a notebook writes into by name. */
export const VIEW_RELS = new Set(Object.values(RELS).flatMap((rs) => rs.map(([r]) => r)));
const VARS = ['A', 'B', 'C', 'D', 'E'];

/** How the host answers: the rows of a literal, null when nothing can put a row there; a fact's premises said, null when it was given. */
export type World = { rows(lit: string): Record<string, string>[] | null; from(literal: string): { said: string[]; terms: string[] } | null; label(term: string): { label: string; at?: string[] } };

export function collect(kind: DrawKind, w: World): View {
  const fam = FAMILY[kind], facts: Fact[] = [], notes: string[] = [], on = new Map<string, string[]>();
  for (const [rel, n] of RELS[fam]) {
    const vars = VARS.slice(0, n), rows = w.rows(`${rel}(${vars.join(', ')})`);
    if (!rows) continue;
    for (const b of rows) {
      const args = vars.map((v) => b[v]), literal = `${rel}(${args.join(', ')})`, from = w.from(literal);
      facts.push({ rel, args, literal, from: from?.said ?? [], ...(from ? {} : { given: true }) });
      if (from) on.set(literal, from.terms);
    }
  }
  const first = RELS[fam][0][0];
  if (!facts.length && !w.rows(`${first}(${VARS.slice(0, RELS[fam][0][1]).join(', ')})`)) notes.push(`nothing to draw: no sentence here writes ${first}; a notebook reads the words of visual/${fam === 'argument' ? 'graph' : fam}.rofl.md and says in rules what is a mark`);
  const given = facts.filter((f) => f.given && !['placed', 'projection', 'axis'].includes(f.rel));
  if (given.length) notes.push(`${given.length} view ${given.length === 1 ? 'fact is' : 'facts are'} given, not derived from the domain, so ${given.length === 1 ? 'it has' : 'they have'} no provenance: ${given.slice(0, 5).map((f) => f.literal).join(', ')}`);
  const marks: Record<string, Mark> = {};
  const mark = (id: string, f?: Fact) => {
    const m = marks[id] ??= { ...w.label(id), tags: [], from: [], on: [] };
    if (f) { for (const s of f.from) if (!m.from.includes(s)) m.from.push(s); for (const t of on.get(f.literal) ?? []) if (!m.on.includes(t)) m.on.push(t); }
    return m;
  };
  const is = (rel: string) => facts.filter((f) => f.rel === rel);
  if (GRAPHS.includes(kind)) {
    for (const f of is('node')) mark(f.args[0], f);
    for (const f of is('link')) for (const end of f.args) if (!marks[end]) tag(mark(end), 'dangling');
  }
  if (fam === 'time') for (const f of facts) if (['lane', 'during', 'happens', 'message', 'in_state'].includes(f.rel)) mark(f.args[0], f);
  if (fam === 'table') for (const f of is('value')) mark(f.args[0], f);
  if (fam === 'notation') for (const f of facts) { mark(f.args[0], f); if (f.rel === 'partner' || f.rel === 'child') mark(f.args[1], f); }
  if (fam === 'space') {
    for (const f of facts) if (['at', 'box', 'corner'].includes(f.rel)) mark(f.args[0], f);
    for (const f of is('link')) for (const end of f.args) if (!marks[end]) tag(mark(end), 'dangling');
  }
  for (const f of is('labelled')) if (marks[f.args[0]]) marks[f.args[0]].label = unquote(f.args[1]);
  for (const f of is('tagged')) { mark(f.args[0], f); tag(marks[f.args[0]], unquote(f.args[1])); }
  const own = is('tagged').filter((f) => RESERVED.includes(unquote(f.args[1])));
  if (own.length) notes.push(`${own.map((f) => f.literal).join(', ')}: ${RESERVED.join(', ')} are the renderer's tags, not an adapter's`);
  return { kind, facts, marks, notes };
}

const tag = (m: Mark, k: string) => { if (!m.tags.includes(k)) m.tags.push(k); };
export const unquote = (t: string) => /^".*"$/.test(t) ? JSON.parse(t) as string : t;

/** The renderer's own tags from `rows` by tag, each row the terms of an answer (a failing never's, an unsure's, unknown's): a mark one names gets
 *  the tag; `blind` and `unknown` also go on a mark whose proof rests on a fact about one of their terms. */
export function status(v: View, rows: Record<string, string[][]>): void {
  for (const [k, rs] of Object.entries(rows)) {
    const terms = new Set(rs.flat());
    for (const [id, m] of Object.entries(v.marks)) if (terms.has(id) || k !== 'failing' && m.on.some((t) => terms.has(t))) tag(m, k);
    if (FAMILY[v.kind] === 'table') for (const f of v.facts.filter((x) => x.rel === 'value')) if (rs.some((r) => r.includes(f.args[0]) && r.includes(f.args[1]))) {
      const c = (v.cells ??= []).find((x) => x.row === f.args[0] && x.column === f.args[1]) ?? (v.cells.push({ row: f.args[0], column: f.args[1], tags: [] }), v.cells[v.cells.length - 1]);
      if (!c.tags.includes(k)) c.tags.push(k);
    }
  }
}

/** One view of the marks before a what-if and after it: a mark only before is `gone`, one only after `new`; a retraction can add marks. */
export function diff(before: View, after: View): View {
  const now = new Set(after.facts.map((f) => f.literal)), was = new Set(before.facts.map((f) => f.literal));
  const facts: Fact[] = [...before.facts.map((f) => now.has(f.literal) ? f : { ...f, change: 'gone' as const }), ...after.facts.filter((f) => !was.has(f.literal)).map((f) => ({ ...f, change: 'new' as const }))];
  const marks: Record<string, Mark> = {};
  for (const [id, m] of [...Object.entries(before.marks), ...Object.entries(after.marks)]) marks[id] = { ...(after.marks[id] ?? m), tags: [...(after.marks[id] ?? m).tags] };
  // a mark changes with the facts about it: one only before is gone, one only after is new, and a mark in both can be either or both
  for (const f of facts) if (f.change && marks[f.args[0]]) tag(marks[f.args[0]], f.change);
  const n = (c: string) => facts.filter((f) => f.change === c).length;
  return { kind: after.kind, facts, marks, notes: [...after.notes, `what-if: ${n('gone')} view facts gone, ${n('new')} new`] };
}

/** A link's own tags: its link_tagged rows, a dangling end, and a change a what-if made. */
export const linkTags = (v: View, f: Fact) => [...v.facts.filter((x) => x.rel === 'link_tagged' && x.args[0] === f.args[0] && x.args[1] === f.args[1]).map((x) => unquote(x.args[2])),
  ...(v.marks[f.args[1]]?.tags.includes('dangling') || v.marks[f.args[0]]?.tags.includes('dangling') ? ['dangling'] : []), ...(f.change ? [f.change] : [])];

/** A text backend: how a picture of `kind` is written in `format`; `when`, the views it fits (a gantt the intervals, a sequence the messages).
 *  A backend lives in its own module (notebook/draw-*.ts) and notebook/draw-text.ts lists the modules. */
export type Backend = { kind: DrawKind; format: string; fence: string; when?(v: View): boolean; write(v: View): string };

export const nodes = (v: View) => Object.keys(v.marks).sort();
export const suffix = (m?: Mark) => m?.tags.length ? ` [${m.tags.join(', ')}]` : '';
const order = (xs: string[]) => [...new Set(xs)].sort((a, b) => (/^-?\d+$/.test(a) && /^-?\d+$/.test(b) ? Number(a) - Number(b) : 0) || unquote(a).localeCompare(unquote(b)));
export function grid(v: View) {
  const vals = v.facts.filter((f) => f.rel === 'value');
  return { vals, rows: order(vals.map((f) => f.args[0])), cols: order(vals.map((f) => f.args[1])) };
}

/** A view's frames, when its marks name one (`A mark M is in the frame F`): a view per frame, in order (numbers by value, else by name), each
 *  holding the facts about its marks and about marks in no frame, and each after the first compared with the one before (a mark new, gone). */
export function framesOf(v: View): { key: string; view: View }[] | null {
  const of = new Map(v.facts.filter((f) => f.rel === 'frame').map((f) => [f.args[0], f.args[1]]));
  if (!of.size) return null;
  const keys = [...new Set(of.values())].sort((a, b) => (/^-?\d+$/.test(a) && /^-?\d+$/.test(b) ? Number(a) - Number(b) : 0) || a.localeCompare(b));
  const one = (k: string): View => {
    const facts = v.facts.filter((f) => f.rel !== 'frame' && (!of.has(f.args[0]) || of.get(f.args[0]) === k));
    const ids = new Set(facts.flatMap((f) => f.rel === 'value' ? [f.args[0]] : f.rel === 'message' ? [f.args[0]] : f.args.filter((a) => v.marks[a])));
    return { ...v, facts, marks: Object.fromEntries(Object.entries(v.marks).filter(([id]) => ids.has(id))), cells: v.cells, notes: [] };
  };
  // across frames a mark is the same by its label ($on(work_am, mon) and $on(work_am, tue) both read work_am): one only now is new, one only before is gone
  const label = (w: View) => new Set(Object.values(w.marks).map((m) => m.label));
  return keys.map((key, i) => {
    const now = one(key); if (!i) return { key, view: now };
    const before = one(keys[i - 1]), was = label(before), is = label(now);
    for (const [id, m] of Object.entries(now.marks)) if (!was.has(m.label)) now.marks[id] = { ...m, tags: [...m.tags, 'new'] };
    for (const [id, m] of Object.entries(before.marks)) if (!is.has(m.label) && !now.marks[id]) {
      now.marks[id] = { ...m, tags: [...m.tags, 'gone'] };
      now.facts.push(...before.facts.filter((f) => f.args[0] === id).map((f) => ({ ...f, change: 'gone' as const })));
    }
    return { key, view: now };
  });
}

/** The groups a view starts with shut: `A mark G is collapsed`. */
export const shutOf = (v: View) => new Set(v.facts.filter((f) => f.rel === 'collapsed').map((f) => f.args[0]));

/** Zoom: every group in `shut` drawn as one mark labelled with how many it holds, its members' tags on it; a link or a message inside it goes,
 *  one across its edge ends at it. A graph's group is what marks are `inside`; a proof's, the facts a fact rests on; a timeline's is what lanes are in (`A lane L is in the group G`);
 *  a notation's family, its children.
 *  The count is the picture's, from membership, not the engine's. */
export function zoom(v: View, shut = shutOf(v)): View {
  if (!shut.size) return v;
  const parent = new Map(v.kind === 'notation' ? v.facts.filter((f) => f.rel === 'child').map((f) => [f.args[1], f.args[0]])
    : v.facts.filter((f) => f.rel === (v.kind === 'proof' ? 'link' : 'inside')).map((f) => [f.args[0], f.args[1]]));   // a proof's group is its subproof
  const top = (m: string) => { let out = m; for (let g = m, seen = new Set<string>(); parent.has(g) && !seen.has(g); ) { seen.add(g); g = parent.get(g)!; if (shut.has(g)) out = g; } return out; };
  const group = new Map(v.facts.filter((f) => f.rel === 'lane_group' && shut.has(f.args[1])).map((f) => [f.args[0], f.args[1]]));
  const held = new Map<string, Set<string>>(), hold = (g: string, m: string) => (held.get(g) ?? held.set(g, new Set()).get(g)!).add(m);
  for (const id of Object.keys(v.marks)) if (top(id) !== id) hold(top(id), id);
  for (const [l, g] of group) hold(g, l);
  const name = (g: string) => `${v.marks[g]?.label ?? unquote(g)} (${held.get(g)?.size ?? 0})`;
  const lane = (l: string) => group.has(l) ? JSON.stringify(name(group.get(l)!)) : l;
  const facts: Fact[] = [], seen = new Set<string>();
  const put = (f: Fact) => { const literal = `${f.rel}(${f.args.join(', ')})`; if (!seen.has(literal)) { seen.add(literal); facts.push({ ...f, literal }); } };
  for (const f of v.facts) {
    if (f.rel === 'collapsed' || f.rel === 'lane_group' && shut.has(f.args[1])) continue;
    if (f.rel === 'inside' && top(f.args[0]) !== f.args[0]) continue;
    if (['placed', 'at', 'box', 'corner', 'named', 'born'].includes(f.rel) && top(f.args[0]) !== f.args[0]) continue;
    if (f.rel === 'link' || f.rel === 'link_tagged' || f.rel === 'partner' || f.rel === 'child') { const [a, b] = [top(f.args[0]), top(f.args[1])]; if (a !== b) put({ ...f, args: [a, b, ...f.args.slice(2)] }); continue; }
    if (f.rel === 'lane') { put({ ...f, args: [f.args[0], lane(f.args[1])] }); continue; }
    if (f.rel === 'message') { const [a, b] = [lane(f.args[1]), lane(f.args[2])]; if (a !== b || !group.has(f.args[1])) put({ ...f, args: [f.args[0], a, b, f.args[3]] }); continue; }
    put({ ...f, args: [top(f.args[0]), ...f.args.slice(1)] });
  }
  const marks: Record<string, Mark> = {};
  for (const [id, m] of Object.entries(v.marks)) { const t = top(id); if (t === id) marks[id] = { ...m, tags: [...m.tags] }; }
  for (const g of new Set(group.values())) put({ rel: 'lane_group', args: [JSON.stringify(name(g)), g], literal: '', from: [] });   // a shut lane group still names its group
  for (const [g, ms] of held) if ([...ms].some((m) => v.marks[m])) {   // a graph's group becomes a mark; a timeline's is a lane
    const had = [...ms].flatMap((m) => v.marks[m]?.tags ?? []).filter((t) => t !== 'given');   // a proof's folded fact is still concluded
    marks[g] = { label: name(g), tags: [...new Set([...(v.marks[g]?.tags ?? []), ...had, 'collapsed'])], from: v.marks[g]?.from ?? [], on: [] };
    put({ rel: 'node', args: [g], literal: '', from: [] });
  }
  const named = new Set(facts.flatMap((f) => f.args));   // a mark whose every fact went inside a shut group goes with them
  return { ...v, facts, marks: Object.fromEntries(Object.entries(marks).filter(([id]) => named.has(id))) };
}

/** What the picture holds, counted: the verdict of a draw line. */
export function counted(v: View): string {
  const n = Object.keys(v.marks).length, links = v.facts.filter((f) => f.rel === 'link' || f.rel === 'message').length;
  const tags = RESERVED.map((t) => [t, Object.values(v.marks).filter((m) => m.tags.includes(t)).length] as const).filter(([, k]) => k);
  const what = FAMILY[v.kind] === 'table' ? `${n} ${n === 1 ? 'row' : 'rows'}, ${v.facts.filter((f) => f.rel === 'value').length} values` : `${n} ${n === 1 ? 'mark' : 'marks'}${links ? `, ${links} ${FAMILY[v.kind] === 'time' ? 'messages' : 'links'}` : ''}`;
  return [what, ...tags.map(([t, k]) => `${k} ${t}`)].join(', ');
}

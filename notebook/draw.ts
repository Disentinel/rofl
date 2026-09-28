// A picture of a notebook: the view facts its adapter rules concluded (visual/*.rofl.md), the tags the run itself knows, and text backends.
// Pure: the host collects a view where the world is, the command line prints it, the playground draws it.

export type DrawKind = 'graph' | 'time' | 'table' | 'argument';
export const KINDS: DrawKind[] = ['graph', 'time', 'table', 'argument'];
/** The tags only the renderer writes: from what the model could not see, from a what-if, from a failing never, from a link to no node. */
export const RESERVED = ['unknown', 'blind', 'gone', 'new', 'failing', 'dangling'];

/** One row of a view relation: `from`, the sentences its proof rests on one step down; none when it was given, not derived. */
export type Fact = { rel: string; args: string[]; literal: string; from: string[]; given?: boolean; change?: 'gone' | 'new' };
/** `on`: the terms the proofs of its facts rest on, one step down. */
export type Mark = { label: string; tags: string[]; from: string[]; on: string[]; at?: string[] };
export type View = { kind: DrawKind; facts: Fact[]; marks: Record<string, Mark>; notes: string[] };

const RELS: Record<DrawKind, [string, number][]> = {
  graph: [['node', 1], ['link', 2], ['inside', 2], ['tagged', 2], ['link_tagged', 3], ['labelled', 2], ['level', 2], ['placed', 3]],
  argument: [['node', 1], ['link', 2], ['tagged', 2], ['link_tagged', 3], ['labelled', 2]],
  time: [['lane', 2], ['during', 3], ['happens', 2], ['message', 4], ['tagged', 2], ['labelled', 2]],
  table: [['value', 3], ['draws', 1], ['shows', 3], ['tagged', 2]],
};
const VARS = ['A', 'B', 'C', 'D'];

/** How the host answers: the rows of a literal, null when nothing can put a row there; a fact's premises said, null when it was given. */
export type World = { rows(lit: string): Record<string, string>[] | null; from(literal: string): { said: string[]; terms: string[] } | null; label(term: string): { label: string; at?: string[] } };

export function collect(kind: DrawKind, w: World): View {
  const facts: Fact[] = [], notes: string[] = [], on = new Map<string, string[]>();
  for (const [rel, n] of RELS[kind]) {
    const vars = VARS.slice(0, n), rows = w.rows(`${rel}(${vars.join(', ')})`);
    if (!rows) continue;
    for (const b of rows) {
      const args = vars.map((v) => b[v]), literal = `${rel}(${args.join(', ')})`, from = w.from(literal);
      facts.push({ rel, args, literal, from: from?.said ?? [], ...(from ? {} : { given: true }) });
      if (from) on.set(literal, from.terms);
    }
  }
  const first = RELS[kind][0][0];
  if (!facts.length && !w.rows(`${first}(${VARS.slice(0, RELS[kind][0][1]).join(', ')})`)) notes.push(`nothing to draw: no sentence here writes ${first}; a notebook reads the words of visual/${kind === 'argument' ? 'graph' : kind}.rofl.md and says in rules what is a mark`);
  const given = facts.filter((f) => f.given && f.rel !== 'placed');
  if (given.length) notes.push(`${given.length} view ${given.length === 1 ? 'fact is' : 'facts are'} given, not derived from the domain, so ${given.length === 1 ? 'it has' : 'they have'} no provenance: ${given.slice(0, 5).map((f) => f.literal).join(', ')}`);
  const marks: Record<string, Mark> = {};
  const mark = (id: string, f?: Fact) => {
    const m = marks[id] ??= { ...w.label(id), tags: [], from: [], on: [] };
    if (f) { for (const s of f.from) if (!m.from.includes(s)) m.from.push(s); for (const t of on.get(f.literal) ?? []) if (!m.on.includes(t)) m.on.push(t); }
    return m;
  };
  const is = (rel: string) => facts.filter((f) => f.rel === rel);
  if (kind === 'graph' || kind === 'argument') {
    for (const f of is('node')) mark(f.args[0], f);
    for (const f of is('link')) for (const end of f.args) if (!marks[end]) tag(mark(end), 'dangling');
  }
  if (kind === 'time') for (const f of facts) if (f.rel !== 'tagged' && f.rel !== 'labelled') mark(f.args[0], f);
  if (kind === 'table') for (const f of is('value')) mark(f.args[0], f);
  for (const f of is('labelled')) if (marks[f.args[0]]) marks[f.args[0]].label = unquote(f.args[1]);
  for (const f of is('tagged')) { mark(f.args[0], f); tag(marks[f.args[0]], unquote(f.args[1])); }
  const own = is('tagged').filter((f) => RESERVED.includes(unquote(f.args[1])));
  if (own.length) notes.push(`${own.map((f) => f.literal).join(', ')}: ${RESERVED.join(', ')} are the renderer's tags, not an adapter's`);
  return { kind, facts, marks, notes };
}

const tag = (m: Mark, k: string) => { if (!m.tags.includes(k)) m.tags.push(k); };
export const unquote = (t: string) => /^".*"$/.test(t) ? JSON.parse(t) as string : t;

/** The renderer's own tags: `terms` by tag (a failing never's rows, what the model could not see), put on every mark that is one of them
 *  or whose proof rests on a fact about one. */
export function status(v: View, terms: Record<string, Set<string>>): void {
  for (const [id, m] of Object.entries(v.marks)) for (const [k, ts] of Object.entries(terms)) if (ts.has(id) || m.on.some((t) => ts.has(t))) tag(m, k);
}

/** One view of the marks before a what-if and after it: a mark only before is `gone`, one only after `new`; a retraction can add marks. */
export function diff(before: View, after: View): View {
  const now = new Set(after.facts.map((f) => f.literal)), was = new Set(before.facts.map((f) => f.literal));
  const facts: Fact[] = [...before.facts.map((f) => now.has(f.literal) ? f : { ...f, change: 'gone' as const }), ...after.facts.filter((f) => !was.has(f.literal)).map((f) => ({ ...f, change: 'new' as const }))];
  const marks: Record<string, Mark> = {};
  for (const [id, m] of Object.entries(before.marks)) marks[id] = after.marks[id] ?? { ...m, tags: [...m.tags, 'gone'] };
  for (const [id, m] of Object.entries(after.marks)) marks[id] ??= { ...m, tags: [...m.tags, 'new'] };
  const n = (c: string) => facts.filter((f) => f.change === c).length;
  return { kind: after.kind, facts, marks, notes: [...after.notes, `what-if: ${n('gone')} view facts gone, ${n('new')} new`] };
}

/** A link's own tags: its link_tagged rows, a dangling end, and a change a what-if made. */
const linkTags = (v: View, f: Fact) => [...v.facts.filter((x) => x.rel === 'link_tagged' && x.args[0] === f.args[0] && x.args[1] === f.args[1]).map((x) => unquote(x.args[2])),
  ...(v.marks[f.args[1]]?.tags.includes('dangling') || v.marks[f.args[0]]?.tags.includes('dangling') ? ['dangling'] : []), ...(f.change ? [f.change] : [])];

// ------------------------------------------------------------ text backends

export const FORMATS: Record<DrawKind, string[]> = { graph: ['mermaid', 'dot'], argument: ['argdown'], time: ['mermaid'], table: ['markdown', 'vega-lite'] };

export function text(v: View, format = FORMATS[v.kind][0]): string {
  if (!FORMATS[v.kind].includes(format)) format = FORMATS[v.kind][0];
  if (v.kind === 'graph') return format === 'dot' ? dot(v) : flowchart(v);
  if (v.kind === 'argument') return argdown(v);
  if (v.kind === 'time') return v.facts.some((f) => f.rel === 'message') ? sequence(v) : gantt(v);
  return format === 'vega-lite' ? JSON.stringify(vegaLite(v), null, 1) : markdown(v);
}

const STYLE: Record<string, string> = {
  failing: 'stroke:#b91c1c,stroke-width:3px,color:#b91c1c', dangling: 'stroke:#b91c1c,stroke-dasharray:4 3,color:#b91c1c',
  blind: 'stroke:#a15c07,stroke-dasharray:6 3', unknown: 'stroke:#66706b,stroke-dasharray:2 3,color:#66706b',
  gone: 'stroke:#66706b,stroke-dasharray:5 5,opacity:0.5', new: 'stroke:#047857,stroke-width:3px',
};
const safe = (s: string) => s.replace(/"/g, '#quot;').replace(/[\n\r]+/g, ' ');
const nodes = (v: View) => Object.keys(v.marks).sort();
const ids = (v: View) => new Map(nodes(v).map((id, i) => [id, `m${i}`]));

function flowchart(v: View): string {
  const id = ids(v), out = ['flowchart LR'], parent = new Map(v.facts.filter((f) => f.rel === 'inside').map((f) => [f.args[0], f.args[1]]));
  const groups = new Set(parent.values());
  const kids = (g: string | undefined) => nodes(v).filter((m) => parent.get(m) === g && !groups.has(m)).concat([...groups].filter((x) => parent.get(x) === g).sort());
  const put = (m: string, pad: string, seen: Set<string>) => {
    const name = id.get(m) ?? `g${[...groups].indexOf(m)}`, label = safe(v.marks[m]?.label ?? unquote(m));
    if (!groups.has(m)) { out.push(`${pad}${name}["${label}"]`); return; }
    if (seen.has(m)) return;
    seen.add(m);
    out.push(`${pad}subgraph ${name}["${label}"]`);
    for (const k of kids(m)) put(k, pad + '  ', seen);
    out.push(`${pad}end`);
  };
  for (const m of kids(undefined)) put(m, '  ', new Set());
  const name = (m: string) => id.get(m) ?? `g${[...groups].indexOf(m)}`;
  const styled: string[] = [];
  v.facts.filter((f) => f.rel === 'link').forEach((f, i) => {
    const ts = linkTags(v, f), shown = ts.filter((t) => !RESERVED.includes(t));
    out.push(`  ${name(f.args[0])} ${ts.includes('dangling') || ts.includes('gone') ? '-.->' : '-->'}${shown.length ? `|${safe(shown.join(', '))}|` : ''} ${name(f.args[1])}`);
    const r = ts.find((t) => STYLE[t]); if (r) styled.push(`  linkStyle ${i} ${STYLE[r].replace(/,color:[^,]*/, '')}`);
  });
  out.push(...styled);
  for (const [t, s] of Object.entries(STYLE)) if (nodes(v).some((m) => v.marks[m].tags.includes(t))) out.push(`  classDef ${t} ${s}`);
  for (const m of nodes(v)) for (const t of v.marks[m].tags) if (!groups.has(m)) out.push(`  class ${name(m)} ${t}`);
  return out.join('\n');
}

function dot(v: View): string {
  const q = (s: string) => JSON.stringify(s), out = ['digraph view {', '  rankdir=LR;', '  node [shape=box, style=rounded];'];
  const parent = new Map(v.facts.filter((f) => f.rel === 'inside').map((f) => [f.args[0], f.args[1]])), groups = new Set(parent.values());
  const color = (ts: string[]) => ts.includes('failing') || ts.includes('dangling') ? '#b91c1c' : ts.includes('new') ? '#047857' : ts.includes('gone') || ts.includes('unknown') ? '#66706b' : ts.includes('blind') ? '#a15c07' : '';
  const style = (ts: string[]) => ts.includes('blind') || ts.includes('dangling') || ts.includes('gone') ? 'dashed' : ts.includes('unknown') ? 'dotted' : '';
  const attrs = (label: string, ts: string[], tip: string[]) => [`label=${q(label)}`, ts.length && `class=${q(ts.join(' '))}`, color(ts) && `color=${q(color(ts))}`, style(ts) && `style=${q(style(ts) + ',rounded')}`, tip.length && `tooltip=${q(tip.join('\n'))}`].filter(Boolean).join(', ');
  const put = (m: string, pad: string, seen: Set<string>) => {
    if (!groups.has(m)) { const k = v.marks[m]; out.push(`${pad}${q(m)} [${attrs(k?.label ?? m, k?.tags ?? [], k?.from ?? [])}];`); return; }
    if (seen.has(m)) return;
    seen.add(m);
    out.push(`${pad}subgraph ${q('cluster_' + m)} {`, `${pad}  label=${q(v.marks[m]?.label ?? unquote(m))};`);
    for (const k of [...nodes(v).filter((x) => parent.get(x) === m && !groups.has(x)), ...[...groups].filter((x) => parent.get(x) === m)]) put(k, pad + '  ', seen);
    out.push(`${pad}}`);
  };
  for (const m of [...nodes(v).filter((x) => !parent.has(x) && !groups.has(x)), ...[...groups].filter((x) => !parent.has(x))]) put(m, '  ', new Set());
  for (const f of v.facts.filter((x) => x.rel === 'link')) {
    const ts = linkTags(v, f), shown = ts.filter((t) => !RESERVED.includes(t));
    out.push(`  ${q(f.args[0])} -> ${q(f.args[1])}${ts.length ? ` [${[shown.length && `label=${q(shown.join(', '))}`, color(ts) && `color=${q(color(ts))}`, style(ts) && `style=${style(ts)}`].filter(Boolean).join(', ')}]` : ''};`);
  }
  const levels = new Map<string, string[]>();
  for (const f of v.facts.filter((x) => x.rel === 'level')) levels.set(f.args[1], [...(levels.get(f.args[1]) ?? []), f.args[0]]);
  for (const [, ms] of [...levels].sort((a, b) => Number(a[0]) - Number(b[0]))) out.push(`  { rank=same; ${ms.map(q).join('; ')}; }`);
  out.push('}');
  return out.join('\n');
}

/** Argdown: a mark something links to is a statement `[..]`, a mark that only links is an argument `<..>`; a link is `+`, tagged `attack` it is `-`. */
function argdown(v: View): string {
  const links = v.facts.filter((f) => f.rel === 'link'), out: string[] = [];
  const title = (m: string) => (v.marks[m]?.label ?? unquote(m)).replace(/[[\]<>]/g, '');
  const hashes = (m: string) => (v.marks[m]?.tags ?? []).map((t) => ` #${t.replace(/\W+/g, '-')}`).join('');
  const target = new Set(links.map((f) => f.args[1]));
  const shape = (m: string) => target.has(m) ? `[${title(m)}]` : `<${title(m)}>`;
  const walk = (m: string, pad: string, path: Set<string>) => {
    for (const f of links.filter((x) => x.args[1] === m)) {
      const s = f.args[0], attack = linkTags(v, f).includes('attack');
      out.push(`${pad}${attack ? '-' : '+'} ${shape(s)}${path.has(s) ? '' : hashes(s)}`);
      if (!path.has(s)) walk(s, pad + '  ', new Set([...path, s]));
    }
  };
  const roots = nodes(v).filter((m) => !links.some((f) => f.args[0] === m));
  for (const m of roots) { out.push(`${shape(m)}${hashes(m)}`); walk(m, '  ', new Set([m])); out.push(''); }
  return out.join('\n').trim();
}

const byTime = (a: Fact, b: Fact, i: number) => Number(a.args[i]) - Number(b.args[i]) || a.args[0].localeCompare(b.args[0]);
const gname = (s: string) => s.replace(/[:;#\n]/g, ' ').trim();
const lanes = (v: View) => new Map(v.facts.filter((f) => f.rel === 'lane').map((f) => [f.args[0], unquote(f.args[1])]));
const suffix = (m?: Mark) => m?.tags.length ? ` [${m.tags.join(', ')}]` : '';

function gantt(v: View): string {
  const lane = lanes(v), out = ['gantt', '  dateFormat X', '  axisFormat %s'];
  const items = [...v.facts.filter((f) => f.rel === 'during').sort((a, b) => byTime(a, b, 1)), ...v.facts.filter((f) => f.rel === 'happens').sort((a, b) => byTime(a, b, 1))];
  for (const l of [...new Set(items.map((f) => lane.get(f.args[0]) ?? '(no lane)'))].sort()) {
    out.push(`  section ${gname(l)}`);
    for (const f of items.filter((x) => (lane.get(x.args[0]) ?? '(no lane)') === l)) {
      const m = v.marks[f.args[0]], tags = [f.rel === 'happens' && 'milestone', m?.tags.some((t) => t === 'failing' || t === 'dangling') && 'crit', m?.tags.some((t) => t === 'blind' || t === 'unknown' || t === 'new') && 'active', m?.tags.includes('gone') && 'done'].filter(Boolean);
      const end = f.rel === 'happens' ? f.args[1] : f.args[2];
      out.push(`    ${gname((m?.label ?? f.args[0]) + suffix(m))} :${[...tags, `t${items.indexOf(f)}`, f.args[1], end].join(', ')}`);
    }
  }
  return out.join('\n');
}

function sequence(v: View): string {
  const msgs = v.facts.filter((f) => f.rel === 'message').sort((a, b) => byTime(a, b, 3));
  const who = [...new Set(msgs.flatMap((f) => [f.args[1], f.args[2]]))];
  const out = ['sequenceDiagram', ...who.map((p, i) => `  participant p${i} as ${gname(unquote(p))}`)];
  for (const f of msgs) {
    const m = v.marks[f.args[0]], ts = m?.tags ?? [];
    const arrow = ts.includes('failing') || ts.includes('gone') ? (ts.includes('gone') ? '--x' : '-x') : ts.includes('blind') || ts.includes('unknown') ? '-->>' : '->>';
    out.push(`  p${who.indexOf(f.args[1])}${arrow}p${who.indexOf(f.args[2])}: ${gname((m?.label ?? f.args[0]) + suffix(m))} at ${f.args[3]}`);
  }
  return out.join('\n');
}

const order = (xs: string[]) => [...new Set(xs)].sort((a, b) => (/^-?\d+$/.test(a) && /^-?\d+$/.test(b) ? Number(a) - Number(b) : 0) || unquote(a).localeCompare(unquote(b)));
function grid(v: View) {
  const vals = v.facts.filter((f) => f.rel === 'value');
  return { vals, rows: order(vals.map((f) => f.args[0])), cols: order(vals.map((f) => f.args[1])) };
}

function markdown(v: View): string {
  const { vals, rows, cols } = grid(v), cell = (s: string) => s.replace(/\|/g, '\\|');
  const out = [`| | ${cols.map((c) => cell(unquote(c))).join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`];
  for (const r of rows) out.push(`| ${cell((v.marks[r]?.label ?? unquote(r)) + suffix(v.marks[r]))} | ${cols.map((c) => cell(vals.filter((f) => f.args[0] === r && f.args[1] === c).map((f) => unquote(f.args[2])).join(', '))).join(' | ')} |`);
  return out.join('\n');
}

function vegaLite(v: View): object {
  const { vals, rows } = grid(v);
  const values = rows.map((r) => Object.fromEntries([['row', unquote(r)], ...vals.filter((f) => f.args[0] === r).map((f) => [unquote(f.args[1]), /^-?\d+(\.\d+)?$/.test(f.args[2]) ? Number(f.args[2]) : unquote(f.args[2])]), ['tags', v.marks[r]?.tags.join(' ') ?? '']]));
  const mark = v.facts.find((f) => f.rel === 'draws')?.args[0] ?? 'bar';
  const encoding = Object.fromEntries(v.facts.filter((f) => f.rel === 'shows').map((f) => [unquote(f.args[0]), { field: unquote(f.args[1]), type: unquote(f.args[2]) }]));
  return { $schema: 'https://vega.github.io/schema/vega-lite/v5.json', data: { values }, mark: unquote(mark), encoding: { ...encoding, tooltip: [{ field: 'row' }, { field: 'tags' }] } };
}

/** What the picture holds, counted: the verdict of a draw line. */
export function counted(v: View): string {
  const n = Object.keys(v.marks).length, links = v.facts.filter((f) => f.rel === 'link' || f.rel === 'message').length;
  const tags = RESERVED.map((t) => [t, Object.values(v.marks).filter((m) => m.tags.includes(t)).length] as const).filter(([, k]) => k);
  const what = v.kind === 'table' ? `${n} ${n === 1 ? 'row' : 'rows'}, ${v.facts.filter((f) => f.rel === 'value').length} values` : `${n} ${n === 1 ? 'mark' : 'marks'}${links ? `, ${links} ${v.kind === 'time' ? 'messages' : 'links'}` : ''}`;
  return [what, ...tags.map(([t, k]) => `${k} ${t}`)].join(', ');
}

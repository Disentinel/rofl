// The graph as mermaid flowchart (GitHub, agents) and as DOT (large graphs, provenance as a tooltip).
import { linkTags, nodes, RESERVED, unquote, type Backend, type View } from './draw.ts';

const STYLE: Record<string, string> = {
  failing: 'stroke:#b91c1c,stroke-width:3px,color:#b91c1c', dangling: 'stroke:#b91c1c,stroke-dasharray:4 3,color:#b91c1c',
  blind: 'stroke:#a15c07,stroke-dasharray:6 3', unknown: 'stroke:#66706b,stroke-dasharray:2 3,color:#66706b',
  gone: 'stroke:#66706b,stroke-dasharray:5 5,opacity:0.5', new: 'stroke:#047857,stroke-width:3px',
};
const safe = (s: string) => s.replace(/"/g, '#quot;').replace(/[\n\r]+/g, ' ');
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


export const backends: Backend[] = [{ kind: 'graph', format: 'mermaid', fence: 'mermaid', write: flowchart }, { kind: 'graph', format: 'dot', fence: 'dot', write: dot }];

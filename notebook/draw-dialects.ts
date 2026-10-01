// The graph's dialects in their own notations: a state machine as a mermaid stateDiagram, an architecture as architecture-beta,
// a process and a causal loop as a flowchart in the dialect's shapes and signs.
import { flowchart } from './draw-graph.ts';
import { linkTags, nodes, RESERVED, unquote, type Backend, type View } from './draw.ts';

const safe = (s: string) => s.replace(/[:;#"\n]/g, ' ').trim();
const has = (v: View, m: string, t: string) => v.marks[m]?.tags.includes(t) ?? false;
const links = (v: View) => v.facts.filter((f) => f.rel === 'link');
const shown = (v: View, f: View['facts'][number]) => linkTags(v, f).filter((t) => !RESERVED.includes(t));
/** mermaid's class lines: a mark's own tags and the renderer's, each a class the reader can style */
const classes = (v: View, id: (m: string) => string) => nodes(v).flatMap((m) => v.marks[m].tags.map((t) => `  class ${id(m)} ${t.replace(/\W+/g, '_')}`));

function stateDiagram(v: View): string {
  const id = new Map(nodes(v).map((m, i) => [m, `s${i}`])), s = (m: string) => id.get(m)!;
  const out = ['stateDiagram-v2', ...nodes(v).map((m) => `  state "${safe(v.marks[m].label)}" as ${s(m)}`)];
  for (const m of nodes(v)) if (has(v, m, 'initial')) out.push(`  [*] --> ${s(m)}`);
  for (const f of links(v)) out.push(`  ${s(f.args[0])} --> ${s(f.args[1])}${shown(v, f).length ? `: ${safe(shown(v, f).join(', '))}` : ''}`);
  for (const m of nodes(v)) if (has(v, m, 'final')) out.push(`  ${s(m)} --> [*]`);
  out.push('  classDef failing stroke:#b91c1c,stroke-width:3px', '  classDef current stroke-width:3px,font-weight:bold', ...classes(v, s));
  return out.join('\n');
}

/** architecture-beta: a group per boundary, a service per mark with the icon its tag names, an edge per link; it styles nothing, so the tags follow as comments. */
function architecture(v: View): string {
  const id = new Map(nodes(v).map((m, i) => [m, `c${i}`])), inside = new Map(v.facts.filter((f) => f.rel === 'inside').map((f) => [f.args[0], f.args[1]]));
  const groups = [...new Set(inside.values())], g = (x: string) => `g${groups.indexOf(x)}`;
  const icon = (m: string) => has(v, m, 'database') ? 'database' : has(v, m, 'person') || has(v, m, 'external') ? 'internet' : 'server';
  const out = ['architecture-beta', ...groups.map((x) => `  group ${g(x)}(cloud)[${safe(v.marks[x]?.label ?? unquote(x))}]`)];
  for (const m of nodes(v).filter((x) => !groups.includes(x))) out.push(`  service ${id.get(m)}(${icon(m)})[${safe(v.marks[m].label)}]${inside.has(m) ? ` in ${g(inside.get(m)!)}` : ''}`);
  for (const f of links(v)) if (id.has(f.args[0]) && id.has(f.args[1])) out.push(`  ${id.get(f.args[0])}:B --> T:${id.get(f.args[1])}`);
  for (const m of nodes(v)) if (v.marks[m].tags.length) out.push(`  %% ${safe(v.marks[m].label)}: ${v.marks[m].tags.join(', ')}`);
  return out.join('\n');
}

const flow = (v: View) => flowchart(v, (m) => has(v, m, 'decision') ? ['{', '}'] : has(v, m, 'start') || has(v, m, 'finish') ? ['([', '])'] : ['[', ']']);

/** A causal loop: each link carries its sign, `+` or `-`, where the graph carries the tag. */
const SIGN: Record<string, string> = { positive: '+', negative: '-' };
const causal = (v: View) => flowchart({ ...v, facts: v.facts.map((f) => f.rel === 'link_tagged' && SIGN[unquote(f.args[2])] ? { ...f, args: [f.args[0], f.args[1], SIGN[unquote(f.args[2])]] } : f) });

export const backends: Backend[] = [
  { kind: 'state', format: 'mermaid', fence: 'mermaid', write: stateDiagram },
  { kind: 'architecture', format: 'mermaid', fence: 'mermaid', write: architecture },
  { kind: 'process', format: 'mermaid', fence: 'mermaid', write: flow },
  { kind: 'causal', format: 'mermaid', fence: 'mermaid', write: causal },
];

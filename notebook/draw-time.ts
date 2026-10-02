// Time as a mermaid gantt (marks over intervals) or a sequenceDiagram (marks from lane to lane).
import { suffix, unquote, type Backend, type Fact, type View } from './draw.ts';

const byTime = (a: Fact, b: Fact, i: number) => Number(a.args[i]) - Number(b.args[i]) || a.args[0].localeCompare(b.args[0]);
const gname = (s: string) => s.replace(/[:;#\n]/g, ' ').trim();
const lanes = (v: View) => new Map(v.facts.filter((f) => f.rel === 'lane').map((f) => [f.args[0], unquote(f.args[1])]));

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


const messages = (v: View) => v.facts.some((f) => f.rel === 'message');
export const backends: Backend[] = [{ kind: 'time', format: 'mermaid', fence: 'mermaid', when: messages, write: sequence }, { kind: 'time', format: 'mermaid', fence: 'mermaid', write: gantt }];

// Time as a mermaid timeline (marks that only happen at a point) or as WaveDrom (intervals in a state, a signal per lane).
import { suffix, unquote, type Backend, type View } from './draw.ts';

const say = (v: View, id: string) => (v.marks[id]?.label ?? unquote(id)) + suffix(v.marks[id]);

function timeline(v: View): string {
  const at = new Map<number, string[]>();
  for (const f of v.facts.filter((x) => x.rel === 'happens')) at.set(Number(f.args[1]), [...at.get(Number(f.args[1])) ?? [], say(v, f.args[0]).replace(/[:#\n]/g, ' ')]);
  return ['timeline', ...[...at].sort(([a], [b]) => a - b).map(([t, ms]) => `  ${t} : ${ms.sort().join(' : ')}`)].join('\n');
}

/** A lane's intervals as one wave, a character a tick: `=` a state begins, `.` it holds, `x` no state known. */
function wavedrom(v: View): string {
  const lane = new Map(v.facts.filter((f) => f.rel === 'lane').map((f) => [f.args[0], unquote(f.args[1])]));
  const state = new Map(v.facts.filter((f) => f.rel === 'in_state').map((f) => [f.args[0], unquote(f.args[1])]));
  const spans = v.facts.filter((f) => f.rel === 'during' && state.has(f.args[0])).map((f) => ({ id: f.args[0], lane: lane.get(f.args[0]) ?? '(no lane)', from: Number(f.args[1]), to: Number(f.args[2]) }));
  const t0 = Math.min(...spans.map((s) => s.from)), t1 = Math.max(...spans.map((s) => s.to));
  const signal = [...new Set(spans.map((s) => s.lane))].sort().map((name) => {
    const mine = spans.filter((s) => s.lane === name).sort((a, b) => a.from - b.from), wave = Array(t1 - t0).fill('x'), data: string[] = [];
    for (const s of mine) { for (let t = s.from; t < s.to; t++) wave[t - t0] = t === s.from ? '=' : '.'; data.push(state.get(s.id)! + suffix(v.marks[s.id])); }
    return { name, wave: wave.join(''), data };
  });
  return `{ "signal": [\n${signal.map((x) => `  ${JSON.stringify(x)}`).join(',\n')}\n], "head": { "tick": ${t0} } }`;
}

export const backends: Backend[] = [{ kind: 'timeline', format: 'mermaid', fence: 'mermaid', write: timeline }, { kind: 'timing', format: 'wavedrom', fence: 'json', write: wavedrom }];

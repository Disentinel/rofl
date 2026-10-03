// scripts/why_dag.ts — the rule by which a `K [above]` reference of `why` and `whynot` is read, as code
// (f_why_is_a_dag_and_a_proof_is_its_distinct_positions), so that an answer can be expanded back into the tree
// it stands for and compared with the tree the engine writes with the DAG off.
//
//   A FACT OR CELL reference `H [above]` or `H [above] (cell N)` stands for the block of the ONE line before it that
//   begins with `H ` (or is `H`), is not itself a reference, `[cycle]`, `[axiom]` or `[past tick]` line, and ends
//   with the same `(cell N)` or none. A past-tick premise (`K  <= r @tick t [past tick]`) is not a block.
//   A WHYNOT reference, the only child of a line `failed premise: K`, stands for the child lines of the first
//   earlier `failed premise: K` line AT THE SAME INDENT (the same level, so the same depth below it) whose first
//   child is a rule line or a `no rule concludes` line, not a `[depth limit ..]`, `[node limit ..]`, `[cycle]` or
//   `[above]` line.

const ind = (l: string): number => l.length - l.trimStart().length;
const CUT = /^\[(depth limit|node limit)|\[cycle\]$|\[above\]$/;

/** The text the references stand for, or why it cannot be read; null when it is longer than `max` lines. */
export function expandRefs(text: string, max = 400_000): string[] | string | null {
  const lines = text.split('\n');
  const end = (i: number): number => { let j = i + 1; while (j < lines.length && ind(lines[j]) > ind(lines[i])) j++; return j; };
  const out: string[] = [];
  const cellSuffix = (t: string): [string, string] => { const m = /^(.*?)( \(cell \d+\))?$/.exec(t)!; return [m[1], m[2] ?? '']; };
  let err: string | null = null;
  const emit = (i: number, shift: number, limit: number): boolean => {
    if (out.length > max) return false;
    const l = lines[i], t = l.trimStart();
    const [bare, cell] = cellSuffix(t);
    if (bare.endsWith(' [above]')) {
      const head = bare.slice(0, -' [above]'.length);
      const parent = parentOf(i);
      if (parent !== null && lines[parent].trimStart().startsWith('failed premise: ') && lines[parent].trimStart() === `failed premise: ${head}`) {
        let d = -1;
        for (let j = 0; j < parent && d < 0; j++) {
          if (lines[j].trimStart() !== `failed premise: ${head}` || ind(lines[j]) !== ind(lines[parent]) || ind(lines[j + 1]) <= ind(lines[j])) continue;
          if (!CUT.test(lines[j + 1].trimStart())) d = j;
        }
        if (d < 0) { err = `no demonstration for ${head} at line ${i}`; return true; }
        const sh = ind(l) + shift - ind(lines[d + 1]);
        for (let j = d + 1; j < end(d); j++) if (!emit(j, sh, limit)) return false;
        return true;
      }
      const cands: number[] = [];
      for (let j = 0; j < i; j++) {
        const u = lines[j].trimStart(), [ub, uc] = cellSuffix(u);
        if (!(u === head || u.startsWith(head + ' ')) || uc !== cell) continue;
        if (ub.endsWith(' [above]') || ub.endsWith(' [cycle]') || ub.endsWith(' [axiom]') || ub.endsWith(' [past tick]')) continue;
        cands.push(j);
      }
      if (cands.length !== 1) { err = `${cands.length} blocks for ${head}${cell} at line ${i}`; return true; }
      const d = cands[0], sh = ind(l) + shift - ind(lines[d]);
      for (let j = d; j < end(d); j++) if (!emit(j, sh, limit)) return false;
      return true;
    }
    out.push(' '.repeat(Math.max(0, ind(l) + shift)) + t);
    return true;
  };
  const parentOf = (i: number): number | null => { for (let j = i - 1; j >= 0; j--) if (ind(lines[j]) < ind(lines[i])) return j; return null; };
  for (let i = 0; i < lines.length; i++) if (!emit(i, 0, 0)) return null;
  return err ?? out;
}

/** Does the answer, expanded by the rule, equal the tree `tree` (the same engine with the DAG off)? null: fine. */
export function dagProblem(dag: string, tree: () => string): string | null {
  if (!dag.includes(' [above]')) return null;
  const x = expandRefs(dag);
  if (x === null) return null;
  if (typeof x === 'string') return x;
  const nz = (s: string): string => s.replace(/(\?[\w$]+)#\d+/g, '$1#N');
  const t = tree();
  // the DAG spends no node on a literal it refers to, so it can demonstrate what the tree's node limit cut
  if (t.includes('[node limit ')) return null;
  return nz(x.join('\n')) === nz(t) ? null : 'the references do not expand to the tree';
}

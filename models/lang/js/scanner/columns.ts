// The column form of facts (docs/cli.md, Model libraries; rust/rofl/src/rofl_parse.rs `columns`): what `rofl scan` writes.

export { COLUMNS } from '../../../../src/parser.ts';

const radix36 = (n: number) => n.toString(36);
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r');

/** Facts of the text form whose arguments are strings and integers, as one table and a block a relation. */
export function toColumns(facts: string[]): string {
  const terms: string[] = [], index = new Map<string, number>();
  const blocks = new Map<string, number[][]>();
  const term = (t: string) => { let k = index.get(t); if (k === undefined) { k = terms.length; terms.push(t); index.set(t, k); } return k; };
  for (const f of facts) {
    const m = /^(\w+)(?:\[(\w+)\])?\((.*)\)\.$/s.exec(f);
    if (!m) throw new Error(`toColumns: not a fact: ${f}`);
    const args = [...m[3].matchAll(/"((?:[^"\\]|\\.)*)"|(-?\d+)/gs)].map((a) => (a[1] !== undefined ? `s ${esc(a[1].replace(/\\(["\\])/g, '$1'))}` : `i ${a[2]}`));
    const key = `${m[1]} ${m[2] ?? '-'} ${args.length}`;
    let cols = blocks.get(key);
    if (!cols) blocks.set(key, (cols = args.map(() => [])));
    args.forEach((a, i) => cols![i].push(term(a)));
  }
  const out = [`T ${terms.length}`, ...terms];
  for (const [key, cols] of blocks) out.push(`R ${key} ${cols[0]?.length ?? 0}`, ...cols.map((c) => c.map(radix36).join(' ')));
  return out.join('\n') + '\n';
}

/** A counter of the facts in the column form, read a whole line at a time. */
export function countRows(counted: (n: number) => void): (text: string) => void {
  let skip = 0;
  return (text: string) => {
    const lines = text.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    for (const l of lines) {
      if (skip > 0) { skip--; continue; }
      if (l.startsWith('T ')) skip = Number(l.slice(2));
      else if (l.startsWith('R ')) {
        const [, , , arity, rows] = l.split(' ');
        counted(Number(rows));
        skip = Number(arity);
      }
    }
  };
}

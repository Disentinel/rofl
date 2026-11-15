// scripts/worlds_scan.ts — THE WORLDS OF A TREE AS FACTS, for models/engine/feature-behaviour.rofl:
//   node --experimental-strip-types scripts/worlds_scan.ts TREE NAMES
// TREE is the name the facts carry for this tree; NAMES a file of one name a line, the entries of the engine.
// It prints, in the book `snap`: world_file(TREE, W, File), a file the world reads; ran_with(TREE, W, Flag), a flag
// `npm test` runs it with; file_word(TREE, File, Name), a name of NAMES written in the file outside comments and
// strings (a variable, capitalised, is no name); measures(TREE, W, answer|rows|steps|space, V), the world's committed golden and what it cost. scripts/features.sh copies it into each
// tree it asks, so the worlds are that tree's own.
import { worlds, parse } from './goldens.ts';
import { inputs } from './agg_select.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const [tree, namesFile] = process.argv.slice(2);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const names = new Set(fs.readFileSync(namesFile, 'utf8').split('\n').filter(Boolean));
const q = (s: string): string => JSON.stringify(s);
const FLAG: Record<string, string> = { ticks: '--ticks', budget: '--budget', space: '--space', retain: '--retain', retract: '--retract', strata: '--strata' };
const words = new Map<string, string[]>();
const wordsOf = (f: string): string[] => {
  if (!words.has(f)) {
    const text = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/--.*$/gm, '') : '';
    words.set(f, [...new Set(text.match(/\b[a-z_]\w*/g) ?? [])].filter((t) => names.has(t)));
  }
  return words.get(f)!;
};
const out: string[] = [];
for (const w of worlds()) {
  const files = ['boot.rofl', ...inputs(w).map((f) => path.relative(ROOT, f))];
  for (const f of files) out.push(`world_file[snap](${q(tree)}, ${q(w.name)}, ${q(f)}).`);
  for (const [k, flag] of Object.entries(FLAG)) if ((w as Record<string, unknown>)[k] !== undefined) out.push(`ran_with[snap](${q(tree)}, ${q(w.name)}, ${q(flag)}).`);
  for (const f of files.slice(1)) wordsOf(path.join(ROOT, f));
}
for (const [f, ws] of words) for (const t of ws) out.push(`file_word[snap](${q(tree)}, ${q(path.relative(ROOT, f))}, ${q(t)}).`);
for (const [w, g] of parse() as Map<string, { hash: string; facts: number; cost?: { steps: number; space: number } }>) {
  if (g.cost) out.push(`measures[snap](${q(tree)}, ${q(w)}, steps, ${g.cost.steps}).`, `measures[snap](${q(tree)}, ${q(w)}, space, ${g.cost.space}).`);
  out.push(`measures[snap](${q(tree)}, ${q(w)}, answer, ${q(g.hash)}).`, `measures[snap](${q(tree)}, ${q(w)}, rows, ${g.facts}).`);
}
console.log(out.join('\n'));
process.exit(0);

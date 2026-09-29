// The proof dialect of the graph: the proof of each `why` in a cell as a tree, a fact above the facts it rests on, and as an indented text.
import { type Backend, type Fact, type Mark, type View } from './draw.ts';

/** A fact of the run by its key: its sentence, the facts it rests on one step down (none when it was given), and the terms it is about. */
export type Proven = (key: string) => { said: string; prems: string[]; terms: string[] } | null;

/** The view of the proofs of `goals`: a mark per fact, a link from a premise to what it proves, a fact nothing concluded tagged `given`;
 *  a fact `shut` names, with or without its namespace, drawn with its subproof folded into it. */
export function proofView(goals: string[], proven: Proven, shut: string[] = []): View {
  const facts: Fact[] = [], marks: Record<string, Mark> = {}, notes: string[] = [];
  const put = (k: string) => {
    if (marks[k]) return;
    const p = proven(k)!;
    marks[k] = { label: p.said.replace(/`/g, ''), tags: p.prems.length ? [] : ['given'], from: p.prems.map((x) => proven(x)?.said ?? x), on: p.terms };
    facts.push({ rel: 'node', args: [k], literal: k, from: marks[k].from });
    for (const x of p.prems) { put(x); facts.push({ rel: 'link', args: [x, k], literal: `link(${x}, ${k})`, from: [] }); }
  };
  for (const g of goals) proven(g) ? put(g) : notes.push(`${g} does not hold, so it has no proof to draw`);
  for (const k of Object.keys(marks)) if (shut.includes(k) || shut.includes(k.replace(/\[\w+\]/, ''))) facts.push({ rel: 'collapsed', args: [k], literal: `collapsed(${k})`, from: [] });
  if (!goals.length) notes.push('nothing to draw: draw proof draws the proof of each why in its cell, and this cell asks none');
  return { kind: 'proof', facts, marks, notes };
}

/** The proof as the text `why` gives, one fact a line, what it rests on indented under it. */
function tree(v: View): string {
  const out: string[] = [], rests = (k: string) => v.facts.filter((f) => f.rel === 'link' && f.args[1] === k).map((f) => f.args[0]);
  const walk = (k: string, pad: string, path: Set<string>) => {
    const m = v.marks[k];
    out.push(`${pad}${m?.label ?? k}${m?.tags.length ? ` [${m.tags.join(', ')}]` : ''}`);
    if (!path.has(k)) for (const x of rests(k)) walk(x, pad + '  ', new Set([...path, k]));
  };
  for (const g of Object.keys(v.marks).filter((k) => !v.facts.some((f) => f.rel === 'link' && f.args[0] === k))) walk(g, '', new Set());
  return out.join('\n');
}

export const backends: Backend[] = [{ kind: 'proof', format: 'text', fence: '', write: tree }];

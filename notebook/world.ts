// A notebook as a world: what the reader reads in it and the model and worlds it stands on. The goldens load this, the kernel runs over it.
import { readBook, homeOf, type Cell } from './book.ts';
import { cellsOf, libFiles, parseFront, type NbCell } from './front.ts';

/** The texts a run needs: `lib` by their path from the root of the tree (libFiles), `reads` and `code` by their name in the notebook. */
export type Inputs = { lib: Record<string, string>; reads: Record<string, string>; code: Record<string, string> };

export const asCell = (c: NbCell): Cell => ({ id: `c${c.index}`, text: c.text, form: c.kind === 'datalog' ? 'rofl' : 'md', prose: c.kind === 'prose' });

/** A world written as Markdown, read the way a notebook's cells are: its prose, then its rofl and datalog cells; the lines that ask are not part of it. */
export function worldOf(text: string, phrases: string, home: Record<string, string>): { rofl: string; phrases: string[]; reports: string[]; traced: string[] } {
  const b = readBook(cellsOf(text).filter((c) => c.kind !== 'natural').map(asCell), phrases, home);
  return { rofl: b.parts.map((p, i) => b.read[i]?.rofl ?? p.clauses).join('\n'), phrases: b.learned, reports: b.read.flatMap((r) => r ? [r.report] : []), traced: b.read.flatMap((r) => r?.traced ?? []) };
}

/** The model a notebook runs over and the words it is read in: the tree's files its front matter names, then the worlds it reads. */
export function assemble(path: string, text: string, input: Inputs): { model: string; phrases: string; home: Record<string, string>; errors: string[] } {
  const front = parseFront(text), files = libFiles(path, front), errors: string[] = [];
  const lib = (f: string) => { const t = input.lib[f]; if (t === undefined) errors.push(`${f}: not given`); return t ?? ''; };
  let model = files.model.map(lib).join('\n');
  let phrases = files.phrases.map(lib).join('\n');
  const home = homeOf(model);
  for (const r of front.reads) {
    const t = input.reads[r];
    if (t === undefined) { errors.push(`${r}: not given`); continue; }
    if (r.endsWith('.rofl.md')) { const w = worldOf(t, phrases, home); model += '\n' + w.rofl; phrases += '\n' + w.phrases.join('\n'); }
    else { model += '\n' + t; phrases += '\n' + t; }
  }
  return { model, phrases, home: homeOf(model), errors };
}

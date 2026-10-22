// A notebook as a world: what the reader reads in it and the model and worlds it stands on. The goldens load this, the kernel runs over it.
import { readBook, homeOf, type Cell } from './book.ts';
import type { ReadOptions } from '../scripts/read_md.ts';
import { cellsOf, libFiles, parseFront, readKey, type NbCell } from './front.ts';
import { headOf, notChecked } from '../src/signed.ts';

/** The texts a run needs: `lib` by their path from the root of the tree (libFiles), `reads` and `code` by their name in the notebook; `data`, the files a
 *  relative specifier in the code names that exist and are not code (`../package.json`), which it reaches rather than loses sight of. */
export type Inputs = { lib: Record<string, string>; reads: Record<string, string>; code: Record<string, string>; data?: string[];
  /** a read file of scanned facts the host held to its signature (src/signed.ts), and what it said of it ('' nothing) */
  checked?: Record<string, string> };

export const asCell = (c: NbCell): Cell => ({ id: `c${c.index}`, text: c.text, form: c.kind === 'datalog' ? 'rofl' : 'md', prose: c.kind === 'prose' });

/** A world written as Markdown, read the way a notebook's cells are: its prose, then its rofl and datalog cells; the lines that ask are not part of it. */
export function worldOf(text: string, phrases: string, home: Record<string, string>, opts: Pick<ReadOptions, 'canonVars'> = {}): { rofl: string; phrases: string[]; reports: string[]; traced: string[]; problems: string[]; leftOut: string[] } {
  const b = readBook(cellsOf(text).filter((c) => c.kind !== 'natural').map(asCell), phrases, home, false, opts), read = b.read.flatMap((r) => r ? [r] : []);
  return { rofl: b.parts.map((p, i) => b.read[i]?.rofl ?? p.clauses).join('\n'), phrases: b.learned, reports: read.map((r) => r.report), traced: read.flatMap((r) => r.traced),
    problems: read.flatMap((r) => [...r.problems.unparsed.map((u) => `not read: ${u.replace(/^(LIST|HEAD) /, '')}`), ...r.problems.dropped.map((d) => `left out: ${d}`)]), leftOut: read.flatMap((r) => r.leftOut) };
}

/** The model a notebook runs over and the words it is read in: the tree's files its front matter names, then the worlds it reads. */
export function assemble(path: string, text: string, input: Inputs): { model: string; phrases: string; home: Record<string, string>; errors: string[]; notes: string[]; source(line: number): string } {
  const front = parseFront(text), files = libFiles(path, front), errors: string[] = [], notes: string[] = [];
  const lib = (f: string) => { const t = input.lib[f]; if (t === undefined) errors.push(`${f}: not given`); return t ?? ''; };
  const parts: [string, string][] = files.model.map((f) => [f, lib(f)]);
  let phrases = files.phrases.map(lib).join('\n');
  const home = homeOf(parts.map((p) => p[1]).join('\n'));
  // what a world reads is read before it, each file once
  const seen = new Set<string>();
  const read = (from: string, text: string) => {
    for (const r of parseFront(text).reads) {
      const k = readKey(from, r), t = input.reads[k];
      if (seen.has(k)) continue;
      seen.add(k);
      if (t === undefined) { errors.push(`${k}: not given`); continue; }
      if (!k.endsWith('.rofl.md')) {
        // a file of scanned facts: what the host found of its signature, or that it could not look
        const said = input.checked?.[k];
        if (said) notes.push(said); else if (said === undefined && headOf(t)) notes.push(notChecked(k));
        parts.push([k, t]); phrases += `\n-- read: ${k}\n` + t; continue;
      }
      read(k, t);
      // a vocabulary the notebook reads is marked, so a head about other things than its sentences say is not read as one of them (book.ts misbound)
      const w = worldOf(t, phrases, home);
      errors.push(...w.problems.map((p) => `${k}: ${p}`));
      // a rule left out is said where its conclusion is asked why not, rather than taken for one no file has
      const left = w.leftOut.map((rel) => `unit_concludes(${JSON.stringify(`the rule left out of ${k}`)}, ${rel}).`);
      parts.push([`the rules read from ${k}`, [w.rofl, ...left].join('\n')]); phrases += `\n-- read: ${k}\n` + w.phrases.join('\n');
    }
  };
  read('', text);
  const model = parts.map((p) => p[1]).join('\n');
  /** A line of the model as the file it came from and its line there. */
  const source = (line: number): string => {
    for (const [name, t] of parts) { const n = t.split('\n').length; if (line <= n) return `${name}:${line}`; line -= n; }
    return `line ${line}`;
  };
  return { model, phrases, home: homeOf(model), errors, notes, source };
}

// A book as the reader reads it: cells of sentences or of plain ROFL, the lines in them that ask, and the heads that name themselves.
// Pure: the page, the notebook kernel and the reader of worlds share it.
import { readMd, type ReadResult } from '../scripts/read_md.ts';

export type Kind = 'answers' | 'never' | 'why' | 'whynot' | 'unsure';
/** A cell in the Markdown sentence form, as a `.rofl.md` is written, or in plain ROFL. */
export type Cell = { id: string; text: string; form?: 'md' | 'rofl'; /** prose: read for its sentences, no line of it asks */ prose?: boolean };

/** Every relation the model's rules conclude, and the books they write it in. */
export function booksOf(model: string): Map<string, Set<string>> {
  const books = new Map<string, Set<string>>();
  for (const m of model.matchAll(/^([a-z_]\w*)(?:\[(\w+)\])?\([^\n]*?:-/gm)) (books.get(m[1]) ?? books.set(m[1], new Set()).get(m[1])!).add(m[2] ?? 'main');
  return books;
}

const DIRECTIVE = /^(\?|never|whynot|why|unsure)\s+(.+?)\.?\s*$/;

/** A cell is clauses plus lines that ask: `? L` lists, `never L` holds when nothing answers, `unsure L` says what the `never` above it cannot see, `why L` explains, `whynot L` says what is missing. */
function split(text: string): { clauses: string; asks: Ask[] } {
  const clauses: string[] = []; const asks: Ask[] = [];
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    const m = DIRECTIVE.exec(l);
    if (m) asks.push({ kind: m[1] === '?' ? 'answers' : m[1] as Kind, lit: m[2], text: l });
    clauses.push(m || l.startsWith('>') ? '' : raw);   // blank, so an error's line number is the cell's
  }
  return { clauses: clauses.join('\n'), asks };
}

/** A head the reader knew no sentence for gets an anchor named from its words, `A call C is unawaited` -> `unawaited`, so the sentence declares a relation. */
const slug = (head: string): string => head.replace(/\b(?:[Aa]n?|[Tt]he) [a-z][\w-]*(?: [a-z][\w-]*){0,2} [A-Z][A-Za-z0-9]*\b/g, ' ').replace(/`[^`]*`|"[^"]*"|\b[A-Z][A-Za-z0-9]*\b/g, ' ')
  .toLowerCase().replace(/\b(a|an|the|is|are)\b/g, ' ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
function anchored(md: string, heads: string[]): string {
  const lines = md.split('\n');
  for (const h of heads) {
    const name = slug(h); if (!name) continue;
    const i = lines.findIndex((l) => l.replace(/^\s*- /, '').startsWith(h));
    if (i >= 0 && !/<a id=/.test(lines[i])) lines[i] = lines[i].replace(/^(\s*- )?/, (m) => `${m}<a id="${name}"></a>`);
  }
  return lines.join('\n');
}

/** The books a model's relations live in: `ast_node` in code, a relation one book's rules conclude in that book, one given by facts alone where its facts are. */
export function homeOf(model: string): Record<string, string> {
  const home: Record<string, string> = { ast_node: 'code', ast_child: 'code', ast_attr: 'code', ast_file: 'code' };
  for (const [rel, bs] of booksOf(model)) if (bs.size === 1) home[rel] = [...bs][0];
  for (const m of model.matchAll(/^([a-z_]\w*)(?:\[(\w+)\])?\([^\n]*\)\.[ \t]*$/gm)) if (!m[0].includes(':-')) home[m[1]] ??= m[2] ?? 'main';
  return home;
}

export type Ask = { kind: Kind; lit: string; text: string };
export type Book = { parts: { c: Cell; clauses: string; asks: Ask[] }[]; read: (ReadResult | null)[]; learned: string[]; vocab: string };

/** The cells as the reader reads them. Markdown cells are read twice: once to name the heads nobody had a sentence for and learn their sentences, then against every cell's sentences at once. */
export function readBook(cells: Cell[], phrases: string, home: Record<string, string>): Book {
  const parts = cells.map((c) => ({ c, ...(c.prose ? { clauses: c.text, asks: [] } : split(c.text)) }));
  const md = parts.map(({ c, clauses }) => {
    if (c.form !== 'md') return null;
    const first = readMd(clauses, { vocab: phrases, homeBooks: home });
    const text = anchored(clauses, first.problems.unparsed.filter((u) => u.startsWith('HEAD ')).map((u) => u.slice(5)));
    return { text, learned: readMd(text, { vocab: phrases, homeBooks: home }).phrases };
  });
  const learned = md.flatMap((m) => m?.learned ?? []);
  const vocab = phrases + '\n' + learned.join('\n');
  return { parts, read: parts.map((_, i) => md[i] ? readMd(md[i]!.text, { vocab, homeBooks: home }) : null), learned, vocab };
}

// A book as the reader reads it: cells of sentences or of plain ROFL, the lines in them that ask, and the heads that name themselves.
// Pure: the page, the notebook kernel and the reader of worlds share it.
import { readMd, type ReadResult } from '../scripts/read_md.ts';
import { VIEW_RELS } from './draw.ts';
import { RESERVED } from '../src/reflect.ts';

export type Kind = 'answers' | 'never' | 'why' | 'whynot' | 'unsure' | 'extends' | 'excise' | 'draw';
/** A cell in the Markdown sentence form, as a `.rofl.md` is written, or in plain ROFL. */
export type Cell = { id: string; text: string; form?: 'md' | 'rofl'; /** prose: read for its sentences, no line of it asks */ prose?: boolean };

/** Every relation the model's rules conclude, and the books they write it in. */
export function booksOf(model: string): Map<string, Set<string>> {
  const books = new Map<string, Set<string>>();
  for (const m of model.matchAll(/^([a-z_]\w*)(?:\[(\w+)\])?\([^\n]*?:-/gm)) (books.get(m[1]) ?? books.set(m[1], new Set()).get(m[1])!).add(m[2] ?? 'main');
  return books;
}

const DIRECTIVE = /^(\?|never|whynot|why|unsure|extends|excise|draw)\s+(.+?)\.?\s*$/;

/** A cell is clauses plus lines that ask: `? L` lists, `never L` holds when nothing answers, `unsure L` says what the `never` above it cannot see, `why L` explains, `whynot L` says what is missing, `draw K` shows the view facts of the kind K. */
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
const words = (head: string): string => head.replace(/\b(?:[Aa]n?|[Tt]he) [a-z][\w-]*(?: [a-z][\w-]*){0,2} [A-Z][A-Za-z0-9]*\b/g, ' ').replace(/`[^`]*`|"[^"]*"|\b[A-Z][A-Za-z0-9]*\b/g, ' ')
  .toLowerCase().replace(/\b(a|an|the|is|are)\b/g, ' ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
/** The name, never one of the kernel's own relations: `C writes to D` named `writes_to` would write the kernel's table and read its rows. */
const slug = (head: string): string => { const s = words(head); return RESERVED.has(s) ? `own_${s}` : s; };
/** A head named from words that are the kernel's own, said. */
export const kernelWords = (heads: string[]): string[] => heads.filter((h) => RESERVED.has(words(h))).map((h) => `'${words(h).replace(/_/g, ' ')}' is also the kernel's word; this cell's sentence is its own relation (${h})`);
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
/** `close`: by part, what each new sentence it declares is close to (closeTo). */
export type Book = { parts: { c: Cell; clauses: string; asks: Ask[] }[]; read: (ReadResult | null)[]; learned: string[]; vocab: string; close: string[][] };

/** A sentence as a pattern: a hole and a name are blanks; `named` also blanks a noun a name stands beside (`a mark \`shop\``), the constant-for-noun mistake. */
const skeleton = (p: string, named = false) => (named ? p.replace(/\b(?:an?|the|some) [a-z][\w-]*(?: [a-z][\w-]*)? `[^`]*`/g, '_') : p).replace(/^phrase\(\w+, "(.*)"\)\.$/, '$1')
  .replace(/<\d+:[\w ]+>|`[^`]*`|"[^"]*"|\b\d+\b/g, '_').replace(/\s+/g, ' ').trim();
const said = (p: string) => p.replace(/<\d+:([\w ]+)>/g, (_, n) => `a ${n}`);

/** A sentence a cell declares that reads as one already declared, its holes and names aside: an anchor on a head (`<a id="car_node">A car X is a node`),
 *  or a name beside a hole's noun (``is inside a mark `shop` ``), makes a new relation where the writer meant a row of the declared one. */
export function closeTo(learned: string[], vocab: string): string[] {
  const known = [...vocab.matchAll(/^phrase\((\w+), "(.*)"\)\.$/gm)].map((m) => ({ rel: m[1], text: m[2], k: skeleton(m[2]) }));
  // two sentences the cell declares that differ only in a noun: a row leaves the nouns out, so it cannot say which it is a row of
  const own = learned.flatMap((l) => { const m = /^phrase\((\w+), "(.*)"\)\.$/.exec(l); return m ? [{ rel: m[1], text: m[2], k: skeleton(m[2]) }] : []; });
  const twins = own.flatMap((a, i) => own.slice(i + 1).filter((b) => b.rel !== a.rel && b.k === a.k).map((b) => `"${said(a.text)}" and "${said(b.text)}" read as one sentence: a row can't tell them apart; say one of them in other words`));
  return [...twins, ...learned.flatMap((l) => {
    const m = /^phrase\((\w+), "(.*)"\)\.$/.exec(l); if (!m) return [];
    const near = known.find((x) => x.rel !== m[1] && x.k === skeleton(m[2], true));
    return near ? [`"${said(m[2])}" makes a new relation, ${m[1]}, close to the declared sentence "${said(near.text)}" (${near.rel}): to write into ${near.rel}, say that sentence with your terms in its holes and no anchor, a name in place of a noun and its letter (\`X is inside \`shop\`\`)`] : [];
  })];
}

/** A rule of a cell whose head reads as a picture's sentence about other things (`A service S links to a feed F`, where the sentence is about a mark):
 *  it draws, and the writer meant their own relation. The head's nouns against the sentence's, hole by hole; an untyped hole (`node`) matches any. */
export function viewLike(text: string, vocab: string): string[] {
  const views = [...vocab.matchAll(/^phrase\((\w+), "(.*)"\)\.$/gm)].filter((m) => VIEW_RELS.has(m[1]))
    .map((m) => ({ rel: m[1], text: m[2], k: m[2].replace(/<\d+:[\w ]+>/g, '_'), nouns: [...m[2].matchAll(/<\d+:([\w ]+)>/g)].map((x) => x[1]) }));
  const out: string[] = [];
  for (const [, head] of text.matchAll(/(?:^|\n\s*)((?:An?|The) [^\n.]*?) (?:if|unless|either)\b/g)) {
    const nouns: (string | null)[] = [];
    const k = head.replace(/^(?:An?|The) /, (m) => m.toLowerCase()).replace(/\b(?:an?|the|some) ([a-z][\w-]*(?: [a-z][\w-]*)?) [A-Z]\w*\b|`[^`]*`|"[^"]*"|\b[A-Z]\w*\b/g, (m, n) => { nouns.push(n ?? null); return '_'; });
    const v = views.find((x) => x.k === k && nouns.some((n, i) => n && x.nouns[i] !== 'node' && n !== x.nouns[i]));
    if (v) out.push(`"${head}" reads as the picture's sentence "${v.text.replace(/<\d+:([\w ]+)>/g, 'a $1')}" (${v.rel}), so it draws: say it in other words to keep it out of the picture`);
  }
  return out;
}

/** The cells as the reader reads them. Markdown cells are read twice: once to name the heads nobody had a sentence for and learn their sentences, then against every cell's sentences at once. */
export function readBook(cells: Cell[], phrases: string, home: Record<string, string>): Book {
  const parts = cells.map((c) => ({ c, ...(c.prose ? { clauses: c.text, asks: [] } : split(c.text)) }));
  const first = parts.map(({ c, clauses }) => c.form === 'md' ? readMd(clauses, { vocab: phrases, homeBooks: home }) : null);
  const md = parts.map(({ clauses }, i) => {
    if (!first[i]) return null;
    // a head another cell declares the sentence of is that cell's relation, not a new one named from its words
    const heads = (r: ReadResult) => r.problems.unparsed.filter((u) => u.startsWith('HEAD ')).map((u) => u.slice(5));
    const others = first.flatMap((f, j) => j !== i && f ? f.phrases : []), known = new Set(others.map((p) => skeleton(p)));
    const again = heads(first[i]!).some((h) => known.has(skeleton(h.replace(/^(?:An?|The) /, (m) => m.toLowerCase()).replace(/\$?[a-z_]\w*\([^()]*\)|\b[A-Z][A-Za-z0-9]*\b/g, '_')).replace(/\b(?:an?|the|some) [a-z][\w-]*(?: [a-z][\w-]*)? _/g, '_')));
    const unread = again ? heads(readMd(clauses, { vocab: phrases + '\n' + others.join('\n'), homeBooks: home })) : heads(first[i]!);
    const text = anchored(clauses, unread);
    const learned = readMd(text, { vocab: phrases, homeBooks: home }).phrases;
    return { text, learned, close: [...closeTo(learned, phrases), ...viewLike(clauses, phrases), ...kernelWords(unread)] };
  });
  const learned = md.flatMap((m) => m?.learned ?? []);
  const vocab = phrases + '\n' + learned.join('\n');
  return { parts, read: parts.map((_, i) => md[i] ? readMd(md[i]!.text, { vocab, homeBooks: home }) : null), learned, vocab, close: md.map((m) => m?.close ?? []) };
}

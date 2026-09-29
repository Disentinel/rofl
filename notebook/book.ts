// A book as the reader reads it: cells of sentences or of plain ROFL, the lines in them that ask, and the heads that name themselves.
// Pure: the page, the notebook kernel and the reader of worlds share it.
import { english, proseAsks, readMd, type ReadResult } from '../scripts/read_md.ts';

export type Kind = 'answers' | 'never' | 'why' | 'whynot' | 'unsure' | 'extends' | 'excise' | 'draw';
/** A cell in the Markdown sentence form, as a `.rofl.md` is written, or in plain ROFL. */
export type Cell = { id: string; text: string; form?: 'md' | 'rofl'; /** prose: read for its sentences; only a line in English asks */ prose?: boolean };

/** Every relation the model's rules conclude, and the books they write it in. */
export function booksOf(model: string): Map<string, Set<string>> {
  const books = new Map<string, Set<string>>();
  for (const m of model.matchAll(/^([a-z_]\w*)(?:\[(\w+)\])?\([^\n]*?:-/gm)) (books.get(m[1]) ?? books.set(m[1], new Set()).get(m[1])!).add(m[2] ?? 'main');
  return books;
}

const DIRECTIVE = /^(\?|never|whynot|why|unsure|extends|excise|draw)\s+(.+?)\.?\s*$/;

export { english };

/** The prose's English lines ask as a sentence cell's do (read_md.ts proseAsks); no other line of it asks. */
function proseSplit(text: string): { clauses: string; asks: Ask[] } {
  const asks = proseAsks(text), lines = text.split('\n');
  return { clauses: lines.map((l, k) => asks.includes(k) ? '' : l).join('\n'), asks: asks.map((k) => ({ kind: 'answers', lit: lines[k].trim(), text: lines[k].trim(), english: true, at: k })) };
}

/** A cell is clauses plus lines that ask: `? L` lists, `never L` holds when nothing answers, `unsure L` says what the `never` above it cannot see, `why L` explains, `whynot L` says what is missing, `draw K` shows the view facts of the kind K.
 *  In a sentence cell a line in English asks too; the reader reads it as one of these (read_md.ts question). */
function split(text: string, md: boolean): { clauses: string; asks: Ask[] } {
  const clauses: string[] = []; const asks: Ask[] = [];
  for (const [at, raw] of text.split('\n').entries()) {
    const l = raw.trim();
    const m = DIRECTIVE.exec(l), en = !m && md && english(l);
    if (m) asks.push({ kind: m[1] === '?' ? 'answers' : m[1] as Kind, lit: m[2], text: l, at });
    else if (en) asks.push({ kind: 'answers', lit: l, text: l, english: true, at });
    clauses.push(m || en || l.startsWith('>') ? '' : raw);   // blank, so an error's line number is the cell's
  }
  return { clauses: clauses.join('\n'), asks };
}

/** The prefix of a relation a notebook introduces: nothing outside a notebook is named with it, so what it introduces is its own. */
export const OWN = 'nb__';

/** A head the reader knew no sentence for gets an anchor named from its words, `A call C is unawaited` -> `unawaited`, so the sentence declares a relation. */
const slug = (head: string): string => head.replace(/\b(?:[Aa]n?|[Tt]he) [a-z][\w-]*(?: [a-z][\w-]*){0,2} [A-Z][A-Za-z0-9]*\b/g, ' ').replace(/`[^`]*`|"[^"]*"|\b[A-Z][A-Za-z0-9]*\b/g, ' ')
  .toLowerCase().replace(/\b(a|an|the|is|are)\b/g, ' ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
function anchored(md: string, heads: string[], prefix = ''): string {
  const lines = md.split('\n');
  for (const h of heads) {
    const name = slug(h); if (!name) continue;
    const id = prefix + name;
    const i = lines.findIndex((l) => l.replace(/^\s*- /, '').startsWith(h));
    if (i >= 0 && !/<a id=/.test(lines[i])) lines[i] = lines[i].replace(/^(\s*- )?/, (m) => `${m}<a id="${id}"></a>`);
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

/** `english`: the line is English, and `lit` is still its text; `at`: its line, from 0, in the cell. */
export type Ask = { kind: Kind; lit: string; text: string; english?: true; at?: number };
/** `close`: by part, what each new sentence it declares is close to (closeTo); `closeAt`, the line of the anchor each is about. */
export type Book = { parts: { c: Cell; clauses: string; asks: Ask[] }[]; read: (ReadResult | null)[]; learned: string[]; vocab: string; close: string[][]; closeAt: (number | undefined)[][] };

/** A sentence as a pattern: a hole and a name are blanks; `named` also blanks a noun a name stands beside (`a mark \`shop\``), the constant-for-noun mistake. */
const skeleton = (p: string, named = false) => (named ? p.replace(/\b(?:an?|the|some) [a-z][\w-]*(?: [a-z][\w-]*)? `[^`]*`/g, '_') : p).replace(/^phrase\(\w+, "(.*)"\)\.$/, '$1')
  .replace(/<\d+:[\w ]+>|`[^`]*`|"[^"]*"|\b\d+\b/g, '_').replace(/\s+/g, ' ').trim();
const said = (p: string) => p.replace(/<\d+:([\w ]+)>/g, (_, n) => `a ${n}`);

/** A sentence a cell declares that reads as one already declared, its holes and names aside: an anchor on a head (`<a id="car_node">A car X is a node`),
 *  or a name beside a hole's noun (``is inside a mark `shop` ``), makes a new relation where the writer meant a row of the declared one. */
export const closeTo = (learned: string[], vocab: string): string[] => closeBy(learned, vocab).map((c) => c.said);
function closeBy(learned: string[], vocab: string): { said: string; rel: string }[] {
  const known = [...vocab.matchAll(/^phrase\((\w+), "(.*)"\)\.$/gm)].map((m) => ({ rel: m[1], text: m[2], k: skeleton(m[2]) }));
  // two sentences the cell declares that differ only in a noun: a row leaves the nouns out, so it cannot say which it is a row of
  const own = learned.flatMap((l) => { const m = /^phrase\((\w+), "(.*)"\)\.$/.exec(l); return m ? [{ rel: m[1], text: m[2], k: skeleton(m[2]) }] : []; });
  const twins = own.flatMap((a, i) => own.slice(i + 1).filter((b) => b.rel !== a.rel && b.k === a.k).map((b) => ({ rel: a.rel, said: `"${said(a.text)}" and "${said(b.text)}" read as one sentence: a row can't tell them apart; say one of them in other words` })));
  return [...twins, ...learned.flatMap((l) => {
    const m = /^phrase\((\w+), "(.*)"\)\.$/.exec(l); if (!m) return [];
    const near = known.find((x) => x.rel !== m[1] && x.k === skeleton(m[2], true));
    return near ? [{ rel: m[1], said: `"${said(m[2])}" makes a new relation, ${m[1].replace(OWN, '')}, close to the declared sentence "${said(near.text)}" (${near.rel}): to write into ${near.rel}, say that sentence with your terms in its holes and no anchor, a name in place of a noun and its letter (\`X is inside \`shop\`\`)` }] : [];
  })];
}

/** The heads of a cell that read as a sentence of a vocabulary the notebook reads, but about other things (`A seat S is reserved`, where the
 *  vocabulary's sentence is about a tag): such a head is the notebook's own relation, never a row of the vocabulary's. The head's nouns
 *  against the sentence's, hole by hole; a hole the vocabulary leaves untyped (`node`) takes any noun. The vocabularies are the part of
 *  `phrases` after the first `-- read:` line (notebook/world.ts). */
export function misbound(text: string, phrases: string): string[] {
  const at = phrases.indexOf('\n-- read:'), read = at < 0 ? '' : phrases.slice(at);
  const said = [...read.matchAll(/^phrase\((\w+), "(.*)"\)\.$/gm)].map((m) => ({ k: m[2].replace(/<\d+:[\w ]+>/g, '_'), nouns: [...m[2].matchAll(/<\d+:([\w ]+)>/g)].map((x) => x[1]) }));
  const out: string[] = [];
  for (const [, head] of text.matchAll(/(?:^|\n\s*)((?:An?|The) [^\n.]*?) (?:if|unless|either)\b/g)) {
    const nouns: (string | null)[] = [];
    const k = head.replace(/^(?:An?|The) /, (m) => m.toLowerCase()).replace(/\b(?:an?|the|some) ([a-z][\w-]*(?: [a-z][\w-]*)?) [A-Z]\w*\b|`[^`]*`|"[^"]*"|\b[A-Z]\w*\b/g, (m, n) => { nouns.push(n ?? null); return '_'; });
    if (said.some((x) => x.k === k && nouns.some((n, i) => n && x.nouns[i] !== 'node' && n !== x.nouns[i]))) out.push(head);
  }
  return out;
}

/** The cells as the reader reads them. Markdown cells are read twice: once to name the heads nobody had a sentence for and learn their sentences, then against every cell's sentences at once. */
/** `own`: the cells are a notebook's, whose relations are its own (host.ts): a head named from its words is named with OWN, and one about
 *  other things than a read vocabulary's sentence says is its own; a world read by a notebook keeps its names. */
export function readBook(cells: Cell[], phrases: string, home: Record<string, string>, own = false): Book {
  const parts = cells.map((c) => ({ c, ...(c.prose ? proseSplit(c.text) : split(c.text, c.form === 'md')) }));
  const first = parts.map(({ c, clauses }) => c.form === 'md' ? readMd(clauses, { vocab: phrases, homeBooks: home }) : null);
  const md = parts.map(({ clauses }, i) => {
    if (!first[i]) return null;
    // a head another cell declares the sentence of is that cell's relation, not a new one named from its words
    const heads = (r: ReadResult) => r.problems.unparsed.filter((u) => u.startsWith('HEAD ')).map((u) => u.slice(5));
    const others = first.flatMap((f, j) => j !== i && f ? f.phrases : []), known = new Set(others.map((p) => skeleton(p)));
    const again = heads(first[i]!).some((h) => known.has(skeleton(h.replace(/^(?:An?|The) /, (m) => m.toLowerCase()).replace(/\$?[a-z_]\w*\([^()]*\)|\b[A-Z][A-Za-z0-9]*\b/g, '_')).replace(/\b(?:an?|the|some) [a-z][\w-]*(?: [a-z][\w-]*)? _/g, '_')));
    const unread = again ? heads(readMd(clauses, { vocab: phrases + '\n' + others.join('\n'), homeBooks: home })) : heads(first[i]!);
    const mis = own ? misbound(clauses, phrases) : [], text = anchored(clauses, [...unread, ...mis], own ? OWN : ''), meant = new Set(mis.map((h) => OWN + slug(h)));
    const learned = readMd(text, { vocab: phrases, homeBooks: home }).phrases;
    const close = closeBy(learned.filter((l) => !meant.has(/^phrase\((\w+),/.exec(l)?.[1] ?? '')), phrases), lines = text.split('\n');
    return { text, learned, close: close.map((c) => c.said), closeAt: close.map((c) => { const k = lines.findIndex((l) => l.includes(`<a id="${c.rel}">`)); return k < 0 ? undefined : k; }) };
  });
  const learned = md.flatMap((m) => m?.learned ?? []);
  const vocab = phrases + '\n' + learned.join('\n');
  return { parts, read: parts.map((_, i) => md[i] ? readMd(md[i]!.text, { vocab, homeBooks: home }) : null), learned, vocab, close: md.map((m) => m?.close ?? []), closeAt: md.map((m) => m?.closeAt ?? []) };
}

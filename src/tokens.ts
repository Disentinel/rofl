// tokens.ts — THE LEXICAL LAYER: what a name, a number and a string ARE.
//
// This is the half of reading that the language cannot do for itself and the
// half a port cannot skip. The GRAMMAR above it (parser.ts) is optional by
// measurement — `npm run necessity`, 2026-09-07: the dense task enters 8 of
// its 174 code lines and every one of the 8 is a DECLARATION reached by
// evaluating the module, not a line of grammar; ring 1 then shows the grammar
// can be written in ROFL itself. The lexis is not optional the same way,
// because `atom_of` — a kernel builtin, on the rules side — asks this
// tokenizer whether a string a RULE just built is a name a program could have
// written, and `examples/ring1` is the demo that exercises exactly that. That question has exactly one right answer and it is this file's;
// a regex beside it would be the hand-written twin this repository has paid
// for twice.
//
// So the split is not tidying: it names the minimum a second host must
// reimplement. Escaping travels with unescaping (see `escapeString`) because
// the two are one decision.

export class ParseError extends Error {}

export interface Tok { t: string; v: string; line: number; }

const PUNCT = [':-', '<=', '>=', '!=', '--', '(', ')', '[', ']', ',', '.', '@', '{', '}', '=', '<', '>', '+', '-', '*', '/', '?'];

/** THE ESCAPE TABLE, and the two decisions in it.
 *
 *  UNTIL 2026-09-04 an escape meant "take the next character literally", so
 *  `"\\n"` was the LETTER n and NO escape produced a line feed. That was a trap
 *  (it silently declared `n` to be a newline in a character-class table) and a
 *  real gap: a CARRIAGE RETURN was inexpressible, because a literal CR is
 *  refused by scripts/text_check.ts as a lone CR and no escape made one.
 *
 *  The change was free and measured before it was made: the corpus held 88
 *  escape sequences over 69 files and every one was `\\"` or `\\\\` — zero `\\n`,
 *  `\\t`, `\\r`, `\\0`, `\\x` or `\\u` — so not one existing string changed meaning.
 *
 *  AN UNKNOWN ESCAPE IS AN ERROR, not a silent backslash-drop. Dropping it is
 *  the silently-wrong class this repository exists to refuse, and refusing
 *  costs nothing today (the corpus contains none) while catching every typo
 *  from here on. The table stays small on purpose: no `\\xNN`, no `\\uNNNN`,
 *  and no `\\0` — a NUL in a value is not something this language needs and
 *  the text gate exists to keep NULs out. */
const ESCAPES: ReadonlyMap<string, string> = new Map([
  ['n', '\n'], ['t', '\t'], ['r', '\r'], ['\\', '\\'], ['"', '"'],
]);

export function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '-' && src[i + 1] === '-') { // comment to end of line
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1, out = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\') {
          const e = src[j + 1];
          const r = e === undefined ? undefined : ESCAPES.get(e);
          if (r === undefined) {
            throw new ParseError(`line ${line}: unknown escape '\\${e ?? ''}' in a string; `
              + `the escapes are ${[...ESCAPES.keys()].map((k) => `\\${k}`).join(' ')}`);
          }
          out += r; j += 2;
        } else { if (src[j] === '\n') line++; out += src[j]; j++; }
      }
      if (j >= n) throw new ParseError(`line ${line}: unterminated string`);
      toks.push({ t: 'str', v: out, line });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9]/.test(src[j])) j++;
      toks.push({ t: 'int', v: src.slice(i, j), line });
      i = j;
      continue;
    }
    // `$` is a name character in LEADING position only. Every reflected name
    // the kernel builds ($lit, $cons, $var, $nil, $not, $builtin, $fact, and
    // the tense atoms $now/$init/$next) has the marker first and nothing else,
    // so admitting it there — and nowhere else — makes the reflection readable
    // from the language that produces it, without letting `_$0` (the parser's
    // own name for an anonymous variable, minted below) be written by hand.
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1; // first char already classified; for `$` it is not a continuation char
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      const w = src.slice(i, j);
      toks.push({ t: /[A-Z_]/.test(c) ? 'var' : 'ident', v: w, line });
      i = j;
      continue;
    }
    let matched = '';
    for (const p of PUNCT) if (src.startsWith(p, i) && p.length > matched.length) matched = p;
    if (matched) { toks.push({ t: matched, v: matched, line }); i += matched.length; continue; }
    throw new ParseError(`line ${line}: unexpected character '${c}'`);
  }
  toks.push({ t: 'eof', v: '', line });
  return toks;
}

/** Text -> a ROFL string literal, and the exact inverse of what `tokenize`
 *  does above. It lives HERE, beside the unescaping, because the two are one
 *  decision and keeping them apart is what sent a caller to `JSON.stringify`:
 *  JSON's `\n` is a LINE FEED, this language's `\n` is the LETTER n, so a
 *  source handed through JSON arrives with every newline replaced by a letter
 *  and fails in a way that reads like a grammar gap.
 *
 *  An escape here means "take the next character literally", so exactly two
 *  characters need one and a newline is written as itself. */
/** Refused by `escapeString`. Separate from `ParseError` because nothing has
 *  been parsed: the text simply cannot be WRITTEN as a legal source file. */
export class UnwritableString extends Error {}

export function escapeString(s: string): string {
  let out = '"';
  for (const ch of s) {
    // A character with no named escape is written as ITSELF, which is right
    // for anything printable and wrong for a control byte: the round trip
    // would still hold, and scripts/text_check.ts would refuse the file it
    // landed in. Refusing here names the character; the alternative is a
    // string that parses back perfectly out of a file nobody can commit.
    const cp = ch.codePointAt(0)!;
    if ((cp < 0x20 && ch !== '\n' && ch !== '\t' && ch !== '\r') || cp === 0x7f) {
      throw new UnwritableString(
        `U+${cp.toString(16).padStart(4, '0').toUpperCase()} has no escape and cannot be `
        + `written literally: scripts/text_check.ts refuses that byte in a source file`);
    }
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\r') out += '\\r';
    else out += ch;
  }
  return out + '"';
}
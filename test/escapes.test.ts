// String escapes: the table, its inverse, and the WHOLE boundary swept.
//
// Until 2026-09-04 an escape meant "take the next character literally", so the
// two-character sequence for a newline was the LETTER n and no escape produced
// a line feed. That was a trap and a gap: a carriage return was inexpressible,
// since a literal CR is refused by scripts/text_check.ts and no escape made
// one. The change to C-style was measured before it was made — the corpus held
// 88 escapes and every one was a quote or a backslash — so it altered not one
// existing string.
//
// NOT ONE BACKSLASH APPEARS IN THIS FILE'S OWN LITERALS. Every sequence is
// built from character codes, because a test about escaping written with
// escaping is a test whose subject and whose notation can be wrong together —
// which happened twice while writing it.
//
// THE BOUNDARY IS SWEPT, NOT SAMPLED: every byte of C0 plus SPACE plus DEL is
// planted one at a time and the allowed set is asserted BY NAME. The oracle is
// text_check's own predicate, so the escaper and the gate are compared byte for
// byte rather than by intention.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgram, escapeString, ParseError, UnwritableString } from '../src/parser.ts';

const BS = String.fromCharCode(92);   // a backslash, never written as one
const Q = String.fromCharCode(34);    // a double quote
const TAB = 0x09, LF = 0x0a, CR = 0x0d, DEL = 0x7f;

/** scripts/text_check.ts:96, restated so the two can be compared. */
const gateBans = (b: number) => (b < 0x20 && b !== TAB && b !== LF && b !== CR) || b === DEL;

const valueOf = (lit: string): string =>
  (parseProgram(`p(${lit}).`)[0].head.args[0] as { v: string }).v;

/** `"a<esc>b"` as source text. */
const lit = (esc: string) => Q + 'a' + BS + esc + 'b' + Q;
/** `a<ch>b` as the value it should read as. */
const val = (code: number) => 'a' + String.fromCharCode(code) + 'b';

test('the named escapes read as the characters they name', () => {
  assert.equal(valueOf(lit('n')), val(LF));
  assert.equal(valueOf(lit('t')), val(TAB));
  assert.equal(valueOf(lit('r')), val(CR));
  assert.equal(valueOf(lit(BS)), val(92));
  assert.equal(valueOf(lit(Q)), val(34));
});

test('an unknown escape is REFUSED, not silently dropped', () => {
  // Dropping the backslash is the silently-wrong class: the program keeps
  // running with a value nobody wrote. The corpus contains no such escape, so
  // refusing costs nothing today and catches every typo from here on.
  for (const bad of ['q', '0', 'x', 'u', 'a', ' ']) {
    assert.throws(() => valueOf(lit(bad)), ParseError,
      'an escape of ' + JSON.stringify(bad) + ' must be refused');
  }
});

test('escapeString and the parser are inverse over the whole control boundary', () => {
  const codes = [...Array(0x21).keys(), DEL];
  const writable: number[] = [];
  let refused = 0;
  for (const c of codes) {
    const s = val(c);
    let text: string;
    try { text = escapeString(s); } catch (e) {
      assert.ok(e instanceof UnwritableString, 'U+' + c.toString(16) + ': wrong error type');
      refused++;
      continue;
    }
    assert.equal(valueOf(text), s, 'U+' + c.toString(16) + ' must round-trip');
    // and the literal it produced must ITSELF be legal in a source file —
    // round-tripping is not the same as being writable, and a check that reads
    // only the value cannot see the difference.
    assert.ok(![...text].some((ch) => gateBans(ch.codePointAt(0)!)),
      'U+' + c.toString(16) + ' round-trips but the file would be refused');
    writable.push(c);
  }
  // THE ALLOWED SET, BY NAME, so a future widening has to change this line.
  assert.deepEqual(writable, [TAB, LF, CR, 0x20]);
  assert.equal(refused, codes.length - 4);
});

test('escapeString agrees with the text gate byte for byte', () => {
  // The two were written apart and could drift. This is the whole check.
  for (const c of [...Array(0x21).keys(), DEL]) {
    let writable = true;
    try { escapeString(val(c)); } catch { writable = false; }
    assert.equal(writable, !gateBans(c),
      'U+' + c.toString(16) + ': escapeString writable=' + writable
      + ' but the gate bans=' + gateBans(c));
  }
});

test('a newline inside a string still counts as a line', () => {
  // The tokenizer used not to count lines inside a string literal, so every
  // error after one was reported one line early. Found while writing ring 1.
  const src = 'p(' + Q + 'a' + String.fromCharCode(LF) + 'b' + Q + ').'
            + String.fromCharCode(LF) + 'q(';
  assert.throws(() => parseProgram(src), (e: unknown) => {
    assert.match((e as Error).message, /line 3/);
    return true;
  });
});

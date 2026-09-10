// parser.ts — THE GRAMMAR: source text → clause objects. Clause objects are a
// transient parse artifact; the evaluator's source of truth is the reflected
// store (reflect.ts), and the clause TYPES live with the terms in unify.ts.
//
// Nothing in the kernel enters this file. It is reached only by a host that
// reads ROFL source: measured 2026-09-07, the dense task touches 8 of its 174
// code lines and all 8 are declarations executed when the module is evaluated
// — no body of the grammar runs. What the kernel itself needs out of reading
// is the LEXIS, and that is `tokens.ts`.

import { type Term, type Lit, type BodyElem, type Clause, type Temporal, mkv, mki, mks, mka, mkf } from './unify.ts';

// The clause structures live in `unify.ts` with the terms they are built out
// of; they are re-exported here because a parser is where a caller expects to
// find the shape of what it returns.
export type { Temporal, Lit, BodyElem, Clause } from './unify.ts';

// The lexis lives in `tokens.ts`: it is the one part of reading that the
// kernel itself needs (`atom_of` asks it what a writable name is), while this
// grammar is entered only by a host that reads ROFL source text.
import { type Tok, ParseError, tokenize } from './tokens.ts';
export { ParseError, UnwritableString, tokenize, escapeString } from './tokens.ts';

/** Exported so a model of this system's own features can be DERIVED from the
 *  set the parser dispatches on rather than typed beside it. A hand-typed copy
 *  of this list in scanners/features.ts spelled modulo `%`, which this language
 *  writes `mod` — so the census reported a feature that does not exist and then
 *  reported that nobody uses it. */
export const CMP_OPS = new Set(['=', '!=', '<', '<=', '>', '>=']);

class P {
  toks: Tok[];
  pos = 0;
  constructor(toks: Tok[]) { this.toks = toks; }
  peek(): Tok { return this.toks[this.pos]; }
  next(): Tok { return this.toks[this.pos++]; }
  expect(t: string): Tok {
    const tok = this.next();
    if (tok.t !== t) throw new ParseError(`line ${tok.line}: expected '${t}', got '${tok.v || tok.t}'`);
    return tok;
  }
  err(msg: string): never {
    throw new ParseError(`line ${this.peek().line}: ${msg}`);
  }

  // --- terms ------------------------------------------------------------
  private freshCounter = 0;

  term(): Term {
    const t = this.peek();
    if (t.t === 'var') {
      this.next();
      if (t.v === '_') return mkv(`_$${this.freshCounter++}`);
      return mkv(t.v);
    }
    if (t.t === 'int') { this.next(); return mki(parseInt(t.v, 10)); }
    if (t.t === '-' && this.toks[this.pos + 1].t === 'int') {
      this.next();
      const v = this.next();
      return mki(-parseInt(v.v, 10));
    }
    if (t.t === 'str') { this.next(); return mks(t.v); }
    if (t.t === 'ident') {
      this.next();
      if (this.peek().t === '(') {
        this.next();
        const args = this.termList();
        this.expect(')');
        return mkf(t.v, args);
      }
      return mka(t.v);
    }
    this.err(`expected a term, got '${t.v || t.t}'`);
  }

  termList(): Term[] {
    const out = [this.term()];
    while (this.peek().t === ',') { this.next(); out.push(this.term()); }
    return out;
  }

  // Arithmetic expression: + - over * / mod, primaries are terms and (expr).
  expr(): Term {
    let l = this.mulExpr();
    for (;;) {
      const t = this.peek().t;
      if (t === '+' || t === '-') {
        this.next();
        l = mkf(t, [l, this.mulExpr()]);
      } else return l;
    }
  }
  mulExpr(): Term {
    let l = this.primary();
    for (;;) {
      const t = this.peek();
      if (t.t === '*' || t.t === '/') { this.next(); l = mkf(t.t, [l, this.primary()]); }
      else if (t.t === 'ident' && t.v === 'mod') { this.next(); l = mkf('mod', [l, this.primary()]); }
      else return l;
    }
  }
  primary(): Term {
    if (this.peek().t === '(') {
      this.next();
      const e = this.expr();
      this.expect(')');
      return e;
    }
    return this.term();
  }

  // --- literals ---------------------------------------------------------
  literal(): Lit {
    const rel = this.expect('ident').v;
    return this.literalAfterRel(rel);
  }

  literalAfterRel(rel: string): Lit {
    let persp: Term = mka('main');
    let perspExplicit = false;
    if (this.peek().t === '[') {
      this.next();
      const p = this.next();
      if (p.t === 'ident') persp = mka(p.v);
      else if (p.t === 'var') persp = mkv(p.v);
      else this.err(`bad perspective '${p.v}'`);
      this.expect(']');
      perspExplicit = true;
    }
    this.expect('(');
    // A NULLARY LITERAL IS `p()`, ADDED 2026-09-10 by the owner's decision.
    // A relation of arity n is a set of n-TUPLES and there is exactly one
    // 0-tuple, so a nullary relation's extension is empty or the singleton —
    // it is a TRUTH VALUE, and a proposition is the base case that makes
    // propositional logic a special case of the predicate logic this language
    // already is. It was excluded by one grammar production written the
    // obvious way (`terms := term ("," term)*`), with no reason recorded
    // anywhere and with the store already able to hold one.
    //
    // THE SPELLING IS `p()` AND NOT BARE `p`, which is the whole of the
    // caution. `bodyElem` dispatches on `ident` followed by `[` or `(`, and a
    // term is also an atom — a bare `p` in a body would need lookahead to tell
    // a nullary literal from an atom in term position, and every future
    // syntax would have to keep telling them apart. Empty parens are
    // unambiguous at every site and say what they are.
    const args = this.peek().t === ')' ? [] : this.termList();
    this.expect(')');
    const temporal = this.temporal();
    return { rel, persp, perspExplicit, args, temporal };
  }

  temporal(): Temporal {
    if (this.peek().t !== '@') return 'now';
    this.next();
    const w = this.expect('ident').v;
    if (w === 'init' || w === 'now' || w === 'next') return w;
    if (w === 'async') this.err(`'@async' is reserved syntax, not in v0`);
    this.err(`bad temporal '@${w}'`);
  }

  // --- body elements ----------------------------------------------------
  bodyElem(): BodyElem {
    const t = this.peek();
    if (t.t === 'ident' && t.v === 'not' &&
        (this.toks[this.pos + 1].t === 'ident')) {
      this.next();
      return { t: 'neg', lit: this.literal() };
    }
    // A relational literal starts ident + '[' (perspective form is unambiguous).
    if (t.t === 'ident' && this.toks[this.pos + 1].t === '[') {
      return { t: 'pos', lit: this.literal() };
    }
    // A NULLARY LITERAL IS `ident ( )` AND MUST BE TAKEN HERE, before the
    // expression attempt below. A positive body literal is parsed FIRST as an
    // expression and only rewound if that produced a functor — and `expr()`
    // reaches `term()`, which demands at least one argument, so `flag()` died
    // with `expected a term, got ')'` while `not flag()` parsed fine through
    // the `neg` arm above. Measured on the first probe set: three of six
    // shapes worked and this was the one that did not. Two tokens of lookahead
    // decide it exactly; there is nothing else `ident ( )` can be.
    if (t.t === 'ident' && this.toks[this.pos + 1].t === '(' &&
        this.toks[this.pos + 2].t === ')') {
      return { t: 'pos', lit: this.literal() };
    }
    // Otherwise parse an expression; if a comparison/'is' operator follows it
    // is a builtin, else it must have been a plain literal rel(args).
    // THE COUNTER IS PART OF THE POSITION. A positive body literal is parsed
    // TWICE - once as an expression, then rewound and parsed again as a
    // literal - and each pass consumes the wildcards, so a rewind that
    // restores `pos` and not `freshCounter` numbered them 1, 3, 5 instead of
    // 0, 1, 2. That made a variable's NAME a function of how often the parser
    // backtracked over it rather than of the program, and `ruleIdOf` is a
    // content hash over the canonical clause INCLUDING variable names. Found
    // by ring 1, which has no backtracking and therefore disagreed.
    const save = this.pos;
    const saveFresh = this.freshCounter;
    const e = this.expr();
    const nxt = this.peek();
    if (CMP_OPS.has(nxt.t)) {
      this.next();
      const r = this.expr();
      return { t: 'bi', op: nxt.t, l: e, r };
    }
    if (nxt.t === 'ident' && nxt.v === 'is') {
      this.next();
      const r = this.expr();
      return { t: 'bi', op: 'is', l: e, r };
    }
    // reinterpret as literal
    if (e.k === 'f' && /^[a-z]/.test(e.name)) {
      this.pos = save;
      this.freshCounter = saveFresh;
      return { t: 'pos', lit: this.literal() };
    }
    this.err(`expected a literal or builtin`);
  }

  clause(): Clause {
    this.freshCounter = 0; // wildcard names are clause-local => content-addressed
    const head = this.literal();
    if (this.peek().t === '.') { this.next(); return { head, body: [] }; }
    this.expect(':-');
    const body: BodyElem[] = [this.bodyElem()];
    while (this.peek().t === ',') { this.next(); body.push(this.bodyElem()); }
    this.expect('.');
    for (const b of body) {
      if ((b.t === 'pos' || b.t === 'neg') && b.lit.temporal === 'next') {
        this.err(`'@next' is not allowed in rule bodies`);
      }
    }
    if (head.temporal === 'init' && body.length > 0) {
      this.err(`'@init' is not allowed on rule heads`);
    }
    return { head, body };
  }

  program(): Clause[] {
    const out: Clause[] = [];
    while (this.peek().t !== 'eof') out.push(this.clause());
    return out;
  }
}


export function parseProgram(src: string): Clause[] {
  return new P(tokenize(src)).program();
}

/** Parse a single literal (for queries: ?, why, whynot, excise). */
export function parseLiteral(src: string): Lit {
  const p = new P(tokenize(src));
  const lit = p.literal();
  if (p.peek().t === '.') p.next();
  p.expect('eof');
  return lit;
}

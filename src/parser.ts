// parser.ts — THE GRAMMAR: source text → clause objects. Clause objects are a
// transient parse artifact; the evaluator's source of truth is the reflected
// store (reflect.ts), and the clause TYPES live with the terms in unify.ts.
//
// Nothing in the kernel enters this file. It is reached only by a host that
// reads ROFL source: measured 2026-09-07, the dense task touches 8 of its 174
// code lines and all 8 are declarations executed when the module is evaluated
// — no body of the grammar runs. What the kernel itself needs out of reading
// is the LEXIS, and that is `tokens.ts`.

import { type Term, type Lit, type BodyElem, type Clause, type Temporal, type Int, mkv, mki, mks, mka, mkf, normInt } from './unify.ts';

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

/** The nine aggregate operations. WORDS, NOT KEYWORDS: `count` is an aggregate
 *  only after `is`, followed by `(`, with a `:` at the top level before the
 *  matching `)`; everywhere else it is an ordinary name. */
export const AGG_OPS = new Set(['count', 'sum', 'min', 'max', 'or', 'and', 'median', 'quantile', 'rank']);
/** What a lattice declaration may name: the aggregate words, which the door
 *  judges, and the joins, which only a declaration names. */
export const LATTICE_OPS = new Set([...AGG_OPS, 'union', 'hull', 'bitor']);
/** The semirings a tag declaration may name (docs/aggregates.md, "Tags, as
 *  built"): words, names everywhere else. */
export const TAG_ALGS = new Set(['tropical', 'viterbi', 'trust', 'counting']);

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
  /** A statement that ends without its dot, and the token found there, so an editor marks that token (lsp/know.ts). */
  noDot(what: string): never {
    const t = this.peek();
    return this.err(`${what} has no closing dot: got '${t.v || t.t}'`);
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
    if (t.t === 'int') { this.next(); return mki(this.intLiteral(t.v, false)); }
    if (t.t === '-' && this.toks[this.pos + 1].t === 'int') {
      this.next();
      const v = this.next();
      return mki(-this.intLiteral(v.v, true));
    }
    if (t.t === 'str') { this.next(); return mks(t.v); }
    if (t.t === 'ident') {
      this.next();
      if (this.peek().t === '(') {
        this.next();
        const args = this.termList();
        if (this.peek().t !== ')') this.err(`\`${t.v}(\` is not closed: expected ')', got '${this.peek().v || this.peek().t}'`);
        this.next();
        return mkf(t.v, args);
      }
      return mka(t.v);
    }
    this.err(`expected a term, got '${t.v || t.t}'`);
  }

  /** The term range is [-2^60, 2^60), the same refusal as rust/rofl's
   *  `int_literal`: past it the Rust engine read ZERO where this one read a
   *  float, so the two engines answered differently about one literal. */
  intLiteral(digits: string, negated: boolean): Int {
    const v = BigInt(digits), limit = 1n << 60n;
    if (v > limit || (v === limit && !negated)) this.err(`integer literal out of range (\u00b12^60): ${negated ? '-' : ''}${digits}`);
    return normInt(v);
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
    if (this.peek().t !== 'ident') this.err(`not a relation name: '${this.peek().v || this.peek().t}'`);
    const rel = this.next().v;
    // A KEYWORD IS NOT A RELATION NAME. `not` was accepted here and `not(1).`
    // loaded as a fact about a relation called `not`, while the Rust engine
    // refused it at `relbook` — one of three spellings the two hosts disagreed
    // about, found when a 33 406-row fact pack was refused whole by one of
    // them. Negation is decided by what FOLLOWS `not` in a body, so the two
    // readings are one token apart: `not p(X)` is a negation and `not(X)` was
    // a literal. Nothing in the tree named a relation `not`, and the word
    // stays free in ARGUMENT position, where there is nothing to confuse it
    // with.
    if (rel === 'not') this.err(`'not' is negation, not a relation name`);
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
    // `not X in S`: a negation takes a literal, and a variable is no relation name
    if (t.t === 'ident' && t.v === 'not' && this.toks[this.pos + 1].t === 'var') { this.next(); this.err(`not a relation name: '${this.peek().v}'`); }
    if (t.t === 'ident' && t.v === 'at_least' && this.isColonCall()) return this.threshold();
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
    // THE JOIN READS `E in S` and `A subset S` (docs/aggregates.md, "The join
    // lattice, as built"): words where an operator stands, names elsewhere.
    if (nxt.t === 'ident' && (nxt.v === 'in' || nxt.v === 'subset')) {
      this.next();
      const r = this.expr();
      return { t: 'bi', op: nxt.v, l: e, r };
    }
    if (nxt.t === 'ident' && nxt.v === 'is') {
      const isAt = this.pos;
      this.next();
      if (this.isAggCall()) return this.agg(save, saveFresh, isAt);
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

  /** `op(` with a `:` at depth one before the matching `)`. */
  isAggCall(): boolean {
    const t = this.peek();
    return t.t === 'ident' && AGG_OPS.has(t.v) && this.isColonCall();
  }

  /** `word(` with a `:` at depth one before the matching `)`. */
  isColonCall(): boolean {
    if (this.toks[this.pos + 1].t !== '(') return false;
    let depth = 0;
    for (let i = this.pos + 1; i < this.toks.length; i++) {
      const k = this.toks[i].t;
      if (k === '(' || k === '[') depth++;
      else if (k === ')' || k === ']') { depth--; if (depth === 0) return false; }
      else if (k === ':' && depth === 1) return true;
      else if (k === '.' || k === 'eof') return false;
    }
    return false;
  }

  /**   aggelem  := term 'is' aggop '(' termlist [ ';' termlist ] ':' body ')'
   *  The result is re-read from where the builtin's left side began: it must
   *  be ONE term that ends exactly at `is`, so `N+1 is count(...)` is refused. */
  agg(start: number, fresh: number, isAt: number): BodyElem {
    const after = this.pos;
    this.pos = start;
    this.freshCounter = fresh;
    const res = this.term();
    if (this.pos !== isAt) this.err(`an aggregate's result is a variable or a constant, not an expression`);
    this.pos = after;
    const op = this.next().v;
    this.expect('(');
    const vals = this.aggTerms();
    let keys: Term[] = [];
    if (this.peek().t === ';') { this.next(); keys = this.aggTerms(); }
    if (this.peek().t !== ':') this.err(`expected ':' before the aggregate's body, got '${this.peek().v || this.peek().t}'`);
    this.next();
    const body: BodyElem[] = [this.bodyElem()];
    while (this.peek().t === ',') { this.next(); body.push(this.bodyElem()); }
    if (this.peek().t !== ')') this.err(`\`${op}(\` is not closed`);
    this.next();
    return { t: 'agg', op, res, vals, keys, body };
  }

  /**   thrselem := 'at_least' '(' term ',' termlist ':' body ')'
   *  The threshold N is read, never bound: an integer or a variable bound
   *  before it. The counted terms are the key, so there is no `;`. */
  threshold(): BodyElem {
    const op = this.next().v;
    this.expect('(');
    if (this.peek().t === ':' || this.peek().t === ',') this.err(`at_least(N, X : body) needs its threshold N`);
    const res = this.term();
    const n = this.peek().t;
    if (n === '+' || n === '-' || n === '*' || n === '/' || (n === 'ident' && this.peek().v === 'mod')) {
      this.err(`at_least: the threshold is a term, not an expression: bind N is ... before it`);
    }
    if (this.peek().t !== ',') this.err(`at_least(N, X : body): expected ',' after the threshold`);
    this.next();
    const vals = this.aggTerms();
    if (this.peek().t === ';') this.err(`at_least takes no key: the counted terms are the key, at_least(N, K1, K2 : body)`);
    if (this.peek().t !== ':') this.err(`at_least: expected ':' before its body, got '${this.peek().v || this.peek().t}'`);
    this.next();
    const body: BodyElem[] = [this.bodyElem()];
    while (this.peek().t === ',') { this.next(); body.push(this.bodyElem()); }
    if (this.peek().t !== ')') this.err(`at_least: \`at_least(\` is not closed`);
    this.next();
    return { t: 'agg', op, res, vals, keys: [], body };
  }

  aggTerms(): Term[] {
    if (this.peek().t === ':' || this.peek().t === ';') this.err(`an aggregate needs at least one term before '${this.peek().t}'`);
    const out = this.termList();
    const n = this.peek().t;
    if (n === '+' || n === '-' || n === '*' || n === '/' || (n === 'ident' && this.peek().v === 'mod')) {
      this.err(`an aggregate's terms are not expressions: bind W is ... inside its body`);
    }
    return out;
  }

  /**   latdecl  := 'lattice' ident '(' [ term ',' ]* aggop term ')' [ 'widen' int ] '.'
   *  A word, not a keyword: it declares only when a second name follows. */
  latticeDecl(): Clause {
    this.next();
    const rel = this.expect('ident').v;
    if (rel === 'not') this.err(`'not' is negation, not a relation name`);
    if (this.peek().t === '[') this.err(`lattice ${rel}: a declaration names the relation, not a book`);
    if (this.peek().t !== '(') this.err(`lattice ${rel}: expected '('`);
    this.next();
    const args: Term[] = [];
    let op = '';
    for (;;) {
      const t = this.peek(), n = this.toks[this.pos + 1].t;
      if (t.t === 'ident' && LATTICE_OPS.has(t.v) && n !== ',' && n !== ')' && n !== '(') { this.next(); op = t.v; break; }
      args.push(this.term());
      if (this.peek().t !== ',') this.err(`lattice ${rel}: the last argument is the value, written with its operation: min D, max D, or B, and B, union S, hull I, bitor B`);
      this.next();
    }
    args.push(this.term());
    if (this.peek().t !== ')') this.err(`lattice ${rel}: \`(\` is not closed`);
    this.next();
    // `widen N`: a word, then the number of improvements before a cell is widened
    let widen: number | undefined;
    if (this.peek().t === 'ident' && this.peek().v === 'widen') {
      this.next();
      const n = this.peek();
      if (n.t !== 'int') this.err(`lattice ${rel}: \`widen\` is followed by the number of improvements a cell makes before it is widened, an integer of at least 0`);
      this.next();
      widen = Number(this.intLiteral(n.v, false));
    }
    if (this.peek().t !== '.') this.noDot(`lattice ${rel}: the declaration`);
    this.next();
    const decl: Clause = { head: { rel, persp: mka('main'), perspExplicit: false, args, temporal: 'now' }, body: [], lattice: op };
    if (widen !== undefined) decl.widen = widen;
    return decl;
  }

  /**   tagdecl  := 'tag' ident '(' [ term ',' ]* tagalg term ')' '.'
   *  A word, not a keyword: it declares only when a second name follows. */
  tagDecl(): Clause {
    this.next();
    const rel = this.expect('ident').v;
    if (rel === 'not') this.err(`'not' is negation, not a relation name`);
    if (this.peek().t === '[') this.err(`tag ${rel}: a declaration names the relation, not a book`);
    if (this.peek().t !== '(') this.err(`tag ${rel}: expected '('`);
    this.next();
    const args: Term[] = [];
    let alg = '';
    for (;;) {
      const t = this.peek(), n = this.toks[this.pos + 1].t;
      if (t.t === 'ident' && TAG_ALGS.has(t.v) && n !== ',' && n !== ')' && n !== '(') { this.next(); alg = t.v; break; }
      args.push(this.term());
      if (this.peek().t !== ',') this.err(`tag ${rel}: the last argument is the tag, written with its semiring: tropical T, viterbi P, trust T, counting N`);
      this.next();
    }
    args.push(this.term());
    if (this.peek().t !== ')') this.err(`tag ${rel}: \`(\` is not closed`);
    this.next();
    if (this.peek().t !== '.') this.noDot(`tag ${rel}: the declaration`);
    this.next();
    return { head: { rel, persp: mka('main'), perspExplicit: false, args, temporal: 'now' }, body: [], lattice: alg, tag: true };
  }

  clause(): Clause {
    this.freshCounter = 0; // wildcard names are clause-local => content-addressed
    if (this.peek().t === 'ident' && this.peek().v === 'lattice' && this.toks[this.pos + 1].t === 'ident') {
      return this.latticeDecl();
    }
    if (this.peek().t === 'ident' && this.peek().v === 'tag' && this.toks[this.pos + 1].t === 'ident') {
      return this.tagDecl();
    }
    const head = this.literal();
    // `domrule := lit '<=' lit ':-' body '.'` (docs/aggregates.md,
    // "Subsumption, as built"): read, and refused with the aggregates
    if (this.peek().t === '<=') {
      this.next();
      const dominator = this.literal();
      if (this.peek().t !== ':-') this.err(`dominance ${head.rel}: \`<=\` is followed by the dominating fact and \`:-\` the condition under which it dominates`);
      this.next();
      const body: BodyElem[] = [this.bodyElem()];
      while (this.peek().t === ',') { this.next(); body.push(this.bodyElem()); }
      if (this.peek().t !== '.') this.noDot(`dominance ${head.rel}: the rule`);
      this.next();
      return { head, body, dominator };
    }
    if (this.peek().t === '.') { this.next(); return { head, body: [] }; }
    if (this.peek().t !== ':-') this.noDot(`\`${head.rel}\``);
    this.next();
    const body: BodyElem[] = [this.bodyElem()];
    while (this.peek().t === ',') { this.next(); body.push(this.bodyElem()); }
    if (this.peek().t !== '.') this.noDot(`\`${head.rel}\``);
    this.next();
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

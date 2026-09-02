// reflect.ts — rules ⇄ subgraphs in the SAME store.
// After parsing, every rule is stored as facts; the evaluator reads rules
// only from the store (decodeRules). This file is the single place where
// the kernel's relation vocabulary appears — see scripts/kernel_grep.ts.

import {
  type Term, type Subst, type ArithFail, mka, mks, mkv, mkf, mki, canonTerm, fnv1a,
  walk, evalArith, ARITH_UNBOUND, ARITH_TYPE, ARITH_ZERO,
} from './unify.ts';
import type { Clause, Lit, BodyElem, Temporal } from './parser.ts';
import { type FactStore } from './store.ts';

/** §2 kernel vocabulary: reserved, write-protected relations. */
export const V = {
  derived_by: 'derived_by',
  rule: 'rule',
  has_premise: 'has_premise',
  premise_pos: 'premise_pos',
  premise_neg: 'premise_neg',
  concludes: 'concludes',
  has_conclusion: 'has_conclusion',
  reads_from: 'reads_from',
  writes_to: 'writes_to',
  mode: 'mode',
  reserved: 'reserved',
  authority: 'authority',
  asserted_by: 'asserted_by',
  hole: 'hole',
  edb: 'edb',
  // reflection detail relations (documented §2 extension, per Appendix A note)
  bridge_decl: 'bridge_decl',
  in_perspective: 'in_perspective',
  uses_builtin: 'uses_builtin',
  premise_lit: 'premise_lit',
  conclusion_lit: 'conclusion_lit',
  conclusion_tense: 'conclusion_tense',
} as const;

export const RESERVED: ReadonlySet<string> = new Set(Object.values(V));

/** The relations that MOVE into `[$kernel]`: what the kernel writes ABOUT a
 *  program -- the structure of its rules and the trail of its assertions.
 *
 *  The line is drawn at the WRITER, and the four RESERVED names left out are
 *  left out because programs legitimately write them by hand: `authority`
 *  (`authority(code, scanner).` is the documented preamble), `edb` (233 facts
 *  in the corpus declare an input), `mode` and `reserved` (the kernel's tables,
 *  read by `unmoded[audit]` and `breach[audit]` and assertable by a program
 *  that wants to extend them). A co-written table cannot live in a book whose
 *  writer list is one principal, and forcing it there would make every honest
 *  `authority(s1, sensor_net).` a `forged[audit]` -- a gate red on the first
 *  load of every program here, which is a gate that gets switched off.
 *
 *  `derived_by` and `hole` are on the list by the same test, and they were the
 *  last two to arrive: they are written from src/engine.ts and src/rounds.ts,
 *  and until those files were free the provenance trail and the refusal record
 *  stayed in `[main]`, where `$anon` has standing and `derived_by(x, r_never,
 *  0).` was accepted with `forged[audit]` at 0. Same hole as the rest of the
 *  trail, one file away from the fix.
 *
 *  `edb` did NOT follow them out of src/engine.ts, and that is the line, not an
 *  oversight: `edb(unknown)` is written there by the kernel, and 233 `edb(...)`
 *  facts in the corpus are written by hand. A co-written table cannot be split
 *  across two books — boot.rofl's `undefined_premise[audit]` reads `not
 *  edb(Rel)` once and must see both — so it stays whole, in `[main]`, with the
 *  rest of the declaration table. */
export const KERNEL_BOOK: ReadonlySet<string> = new Set<string>([
  V.rule, V.has_premise, V.has_conclusion, V.premise_pos, V.premise_neg,
  V.premise_lit, V.conclusion_lit, V.conclusion_tense, V.concludes,
  V.reads_from, V.writes_to, V.uses_builtin, V.in_perspective, V.asserted_by,
  V.bridge_decl, V.derived_by, V.hole,
]);

/** Is this perspective one of the kernel's own books?
 *
 *  ONE definition, exported, because the test is a PREFIX and a prefix test
 *  copied into four files is four chances to write `=== '$kernel'` in one of
 *  them and reopen the ring for the next kernel ledger. src/api.ts refuses a
 *  clause that writes one, and src/engine.ts refuses to instantiate a
 *  perspective VARIABLE to one — two different questions with one answer. */
export function isKernelLedger(p: string): boolean {
  return p.startsWith('$');
}

/** Stratification interface: the kernel READS these, boot.rofl writes them.
 *  Not reserved (rules may conclude into them). Documented in README.
 *
 *  `semantics` and `unknown` extend the same contract to the three-valued
 *  answer: the PROGRAM declares `semantics(well_founded).` and the kernel
 *  writes one `unknown(Atom)` per atom the alternating fixpoint leaves
 *  undefined. Kept out of RESERVED for the same reason as the other two — a
 *  rule may read them, and `bootstrapKernel` must not start writing a
 *  `reserved`/`edb` row for a name that did not exist before. */
export const IFACE = {
  stratum: 'stratum', unstratified: 'unstratified',
  semantics: 'semantics', unknown: 'unknown',
} as const;

/** The arity every kernel-read relation is READ AT. Not decoration: the
 *  readers destructure positionally and then dereference, so a row of the
 *  wrong width is not ignored, it is a crash.
 *
 *  MEASURED, by sweeping all 25 names across arities 0..4, as facts and as
 *  rule heads, under all four evaluator/semantics configurations: two names
 *  take the host down with `TypeError: Cannot read properties of undefined
 *  (reading 'k')` rather than refusing the program. `premise_lit/1` does it
 *  under EVERY configuration (`decodeRules` below, which tests `f.args[1].k`
 *  before anything has established there is an `args[1]`), and `stratum/1`
 *  does it under the `strata` evaluator (`readStrata` in src/engine.ts, same
 *  shape: `const [rel, n] = f.args` then `n.k`). The other 23 are inert at the
 *  wrong width, which is luck about where each reader happens to look, not a
 *  property anything enforces.
 *
 *  A wrong program must be REFUSED, naming what is wrong; a host crash is
 *  neither an answer nor a refusal, and it is the one outcome a kernel may not
 *  have. `src/api.ts` refuses at admission against this table, which reaches
 *  both crashes and the 23 latent ones from a single place — patching the two
 *  readers would have left the next reader to be written unguarded.
 *
 *  The numbers are the kernel's own, read off a live store rather than off the
 *  writers by eye: every name here was observed at exactly one width across
 *  five worlds. `stratum` and `unstratified` are the two nothing writes any
 *  more (boot.rofl stopped deriving them), so theirs come from the readers —
 *  `readStrata` reads a pair, `checkUnstratified` a single — and from the 53
 *  `stratum(Rel, N)` uses standing in the corpus. */
export const ARITY: Readonly<Record<string, number>> = {
  asserted_by: 3, authority: 2, bridge_decl: 3, concludes: 2,
  conclusion_lit: 3, conclusion_tense: 2, derived_by: 3, edb: 1,
  has_conclusion: 2, has_premise: 2, hole: 2, in_perspective: 2,
  mode: 2, premise_lit: 3, premise_neg: 2, premise_pos: 2,
  reads_from: 2, reserved: 1, rule: 1, uses_builtin: 2, writes_to: 2,
  semantics: 1, stratum: 2, unknown: 1, unstratified: 1,
};

/** The one value `semantics/1` is read for. Any other argument is a fact the
 *  kernel does not act on, which is what a declaration it does not know
 *  SHOULD be: data, not an error. */
export const WELL_FOUNDED = 'well_founded';

export const MAIN = 'main';
export const KERNEL_WHO = '$kernel';
/** THE KERNEL'S OWN BOOK, and why it is spelled with the ring marker.
 *
 *  `[main]` carried three jobs at once: the kernel's reflection ON a program,
 *  the program's own content, and the ledger a literal lands in when nobody
 *  typed a bracket. The first is not like the other two -- it is `/proc`, and
 *  it was sharing a directory with every file whose owner had been forgotten.
 *
 *  MEASURED, and this is the reason the split is not cosmetic. `concludes`,
 *  `rule`, `reads_from` and `writes_to` are RESERVED, which stops a RULE from
 *  concluding into them and does nothing at all about a FACT. Against a bare
 *  boot.rofl, asserted anonymously (no `who`, so the kernel signs `$anon`,
 *  which `registerPersp` grants standing over every ledger):
 *
 *    reads_from(r_fake, secret). writes_to(r_fake, public).
 *        -> flow 2 -> 3, crossing 0 -> 1, leak[audit] 0 -> 1, forged[audit] 0
 *    rule(r_fake). has_premise(r_fake, 1).
 *        -> malformed[audit] 0 -> 1, forged[audit] 0
 *
 *  So a program could write the audit's own inputs and the trail said nothing.
 *  Signed `mallory` the forgery at least surfaced (`forged[audit]` 1 and 2);
 *  ANONYMOUS it was invisible, which is the cheaper attack, and it is the same
 *  inversion `ANON_WHO` above was written to close for authorship.
 *
 *  The marker is the one already in use rather than a new mechanism: `$` marks
 *  a KERNEL principal in the author slot and `src/api.ts` refuses a caller who
 *  spells one. Here it marks a kernel LEDGER in the perspective slot, and the
 *  same file refuses a clause that writes one. Prefix, not name, for the reason
 *  `checkWho` gives: the next kernel ledger is then closed by construction.
 *  The book and its sole writer share a spelling on purpose -- that is what
 *  `authority($kernel, $kernel)` says, and it is the whole writer list. */
export const KERNEL_PERSP = '$kernel';
/** The author of a fact asserted through a host call that named none.
 *
 *  Authorship is not optional: `factMetaFacts` emits `asserted_by` for EVERY
 *  asserted fact, and this is the principal it names when the caller supplied
 *  no `who`. Before this existed, an anonymous assertion produced no
 *  `asserted_by` row at all, and a fact with no row is a fact no audit over
 *  `asserted_by` can reach — anonymity was not a weaker claim, it was
 *  invisibility. Measured on a bare boot+sensors world: 9 asserted facts, 0
 *  `asserted_by` rows, `forged[audit]` blind to all of them.
 *
 *  It carries the `$` marker for the same reason `$kernel` does, and that
 *  marker is now load-bearing: `src/api.ts` refuses a caller-supplied `who`
 *  that starts with `$`, so neither principal can be claimed from outside.
 *  Without that refusal this atom would be an OPEN identity — a writer could
 *  name itself `$anon` and inherit the standing granted below. */
/** THE ORDINARY PRINCIPAL: whoever loaded a file and did not say who they are.
 *  NOT a `$` name, deliberately — `$` marks the kernel and a caller may not
 *  claim one, while `user` is exactly what any caller may claim, because it
 *  claims nothing. An unsigned fact is not "anonymous" and not "the system's":
 *  it belongs to the person at the keyboard, the way an unowned file in a home
 *  directory belongs to whoever is logged in.
 *
 *  What this replaces: `$anon`, which held authority over every ordinary book
 *  and so made anonymity THE ONLY WAY TO WRITE — a named author writing into a
 *  book it had just created was `forged[audit]` = 1, measured. */
export const ANON_WHO = 'user';
export const ANY_PERSP = '$any';
export const BUDGET_REASON = 'budget_exhausted';
/** The other wall, and it is not the same wall.
 *
 *  `budget_exhausted` says: I stopped because I had done enough WORK. The
 *  repair is to offer more of it, and offering more works — the loot demo
 *  raises a load budget and the answer completes.
 *
 *  `space_exhausted` says: I stopped because I was HOLDING too much at once.
 *  Offering more work here does not help; it is what kills the host. Measured
 *  2026-09-01 on `tri(X,Y,Z) :- q(X), q(Y), q(Z)` over 200 facts at
 *  `evaluate(50_000_000)`: FATAL heap out of memory, exit 134, with the step
 *  counter standing at ZERO — the eight-million-row cross product is built
 *  inside one `solveBody` call, and nothing is concluded until it is finished.
 *  The repair is to make the rule hold less (a selective premise, a split
 *  join) or to accept the partial answer.
 *
 *  So the two reasons point at OPPOSITE actions, and that is why one atom
 *  cannot carry both: told `budget_exhausted`, a caller raises the budget,
 *  which is precisely the move that turns this refusal back into a corpse. */
export const SPACE_REASON = 'space_exhausted';
/** Two more `hole` reasons, for an `is` whose expression cannot be evaluated.
 *  Separate atoms because they demand different repairs: a type error says
 *  the PROGRAM is wrong (no data makes a string arithmetic), a zero divisor
 *  says the DATA reached a boundary the program did not guard — the repair
 *  is a `Y != 0` premise, and examples/slop's `over` rule already writes one.
 *  One atom for both would say only "something went wrong", which is barely
 *  more than the silence this replaces. */
export const ARITH_TYPE_REASON = 'arith_type_error';
export const ARITH_ZERO_REASON = 'arith_zero_divisor';
/** Hole id marker for a rule: `hole($rule(Id), Reason)`. The rule id is a key
 *  into the reflected program, so the offending expression stays recoverable
 *  (`premise_lit(Id, K, Lit)`) without the hole carrying it — and one hole per
 *  rule, not one per offending substitution. */
export const RULE_HOLE = '$rule';

export const BUILTIN_OPS = ['=', '!=', '<', '<=', '>', '>=', 'is'] as const;

/** STRING DESTRUCTORS: taking a string apart, and why a kernel that refuses
 *  the other direction may have this one.
 *
 *  A destructor's output is a SUBSTRING of its input, or a NUMBER about it.
 *  A string of length L has at most L(L+1)/2 + 1 distinct substrings, so
 *  destructing the strings a program already holds draws every new term from
 *  a FINITE set, and composition does not escape it: a substring of a
 *  substring is a substring. A fixpoint over a finite term universe
 *  terminates BY CONSTRUCTION, whatever the rules do with it.
 *
 *  A CONSTRUCTOR -- concatenation, repetition -- returns a string that was
 *  not there, and that string can be fed straight back in. The universe is
 *  then infinite and termination stops being a property of the language. This
 *  kernel already has exactly ONE such place, `N is M + 1` over the integers,
 *  and it is the single reason a program here can fail to stop. The five
 *  operations below do not add a second one. A concatenation would.
 *
 *  MEASURED rather than asserted, in test/string-destructors.test.ts: ONE
 *  program run through both sides. Destructors only, recursively splitting
 *  every string it derives: the term count goes 1, 15, 19, 19, 19, 19 by
 *  round and the fixpoint closes in 89 steps, the same 19 terms at budgets
 *  5k, 10k, 20k and 200k. The same program with one concatenation added:
 *  2289, 6952 and 16397 terms at budgets 5k, 10k and 20k, every run ending
 *  one step past the wall with `hole(..., budget_exhausted)`. On one side the
 *  answer is a property of the program; on the other it is a property of the
 *  budget. A criterion that cannot separate those is decoration.
 *
 *  WHY THEY ARE SPELLED `Out is op(In, ...)` AND NOT `op(In, ..., Out)`. The
 *  parser has exactly one term-producing builtin form, `expr is expr`; a bare
 *  `op(A, B)` in a body is a relational literal, i.e. a premise over a
 *  relation nothing populates, which is silence rather than an operation. So
 *  the output is the LEFT operand of `is`, and that is also what makes the
 *  mode `[out, in, ...]` say something true. The number here is the count of
 *  INPUTS, and `bootstrapKernel` reads it to write the modes. */
export const STR_ARITY: ReadonlyMap<string, number> = new Map([
  ['str_char', 2], ['str_len', 1], ['str_pre', 2], ['str_seg', 3], ['str_segs', 2],
]);

/** Three refusals, kept apart because they demand three different repairs --
 *  the same reason `arith_type_error` and `arith_zero_divisor` are two atoms
 *  rather than one. A TYPE error says the program is wrong: no data makes a
 *  number into a string. An INDEX error says the data reached a boundary the
 *  program did not guard, and the repair is a premise (`N is str_len(S), I <
 *  N`). An EMPTY SEPARATOR says the segmentation is meaningless: the host
 *  would answer "one segment per character", which is `str_char`'s job and an
 *  accident of the host rather than a decision this kernel made.
 *
 *  The codes travel in `ArithFail` beside the arithmetic codes of
 *  src/unify.ts (0..2), so they continue that numbering instead of starting
 *  a second one. */
export const STR_TYPE = 3;
export const STR_INDEX = 4;
export const STR_SEP = 5;
export const STR_TYPE_REASON = 'str_type_error';
export const STR_INDEX_REASON = 'str_index_error';
export const STR_SEP_REASON = 'str_empty_separator';

/** The atom a failure code is reported as, in one place, so the evaluator's
 *  hole emitter does not grow a branch per operation. */
export function holeReasonOf(code: number): string {
  if (code === ARITH_ZERO) return ARITH_ZERO_REASON;
  if (code === STR_TYPE) return STR_TYPE_REASON;
  if (code === STR_INDEX) return STR_INDEX_REASON;
  if (code === STR_SEP) return STR_SEP_REASON;
  return ARITH_TYPE_REASON;
}

/** A string operand: a string, a variable bound to one, or a nested
 *  destructor call. Anything else is a type error EXCEPT an unbound variable,
 *  which is not an error at all (see `evalStrOp`). */
function strOperand(t: Term, s: Subst, fail?: ArithFail): string | null {
  const nested = evalStrOp(t, s, fail);
  if (nested === null) return null;
  const w = nested ?? walk(t, s);
  if (w.k === 's') return w.v;
  if (fail) fail.code = w.k === 'v' ? ARITH_UNBOUND : STR_TYPE;
  return null;
}

/** An integer operand, read as arithmetic so that a bound variable and a
 *  negative literal are both indices.
 *  A non-numeric one is reported as a STRING type error rather than an
 *  arithmetic one: the repair a reader needs is about this operation, and
 *  `arith_type_error` would send them looking at an expression that is not
 *  there. A zero divisor inside the index keeps its own reason. */
function intOperand(t: Term, s: Subst, fail?: ArithFail): number | null {
  const v = evalArith(t, s, fail);
  if (v === null && fail && fail.code === ARITH_TYPE) fail.code = STR_TYPE;
  return v;
}

/** Evaluate a string-destructor call, or say it is not one.
 *
 *  THREE ANSWERS, and the third is what leaves every `is` that existed before
 *  exactly where it was: `undefined` means "not one of these five", and the
 *  caller falls through to arithmetic unchanged; `null` is a REFUSAL, with
 *  `fail.code` naming the reason; a Term is the value.
 *
 *  An UNBOUND operand is not a refusal, for the same reason it is not one in
 *  `evalArith`: a builtin that runs before its generator is the ordinary
 *  state of a rule body, and reporting it would put a hole under every
 *  ordinary program.
 *
 *  Operands compose: a string operand may be another destructor call, so
 *  `str_len(str_seg(S, Sep, 0))` is the length of the first segment, and a
 *  substring of a substring is still a substring. An integer operand is read
 *  as arithmetic, which today reaches an integer or a variable bound to one
 *  and nothing more: the parser's argument list admits TERMS and not
 *  expressions, so `str_seg(S, Sep, N - 1)` is a parse error and the last
 *  segment is written `N is str_segs(S, Sep), K is N - 1, T is str_seg(S,
 *  Sep, K)`. Widening that is a parser change, not a change here.
 *
 *  INDICES ARE CODE POINTS, not UTF-16 code units. Indexing by code unit can
 *  cut a surrogate pair in half and hand back half a character -- a string
 *  that is a substring of nothing a reader would recognise, and a term the
 *  store would then carry. `[...str]` iterates code points; segments split on
 *  a well-formed separator, which cannot cut one. */
export function evalStrOp(t: Term, s: Subst, fail?: ArithFail): Term | null | undefined {
  t = walk(t, s);
  if (t.k !== 'f') return undefined;
  // A MAP and not an object literal, because a bare object inherits
  // `constructor`, `toString` and the rest: a program whose functor happens
  // to carry one of those names would be read as a destructor of nonsensical
  // width and refused for a reason that is about JavaScript, not about it.
  const inputs = STR_ARITY.get(t.name);
  if (inputs === undefined) return undefined;
  // A destructor at the wrong width is a program error, not another
  // operation: nothing else in the language answers to these names.
  if (t.args.length !== inputs) { if (fail) fail.code = STR_TYPE; return null; }
  const str = strOperand(t.args[0], s, fail);
  if (str === null) return null;
  if (t.name === 'str_len') return mki([...str].length);
  if (t.name === 'str_char') {
    const cp = [...str];
    const i = intOperand(t.args[1], s, fail);
    if (i === null) return null;
    if (i < 0 || i >= cp.length) { if (fail) fail.code = STR_INDEX; return null; }
    return mks(cp[i]);
  }
  const sep = strOperand(t.args[1], s, fail);
  if (sep === null) return null;
  if (sep === '') { if (fail) fail.code = STR_SEP; return null; }
  // The part before the FIRST separator, and empty when there is none. That
  // is the one thing `str_seg(S, Sep, 0)` cannot say: it answers the whole
  // string when the separator is absent, so the two operations differ exactly
  // where a reader needs them to (`str_segs` tells the two apart).
  if (t.name === 'str_pre') {
    const at = str.indexOf(sep);
    return mks(at < 0 ? '' : str.slice(0, at));
  }
  const parts = str.split(sep);
  if (t.name === 'str_segs') return mki(parts.length);
  // Unreachable while the table has five entries and this dispatch names
  // five: a sixth added to STR_ARITY without a branch here would fall
  // through to arithmetic and be reported as `arith_type_error`, which
  // says the wrong thing about the wrong operation. Named, so the reader
  // of a future addition sees the obligation.
  if (t.name !== 'str_seg') return undefined;
  const k = intOperand(t.args[2], s, fail);
  if (k === null) return null;
  if (k < 0 || k >= parts.length) { if (fail) fail.code = STR_INDEX; return null; }
  return mks(parts[k]);
}

/** The destructors a term calls, sorted and deduped, at any depth. Read by
 *  `encodeRule` so that `uses_builtin` names the OPERATION a rule uses and
 *  not only the `is` that carries it -- without this the kernel's own
 *  `unmoded[audit]` could never see a destructor, and the mode rows would be
 *  a table nothing joins against. */
export function strOpsIn(t: Term): string[] {
  const out = new Set<string>();
  const go = (x: Term): void => {
    if (x.k !== 'f') return;
    if (STR_ARITY.has(x.name)) out.add(x.name);
    for (const a of x.args) go(a);
  };
  go(t);
  return [...out].sort();
}

// ---------------------------------------------------------------------------
// term-level reification helpers

export function list(items: Term[]): Term {
  let t: Term = mka('$nil');
  for (let i = items.length - 1; i >= 0; i--) t = mkf('$cons', [items[i], t]);
  return t;
}

export function unlist(t: Term): Term[] {
  const out: Term[] = [];
  while (t.k === 'f' && t.name === '$cons') { out.push(t.args[0]); t = t.args[1]; }
  return out;
}

export function reifyTerm(t: Term): Term {
  if (t.k === 'v') return mkf('$var', [mks(t.name)]);
  if (t.k === 'f') return mkf(t.name, t.args.map(reifyTerm));
  return t;
}

export function unreifyTerm(t: Term): Term {
  if (t.k === 'f' && t.name === '$var' && t.args.length === 1 && t.args[0].k === 's') {
    return mkv(t.args[0].v);
  }
  if (t.k === 'f') return mkf(t.name, t.args.map(unreifyTerm));
  return t;
}

export function reifyLit(l: Lit): Term {
  return mkf('$lit', [mka(l.rel), reifyTerm(l.persp), list(l.args.map(reifyTerm)), mka('$' + l.temporal)]);
}

export function unreifyLit(t: Term): Lit {
  if (t.k !== 'f' || t.name !== '$lit' || t.args.length !== 4) throw new Error('bad reified literal: ' + canonTerm(t));
  const [rel, persp, args, tmp] = t.args;
  if (rel.k !== 'a' || tmp.k !== 'a') throw new Error('bad reified literal: ' + canonTerm(t));
  return {
    rel: rel.name,
    persp: unreifyTerm(persp),
    perspExplicit: true,
    args: unlist(args).map(unreifyTerm),
    temporal: tmp.name.slice(1) as Temporal,
  };
}

export function reifyBodyElem(b: BodyElem): Term {
  if (b.t === 'pos') return reifyLit(b.lit);
  if (b.t === 'neg') return mkf('$not', [reifyLit(b.lit)]);
  return mkf('$builtin', [mks(b.op), list([reifyTerm(b.l), reifyTerm(b.r)])]);
}

export function unreifyBodyElem(t: Term): BodyElem {
  if (t.k === 'f' && t.name === '$not') return { t: 'neg', lit: unreifyLit(t.args[0]) };
  if (t.k === 'f' && t.name === '$builtin') {
    const [op, args] = t.args;
    if (op.k !== 's') throw new Error('bad reified builtin');
    const [l, r] = unlist(args).map(unreifyTerm);
    return { t: 'bi', op: op.v, l, r };
  }
  return { t: 'pos', lit: unreifyLit(t) };
}

/** Ground fact as a term, for derived_by / in_perspective / asserted_by. */
export function factTerm(rel: string, persp: string, args: Term[]): Term {
  return mkf('$fact', [mka(rel), mka(persp), list(args)]);
}

/** The relation a `factTerm` names, or null if the term is not one. Lets a
 *  caller sort provenance records by the relation they are about without
 *  learning the shape of the term. */
export function relOfFactTerm(t: Term): string | null {
  if (t === undefined || t.k !== 'f' || t.name !== '$fact' || t.args.length !== 3) return null;
  const r = t.args[0];
  return r.k === 'a' ? r.name : null;
}

/** An atom as a TERM the way a reader would write it: `win(a)`, `p` for a
 *  nullary one — NOT the `$fact` reification used by `derived_by`.
 *
 *  The difference is whether the result can be asked about in the reader's own
 *  terms. `why unknown(win(a))` is the question a reader has; the reification
 *  `why unknown($fact(win,main,$cons(a,$nil)))` is typeable since `$` became a
 *  leading name character (src/parser.ts), but it is the STORE's spelling of
 *  that question, and a third value only askable in the kernel's spelling
 *  would be most of the refusal this replaces. The atom's PERSPECTIVE is not
 *  folded into the term: the `unknown` row is written in the atom's own
 *  ledger, so `unknown[trust](outlier(s3))` says where it is undefined
 *  without inventing a term shape for it. */
export function atomTerm(rel: string, args: Term[]): Term {
  return args.length === 0 ? mka(rel) : mkf(rel, args);
}

/** (rel, args) of an `atomTerm`, or null if the term is not one. */
export function unAtomTerm(t: Term): { rel: string; args: Term[] } | null {
  if (t.k === 'a') return { rel: t.name, args: [] };
  if (t.k === 'f') return { rel: t.name, args: t.args };
  return null;
}

/** Does the program ask for the three-valued (well-founded) semantics? */
export function wellFoundedDeclared(store: FactStore): boolean {
  for (const f of store.relAll(IFACE.semantics)) {
    if (f.args.length === 1 && f.args[0].k === 'a' && f.args[0].name === WELL_FOUNDED) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// canonical clause serialization and content-addressed rule ids

export function canonLit(l: Lit): string {
  return `${l.rel}[${canonTerm(l.persp)}](${l.args.map(canonTerm).join(',')})@${l.temporal}`;
}

export function canonBodyElem(b: BodyElem): string {
  if (b.t === 'pos') return canonLit(b.lit);
  if (b.t === 'neg') return 'not ' + canonLit(b.lit);
  return `${canonTerm(b.l)} ${b.op} ${canonTerm(b.r)}`;
}

export function canonClause(c: Clause): string {
  if (c.body.length === 0) return canonLit(c.head);
  return canonLit(c.head) + ' :- ' + c.body.map(canonBodyElem).join(', ');
}

/** THE ID IS TAKEN OF THE RESOLVED CLAUSE, and that is not an optimisation.
 *
 *  A rule id is content-addressed over `canonClause`, which prints every
 *  literal's perspective — so `concludes(R, Rel)` and `concludes[$kernel](R,
 *  Rel)` hash differently. The kernel stores the resolved form (`addClause`
 *  runs `resolveClauseBooks` before encoding), and host code routinely
 *  computes an id from SOURCE and looks it up: `examples/moot` filters
 *  `decodeRules(store)` by `parseProgram(BOOT).map(ruleIdOf)`,
 *  `examples/loot` matches a codex against the store the same way,
 *  `examples/npc` checks a learned rule's id against the text it came from.
 *
 *  MEASURED, and it is the one regression the ledger split caused that was not
 *  an expectation change. Without this line MOOT pointed at boot.rofl found 12
 *  of its rules instead of 20 — every rule reading reflection fell out of the
 *  join — and reported `flow`, `flows_to`, `crossing` and `leak` as
 *  UNREACHABLE RELATIONS of the meta-kernel. A silent join failure that reads
 *  as a finding about the program is the worst shape a defect can take here,
 *  and only `examples/yak`, which quotes MOOT's output, caught it.
 *
 *  Resolution is idempotent, so hashing a clause that has already been through
 *  `addClause` costs one walk and changes nothing. */
export function ruleIdOf(c: Clause): string {
  return 'r' + fnv1a(canonClause(resolveClauseBooks(c)));
}

// ---------------------------------------------------------------------------
// encoding: rule clause → reflection facts

/** WHERE A BARE KERNEL-BOOK LITERAL POINTS, and why this is a resolution
 *  rather than a fallback.
 *
 *  `[main]` is the DEFAULT ledger: a literal with no bracket lands there
 *  because nobody said whose book it belongs in. That question does not arise
 *  for `KERNEL_BOOK`. There is exactly one `concludes` — the kernel writes it,
 *  no program may — so a bare `concludes(R, Rel)` is not an under-specified
 *  literal that needs a default, it is a fully specified one whose ledger is
 *  determined by its relation. The default rule never had anything to decide
 *  here; it was answering a question that was already closed.
 *
 *  Which is also what makes the move cost nothing to spell. Measured over the
 *  tree: 40 bare reads of these relations in rule bodies across 8 `.rofl`
 *  files, and 46 bare `query`/`holds`/`retract` strings in 19 test files and 3
 *  demos. Every one of them keeps meaning what it meant. What CHANGES is the
 *  `reads_from` row the kernel emits for such a rule — it now names `$kernel`,
 *  so a rule that reads the kernel's book crosses a ledger boundary and the
 *  ordinary `leak[audit]` asks for a declaration.
 *
 *  An EXPLICIT bracket is left alone, including a wrong one: `concludes[main]`
 *  reads an empty relation and says so through `undefined_premise[audit]`
 *  rather than being silently corrected into the right book. Correcting it
 *  would make the two spellings indistinguishable, which is the defect
 *  `bridge_decl` was deleted for. */
export function resolveBook(l: Lit): Lit {
  if (l.perspExplicit || !KERNEL_BOOK.has(l.rel)) return l;
  return { ...l, persp: mka(KERNEL_PERSP), perspExplicit: true };
}

/** The same resolution over a whole clause, head and body. Returns the SAME
 *  object when nothing moved, so `assertClauses` on caller-owned clauses does
 *  not copy for nothing and never mutates what it was handed. */
export function resolveClauseBooks(c: Clause): Clause {
  let moved = resolveBook(c.head) !== c.head;
  const body = c.body.map((b) => {
    if (b.t !== 'pos' && b.t !== 'neg') return b;
    const lit = resolveBook(b.lit);
    if (lit === b.lit) return b;
    moved = true;
    return { ...b, lit };
  });
  return moved ? { head: resolveBook(c.head), body } : c;
}

export interface EncFact { rel: string; args: Term[]; }

/** The perspective a rule reads or writes, as the audit sees it. A variable
 *  is recorded AS ITSELF, in the shape `reifyTerm` already gives a variable,
 *  so that a rule polymorphic in the ledger carries the SAME term at both
 *  ends and boot.rofl can tell it from a rule reading one variable and
 *  writing another. Anything that is neither a name nor a variable stays the
 *  wildcard. */
function perspAudit(p: Term): Term {
  if (p.k === 'a') return p;
  if (p.k === 'v') return mkf('$var', [mks(p.name)]);
  return mka(ANY_PERSP);
}

/** Reflection facts for one rule. All land in [main], timeless, base. */
export function encodeRule(c0: Clause): { id: string; facts: EncFact[] } {
  // Resolved HERE as well as in `addClause`, so a caller that reaches this
  // function directly from `parseProgram` (test/bridges.test.ts,
  // test/second-door.test.ts) gets reflection facts whose perspectives agree
  // with the id above them. Idempotent, and it returns the same object when
  // nothing moves.
  const c = resolveClauseBooks(c0);
  const id = ruleIdOf(c);
  const rid = mka(id);
  const facts: EncFact[] = [];
  facts.push({ rel: V.rule, args: [rid] });
  facts.push({ rel: V.has_conclusion, args: [rid, { k: 'i', v: 1 }] });
  facts.push({ rel: V.conclusion_lit, args: [rid, { k: 'i', v: 1 }, reifyLit(c.head)] });
  facts.push({ rel: V.concludes, args: [rid, mka(c.head.rel)] });
  // The head's TENSE, separately from the relation it names. `concludes`
  // records a name and nothing else, so a conclusion written '@next' — staged
  // at the tick boundary and read as a base fact by the NEXT tick — used to be
  // indistinguishable from one derived here and now, and boot.rofl drew a
  // same-tick dependency edge for it. The marker lives inside the reified
  // `$lit` of `conclusion_lit`, which no rule COULD reach while `$` was a
  // parse error; a rule can read it now (src/parser.ts admits `$` in leading
  // position, and test/head-vars.test.ts walks that very term). The flat fact
  // stays: it is the shape boot.rofl already reads, and dropping it would
  // change what every existing program computes. `now` and `next` are the
  // only values a rule head can carry (the parser rejects '@init' on a head,
  // and a fact is not a rule).
  facts.push({ rel: V.conclusion_tense, args: [rid, mka(c.head.temporal)] });
  const headP = perspAudit(c.head.persp);
  facts.push({ rel: V.writes_to, args: [rid, headP] });
  const readPersps = new Map<string, Term>();
  c.body.forEach((b, i) => {
    const k = i + 1;
    facts.push({ rel: V.has_premise, args: [rid, { k: 'i', v: k }] });
    facts.push({ rel: V.premise_lit, args: [rid, { k: 'i', v: k }, reifyBodyElem(b)] });
    if (b.t === 'pos') facts.push({ rel: V.premise_pos, args: [rid, mka(b.lit.rel)] });
    if (b.t === 'neg') facts.push({ rel: V.premise_neg, args: [rid, mka(b.lit.rel)] });
    if (b.t === 'pos' || b.t === 'neg') {
      const pa = perspAudit(b.lit.persp);
      readPersps.set(canonTerm(pa), pa);
    }
    if (b.t === 'bi') {
      facts.push({ rel: V.uses_builtin, args: [rid, mks(b.op)] });
      // A destructor rides on `is` and would otherwise be reflected as `is`
      // and nothing more. Both sides are read: the operation is used wherever
      // it is written, including the mode violation `str_len(S) is 3`, which
      // fails silently like every backwards `is` here but must still be
      // visible to an audit over `uses_builtin`.
      if (b.op === 'is') {
        for (const op of [...new Set([...strOpsIn(b.l), ...strOpsIn(b.r)])].sort()) {
          facts.push({ rel: V.uses_builtin, args: [rid, mks(op)] });
        }
      }
    }
  });
  // WHERE `bridge_decl` WENT. A row used to be pushed here for every rule
  // whose head named a perspective explicitly and whose body read another:
  //
  //     if (c.head.perspExplicit && pk !== canonTerm(headP)) push bridge_decl
  //
  // and boot.rofl's `crossing` read it as a LICENCE — `not bridge_decl(R,A,B)`.
  // So the permission was granted by the very act that needed it: a rule that
  // reads one ledger and writes another emitted its own exemption, and typing
  // the bracket was the whole of the authorisation. Measured against a bare
  // boot.rofl before this change: `digest[report](X) :- datum[secret](X).`
  // with nothing declared gave leak 0 and crossing 0, and the SAME rule with
  // `imports(report, secret)` written out gave 0 and 0 as well — the declared
  // and the undeclared single hop were indistinguishable from the audit, and
  // the audit could only ever fire on a walk of two hops or more. That
  // contradicts boot.rofl's own argument that the property is transitive and
  // that every step separately licensed does not license the walk.
  //
  // Nothing replaces it, because there was nothing here to replace. A rule
  // says what it DOES — `reads_from` and `writes_to`, both still emitted, and
  // `bridge_decl(R,A,B)` was exactly their conjunction plus one bit recording
  // whether the author had typed a bracket. A ledger says what it PERMITS,
  // and that is `imports(Reader, Read)` between two named ledgers, or
  // `collects(Gatherer)` where the source is a variable and so cannot be
  // named. Those are written by hand, by whoever owns the ledger, and the
  // rule under audit cannot write them by existing.
  //
  // The NAME stays reserved (V above, and `RESERVED`) although nothing emits
  // it any more. Un-reserving it would let a program conclude into
  // `bridge_decl` — the self-licence again, spelled by hand — and `breach
  // [audit](R) :- concludes(R, Rel), reserved(Rel).` is what still refuses
  // that. A reserved name nothing writes is a closed door, not dead weight.
  for (const [, pa] of [...readPersps.entries()].sort()) {
    facts.push({ rel: V.reads_from, args: [rid, pa] });
  }
  return { id, facts };
}

// ---------------------------------------------------------------------------
// decoding: store → executable rules (the evaluator's only rule source)

export interface DRule { id: string; clause: Clause; canon: string; }

export function decodeRules(store: FactStore): { rules: DRule[]; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const conc = new Map<string, Term>();
  for (const f of store.relAll(V.conclusion_lit)) {
    if (f.args.length !== ARITY.conclusion_lit) continue;
    if (f.args[0].k === 'a') conc.set(f.args[0].name, f.args[2]);
  }
  const prems = new Map<string, { k: number; t: Term }[]>();
  for (const f of store.relAll(V.premise_lit)) {
    // The width check comes FIRST and is not redundant with the door check in
    // src/api.ts. A store also arrives by `Rofl.fromSnapshot`, which does not
    // go through `addClause` at all, so a hand-edited snapshot reaches this
    // loop unfiltered. `f.args[1].k` on a one-place row threw TypeError and
    // took the host down; `wellFoundedDeclared` above already had the right
    // shape, and this is the same guard.
    if (f.args.length !== ARITY.premise_lit) continue;
    if (f.args[0].k !== 'a' || f.args[1].k !== 'i') continue;
    const id = f.args[0].name;
    let arr = prems.get(id);
    if (!arr) { arr = []; prems.set(id, arr); }
    arr.push({ k: f.args[1].v, t: f.args[2] });
  }
  const rules: DRule[] = [];
  for (const f of store.relAll(V.rule)) {
    if (f.args.length !== ARITY.rule || f.args[0].k !== 'a') continue;
    const id = f.args[0].name;
    const headT = conc.get(id);
    if (!headT) { diagnostics.push(`rule ${id}: missing conclusion reflection; skipped`); continue; }
    try {
      const head = unreifyLit(headT);
      const body = (prems.get(id) ?? []).sort((a, b) => a.k - b.k).map((p) => unreifyBodyElem(p.t));
      const clause: Clause = { head, body };
      rules.push({ id, clause, canon: canonClause(clause) });
    } catch (e) {
      diagnostics.push(`rule ${id}: undecodable reflection (${(e as Error).message}); skipped`);
    }
  }
  rules.sort((a, b) => (a.canon < b.canon ? -1 : a.canon > b.canon ? 1 : 0));
  return { rules, diagnostics };
}

// ---------------------------------------------------------------------------
// kernel bootstrap: reserved table, builtin modes, edb marks

export function bootstrapKernel(store: FactStore): void {
  const rels = [...RESERVED].sort();
  for (const r of rels) {
    store.add(V.reserved, MAIN, [mka(r)], { scope: 'timeless', base: true });
    store.add(V.edb, MAIN, [mka(r)], { scope: 'timeless', base: true });
  }
  const anyMode = list([mka('any'), mka('any')]);
  const inMode = list([mka('in'), mka('in')]);
  const isMode = list([mka('out'), mka('in')]);
  for (const op of BUILTIN_OPS) {
    const m = op === 'is' ? isMode : op === '=' ? anyMode : inMode;
    store.add(V.mode, MAIN, [mks(op), m], { scope: 'timeless', base: true });
  }
  // Every destructor gets its own row, and the row is not decoration:
  // boot.rofl derives `unmoded[audit](R) :- uses_builtin(R, B), not mode(B, _)`,
  // so an operation that arrives without one turns the kernel's own audit red.
  // `[out, in, ...]` states the truth about the form `Out is op(In, ...)` --
  // the inputs must already be bound where the premise stands, which is
  // exactly what `classify` in src/engine.ts requires of the right-hand side
  // of `is`, and the output is what the premise binds.
  for (const op of [...STR_ARITY.keys()].sort()) {
    const ins = Array.from({ length: STR_ARITY.get(op)! }, () => mka('in'));
    store.add(V.mode, MAIN, [mks(op), list([mka('out'), ...ins])], { scope: 'timeless', base: true });
  }
  registerPersp(store, MAIN);
  // THE KERNEL'S BOOK IS REGISTERED BY HAND, and not through `registerPersp`,
  // because its writer list is one principal and `registerPersp` grants two.
  //
  // Both halves of that matter. `$anon` is deliberately NOT granted here: an
  // anonymous row in `[$kernel]` — the only way one arrives is a hand-edited
  // snapshot, since `src/api.ts` refuses the clause at the door — is then
  // `forged[audit]` mechanically, and the door check and the audit are two
  // independent gates on the same property rather than one gate twice.
  //
  // And the row has to EXIST, which is the half that is easy to miss: with no
  // `authority` fact at all, `perspective($kernel)` fails, and boot.rofl's
  // `collects_from(X, A) :- collects(X), flow(A, X), A != X, not
  // perspective(A).` would then let every one of the nine `collects`
  // declarations in the corpus gather from the kernel's book without saying so.
  // Withholding the registration reads as "closed" and means "open".
  store.add(V.authority, MAIN, [mka(KERNEL_PERSP), mka(KERNEL_WHO)],
            { scope: 'timeless', base: true });
}

/** First use of a perspective registers it under kernel authority, making
 *  perspective/1 and reflexive visibility well-defined for boot's audits.
 *
 *  `$anon` is granted the same standing, and that grant is a DECISION with a
 *  price. Anonymity now leaves a row (see `ANON_WHO`), and the row could have
 *  been made a forgery instead — `not authority(P, $anon)` would have done it
 *  with no new rule at all. It is not, because it was measured: the honest
 *  corpus is anonymous end to end (boot+sensors = 9 asserted facts, 9 of them
 *  authorless), so `forged[audit]` would be red on the first load of every
 *  program here and on nothing else. A gate that cannot be satisfied is turned
 *  off, and its absence is then invisible.
 *
 *  So the kernel records anonymity rather than judging it, and the judgement
 *  is left to the ledger that wants it: `demands_authorship(P)` in boot.rofl
 *  is host data, and `unattributed[audit]` reports anonymous facts in exactly
 *  the ledgers that asked. Green where nobody asked, red where somebody did. */
export function registerPersp(store: FactStore, p: string, who: string = KERNEL_WHO): void {
  // A `$` LEDGER gets one writer and not two, and this branch is the reason
  // the split is not decorative. `registerPersp` fires on first USE, including
  // the use in a premise, so `concludes[$kernel](R, Rel)` in boot.rofl's own
  // audit registers the kernel's book — and without this line it registered it
  // exactly like any other, `$anon` included. Measured through
  // test/second-door.test.ts, which enumerates `authority(P, W)`: the grant
  // `P = $kernel, W = $anon` appeared unasked, and it silently restored the
  // hole the book was created to close, because `forged[audit]` reads
  // `not authority(P, Who)` and an anonymous forger IS `$anon`.
  //
  // So: one principal, and it is the one that cannot be claimed from outside
  // (`checkWho` in src/api.ts refuses a caller-supplied `$` name). The ledger
  // and its writer share a spelling because they are the same thing said in
  // two slots.
  // THE CREATOR OF A BOOK OWNS IT, which is what a filesystem does and what
  // this did not. Before: every ordinary book was granted to `$kernel` AND
  // `$anon`, and the caller who actually created it got nothing — so a NAMED
  // author writing into a book it had just made was `forged[audit]`, measured
  // at 1. Anonymity was not merely permitted, it was THE ONLY WAY TO WRITE,
  // and that is why 420 loads in this repository pass no author while 44 do.
  // Now the writer that created the book is granted it; `$anon` keeps the
  // grant only when the creation really was anonymous, so nothing that loaded
  // without an author changes.
  // NO ANONYMOUS AUTHOR EXISTS. Before: an ordinary book was granted to
  // `$kernel` AND `$anon`, so anonymity was not merely permitted, it was the
  // only way to write — a NAMED author writing into a book it had just made
  // was `forged[audit]` = 1, measured. That is why 420 loads in this
  // repository pass no author and 44 do.
  //
  // Now a call that names nobody IS the kernel — the system principal, the
  // way an unowned process is root's. The set is one name unless the caller
  // named itself, and a caller that did must have been GRANTED the book:
  // writing under a name into a book you were not given is what
  // `forged[audit]` is for, and it can finally mean that.
  // DETERMINISTIC BY CONSTRUCTION, and the first attempt was not. I tried
  // "the creator of a book owns it" — read the store, see whether the book
  // already has a named owner, grant only if it does not. It gives the right
  // answers and it made the kernel NON-DETERMINISTIC: `replay` across 100 runs
  // with shuffled insertion order produced EIGHT distinct states instead of
  // one, because which load registers a book first is not a property of the
  // program. Ownership must follow from the TEXT, never from the order in
  // which the text was executed.
  //
  // So: `$` books belong to the kernel alone, and every ordinary book is the
  // user's — the way everything in a home directory belongs to whoever is
  // logged in. A caller that NAMES ITSELF is claiming to be someone other than
  // the user at the keyboard, and it must be granted the book in writing:
  // `authority(book, alice).` That is what makes `forged[audit]` mean
  // something at last — writing under a name into a book nobody gave you.
  const whos = p.startsWith('$') ? [KERNEL_WHO] : [KERNEL_WHO, ANON_WHO];
  for (const who of whos) {
    store.add(V.authority, MAIN, [mka(p), mka(who)], { scope: 'timeless', base: true });
  }
}

/** Kernel-emitted metadata for an asserted base fact.
 *
 *  `tick` is the clock AT THE MOMENT OF THE CALL, and that is the whole
 *  content of the third argument: `derived_by(F, RuleId, T)` records what, by
 *  what, and when, while the assertion trail used to record what and who and
 *  drop the when — the one part of it the store already knows for free.
 *
 *  WHY A TRIPLE AND NOT A COMPANION `asserted_at(F, T)`. A fact can be
 *  asserted more than once, by different people, at different ticks: the
 *  store keys metadata by its whole tuple, so two authors of one fact are two
 *  rows. Split across two relations those rows cannot be paired — the store
 *  would know that alice and bob both vouched, and that it happened at ticks
 *  3 and 7, and not who did which. Keeping the assertion whole also makes the
 *  trail symmetric with `derived_by`, which the vocabulary already has.
 *
 *  `in_perspective` stays a pair: a fact's ledger is a property of the fact,
 *  and re-asserting it at another tick does not move it.
 *
 *  WHY THE ROW IS UNCONDITIONAL. It used to be emitted only when the caller
 *  named a `who`, which made authorship opt-in — and opt-in the wrong way
 *  round, because the caller who declines to sign is exactly the one an audit
 *  wants to see. Every audit here reads `asserted_by`, so a fact without the
 *  row was not a fact with a weaker claim to authorship; it was a fact outside
 *  the audit's reach entirely. Measured before the change, on boot+sensors: a
 *  forgery signed `mallory` produced `forged[audit]` = 1, the SAME forgery
 *  unsigned produced 0, with no diagnostic anywhere. Anonymity was the cheaper
 *  attack than impersonation, which inverts what the trail is for. */
export function factMetaFacts(rel: string, persp: string, args: Term[], tick: number, who?: string): EncFact[] {
  const f = factTerm(rel, persp, args);
  return [
    { rel: V.in_perspective, args: [f, mka(persp)] },
    { rel: V.asserted_by, args: [f, mka(who ?? ANON_WHO), mki(tick)] },
  ];
}

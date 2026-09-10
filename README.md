# ROFL Kernel v0

**ROFL** — *Relation-Oriented Fixpoint Language*. A Datalog-family language with
perspectives (first-class truth contexts), explicit time, kernel-emitted
provenance, structured terms, and budgets. Turing-complete by design; budgets
are part of the semantics.

The kernel is a *generic* inference machine: all semantics — including the
schema of what a "rule" is and the rules that validate rules — live in the
graph as data (`boot.rofl`). The kernel has zero runtime dependencies (the
optional code scanner under `scanners/` is the only component with one,
`@babel/parser`). TypeScript, runs under Bun or Node ≥ 22.

## What is in the tree

The kernel is one of several things here, and the rest of the file says which
of them a claim is about. `npm run …` names in the right column are the entry
points; the whole list is in `package.json`.

| where | what it is | entry point |
|---|---|---|
| `src/` | the kernel: parser, store, evaluator, reflection, API, REPL. Zero runtime dependencies, closed vocabulary (below), mechanically checked | `repl` |
| `boot.rofl` | the semantics as DATA — what a rule is, the rules that validate rules, the audits | loaded by every store |
| `policy.rofl` `safety.rofl` | **the kernel's own two programs**, carried as data rather than as code — see *The kernel's own programs* | gated by `test/kernel-policy-program.test.ts` |
| `scanners/` | code and cost turned into facts: the JS/TS source scanner, the JS *model*, and the self-measuring scanners this repository argues with | `scan` `evalcost` `parsecost` `ruleshape` `perminv` |
| `rules/` | the inquiry kernel, the decision packs, the JS model's rule packs (`js-*.rofl`), and the rule packs that used to live in `boot.rofl` | `report` `findings` |
| `runtime/` | the report renderer, the admission gate, the scheduler, the tick loop, the port client | `report` `pair` |
| `adapters/` | the storage port: a `FactStore` behind an interface, with a SQLite adapter, gated by a byte-identical `canonicalState()` against the in-memory reference | `boundary` |
| `rust/` | **the Rust engine** — the port this branch is instrumental to (`docs/the-target.md`), plus its benchmark crates | `cargo test` under `rust/` |
| `examples/` `test/` `facts/` `docs/` | runnable demos, the suite, the ledgers, the design decisions | `test` |

### Documents

`docs/` fixes decisions so they do not have to be re-argued. They are grouped
by what they bind.

**The model** — `time-and-continuity.md` (what `not p` means, where a veto
belongs), `choosing-perspectives.md` (perspective = ledger, never status or
modality), `books-and-permission.md` (every relation with who may write it,
derived from `boot.rofl` and gated by `test/permission-doc.test.ts`),
`inquiry-kinds.md` (typed inquiry roots), `three-valued-answers.md` (the
alternating fixpoint and what `unknown` means).

**A run** — `scaling-a-corpus.md` (the incremental ingest loop over the whole
of eslint, and the four defects the run found that reading did not),
`normalisation-and-profiling.md`, `volumes-and-residency.md` (how a corpus
stays cold), `working-with-ledgers.md`, `test-maintenance-cost.md`,
`failure-modes.md` (the process failures, catalogued and priced).

**The process as its own subject** — three documents that turn the question
*where does a claim about this work live* into something checkable.
`ledger-as-an-instrument.md` reads the ledger as a thing with functions, side
effects and contradictions rather than as a log. `claims-outside-the-store.md`
measures the gap: `measured` holds **3 rows** while the word MEASURED appears
in **436 comment lines**, and 2 210 comment blocks over 78 files carry no
verdict at all. Failure mode 17 in `failure-modes.md` is the entry they answer.

**The engine and the port** — `the-target.md` (what everything on this branch
is instrumental to), `medium-and-large.md` (two engines, and the line between
them, which negation decides), `port-surface.md` (what the Rust engine has to
expose), `performance-invariants.md` (what this kernel costs and what the field
costs), `modelling-a-language.md` (the JS model as a research programme).

**The programme** — `formal-reasoning-landscape.md` (ROFL among the formal
reasoning systems, and why the projection is ROFL-centric by construction).
The plan itself is the ledger.

## How to run

```sh
# tests (either runner)
npm test                      # node --test (Node ≥ 22.6, type stripping)
npm run test:bun              # bun test

# the kernel grep test (also part of the test suite and CI)
npm run grepcheck

# REPL
npm run repl                  # loads boot.rofl automatically
node --experimental-strip-types src/repl.ts examples/sensors.rofl

# typecheck (dev-only dependency; the runtime has none)
npm i && npx tsc -p tsconfig.json
```

**Node ≥ 22.6 is not optional and the failure is quiet.** The sources are
erasable-syntax TypeScript run through Node's built-in type stripping. On an
older Node `npm test` dies in five lines with `node: bad option:
--experimental-strip-types` and prints **no `ℹ tests` line at all** — so a
guard that only compares the reporter's numbers reads the absence as
agreement. `package.json` declares the floor in `engines`; check what you are
about to run with `node -v` before believing a green.

### The gates

Every one of these is a check somebody paid for. `npm test` and `npm run
grepcheck` are what CI runs (`.github/workflows/ci.yml`, node and bun);
the rest are run by hand and several are also asserted from `test/`.

| command | what it refuses |
|---|---|
| `npm test` | the suite — 1 508 top-level tests over 137 files by the census `npm run speccheck` takes, 19 m 43 s of wall measured 2026-09-09 |
| `npm run grepcheck` | a relation name in `src/` outside the kernel vocabulary below |
| `npm run textcheck` | a byte in the tree that a human or `grep` cannot read |
| `npm run speccheck` | a duty in `START.md` that nothing in the tree discharges |
| `npm run measurecheck` | a number quoted without the run that produced it |
| `npm run flagcheck` | an API flag that no demo in `examples/` EXERCISES (CLAUDE.md) |
| `npm run findings` | the open findings backlog — every one demands a reaction |

And the scanners that MODEL something rather than check it — each writes facts
that a rule pack then argues with, so every row has a `why`:

| command | the question it answers |
|---|---|
| `npm run evalcost` + `npm run whyjoin` | where the join actually goes |
| `npm run parsecost` + `npm run whyslow` | what a parse costs, by stage |
| `npm run floorcensus` + `npm run whyfloor` | which reflection relations may be sealed |
| `npm run perminv` + `npm run whyperm` | who may write what |
| `npm run ruleshape` | which rule bodies pay a cross product |
| `npm run keycoupling` `npm run booklocality` `npm run boundary` | how coupled the store's key spelling, books and port surface are |
| `npm run ablate` `npm run necessity` `npm run splitcheck` `npm run dagcheck` | what is load-bearing and what is not |

REPL commands: `? L`, `why L`, `whynot L`, `excise F`, `budget N { CMD }`,
`load FILE`, `who NAME`, `retract F`, `tick`, `run [N]`, `save FILE`,
`restore FILE`, `facts [REL]`, `quit`; any other line ending in `.` is
asserted as program text.

## Code scanner

`scanners/` turns a JS/TS source tree into materialized ROFL facts,
incrementally: each source file becomes one `.rofl` fact file keyed by content
hash (unchanged files are never re-parsed; deleted files lose their fact
file; `manifest.json` tracks what is current). Not part of the kernel — it
lives outside `src/` and the kernel grep test on purpose.

```sh
npm run scan -- src --out facts/generated            # (re)materialize
npm run scan -- src --out facts/generated \
  --rules deps.rofl \
  --query 'dependency[code]("repl.ts", M)' \
  --why 'dependency[code]("repl.ts", "node:fs")'     # load boot + facts + rules, then ask
```

Fact vocabulary (v0), all in the `[code]` perspective: `src_file(Path, Hash12)`,
`src_func(Path, Name, Line)`, `src_class(Path, Name, Line)`,
`src_method(Path, Class, Name, Line)`, `src_import(Path, Source)`,
`src_export(Path, Name)`, `src_call(Path, Caller, Callee)`,
`src_parse_error(Path, Message)`.

Provenance rides on the kernel's own machinery: the materializer emits a
preamble granting `authority(code, scanner)`, fact files are loaded with
`who=scanner`, and anyone else asserting into `[code]` surfaces as
`forged[audit]` — no scanner-specific enforcement code.

## Inquiry layer

`rules/inquiry/` is the Phase 1 guided-formal-reasoning kernel
(`docs/inquiry-kinds.md`, `docs/choosing-perspectives.md`): a typed inquiry root, epistemic states as
a derived `[epistemic]` ledger over an `[obs]` evidence journal
(authority: runtime only), proof obligations, and candidate-intent
generation. `runtime/report.ts` renders the anytime epistemic report:

```sh
npm run report -- examples/atlas-launch/frame.rofl \
  examples/atlas-launch/evidence.rofl --who-obs runtime \
  --pack production-readiness examples/atlas-launch/context.rofl
```

The rest of the loop: `runtime/admission.ts` validates agent results
(`schemas/intent-result.json` — agents cannot mint `measured` evidence, and
unattributed admission is refused), `runtime/scheduler.ts` picks a top-K
batch (blocking claims first), `runtime/tick.ts` runs the bounded
derive → execute → admit → recompute loop with stagnation and budget
checkpoints. `rules/decisions/production-readiness.rofl` is the first
decision pack (GO / CONDITIONAL_GO / coverage gaps, authority-gated gap
acceptance); `rules/policies/` holds evidence freshness and authority.
`skills/guided-formal-reasoning/` is the agent-facing skill seed. Findings
discovered while working live in `facts/findings.rofl` and replay at
session start until settled (`rules/findings.rofl`, CLAUDE.md).

`npm run build:skill` assembles the self-contained marketplace bundle in
`dist/guided-formal-reasoning/` — instruction files at the root, the engine
(kernel, rules, runtime, schemas, the synthetic demo fixture) under
`engine/`, zero dependencies, runnable from any directory on bare
Node >= 22.6. The build smoke-tests the bundle by running a real pair
session inside it.

## Grammar

```
program    := (clause ".")*
clause     := fact | rule
fact       := literal                           -- ground, atom perspective
rule       := literal ":-" body
body       := blit ("," blit)*
blit       := literal | "not" literal | builtin
literal    := rel persp? "(" terms ")" temporal?
persp      := "[" (name | Var) "]"              -- omitted => [main]
temporal   := "@init" | "@now" | "@next"        -- omitted => @now
terms      := (term ("," term)*)?          -- may be EMPTY: `p()` is a proposition
term       := Var | int | string | atom | functor "(" terms ")"
builtin    := expr OP expr                      -- OP ∈ {=, !=, <, <=, >, >=, is}
expr       := arithmetic over +, -, *, /, mod   -- ints; / truncates toward 0
Var        := /[A-Z_][A-Za-z0-9_]*/             -- `_` is a fresh wildcard
atom/rel   := /[a-z][A-Za-z0-9_]*/
comment    := "--" to end of line
```

`@async` parses and is rejected with *"not in v0"*. `@next` is not allowed in
bodies; `@init` is not allowed on rule heads.

**A relation may take ZERO arguments, spelled `p()`** — added 2026-09-10, and
the grammar above says so (`terms` may be empty). A relation of arity *n* is a
set of *n*-tuples and there is exactly one 0-tuple, so a nullary relation's
extension is either empty or that singleton: **it is a truth value**, and a
proposition is the base case of the predicate logic this language already was.
It was excluded until then by one production written the obvious way, with no
reason recorded anywhere and with the store already able to hold one.

The spelling is `p()` and never a bare `p`: a body element is tried as an
expression before it is re-read as a literal, and a term is also an atom, so
`ident ( )` is the one shape that needs no lookahead into what follows.
`examples/flag/` exercises it; `npm run nullary` reports which existing rules
are propositions wearing a dummy argument or a passenger variable.

## Kernel vocabulary

Reserved, write-protected: domain rules may **read** these, never conclude
into them (a rule concluding into one is rejected at load; hand-asserted
reflection surfaces as `breach` in boot.rofl). This is the closed list of
relation names the kernel knows, plus the read-interface below — mechanically
enforced by `scripts/kernel_grep.ts` in CI.

| relation | arity | meaning |
|---|---|---|
| `derived_by(Fact, RuleId, Tick)` | 3 | provenance, emitted on every derivation; `Fact` is a `$fact(Rel, Persp, Args)` term |
| `rule(Id)` `has_premise(Id,K)` `premise_pos(Id,Rel)` `premise_neg(Id,Rel)` `concludes(Id,Rel)` `has_conclusion(Id,K)` | – | reflection of rules as subgraphs |
| `premise_lit(Id,K,Lit)` `conclusion_lit(Id,K,Lit)` | 3 | full reified rule content (`$lit`/`$not`/`$builtin` terms); the evaluator's only rule source |
| `conclusion_tense(Id,Tense)` | 2 | the head's temporal marker, `now` or `next` — the one part of a rule's tense a rule can read, since the marker itself lives inside the `$lit` of `conclusion_lit` |
| `reads_from(Id,Persp)` `writes_to(Id,Persp)` | 2 | perspective signature of a rule (a variable perspective is recorded by name, as `$var("S")`) |
| `bridge_decl(Id,From,To)` | 3 | explicit head annotation crossing perspectives |
| `asserted_by(Fact,Who,Tick)` | 3 | the dated assertion trail: who asserted the fact, and in which tick — emitted only when a `who` is given. The tick is the clock at the moment of the assert, never of a later evaluation, so replaying the trail rebuilds a past state instead of storing it. A fact asserted twice keeps two rows, and each pairs its own who with its own tick |
| `uses_builtin(Id,Op)` | 2 | rule uses builtin `Op` (a string) |
| `mode(Builtin, ModeList)` | 2 | declared directionality of builtins, kernel-emitted at boot |
| `reserved(Rel)` | 1 | this table itself, queryable |
| `authority(Persp, Who)` | 2 | who may assert; kernel registers each perspective on first use as `authority(P, $kernel)` |
| `hole(QueryId, Reason)` | 2 | inability marker — the kernel could not finish, said so rather than returning an empty answer that reads like an honest no. Ids: `$q(N)`, `$tick(T)`, `$load(N)`, `$rule(Id)`. Reasons: `budget_exhausted` and `space_exhausted` when an evaluation runs out of steps or of rows it may hold; `arith_type_error` and `arith_zero_divisor` for an `is` whose expression could not be evaluated (see *Arithmetic that cannot be evaluated* below); and `str_type_error`, `str_index_error`, `str_empty_separator` for a string destructor given an operand it cannot take; and `reflection_sealed`, the one reason that is not a failure — the program declared `sealed(Body)` and the kernel stopped keeping that body, so the answer is missing on purpose. Id `$sealed(Body)` for the standing declaration, `$q(N)` for a query that asked a sealed body |
| `edb(Rel)` | 1 | relation has base facts (also emitted for all reserved relations at boot) |

**`in_perspective(Fact, Persp)` WAS IN THIS TABLE AND IS GONE**, removed from
the kernel because it was a projection of its own key — `Fact` IS
`$fact(rel, persp, args)`, so the relation stored the second argument of the
term it was keyed by. Measured before removing it, on 16 eslint files: 41 722
rows, a third of the world. Every rule that read it destructures the term
instead. **The row survived here, and in the grep check's whitelist, until
2026-09-10** — which is the tidiest possible argument against a hand-kept
vocabulary list: the check whose job was to keep this table honest was itself
carrying a name the kernel had deleted.

**Read interface (not reserved):** the kernel *reads* `stratum(Rel,N)` and
`unstratified(Rel)`, never writes them; rules may conclude into them. §3.2 of
the spec names these two as the whole stratification contract between kernel
and boot, and they are in the grep-test whitelist.

**It is no longer two names, and the whole set is below.** Every row is a
relation whose name appears in kernel source because a PROGRAM writes it and
the kernel reads it, or the other way round — never because the kernel
hardcodes a domain. The table is the grep-test whitelist's `IFACE_RELS`, and
that is a measured identity rather than a promise: `test/vocabulary-doc.test.ts`
re-derives both sides on every run and refuses a name that is in one and not
the other. Every relation from `policy.rofl` and `safety.rofl` down is
concluded by *the kernel's own programs* — see the section under this one.

| relation | written by | read by | what it says |
|---|---|---|---|
| `stratum(Rel, N)` | the program | the kernel | the phase a relation settles in. Computed on the primary path instead (`peelRounds`), so only the stock evaluator reads it |
| `unstratified(Rel)` | the program | the kernel | the program is unstratifiable — the stock evaluator's refusal |
| `semantics(Sem)` | the program | the kernel | `semantics(well_founded)` asks for the alternating fixpoint instead of the phase-ordered run |
| `unknown(Atom)` | the kernel | the program | one row per atom the alternating fixpoint leaves undefined, in the atom's own perspective. `why unknown(win(a))` is answerable |
| `sealed(Body)` | the program | the kernel | the floor-sealing declaration — one of `rules`, `assertions`, `provenance` is no longer published. READ, never inferred; see the last section of this file |
| `rule_reads(A, B)` | `policy.rofl` | the kernel | A's rules look at B, positively or negatively, ACROSS the tick boundary |
| `rule_relation(A)` | `policy.rofl` | the kernel | every relation the rules mention, on either side |
| `cone(A, C)` | `policy.rofl` | the kernel | the reflexive-transitive closure of `rule_reads` — the dependency cone the reuse plan needs |
| `opaque_closed(A)` | `policy.rofl` | the kernel | A holds something the evaluation cannot promise to reproduce, closed upward through reads |
| `opaque_seed(A)` | the host | `policy.rofl` | the seed of that closure. It stays with the host because it needs a premise's tense and a store-shape fact the reflection does not carry flat |
| `unsafe_rule(R)` | `safety.rofl` | the kernel | R's body does not bind everything its head or its builtins name — the range-restriction verdict, which used to be a fold in TypeScript |
| `premise_var(R, K, Slot, I, V)` `slot_arity(R, K, Slot, N)` | the host | `safety.rofl` | the two inputs the reflection does not carry flat: which variable stands where in a premise, and how wide a slot is |
| `late_rule(R)` | `safety.rofl` | the kernel | a monotone rule that may not run before the program has judged itself |
| `demand_rel(Rel)` | `safety.rofl` | the kernel | Rel is unfolded top-down at call sites rather than materialized |
| `trigger_of(P, X)` | `safety.rofl` | the kernel | what a positive premise on P can set off |
| `neg_relation(A)` | `safety.rofl` | the kernel | some rule negates A |
| `provenance_reader(R)` | `safety.rofl` | the kernel | R reads `derived_by` — so provenance cannot be pruned out from under it |

**Term and string destructors** (`Out is op(In, …)`, seven of them). They are
not relations and they are not arithmetic: the parser has exactly one
term-producing builtin form, so the output is the LEFT operand of `is` and the
declared `mode` is `[out, in, …]`. **Indices are CODE POINTS, not UTF-16 code
units** — indexing by code unit can cut a surrogate pair in half and hand back
half a character, which the store would then carry. Operands compose, so
`str_len(str_seg(S, Sep, 0))` is the length of the first segment.

| destructor | inputs | what it answers |
|---|---|---|
| `str_len(S)` | 1 | length of S in code points |
| `str_char(S, I)` | 2 | the code point at I |
| `str_sub(S, I, L)` | 3 | the substring by RANGE — what the separator-based cuts cannot say |
| `str_pre(S, Sep)` | 2 | the part before the FIRST `Sep`, and **empty when there is none** — the one thing `str_seg(S, Sep, 0)` cannot say, since that answers the whole string when the separator is absent |
| `str_seg(S, Sep, N)` | 3 | the Nth segment. The argument list admits TERMS and not expressions, so the last segment is `N is str_segs(S, Sep), K is N - 1, T is str_seg(S, Sep, K)` |
| `str_segs(S, Sep)` | 2 | how many segments — and it is what tells `str_pre`'s empty answer apart from an empty first segment |
| `atom_of(S)` | 1 | the atom of a string. It crosses a sort boundary and produces a TERM; a term only becomes an executable rule through the reflection rows, which `breach[audit]` and the write protection on `conclusion_lit` already watch |

Three refusals, kept apart because they demand three different repairs, and
each arrives as a `hole` rather than as silence: `str_type_error` (the program
is wrong — no data makes a number into a string), `str_index_error` (the data
reached a boundary the program did not guard; the repair is a premise),
`str_empty_separator` (an empty `Sep`, which two of five operations once
accepted in silence). An UNBOUND operand is not a refusal, for the same reason
it is not one in arithmetic.

**They are no longer on the primary path.** The default evaluator peels its
phase order off the decoded rules before a single rule fires (`src/rounds.ts`,
`peelRounds`): round 0 is every relation no `@now` rule concludes, round *N* is
every unsettled relation whose *negative* dependencies all settled earlier,
closed under positive dependency. The round number is the stratum number, and a
round that settles nothing while work remains is the refusal — no table, no
`unstratified/1`, nothing derived about the program in order to run it. The
stock evaluator survives as `new Rofl({ evaluator: 'strata' })` and still reads
both names; `rules/strata.rofl` is the ten rules that supply them, which
boot.rofl carried until nothing needed them. See the deviation register below.

Two more names are on the same footing, and they are the whole
**three-valued** contract: the PROGRAM writes `semantics(well_founded)` to ask
for the alternating fixpoint instead of the phase-ordered run, and the kernel
writes one `unknown(Atom)` row per atom that fixpoint leaves undefined — in the
atom's own perspective, with the atom as an ordinary term, so
`why unknown(win(a))` can be typed and answered. Rules may read `unknown`; a
rule that conclusions its way back into a negated relation through it is
rejected, because the answer was settled before those facts existed. Under this
semantics `stratum/2` is not computed — a program whose rules conclude it is
told so in a diagnostic, because its own rule diverges on a negative cycle,
which is what a negative cycle MEANS for a stratum number. The cycle is still
reportable, as a fact about the program rather than a verdict on it: peeling
the same rules names every relation that can never settle, which reaches
further than `unstratified/1` did — it includes relations that merely negate
something on the cycle. See `docs/three-valued-answers.md`.

**Audits over this vocabulary** (boot.rofl, all in `[audit]`). Six are about
BOOKS AND PERMISSION — `leak`, `forged`, `collected`, `exported`,
`unattributed`, `widened` — and **the whole model for those is in one place:
`docs/books-and-permission.md`**, derived from boot.rofl and gated by
`test/permission-doc.test.ts`. Four are STRUCTURAL and required empty on load:
`malformed` — a rule with no premises or no conclusion; `breach` — a rule
concluding into a reserved relation; `unmoded` — a rule using a builtin with
no declared mode; and `undefined_premise(RuleId, Rel)` — a rule with a
positive premise on a relation that no rule concludes and no base fact
populates. That rule is not wrong, it is *unpopulatable*: `hit(N) :- msg(N, S),
contains(S, "404")` loads clean because `contains` is not a builtin, and `hit`
is then silently empty forever. `edb(Rel)` doubles as the declaration that a
relation comes from outside the program, which is why boot.rofl declares
`edb(imports)` for its own host-supplied perspective-import graph.

`$`-prefixed atoms/functors (`$lit`, `$not`, `$builtin`, `$var`, `$fact`,
`$cons`, `$nil`, `$any`, `$kernel`, `$q`, `$tick`, `$load`, `$rule`, `$sealed`,
`$init`, `$now`, `$next`, plus `$adhoc` for an evaluation nobody named and
`$t` for a query's own term) are kernel-internal reification markers; `$` is
not writable in ROFL source syntax, so they can never collide with user terms.
`$kernel_authority` is the one a FILE may carry: as the FIRST clause of the
FIRST load it says the text being read is the kernel's own, so everything in
it is signed `$kernel` rather than `user`. Both conditions are load-bearing —
a file cannot slip the claim in halfway, and after that first load the door is
shut for the life of the store, with a second claim REFUSED rather than
ignored.

## The kernel's own programs

**Every rule in `policy.rofl` and `safety.rofl` was a decision the evaluator
made in TypeScript.** They are the same move the kernel already makes with
`boot.rofl`, taken one ring further in: the kernel does not merely READ a
program that describes rules, it SHIPS one, the way `bootstrapKernel` already
ships facts into every store.

- `safety.rofl` — **range restriction**, and everything that rests on the
  verdict. A left-to-right fold over the body tracking bound variables was
  `Evaluation.classify`; it is now `unsafe_rule/1`, plus `late_rule`,
  `demand_rel`, `trigger_of`, `neg_relation` and `provenance_reader` derived
  from it. No negation stands inside the fold, so the program is stratified and
  the default evaluator answers it.
- `policy.rofl` — **what the reuse plan may keep**: `rule_reads` (which is
  `dep` from `rules/strata.rofl` WITHOUT its same-tick filter, because a
  `@next` conclusion is still something the rule read), the dependency `cone`,
  and `opaque_closed`. Measured set for set against the host's own walk over
  `Evaluation.rules`: boot alone 35 pairs, +strata 52, +findings 51,
  +kernel-policy 64, +the ring 1 grammar 248 — agreeing on every one.

**Why it has to be shipped rather than loaded.** A rule that is not loaded is
not a conservative answer, it is a wrong one, and 22 of the 95 worlds in this
repository never load `boot.rofl`. So each file is the SOURCE and `src/reflect.ts`
carries a copy — the shape `examples/ring1/l1.dense.rofl` already has, a
program in two forms, one readable and one the machine installs. That is only
honest with a gate keeping them identical, which `test/kernel-policy-program.test.ts`
is.

Two inputs travel the other way, from the host INTO the programs, because the
reflection does not carry them flat: `opaque_seed` needs a premise's tense and
a store-shape fact, and `premise_var`/`slot_arity` need which variable stands
where in a premise. They are declared `edb` for exactly that reason.

## The Rust engine

`rust/` is the port, and `docs/the-target.md` is what it is for: *a Rust engine
that can chew all of grafema's code*. Everything on this branch is instrumental
to that, and a piece of work that cannot say which rung it moves is not on the
path. `docs/medium-and-large.md` draws the line to the engine after it, and the
line is not a size threshold — **negation decides it**, because `not p(X)`
asserts something about a relation's WHOLE extension, so a relation that is
negated anywhere cannot be answered from a part of the corpus.

- `rust/rofl/` — the engine. `session.rs` is the surface `docs/port-surface.md`
  designs, gated by `rust/rofl/tests/session.rs`. What that gate found on its
  first run is why it exists: the design says "`ask(query)`" without ever
  writing a query down, and the first implementation invented `rel@book(args)`
  for a language whose book is `rel[book](args)` and whose `@` is the TENSE.
- `runtime/port.ts` is the JS-side client; `npm run portcorpus` builds the
  corpus both engines are diffed over, and the oracle is a byte-identical
  `canonicalState()`.

The engine is checked with `cargo test` under `rust/`. **It is not in
`.github/workflows/ci.yml`** — the CI jobs are node and bun only.

## Storage adapters

`adapters/` puts a `FactStore` behind an interface and ships a SQLite adapter
over `node:sqlite` (a Node builtin, so the zero-dependency claim is unchanged).
The conformance oracle is a byte-identical `canonicalState()` against the
in-memory reference, and **what it does NOT see is measured rather than
assumed** (CLAUDE.md, *one mutant is liveness, a set is coverage*): of five
mutants it killed unsorted keys and dropped witnesses, and slept through
reversed read order, sorted-instead-of-arrival order, and a dropped
variable-holding fact — because `matchPremise` sorts before returning,
`negHolds` reads for existence, and no program here holds a fact with a
variable in it.

## The JS model

`rules/js-*.rofl` is a model OF JAVASCRIPT — structure, modules, resolution,
call graph, data flow, control flow, effects, environments, globals, hosts —
fed by `scanners/js_ast.ts` and indexed as a matrix of (node kind × layer)
cells, each `modelled`, `waived` with a reason, or `not_modelled`. The
methodology, and the one measurement that decides whether it is science or
bookkeeping, is `docs/modelling-a-language.md`; `docs/scaling-a-corpus.md` is
the run over the whole of eslint (1 426 files, 29.9 s, 1 290 volumes cooled to
200 MB, the world never above 1 938 540 facts against a 2 000 000 ceiling) and
the four defects that run found which reading did not.

## Pipeline

Per evaluation (each tick, and on every load/assert since rules are just
facts): decode rules from the reflected store → **peel the rounds off those
rules**; a round that settles nothing while relations remain ⇒ reject, naming
them → run monotone rules to fixpoint (seminaive) → run the negation rounds in
order → `@next` conclusions staged (they settle no relation, so they run last) →
tick boundary: freeze provenance, drop tick facts, install staged EDB.

Under `evaluator: 'strata'` that first step is instead: run monotone rules to
fixpoint → read `unstratified(_)`; nonempty ⇒ reject with the reach-trace →
read `stratum/2` → run negation strata in order. That path needs the program to
derive a description of itself first, which is why the monotone phase is split
in two waves there — the wave concluding the table has to finish before the
verdict can be read — and why refusing a bad program used to cost the whole
budget: boot's own `stratum(Rel,N) :- …, N is M + 1` has no fixpoint on a
negative cycle. Peeling invents no value and is bounded by construction: each
round settles at least one relation or stops.

Under `semantics(well_founded)` that middle is replaced: no phase order, no
rejection, and every `not p` judged against a frozen round instead of against
the store being built — generous rounds and mean rounds converging on the true
atoms from both sides, with the gap between the two limits written out as
`unknown/1`.

A `@next`-headed rule with negation runs in the FINAL pass, after every
stratum, not at its head relation's level: nothing in this tick can read a
staged conclusion, so nothing orders it against the strata, while its own
negative premises must be judged against relations that are complete —
and staging is monotone, so one premature firing can never be taken back.

Determinism: facts, rules, and firings are processed in lexicographic order of
their canonical serialization everywhere; same program + same inputs ⇒
bit-identical state, tick log, and provenance regardless of insertion order
(tested over 100 shuffles).

## Deviations from START.md (and why)

<!-- BEGIN deviations: generated from facts/deviations.rofl -->

- **Vocabulary additions.** `bridge_decl`, `uses_builtin`
  are added to the §2 table as the appendix note instructs; `premise_lit` /
  `conclusion_lit` are added because the §2 reflection relations alone don't
  carry argument terms, and the evaluator must read rules *only* from the
  store (§4). Rule ids are content hashes (`r` + FNV-1a of the canonical
  clause), so re-loading a rule is idempotent.
- **`conclusion_tense`** is added because §2's `concludes(Id,Rel)` records a
  relation NAME and nothing else, so a conclusion written `@next` was
  indistinguishable from one derived here and now, and boot.rofl drew a
  same-tick dependency edge for it — refusing a sense→decide→act→world loop
  that is perfectly acyclic in time. `not p` means *p is not derivable in the
  CURRENT TICK's store*, so a `@next` head contributes no dependency edge and
  settles no relation: it is base for the tick that sees it, which is what such
  a fact IS. (Under the stratum table that took a floor rule, `stratum(Rel, 0)
  :- concludes(R, Rel), conclusion_tense(R, next)`, because with the edge gone
  the relation would have had no stratum at all. The peel needs no floor: it
  never gives such a relation a level, so nothing orders it and it runs last.)
  The marker is otherwise unreachable — it
  sits inside the reified `$lit` of `conclusion_lit`, and `$` is unwritable in
  surface syntax. `concludes` stays tense-blind, so every other reader of it
  (`breach`, `undefined_premise`) is unchanged.
- **`flows_to`, the transitive closure of `flow`.** The appendix reads
  `leak[audit](A, B) :- flow(A, B), ...`, and `flow` is one rule's signature —
  this rule reads that ledger and writes this one. So the audit was LOCAL
  where the property it guards is TRANSITIVE: content walks out of a ledger
  along a chain whose every step is separately licensed (`red` to `case`
  declared, `case` to `report` declared) and nothing asks about `red` to
  `report`. Measured: for `said[red](a). claim[case](P,X) :- said[P](X).
  digest[report](X) :- claim[case](_,X).` the store ends with
  `claim[case](red, a)` — the ledger name survives collection as an ordinary
  argument — and then `digest[report](a)`, attribution projected away. The
  comparison was also lopsided, since `sees` has always been the
  reflexive-transitive closure of `imports`; `flow` was the half that was not
  closed. boot.rofl adds `flows_to(A,B) :- flow(A,B).` and
  `flows_to(A,B) :- flows_to(A,X), flow(X,B).`, and the leak rule reads
  `flows_to`. `test/flow-closure.test.ts` carries the old single-hop rule
  beside the new one in one store, so "the closure did not swallow the direct
  crossing" is a measurement and not a claim.
- **`collects`, the collection graph.** The closure above made one class of
  crossing permanently unreportable *and* unfixable. A rule polymorphic in the
  ledger (`claim[case](P, X) :- said[P](X)`) reflects as a read of
  `$var("P")`, which has no `authority` fact and never will, so
  `imports(To, $var("P"))` is not a sentence this language can write — and the
  only remedy left was a paragraph in a README, which is not auditable, does
  not go stale loudly, and no check reads. `collects(X)` is host data declared
  like `imports`, and says: X deliberately gathers from ledgers it does not
  name. Three properties, each measured rather than asserted, in
  `test/flow-closure.test.ts`. **Narrow**: it licenses a crossing only where
  the SOURCE is not a registered perspective, so `imports` still gates every
  named ledger. The wide form (`not collects(B)` as a bare premise on `leak`)
  silences a walk from a named `[secret]` into a collecting `[case]`, which
  makes it an off switch; the shipped form reports it. **Keyed on the
  gatherer**: `collects_from(X, A)` requires `flow(A, X)`, so the declaration
  goes on the ledger that gathers. Keyed on the destination instead, a
  `[case]` feeding both `[worlds]` and `[ledger_x]` demands a `collects` fact
  on each reader — statements that are false about them — and another the day
  a third reader appears. **Askable**: `collected[audit](X)` is derived only
  when X actually collected something, so `why collected[audit](case)` names
  `collects(case)` as an axiom and `not perspective($var("P"))` as the reason
  the escape applied, while `asserted_by` names who declared it. A licence
  nobody can ask about is the invisible absence this replaced, and the same
  row distinguishes a declaration doing work from one nobody needed.
- **`stratum`/`unstratified` appear in kernel source.** §3.2 requires the
  kernel to read them while §5's grep test forbids non-§2 names. Resolved by
  documenting them as the kernel's read-interface (they cannot be reserved —
  a program may conclude into them, and `rules/strata.rofl` does). The grep
  whitelist equals this README's tables — **and that sentence was a promise
  until 2026-09-10, when it was measured and was false by twenty names**: the
  read interface had grown from two to eighteen and the destructors from zero
  to seven while the document said neither. It went stale in the SAFE
  direction, which is why nothing noticed — a whitelist wider than the
  document turns nothing red, it only stops the document describing the
  kernel. `test/vocabulary-doc.test.ts` now re-derives both sides on every run
  and refuses a name that is in one and not the other, so the sentence is a
  measurement. The primary path reads neither `stratum` nor `unstratified`, so
  on that path the two names survive in kernel source only for the stock
  evaluator and the alternating fixpoint.
- **Perspective registration.** On first use of a perspective the kernel
  emits `authority(P, $kernel)`. Without it, boot's `perspective(P) :-
  authority(P,_)` never sees `main`, so `sees(P,P)` is empty and every
  same-perspective rule becomes a `leak` — boot alone would fail its own
  audit. User authorities coexist; `forged` still works (it checks the
  specific asserting `Who`).
- **Variable perspectives.** Appendix B uses `reading[S](…)` although the
  grammar says `persp := "[" name "]"`. The appendix wins: a variable
  perspective is parsed and matches facts in any perspective, binding the
  variable — an explicit wildcard read, recorded as
  `reads_from(Id, $var("S"))`: the variable by NAME, so a rule that reads and
  writes the same variable carries one term at both ends and boot's `leak`
  audit sees an identity rather than a crossing (`$any` remains for a
  perspective that is neither a name nor a variable).
  Visibility enforcement is exact-perspective matching: a literal in `[p]`
  only ever sees facts stored in `[p]`; `imports`/`sees` are audit-level data
  (boot's `leak`), not kernel matching rules.
- **Moded (demand) relations.** Appendix B's `close/2` ("mode note: both
  bound") and Appendix C's tape helpers are not range-restricted, so they
  cannot be materialized bottom-up. Rules whose head or builtin inputs are
  not grounded by their positive premises (in written premise order — premise
  order matters, Prolog-style) are evaluated top-down at call sites by
  unfolding; relations depending on such rules through positive premises
  unfold transitively (`@next` rules never unfold). Ground demand results are
  materialized with full `derived_by` provenance, so `why`/`excise` treat
  them uniformly.
- **Timeless kernel facts.** Facts in kernel-vocabulary relations (rule
  reflection, `authority`, `mode`, `reserved`, `edb`, provenance) persist
  across ticks. §3.3's "persistence is not a storage property" is applied to
  the domain world; if rule subgraphs were tick-scoped, every multi-tick
  program would need a rule-copying meta-rule and boot.rofl (which has no
  `@next` rules) could not survive tick 0. Provenance from completed ticks is
  frozen, which is what makes the diverging-TM partial trace queryable.
- **Facts may be asserted into reserved relations.** §2's enforcement is
  defined over rule conclusions ("may read, never conclude into") and
  sensors.rofl itself asserts `authority(s1, sensor_net)`. The API therefore
  blocks rules, not facts; boot's `breach` audit catches hand-asserted
  reflection (tested).
- **`edb` for reserved relations.** Emitted at bootstrap even when empty, so
  boot's stratum rules can ground strata for audits over possibly-empty
  kernel relations (`forged` needs `stratum(authority, 0)` even before any
  authority fact exists). Rules whose head stratum is still unknown (empty
  dependency cones) run in a final pass — see LIMITS.md.
- **Unstratifiable rejection is budget-mediated — on the stock path only.** On
  an unstratifiable program boot's own `stratum(Rel, N) :- …, N is M + 1`
  diverges; the load budget cuts the monotone fixpoint and the
  `unstratified(_)` check on the partial store rejects the load (with a `why`
  trace through `dep`/`dep_neg`/`reach` as the diagnostic) and rolls the store
  back. This is budgets-as-semantics (§5.6), not a special case. **The primary
  path is not budget-mediated at all**: the peel stalls before a rule fires, so
  the refusal costs zero derivation steps and is identical at any budget
  (`test/reject-budget-invariance.test.ts` pins that at 2 000 and 32 000).
- **Rounds replace the stratum table, and the table left boot.rofl with it.**
  §3.2 of the spec puts stratification in boot.rofl as data and keeps it out of
  the kernel; `peelRounds` is a stratification computation in `src/`, so that
  sentence is not kept as written. What is kept is the reason for it — no
  hardcoded boot rule, one policy seam, the schedule readable — and what is
  bought is measured: **44.8% fewer derivation steps across the 34-program
  corpus** (107 235 → 59 184), a refusal that reaches every relation that can
  never settle rather than only those on the cycle, termination by construction
  where `N is M + 1` had none, and the closing of a hole where any rule could
  write `stratum/2` and steer the phase order with no audit signal. What is lost
  is named too: the refusal no longer carries the `reach` trace that showed
  *why*, and the check is computed rather than read from data. The ten rules
  that derived `dep`, `dep_neg`, `reach`, `unstratified` and `stratum` now live
  in `rules/strata.rofl` as an ordinary pack — the stock evaluator still reads
  what they conclude, and any program may load them.
- **Budget accounting.** A derivation step is a *distinct* rule firing
  (deduplicated by rule + premise tuple) or one demand-unfolding node. `hole`
  facts are frozen (they survive re-evaluation — the record that a budget was
  exhausted is history, not derived state).
- **Arithmetic that cannot be evaluated.** `N is "hello" + 1` used to derive
  nothing and say nothing, so a type error inside an expression was
  indistinguishable from a premise that legitimately failed. `is` now emits
  `hole($rule(Id), arith_type_error)` — or `arith_zero_divisor` for `X / 0`
  and `X mod 0` — and the premise still fails, so no derivation changes: only
  the store's ability to state the inability does. Three things this does NOT
  do, each deliberate. It does not fire on an **unbound variable**: a builtin
  whose variables are not yet bound is an ordinary state, not an error, and
  reporting it would put a hole under every rule. It does not fire on a
  **comparison**: `X >= 0` on a string still ANSWERS — the row is not one of
  the numbers — and examples/slop uses exactly that as the numeric type test
  the language does not otherwise have, whereas `is` must PRODUCE a value and
  so has no "no" available to it. And it does not mark the evaluation
  **partial**, unlike the budget hole: the fixpoint is complete, one
  expression in it was not. One hole per rule, not per offending
  substitution; the rule id is a key into the reflected program, so
  `premise_lit(Id, K, Lit)` still recovers the expression.
- **`why` embeds finite-failure demos.** For a negated premise, `why` inlines
  the `whynot` demonstration of the negated fact (Appendix B requires `why
  outlier[trust](s3)` to be a finite-failure demo of corroboration), in its
  single-step form — one level, the failing premises named. Cross-tick
  witnesses whose premise facts no longer exist render as `[past tick]`
  leaves.
- **`whynot` recurses; three guards make it terminate.** Asked directly,
  `whynot` explains each failing premise in turn, so the answer to "which
  stage dropped this row" is the chain down to the builtin that failed on
  real values. A literal already being explained above is marked `[cycle]`
  and not re-entered; `depth` (default 6) shapes the tree; `nodes`
  (default 64) bounds it outright — the node cap alone is what guarantees
  termination, since it caps how many literals the whole tree may explain.
  Both announce themselves in the output when they fire.
- **File layout, and the size target is exceeded by 3.5x.** `api.ts` carries
  `?`/`why`/`whynot`/`excise`/`load` per §4's `repl.ts / api.ts` line; the
  REPL is a thin shell. `src/` was 1 909 lines over seven files when the
  1 500–2 000 target was met; **measured 2026-09-10 it is 6 778 over twelve**
  — `engine.ts` 1 924, `api.ts` 1 235, `reflect.ts` 1 115, `store.ts` 884,
  `unify.ts` 310, `rounds.ts` 307, `semiring.ts` 262, `parser.ts` 224,
  `dense.ts` 200, `tokens.ts` 141, `repl.ts` 93, `kernel-dense.ts` 83. The
  number is written down rather than the target quietly restated: the growth
  bought a second evaluator (`rounds.ts`), the well-founded semantics, the
  dense form, semirings, and a store that can cool volumes to disk, and
  whether that trade was worth 4 800 lines is a judgement a reader should be
  able to make against the original figure.

  **AND THIS PARAGRAPH IS A DELIVERABLE, NOT A FOOTNOTE.** START.md:107 does
  not merely set a target, it sets a STOP: *"If it grows past ~2,500, stop:
  something that belongs in boot.rofl as rules has leaked into the host. That
  signal is itself a deliverable — report it rather than pushing through."*
  `src/` is **2.7x past that line** and the duty (`s_report_loc_overrun` in
  `facts/spec.rofl`) is one of the 28 `npm run speccheck` reports as covered
  by nothing mechanical — so the stop was passed without the report the spec
  asks for, which is what this is. The signal is delivered; whether it means
  what START.md predicts is the owner's to judge, and the evidence cuts both
  ways. FOR: `engine.ts` alone is 1 924 lines, as large as the whole kernel
  once was. AGAINST: the prescribed remedy is already running in the other
  direction — `policy.rofl` and `safety.rofl` are code that LEFT `src/` and
  became rules, and `rules/strata.rofl` is ten more, so the leak is being
  paid back rather than accumulating unexamined.
- **tm.rofl uses one `@next` rule plus moded helpers** (`step`, `move`) and
  explicit carry rules for `delta` and the halted `cfg` — Appendix C is a
  sketch; carrying `delta` forward is the "persistence is not a storage
  property" discipline applied honestly.
- **Node ≥ 22.6 instead of ≥ 20.** The spec says "Bun or Node ≥ 20"; the
  sources are erasable-syntax TypeScript executed via Node's built-in type
  stripping, which shipped in 22.6. Nothing in the code needs Node 22 —
  compiling with `tsc` would restore Node 20 support at the cost of a build
  step; zero-toolchain execution was judged closer to the spec's intent.

<!-- END deviations -->

## Acceptance status

All Phase 1–4 criteria are covered by `test/phase{1..4}.test.ts` (31 tests):
transitive closure & structured terms; naive ≡ seminaive over 120 seeds;
`why` to EDB axioms; perspective isolation; strata read from `stratum/2`
facts; unstratifiable rejection (with the reach-trace on the stock path, with
the stuck set on the primary one); the kernel grep test;
runtime rule addition; the malformed-validator sibling condemnation;
store round-trip through a fresh process with no re-parse; counter 1..5 with
silent fixpoint; 100-shuffle bit-identical replay; busy-beaver halt (13
steps, 6 ones, cross-checked against an independent simulation) and the
diverging variant yielding `hole` with a queryable partial trace; boot's six
audits empty plus `whynot flows_to(red, blue)`; the full sensors scenario
including `excise` blast radius and multiple-support soundness.

Two of those read differently now and the difference is registered above, not
hidden here. *Strata read from `stratum/2` facts* is checked on the stock
evaluator, with `rules/strata.rofl` supplying the table boot.rofl used to
derive, and the same program is checked ordering itself with no table at all on
the primary path. *Boot's audits empty plus a finite `whynot`* lost the
`unstratified(X) -> empty` line — the question is now answered by the file
loading at all, since a program whose peel stalls never reaches a query — and
the finite-failure demonstration is asked of `flows_to`, the transitive closure
that remains.

## The floor-sealing declaration

*(Appended at the end of the file on purpose: `facts/spec.rofl` anchors
duties here by line number, and a block inserted above unfounds every
citation below it — measured, 17 of them. boot.rofl carries the same note
for the same reason.)*

A third is on the same footing, and it decides what the kernel KEEPS rather
than how it runs: the program writes **`sealed(Body)`** to declare that one of
the three bodies of metadata the kernel maintains about it is no longer
published. `sealed(rules)` withholds `has_conclusion`, `reads_from`,
`writes_to` and `uses_builtin`; `sealed(assertions)` withholds
`in_perspective` and `asserted_by`; `sealed(provenance)` withholds
`derived_by`. Nothing else may be sealed, and the boundary is measured rather
than chosen: `rules/floor-census.rofl` derives it from an ablation over every
reflection relation plus a census of who reads each one, and
`test/sealed.test.ts` asserts that the derived set equals the kernel's table.
The relations the evaluator reads to RUN a program (`rule`, `conclusion_lit`,
`premise_lit`) and the ones the kernel's own two programs read about it
(`has_premise`, `concludes`, `premise_pos`, `premise_neg`,
`conclusion_tense`) are not in any body and no declaration reaches them.

The declaration is READ, never inferred, and that is the point of it: dropping
rows because nothing currently reads them makes a later audit return empty and
look correct. So the kernel writes `hole($sealed(Body), reflection_sealed)`
when the declaration arrives, and a `?` query of a withheld relation returns
`partial: true` with a `hole` rather than an empty answer — asking a sealed
floor REFUSES. A body name the kernel does not know is data, not an error, the
same contract `semantics/1` has. `examples/ring1/ring1.rofl` exercises it: the
grammar seals its own rule reflection, which is 456 of 2450 facts in the image
the parser forks once per clause, and boot.rofl's `malformed`, `leak` and
`unmoded` audits over those 126 rules lose their subject and say so.

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
(`docs/guided-formal-reasoning-roadmap.md`, `docs/inquiry-kinds.md`,
`docs/choosing-perspectives.md`): a typed inquiry root, epistemic states as
a derived `[epistemic]` ledger over an `[obs]` evidence journal
(authority: runtime only), proof obligations, and candidate-intent
generation. `runtime/report.ts` renders the anytime epistemic report:

```sh
npm run report -- examples/reflection-readiness/frame.rofl \
  examples/reflection-readiness/evidence.rofl --who-obs runtime
```

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
terms      := term ("," term)*
term       := Var | int | string | atom | functor "(" terms ")"
builtin    := expr OP expr                      -- OP ∈ {=, !=, <, <=, >, >=, is}
expr       := arithmetic over +, -, *, /, mod   -- ints; / truncates toward 0
Var        := /[A-Z_][A-Za-z0-9_]*/             -- `_` is a fresh wildcard
atom/rel   := /[a-z][A-Za-z0-9_]*/
comment    := "--" to end of line
```

`@async` parses and is rejected with *"not in v0"*. `@next` is not allowed in
bodies; `@init` is not allowed on rule heads. Relations take ≥ 1 argument.

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
| `reads_from(Id,Persp)` `writes_to(Id,Persp)` | 2 | perspective signature of a rule (`$any` for variable perspectives) |
| `bridge_decl(Id,From,To)` | 3 | explicit head annotation crossing perspectives |
| `in_perspective(Fact,Persp)` `asserted_by(Fact,Who)` | 2 | fact metadata, emitted on assert (`asserted_by` only when a `who` is given) |
| `uses_builtin(Id,Op)` | 2 | rule uses builtin `Op` (a string) |
| `mode(Builtin, ModeList)` | 2 | declared directionality of builtins, kernel-emitted at boot |
| `reserved(Rel)` | 1 | this table itself, queryable |
| `authority(Persp, Who)` | 2 | who may assert; kernel registers each perspective on first use as `authority(P, $kernel)` |
| `hole(QueryId, Reason)` | 2 | budget exhaustion marker (`$q(N)`, `$tick(T)`, `$load(N)`; reason `budget_exhausted`) |
| `edb(Rel)` | 1 | relation has base facts (also emitted for all reserved relations at boot) |

**Read interface (not reserved):** the kernel *reads* `stratum(Rel,N)` and
`unstratified(Rel)` — computed by boot.rofl's stratum-0 rules, never by the
kernel. Rules may conclude into them (boot.rofl does). These two names are the
whole stratification contract between kernel and boot (§3.2 of the spec names
them explicitly); they are the only non-reserved relation names in kernel
source, and they are in the grep-test whitelist.

`$`-prefixed atoms/functors (`$lit`, `$not`, `$builtin`, `$var`, `$fact`,
`$cons`, `$nil`, `$any`, `$kernel`, `$q`, `$tick`, `$load`, `$init`, `$now`,
`$next`) are kernel-internal reification markers; `$` is not writable in ROFL
source syntax, so they can never collide with user terms.

## Pipeline

Per evaluation (each tick, and on every load/assert since rules are just
facts): decode rules from the reflected store → run monotone rules to fixpoint
(seminaive) → read `unstratified(_)`; nonempty ⇒ reject with the reach-trace →
read `stratum/2` → run negation strata in order → `@next` conclusions staged →
tick boundary: freeze provenance, drop tick facts, install staged EDB.

Determinism: facts, rules, and firings are processed in lexicographic order of
their canonical serialization everywhere; same program + same inputs ⇒
bit-identical state, tick log, and provenance regardless of insertion order
(tested over 100 shuffles).

## Deviations from START.md (and why)

- **Vocabulary additions.** `bridge_decl`, `in_perspective`, `uses_builtin`
  are added to the §2 table as the appendix note instructs; `premise_lit` /
  `conclusion_lit` are added because the §2 reflection relations alone don't
  carry argument terms, and the evaluator must read rules *only* from the
  store (§4). Rule ids are content hashes (`r` + FNV-1a of the canonical
  clause), so re-loading a rule is idempotent.
- **`stratum`/`unstratified` appear in kernel source.** §3.2 requires the
  kernel to read them while §5's grep test forbids non-§2 names. Resolved by
  documenting them as the kernel's read-interface (they cannot be reserved —
  boot.rofl concludes into them). The grep whitelist equals this README's
  tables.
- **Perspective registration.** On first use of a perspective the kernel
  emits `authority(P, $kernel)`. Without it, boot's `perspective(P) :-
  authority(P,_)` never sees `main`, so `sees(P,P)` is empty and every
  same-perspective rule becomes a `leak` — boot alone would fail its own
  audit. User authorities coexist; `forged` still works (it checks the
  specific asserting `Who`).
- **Variable perspectives.** Appendix B uses `reading[S](…)` although the
  grammar says `persp := "[" name "]"`. The appendix wins: a variable
  perspective is parsed and matches facts in any perspective, binding the
  variable — an explicit wildcard read, recorded as `reads_from(Id, $any)`.
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
- **Unstratifiable rejection is budget-mediated.** On an unstratifiable
  program boot's own `stratum(Rel, N) :- …, N is M + 1` diverges; the load
  budget cuts the monotone fixpoint and the `unstratified(_)` check on the
  partial store rejects the load (with a `why` trace through
  `dep`/`dep_neg`/`reach` as the diagnostic) and rolls the store back. This is
  budgets-as-semantics (§5.6), not a special case.
- **Budget accounting.** A derivation step is a *distinct* rule firing
  (deduplicated by rule + premise tuple) or one demand-unfolding node. `hole`
  facts are frozen (they survive re-evaluation — the record that a budget was
  exhausted is history, not derived state).
- **`why` embeds finite-failure demos.** For a negated premise, `why` inlines
  the `whynot` demonstration of the negated fact (Appendix B requires `why
  outlier[trust](s3)` to be a finite-failure demo of corroboration).
  Cross-tick witnesses whose premise facts no longer exist render as
  `[past tick]` leaves.
- **File layout.** `api.ts` carries `?`/`why`/`whynot`/`excise`/`load` per
  §4's `repl.ts / api.ts` line; the REPL is a thin shell. Total ≈ 1,900 LOC —
  inside the 1,500–2,000 target.
- **tm.rofl uses one `@next` rule plus moded helpers** (`step`, `move`) and
  explicit carry rules for `delta` and the halted `cfg` — Appendix C is a
  sketch; carrying `delta` forward is the "persistence is not a storage
  property" discipline applied honestly.
- **Node ≥ 22.6 instead of ≥ 20.** The spec says "Bun or Node ≥ 20"; the
  sources are erasable-syntax TypeScript executed via Node's built-in type
  stripping, which shipped in 22.6. Nothing in the code needs Node 22 —
  compiling with `tsc` would restore Node 20 support at the cost of a build
  step; zero-toolchain execution was judged closer to the spec's intent.

## Acceptance status

All Phase 1–4 criteria are covered by `test/phase{1..4}.test.ts` (28 tests):
transitive closure & structured terms; naive ≡ seminaive over 120 seeds;
`why` to EDB axioms; perspective isolation; strata read from `stratum/2`
facts; unstratifiable rejection with reach-trace; the kernel grep test;
runtime rule addition; the malformed-validator sibling condemnation;
store round-trip through a fresh process with no re-parse; counter 1..5 with
silent fixpoint; 100-shuffle bit-identical replay; busy-beaver halt (13
steps, 6 ones, cross-checked against an independent simulation) and the
diverging variant yielding `hole` with a queryable partial trace; boot's four
audits empty plus `whynot unstratified(reach)`; the full sensors scenario
including `excise` blast radius and multiple-support soundness.

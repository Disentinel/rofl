# ROFL Kernel v0 — Implementation Handoff

**ROFL** — *Relation-Oriented Fixpoint Language*. File extension: `.rofl`.

Target: a working kernel of ROFL, a Relation-Oriented Fixpoint Language. Single file or small module set, TypeScript, **zero runtime dependencies**, runs under Bun or Node ≥20. This document is the contract; the two appendix programs are the acceptance tests.

**Prime directive:** the kernel is a *generic* inference machine. All semantics — including the schema of what a "rule" is and the rules that validate rules — live in the graph as data. The single most likely failure mode of this project is a kernel that hardcodes semantics and passes tests anyway. The acceptance criteria below are designed to make that impossible. Read §7 (Prohibited shortcuts) before writing any code.

---

## 1. Language overview

ROFL is a Datalog-family language extended with: perspectives (first-class truth contexts), explicit time, kernel-emitted provenance, structured terms, and budgets. It is **Turing-complete** by design (structured terms + arithmetic + @next recursion); therefore non-termination is possible and **budgets are part of the semantics, not a safety net** (§5.6).

### 1.1 Syntax (grammar)

```
program    := (clause ".")*
clause     := fact | rule
fact       := literal
rule       := literal ":-" body
body       := blit ("," blit)*
blit       := literal | "not" literal | builtin
literal    := rel persp? "(" terms ")" temporal?
persp      := "[" name "]"                     -- omitted ⇒ [main]
temporal   := "@init" | "@now" | "@next"       -- omitted ⇒ @now
terms      := term ("," term)*
term       := Var | int | string | atom | functor "(" terms ")"
builtin    := term OP term                      -- OP ∈ {=, !=, <, <=, >, >=, is}
                                                -- X is E: E arithmetic over +,-,*,/,mod
Var        := /[A-Z_][A-Za-z0-9_]*/
atom/rel   := /[a-z][A-Za-z0-9_]*/
comment    := "--" to end of line
```

Structured terms (`cons(1, cons(2, nil))`, `s(s(zero))`) are required — they carry Turing-completeness. Unification is syntactic, no occurs-check needed for v0 (document the omission).

### 1.2 Queries (REPL / API)

```
?  lit                 -- all substitutions (respects perspective visibility)
why  ground_lit        -- one derivation tree to axioms (witness)
whynot ground_lit      -- finite failure demonstration: the failing premise(s)
                       -- per unsatisfied rule that could conclude it
excise ground_fact     -- diff: fixpoint(EDB) vs fixpoint(EDB \ {fact})
budget N { query }     -- derivation-step budget; see §5.6
```

`whynot` doubles as single-step abduction: it names the unbound premise. Full multi-fact abduction is **out of scope** for v0.

---

## 2. Kernel vocabulary (reserved, write-protected)

The kernel owns exactly these relations. Domain rules may **read** them, never conclude into them. This list is closed; the kernel knows no other relation names.

| relation | arity | meaning |
|---|---|---|
| `derived_by(Fact, RuleId, Tick)` | 3 | provenance, emitted by kernel on every derivation |
| `rule(Id)` `has_premise(Id,K)` `premise_pos(Id,Rel)` `premise_neg(Id,Rel)` `concludes(Id,Rel)` `has_conclusion(Id,K)` | – | reflection of rules as subgraphs |
| `reads_from(Id,Persp)` `writes_to(Id,Persp)` | 2 | perspective signature of a rule |
| `mode(Builtin, ModeList)` | 2 | declared directionality of builtins |
| `reserved(Rel)` | 1 | this table itself, queryable |
| `authority(Persp, Who)` | 2 | who may assert |
| `asserted_by(Fact, Who, Tick)` | 3 | who did assert, and when |
| `hole(QueryId, Reason)` | 2 | budget exhaustion marker, emitted by kernel |
| `edb(Rel)` | 1 | relation has base facts |

Enforcement is mechanical: a loaded rule whose conclusion relation is in `reserved` is rejected at load with a diagnostic (and surfaces as `breach` in boot.rofl).

---

## 3. Semantics

### 3.1 Perspectives
Every fact and every rule lives in a perspective; the unnamed default is `[main]`, which is *named*, not implied. A rule may only match facts in perspectives it `reads_from` (derived from its body literals). Derived facts land in the head's perspective; writing to a perspective different from the intersection of body perspectives makes the rule a **bridge** — legal, but it must be explicit in the head annotation (no silent crossing). Visibility: `imports(P,Q)` facts induce `sees(P,Q)` as reflexive-transitive closure (computed by boot rules, not by the kernel).

### 3.2 Stratified negation
`not` is allowed only when the program is stratifiable. **The kernel does not contain a stratification checker.** It contains only: (a) monotone fixpoint evaluation, (b) stratum-ordered execution where stratum assignment is *read from derived facts* (`stratum(Rel,N)` computed by boot.rofl's stratum-0 rules). Pipeline per load: run negation-free rules to fixpoint → read `unstratified(_)` — if nonempty, reject the program with the reach-trace as diagnostic → compute strata → run remaining strata in order.

### 3.3 Time
Ticks. `@init` facts exist at tick 0 only (unless a rule carries them forward). `@now` rules derive within the current tick (pure, no state). `@next` rules emit facts into tick t+1. **Persistence is not a storage property**: a fact survives into t+1 only if some `@next` rule carries it. Within a tick: run to fixpoint, snapshot, advance. `@async` is reserved syntax — parse it, reject it with "not in v0".

### 3.4 Determinism
Same program + same inputs ⇒ bit-identical fixpoint, tick log, and provenance, regardless of insertion order. Canonical ordering: facts and rule-firings are processed in lexicographic order of their canonical serialization (define one; hash is fine). This includes search/derivation order under budgets (§5.6).

### 3.5 Provenance
On every successful rule firing the kernel emits `derived_by(F, RuleId, T)` plus, internally, a support counter per derived fact (how many distinct firings support it). Stored witness = first derivation in canonical order. `why` reads witnesses; `excise` must NOT be computed from witnesses (a fact with two supports survives losing one) — v0 implements excise as clean re-evaluation on the subtracted EDB and diffs the results. This is sound by construction and satisfies incremental ≡ scratch trivially.

### 3.6 Budgets & Turing-completeness
Every query and every tick accepts a budget (max derivation steps; default: 100_000). Exhaustion is not an exception: the kernel emits `hole(QueryId, budget_exhausted)` and returns the partial result marked partial. Because terms + arithmetic + @next make the language Turing-complete, an unbudgeted diverging program is a *user program bug*, not a kernel bug — but a kernel that hangs instead of emitting `hole` fails acceptance.

---

## 4. Architecture (required shape)

```
parser.ts     -- text → clause objects                     (~250 loc)
store.ts      -- fact store, Map-based, perspective-tagged  (~200 loc)
unify.ts      -- terms, substitutions, matching             (~250 loc)
engine.ts     -- seminaive fixpoint, strata, ticks,
                 provenance emission, budgets               (~400 loc)
reflect.ts    -- rules ⇄ subgraphs in the SAME store        (~250 loc)
repl.ts / api.ts -- ?, why, whynot, excise, load            (~200 loc)
```

Target ≈ 1,500–2,000 loc total. **If it grows past ~2,500, stop: something that belongs in boot.rofl as rules has leaked into the host.** That signal is itself a deliverable — report it rather than pushing through.

Critical structural requirement (`reflect.ts`): after parsing, every rule is stored as a subgraph (`rule/has_premise/premise_pos/premise_neg/concludes/reads_from/writes_to` facts) in the same store as user facts, and **the evaluator reads rules only from the store**. Parsed clause objects may exist as a transient parse artifact but must not be the evaluator's source of truth. Test that proves it: serialize store → new process → load store → evaluation identical, no re-parse.

---

## 5. Phases with acceptance criteria

**Phase 1 — parser, store, unify, naive fixpoint.** Single perspective, no negation, no time. ✅ transitive-closure program derives correct closure; structured-term test (list append via terms) passes.

**Phase 2 — seminaive + strata + perspectives + provenance.** ✅ differential test: naive ≡ seminaive on randomized programs (≥100 seeds); ✅ `why` returns a derivation tree ending in EDB facts; ✅ a rule reading a perspective it cannot see matches nothing; ✅ negation executes in stratum order *read from `stratum/2` facts*, not from a host-computed ordering.

**Phase 3 — the heart: reflection.** ✅ `kernel grep test`: no relation name outside §2's table appears as a string/identifier in kernel source (mechanically checkable — write the grep script, include it in CI); ✅ a rule added at runtime (as facts, through the same assert path) starts deriving without restart or reload; ✅ boot.rofl's `malformed` validator, when its own premise is deleted through the API, is condemned by its sibling rule — demonstrate in a test; ✅ round-trip test from §4.

**Phase 4 — time, determinism, budgets, boot.** ✅ counter.rofl runs: prints 1..5 via intention facts collected at tick boundaries, silent fixpoint after; ✅ replay: same log ⇒ bit-identical states across 100 runs with shuffled insertion order; ✅ tm.rofl (Appendix C) executes a 3-state busy beaver to halt under budget, and a diverging variant yields `hole`, not a hang; ✅ **boot.rofl loads and all four audit queries return empty, and `whynot unstratified(X)` returns a finite demonstration**; ✅ sensors.rofl (Appendix B) full scenario passes.

---

## 6. Definition of done

1. All Phase 1–4 criteria green in CI (plain `bun test` / `node --test`).
2. `README.md` with: how to run, the grammar, the kernel vocabulary table, and a paragraph on every place where you deviated from this spec and why.
3. A `LIMITS.md` honestly listing what v0 does not do (no @async, no incremental maintenance, no multi-fact abduction, no occurs-check, no persistence beyond store serialization).

## 7. Prohibited shortcuts (each voids acceptance)

- Hardcoding any boot.rofl rule (stratification, schema validation, sees/leak/breach) in the kernel. The grep test exists to catch exactly this.
- Evaluator reading parsed clause objects instead of the reflected subgraphs.
- Provenance as a log string rather than queryable `derived_by` facts.
- Excise computed from stored witnesses (unsound under multiple support).
- Nondeterministic iteration (bare Map iteration order) anywhere results depend on it.
- Silently completing a budgeted query past its budget, or hanging instead of emitting `hole`.
- Skipping the stratification reject path ("all test programs are stratified anyway").
- Treating `@async` as implemented instead of explicitly rejected.

## 8. Out of scope for v0 (do not build)

Incremental maintenance (DRed/counting beyond support counters), @async effects executor, multi-fact abduction, aggregation, GPU anything, persistence layers, optimization passes, syntax sugar. Resist.

---

## Appendix A — boot.rofl (primary acceptance test)

```
-- STRATUM 0: monotone meta-kernel. No `not` above the marked line.

rule_known(R)      :- has_conclusion(R, _).
perspective(P)     :- authority(P, _).

sees(P, P)         :- perspective(P).
sees(P, Q)         :- imports(P, Q).
sees(P, Q)         :- imports(P, X), sees(X, Q).

dep(A, B)          :- concludes(R, A), premise_pos(R, B).
dep(A, B)          :- concludes(R, A), premise_neg(R, B).
dep_neg(A, B)      :- concludes(R, A), premise_neg(R, B).

reach(A, B)        :- dep(A, B).
reach(A, B)        :- reach(A, X), dep(X, B).
unstratified(Rel)  :- dep_neg(Rel, Q), reach(Q, Rel).

stratum(Rel, 0)    :- edb(Rel).
stratum(Rel, N)    :- dep_neg(Rel, Q), stratum(Q, M), N is M + 1.
stratum(Rel, N)    :- dep(Rel, Q), stratum(Q, N).

-- ============ negation below this line only ============

malformed[audit](R)   :- rule_known(R), not has_premise(R, _).
malformed[audit](R)   :- has_premise(R, _), not has_conclusion(R, _).

breach[audit](R)      :- concludes(R, Rel), reserved(Rel).

flow(A, B)            :- reads_from(R, A), writes_to(R, B).
leak[audit](A, B)     :- flow(A, B), not sees(B, A), not bridge_decl(R, A, B).

forged[audit](F)      :- asserted_by(F, Who, _), in_perspective(F, P),
                         not authority(P, Who).

unmoded[audit](R)     :- uses_builtin(R, B), not mode(B, _).

-- Required results on load:
--   ? unstratified(X)      → empty      ? malformed[audit](R) → empty
--   ? breach[audit](R)     → empty      ? leak[audit](A,B)    → empty
--   whynot unstratified(reach) → finite demonstration via dep/reach
```

*(Note: `bridge_decl`, `in_perspective`, `uses_builtin` are reflection facts the kernel emits when loading rules — add them to the §2 table in your implementation and document.)*

## Appendix B — sensors.rofl (paradigm litmus)

```
-- three sources, one lying; bridge decides; triad exercised
reading[s1](t1, 20) @init.
reading[s2](t1, 21) @init.
reading[s3](t1, 95) @init.
authority(s1, sensor_net).  authority(s2, sensor_net).  authority(s3, sensor_net).

close(V1, V2)          :- D is V1 - V2, D <= 2, D >= -2.  -- mode note: both bound
corroborated[trust](S) :- reading[S](T, V1), reading[S2](T, V2),
                          S != S2, close(V1, V2).
outlier[trust](S)      :- reading[S](T, _), not corroborated[trust](S).
temp[verified](T, V)   :- reading[S](T, V), corroborated[trust](S).

-- Acceptance scenario:
--   ? temp[verified](t1, V)      → 20, 21 (never 95)
--   why  outlier[trust](s3)      → finite-failure demo of corroboration
--   excise reading[s1](t1, 20)   → corroborated(s2) falls, temp loses 21:
--                                  the diff IS the blast radius
--   whynot corroborated[trust](s3) → names the missing close reading
--                                    (single-step abduction)
```

## Appendix C — tm.rofl (Turing-completeness demo, sketch)

Encode tape as terms `tape(Left, Head, Right)` with `Left/Right` cons-lists; machine transitions as facts `delta(State, Sym, State2, Sym2, Dir)`; one `@next` rule advances configuration `cfg(State, Tape)`. Load a 3-state busy beaver: halts under default budget with correct tape. Load the diverging variant (loop states): budget exhausts, `hole` emitted, partial trace queryable. Implementer writes the concrete program; both behaviors are acceptance-tested.

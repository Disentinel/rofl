# Two effect cells that look alike and are not — 2026-09-09

`w_effect_implicit_coercion` and `w_effect_module_evaluation`, run together in
one worktree off `8eb3b54`. Both are effect-layer items, both are "the effect of
this construct is somewhere else", and they end in **opposite verdicts**. Why
they differ is the part worth keeping.

## What landed

| | coercion | module evaluation |
|---|---|---|
| kinds | `binary_expression`, `unary_expression`, `template_literal` | `import_declaration`, `import`, `import_expression`, `export_all_declaration`, `export_named_declaration` |
| cells closed | **0** | **5** (4 `handled`, 1 `ignored`) |
| rule fires | yes, on all three | yes, on four |
| residue | 141 of 369 coerced operands | 3 import sites |
| what the residue IS | a missing DERIVATION (interprocedural value flow) | a missing FILE (`./trace.mjs` is the oracle probe and not corpus) |

Matrix: `29 / 52 / 19` → **`33 / 53 / 14`**. Thirteen open cells, every one
still owned by name.

## The criterion, written down because two cells needed it

`facts/js-effects.rofl` already says `member_expression` is `handled` *because
the mechanism covers it with no residue* and `call_expression` is not *because
it has one*. Applied to these two items that reading splits three ways, and only
two of the three had names before:

- **a missing FILE** — add the file and the answer arrives with no rule change.
  The mechanism is already total over whatever graph the world holds.
  `import_declaration` is `handled` although three of its sites name a module
  outside the corpus. This is the same row `import_outside_corpus[audit]` in
  `rules/js-dataflow.rofl` already reports, seen from the effect side.
- **a missing TABLE** — nothing anybody can add to a *corpus* supplies
  `ambient_effect`, because no declaration file says which members read and
  which write. `call_expression` stays open and somebody owns the table.
- **a missing DERIVATION** — 141 coerced operands are values the value layer did
  not trace. No file and no table fixes that; it is interprocedural value flow,
  which is limit 3 of section 6 of the rules. The cells stay open.

`f_a_missing_file_and_a_missing_table_are_not_the_same_open_cell`.

## Coercion: the operand decides, the operator only says whether to ask

The item was written as a question about operators — and the item's own note
promised that `ast_attr(N, operator, V)` "separates the cases". It does, and it
separates far less than it looks. A conversion method is a **member of the
operand**, so what decides whether user code runs is what the operand can be:

```
369 coerced operands
  223  primitive              ToPrimitive of a string or a number is the identity
    5  in-program object      NOT ONE of them overrides `valueOf` or `toString`,
                              so all five convert through Object.prototype
  141  the value layer lost   ← the cell
```

Both of the first two are **positive statements about the construct**, which is
what a waiver means in this taxonomy. The second is the one no rule keyed on the
operator could make.

The operator table is a **complement**: five spellings that run no user code are
named (`===`, `!==`, `typeof`, `void`, `!`) and everything else converts, so an
operator nobody classified is assumed to call — the safe direction for a may-set.
Two operators are deliberately outside the mechanism and named rather than
forgotten: `x instanceof C` consults `C[Symbol.hasInstance]` and `delete o[k]`
performs a *write* on top of converting its key. Neither is `ToPrimitive`.
Measured: `typeof`, `delete` and `instanceof` have **no site** in this corpus,
which is exactly what the item said it owed an answer for.

**Seeding the top of the lattice for the 141 was tried and refused on a
measurement**: it takes `eff_label_unseen` from two labels to none and makes
`effect_of` `top` for most of the corpus. That is the layer's sharpest statement
destroyed to say something nobody can use. The pack's own precedent for an
unattributable call is a positive frontier relation, not a seed.

## Module evaluation: the join over a graph is the join over a body

`f_the_join_is_free_and_the_order_is_the_work` measured that a body's effect is
the union two rules with one head already are. A **module's** is the same union
one scope out, and the only thing that had to be written down is what "one scope
out" means: `nearest_v[flow]` ranges over functions only, so `not eff_in_fn(N)`
*is* the module body.

An `import_declaration` is a top-level node. So the row an import site
contributes reaches its own file's module row through that same negation, and
the transitive closure over the module graph **needs no arm of its own**.

### Cycles

`eff_here` → `eff_module` → `eff_here` is a **positive cycle** and the engine
takes a least fixpoint over it. Nothing assumes acyclicity and nothing needs to:
ES modules can be cyclic, the specification evaluates a cyclic group *once* and
runs every member's top level, so every member sees the whole group's effect —
and the least fixpoint over a lattice of label sets is exactly that.

Measured: **this corpus's module graph is acyclic** (`beta→alpha`, `beta→gamma`,
`gamma→alpha`, `gamma→delta`), and gamma.mjs's own header says the direction was
chosen to avoid a cycle. So the cyclic case is exercised by a probe in
`test/js-effects.test.ts` — a probe and not two more `.mjs` fixtures, because
`test/js-modules.test.ts` imports every `.mjs` in `test/fixtures/js-call` with
node.

### The corpus had the site

The brief asked to measure whether a module with a top-level side effect exists
before adding one. It does, in three of the five files:

```
effect_of_module   alpha.mjs  st_local     beta.mjs  st_local
                   gamma.mjs  st_local     delta.mjs total
                   shapes.ts  top
```

**gamma.mjs is the row worth reading.** It declares nothing at all — three
`export ... from` lines and not one function — and its whole effect is inherited
across the graph.

### Async is not smuggled back

`import('./m')` evaluates its module and returns a promise. The effect is that
module's row and the suspension is *control*, exactly as `await_expression` is
waived under `a_suspension_is_not_an_effect`. There is no `load` label and no
ordering label anywhere in this layer, and `eff_import_invented[audit]` is the
row that says a site contributes what its target has **and nothing else** — the
same refusal `concrete_async_smuggled[audit]` makes for the concrete column.

### The resolver is a copy with a control

`import_target[code]` in `rules/js-dataflow.rofl` answers "which corpus file does
this specifier name" with the kernel's own string destructors and no host loan at
all — and it is closed over `module_source[code]`, which **has no arm for the
dynamic form**. Reading it here answered three of the four kinds and was silent
about the fourth; `import('./m.mjs')` derived nothing and no audit said so.

So the four literals are written again in `rules/js-effects.rofl` and
`eff_mod_target_disagrees[audit]` asserts the two agree **row for row in both
directions** wherever `module_source` carries the specifier. That is what keeps a
copy from becoming a second opinion, and it is the shape `eff_exn_only` /
`may_throw_only` already have one section up.

`rules/js-modules.rofl` answers the same question more completely — it walks a
real disk — and is deliberately *not* loaded into the effect world: pulling it in
needs the two blind host emitters and changes nothing about the join.

## The defect neither item introduced, found by asking where the check cannot look

**`f_the_exn_oracle_cannot_see_a_label_that_did_not_arrive_through_resolves`.**

The effect layer's one independent oracle is `eff_exn_only[audit]`: `eff_latent(F,
exn, none)` must never hold where `may_throw[code](F)` does not. `may_throw`
closes over `resolves[code]` and `throw_statement` **and nothing else**.

The concrete column, which shipped in the same commit as the oracle, seeds a
label at a call site `resolves` has no row for. Measured, one planted row:

```
surface_origin(array, builtin_prototype).
ambient_effect(array, "join", io).
```

→ `eff_exn_only[audit]` **0 → 2 functions**, because `io` contains `exn`, while
`may_throw_only[audit]` stays 0.

So the first honest row the runtime and globals surfaces supply for a member
whose effect is `io`, `exn`, `pure` or `top` turns the layer's only cross-check
red. The positive control already in `test/js-effects.test.ts` stays green **only
because it maps two members to `rd_local`**, which carries no `exn` — a
coincidence, and now a named one.

This blocks `w_effect_ambient_call` rather than either item here, and it is the
owner's decision. The one thing that is not an option is dropping `exn` from the
new arms to keep the audit green: that is modelling a lie to protect a
measurement.

## Mutants

Six new, four killed, two survivors of the "no site in this corpus" class.

| | targets | verdict |
|---|---|---|
| M9 `void` no longer inspected | that the operator table separates anything | **killed** — `eff_coerced` grows by five |
| M10 a traced object treated as untraceable | that an object discharges through `Object.prototype` | **killed** by the partition identity |
| M11 the erasure guard dropped | that `import type` evaluates nothing | **killed** on a probe — no type-only import in the shared corpus |
| M12 the top-level test dropped | `not eff_in_fn`, the whole definition of a module body | **killed** — `effect_of_module` moves |
| the conversion CALL arm | that an overriding `valueOf` propagates | **no site** — exercised on a probe, not a fixture |
| `eff_op_beyond` (`instanceof`, `delete`) | two operators outside the mechanism | **no site** — exercised on a probe |

Two of the six survive only by the corpus, which is the "waiting on a corpus"
category `w_prototype_of_a_value` named; both now have a probe, so neither is a
capability nothing exercises.

## Pins moved, and where

- `test/js-effects.test.ts` — the matrix `29/52/19` → `33/53/14`. A number that
  moves when the MODEL changes stays a number, and it is re-stated on purpose.
- `facts/js-attrs.rofl` — `attr_value_unread_ok(operator, "===")` and
  `(operator, "void")` **removed**, because the effect layer now reads exactly
  those two values as constants. The other ten stay and their reasons are still
  exact: the six arithmetic and comparison spellings are modelled *by complement*,
  so no rule anywhere writes them.
- `test/js-attrs.test.ts` — the `attr_pair_read` set filtered to `async` and
  `operator` grows by the seven spellings `eff_op_inspects` and `eff_op_beyond`
  name. `attr_key_read_free` is UNCHANGED, which is the point of writing each
  operator as its own rule with a constant.
- `test/worklist.test.ts` — two NAMED SETS, neither a count: `open_cell[audit]`
  loses five rows, and the list of items that have spawned no finding loses both
  of this wave'''s items. Both are set differences a merge can compute.

Reserved and **not moved**: `test/js-model.test.ts` (35 tests green, its world
holds neither pack), `test/js-fixpoint-cost.test.ts` (green, same reason) and
`test/js-layer-cost.test.ts` (46 tests green with `test/js-host.test.ts`; its
subject is the CONTROL-FLOW world and `peak rows 260568 of 500000 (52.1%)` is
the number HANDOFF.md already records). No cost pin moved.

## The full run did not finish, and the arithmetic is what says so

`npm test` under the attestation ritual: `control ok`, `TREE STILL — result
valid`, and then `SUITE TRUNCATED — 797+7 of 867`. 867 is not ~1634 either, so
both guards CLAUDE.md names fired. **63 files were cancelled** with `Promise
resolution is still pending but the event loop has already resolved` — the whole
tail of the alphabet from `js-attrs` on — while a second session ran its own
`js-attrs` and heavy js files on the same machine. The seven failures reported
are the seven pre-existing ones.

So the evidence here is per-file rather than whole-suite, and it is stated as
such: `js-effects` 34/34, `js-attrs` 19/19, `worklist` 19/19, `js-model` +
`js-fixpoint-cost` 35/35, `js-layer-cost` + `js-host` 46/46, and
`js-vocabulary` + `js-pack-home` + `findings` + `note-witness` +
`witness-check` + `spec-coverage` 58/58. `witness_check.ts` is
`ok 31 STALE 0 BROKEN 0`; grepcheck, textcheck and flagcheck are clean.

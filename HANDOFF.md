# HANDOFF — the model-coverage loop on `modeljs`

Written 2026-09-08 by the nightly loop (iterations 35-40). The tree is **green** apart from the
seven pre-existing failures named below. Everything here is measured unless it
says otherwise.

**Iteration 34 ran THREE ITEMS IN PARALLEL, in three git worktrees**, on the
owner's ask. Read `f_a_ledger_keyed_by_name_merges_and_a_pin_keyed_by_nothing_does_not`
and the four findings beside it before doing it again; the short version is at
the bottom of this file under *Running items in parallel*.

## Where the loop is

Branch `modeljs`. The vocabulary now takes on **the language** rather than its
own list, by the owner's decision on 2026-09-08.

```
KIND x LAYER   453 cells = modelled 189 + waived 229 + not_modelled 35
  answered (modelled | waived):  418 / 453 = 92.3%

open_cell[audit] 6, every one owned BY NAME, sweeper 0 at all four layers.
66 work items, 54 done.  blocked[audit] 1 — the kernel question the owner holds.
  callgraph  open  1, claimed 25     dataflow    open  1, claimed 24
  modules    open  3, claimed 19     controlflow open  1, claimed 30

COST, and it moved further in one night than in the rest of the loop:
  control-flow world   11 400 715 -> 3 521 279 rows   (-69%)
  call-graph world      7 465 259 -> 3 244 319 rows   (-56.5%)
  the control-flow LAYER 1 864 255 -> 252 165, its share 46.4% -> 7.2%
  rows per fact 6.05 -> 8.07 — UP, and the shadowing layer bought it
```

**THE ENGINE HAS A SPACE WALL AND NOTHING MEASURES HOW CLOSE WE ARE.**
`DEFAULT_SPACE` is **500 000 rows** (src/engine.ts) and the merged control-flow
world holds **434 149 facts** — 87% of it. `Rofl`'s constructor takes no
`space` option, so it cannot be raised from the public API. This was found the
hard way: two mutants of the new per-layer cost gate stopped fitting and came
back `$rule(...)/space_exhausted` instead of a cost, which is what forced the
`has_return` repair rather than the saving. Nothing reports `peakRows`, so the
only signal is a probe that stops fitting. **Owner's to decide.**

**THE OPEN SET IS SIX AND EVERY ONE OF THEM IS THE OWNER'S.** This is the
first time the queue has been in that state, and it is why the open-cell pin
stopped being a number on 2026-09-08 — `w_open_cell_should_be_an_identity`
asked for that and the reason it can be granted is not that six is small:

```
with_statement/none/callgraph     what `with` does to name resolution
with_statement/none/controlflow   (one-word scanner change; the DECISION is
with_statement/none/dataflow       what it costs `sees_binder` and `may_be_node`)
with_statement/none/modules
call_expression/none/modules      `require` has no site in the whole tree
import_declaration/subpath/modules  needs a third host loan
```

A seventh row is now a red test with a name in it rather than an off-by-one.
**No amount of work closes any of the six**; the remaining open work items —
`w_cf_completion`, `w_scope_shadowing`, `w_computed_key_names`,
`w_cost_gate_per_layer` and the rest — improve the model without touching a
cell, which is the shape `f_a_blindness_can_have_no_cell` already names.

**THE PLAN IS FLAT AND `next_work` IS TEN.** `work_order` — sixty-five
hand-written numbers — is gone; the order is derived from `work_needs`, and an
item something waits on comes before one nothing waits on. All eleven items
anything waited on are now done, so nothing left has leverage and every takeable
item is next. That is what a finished dependency chain looks like from the
queue's side, and it is the state a wave of parallel agents is for.

**THE ERA TABLE KEYS ON A RELEASE, NOT A YEAR.** `env_has` walks a composition —
`release`, `includes`, `provides`, `reaches` — generated from TypeScript's own
`/// <reference lib=` lines. `env_extra` is gone: it existed only because
TypeScript is not a later edition, which the file admitted in prose. Two
consequences worth knowing before touching this: a rank is now a LABEL, so a
mutant aimed at one is inert; and `lost[audit]` is a set difference with no
ordering, so the old one-environment-per-year limit is gone.

**102 -> 15 open cells in one day, from EIGHT branches across three rounds.**
The vocabulary took on the language on 2026-09-08 morning (102 open cells) and
the afternoon closed 87 of them: ES2022 class syntax, the destructuring family,
the two export forms, labelled and inert statements, class expressions, meta
properties, decorators, the update and literal forms, directives, the re-export
edge, and the standard-library surface.

**And the last BLOCKED chain went with them.** `w_env_api_surface` waited on
`w_prototype_of_a_value`, which was OPEN and unblocked the whole time — its own
note said the dependency was half discharged and nobody read it. Closing the
pair unblocked the effect layer, `w_meta_property` and
`w_destructuring_hides_a_call` at once.

**102 -> 70 open cells in one afternoon**, from three branches at once:
`w_destructuring_rest_and_spread` (50), `w_export_specifier_forms` (55),
`w_labelled_control` (56) and eight of the twelve cells of `w_inert_statements`
(57). The four `with_statement` cells stay **open and unblocked** — the work is
a one-word scanner change and what it waits on is a decision about name
resolution.

**Two items were ADDED, and one of them reopened a closed cell**:
`w_destructuring_hides_a_call` (60), because
`ignored(js, object_pattern, controlflow, a_no_control_transfer)` was measured
FALSE the day after it was written — `const {taken} = withGetter` runs the
getter — and `w_open_cell_should_be_an_identity` (61), because the number above
is the last pin in the queue tests that is a number.

**89% became 69% and that is the number becoming TRUE.** It used to say "89% of
what we declare"; twenty-three kinds of core ES entered the vocabulary and none
of them is answered. **A finished layer re-opened**: `controlflow` had no open
cell since 2026-09-06 and has 23 again, because a layer finished over a
vocabulary that is not the language was finished over the wrong denominator.

**Three kinds were NOT taken on, each for a measured reason**:
`class_accessor_property` (the scanner returns no node without the decorators
plugin), `import_attribute` (ES2025, and the era scale tops out at ts5/2022, so
the feature would be permanently unreachable), `export_default_specifier` (a
Babel proposal no environment claims). All three wait on the decorator work.

## What iteration 32 measured — destructuring, and the denominator

**The coverage matrix cannot answer "which features are not covered", because
its denominator is the model's own vocabulary.** 89% is 89% of 75 declared
kinds; babel's core ES grammar — no TS, no Flow, no JSX, no experimental — has
about **107** concrete node types, and roughly **25 are not declared at all**:

```
destructuring   object_pattern, array_pattern, assignment_pattern,
                rest_element, spread_element
class fields    class_property, class_private_property, class_private_method,
                private_name, static_block, class_accessor_property
expressions     update_expression, class_expression
statements      labeled, empty, debugger, with
other           meta_property, reg_exp_literal, big_int_literal,
                export_specifier, export_namespace_specifier
```

**The hole is DECLARED rather than silent**: `vocabulary_gap[audit]` fired on
`object_pattern` on a three-line probe before a rule existed. What the model
lacked was a corpus, not a check.

**ONE HOLE IS GENUINELY SILENT and needs the owner.** Diffing the kinds a RULE
READS BY NAME against the vocabulary finds two: `program`, structural, and
**`class_expression`** — which `obj_like[flow]` and `node_value_kind` both read,
so the model HAS an opinion, and the matrix has NO CELL for it at any layer. A
kind the vocabulary does not declare can never be reported unmodelled. That
check is derivable (rules are facts) and belongs beside `vocabulary_gap`, which
watches the corpus and not the rules.

`object_pattern` is declared and answered at four layers now. `destructures[code]`
says which local comes from which key and the value arm joins it through
`member_value`; **shorthand and rename are one case**, because reading the key
for the member and the value for the local covers both without a `shorthand`
test.

**THE REFACTOR SHIPPED BEFORE THE FEATURE, with its own control.**
`binder_region`, `binder_at_top` and the top-level arm of `sees_binder` all read
`binder` because it was the only way to bind; they read `scoped_binder` now.
With the indirection in and no second arm, fifteen relations compared row for
row: identical, 731 066 bytes of sorted rows. A rename bundled with a feature is
a diff where nothing can be attributed.

**AN EMPTY ANSWER WAS A FACT ABOUT THE TOOL, for the second time in two
iterations.** `WHERE THE WALK CANNOT LOOK` asserts a live function is reported
maybe-dead — and it went red because its world returned ZERO ROWS: that test
loaded the AST facts BEFORE the packs, so `r.load()` ran a full fixpoint under
its own DEFAULT budget and emitted `hole($load(2), budget_exhausted)`. Raising
`evaluate` to 200 M changed nothing, because the wall was never `evaluate`'s.
The packs load first now, as `test/js-corpus-world.ts` already records, and
every query in that test checks `partial`.

## What iteration 31 measured — and a number I reported that was wrong

**I told the owner there were seven note texts to reconcile by hand after the
ledger merge. There were none.** The comparison loaded both ledgers as
perspectives and derived `note_split 7` beside `kind_split 0` — and re-measured
with a second instrument, a clause-level walk found 413 shared findings and
ZERO differing texts.

`finding_note` is **one-to-many** in this ledger and always has been: seven
findings carry two rows and one carries three, and the second is always a
correction (*DISMISSED THE SAME DAY*, *CORRECTED WITHIN THE HOUR, by the
owner*). So `finding_note[a](F, X), finding_note[b](F, Y), X != Y` pairs a
finding's own first note against its own correction arriving through the other
book, and the seven were exactly the seven that carry two.

The convention is good and `runtime/report.ts` already joins every note, so no
READER was ever misled — only a rule. It is declared now: `corrected(F)`,
`corrected_unsettled[audit]` for the hazard the convention creates (revisited
and left open — empty on the honest tree, planted in the test), and the report's
joining asserted rather than assumed.

**Third instrument defect this week of the same shape**: a rule right about the
question it asks and wrong about the shape of what it reads — after a census
comparing `broken` against `get broken`, and a walk that excluded `extra` from
its own measurement of what was excluded.

**A check was measured and NOT built**, and the measurement is the reason. A
finding whose prose claims a settlement the facts lack would be work already
done that the backlog still offers. Six candidates, every one a false positive:
`REVERTED` describes a patch, `RETRACTED` a claim inside the finding, and one
hit `CLOSED` standing under a negation — *the bypass is narrowed, NOT CLOSED*.
A keyword over prose cannot tell a finding's state from its subject. The
structural version is one line and needed no prose at all.

## What iteration 30 measured

`w_prototype_of_a_value` (49) carried **`NO SITE IN THE CORPUS`** and it was a
measurement of something else: it asked `may_be_lit` — does the model carry the
receiver as a VALUE — and a prototype does not need a value.
`[1, 2, 3].join(",")` needs nothing carried, because the receiver is an
`array_expression` and the KIND is the answer.

Re-measured by NAMING every site instead of counting them, and thirteen turned
out to be four different questions:

```
template_literal .concat    1    the String prototype       <- the sites the
array_expression .join      1    the Array prototype           note denied
identifier       .next      6    a generator object, may_be_node EMPTY for all
                                 six - the generator protocol, another item
new_expression / identifier 2    a class IN this program, not a prototype
```

`prototype_of[flow]` derives it in two arms — from the kind, and through
`may_be_node` — and `stdlib_member[audit]` turns *the residue is the standard
library* from a comment into three rows. It resolves nothing and is not meant
to: it moves the residue into `w_env_api_surface`'s in-tray, the item that waits
on this one BY NAME. **The rules cost more than the fixture for the first time
in this loop** (+1.11% of rows against +0.96%), which is what a new RELATION
costs as against a new site.

**A THIRD KIND OF SURVIVING MUTANT, worth carrying forward.** Dropping
`unresolved_call` from that audit is unkillable BY THE MODEL'S OWN
INCOMPLETENESS — it needs a member call that RESOLVES on a builtin receiver,
which cannot exist without a standard library — so it becomes falsifiable
exactly when `w_env_api_surface` lands. Beside "no site in this corpus" and
"unkillable by the grammar", ask of every survivor: **is it waiting on a corpus,
on the grammar, or on another item?**

## What iteration 29 measured

`cell_blocked(..., scanner_contract)` blocked four cells with the note *it moves
when the scanner's contract moves*, and nobody had measured the distance.
Measured over **223 files and 422 482 nodes**, every own property that is
neither a node, nor an array of nodes, nor a scalar:

```
with babel's `extra` set aside:  TemplateElement.value  {raw,cooked}  allScalar
                                 ...and nothing else
```

**One property in the whole language.** The scanner flattens a nested object of
scalars now — a general rule, not a case for templates — and no rule was needed
at the call graph at all, because `selects[flow]` already reads a computed key
through `may_be_lit`. Four cells closed, `s_computed_template_key` went
`has_residue` -> `fully_resolved`, and three work items were marked done.

**`extra` IS DECLARED OUT, and the declaration is load-bearing.** It was already
excluded by falling through a branch that emits nothing — the right thing for
the wrong reason — and the general rule would have swept it in: measured, 235
nodes in the fixtures alone, carrying `parenStart` (a byte offset) into a model
of the language.

**A SITE CAN MEASURE THE WRONG THING.** The corpus already had a template-key
site, `` bag[`fixed`](n) `` in shapes.ts, and it could not have measured the
fix: `bag` is an ambient declaration with no value, so the call cannot resolve
however good the key is. Fourth instance of the trap that file's own header
names. Re-pointed at a real object and moved below its declaration; the runnable
half went to alpha.mjs, because a site whose residue is closed belongs where the
oracle judges it.

**Two mutants survive by construction and are named rather than re-measured:**
reading any quasi instead of the first (a template with no expressions has
exactly one), and the sequence-field carry on `after_abrupt`/`suspend_at`.

## THE PINS WERE CONVERTED — read this before writing one

Adding one fixture function used to red-line about twenty assertions, of which
roughly four had anything to say. That is
`f_a_pin_that_moves_with_the_corpus_is_measuring_the_corpus`, and the conversion
is done rather than queued. **The rule now:**

- **A number that moves when the CORPUS grows is measuring the corpus.** Write
  the identity or the named set it was standing in for:
  - `reason[audit] === f.not_modelled`, not `73`.
  - the shape tally sums to the call-site count, not `368`.
  - `every name alpha.mjs exports`, not twelve names typed out.
  - `m.n(rel) === b.n(rel)` between the mutant world and the baseline, not `22`.
  - `k*(k-1)` at one site, not `164`.
  - the five heaviest read paths as NAMES + SHARES of the total — measured
    stable to ±0.1 pp across BOTH axes of the 2×2 — not raw counts.
- **A number that moves when the MODEL changes stays a number**, and re-stating
  it on purpose is the ritual working. There are three: the fine matrix
  (`58 + 26 + 72`), `open_cell[audit]` (14), and the fixpoint total/firings.
- One conversion **found a defect the number had hidden**: `gamma re-exports
  every function in the corpus` was pinned as the length `38`, and writing it as
  a set showed it includes `shapes.ts` — a fourth module the length had been
  absorbing silently for as long as it was a length.
- And `mutant 7` in `test/js-callgraph.test.ts` was **asserting the opposite of
  its own comment** and had been green by luck. What it actually says is that
  un-declaring the kind removes the model's ability to SAY a transfer happened:
  a `new` whose site does not resolve stops being frontier too. Named now.

## The rituals that are not optional here

- **`npm test` is the loop** (node only; bun is CI's business). ~4 min on this
  machine, 15 min CPU across four lanes.
- **Attest every full run** with a tree fingerprint AND a positive control —
  snippet in `CLAUDE.md`. **Extend its `find` to `*.mjs` and `*.txt`**: the
  fixtures are neither `.ts` nor `.rofl`, so as written it could not see
  `alpha.mjs` or `shapes.ts.txt` change under a running suite.
- **Seven pre-existing failures**: `example-goof` x2, `example-heck`,
  `example-loot`, `example-npc` x2, `example-sus`. Any eighth is yours.
  `example-yak` passes here and fails on Linux, and the cause is measured: it
  pins BSD `grep -I -c` output (nothing at all) where GNU prints `0`.
- **After every push, read the CI job log for your commit** — local green is not
  green. Fetch it immediately before writing the commit message.
- **The 2×2 cost matrix** with axes taken from THIS diff, and its own control:
  the (last-green, last-green) corner must reproduce the number pinned in
  `test/js-fixpoint-cost.test.ts`. It did, to the row, with FOUR files on the
  rules axis — three rule packs and a fact pack.
- **Run the kind census beside the oracle probe**, not at the end.

## Environment

- Developed on node 24.13; CI uses node 22. The V8 naming sweep is identical on
  20, 22 and 24, so nothing in the oracle depends on the version.
- `npm test` asks `os.availableParallelism()`. If a second agent works on the
  same machine in another worktree, both ask for every core and oversubscribe.
  Pass `--test-concurrency` explicitly while iterating.

## What to do next

`next_work[audit]` names the head. Ten open cells remain and every one is owned
by name; `cell_blocked` is empty, so nothing is waiting on a contract.

**The standing question for the owner** (do not decide it): whether to declare a
fifth `layer(scheduling)`. The mechanics are measured — `await thenable` calls
`.then` one microtask turn later on a stack of depth ONE and foreign microtasks
run between the two halves of one await, while for-of, getters and generator
resumption are synchronous and nothing interleaves — but a scheduling layer's
cells would be answered almost entirely by BUILTINS (`setTimeout`,
`Promise.prototype.then`), and the queue already knows that chain:
`w_prototype_of_a_value` (49) -> `w_env_api_surface` (17), which
`w_effect_layer` declares it needs. Declaring the layer first would open 80
cells whose honest verdict is *blocked on the standard library*.

A PERSPECTIVE, by contrast, costs nothing extra and is checkable today —
`await`, `for-of` and the generator are all in the corpus. Note that
`docs/choosing-perspectives.md` is NARROWER than the practice: `[code]` and
`[flow]` are PLANES, not ledgers with rival writers, and they would fail the
doc's own first litmus. That gap is worth a finding of its own.

**`w_computed_key_names` (40)** is still the sharpest open thing that needs no
builtin surface: `key_name`'s first arm names a computed identifier key after
the VARIABLE's spelling, which its own comment forbids, and the same arm ranges
over every named node rather than over keys.

## Commands

```
npm test                                            # the loop, ~4 min
npm run findings                                    # the backlog
npx tsc -p tsconfig.json
npm run grepcheck && npm run textcheck && npm run flagcheck
node --experimental-strip-types scripts/witness_check.ts
node --experimental-strip-types --test --test-concurrency=4 test/<one>.test.ts
```

## Standing constraints from the owner

- Develop and push on `modeljs` only.
- `layer(L)` is declared by the owner alone. The four that exist are authorised;
  a new one is not, ever, without being asked for.
- Never assign the `out_of_scope` verdict — that judgement is the owner's.
- bun is ignored locally; CI runs it.
- Iteration speed must RISE.


## Running items in parallel

Tried on 2026-09-08 with three agents in three worktrees off one commit. It
works, and what makes it work is not what was expected.

**The ledger is the part that parallelises.** `facts/worklist.rofl` and
`facts/js-kinds.rofl` were edited by all three branches and git merged them with
**zero conflicts** across three merges — rows addressed by NAME, in per-item
blocks. Nine conflict hunks on 3 384 added lines, eight of them two branches
appending at the same tail.

**The pins are the part that does not**, and only the ones written as NUMBERS.
A named set that two branches grow merges as a union, which is computable; a
count that two branches move is right on each branch and wrong in the merge,
with nothing in the conflict to say what the third number is.

**Choosing items for disjoint files is worthless.** The three were picked one per
rules pack, deliberately and out of worklist order. Thirteen files ended up
touched by more than one branch and six by all three. Pick items for real-world
weight or dependency order instead.

**Brief them with these four rules**, which is what four agents were given
across two runs:
1. Do not touch `test/js-model.test.ts`, `test/worklist.test.ts` counts, or
   `test/js-fixpoint-cost.test.ts` — the integrator fixes those once.
2. **Oracles must be named sets, never counts** — and a "named set" has three
   ways of not being one, all three found by running merges:
   - a COUNT two branches both move (right on each branch, wrong in the merge);
   - a SCOPE that pins another branch's file (`the kinds rules/js-modules.rofl
     names` went red for somebody else's work);
   - a set whose ELEMENTS embed a coordinate (`BIG_TOTAL@shapes.ts:480` — a
     fixture appended earlier moved all of them by 38 while every claim stayed
     true). Ask whether an element would change if somebody edited a part of
     the file the assertion is not about.
   A set defined by a RANK (`the five heaviest`) is a fourth: put the cut where
   the data has a measured gap instead.
3. Do not run the full suite; run the targeted files. Agents share the machine.
4. Prefer a new fixture file; if you must append to `alpha.mjs`, append at the end.

**Resolve merges with a script, but grep for all THREE markers.** One
`=======` survived a scripted resolution, babel refused the whole fixture, and
2 432 nodes left the corpus in one step — which read as 106 unrelated failures
across nine files, none of them saying "a fixture is gone". `scripts/text_check.ts`
now rejects markers and `test/js-ast.test.ts` asserts every fixture scans.

**FOUR WAYS A MERGE WENT WRONG ON 2026-09-09, all met for real, and none of
them is in the four-rules list above.**

1. **A count both branches move to the SAME value for unrelated reasons.** The
   first rule already says "a COUNT two branches both move" — but when they
   move it to DIFFERENT values git raises a conflict and somebody looks, and
   when they move it to the same value git **auto-merges in silence**. Two
   branches each wrote `unproven(F)` 32 -> 31, for two different settled
   findings; the merged tree held 30 and nothing in the conflict said so.
   `scripts/witness_check.ts` re-run AFTER the merge is what named it. That
   number then moved a THIRD time, 30 -> 32, when a later branch RECORDED
   findings without witnesses. Three merges, three correct moves, three
   different directions.
2. **A mutant anchored to a rule's TEXT expires when the rule is REORDERED**,
   even though the reorder changed no answer. Four mutants died that way in one
   night — `MUTANT B` and `MUTANT A` in js-layer-cost, `s7` in
   js-controlflow-scope, and the js-model shape mutants. This is
   `f_a_mutant_anchored_to_an_item_name_expires_when_the_item_closes` in a
   third guise. **If you reorder a body, grep the test suite for its text.**
   Re-aim rather than delete: `MUTANT B` now plants the OLD order and guards
   the repair against being reverted, which is stronger than what it replaced.
3. **A comparison between two MOVING numbers is not a pin.** An assertion read
   `rest < 20`; after one repair the layer walked 22.33 rows per derivation
   against 45.14 for the rest of its world, so it was rewritten as
   `layer < rest` and the inversion read as a result. A second repair took the
   rest to 19.70 and the inversion was false again — **with neither side of it
   having been the subject.** Report both, assert the one your gate measures.
4. **A mutant's survival can be a property of the WORLD'S SIZE, not of the
   check.** `MUTANT A` survived a 1.5 pp row-share band while the world was
   large, because a fixed band is generous against a big denominator. A repair
   halved the denominator and the same mutant became a kill at 9.29% against
   7.16%. **A survivor list is only true at a stated scale**, and the scale
   belongs in the note beside it.

**And one sequencing error worth naming because only the FULL run finds it:**
a gate was pinned, and then a rule was repaired in a pack that gate's world
loads — pinned numbers invalidated by the next edit in the same sitting. The
targeted files were all green. Run the full suite before you believe a pin pass.

**Four operational traps, all paid for on 2026-09-08/09 and none of them
about the model.**

1. **The suite needs node 24 and the default node here is 20.** `npm test`
   under node 20.20.0 dies with `node: bad option:
   --experimental-strip-types` and reports nothing else — it looks like a
   harness failure, not a wrong interpreter. Put
   `export PATH=/Users/vadim/.nvm/versions/node/v24.13.0/bin:$PATH` at the top
   of every brief and every background run.
2. **Never pipe a test run into `head`.** `node --test ... | grep ... | head`
   makes `head` exit early, `grep` take SIGPIPE, and node BLOCK on stdout: the
   run sits at 0 per cent CPU forever and the harness eventually kills it with
   exit 144. Three runs were lost this way and read as "the file hangs now",
   which sent the diagnosis at the tests rather than at the pipe. Redirect to a
   file and grep the file.
3. **This machine is shared and the other tenants are invisible.** A second
   session was running cost measurements over `eslint/lib` in
   `/Users/vadim/rofl-modeljs` on `wip/curve`; `js-controlflow-values` went
   from about two minutes to over eight, with nothing in this tree changed.
   `git worktree list` and `ps` before quoting any timing — and note that a
   sibling worktree's `git add -A` is scoped to ITS worktree, so the danger is
   contention and not your working tree.
4. **EXIT 144 HAS TWO CAUSES AND THE FIRST DRAFT OF THIS ENTRY NAMED ONE.**
   Corrected 2026-09-09 after the other session said so: one of the kills was
   its `pkill -f test-concurrency`, which matched THIS tree's `js-directives`
   run as well as its own. So a run can die with 144 because of the pipe above,
   or because a neighbour's pattern was wider than its intent. Both look
   identical from inside — a test run that vanishes with no failure line — and
   the only way to tell them apart is that the pipe case sits at 0% CPU first.
   If you `pkill` on this machine, match your own scratchpad path, not a flag
   every session's node shares. **A wrong cause in a handoff is worse than no
   entry**, which is why this correction is here rather than a quiet edit.

**Budget the integration, not the authoring.** Merging cost nine hunks and ten
failing tests, of which six were pins and **four were real** — and three of the
four were defects that PREDATED the parallel work and were found by a fresh
reader leaning on a claim somebody else had written. That is the strongest
argument for doing it again.

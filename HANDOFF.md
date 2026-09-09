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

**THE ENGINE HAS A SPACE WALL, AND THE FIRST TWO ESTIMATES OF HOW CLOSE WE ARE
WERE BOTH WRONG.** `DEFAULT_SPACE` is **500 000 ROWS** (src/engine.ts), and
`Rofl`'s constructor takes no `space` option, so it cannot be raised from the
public API. Found the hard way: two mutants of the per-layer cost gate stopped
fitting and came back `$rule(...)/space_exhausted` instead of a cost, which is
what forced the `has_return` repair — the saving was not the reason.

**MEASURED 2026-09-09, and the number is 53%.** `peakRows` on the merged
control-flow world is **266 505** against 434 149 facts — a rows-per-fact ratio
of **0.614** — so the world sits at **53.3% of the wall**.

Both earlier figures were wrong and in opposite directions, which is why this
paragraph exists rather than a corrected number:
- **87% was mine**, and it was wrong because I read the wall as facts when it
  counts ROWS. A ceiling in one unit and a measurement in another.
- **44% came from the peer session**, correctly measured at 0.507 rows/fact on
  *its* workload and correctly caveated as not transferring unmeasured. It does
  not transfer: this rule set runs 0.614, twenty per cent denser.

`peakRows` is on `Evaluation` and NOTHING on the public surface reports it —
reaching it takes wrapping `newEval`. So the only routine signal remains a
probe that stops fitting, and that is the part worth fixing. **Owner's to
decide**, and the decision is now against a measured number rather than two
guesses.

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
  **DO NOT pass `--test-concurrency` on a SINGLE-FILE run** — this advice used
  to say the opposite and it is now wrong twice over. Node's concurrency is
  across FILES, so with one file the flag bounds nothing; and the flag string is
  the readiness check below, so a targeted run carrying it reads to every other
  agent as a resident full suite and the whole fleet waits on nobody. Run one
  file plainly. Bound the parallelism of a FULL suite if you must bound
  anything.

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
node --experimental-strip-types --test --test-reporter=spec test/<one>.test.ts
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

   **AND THE THIRD OCCURRENCE OF THE MOVING-COMPARISON RULE HAPPENED FOUR
   HUNDRED LINES BELOW THE PARAGRAPH THAT RECORDS IT.** 2026-09-09, in
   `test/js-layer-cost.test.ts`: MUTANT C' compares a live firing share against
   `6.593`, which is the BASELINE's firing share written down as a literal. A
   census moved the baseline to 6.712 and C' went red at 6.399 — still catching
   its mutant, by 0.313 pp instead of 0.288, but against a reference that had
   drifted out from under it. Two moving numbers again, with one of them only
   LOOKING still because somebody had copied it.

   The note beside that assertion already recorded two prior occurrences, both
   on `perFiring`; this is the third and the first on `firingShare`. **So the
   record has now failed three times to prevent the thing it records**, and the
   answer was never going to be a better-written warning. The repair is to
   COMPUTE the reference in the same run — measure the baseline world's share
   alongside the mutant's and assert the delta against a band — so that nothing
   is written down which the corpus can move, and a census moves both sides
   together.

   The general form is the one worth carrying out of this file: **a rule that
   has been read, re-recorded and still not applied is asking to be made
   structurally impossible to violate.** Restating the literal is a stopgap and
   leaves the mechanism intact for a fourth time.

   **A MUTANT'S ORACLE MUST KNOW WHICH HALF OF A UNION IT IS REMOVING.**
   2026-09-09: MUTANT M16 deletes the `pattern_accessor` arm of
   `eff_hidden_call` and asserted the relation EMPTIES. It does not —
   `eff_hidden_call` is a union of two arms and the iterator's `next` survives,
   three rows, exactly `pattern_next`. The oracle knew less about the relation
   than the relation did. Rewritten as an identity instead of a number:

   ```
   eff_hidden_call  ==  pattern_next      (only the iterator hop remains)
   pattern_next     >   0                 (the surviving arm has rows)
   base: eff_hidden_call > pattern_next   (the removed doors were the difference)
   ```

   That is stronger than `=== 0` would have been EVEN IF ZERO HAD BEEN RIGHT: it
   says which doors went and that the rest stayed, and it cannot be satisfied by
   the relation merely vanishing. The same move as preferring a named set to a
   count, applied to a mutation oracle.

   **A MUTANT THAT REMOVES A RULE MUST BE JUDGED FROM DOWNSTREAM, NEVER FROM THE
   RELATION IT REMOVED.** Same session, mutant `d14b`: it deletes the
   `pattern_next` rule and then QUERIES `pattern_next` — asking the deleted rule
   whether it was deleted. The shared `q` refuses correctly with "nothing in
   this world can populate it", which is `unpopulatable` doing its job. Judge it
   by what downstream LOST — here the three edges — not by the hole itself.

   **AND THE WARNING'S PROXIMITY DOES NOT HELP, WHICH IS THE ARGUMENT FOR
   STRUCTURE.** This exact bug had been found, fixed and COMMENTED in the c2
   census mutant twelve lines away, earlier in the same session, by the same
   author — and was then written again in another section of the same file. Put
   it beside the C' entry above, where the moving-comparison lesson was
   violated four hundred lines below the paragraph recording it, and the pair
   says something neither says alone: **a lesson placed near the code does not
   prevent its own repetition.** Four hundred lines and twelve lines fail the
   same way. That is the case for making a rule impossible to violate rather
   than for writing it more prominently.

   **AND ALL THREE REDS OF THAT SESSION WERE ORACLES, NOT RULES** — worth saying
   plainly, because the green line at the end otherwise implies the tests were
   right first time. C' compared against a frozen copy of a moving number; M16
   asserted a union empties when one arm goes; the c2/c5 census mutants would
   have queried a relation whose only rule the mutant deletes. Each was a test
   knowing less about its subject than the subject did. That is the better
   direction to fail in, and three in one session still says where the next hour
   of review belongs.

   **A FIFTH, from the other session 2026-09-09 and the most disguised of them:
   TWO COUNTERS WRITTEN BY THE SAME LINE OF CODE CANNOT CHECK EACH OTHER.** A
   test there compared `asserted_by` against `in_perspective` and read as a
   per-fact coverage check for months. It was a PAIRING check: it verified the
   kernel emitted two rows TOGETHER, never that it emitted one per fact. It was
   found only by deleting one of the two relations and being forced to ask what
   the test had been protecting. The resemblance to a real invariant is very
   good, and the tell is provenance rather than shape — ask which code writes
   each side.

   **AND THE TEST IS NOT "THE SAME CALL SITE", WHICH IS WHERE THE FIRST DRAFT
   OF THIS ENTRY WAS TOO COARSE.** Corrected by the session that found it: two
   counters written by one LINE is the strong case, but two written by one
   FUNCTION is not automatically a tautology — a function that computes two
   values independently and returns them together can still have them check
   each other. **The test is whether one value can move without the other**,
   not whether they share a call site. In the instance that produced this
   entry, `factMetaFacts` emitted both from a single return and both were built
   from the same `persp`, so neither could move alone; that is what made the
   agreement empty, and it is the property to check rather than the co-location
   that suggested it.

   **AND NEXT TO EVERY PIN, WRITE THE ALARMING SHAPE AND WHAT TO TURN OFF.**
   Also 2026-09-09, from both sides at once. A pinned number is only worth
   having if the reader knows which delta should alarm them: the other session
   moved 70/60/139 -> 63/54/129 and the useful part was that it was UNEVEN
   across three worlds, where the previous move had been a uniform +4 — uneven
   meant per-fact, uniform meant per-rule, and three worlds did the work.

   That technique does not generalise and the second one does. Here the guard
   `not one function reaches the top of the lattice because of an ambient call`
   went two -> six, and two-to-six is two-to-six whether one contributor moved
   it or four did; no resolution of the number contains the answer. It was
   separated by DISABLING ONE RULE INSIDE THE PACK and re-measuring three
   worlds: pack out — two; pack in with that one rule disconnected — two; pack
   in whole — six. So write both: what delta means re-measure-and-accept, and
   **which single contributor to turn off to find out who moved it.** The
   second is what ends the investigation, and it is always available where
   counting worlds is a lucky property of a fixture.
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

**Five operational traps, all paid for on 2026-09-08/09 and none of them
about the model.**

1. **The suite needs node 24 and the default node here is 20.** `npm test`
   under node 20.20.0 dies with `node: bad option:
   --experimental-strip-types` and reports nothing else — it looks like a
   harness failure, not a wrong interpreter. Put
   `export PATH=/Users/vadim/.nvm/versions/node/v24.13.0/bin:$PATH` at the top
   of every brief and every background run. **AND THE ATTESTATION DOES NOT
   CATCH THIS** — walked into again on 2026-09-09 after this entry was
   written: the fingerprint says `TREE STILL — result valid` (true, the tree
   did not move) and the completeness awk said `suite whole` over a five-line
   output with no counts in it, because its identity held vacuously on unset
   variables. CLAUDE.md's ritual now has two arms in front of the comparison;
   the entry stays here because the trap is the interpreter and the repair is
   only the alarm.
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

5. **NOTHING RUNS BELOW ABOUT 100 MB FREE, AND THE KILL LOOKS LIKE A FLAKE.**
   Measured 2026-09-09 by the other session and confirmed here at the same
   minute: four subagents each told to attest with a FULL suite is four runs at
   `--test-concurrency=availableParallelism`, which is four times the
   parallelism this box has. Load 44, free memory 6 MB, and the neighbour's
   single `npm test` was OOM-killed with **no output past its first line**. A
   truncated log with no failure line is a kill, not a flake, and reading it as
   one sends the diagnosis at the tests.

   Check before LAUNCHING, and wait rather than start:

   ```bash
   psize=$(vm_stat | sed -n '1s/.*page size of \([0-9]*\).*/\1/p')
   free_pages=$(vm_stat | awk '/Pages free/{gsub(/\./,"",$3); print $3}')
   echo $(( free_pages * psize / 1048576 )) MB free      # floor: 400 MB
   ```

   **READ THE PAGE SIZE, DO NOT ASSUME 4096 — THE FIRST TWO DRAFTS OF THIS
   ENTRY DID.** Caught 2026-09-09 by an agent running under the rule: `vm_stat`
   on this machine reports `page size of 16384 bytes`, confirmed against
   `sysctl -n hw.pagesize`. So the hardcoded 4096 understated free memory by a
   factor of four and printed a figure labelled MB that was not MB. The floor
   is restated here in real megabytes — **400 MB** — which is the same physical
   amount everyone was quoting as "100" under the wrong constant, so no
   measurement taken today is invalidated, only mislabelled.

   That is the whole hazard in one line: **the rule was self-consistent and
   therefore worked**, because every party used the same wrong constant and
   compared like with like. **AND "THE OUTSIDE WORLD" IS THE WRONG WAY TO SAY
   IT** — sharpened by the other session, whose formula was the thing this got
   compared against: two instruments agreeing is evidence only when they are
   INDEPENDENT, and two copies of one constant are one instrument. Had both
   sessions hardcoded 4096 it would still be running today. That single
   sentence covers this, the paired counters above, and the effect-lattice pin
   below — in all three the agreement held for a reason unrelated to the thing
   being checked.

   The cheap general move falls out of it: **never hardcode a constant the
   system will tell you.** `vm_stat` prints its page size in its own header.

   **AND THE DIRECTION OF THE ERROR WAS ITSELF CONTESTED, WHICH IS WORTH
   RECORDING BECAUSE IT IS WHAT THIS CLASS DOES TO THE PEOPLE FIXING IT.** The
   other session read the same defect as making the floor four times LOWER —
   "wait if under 100" really meaning 25 MB, a guard set below the danger. It
   is the other way: multiplying by the smaller constant yields the smaller
   number, so the naive print UNDERSTATES free memory and a printed 100 is 400
   real MB, a conservative floor that costs throughput and nothing else.
   Settled by computing it rather than by arguing it:

   ```
   pages free 4196 -> naive 16 "MB", real 65 MB
   a printed naive 100 -> 25600 pages -> 400 real MB
   ```

   Two sessions, both correct about the defect, opposite about its sign. A unit
   error does not only mislead the reader of the log; it misleads the repair.

   **AND FREE MEMORY IS THE WRONG QUANTITY — MEASURE THE CONDITION ITSELF.**
   The strongest correction of the day, from the other session, and verified
   here rather than taken: the three points we had do not describe a threshold.

   ```
     14 MB free, KILLED     (two full suites resident: theirs + this fleet)
     83 MB free, HEALTHY    (one full suite, mid-run, finished clean)
   3295 MB free, START      (one full suite, nothing else)
   ```

   The 14 and the 83 are not on one axis. What killed the run was not a LEVEL —
   it was that TWO FULL SUITES WERE RESIDENT AND THE BOX FITS ONE. Free memory
   at launch is a proxy for "is anybody else already on this machine", and a bad
   one, because it is confounded by everything else the machine happens to be
   doing. So read the condition directly:

   ```bash
   ps ax -o pid,args | grep -c '[t]est-concurrency'     # >0: another suite is resident, wait
   lsof -p <pid> -a -d cwd                              # ...and whose, by worktree
   ```

   It needs no constant and no page size — which is the point, after that
   constant was wrong twice in one afternoon — and it would have made all four
   of today's calls correctly: the kill (fleet resident), two refusals at 383
   and 61 (fleet resident), and the healthy 83 MB run (nothing else resident,
   correctly allowed).

   **THREE LIMITS, MEASURED HERE while the other session's suite was running,
   because a check adopted without its edges is the next entry in this list.**
   1. It matches the WORKERS, not the parent: seven processes, every one
      reading `--test-concurrency=0`, and nothing with the parent's non-zero
      value. So there is a startup window in which a suite is resident and the
      count still reads 0.
   2. **A TARGETED RUN DOES NOT MATCH, AND THAT IS A FEATURE.** `npx tsx --test
      test/x.test.ts` carries no such flag, so the check sees full `npm test`
      runs specifically — the expensive ones. Do not "fix" it into matching
      every node process.
   3. **`--test-concurrency` IS NOW DOING THREE JOBS AND THEY COLLIDE.** Found
      by an agent reading limit 2 above and checking it against its own
      commands rather than believing it: it had been iterating with
      `--test-concurrency=2` **on this file's own former advice**, so its
      TARGETED runs matched the readiness pattern and would have read to
      everybody as a resident full suite — a fleet waiting on nobody. The same
      string is also the `pkill` pattern that killed an unrelated run in trap 4.
      One flag is now a throttle, a kill pattern and a readiness signal, and
      each use makes the others wrong. The advice above is corrected; if you
      find yourself reinstating the flag on a single-file run, this is why not.
   4. It sees SUITES ONLY. A cost measurement building a large world is
      invisible to it and can be the heaviest thing on the box. Free memory
      stays as a BACKSTOP for that, demoted from primary gate.

   **AND THE CHECK MAKES A THUNDERING HERD IF EVERY WAITER TRUSTS ITS FIRST
   ZERO.** Four agents plus a neighbour all monitoring one count means they
   launch in the same instant it clears — two full suites resident, which is
   precisely the condition the check exists to prevent. The fix for
   oversubscription becomes the cause of it. Do not launch on the first zero:

   ```bash
   sleep $(( (RANDOM % 50) + 10 ))                    # 10-60s, per waiter
   ps ax -o pid,args | grep -c '[t]est-concurrency'   # must STILL read 0
   ```

   The JITTER is what makes the second reading informative — without it every
   waiter re-checks in the same instant and all of them see the same zero. This
   applies to the FULL SUITE only; targeted single-file runs are cheap and, with
   the flag dropped, do not match the pattern at all.

   **AND THE PROTOCOL IS PROBABILISTIC, NOT EXCLUSIVE — stated here rather than
   left to be discovered**, which is what this file asks of every gate it
   records. There is a second window the jitter does not close: the gap between
   a waiter's check reading 0 and its own suite becoming visible in `ps`, since
   node takes a moment to spawn. A second waiter checking inside that gap sees
   0 legitimately and fires. The jittered re-check narrows it to two agents
   landing in the same few hundred milliseconds TWICE, which is why it is not
   worth solving — but if a collision does happen, THAT is the mechanism, and
   the first suspicion should not be that somebody skipped the jitter.

   The general form, and it is why this replaced the number rather than
   refining it: **a provisional number invites someone to measure it more
   precisely; a named proxy invites them to measure the right thing.**

   **AND 400 IS NOT A MEASURED FLOOR — IT IS AN ARBITRARY NUMBER IN CORRECTED
   UNITS.** Stated here so the next reader does not find a bare 400 and assume
   somebody measured it. "100" was invented while the units were believed to be
   MB, on no measurement; converting it preserved an arbitrary number's
   physical value, which is not the same as choosing a floor. TWO POINTS EXIST:
   a kill at 14 real MB, and a healthy suite sitting at 83 real MB mid-run.
   Nothing in between. So the floor stands about five times above the highest
   observed healthy steady state and about twenty-eight times above the only
   observed kill.

   Its first real use was refusing the other session's suite at 383 MB, which
   is very likely a FALSE POSITIVE by that arithmetic — the guard-that-fires-on-
   correct-behaviour this file warns about two paragraphs up, arrived at from
   the opposite direction. It has NOT been lowered on that, because two points
   do not locate a floor and the experiment that would (start suites at
   successively lower free memory and find where they die) costs the machine
   the queue is for. Left provisional, with the provenance visible, so it can
   be set from evidence rather than from inheritance.

   **AND TWO RULES FROM THE OTHER SESSION THAT OUTLIVE THE NUMBER**, both
   arrived at by it getting the sign wrong in the same message in which it
   correctly named the class:

   - **A claim about DIRECTION is a claim about ARITHMETIC, and arithmetic is
     cheap.** It asserted an inversion without running two multiplications, in
     a message whose whole subject was a constant nobody had run. Actionable
     where "verify peers" is not, because nobody verifies every time and
     everybody can multiply twice.
   - **A peer with a good track record is a MORE dangerous single instrument
     than one with a bad one**, because the prior does the work the check
     should have done. It had been right about the start-check and right about
     the paired counters; that record is exactly what made a third, wrong claim
     credible enough to act on. The symmetric half is also true and was
     conceded on this side: the inversion was checked only because the subject
     was obviously arithmetic. A direction claim about something less obviously
     numeric would have been taken.

   **IT IS A START CHECK AND NOT A RUN CHECK, and the first draft of this entry
   got that wrong.** Corrected within the hour by the other session, which was
   running under it at the time: its suite STARTED at 3295 MB free, passed the
   floor honestly, and sat at 83 MB mid-run — because eight concurrent node
   processes ARE the consumption. An agent that re-checks mid-run stops on its
   own footprint every time. So the number is headroom for OTHERS at the moment
   of launch, never a live invariant. Written the other way it is a guard that
   fires on correct behaviour, which is the kind this file records getting
   switched off within a week.

   **AND IT IS A CORRECTNESS RULE, NOT A COURTESY ONE.** A suite that SURVIVES
   under swap pressure is still a suite measured under swap pressure, and this
   file's whole attestation argument is that a green count from a bad run is
   indistinguishable from a green count from a good one. The tree fingerprint
   answers "did the tree move", the completeness check answers "did the run
   finish" — neither was ever asked "did the machine have room", and their
   confident output reads as though one of them had. Ask it.

   For a fleet: targeted test files during development, the full suite ONCE at
   the end, and stagger the ends.

**PICKING WORK BY READING THE PROSE INSTEAD OF THE RELATION — and it was the
integrator who did it.** 2026-09-09: a wave of four briefs was assembled by
grepping `work(w_..., "...")` and treating a description that does not begin
"DONE" as an open item. The authority is `work_state/2`, and it disagrees:
**67 items are `done` while only 51 say so in their prose**, so sixteen are
closed and do not advertise it. Two of the four briefs went out against items
already `done` at HEAD — one of them three items at once.

The agent that got them verified rather than assumed, found `work_state` =
`done` for all three, `open_cell[audit]` = 10 with none of the ten its own, and
`false_done`/`queue_stale`/`orphan` all zero — then re-ran every load-bearing
claim in the notes instead of inventing work. THAT is the correct response to a
brief written against a stale reading, and it is the reason the error cost
little.

```bash
# the only correct way to pick an item
grep -o 'work_state(\([a-z_]*\), open)' facts/worklist.rofl
```

**AND THE JOKE IS ON THE WHOLE REPOSITORY**: this file and CLAUDE.md argue at
length that a claim must be a ROW rather than a sentence, that a count is not a
set, and that a note is not a measurement — and the queue was read by its
sentences by the person writing the briefs. A relation that exists and is not
consulted is exactly as good as one that does not exist.

**THE HONEST OTHER HALF, because it cuts the other way and matters more.**
Re-measuring a `done` item was NOT wasted on either branch. The destructuring
item was also `done`, and re-running it produced the `pattern_accessor` blind
spot, the generator door, nine rows across three doors, and two new owned
items. "Done" means the item's own question was answered, not that the ground
under it stopped moving. So the fix is to pick from `work_state`, not to stop
revisiting closed items — and a re-measurement of a closed item should be
ENTERED as its own item rather than reopening the old one.

**Three operational findings from that agent, all confirmed here before being
written down.**

1. **A WORKTREE WITHOUT `node_modules` FAILS TWO `js-modules` TESTS AND THEY
   READ AS RESOLVER DEFECTS.** 42/2 without, 44/0 with a symlink to the main
   checkout's, reproduced at HEAD with the branch reverted. Confirmed here that
   agent worktrees differ in whether the symlink exists. The oracle is right to
   distinguish `OUTSIDE` from `THROWS MODULE_NOT_FOUND`; the repair is the
   environment. **This matters because every brief in that wave said "seven
   failures are pre-existing and an eighth is yours"** — which would have sent
   a worktree agent hunting a resolver bug that is a missing symlink. Say
   instead: an eighth failure is yours UNLESS it is in `js-modules`, in which
   case check for `node_modules` first.
2. **`npm run measurecheck` EXITS 1 ON AN HONEST CHECKOUT** — verified here at
   `001b849`: 2 rates stated without conditions, 4 decisions with no refuter.
   It is NOT in `npm test`, so it is red and ignored, which is precisely the
   state CLAUDE.md forbids for a gate.
3. **EXIT 144 HAS A THIRD CAUSE: a run killed deliberately by its own agent for
   fleet courtesy.** Two of them today. Indistinguishable from the pipe case
   and the neighbour's-`pkill` case from inside the log — and a wrapper script's
   own `exit=0` echo is not the suite's exit code, which is how it hides.

**Budget the integration, not the authoring.** Merging cost nine hunks and ten
failing tests, of which six were pins and **four were real** — and three of the
four were defects that PREDATED the parallel work and were found by a fresh
reader leaning on a claim somebody else had written. That is the strongest
argument for doing it again.

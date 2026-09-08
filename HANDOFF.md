# HANDOFF — the model-coverage loop on `modeljs`

Written 2026-09-08 by the nightly loop (iteration 31). The tree is **green** apart from the
seven pre-existing failures named below. Everything here is measured unless it
says otherwise.

## Where the loop is

Branch `modeljs`. The kernel from `nextver` is merged (4.8x faster per world,
40 relations identical row for row). Iterations 27, 28 and 29 are landed.

Coverage in the five-pack world (`test/worklist.test.ts`):

```
KIND x LAYER   320 cells = modelled 109 + waived 176 + not_modelled 35
  answered (modelled | waived):  285 / 320 = 89.1%
  MODELLED only:                 109 / 320 = 34.1%

open_cell[audit] 10, every one owned BY NAME — `sweeper` 0 at all four layers,
`cell_blocked` EMPTY for the first time. 51 work items.
  callgraph  open 4, claimed 14      dataflow  open 1, claimed 8
  modules    open 5, claimed 5       controlflow open 0, claimed 12
```

## What the last three iterations delivered

**27 — the for-of iterator protocol** (`r_iterator_protocol`). One node, two
calls. Only the first hop goes through `resolves`; the second goes straight to
`calls`, because `ambiguous_call[audit]` reads two answers at a site as an
over-approximation and here both calls are true. Measured both ways: through
`resolves` it takes `ambiguous_call` 8 -> 9.

**28 — a suspension may not resume** (`r_suspension`). The layer WAIVED
`suspend` with the reason `a_control_returns_so_the_site_still_runs`, which is
a claim about the PROGRAM: control returns only if the promise settles. A
fixture that suspends forever reddened the acceptance gate before a rule
existed. Also: one of the three recorded "host calls" was a missing `.replace()`
in the oracle harness, not a limit of V8.

**29 — the scanner's contract** (`r_template_key`, `r_template_lit`). See below.

## THE PATTERN THAT HAS NOW PAID FOUR TIMES

Every one of these was a sentence that was TRUE, written down accurately, and
then read as a constraint rather than as a setting:

- a getter's "V8 attributes the frame to the property access" — a missing
  `.replace()` on one of two doors out of the same function;
- a waiver's "control returns so the site still runs" — true of an await that
  settles, and the corpus had only those;
- "a dynamic import suspends" — it does not; it evaluates to a promise;
- "the scanner emits scalar own properties only, so a template's text never
  becomes a fact" — true, and the contract excluded EXACTLY ONE property in the
  whole of JavaScript. Four cells sat behind it for three sessions.

**So: when the model says it cannot, go and measure how far it is from being
able to.** The measurement is usually a thirty-second probe and it has been
wrong four times out of four.

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

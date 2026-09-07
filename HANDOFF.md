# HANDOFF — branch `nextver`, 2026-09-07

Written for whoever picks this up on another machine. It says where the branch
stands, what the numbers mean, and what the next moves are with enough detail
to start without re-deriving anything.

## 0. Read this first: the numbers are machine-relative

Every absolute figure in `facts/findings.rofl`, in code comments and below was
measured on:

```
4 cores · Intel Xeon @ 2.10 GHz · 15 GB RAM · node v22.22.2
```

**Relative comparisons survive a machine change; absolutes do not.** Every A/B
in this session interleaves its arms in one sitting, so "19%" stays 19% on any
machine. But `72.8 ms a clause`, `0.51 us per fact`, `138 s for the suite` are
properties of that Xeon. On a faster machine they will all move together, and
a reader who compares a fresh number against a recorded one will see what looks
like a regression and is not.

So: when you re-measure something recorded here, re-measure **both arms**.
Never compare a new number against a stored one across machines.

Measured for the same reason, in case the next machine choice is open: the
suite is 234 s of CPU finishing in 138 s of wall clock on 4 cores — 1.7x, not
4x, because it is tail-bound (node parallelises by FILE and the longest single
test is 24.3 s). **More cores buys very little; a faster single core buys
roughly everything**, since the suite floor, `tsc`, every A/B arm and every
ring 1 parse are single-threaded.

## 1. State

Branch `nextver`, four commits this session on top of the previous head:

```
5b8c43d  a model of the join, and it named a rule worth 19%
255fc3d  a ledger is where you reason, not who you are about
3cff6f4  a fork's arrival order was an accident, and the port paid 7x for it
1600a13  the grammar is a file the kernel can drop; the lexis is not
```

Working tree clean. Node suite **1011 tests / 1003 pass / 8 fail** — the eight
are the branch baseline, red since the branch's first commit and untouched:

```
goof   a rule uniform in the ledger is no leak, and the audit still bites
goof   substituting the ledger away derives the same facts, at nine times the rules
heck   every boot.rofl audit over HECK is empty
loot   forgetting a book fades what stood on it, and restores what it displaced
npc    boot.rofl's own audits over NPC's reflection are all empty
npc    one polymorphic carry rule carries ten separate journals, and leaks nothing
sus    the ticked store and the as-of store agree, on the facts and on the counts
yak    04 false miss — the same question, two instruments, opposite answers
```

Four of them read `leak: 1` where the test expects `0`. That looks like ONE
cause in four places rather than four causes, and nobody has checked. Bun's CI
job carries a baseline of 24 failures, also unchanged.

## 2. How to work here

```
npm test                      # node only. 138 s. Run ONCE before reporting.
node --test test/x.test.ts    # what to run while iterating — this is the rule,
                              # and I broke it three times today at 138 s each
npx tsc -p tsconfig.json
npm run grepcheck             # kernel closed-vocabulary gate
npm run findings              # the backlog; run before ending a session
npm run evalcost              # NEW — model the join for one ring 1 clause
npm run whyjoin               # the derivation over it
npm run parsecost             # the older, outside-the-parse cost model
```

Do not run `bun test` locally (295 s against node's 138). Bun has its own CI
job; both runners must be green *in CI*, which is not the same instruction.

After every push, verify the Actions run for the commit. Local green is not
green.

## 3. What landed today

**The grammar is droppable as a file; the lexis is not** (`1600a13`).
`Lit`/`Clause`/`BodyElem`/`Temporal` moved to `src/unify.ts`; the tokenizer
split into `src/tokens.ts` (78 code lines); `src/parser.ts` is 174 lines of
pure grammar that nothing in the kernel enters. Proved by DELETING the file:
`npm run noparser` runs two mutants — without `parser.ts` the kernel
type-checks, without `tokens.ts` too it fails naming `src/reflect.ts` (the
control). A second host writes the lexis plus `examples/ring1/l0.ts` (15
lines) and the grammar travels as ROFL.

**A fork's arrival order was an accident** (`3cff6f4`). Answered by breaking
it everywhere rather than reading call sites: with `allFacts` globally
reversed the suite goes 8 -> 13 fail and all five new reds assert the ORDER
itself — no fixpoint, no `canonicalState`, no golden byte moves. So `clone`
now preserves the original's arrival order and `SqliteStore.renumberByKey` is
deleted: the port's fork went 20.7 -> 2.92 us/fact and now beats the in-memory
reference instead of losing to it 2.9x.

**A ledger is where you reason, not who you are about** (`255fc3d`). A long
detour — compound perspective terms, then perspectives as SETS with an
inclusion lattice — was ended by the owner in two lines: `alice tells` and
`bob tells` are one perspective `claims`, with the claimant as a column. The
rule now in `docs/choosing-perspectives.md`: **need to reason INSIDE a view
and it is a book; need only to record and compare what was said and the
speaker is an argument.** `goof` is the first (nine geometries, nine ledgers,
so incompatible theorems do not explode); alice and bob are the second.

**A model of the join** (`5b8c43d`) — see below, it is the live thread.

## 4. The live thread: `scanners/eval_cost.ts`

A rule body is a left-to-right nested loop join. `solveBody` carries an
accumulator and at each body position calls `matchPremise` ONCE PER ACCUMULATED
SOLUTION:

```
width(I)   partial solutions that reached position I
yield(I)   how many left it            width(I+1) = yield(I)
work of a firing = sum of the widths ; peak = what the row budget watches
```

The width is the ONLY quantity that can explode, because it is a PRODUCT of
the fan-outs before it. So the defect to look for is **multiply early, filter
late**, and it is a property of body ORDER.

The scanner wraps four `Evaluation` methods on the prototype for one run and
restores them, so `src/` carries no counter and no flag. Counting
`matchPremise` calls whose literal is `plan[i].lit` (by object identity —
`===`, because one relation can stand at two positions of one body) recovers
the width without reaching inside `solveBody`.

What it says about one 34-byte ring 1 clause, steady state:

```
140 rules fired, 9341 accumulator elements
  51% of them in 77 rules that CONCLUDE NOTHING
717 conclusions, 706 fresh -> re-derivation is 1% (I had assumed it was the waste)
83 of 140 rules are under 1% of total width — they cannot be the reason for anything
```

And the stage split, which redefines the optimisation budget:

```
restore    6.60 ms  23%   rebuilding the world from the image, per clause
load      18.72 ms  66%   <- the fixpoint lives here
holes      3.07 ms  11%   one query over an EMPTY relation
evaluate   0.02 ms   0%   load already reached the fixpoint
```

### What it already found

`dollar_before` read backwards from every position of the source and filtered
to nothing at its fourth premise: 1881 accumulator elements, ZERO conclusions,
20% of the parse's whole join work. Rewritten to start from the rare thing
(`kind(J, dollar)`) and compute the position forward: 101 elements. Three
interleaved arms on an 88-byte clause, **89.5 ms -> 72.8, 19%**, arms never
overlapping. `planBody` cannot do this: `J is I - 1` needs I bound so `at(I)`
had to lead, and only INVERTING the arithmetic frees the rare premise — a
rewrite of the rule, not a permutation of its body.

### The trap that nearly became a headline

The first version of the scanner measured the world BUILD along with the
parse, because `parse(src, fromImage(image()))` evaluates its argument inside
the window. Seven of the eight heaviest rules came out as `safety.rofl` and I
was one paragraph from reporting "a third of every parse is the kernel
checking itself". Artefact: `safetyMemo` is module-level and keyed by a hash
of the rule ids, so the check runs once per process. The recorded 2.7% price
of the two-stage bootstrap stands.

## 5. Next moves, in the order I would take them

1. **The other 76 barren rules.** One rule was worth 19%; `npm run evalcost`
   then `npm run whyjoin` names the rest. Same treatment: find the rare
   premise, see whether the arithmetic can be inverted to let it lead. This is
   the highest known-yield work on the branch.
2. **`holes` costs 3.07 ms per clause** — a query over an empty relation, 11%
   of a parse. Nobody has looked at why. `parse` asks `hole(R, Reason)` to
   check the evaluation finished, and `r.evaluate()` already returns `partial`.
   Either the query is doing demand work it need not, or the check is
   redundant. Cheap to find out.
3. **`restore` is 23% per clause** — the image restore in `parseFile`. Known
   and recorded ("the image earns its keep, 22%"), never revisited since the
   structural clone landed.
4. **The eight baseline failures**, with the `leak: 1`-in-four-places
   hypothesis above as the first thing to test.
5. ~~**Two files loaded together both writing `[main]`**~~ — BUILT 2026-09-07
   as `widened[audit](Rel, P)` at the end of `boot.rofl`, exercised by
   `examples/aka` §9 and gated by `test/widened-negation.test.ts`. Three
   rules, no kernel change: "more than one loader" is `asserted_by`'s
   second argument with `$kernel` subtracted, and the negation's BOOK comes
   from `premise_lit(R, _, $not($lit(Rel, P, _, _)))`. `perspExplicit` was
   NOT needed — it belongs to the file-local-default half, which the finding
   deliberately did not choose. 0 rows over 19 example worlds; the liveness
   case is constructed, because the corpus has no collision of this kind.
   See `f_the_loader_the_kernel_records_is_the_author_not_the_file` and
   `f_no_two_files_in_this_corpus_ever_widened_a_negation`.

## 6. Ledger

`npm run findings` — 214 open, 153 settled. The ones this session added or
closed, by id:

```
f_the_grammar_is_droppable_as_a_file_and_the_lexis_is_not
f_a_census_with_a_hand_written_file_list_was_already_blind
f_arrival_order_is_not_meaning_and_the_fork_now_preserves_it
f_a_forks_key_order_is_an_accident_of_restore              (addressed)
f_a_ledger_is_where_you_reason_not_who_you_are_about
f_a_book_name_that_carries_its_owner_belongs_to_the_host   (DISMISSED — premise dissolved)
f_two_files_writing_one_book_is_scoping_not_naming         (ADDRESSED 2026-09-07)
f_the_join_width_is_the_only_quantity_that_can_explode
f_i_measured_the_world_build_and_called_it_the_parse
f_half_a_ring1_parse_concludes_nothing_and_one_rule_was_a_fifth_of_it
```

`rules/parse-cost.rofl` is **stale in one place**: it derives the slowness
from `relAll`, measured when the reuse cache was on and fingerprinting whole
relations. With the cache off the evaluator examines **1.4 candidate facts per
premise match** (counted: 8938 calls, 12071 candidates), so there is no scan
to remove. The cost is per-match machinery over many matches, not per-match
search. `rules/eval-cost.rofl` is the current reading.

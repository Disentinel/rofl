# HANDOFF — the model-coverage loop on `modeljs`

Written 2026-09-07 by the session that finished iteration 27 and converted the
pins. The tree is **green** apart from the seven pre-existing failures named
below. Everything here is measured unless it says otherwise.

## Where the loop is

Branch `modeljs`. Iteration 27 — `w_cg_invisible_calls`, the FOR-OF half — is
landed: the iterator protocol derives, the cell is closed, the claim is retired.

Coverage in the five-pack world (the one `test/worklist.test.ts` builds — the
only world that loads every layer):

```
KIND × LAYER   320 cells = modelled 105 + waived 178 + not_modelled 37
  answered (modelled | waived):  283 / 320 = 88.4%
  MODELLED only:                 105 / 320 = 32.8%

  callgraph    80: modelled 28, waived 34, not_modelled 18  -> 78%
  controlflow  80: modelled 25, waived 50, not_modelled  5  -> 94%
  dataflow     80: modelled 45, waived 30, not_modelled  5  -> 94%
  modules      80: modelled  7, waived 64, not_modelled  9  -> 89%

open_cell[audit] 14, EVERY ONE OWNED BY NAME — `sweeper` is 0 at all four
layers. 3 irreducible. 50 work items. `next_work[audit]` = w_cg_invisible_calls
```

Read those three numbers as three different claims. `waived` means "this kind
cannot participate in this layer, and here is the reason" — a real answer with
an audit behind it, but not a model. The denominator is the vocabulary this
model declares (80 kinds), not JavaScript.

## What iteration 27 delivered

**`r_iterator_protocol`** — `for (x of E)` is a TRANSFER SITE, and the model now
derives both calls the grammar hides: `E[Symbol.iterator]()` and then `next()`.

**THE DESIGN FORK, and it is the part to carry forward.** A for-of is ONE node
and TWO calls. `ambiguous_call[audit]` reads a site with two answers as an
over-approximation that must be visible — exactly right for a callee POSITION,
exactly wrong here, because both calls happen. So only the first hop goes
through `resolves`; the second goes straight into `calls`, where two callees
from one statement is an ordinary fact. Measured both ways: through `resolves`
it takes `ambiguous_call` 8 → 9. Mutant `h1` makes the fork observable rather
than leaving it in a comment — delete the `resolves` arm and
`useIterable -> bump` SURVIVES.

**`key_name[code]`** in `rules/js-structure.rofl` — the name a key stands for,
written once where four rules had `ast_name` on a key and all four were blind to
a computed one. A FIFTH reader was in the test harness: the babel census in
`test/js-callgraph.test.ts` computes `node.key?.name` and named the method
`<anon>`. No audit over the rules could ever have found that one.

**`frameName` is gated.** The V8 sweep that refuted the instrument's own comment
is two tests now, split by which half is ours: a table of raw string → name
(engine-free, so bun cannot argue with it) and a live invariant that no name the
oracle reports carries a bracket or a dot — which is what `iterator]` violated.
Re-swept on V8 12.4 and V8 14.0: identical, shape for shape.

**Six mutants, all killed, two dropped with the measurement** (section 3m of
`test/js-controlflow-values.test.ts`). Two of the six survived the first run and
BOTH were guards; both got a site in `shapes.ts.txt`. Read that section before
writing another guard — one of the two sites had to be rewritten because the
obvious spelling (`{ next: 1 }`) fails a premise BEFORE the guard, so the mutant
would have derived a byte-identical world for the second time.

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
- **Seven pre-existing failures**, not eight: `example-goof` ×2, `example-heck`,
  `example-loot`, `example-npc` ×2, `example-sus`. The previous handoff also
  listed `example-yak`; it passes here, on a faster machine. Any eighth is yours.
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

`next_work[audit]` still names `w_cg_invisible_calls`, and it now holds only
cells that **cannot close on the instrument this loop has**: `await_expression ×
callgraph` (V8 attributes the `.then` to the promise machinery, so a model
deriving it would be contradicted rather than confirmed) and `decorator` at both
layers (no node at all with the parser plugin off). Say that rather than closing
it.

**`w_computed_key_names` (40) is new and is the sharpest open thing.** One
premise — `ast_child(_, key, 0, K)` plus the `computed` attribute the scanner
already emits — answers both halves at once: `key_name`'s first arm names a
computed identifier key after the VARIABLE's spelling, which its own comment
forbids, and the same arm ranges over every named node rather than over keys,
which is most of this iteration's +0.55% rules cost. It needs a SITE first, and
the site cannot go in a runnable fixture — a method the model must not name is a
method the oracle would see run under a name nobody derived.

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

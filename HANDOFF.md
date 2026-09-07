# HANDOFF — the model-coverage loop on `modeljs`

Written 2026-09-07 by the session that ran iterations 23–27. The tree is **mid
iteration 27 and is RED**: the rules are finished and measured, the tests and
the ledger are not. Everything below is measured unless it says otherwise.

## Where the loop is

Branch `modeljs`. Last **green** commit is `dc93db3` (iteration 26); everything
after it in the working tree is iteration 27 and is described here.

Coverage as of `dc93db3`, measured in the five-pack world (the one
`test/worklist.test.ts` builds — the only world that loads every layer):

```
KIND × LAYER   320 cells = modelled 104 + waived 178 + not_modelled 38
  answered (modelled | waived):  282 / 320 = 88.1%
  MODELLED only:                 104 / 320 = 32.5%

  callgraph    80: modelled 27, waived 34, not_modelled 19  -> 76%
  controlflow  80: modelled 25, waived 50, not_modelled  5  -> 94%
  dataflow     80: modelled 45, waived 30, not_modelled  5  -> 94%
  modules      80: modelled  7, waived 64, not_modelled  9  -> 89%

of the 36 unanswered fine cells: 3 irreducible, 33 ours, of which 15 open work
```

Read those three numbers as three different claims. `waived` means "this kind
cannot participate in this layer, and here is the reason" — a real answer with
an audit behind it, but not a model. And the denominator is the vocabulary this
model declares (80 kinds), not JavaScript: `f_two_published_reductions_compose`
in the ledger counts the same thing as 146 structural classes × 7 layers.

## Iteration 27 — what is in the tree right now

Item: `w_cg_invisible_calls` (order 34), the FOR-OF half. Calls with no call
site. The tagged template closed in iteration 25; `await`'s `.then` is
permanently unverifiable (see below); the decorator has no node.

### Done and measured

1. **`test/fixtures/js-call/trace.mjs` — `frameName` strips a bracketed name.**
   Swept sixteen function shapes on Node 22 first, because the comment claimed
   `V8 gives Box.get, Object.hello, new Box` and this V8 gives none of those:

   | shape | V8 says | old last-dot rule |
   |---|---|---|
   | function / arrow / method / static / async / generator / bound / inherited | the bare name | unchanged |
   | `new Box()`, `new Sub()` | `Box`, `Sub` (no `new ` prefix) | unchanged |
   | a getter | `get acc` | unchanged |
   | `obj['a.b'] = fn` | `dotted.a.b` | `b` — still qualified, rule earns its keep |
   | a computed key | `[Symbol.iterator]` | **`iterator]` — corrupted** |
   | arrow passed to a host API | `null` | `<top>` |

   So the rule fires on exactly two shapes today and was wrong on one of them.
   Brackets are stripped first now: `[Symbol.iterator]` → `iterator`.

2. **`rules/js-structure.rofl` — `key_name[code](K, N)`,** the name a key stands
   for, written ONCE. Four relations read `ast_name` on a key (`fn_name` ×2,
   `member_value` ×3) and all four found nothing for a computed key, so the
   method had no name and no key at the same time. Guarded on `Symbol`
   deliberately: `obj[someVar]` has no static name and this must not invent one.
   `fn_name` and `member_value` read `key_name` now.

3. **`rules/js-callgraph.rofl` — the iterator protocol.**
   `transfer_kind(for_of_statement)`, then `for_of_iterates` + a `resolves` arm
   for the first hop, and a **`calls` arm for the second**.

   **THE DESIGN DECISION, and it is the non-obvious part.** A for-of is ONE node
   and TWO real calls. `ambiguous_call[audit]` reads a site with two answers as
   an over-approximation that must be visible — right for a callee POSITION,
   wrong here, because both calls happen. So only the `[Symbol.iterator]` hop
   goes through `resolves`; the `next` hop goes straight into `calls`, where two
   callees from one statement is an ordinary fact. Measured both ways: through
   `resolves` it takes `ambiguous_call` 8 → 9.

4. **`test/fixtures/js-call/alpha.mjs` — `bump`, `counter`, `useIterable`,**
   called from `main()`. The runtime reports `useIterable -> iterator` and
   `useIterable -> bump`, both attributed to the enclosing function.

Measured in the corpus world with the rules in place:

```
useIterable -> iterator   YES
useIterable -> bump       YES
edges 193 | ambiguous_call 8 | transfer_site 25 | unresolved_call 183
resolves 203 | for_of_iterates 1 | hole []
transfer by kind: for_of_statement 3, new_expression 19, tagged_template_expression 3
corpus kinds 74 | vocabulary_gap 0 | kind_absent_stale 0
```

### Left to do

- **A mutant set for the for-of.** Delete-mutant per literal; suggested targets:
  the `resolves` arm; `transfer_kind(for_of_statement)` (distinguished by
  `transfer_site` 25 → 22); the `calls` arm for `next`; the `Symbol` guard on
  `key_name`; the final `may_be_node` on the member's value. Two mutants losing
  the same row are ONE mutant until each has its own oracle — say so and drop
  one, with the measurement, rather than keeping a third that looks like cover.
  Put them in `test/js-controlflow-values.test.ts` (smallest of the three
  corpus-world files) beside section 3l.
- **A test for `frameName`,** if you want the sweep to be a gate rather than a
  comment. It has no test today; the sweep above is reproducible in ~10 lines.
- **Close the cells**: `for_of_statement × callgraph` in `facts/js-callgraph.rofl`
  (`unknown_because` → `handled(js, for_of_statement, callgraph, r_iterator_protocol)`),
  retire its `claim` in `facts/worklist.rofl` (an open item may not claim a shut
  cell — `queue_stale[audit]` says so within one run), update the item's note.
- **Findings** for: the V8 naming sweep refuting the instrument's own comment;
  four relations reading a key and all four blind to a computed one; the
  one-node-two-calls design fork.
- **Pins.** Expect ~15 to move across `test/js-callgraph.test.ts`,
  `test/js-controlflow*.test.ts`, `test/js-model.test.ts`,
  `test/js-fixpoint-cost.test.ts`, `test/worklist.test.ts`. This is the
  mechanical two-thirds; the fastest route is one full suite, then set each
  number from the reported `actual` **and write one line saying why it moved**.

## The rituals that are not optional here

- **`npm test` is the loop** (node only; bun is CI's business). ~13 min, 47 min
  CPU across four lanes. Attest every full run with a tree fingerprint AND a
  positive control — `bash` snippet in `CLAUDE.md`; a run over a moving tree is
  discarded, and that has caught a bad baseline once.
- **Eight pre-existing failures** are expected and unrelated: `example-goof` ×2,
  `example-heck`, `example-loot`, `example-npc` ×2, `example-sus`, `example-yak`.
  Any ninth is yours.
- **After every push, read the CI job log for your commit** — local green is not
  green. Fetch it immediately before writing the commit message, not at the
  start: the one time that order was reversed the numbers were right and the
  process was not, and it is recorded as a finding.
- **The 2×2 cost matrix** with axes taken from THIS diff, and its own control:
  the (HEAD, HEAD) corner must reproduce the number pinned in
  `test/js-fixpoint-cost.test.ts` exactly (**1 031 137 rows / 61 005 firings**).
  A 401-row gap once said an axis was missing. Re-measure it if the corpus
  changes afterwards.
- **Run the kind census beside the oracle probe**, not at the end. A fixture
  that introduces a second node kind (`rest_element` from `...args`,
  `tsunknown_keyword` from `: unknown`) goes red twelve minutes later at the end
  of a full suite, and the census is a one-second query.

## What this session learned the hard way

- **Ask the runtime before writing a rule.** Iteration 25's whole shape was
  decided by a 30-second oracle probe. `await thenable` reports `<top> -> then`
  because the promise machinery makes the call, so a model deriving it would be
  contradicted by the oracle rather than confirmed — a property of the FORM.
  Third instance of the same limit (getters, generators): a call the HOST makes
  on the program's behalf has no caller in the program.
- **A fixture must be reachable ONLY through the construct it tests, and must
  introduce ONLY that construct.**
- **A column the corpus never varies can be deleted for free.** Three surviving
  mutants in a row were killed by a deliberate NAME COLLISION, not by a sharper
  assertion.
- **A guard whose violation cannot RUN belongs in `shapes.ts`** (scanned, never
  executed). `fn_node` on the tag rule derived a byte-identical world until an
  object literal was used as a tag there.
- **Derive anchors, never write them.** Six mutants had been re-aimed after
  naming a row somebody retired. The queue-head plant, the unpopulatable file
  list, the excuse mutant and the reflection sweep are all derived now.
- **Twelve design notes in `facts/worklist.rofl` have been refuted by the first
  probe.** They are all mine. Treat every note as a hypothesis with a name.

## Commands

```
npm test                                            # the loop, ~13 min
npm run findings                                    # the backlog, reacted to every session
npx tsc -p tsconfig.json
npm run grepcheck && npm run textcheck && npm run flagcheck
node --experimental-strip-types scripts/witness_check.ts   # also a test now
node --experimental-strip-types --test --test-reporter=spec test/<one>.test.ts
```

## Standing constraints from the owner

- Develop and push on `modeljs` only.
- `layer(L)` is declared by the owner alone. The four that exist are authorised;
  a new one is not, ever, without being asked for.
- Never assign the `out_of_scope` verdict — that judgement is the owner's.
- bun is ignored locally; CI runs it.
- Iteration speed must RISE. The suite is 862 s → 718 s since iteration 24; if
  mutants get heavier every time, something is wrong.

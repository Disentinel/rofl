# reach — an answer that is big because the answer is big

```
node --experimental-strip-types examples/reach/demo.ts
```

480 services in 30 layers, 6960 calls between them, and one question: which
service can reach which. The closure is quadratic by construction —
`W*W*L*(L-1)/2` = **111 360 pairs** — and that number is a closed form anyone
can check against the transcript.

## What it is for

`space_exhausted` and `budget_exhausted` are two atoms in this kernel because
they demand **opposite repairs**, and `src/reflect.ts:249` says so in as many
words: *told `budget_exhausted`, a caller raises the budget, which is precisely
the move that turns this refusal back into a corpse*.

Until 2026-09-09 a caller could act on neither. The budget was a parameter and
the space was a constant nobody could reach: `Evaluation` had read `opts.space`
since it was written and nothing ever put it there, so the materialization wall
was a hard 500 000 rows for every program ever run. This example is the reason
the setting exists and the proof that it works.

## The transcript

| run | reaches | holes | wall clock |
|---|---|---|---|
| default wall, 500 000 rows | 28 160 of 111 360 | `space_exhausted` on the recursive rule, plus the load's own | 1327 ms |
| `new Rofl({ space: 2_000_000 })` | **111 360 of 111 360** | none | 4713 ms |

Two things the table is worth reading twice for.

**The refusal is partial, not empty.** 28 160 pairs are derived and kept; the
run stops *inside* the answer and says where. A wall that returned nothing would
be indistinguishable from a program that concluded nothing.

**One refusal, two holes.** The load reports a `budget_exhausted` of its own
because the space refusal propagates out through it. Raise the space and both
disappear — so the second hole was the first one's shadow, and a caller who read
only the top line would have raised the wrong thing.

## Why this is not the cross product the other gate catches

`test/rule-shape.test.ts` goes red on a positive premise that shares no variable
with anything bound before it. That is a rule whose intermediate is large
**because the rule is wrong**, and the repair is to reorder the body — measured
elsewhere in this tree at 79 152 intermediate rows for a few hundred answers,
against 291 for the same premises reordered.

Nothing here is that. `reaches(A, C) :- reaches(A, B), calls(B, C).` joins on `B`
at every step, and no ordering makes a quadratic answer small. The wall is not
protecting you from a bad rule; it is asking whether you meant to hold a hundred
thousand pairs. For a call graph of 480 services the honest answer is yes — and
for 700 services, which is the scale this whole line of work is aimed at, it is
yes by a wider margin.

## The thing the demo caught in itself

The first draft started its clock after `load` and timed both arms at 0 ms.
`load` **evaluates**, so by the time `evaluate()` is called the store is clean
and `ensure` returns immediately — the numbers had the right shape and measured
nothing. It is the failure mode this repository keeps paying for, and it caught
the demo written about it. The clock now starts before the load, and the comment
saying why is in `demo.ts` where the next person will hit it.

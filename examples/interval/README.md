# INTERVAL — how far can this counter go

You are writing a static analyser, and you want to know what a loop counter
can be. Not whether the loop ends: what `i` is when the loop is left, and
whether an index `a[i]` can run off its array. The textbook answer is an
interval, `[0, 10]`, and the textbook trouble is the first loop you write:
`i = i + 1` makes the set of values infinite, and the fixpoint that computes
the interval never ends. Every analyser fixes that the same way, by *widening*
(give up precision, jump to a bound) and then *narrowing* (take back what the
jump overshot), and in most languages that fix is a few hundred lines of
imperative code you have to trust.

Here it is a declaration, `widen 2`, on the one relation that sits on the
loop. This is a tiny abstract interpreter over seven loops: what it says, and,
as important, what it refuses to say.

## A loop is four rules

```
i = 0; while (i < 10) i = i + 1
```
```
lattice c_at(P, hull I).
lattice c_head(P, hull I) widen 2.
c_head(head, I)  :- iv_start(c, I).
c_at(body, J)    :- c_head(head, I), J is ivmeet(I, iv(ninf, 9)).
c_head(head, J)  :- c_at(body, I), J is ivadd(I, 1).
c_at(exit, J)    :- c_head(head, I), J is ivmeet(I, iv(10, inf)).
```

The head of the loop is the interval the counter has when the guard is tested.
It starts at the entry value, `iv(0, 0)`. The body is the head met with what
the guard lets in, `(-inf, 9]`; the head also takes the body plus the step;
the exit is the head met with what the guard lets out, `[10, inf)`. A `hull`
is a lattice that keeps the smallest interval holding everything contributed
to it, so each rule says only what flows, and the engine joins.

`ivadd`, `ivsub`, `ivmul` and `ivmeet` are the interval functions of `is`.
`widen 2` goes on the head, the one cell on the cycle: the engine joins its
first two improvements as any hull does, and from the third on moves every
end that grew to the next bound **the loop's own rules write** (here 9, 10, 0,
1), or to infinity when there is none. The program's own numbers are the
thresholds, which is why a loop with a constant bound widens to just past it.

## Seven loops

The rules are `examples/interval/interval.rofl`. The enclosures it closes on:

| loop | what it is | head closes within | how |
|---|---|---|---|
| `c` | `i = 0; while (i < 10) i++` | `[0, 10]` | the third improvement goes to the written 9; one more step is 10 |
| `f` | `while (i < N)`, N a fact, 7 | `[0, 7]` | nothing written names N: widened to `[0, inf)`, narrowed to `[0, 7]` |
| `n` | `while (i < 8) { j = 0; while (j < 5) j++; i++ }` | outer `[0, 8]`, inner `[0, 5]` | two heads, each widened to a written bound; the inner entered from the outer body |
| `d` | `i = 10; while (i > 0) i--` | `[0, 10]` | the low end goes down to the written 1, then to 0 |
| `m` | `while (i < 1000000) i++` | `[0, 1000000]` | a handful of steps, not a million |
| `t` | `while (i < 5) i += 2` | `[0, 6]` | the head ends past every bound written: widened to `[0, inf)`, narrowed to `[0, 6]` |
| `z` | `while (true) i++` | `[0, inf)` | the concrete loop does not end; the enclosure is the answer |

Run one:

```
rofl load --why "f_head(head,iv(0,7))" boot.rofl examples/interval/interval.rofl
```
```
f_head(head, _) is a shrug: inherited, the answer reads another answer that is a shrug; from([$lattice(f_head, main, 0, [head])])
  root $lattice(f_head, main, 0, [head]) is a shrug: widened, a declared widening enclosed the value: the least value lies within it, and is not known; within(iv(0, 7))
    [widened: after 2 improvements each end the join moved went to the next bound its rules write, or to its infinity; the least value lies within iv(0, 7), which is an over-approximation of it]
      iv(0, 2) joined with iv(1, 3) is iv(0, 3), widened to iv(0, inf)
      narrowed iv(0, inf) to iv(0, 7) by iv(0, 7), the join of what its rules contribute from it
```

That is the record of the loop: the join it widened at, where the widening
sent it, and the narrowing that came back down and *by what* (the join of what
the rules contribute from the widened value). A loop whose widening landed on
its own bound, like `c`, has the first line and no narrowing, because nothing
came down. `z` has the first line and no second, because there is nothing to
come down to.

## What it will not say

Every head is a **shrug**, `widened`, with `within(V)`. Not one of them is a
value: there is no row `f_head(head, iv(0, 7))`, only the statement that the
least value lies within `iv(0, 7)`. Anything that reads a head (the body, the
exit) is a shrug inherited from it. That is the whole point of widening done
honestly. The enclosure is *sound*, it holds the least value, and the engine
does not pretend it is the value: a rule of yours that wants the value of the
head, as a premise, gets a shrug, not `[0, 7]` quietly standing in for it.

The question you came with, is `i` at most N after the loop, is asked of the
enclosure, and the proof world asks it:

```
c: at most 10 yes, at most 9 no       t: at most 6 yes, at most 5 no
f: at most 7 yes, at most 6 no        z: at most anything no
```

`f` and `t` are why narrowing is built. The widened value of each is
`[0, inf)`, which answers no to every N; narrowing comes back to `[0, 7]` and
`[0, 6]` and the answer is yes. `z` answers no to every N and is right to: the
counter is unbounded, and the shrug says so.

## What was settled

`facts/findings.rofl` asked
(`f_the_aggregate_is_needed_only_where_an_infinite_set_must_be_compressed`)
whether a loop counter could be analysed without an aggregate that compresses
an infinite set, by a finite ladder, a fold over an enumerable chain, or a
host emitter. The experiment was a loop counter that none of the three can
express, and whether its absence blocks a question the examples ask. It does,
for the three cases here. The ladder of written bounds answers `c`, `d`, `m`
and the nested loop, because the thresholds are the program's own numbers, and
it cannot answer `f` (N is a fact) or `t` (the head ends one step past every
bound): there the descent is the only thing that gives `[0, 7]` and `[0, 6]`.
The fold needs the chain enumerated, and the loop is the thing that is not.
And the answer is an enclosure, never a value, in all seven.

## What the engine is made to get right

The proof world is `agg_interval_demo`. Every head closes within the
enclosure derived by hand in `examples/checks/agg-interval-demo-check.rofl`,
and is a `widened` shrug and not a value; no enclosure lies below the least
value of its loop (an enclosure below is unsound); the questions above are
answered as derived; and `why` tells each head's widenings and narrowings,
once, and says nothing of narrowing where nothing came down.

Run it: `npm test -- --world agg_interval_demo`. The ledger cells are
`join_lattice` and `widening` of `demo`, item `w_agg_demo_interval`.

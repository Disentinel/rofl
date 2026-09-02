# SPAT — Scheduling Plans And Tradeoffs

A household week, modelled: who is where minute by minute, who is covering
which child, how much slack every handover has — and, for every hole, **the
constraint that caused it and whose constraint it is**.

The computation is trivial on purpose. A week of a family is a space you can
enumerate in a second, so nothing here can be credited to a clever solver —
**there isn't one**. On a hard instance every result is split between the
solver and the explanation, and the explanation's share is unprovable. Here it
is a hundred percent.

## The central predicate is coverage

A hand-built schedule has red blocks in it: a child is awake, is not at school
or nursery, and there is nobody to be with them.

```
needs_cover(Child, Day, Slot)   -- awake, not supervised, not in somebody's block
uncovered(Child, Day, Slot)     -- ...and nobody on duty
```

A red block is `spat whynot nico thu 18:00`, and the answer is not
"infeasible". It names **who could have been there and what took each of
them**, with the owner and the scope of every constraint.

## Constraints belong to people

`constraint(Id, Owner, Scope)` is a required line, and `external` marks what
the household does not own: the nursery's closing time, the school bus, the
neighbours, the employer. That field is what answers *"is the nursery closing
at 13:30 a decision or a constraint?"* — and the answer is a field, not an
opinion.

## Travel is a condition, not a number

The same drive varies with traffic, with the route taken, and with how hard
the driver is pressing. A figure measured on a quiet morning by the long way
round is **one sample of one condition**, and pretending otherwise puts a lie
under every slack in the week.

```
assume(long_easy).
travel_as(long_easy, home, nursery, 25).
```

`assume/1` picks which condition the week is read under, exactly as
`current/1` picks the week. A pair with no condition named keeps its ordinary
`travel/3` figure, so a household that never measured a second condition pays
nothing. And `travel_budget/5` states the whole envelope, so a measurement can
be placed inside it: *took 25 of the 25 there are* is a different sentence
from *took 25 minutes*.

## A required total, summed in rules

"At least seven and a half hours a day" is a requirement, not a number in a
report. The kernel has no aggregation, so the sum is a **chain fold** — the
same two rules `examples/slop` uses over a spreadsheet range:

```
work_run(P, D, E, M) :- work_blk(P, D, E, F, T), not work_has_next(P, D, E), M is T - F.
work_run(P, D, E, M) :- work_next(P, D, E, E2), work_blk(P, D, E, F, T),
                        work_run(P, D, E2, Y), M is T - F + Y.
```

One difference in our favour: SLOP's host has to lay the chain out, because a
range is given by the text of a formula. Here blocks carry times, so the chain
is derived too. Put `work_needed(alex, 450).` in the week file and a short day
becomes a reason the week does not add up; leave it out and the machinery
costs nothing.

## Two clocks, on purpose

* **Coverage** runs on a 20-minute grid. It is a point-in-time property of a
  whole day, and materialising it is what makes `uncovered`, `sole`, free time
  and effective hours all fall out of one model instead of four.
* **Slack** is exact integer arithmetic on the endpoints. *"Physio ends 13:20,
  pickup starts 13:25"* is a five-minute fact, and rounding it to a grid would
  destroy the answer that matters most.

## Type in your week

```sh
cd examples/spat
cp week.example.rofl week.rofl
$EDITOR week.rofl                # <- your week, and nowhere else
node --experimental-strip-types spat.ts
```

**`week.rofl` is in `.gitignore` and stays on your machine.** A document
listing where your children are every hour of every day is not something to
push to a public repository, and this one ships a made-up household instead.
With no `week.rofl` present the tool and the tests run against
`week.example.rofl`.

Times are **minutes since midnight** (`hours * 60 + minutes`; there is a table
at the top of the file). The rules in `spat.rofl` never need touching, and
`ru_name/2` in the week file is where a household's own names live — never in
the code.

## Commands

```
spat                                    the week, red blocks, what has no backup
spat check                              does it hold together
spat html    [file.html]                the grid: screen and A4 landscape print
spat free    <who>                       free time, derived
spat place   <what> <minutes> [who] [where] [--on <day> <time>]
spat hours   [who]                       nominal and effective hours
spat backup                              who has a stand-in and who does not
spat why     <block>                     why it is there
spat whynot  <child> <day> <time>        why nobody is covering
spat relax   <child> <day> <time>        what would have to give
spat whatif  --without <who|id> | --add '<fact>.'
             --move <block> <days> <time> | --week-of <week>
spat fragile                             chains with no slack, trips with no backup

  --week <file>      a different week file      --week-of <w>   a different week
```

## Engine disciplines, all load-bearing and all tested

* **No `@next` ticks.** The day is an ordinary fact argument and the week is
  selected by one `current/1` fact. Carrying facts across ticks would make
  every one its own support one tick back, and the counting semiring would say
  "infinitely many" for every responsibility in the house.
* **Every rule range-restricted** in written premise order, so everything is
  materialised and the semirings fold over the same world the Boolean answers
  came from.
* **Premise order is performance.** The engine has no argument index: every
  premise lookup scans its whole relation. Where a rule looks written
  backwards, that is why, and the comment says so.

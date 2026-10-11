# LIFE — where did this cell come from

A cell is alive on the board and you want to know why. Not "the rule is
three neighbours": which cells made it three, one tick ago, and which cells
made *them*, all the way back to the board you started with. Every cellular
automaton, every simulation that steps a state forward, has that question and
usually no answer: the state is overwritten, the history is a log you grep.

This is Conway's Game of Life with the history kept as facts, so the question
is a query. The neighbour count, the thing the whole game turns on, is an
aggregate over the board of the tick it is asked in.

## The rules

```
neighbours(X, Y, N) :- cell(X, Y), N is count(DX, DY : off(DX, DY), AX is X + DX, AY is Y + DY, live(AX, AY)).

live(X, Y)@next :- cell(X, Y), neighbours(X, Y, 3).
live(X, Y)@next :- live(X, Y), neighbours(X, Y, 2).
```

That is the game: alive next tick with exactly three live neighbours, or alive
now with two. `cell` is the 10 by 10 board and is bound from outside the count,
so a cell with no live neighbour reads `neighbours(X, Y, 0)`, a row at zero.
`@next` stages a fact into the next tick. There is no negation, which is why
both rules are this short.

`examples/life/life.rofl` has the whole thing, 40 lines with comments: a
glider at the top left, moving down and to the right, and a blinker at the
bottom right.

## Several ticks

```
rofl load --ticks 8 boot.rofl examples/life/life.rofl
```

Eight ticks later the glider is the same five cells two down and two right,
(3,2) (4,3) (2,4) (3,4) (4,4), and the blinker has flipped four times and is
lying down again. The population is 8 at every tick. A second sort of fact
carries the board's history: `seen(T, X, Y)` says cell (X, Y) was alive at
tick T, and it is staged forward by one more `@next` rule, so by tick 8 the
world holds all eight boards.

## Why is this cell alive

```
rofl load --ticks 8 --why "live(4,4)" boot.rofl examples/life/life.rofl
```
```
live[main](4,4)  <= r5fbf34df @tick 8
  cell[main](4,4)  <= r1764470c @tick 7 [past tick]
  neighbours[main](4,4,3)  <= r866fad2b @tick 7 [past tick]
```

The head of the glider is alive at tick 8 because, at tick 7, it was on the
board and had three live neighbours. `why` goes one tick back and says so; the
facts of a tick that is over are named, with the rule that made them, but not
unfolded. That is how the engine reads a past tick, and it is the edge of what
`why` can say about it.

The cause cone goes the rest of the way, as a rule over the history, because
the history is facts. A cell's causes are the live cells of the tick before in
and around it: the ones it was counted from, and itself.

```
cone(X, Y, T) :- target(X, Y, T).
cone(X, Y, S) :- cone(X, Y, T), T > 0, S is T - 1, seen(S, X, Y).
cone(AX, AY, S) :- cone(X, Y, T), T > 0, S is T - 1, off(DX, DY), AX is X + DX, AY is Y + DY, seen(S, AX, AY).
```

`why` of a cell of the cone, at tick 8, is the chain from it to the head:

```
rofl load --ticks 8 --why "cone(1,0,0)" boot.rofl examples/life/life.rofl
```
```
cone[main](1,0,0)  <= r34f17869 @tick 8
  cone[main](0,1,1)  <= r34f17869 @tick 8
    cone[main](0,2,2)  <= r34f17869 @tick 8
      cone[main](1,1,3)  <= r34f17869 @tick 8
        cone[main](2,1,4)  <= r34f17869 @tick 8
          cone[main](3,2,5)  <= r34f17869 @tick 8
            cone[main](3,3,6)  <= r34f17869 @tick 8
              cone[main](3,4,7)  <= r34f17869 @tick 8
                cone[main](4,4,8)  <= r00dbb744 @tick 8
                  target[main](4,4,8)  <= r0049188f @tick 8
```

(Lines for the offsets, the arithmetic and the `seen` fact each step stands
on are left out.) The first board's cell (1,0) is a cause of the head eight
ticks later, through seven cells in between, one per tick. The cone has 37
cells at all and reaches all five cells the glider started with. It contains
no cell of the blinker, which is nowhere near: a blinker is no cause of a glider.

## The negation

The first version of the birth rule was the textbook one,
`live(X, Y)@next :- cell(X, Y), not live(X, Y), neighbours(X, Y, 3).`, and `why`
of a born cell said `not live(4,4) [finite failure]` followed by
`live(4,4) holds; nothing to demonstrate`: it explained the negated premise
against the board the fact arrived on, where the cell is alive, and not
against the board it was read on, where it was not. That was an engine defect
(`f_why_reads_a_staged_negation_on_the_arrival_tick`), found here and fixed in
both engines: the negated premise of a firing staged `@next` is now the bare
`not live(4,4) [finite failure]`, as it stood in the tick the rule fired in
(`staged_neg_why` holds the line). The rules above are the game without the
negation all the same: two rules, and nothing for the reader to take on trust.

## What the engine is made to get right

The proof world is `agg_life_demo`, run eight ticks deep with the last tick
evaluated. Each tick checks itself against an oracle written by a script that
plays the game with a loop over a set of cells, not by these rules: the live
cells, the population, how many cells have each count from 0 to 8, every
cell's count at ticks 0 and 3, and the cone. A tick that is wrong is a row
that is carried to the end so that it is not lost with its tick. The `why`
rows are held too: the head's, and the cone's chain, and that the blinker is
not in it.

Run it: `npm test -- --world agg_life_demo`. The ledger cell is `cell` of
`demo`, item `w_agg_demo_life`.

# MINIMAX — what perfect play gives, and the line that proves it

You write a game engine for a puzzle or a protocol: positions, moves, a result
at the end. Somebody asks the question that decides whether the design is any
good: with best play on both sides, who wins, and why? The answer is a max over
the moves of one side and a min over the moves of the other, all the way down
the tree, and the usual way to have it is a search function that returns a
number. The number is right or wrong and says nothing about the line that makes
it so.

This is tic-tac-toe as rules over a board, solved by minimax, with the value of
every position a row you can ask `why` of. Draws are not a special case.

## The rules

A board is `b(A, B, C, D, E, F, G, H, I)`, the cells left to right, top to
bottom, each `x`, `o` or `e`. Nine rules make a move, one for each cell that can
be empty, and eight say that three of one mark are a line
(`examples/minimax/minimax.rofl`, generated from the shape, 80 lines with
comments):

```
move(N, b(e,B,C,D,E,F,G,H,I), b(Z,B,C,D,E,F,G,H,I)) :- reach(N, b(e,B,C,D,E,F,G,H,I)), turn(N, Z).
won(B, M) :- reach(_, B), B = b(M,M,M,_,_,_,_,_,_), mk(M).
```

`reach(Ply, Board)` is every board unrestricted play can make from the empty
one, 6 046 of them; `real(Ply, Board)`, 5 478, is the boards of a game that
stops at the first line (the moves of a board not yet decided).

The value of a board is what perfect play gives X, 1, 0 or -1. X takes the
greatest value among its moves, O the least:

```
v8(B, V) :- real(8, B), tv(B, V).
v8(B, V) :- real(8, B), not decided(B), V is max(W : move(8, B, C), v9(C, W)).
v7(B, V) :- real(7, B), not decided(B), V is min(W : move(7, B, C), v8(C, W)).
...
v0(B, V) :- real(0, B), not decided(B), V is max(W : move(0, B, C), v1(C, W)).
```

`tv` is the value of a decided board: a line for X is 1, a line for O is -1, and
a full board with no line is **0**. A draw is a row at 0, no different from a
win but for the number, so there is nothing undefined to handle.

## One relation per ply, and why

Ten relations, `v0` to `v9`, where a search function has one. That is the
engine's doing and the game's allowing it. A max or a min over a relation that
is still being derived is refused:

```
program rejected: max in rule r9c8822ea reads v, which depends on the rule's own
conclusion v: an aggregate reads a closed relation; a recursive min/max is a
lattice declaration (docs/aggregates.md)
```

and the lattice, which is the recursive form, cannot say this. A lattice cell
improves with each contribution and a rule reading it inside its recursion must
move the value the same way the head improves. Negamax, a position's value as
the best of the negated values below it, turns the direction:

```
lattice nv(B, max V).
nv(B, V) :- mv(B, C), nv(C, W), V is 0 - W.
```
```
program rejected: rule r5bba03a7: it reads a lattice relation inside its recursion
and is not monotone in the value: ...
```

A value that alternates between taking the best and the worst is not a fixpoint
of improvements, and the engine says so instead of settling on a number. What
the game does have is a ply: every move adds one mark, so a position is only
ever read by the positions one ply above it, and the recursion unrolls into ten
relations each finished before the one above reads it. The engine stratifies it
without being asked, and the whole tree is solved in about a second.

## The value, and who it depends on

```
game(V) :- v0(b(e,e,e,e,e,e,e,e,e), V).      -- game(0)
```

The game is a draw, and every opening is a draw (nine rows at 0 in `v1`). After
a corner, O must answer in the centre: of its eight replies seven are 1 for X.
Per ply, how many of the 5 478 boards are worth -1, 0 and 1 for X:

| ply | boards | O wins | draw | X wins |
|---|---|---|---|---|
| 0 | 1 | 0 | 1 | 0 |
| 1 | 9 | 0 | 9 | 0 |
| 2 | 72 | 0 | 24 | 48 |
| 3 | 252 | 50 | 138 | 64 |
| 4 | 756 | 36 | 136 | 584 |
| 5 | 1 260 | 540 | 264 | 456 |
| 6 | 1 520 | 264 | 200 | 1 056 |
| 7 | 1 140 | 416 | 200 | 524 |
| 8 | 390 | 168 | 80 | 142 |
| 9 | 78 | 0 | 16 | 62 |

## The line that proves it

Ask `why` where the position is sharp. X has two in a row on the top and O is in
the centre with O to move. One move keeps the draw, the block at the third
cell, and the other five lose:

```
rofl-load --why "v3(b(x,x,e,e,o,e,e,e,e),0)" boot.rofl examples/minimax/minimax.rofl
```
```
  min(?W : move[main](3,b(x,x,e,e,o,e,e,e,e),?C), v4[main](?C,?W)) = 0 [aggregate: 1 member, sealed move@1, v4@8]
    #1 (0) h=...
      move[main](3,b(x,x,e,e,o,e,e,e,e),b(x,x,o,e,o,e,e,e,e))  <= ...
```

Of the six moves O has, the one member of the min is the block, and below it the
play goes on: X moves, then a max with one member again, and so on to the last
ply. The members of a min or a max are the moves that reach its value; a move
that does not is not in the proof. The same for a win. X holds a corner and the
centre, O an edge and the far corner, X to move: two moves win (cells 4 and 7),
three do not:

```
rofl-load --why "v4(b(x,o,e,e,x,e,e,e,o),1)" boot.rofl examples/minimax/minimax.rofl
```
```
max(?W : move[main](4,b(x,o,e,e,x,e,e,e,o),?C), v5[main](?C,?W)) = 1 [aggregate: 2 members, sealed move@1, v5@7]
  #1 (1) h=22
    move[main](4,b(x,o,e,e,x,e,e,e,o),b(x,o,e,x,x,e,e,e,o))  <= r6349a38c @tick 0
    ...
    min(?W : move[main](5,b(x,o,e,x,x,e,e,e,o),?C), v6[main](?C,?W)) = 1 [aggregate: 4 members, ...]
```

then O's four replies, every one of which is 1 (a min with four members, all
losing), and for each the next max. `why` prints all the lines that win, not the
first: this one is 5 208 lines, the whole of X's strategy tree, not a single
game. The question that has no short answer has none here either. The proof of
the draw from the empty board is every line of optimal play, `why game(0)` prints
more than a million lines, and the world's alarms do not ask for it.

`whynot` of a better value is a sentence:

```
rofl-load --whynot "v0(b(e,e,e,e,e,e,e,e,e),1)" ...
whynot v0[main](b(e,e,e,e,e,e,e,e,e),1):
  rule r62880530: v0[main](?B,?V)@now :- real[main](0,?B)@now, not decided[main](?B)@now, ?V is max(...)
    failed premise: max(?W#0 : move[main](0,b(e,e,e,e,e,e,e,e,e),?C#0), v1[main](?C#0,?W#0)) = 0, not 1 [aggregate]
```

X cannot force a win, and the sentence says what it can force.

## Draws, and the game that can go round

A game whose positions never repeat is unrolled by its clock, and a draw is a
board with no moves and no line. Chess has repetition, and the drawn positions of
a game that can go round in a circle are not decided by any finite unrolling: a
position is a win if some move reaches a position that is not, and a
position on a cycle with no exit is neither. That is a well-founded world, where
the answer is true, false or undefined and a draw is the undefined, and the
engine refuses to put a count, a sum, a min or a max inside one:

```
program rejected: max is not evaluated under well_founded semantics (rule r62880530):
a cell sealed under an assumption counts facts that may not hold; evaluate the
well-founded world below and feed its true and unknown rows to a stratified world
that aggregates them (rofl-load --below)
```

(That is this file loaded with `semantics(well_founded).`) The composition the
message points at is the one for a game with cycles: the win rule alone in a
world below, its true and undefined rows fed to a world that reads them as a
value, 1, 0 or -1, and takes the max over moves of the negated value there. It
is held, over a nine-position game with two cycles, by `agg_minimax_wfs`
(`examples/checks/agg-minimax-wfs-check.rofl`), and the choice between the two is
the game's: a clock decides draws with a row, a cycle with a shrug, and the
engine does the first soundly and the second only from below.

## What the engine is made to get right

The proof world is `agg_minimax_demo`, over the rules and
`examples/checks/agg-minimax-demo-check.rofl`. Its oracle is a script that shares
nothing with the rules, a memoised minimax over tuples: for every ply how many
boards are real and how many are worth -1, 0 and 1, the value of the game, and
the value of every board of the first two plies. They go red if a max takes the
least, if a min takes the greatest, if a board has two values, if a draw is not
a row, or if a `why` names a move that does not keep the value (the five that
lose in the forced position, the three that fail in the winning one) or leaves
out the one that does. A `never` alarm holds that X does not lose with perfect
play.

Run it: `npm test -- --world agg_minimax_demo`. The ledger cell is
`min_max_strat` of `demo`, item `w_agg_demo_minimax`.

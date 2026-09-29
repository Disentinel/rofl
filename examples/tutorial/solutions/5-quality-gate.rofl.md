---
reads:
  - rofl:visual/graph.rofl.md
---

# Level 5 · The quality gate

> Five cars came off the line today. Before a car goes to its customer it
> passes the quality gate, and the gate is new: it waves every car through,
> scratched or unpainted. The inspector is not amused.
>
> **New word: `if`.** A sentence with `if` in it is a rule: the part before
> `if` holds for anything that makes every part after it hold, `and`
> joins parts, and `unless` puts a part that must not hold at the end.
> Every derived sentence in levels 1 to 4 was a rule like that.
>
>     npm run nb -- examples/tutorial/5-quality-gate.rofl.md

## The cars

Declared as facts:

- <a id="came_off"></a>A car X came off the line
- A car X is painted a colour C
- <a id="scratch"></a>A car X has a scratch

Off the line today:

- `c1` came off the line.
- `c2` came off the line.
- `c3` came off the line.
- `c4` came off the line.
- `c5` came off the line.

Out of the paint shop:

- `c1` is painted `blue`.
- `c2` is painted `red`.
- `c3` is painted `red`.
- `c5` is painted `green`.

The inspector's notes:

- `c3` has a scratch.

## The picture

> The gate is a mark in the middle, and each car that came off the line a
> car in its paint colour: before the gate when it is stopped there, after
> it when it passes. A car that slips through, or is held back by mistake,
> is edged in red. Rewrite the gate's rule below, run again, and watch the
> cars move.

`gate` is a node if some car came off the line.

`gate` is drawn as the icon `gate` if some car came off the line.

A mark X is a node if X came off the line.

A mark X is drawn as the icon `car` if X came off the line.

X links to `gate` if X came off the line, unless X passes the gate.

`gate` links to X if X passes the gate.

A mark X is tagged C if X is painted C.

A tag C is coloured C if some car is painted C.

```rofl
draw graph
```

## Your move: the gate

> Rewrite the rule below so that a car passes the gate only when it
> came off the line, is painted some colour, and has no scratch. Keep the
> part before `if` as it is. The sentences you can use are the ones
> declared under *The cars*: write the capital letter where a car or a
> colour goes, or `some colour` when any colour will do.

A car X passes the gate if X came off the line and X is painted some colour, unless X has a scratch.

## The referee

Declared as facts:

- A car X must pass
- A car X must not pass

The inspector's list:

- `c1` must pass.
- `c2` must pass.
- `c5` must pass.
- `c3` must not pass.
- `c4` must not pass.

A car X is held back by mistake if X must pass, unless X passes the gate.

A car X slips through if X passes the gate and X must not pass.

```rofl
never X is held back by mistake
never X slips through
```

> Stuck? Add to the cell above `` why `c3` slips through ``: it shows which
> part of your rule let the car through; `` whynot `c1` passes the gate `` shows which part stopped a
> good car.
>
> Solved? Level 6, optional, is `6-in-your-words.rofl.md`.

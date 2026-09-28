# Level 3 · The truck that never comes

> Ana ordered a truck three weeks ago. The line builds cars every day, and
> never a truck. Nobody knows why, and the factory is bigger now: some
> things are built from parts, and a product can be built from those.
>
> **New words: `why` and `whynot`.** `why S` shows how the factory arrived
> at the sentence S, down to the facts it rests on; `whynot S` shows where
> the road to S stops.
>
>     npm run nb -- examples/tutorial/3-missing-part.rofl.md

## The factory

Declared as facts:

- <a id="made_of"></a>A thing X is made of a thing Y
- <a id="on_the_plan"></a>A product X is on the plan
- <a id="ordered"></a>A product X is ordered by a customer P

What things are made of:

- `car` is made of `body`.
- `car` is made of `wheel`.
- `body` is made of `panel`.
- `body` is made of `seat`.
- `truck` is made of `cab`.
- `truck` is made of `chassis`.
- `truck` is made of `wheel`.
- `cab` is made of `seat`.
- `cab` is made of `door`.
- `cab` is made of `mirror`.
- `chassis` is made of `frame`.
- `chassis` is made of `axle`.

What the plan asks for, and who ordered it:

- `car` is on the plan.
- `truck` is on the plan.
- `car` is ordered by `bo`.
- `truck` is ordered by `ana`.

> A part that is not in stock is missing from whatever is made of it. A
> sub-assembly (a body, a cab) is ready when it is missing nothing. A
> product is short of a thing it is made of that is neither in stock nor
> ready, and it leaves the line when it is short of nothing.

<a id="lacks"></a>A thing S lacks a part P if S is made of P, unless P is in stock.

<a id="ready"></a>A thing S is ready if S is made of some thing, unless S lacks some part.

<a id="short"></a>A product X is short of a thing Y if X is made of Y, unless Y is in stock, unless Y is ready.

<a id="leaves"></a>A product X leaves the line if X is on the plan, unless X is short of some thing.

<a id="late"></a>A product X is late if X is ordered by some customer, unless X leaves the line.

## Your move: the delivery

> This morning's delivery is yours to change. The supplier sells parts
> only, never a whole cab or body: the referee checks that.

Declared as facts:

- <a id="in_stock"></a>A part P is in stock

This morning's delivery:

- `panel` is in stock.
- `seat` is in stock.
- `wheel` is in stock.
- `frame` is in stock.
- `axle` is in stock.
- `mirror` is in stock.
- `door` is in stock.

## The goal

```rofl
never X is late
```

> When it fails, ask the factory, in the cell above: `` why `truck` is late ``
> walks back from the late truck to the first thing that stopped it. Then
> ask `why` again about the sentence it stops at, until you reach a part.

## The referee

<a id="bought_whole"></a>A thing X is bought whole if X is in stock and X is made of some thing.

```rofl
never X is bought whole
```

> Solved? Level 4 is `4-late-delivery.rofl.md`.

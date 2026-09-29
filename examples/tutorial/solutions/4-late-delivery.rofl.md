---
reads:
  - rofl:visual/graph.rofl.md
---

# Level 4 · The door lorry is late

> The Tin Can Works now builds cars, trucks and bikes. A phone call: the
> lorry with tomorrow's doors is stuck at the border. Which of today's
> products will not leave the line tomorrow?
>
> **New word: `excise`.** `excise F` takes the fact F out of the factory
> for a moment and lists every question in this file whose answer would
> change, before and after; nothing in the file changes.
>
>     npm run nb -- examples/tutorial/4-late-delivery.rofl.md

## The factory

Declared as facts:

- <a id="made_of"></a>A thing X is made of a thing Y
- <a id="on_the_plan"></a>A product X is on the plan
- <a id="in_stock"></a>A part P is in stock

What things are made of:

- `car` is made of `body`.
- `car` is made of `wheel`.
- `body` is made of `panel`.
- `body` is made of `door`.
- `truck` is made of `cab`.
- `truck` is made of `wheel`.
- `cab` is made of `seat`.
- `cab` is made of `mirror`.
- `bike` is made of `frame`.
- `bike` is made of `wheel`.
- `van` is made of `panel`.
- `van` is made of `door`.
- `van` is made of `wheel`.

What the plan asks for:

- `car` is on the plan.
- `truck` is on the plan.
- `bike` is on the plan.
- `van` is on the plan.

Today's stock:

- `panel` is in stock.
- `door` is in stock.
- `wheel` is in stock.
- `seat` is in stock.
- `mirror` is in stock.
- `frame` is in stock.

<a id="lacks"></a>A thing S lacks a part P if S is made of P, unless P is in stock.

<a id="ready"></a>A thing S is ready if S is made of some thing, unless S lacks some part.

<a id="short"></a>A product X is short of a thing Y if X is made of Y, unless Y is in stock, unless Y is ready.

<a id="leaves"></a>A product X leaves the line if X is on the plan, unless X is short of some thing.

## The picture

> The products that leave the line and the parts in stock, each drawn as
> the icon of its name, with a line from a product to each part in stock
> it uses. Drawn in the same cell as an `excise`, the picture is the factory
> before and after at once: what the excised fact takes with it is drawn
> faded and dashed, `gone`.

A mark X is a node if X leaves the line.

A mark P is a node if P is in stock.

A mark X is drawn as the icon X if X is a node.

A mark X links to a mark P if X leaves the line, X uses P and P is in stock.

## Your move

> Add an `excise` line under the question in this cell, taking out the fact
> that the doors are in stock (copy it from *Today's stock*, without the
> dash and the full stop). Run, and read what changes, in the answers
> and in the picture.

```rofl
? X leaves the line
excise `door` is in stock
draw graph
```

> Then write down every product that stops, one line each, like the list in
> level 1: `` - `sofa` is on your list. ``

Declared as facts:

- <a id="on_your_list"></a>A product X is on your list

Your list:

- `car` is on your list.
- `van` is on your list.

## The referee

> Leave this part alone. It knows what each product is built from, all the
> way down, and compares with your list: it names a product you listed by
> mistake, but not one you left out.

Declared as facts:

- <a id="playing"></a>A level L is being played

Now playing:

- `level4` is being played.

<a id="uses"></a>A thing X uses a part P either:

1. if X is made of P;
2. if X is made of a thing Y and Y uses P.

<a id="missing"></a>A level L is missing an answer if L is being played, X is on the plan, X uses `door`, unless X is on your list.

<a id="by_mistake"></a>A product X is on your list by mistake if X is on your list, unless X uses `door`.

```rofl
never L is missing an answer
never X is on your list by mistake
```

> Solved? Level 5 is `5-quality-gate.rofl.md`.

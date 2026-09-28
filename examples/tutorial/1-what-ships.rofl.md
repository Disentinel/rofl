# Level 1 · What leaves the line today

> Welcome to the Tin Can Works. Parts arrive at one end of the conveyor,
> products roll off the other. This file is the whole factory, written in
> plain sentences, and it can answer questions about itself.
>
> **New word: `?`.** A line that starts with `?` is a question, and a capital
> letter in it (`X`) is the blank you want filled in: the notebook answers
> with every sentence that fits.
>
> Run this file:
>
>     npm run nb -- examples/tutorial/1-what-ships.rofl.md
>
> (or open it in VS Code and press Run All). You have solved a level when the
> last line says **none fails**.

## The factory

Declared as facts:

- <a id="made_of"></a>A product X is made of a part P
- <a id="in_stock"></a>A part P is in stock
- <a id="on_the_plan"></a>A product X is on the plan

What the products are made of:

- `car` is made of `engine`.
- `car` is made of `wheel`.
- `car` is made of `seat`.
- `bike` is made of `frame`.
- `bike` is made of `wheel`.
- `van` is made of `engine`.
- `van` is made of `wheel`.
- `van` is made of `door`.
- `scooter` is made of `frame`.
- `scooter` is made of `wheel`.
- `scooter` is made of `motor`.

What arrived this morning:

- `engine` is in stock.
- `wheel` is in stock.
- `seat` is in stock.
- `frame` is in stock.
- `motor` is in stock.

What the plan asks for:

- `car` is on the plan.
- `bike` is on the plan.
- `van` is on the plan.
- `scooter` is on the plan.

> How the line works: a product waits for a part that is not in stock, and
> a product on the plan leaves the line unless it waits for something.

<a id="waits_for"></a>A product X waits for a part P if X is made of P, unless P is in stock.

<a id="leaves"></a>A product X leaves the line if X is on the plan, unless X waits for some part.

## The question

```rofl
? X leaves the line
```

## Your move

> Write down every product that leaves the line today, one line each, in
> the list below, like this: `` - `sofa` is on your list. `` (with the dash,
> the backticks and the full stop).

Declared as facts:

- <a id="on_your_list"></a>A product X is on your list

Your list:

- `sofa` is on your list.

> Delete the sofa: the Tin Can Works has never made one.

## The referee

> Leave this part alone. It compares your list with the factory and says
> whether the level is solved: it names a product you listed by mistake,
> but not one you left out. Its `never`
> lines are the subject of level 2.

Declared as facts:

- <a id="playing"></a>A level L is being played

Now playing:

- `level1` is being played.

<a id="missing"></a>A level L is missing an answer if L is being played, X leaves the line, unless X is on your list.

<a id="by_mistake"></a>A product X is on your list by mistake if X is on your list, unless X leaves the line.

```rofl
never L is missing an answer
never X is on your list by mistake
```

> Solved? Level 2 is `2-paint-shop.rofl.md`.

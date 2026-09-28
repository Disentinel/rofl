# Level 2 · Nothing leaves unpainted

> Four cars came off the line and went through the paint shop. The boss has
> one rule: no car leaves the Tin Can Works unpainted.
>
> **New word: `never`.** A line that starts with `never` is a promise that
> no sentence fits it: it *holds* when the question would have no answer,
> and *FAILS* with the sentences that break it.
>
>     npm run nb -- examples/tutorial/2-paint-shop.rofl.md

## The paint shop

Declared as facts:

- <a id="on_the_line"></a>A car X is on the line
- <a id="to_be_painted"></a>A car X is to be painted a colour C
- <a id="in_the_shop"></a>A colour C is in the paint shop

> A car comes out a colour when it is to be painted that colour and the
> paint shop has it; then it is painted. A car on the line that is not
> painted leaves unpainted.

<a id="comes_out"></a>A car X comes out a colour C if X is to be painted C and C is in the paint shop.

<a id="painted"></a>A car X is painted if X comes out some colour.

<a id="unpainted"></a>A car X leaves unpainted if X is on the line, unless X is painted.

## Your move: change the factory

> Everything in this section is yours to change: add a line, delete one,
> change a colour.

The cars on the line:

- `c1` is on the line.
- `c2` is on the line.
- `c3` is on the line.
- `c4` is on the line.

The paint orders:

- `c1` is to be painted `blue`.
- `c2` is to be painted `red`.
- `c3` is to be painted `pink`.

The tins in the paint shop:

- `blue` is in the paint shop.
- `red` is in the paint shop.
- `white` is in the paint shop.

## The goal

```rofl
never X leaves unpainted
```

> Make that line hold. Taking a car off the line is not a fix: the
> customers are waiting for all four, and the referee below counts them.
>
> One more thing, says the boss: white shows every speck of dust, so no car
> ever comes out white. Write that promise yourself, as a second line in the
> cell above: `never`, then the sentence with `X` for the car. A name, like
> a colour, goes in backticks, as in the lists above: `` `white` ``.

## The referee

Declared as facts:

- <a id="ordered"></a>A car X is ordered by a customer P

The orders:

- `c1` is ordered by `ana`.
- `c2` is ordered by `bo`.
- `c3` is ordered by `cy`.
- `c4` is ordered by `di`.

<a id="missing"></a>A car X is missing if X is ordered by some customer, unless X is on the line.

```rofl
never X is missing
```

> Stuck? Put `` why `c3` leaves unpainted `` in the goal cell and run
> again: it walks back from the car to where the paint went missing. Where
> it stops at `` `c3` comes out something ``, ask one step further with
> `` whynot `c3` comes out `pink` ``. Level 3 is about these two words.
>
> Solved? Level 3 is `3-missing-part.rofl.md`.

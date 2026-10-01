# Level 6 · In your own words (optional)

> Customers are sending cars back: `bo` ordered red and got green. From now
> on a car goes to its customer only when it is painted the colour it was
> ordered in. This time you do not write the rule: you say it in English and
> Claude writes it. This level needs the `claude` command installed.
>
> **New word: `natural`.** A cell fenced as `natural` holds a request in
> plain words; the `translate` command below asks Claude to write a `rofl`
> cell under it that says the same, and keeps it only if the notebook can
> read it.

## The cars

Declared as facts:

- A car X is ordered in a colour C
- A car X is painted a colour C
- A car X goes to its customer

The orders:

- `c1` is ordered in `blue`.
- `c2` is ordered in `red`.
- `c3` is ordered in `green`.
- `c4` is ordered in `red`.

Out of the paint shop:

- `c1` is painted `blue`.
- `c2` is painted `green`.
- `c3` is painted `green`.
- `c4` is painted `red`.

## The referee

Declared as facts:

- A car X must go
- A car X must stay

The inspector's list:

- `c1` must go.
- `c3` must go.
- `c4` must go.
- `c2` must stay.

> The referee comes first here, so that the cell Claude writes lands
> right under yours.

A car X is kept by mistake if X must go, unless X goes to its customer.

A car X is sent by mistake if X goes to its customer and X must stay.

```rofl
never X is kept by mistake
never X is sent by mistake
```

## Your move

> Say, in the cell below, when a car goes to its customer. Then run
>
>     npm run nb -- translate examples/tutorial/6-in-your-words.rofl.md
>
> which writes a `rofl` cell under yours (it takes a minute), read what
> Claude wrote, and run the level as usual. Until then the referee says
> that nothing defines *goes to its customer*: nothing has said what it means.

```natural
A car goes to its customer when it is painted the colour it was ordered in.
```

```rofl
A car X goes to its customer if X is ordered in a colour C and X is painted C.
```

> Did Claude say what you meant? Read its cell: it is the rule, and you
> can edit it by hand like the one in level 5. That is the whole tutorial:
> `?`, `never`, `why`, `whynot`, `excise`, `if` and `natural`. The
> notebooks in `examples/notebook/` use nothing else.

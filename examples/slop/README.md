# SLOP — Spreadsheet Ledger Over Provenance

ROFL's canonical metaphor is "a ledger in a spreadsheet". SLOP stops it
being a metaphor, because **a spreadsheet already IS a fixpoint engine — just
a bad one.**

Four things a spreadsheet is bad at:

- **Circular references** are handled with a checkbox and a manual iteration
  limit, with no convergence guarantee and no report of whether it converged.
- **There is no provenance.** "Trace precedents" draws arrows one level deep
  and that is all; "where did 4732 come from" across five layers of formulas
  has no answer.
- **Uncertainty is not modelled at all** — either a point number, or Monte
  Carlo through an add-in.
- **Sensitivity is done by hand**: change a value, look at what moved.

All four follow from one thing: **the carrier of a value is hardwired.** A
cell holds a double, the recalculation engine knows only how to combine
doubles, and every question that needs a different carrier — a set of
sources, an interval, a round index — has nowhere to live.

Here the sheet is facts and the evaluation is rules, so the carrier is a
parameter. The same reified formula tree is walked by three evaluators
(`val`, `iv`, `rval` in `slop.rofl`), and the kernel's own machinery answers
the rest.

## What the demo shows

1. **The recomputation**, on a real financial model with 1231 formula cells,
   checked against **two independent oracles**: the values Excel itself
   cached in the file, and a headless LibreOffice recalculating it. 227 of
   231 cells exact to the carrier unit; worst deviation 2 units, and in this
   model a unit *is* a cent.
2. **`huh <cell>`** — the provenance tree, to full depth, through a SUM,
   through a VLOOKUP into another sheet, down to the two lines the whole
   example exists for: `[MANUAL ENTRY]` and `[A CONSTANT TYPED INTO THE
   FORMULA]`.
3. **The same tree unprojected** — the kernel's own `why`, so the projection
   onto cells can be checked rather than believed.
4. **What a human typed, counted**: manual entries, constants inside formula
   text, and blank cells silently read as zero.
5. **Which inputs really move it**: the provenance semiring says *seven* of
   the 197 typed-in numbers in the closure move the headline cell. One fold,
   no perturbation of anything.
6. **Interval**: first with no uncertainty declared at all, where the
   interval run is a proof that the point run is right (the oracle's double
   lies *inside* the interval for every cell checked); then with one input
   declared uncertain, where revenue ten years out comes out as a range in
   ONE PASS, on formulas nobody touched.
7. **`whynot`**: a cell with no value, and the named reason.
8. **The ambiguity gate saying NO**, on a lookup table with the same key
   twice.
9. **The circular reference**, with a convergence answer: the round it
   stopped moving, whether it ever stopped moving at all, and — on a variant
   that does not converge — which cells were still moving and by how much.

## Reading the file: which input format, and why

**A real `.xlsx`, read with `node:zlib` and nothing else.** The other honest
option was to accept a plain-text formula table and declare the boundary; it
was not taken, because the zero-dependency property is load-bearing here and
an `.xlsx` does not actually need a dependency. It is a ZIP of XML:
`examples/slop/xlsx.ts` walks the ZIP central directory, inflates the
members with `zlib.inflateRawSync`, and scans the parts it needs. 289 lines,
no package.

It reads the ZIP central directory, `workbook.xml` and its rels (sheet names
in tab order), `sharedStrings.xml`, and per sheet every `<c>` element's
reference, type, `<f>` formula and `<v>` cached value. Shared formulas
(`<f t="shared">`, 512 cells in this model) are expanded by translating the
master's relative references, `$` by `$`. It does not read styles, defined
names, charts, pivot caches or the calc chain.

`examples/slop/revolver.ts` writes one too, for the cyclic model — a ZIP
with a CRC-32 and `zlib.deflateRawSync`, about 80 lines. So the reader is
exercised on a file this repository produced as well as on one Excel did.

## The model is real, and taken from outside

`examples/slop/fcffsimpleginzu.xlsx` is Aswath Damodaran's FCFF valuation
spreadsheet, published free at
<https://pages.stern.nyu.edu/~adamodar/pc/fcffsimpleginzu.xlsx> and used in
his corporate finance and valuation courses. 281 KiB, 17 sheets, 10 979
cells, 1231 formula cells. It was not written for this demo and nothing in
it was edited.

The formula subset — arithmetic, comparison, `SUM`, `IF`, `VLOOKUP`,
cross-sheet references, `$` forms — is the one the spec calls sufficient for
a real model. The census over this model says how sufficient:

```
in the subset:  IF 295, VLOOKUP 121, SUM 17
outside it:     NORMSDIST 2, EXP 2, LN 1, ROUND 1, AVERAGE 1   (7 calls in 1231 formulas)
```

The cyclic model is **not** real and says so in its own file header: the
downloaded model has no circular reference, and one had to be built. It is
the textbook circularity every practitioner has met — interest charged on the
average debt balance over a period, where the closing balance depends on the
interest and the average depends on the closing balance.

## The two lines that are the point

```
Cost of capital worksheet!K18 = 0.04732509  <- =SUM(K5:K17)
  Cost of capital worksheet!K5 = 0.03830277  <- =IF(J5=0,0,I5*J5)
    0   [A CONSTANT TYPED INTO THE FORMULA]
    Cost of capital worksheet!J5 = 0.85880667  <- =IF(H5>0,H5/$H$18,)
      Cost of capital worksheet!H5 = 193636   [MANUAL ENTRY — a number a human typed]
      Cost of capital worksheet!H18 = 225471  <- =SUM(H5:H17)
        Cost of capital worksheet!H7 = 0   [BLANK CELL, read as zero]
    Cost of capital worksheet!I5 = 0.0446  <- =IF(H5=0,0,VLOOKUP(G5,'Country equity risk premiums'!$A$5:$D$196,4))
      via VLOOKUP into Country equity risk premiums!A5:D196
      Cost of capital worksheet!G5 = "United States"   [text a human typed]
      Country equity risk premiums!D189 = 0.0446  <- =$B$1+E189
        Country equity risk premiums!B1 = 0.0423   [MANUAL ENTRY — a number a human typed]
        Country equity risk premiums!E189 = 0.0023   [MANUAL ENTRY — a number a human typed]
```

A manual entry sitting in the middle of a computed model, and a constant
typed inside a formula, are the two commonest sources of error in financial
models and **both are currently invisible**. Here they are facts about the
file: `input(Cell, V)` is emitted where the file holds a typed-in number and
`num(Node, V)` where it holds a constant inside formula text, and
`manual_entry/1` and `hardcoded/2` are one rule each.

A third mark came out of building it and was kept: `[BLANK CELL, read as
zero]`. A blank cell inside a `SUM` range is a silent zero in every
spreadsheet, and there are twenty of them in the closure of one cell of this
model.

Three properties of the display are worth naming because they are the
kernel's, not this directory's:

- **It is a record, not a reconstruction.** Every line is read out of the
  witness forest the store recorded while deriving the value
  (`Store.witnessesOf`). Nothing is recomputed to draw it.
- **Only the branch of an `IF` that actually fired is in it.** That is the
  difference between "this number depends on that cell" and "this formula
  mentions that cell", and a spreadsheet's precedent arrows cannot tell them
  apart.
- **It goes through the `VLOOKUP`**, into the row the lookup actually hit,
  and on into whoever typed that rate in.

`huh` is a **projection** of the kernel's tree onto cells — a why tree goes
through the inside of a formula, and a spreadsheet user thinks in cells.
Section 3 of the transcript prints the unprojected tree for the same chain so
the projection can be checked rather than believed.

## Money, the carrier, and what "to the cent" means

`is` is integer-only and `/` truncates, so a value is carried as
`round(v * 1e8)`: **one carrier unit is 1e-8 of a sheet value.**

That is not caution, it is a measured requirement. The first version of this
example used 1e-6, and it missed by a cent — not because of the arithmetic
but because of REPRESENTATION. This model's operating margin is
`0.14063146094259696`; at 1e-6 that becomes `0.140631`, an error of 5e-7,
and a DCF multiplies it into a revenue of 21765. The result is out by 0.01 —
one cent of a million dollars. At 1e-8 the same ratio is out by 5e-9 and the
product by 0.0001.

**"To the cent" is a property of the model's denomination, not of the
engine**, and any claim that does not name the unit is not a claim:

- This model is denominated in **millions of dollars**, so 1e-8 of a sheet
  value is one cent, and one carrier unit is one cent. Worst deviation over
  231 cells: **2 units**.
- The cyclic model is denominated in **dollars**, so a cent is 1 000 000
  carrier units, and it agrees with LibreOffice to **1 unit** — six decimal
  places below the cent.

**Where integer-only arithmetic bit, precisely.** Multiplication and division
had to be written out, because the obvious `X * Y / 100000000` leaves the
safe-integer range immediately. Both split their operands:

```
X = 1e4*Xh + Xr,  Y = 1e4*Yh + Yr
X*Y/1e8  =  Xh*Yh + Xh*Yr/1e4 + Xr*Yh/1e4 + Xr*Yr/1e8            -- 3 truncations, <= 3 units
X*1e8/Y  =  q0*1e8 + q1*1e6 + q2*1e4 + q3*1e2 + q4               -- 1 truncation,  <= 2 units
```

The division took three attempts. Two levels of radix 1000 handle divisors up
to 90 000 and the model divides by a revenue total of 225 471, so it silently
derived nothing for thirteen cells until the decomposition went to four
levels of radix 100. That failure was *visible* — the cells had no value and
`whynot` named the guard that refused — which is the difference this example
is about: **the failure mode of a guarded integer carrier is a refusal, and
the failure mode of a float is a wrong number in black.**

Two magnitude guards are in the rules and both announce themselves. Outside
`|value| <= 1e7` the intermediates leave 2^53, so no value is derived and
`whynot` names the comparison that refused. One cell of the workbook (a
1.08e8 figure on the country-premium sheet) is refused at load for the same
reason, by name.

## Cycles are the interesting case

A cyclic sheet is **not** a least fixpoint over a set of facts. It is a
numeric fixpoint, and the iterates of a numeric fixpoint are all different
facts — so a plain Datalog evaluation of a circular model derives *nothing at
all*. The demo shows that first, because it is the honest starting point:
`value("Revolver!B8", V)` has no rows.

What a circular reference needs is an index over the iterates. **That index
IS the iterative-calculation checkbox, made into data** — and once it is
data, "did it converge, and when" is a derived fact with a why tree:

```
round(0).
round(R) :- round(P), horizon(H), R is P + 1, R <= H.

rvalue(0, C, 0) :- formula(C, _).                 -- Excel's seed: every computed cell reads zero
rval(R, N, V)   :- ref(N, C), round(R), P is R - 1, P >= 0, rvalue(P, C, V).

moved(R)        :- rvalue(R, C, V), P is R - 1, P >= 0, rvalue(P, C, W), V != W.
settled(R)      :- round(R), R > 0, not moved(R).
converged_at(R) :- settled(R), not outdone(R).
```

One rule carries the whole idea: **a reference reads the previous round.**
Everything else stays inside its round, so the sheet's depth costs rounds and
a cycle costs one round per turn round it.

**What the demo reports, and it is two answers rather than one.** With a
tolerance of one cent the sheet stops moving at **round 29**, and does not
leave the tolerance again. With no tolerance at all it **never** converges:
the truncating carrier has a period-two orbit one unit wide, and `still_moving`
names the cell (`C5`) and the amplitude (1 unit, 1e-8 of a dollar). Both are
printed. A spreadsheet stops on a tolerance too — that is what "maximum
change" is — but the tolerance is the only channel it reports through, and
never as a round or a cell.

On the diverging variant — the same model with the rate set past the point
where the loop is a contraction — SLOP says `converged_at (never)`,
`steady_at (never)`, `diverging true`, and names three cells with their last
two values. LibreOffice, on the same file, returns `#N/A` in every cell of
the cycle. That is a signal, and it is the whole signal: not which cell, not
how many rounds, not how far it was still moving, not whether some other cell
had settled.

## Which semirings, and what each gives

| semiring | what it gives, here |
|---|---|
| the ordinary one | the familiar number — but it is in the RULES, not a fold; see below |
| provenance | which manual entries a number rests on: 7 of 197 in the closure |
| Boolean | which computed cells rest *entirely* on a given set of inputs |
| counting | **a defect report**: a count above 1 means the sheet is ambiguous |
| the fold's own record | the why-tree on any cell, to full depth |

Two of those need their reading stated.

**Counting reads as a defect here.** In HUH a count is a magnitude (how many
log lines reached a bucket); in NOPE it is robustness. In SLOP a derivation
of `value(Cell, V)` is *a way the sheet produces that number*, and a
well-formed sheet produces each number exactly one way. A count above 1 means
a cell is ambiguous — in practice a `VLOOKUP` whose table holds the key
twice, which a spreadsheet resolves silently by taking whichever row it
reaches first. Section 8 of the transcript builds one on purpose, so this
gate is not one that has only ever said yes.

**Boolean is `AND` along a derivation**, so what it returns is the cells that
rest *entirely* on the chosen inputs — "fully determined by", not "touched
by". The "touched by" question is the provenance semiring's, and the demo
uses it for exactly that.

### Why Interval is NOT a semiring instance here

The brief invited an `intervalSemiring` in `runtime/semirings.ts`. It is not
there, and the reason is worth more than the instance would have been.

**A semiring fold over the support hypergraph is structural, not semantic.**
`evaluateSemiring` computes `v(f) = ⊕ over supports of (weight ⊗ ⊗ premises)`.
For `val(N,V) :- plus(N,A,B), val(A,X), val(B,Y), V is X+Y` the premises are
a `plus` fact and two `val` facts, and ⊗ has to combine them with ONE
operation. The hypergraph does not record which arithmetic each firing
performed, so a single ⊗ cannot be `+` at a `plus` node and `×` at a `times`
node. **The fold can answer *which*, *how many*, *how deep* and *how
trusted*. It can never answer *what number*** — which is exactly why the
three semirings above are the structural ones.

**And general interval arithmetic is not a semiring at all.** Multiplication
is only *sub*-distributive over the interval hull: `a ⊗ (b ⊕ c)` contains
`(a ⊗ b) ⊕ (a ⊗ c)` and is generally strictly larger. Distributivity is
recovered only on non-negative intervals. An instance declared here would
either fail `test/semiring.test.ts`'s law checks or would have to carry a
sign restriction that a financial model breaks on its first negative cash
flow.

So interval arithmetic lives **in the rules** (`iv`, `ivalue` in
`slop.rofl`), which is also where it belongs on this example's own thesis:
the carrier of a *cell value* is the thing being parameterised. It is
declared honestly:

- Every input is its value widened by **one unit** — the rounding the host
  did turning decimal text into an integer.
- Every product and quotient is widened outward by **four units**, which
  covers the at-most-three-unit truncation.
- Both widenings are **outward**, so the result is a GUARANTEED ENCLOSURE
  rather than an estimate. That is a checkable claim, and the demo checks it:
  with no uncertainty declared at all, the double Excel computed lies inside
  the kernel's interval for **212 of 212** cells.
- A comparison under uncertainty has **three** answers, and the third is the
  interesting one: `[0, 1]` means the model would take *either* branch, and
  an `IF` then returns the hull of both. No point recomputation can produce
  that.
- Division is multiplication by the reciprocal interval, so one set of corner
  products serves both. A divisor range straddling zero has no bounded
  reciprocal and is refused rather than enclosed in nonsense.

## The oracle, and the catch

Recomputation by a real spreadsheet engine, to the cent, is the strongest
ground truth in this set of examples. **Two** were available:

- **The values Excel itself cached in the file.** An `.xlsx` stores, next to
  each formula, the value Excel computed when it last saved. That is Excel's
  own answer, free and exact, for all 1197 numeric formula cells.
- **A headless LibreOffice recalculating the same file.** Found at
  `/Applications/LibreOffice.app/Contents/MacOS/soffice` on this machine;
  the demo says plainly when no engine is found and substitutes no weaker
  check. The route is `.xlsx -> .xlsx`, not `.xlsx -> .csv`, because a CSV
  goes through the number format — a rate comes out as
  `"4,73251065547232%"`, with the locale's decimal comma — while the round
  trip writes recalculated values into `<v>` in full double precision.

That LibreOffice really recalculates is not assumed: over the whole workbook
it disagrees with Excel's cached values on **619 of 1197 cells**, by up to
4.2e-15 relative. Two double engines, last bits apart — which is also the
scale against which SLOP's 2 units should be read.

**The catch, and it is the point of the example.** The oracle is
deterministic on ACYCLIC sheets. On cyclic ones a spreadsheet computes
iteratively, without a convergence guarantee — which is exactly what SLOP
claims to fix. **So SLOP loses its oracle precisely on the models it exists
for.**

What was done about it rather than papering over it:

- The converging model is **linear in one unknown**, so it has a closed form
  — `c = (o*(1 + r/2) - E) / (1 - r/2)` — computed in doubles in
  `revolver.ts`, outside the kernel and outside any spreadsheet. Kernel,
  closed form and LibreOffice agree to 1 unit. That is a real check, and it
  is available only because this particular cycle is linear. A general
  cyclic model has no closed form and then LibreOffice's number is a second
  opinion with no convergence guarantee of its own, not an oracle.
- The diverging model has no reachable answer at all, so there is nothing to
  compare. What is checked there is the *report*: both engines fail, and only
  one of them says why.

This is the same shape as the limitation already recorded in `LIMITS.md`
about budgets — a check whose strength varies with the input, stated rather
than averaged away.

## How to run it

```sh
node --experimental-strip-types examples/slop/demo.ts
```

No arguments, no build step, no dependencies. 70-80 seconds, of which ~30 is
LibreOffice; without LibreOffice on the machine it skips that oracle and says
so rather than substituting a weaker check.

The assertions also run as a test, on a smaller slice of the same workbook:

```sh
node --experimental-strip-types --test test/example-slop.test.ts
```

19 seconds, 20 tests. The slice is the closure of one country row rather than
the whole blended premium — 196 formula cells against the demo's 231 — which
is a stated trade, not an accident: see "What this does not do".

## The rules

`slop.rofl` is 154 rules, which is large for this repository and is itself
worth naming — see "What this does not do". The shape:

```
value(C, V) :- input(C, V).                              -- a number a human typed
value(C, 0) :- empty(C).                                 -- a blank, read as zero
value(C, V) :- formula(C, N), val(N, V).

val(N, V) :- num(N, V).                                  -- a constant inside a formula
val(N, V) :- ref(N, C), value(C, V).
val(N, V) :- plus(N, A, B), val(A, X), val(B, Y), V is X + Y.
val(N, V) :- pick(N, C, T, _), val(C, X), X != 0, val(T, V).      -- IF, true branch
val(N, V) :- sum_head(N, I), total(I, V).                          -- SUM over a chain
val(N, V) :- find(N, K, T, Col), val(K, Key), tkey(T, Row, Key),
             tcell(T, Row, Col, C), value(C, V).                   -- VLOOKUP, exact match
```

`SUM` is a chain and not an aggregate because v0 has no aggregation
(`LIMITS.md`): the host lays a range out as `sum_item(I, Cell, Next)` and the
fold is two rules. `VLOOKUP` reaches the **cell**, not a value, which is what
makes the tree walk on into the rate table.

## What this does NOT do

**`VLOOKUP` is exact-match only.** 108 of the model's 121 calls use the
three-argument approximate-match form, which means "the largest key not
greater than this" and needs an ordering on the key column. The kernel orders
integers and nothing else, and every one of those 108 calls has a *text* key.
Approximate match on text is a binary search over a sorted column; where the
key is present — as it is throughout this model, and both oracles confirm the
values — approximate and exact agree. Where a key were absent, Excel would
return the predecessor row and SLOP returns nothing. That is a real
difference and it is a refusal, not a wrong number.

**The demo runs the precedent closure of one cell, not the whole workbook.**
231 formula cells of 1231. The reason is cost: reaching fixpoint on that
closure takes ~20 s and the kernel's insert cost is superlinear in store size
(finding `f_store_index_insert_quadratic`). 2004 facts take 20 s; 381 facts
take 2 s. The whole workbook would not finish inside the 300-second budget,
so it is not attempted and no performance claim is made. **Knowingly
deferred.**

**The round-indexed evaluator covers arithmetic and references only** — no
`IF`, no `SUM`, no `VLOOKUP`. v0 has no way to parameterise a relation over
its carrier, so `rval` is a hand-copy of `val` with a round threaded through,
and copying the other twenty rules would have tripled the file for no new
idea. The cyclic model is written to stay inside that subset. This is the
clearest place where the *absence* of relation-level polymorphism costs
something concrete.

**The three evaluators triple the rule count, and the rule count costs
time.** `slop.rofl` is 154 rules where `huh.rofl` is 4. Every round of the
engine rescans all of them, so the interval and round-indexed evaluators are
paid for on every run even when nothing asks them anything. `horizon` gates
the round-indexed one from producing facts, but not from being scanned.

**The `%`, `^` and `&` operators, and every function outside the subset, are
parsed into a named `outside_subset` node.** A cell that uses one gets no
value, `refusal(Cell, Why)` says which feature, and `starved/1` separates a
cell that lost a precedent from one that is itself outside the subset.

**One tick, no time.** Nothing here uses `@next`, perspectives or the
scheduler; the round index is an ordinary argument. The reason recorded was
that the carry idiom would make a round its own support one tick back and
poison the counting fold — that reason has expired (the fold is about one tick
now, `docs/time-and-continuity.md`), and the plain argument stays because a
round here is a coordinate in the data, not a moment the model lives through.

**No `AVERAGE`, no `ROUND`, no dates, no styles.** A date in this model is a
number, as it is in the file.

## Findings this example touches

- **`f_store_index_insert_quadratic`** (open, pitfall → kernel_test). This
  example is the second one to hit it and the first to hit it on *facts a
  user would actually load*: a 2004-fact workbook slice takes 20 s where a
  381-fact one takes 2 s. The demo and the test are both sized around it, and
  both say so. Knowingly deferred.
- **`f_counting_reads_oppositely_by_domain`** (open, insight → doc). It asks
  every example to state which reading of "number of derivations" applies.
  `slop.rofl` states it at the foot of the file: here a count above 1 is a
  DEFECT REPORT, not a magnitude and not robustness.
- **`f_no_string_builtins_moves_why_boundary`** (open, question → decision).
  SLOP takes the same branch HUH did — a host tokenizer, with the redrawn
  boundary printed in the output rather than hidden. A why tree bottoms out
  at `input`, `label`, `num` and the structural facts the tokenizer emitted,
  never inside the characters of a formula.
- **`f_semiring_fold_is_structural_not_semantic`** (new). Why there is no
  interval semiring instance: the fold cannot see which arithmetic a firing
  performed, so it can answer *which*, *how many* and *how deep*, never
  *what number*. Recorded because the brief asked for an instance and the
  right answer was a reason not to write one.
- **`f_edb_typo_invisible_to_undefined_premise`** (new). During construction
  the host emitted `num_text/2` where the rules declared `edb(lit_text)`.
  Both names existed — one as data, one as a declaration — so
  `undefined_premise[audit]` stayed empty and every `IF` on a text
  comparison silently produced no value. The audit is a dictionary check by
  design (`LIMITS.md`); this is the exact hole in it, found the hard way.

## The transcript

Real output of `node --experimental-strip-types examples/slop/demo.ts`,
pasted unedited. The temp path is the only thing that differs between
machines.

```
SLOP — Spreadsheet Ledger Over Provenance
a real .xlsx as a fixpoint, with the carrier of a value as a parameter

file    ~/rofl/examples/slop/fcffsimpleginzu.xlsx
        281 KiB, 17 sheets, 10979 cells, 1231 formula cells
        Aswath Damodaran, NYU Stern — a real model, published free, not written for this demo
reader  examples/slop/xlsx.ts, node:zlib and nothing else (an .xlsx is a ZIP of XML)
rules   examples/slop/slop.rofl
carrier fixed point, 1 unit = 1e-8 of a sheet value; |value| <= 10,000,000

function census over all 1231 formula cells:
  in the subset:  IF 295, VLOOKUP 121, SUM 17
  outside it:     NORMSDIST 2, EXP 2, LN 1, ROUND 1, AVERAGE 1  (7 calls in the whole workbook)

== 1. the recomputation, and two oracles ===================================
target  Cost of capital worksheet!K18, loaded with its PRECEDENT CLOSURE and nothing else:
        231 formula cells, 197 typed-in values, 1954 facts, 0 cells refused
        loaded and evaluated in 17.1 s; 24139 facts in the store
        unstratified: 0; undefined_premise[audit]: 0

against the values EXCEL cached in the file when it last saved:
  231 cells compared, 227 EXACT to the carrier unit,
  worst deviation 2 units, at Cost of capital worksheet!K18

  What a unit is worth depends on what the sheet is denominated in, and this
  one is in MILLIONS OF DOLLARS. A unit is 1e-8 of that, which is one cent, so
  the worst cell in this closure is 2 cents out over a value of $47,325.
  oracle: AGREE — Excel's own cached values, 231 cells, worst 2 units

against a headless LibreOffice recalculating the same file (/Applications/LibreOffice.app/Contents/MacOS/soffice):
  recalculated in 15.8 s
  231 cells compared, 227 exact, worst 2 units at Cost of capital worksheet!K18
  Excel and LibreOffice disagree with EACH OTHER on 61 of these cells,
  by up to 3.80e-15 relative — two double engines, last bits apart.
  oracle: AGREE — LibreOffice's recalculation, 231 cells, worst 2 units

== 2. huh: where did this number come from =================================
the display this example exists for. Every line is read out of the witness
forest the kernel recorded while it derived the value — not recomputed, not
reconstructed. Only the branch of an IF that ACTUALLY FIRED is here.

> huh Cost of capital worksheet!K18
Cost of capital worksheet!K18 = 0.04732509  <- =SUM(K5:K17)
  Cost of capital worksheet!K5 = 0.03830277  <- =IF(J5=0,0,I5*J5)
    0   [A CONSTANT TYPED INTO THE FORMULA]
    Cost of capital worksheet!J5 = 0.85880667  <- =IF(H5>0,H5/$H$18,)
      0   [A CONSTANT TYPED INTO THE FORMULA]
      Cost of capital worksheet!H5 = 193636   [MANUAL ENTRY — a number a human typed]
      Cost of capital worksheet!H18 = 225471  <- =SUM(H5:H17)
        Cost of capital worksheet!H5 = 193636   [shown above]
        Cost of capital worksheet!H6 = 500   [MANUAL ENTRY — a number a human typed]
        Cost of capital worksheet!H7 = 0   [BLANK CELL, read as zero]
        ... and 10 more precedents
    Cost of capital worksheet!I5 = 0.0446  <- =IF(H5=0,0,VLOOKUP(G5,'Country equity risk premiums'!$A$5:$D$196,4))
      0   [A CONSTANT TYPED INTO THE FORMULA]
      via VLOOKUP into Country equity risk premiums!A5:D196
      Cost of capital worksheet!H5 = 193636   [shown above]
      Cost of capital worksheet!G5 = "United States"   [text a human typed]
      Country equity risk premiums!D189 = 0.0446  <- =$B$1+E189
        Country equity risk premiums!B1 = 0.0423   [MANUAL ENTRY — a number a human typed]
        Country equity risk premiums!E189 = 0.0023   [MANUAL ENTRY — a number a human typed]
  Cost of capital worksheet!K6 = 0.00011398  <- =IF(J6=0,0,I6*J6)
    0   [A CONSTANT TYPED INTO THE FORMULA]
    Cost of capital worksheet!J6 = 0.00221758  <- =IF(H6>0,H6/$H$18,)
      0   [A CONSTANT TYPED INTO THE FORMULA]
      Cost of capital worksheet!H6 = 500   [shown above]
      Cost of capital worksheet!H18 = 225471   [shown above]
    Cost of capital worksheet!I6 = 0.0514  <- =IF(H6=0,0,VLOOKUP(G6,'Country equity risk premiums'!$A$5:$D$196,4))
      0   [A CONSTANT TYPED INTO THE FORMULA]
      via VLOOKUP into Country equity risk premiums!A5:D196
      Cost of capital worksheet!H6 = 500   [shown above]
      Cost of capital worksheet!G6 = "China"   [text a human typed]
      Country equity risk premiums!D42 = 0.0514  <- =$B$1+E42
        Country equity risk premiums!B1 = 0.0423   [shown above]
        Country equity risk premiums!E42 = 0.0091   [MANUAL ENTRY — a number a human typed]
  Cost of capital worksheet!K7 = 0  <- =IF(J7=0,0,I7*J7)
    0   [A CONSTANT TYPED INTO THE FORMULA]
    Cost of capital worksheet!J7 = 0  <- =IF(H7>0,H7/$H$18,)
      0   [A CONSTANT TYPED INTO THE FORMULA]
      Cost of capital worksheet!H7 = 0   [shown above]
  ... and 10 more precedents

The two lines that are the point of the whole example are
  [MANUAL ENTRY]                    a number a human typed, in the middle of a computed model
  [A CONSTANT TYPED INTO THE FORMULA]   a number that is not in any cell at all
Neither is visible in a spreadsheet. Both are facts about the file here.

== 3. the same tree, unprojected: the kernel's own why =====================
`huh` above is a PROJECTION onto cells. The kernel's tree goes through the
inside of the formula, and this is it for one cell of the chain, so the
projection can be checked rather than believed.

$ why value("Cost of capital worksheet!I6", 5140000)
value[main]("Cost of capital worksheet!I6",5140000)  <= r003c807a @tick 0
  formula[main]("Cost of capital worksheet!I6",142) [axiom]
  val[main](142,5140000)  <= rb23bd527 @tick 0
    pick[main](142,143,146,147) [axiom]
    val[main](143,0)  <= r1bfe61c3 @tick 0
      cmp[main](143,eq,144,145) [axiom]
      val[main](144,50000000000)  <= ref8068b9 @tick 0
        ref[main](144,"Cost of capital worksheet!H6") [axiom]
        value[main]("Cost of capital worksheet!H6",50000000000)  <= r83b3dd99 @tick 0
          input[main]("Cost of capital worksheet!H6",50000000000) [axiom]
      val[main](145,0)  <= ra98fc67f @tick 0
        num[main](145,0) [axiom]
      50000000000 != 0 [builtin]
    val[main](147,5140000)  <= rfd6bd9ae @tick 0
      find[main](147,148,"Country equity risk premiums!A5:D196",4) [axiom]
      val[main](148,"China")  <= ref8068b9 @tick 0
        ref[main](148,"Cost of capital worksheet!G6") [axiom]
        value[main]("Cost of capital worksheet!G6","China")  <= re0fa3873 @tick 0
          label[main]("Cost of capital worksheet!G6","China") [axiom]
      tkey[main]("Country equity risk premiums!A5:D196",42,"China") [axiom]
      tcell[main]("Country equity risk premiums!A5:D196",42,4,"Country equity risk premiums!D42") [axiom]
      value[main]("Country equity risk premiums!D42",5140000)  <= r003c807a @tick 0
        formula[main]("Country equity risk premiums!D42",425) [axiom]
        val[main](425,5140000)  <= rfb988c49 @tick 0
          plus[main](425,426,427) [axiom]
          val[main](426,4230000)  <= ref8068b9 @tick 0
            ref[main](426,"Country equity risk premiums!B1") [axiom]
            value[main]("Country equity risk premiums!B1",4230000)  <= r83b3dd99 @tick 0
              input[main]("Country equity risk premiums!B1",4230000) [axiom]
          val[main](427,910000)  <= ref8068b9 @tick 0
            ref[main](427,"Country equity risk premiums!E42") [axiom]
            value[main]("Country equity risk premiums!E42",910000)  <= r83b3dd99 @tick 0
              input[main]("Country equity risk premiums!E42",910000) [axiom]
          5140000 is +(4230000,910000) [builtin]

Every [axiom] in it is host output: `input`, `label` and `num` are the
numbers and words in the file, and `pick`, `cmp`, `find`, `ref`, `tkey`,
`tcell` are the shape examples/slop/formula.ts read out of the formula text.
That is the honest floor — the same one examples/huh draws. Everything above
it, including which branch of the IF fired and which row the VLOOKUP hit, was
inferred by rules and recorded as it happened.

== 4. what a human typed, counted ==========================================
in the 231-formula closure of one cell:
  197 numbers were typed in by a human, and 197 of them are read by a formula
  37 formulas contain a constant typed into the formula text (37 constants in all)
  20 referenced cells are BLANK, and every one of them is read as zero

== 5. which inputs the number really rests on ==============================
provenance semiring, base annotation = the `input` facts only, so a monomial
is a set of typed-in numbers.

  Cost of capital worksheet!K18 rests on 7 manual entries:
    Cost of capital worksheet!H16
    Cost of capital worksheet!H5
    Cost of capital worksheet!H6
    Cost of capital worksheet!I16
    Country equity risk premiums!B1
    Country equity risk premiums!E189
    Country equity risk premiums!E42
  complete: true (provenanceSemiring keeps at most 32 monomials)

Seven, out of the 197 numbers a human typed into this closure. That is the
sensitivity answer, and it took one fold and no perturbation of anything.

Boolean semiring, with two of those inputs true and every other typed-in
number false. Times is AND, so what comes out is the COMPUTED cells that rest
ENTIRELY on the chosen two — "fully determined by", not "touched by":
  Cost of capital worksheet!H16, Cost of capital worksheet!H5
  -> 29 computed cells: Cost of capital worksheet!I10, Cost of capital worksheet!I11, Cost of capital worksheet!I12, Cost of capital worksheet!I13 ...

counting semiring: how many ways the sheet produces each number.
  450 value facts checked, 0 with a count other than 1.
  A count above 1 would be a DEFECT REPORT here, not a magnitude: it means a
  cell is ambiguous. Section 8 makes one on purpose, so this gate is not one
  that has only ever said yes.

== 6. interval: the same sheet, one pass, no Monte Carlo ===================
First with NO uncertainty declared at all. Every input is its own value
widened by the one unit the host rounded when it read the decimal text, and
every arithmetic result is widened outward by the truncation bound. What
comes out is a GUARANTEED ENCLOSURE, so the check is not "close to" but
"contains": does the double the oracle computed lie inside the interval?

  212 cells checked, 212 enclose Excel's own value
  oracle: AGREE — the interval run encloses Excel's value on 212 cells

Now with uncertainty declared on ONE input, on a smaller slice of the same
model: revenue ten years out, which is revenue today compounded through ten
growth rates. NO FORMULA IS TOUCHED — only the carrier changes.

  Input sheet!B26 = 0.05   [the growth rate, a manual entry]
  Valuation output!M3 = 36634.40033821   [revenue in year 10]

  say the growth rate is only known to be between 3% and 7%:
    span("Input sheet!B26", 3000000, 7000000)
  Valuation output!M3 = [28491.05807458 .. 46793.86593094]

  One evaluation. No sampling, no add-in, no second model. The interval
  arithmetic is in the rules, because the CARRIER OF A CELL VALUE is what
  this example is about — see README.md for why it is not a semiring fold.

== 7. whynot: the cell that has no value, and why ==========================
the "Option value" sheet uses NORMSDIST, EXP and LN — outside the subset.
  24 formula cells loaded
  6 contain a call SLOP will not compute
  2 could have been computed and were not, because a precedent was not

$ whynot value("Option value!B17", V)
whynot value[main]("Option value!B17",?V):
  rule r54458d0e: value[main](?C,0)@now :- empty[main](?C)@now
    failed premise: empty[main]("Option value!B17")
  rule r003c807a: value[main](?C,?V)@now :- formula[main](?C,?N)@now, val[main](?N,?V)@now
    failed premise: val[main](12,?V)
  rule r83b3dd99: value[main](?C,?V)@now :- input[main](?C,?V)@now
    failed premise: input[main]("Option value!B17",?V)
  rule re0fa3873: value[main](?C,?V)@now :- label[main](?C,?V)@now
    failed premise: label[main]("Option value!B17",?V)

  `val` has thirty rules — one per operator and per branch — so a deeper
  demonstration is wide rather than deep. The answer is one level down and it
  is a fact, not a search:
    refusal("Option value!B22", "LN()")
    refusal("Option value!B22", "exponentiation (^)")
    refusal("Option value!B23", "NORMSDIST()")
    refusal("Option value!B25", "exponentiation (^)")
    refusal("Option value!B26", "NORMSDIST()")

A cell SLOP cannot compute is a NAMED REFUSAL. It is never a wrong number,
which is the failure mode a spreadsheet has no defence against at all.

== 8. the gate says NO: a lookup table with the key twice ==================
A VLOOKUP whose table holds the same key on two rows is resolved by Excel
silently, by taking whichever row it reaches first. Here the number has two
derivations, and the counting semiring says 2.

  rates!A1:B3 has "widget" on row 1 AND row 2, both worth 178
  value("m!B1", 17800000000) has 2 derivations
  oracle: AGREE — the ambiguity gate says NO on a duplicated lookup key

== 9. the circular reference, with an answer ===============================
Interest is charged on the AVERAGE debt balance; the closing balance depends
on the interest; the average depends on the closing balance. A spreadsheet will
not compute that at all until iterative calculation is switched on, and what
the switch takes is an iteration COUNT and a maximum CHANGE — two numbers a
person guesses. What it gives back is a value, and no statement about whether
the iteration reached anything.

  examples/slop/revolver.ts wrote /var/folders/k9/dst30b8n5rs6x6nny6__7s6w0000gn/T/rofl-slop-demo/revolver.xlsx
  (a real .xlsx, written with node:zlib, with NO cached values and
   <calcPr iterate="1" iterateCount="200"> — the checkbox, as data)

    B5 = (B3+B8)/2
    B6 = B5*$B$10
    B7 = B4-B6
    B8 = B3-B7
    C5 = (C3+C8)/2
    C6 = C5*$B$10
    C7 = C4-C6
    C8 = C3-C7

  the ACYCLIC evaluator on this model derives 0 values.
  That is not a bug: a numeric fixpoint is not a least fixpoint over a set of
  facts, and every cell in the cycle is waiting on another one.

  the round-indexed evaluator, horizon 45, tolerance 1000000 units (one cent):
    steady_at      29   -- stopped moving by more than a cent
    relapsed       false
    converged_at   (never)   -- stopped moving AT ALL
    still moving   Revolver!C5: 2946097.81477626 <- 2946097.81477627 (1 units)
    Exact equality is never reached: the truncating carrier has a period-two
    orbit one unit wide, and one unit is 1e-8 of a dollar. A spreadsheet stops
    on a tolerance too — that is what "maximum change" is — but the tolerance
    is the only thing it reports through, and never as a round or a cell.

  three independent opinions on the closing balance:
    period 1   kernel 3329032.25806451
               closed form 3329032.25806452   (algebra, in doubles, this file)
    period 2   kernel 2563163.37148802
               closed form 2563163.37148803   (algebra, in doubles, this file)
    period 1   LibreOffice 3329032.25806452   (iterative calculation, its own algorithm)
               kernel - LibreOffice = 1 units = 0.00000001 dollars
  oracle: AGREE — the circular model, period 1, to the cent against LibreOffice
    period 2   LibreOffice 2563163.37148803   (iterative calculation, its own algorithm)
               kernel - LibreOffice = 1 units = 0.00000001 dollars
  oracle: AGREE — the circular model, period 2, to the cent against LibreOffice

  and the same model with ONE number changed — the rate, set past the point
  where the feedback loop is a contraction:
    steady_at      (never)
    converged_at   (never)
    diverging      true
    still moving   Revolver!B6: 4568341.20154944 <- 4669695.8192832
    still moving   Revolver!B7: -4579695.8192832 <- -4129230.8515776
    still moving   Revolver!B8: 4529230.8515776 <- 4078765.883872
    the equation still HAS a solution — -35900000.00 — and the
    iteration does not find it, because the map is expansive.
  oracle: AGREE — the divergence report fires on a model that does not converge

    LibreOffice, on the same file: B8 = #N/A
    It ran its two hundred iterations, did not get inside its tolerance, and
    put an error code in every cell of the cycle. That IS a signal, and it is
    the whole signal: not which cell, not how many rounds, not how far it was
    still moving, not whether some other cell had settled. Three lines above,
    SLOP says all four.
  oracle: AGREE — LibreOffice also fails to converge here, and says so with an error code alone

== oracle summary ==========================================================
8 comparisons:
  AGREE     Excel's own cached values, 231 cells, worst 2 units
  AGREE     LibreOffice's recalculation, 231 cells, worst 2 units
  AGREE     the interval run encloses Excel's value on 212 cells
  AGREE     the ambiguity gate says NO on a duplicated lookup key
  AGREE     the circular model, period 1, to the cent against LibreOffice
  AGREE     the circular model, period 2, to the cent against LibreOffice
  AGREE     the divergence report fires on a model that does not converge
  AGREE     LibreOffice also fails to converge here, and says so with an error code alone

total wall clock: 77.3 s
the kernel, Excel and LibreOffice compute the same numbers.
```

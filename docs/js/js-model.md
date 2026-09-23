---
world: js-model
books: audit, code, main
default: audit
---

# js-model

Reads:

- from outside these files, in the main: `layer`, `node_kind`

> js-model.rofl — THE COVERAGE MATRIX: node kind x layer (x shape), and
> every cell carries a verdict. The one claim this file tests: adding a layer
> is ONE FACT, and the audit enumerates every cell it needs with no rule edit.
> Declared as [audit]: a coverage gap is a statement about the model, not
> about the domain.

> Three buckets partition the matrix, and a waiver moves a cell between them
> rather than out of sight: the first version let `ignored` count as covered,
> and declaring the whole matrix ignored drove the audit to zero.

A kind K

- <a id="modelled"></a><a id="waived"></a>is modelled/waived in a layer L of a language Lang if K [is handled/ignored](#handled) in L of Lang with some reason.
- <a id="unaccounted"></a>is unaccounted in a layer L of a language Lang if all of:
  - Lang has the node kind K;
  - L is a layer;
  - K neither [is modelled](#modelled) in L of Lang nor [is waived](#waived) in L of Lang.
- <a id="double_claimed"></a>is double claimed in a layer L of a language Lang if K [is modelled](#modelled) in L of Lang and K [is waived](#waived) in L of Lang.

> A CLAIM NAMING A CELL THAT DOES NOT EXIST evaporates silently (`handled(js,
> variable_declarator, …)` for an undeclared kind moved no count). The check
> was written by hand once per ledger and the fourth ledger reopened it, so
> the ledger name is an ARGUMENT: `claim(What, …)` is one relation, the
> vocabulary check is one rule per arity, and `claim_kind` closes the hole the
> normalisation opens — a misspelt ledger name. Adoption and projection go
> both ways: the authored facts stay bare, and a claim in the new spelling
> still ticks.

`claim_kind` includes `handled`, `ignored`, `unknown_because`.

In the main:

A kind K is claimed in a layer L of a language Lang under a ledger N with a reason R either:

1. if K [is handled](#handled) in L of Lang with R and N is `handled`;
2. if K [is ignored](#ignored) in L of Lang with R and N is `ignored`;
3. if K [is unknown](#unknown_because) in L of Lang because R and N is `unknown_because`.

A kind K

- <a id="handled"></a><a id="ignored"></a>is handled/ignored in a layer L of a language Lang with a reason R if K [is claimed](#claim) in L of Lang under `handled`/`ignored` with R.
- <a id="unknown_because"></a>is unknown in a layer L of a language Lang because a reason R if K [is claimed](#claim) in L of Lang under `unknown_because` with R.

Declared as facts:

- <a id="claim"></a>A kind K is claimed in a layer L of a language Lang under a ledger What with a reason R
- A kind K is claimed with a shape S in a layer Lay of a language Lang under a ledger What with a reason R
- <a id="claim_kind"></a>A ledger W is a ledger

> `not cell` rather than `not node_kind` and `not layer` apart: the cell is
> their conjunction.

In the audit:

<a id="orphan"></a>A kind K is orphaned in a layer L of a language Lang under a ledger What if K [is claimed](#claim) in L of Lang under What with some reason, unless K [is a cell](#cell) in L of Lang.

<a id="unknown_ledger"></a>A ledger is an unknown ledger if some kind [is claimed](#claim) in some layer of some language under it with some reason, unless it [is a ledger](#claim_kind).

A kind K

- <a id="orphan_claim"></a>is an orphan claim in a layer L of a language Lang if K [is orphaned](#orphan) in L of Lang under `handled` or `ignored`.
- <a id="cell"></a>is a cell in a layer L of a language Lang if Lang has the node kind K and L is a layer.

## THE LAYER LIST IS THE OWNER'S, as a row. `layer(L)` is one fact and opens

> 59 cells, so the size of the programme is set by this list and by nothing
> else. A promise cannot refuse; `layer_unauthorised` can. Five layers, each
> added by his word, the fifth with the ownership of its cells in one commit.

`layer_authorised` includes `callgraph`, `dataflow`, `modules`, `controlflow`, `effect`.

<a id="layer_unauthorised"></a>A layer is unauthorised if it is a layer, unless it [is authorised](#layer_authorised).

Declared as facts:

- <a id="layer_authorised"></a>A layer L is authorised

> Convergence between languages needs EVIDENCE on both sides: `checked` is a
> cell run against an oracle. The first version compared rule atoms and
> reported eight agreements between rules that existed nowhere.

<a id="verified"></a>A kind K is verified in a layer L of a language Lang by a rule Rule if K [is handled](#handled) in L of Lang with Rule and K [is checked](#checked) in L of Lang by Rule under some step holding some number.

<a id="converges"></a>A rule has two verifiers X and B in a layer L if all of:
  - some kind [is verified](#verified) in L of X by it;
  - some kind [is verified](#verified) in L of B by it;
  - X differs from B.

<a id="unverified"></a>A kind K is unverified in a layer L of a language Lang by a rule Rule if K [is handled](#handled) in L of Lang with Rule, unless K [is checked](#checked) in L of Lang by Rule under some step holding some number.

Declared as facts:

- <a id="checked"></a>A kind K is checked in a layer L of a language Lang by a rule Rule under a step Op holding a number N

## THE DEFAULT VERDICT. Every cell carries one and `not_modelled` is the one it

> is born with — a positive row `why` can answer, where the absence of an
> `unaccounted` row could only be approached with `whynot`. The first two arms
> deliberately carry no `cell` premise: a claim over no cell yields a verdict
> with no cell under it and the partition stops summing — a second, independent
> detector for what `orphan_claim` reports.

<a id="verdict"></a>The verdict of a kind K in a layer L for a language Lang is a verdict N either:

1. if K [is handled](#handled) in L of Lang with some reason and N is `modelled`;
2. if K [is ignored](#ignored) in L of Lang with some reason and N is `waived`;
3. if all of:
   - K [is a cell](#cell) in L of Lang;
   - N is `not_modelled`;
   - K neither [is handled](#handled) in L of Lang with some reason nor [is ignored](#ignored) in L of Lang with some reason.

> THE TYPE OF THE UNKNOWN turns a count into a queue. `runtime_dependent` and
> `no_source_target` (a synthesised constructor with no node to point at) are
> the subject's; `not_yet`, `budget_exhausted`, `out_of_scope` are ours. A
> not_modelled cell nobody explained is `not_yet`. `bad_reason` is a word in no
> taxonomy — it also falls out of both counts, so the test asserts the sum.
> `stale_reason` is an excuse that outlived its cause, and demands the cell
> EXIST so an unknown kind is not laundered into "fixed".

`unknown_type` lists:

| arg 1 | arg 2 |
|---|---|
| `runtime_dependent` | `irreducible` |
| `no_source_target` | `irreducible` |
| `not_yet` | `ours` |
| `budget_exhausted` | `ours` |
| `out_of_scope` | `ours` |

<a id="reason"></a>The reason of a kind K in a layer L for a language Lang is a reason R either:

1. if [the verdict](#verdict) of K in L for Lang is `not_modelled` and K [is unknown](#unknown_because) in L of Lang because R;
2. if all of:
   - [the verdict](#verdict) of K in L for Lang is `not_modelled`;
   - R is `not_yet`;
   - unless K [is unknown](#unknown_because) in L of Lang because some reason.

A kind K

- <a id="irreducible_unknown"></a>is irreducibly unknown in a layer L of a language Lang if [the reason](#reason) of K in L for Lang is a reason R and [`unknown_type`](#unknown_type)(R, `irreducible`).
- <a id="our_unknown"></a>is our unknown in a layer L of a language Lang if [the reason](#reason) of K in L for Lang is a reason R and [`unknown_type`](#unknown_type)(R, `ours`).

<a id="bad_reason"></a>The bad reason of a kind K in a layer L for a language Lang is a reason R if K [is unknown](#unknown_because) in L of Lang because R, unless [`unknown_type`](#unknown_type)(R, something).

A kind K

- <a id="stale_reason"></a>has a stale reason R in a layer L of a language Lang if all of:
  - K [is unknown](#unknown_because) in L of Lang because R;
  - K [is a cell](#cell) in L of Lang;
  - unless [the verdict](#verdict) of K in L for Lang is `not_modelled`.
- <a id="orphan_reason"></a>is an orphan reason in a layer L of a language Lang if K [is orphaned](#orphan) in L of Lang under `unknown_because`.

Declared as facts:

- <a id="unknown_type"></a>`unknown_type`
- A kind K is unknown in a layer L of a language Lang because a reason R
- A kind K is unknown with a shape S in a layer Lay of a language Lang because a reason R

## THE THIRD AXIS — SHAPE. `member_expression` is one kind and six jobs, and

> six of eleven missed edges sat inside one ticked cell, where a table keyed
> by kind is silent by construction. An axis is a COLUMN here, so adding one
> is a rule edit; what is a fact is which values it takes (`shape_of`), which
> layers it applies to (`axis_applies`) and that it exists (`axis`).
> Applicability is declared, not assumed — a callee shape says nothing about
> a module graph — and `unearned_axis` says when a declaration was wrong.
> `shape_in` gives each layer its own value vocabulary, so a specifier shape
> mints no phantom call-graph cell.

Declared as facts:

- <a id="axis"></a>An axis A is an axis
- <a id="axis_applies"></a>An axis A applies in a layer Lay
- <a id="shape_of"></a>A kind K has the shape S in a language Lang
- <a id="shape_in"></a>A shape S is a shape in a layer Lay

> A kind with no declared shape is ATOMIC and keeps one cell. `none` is earned
> two ways — the axis absent from the layer, or present with a kind that does
> not split — as two rules, so the second stays removable.

<a id="shape_kind"></a>A kind K has a shape axis in a layer Lay of a language Lang if K [has the shape](#shape_of) S in Lang and S [is a shape in](#shape_in) Lay.

A kind K is a cell with a shape N in a layer Lay of a language Lang either:

1. if all of:
   - Lang has the node kind K;
   - Lay is a layer;
   - N is `none`;
   - unless `shape` [applies](#axis_applies) in Lay;
2. if all of:
   - Lang has the node kind K;
   - Lay is a layer;
   - `shape` [applies](#axis_applies) in Lay;
   - N is `none`;
   - unless K [has a shape axis](#shape_kind) in Lay of Lang;
3. if all of:
   - K [has the shape](#shape_of) N in Lang;
   - N [is a shape in](#shape_in) Lay;
   - `shape` [applies](#axis_applies) in Lay.

> the refinement partitions the coarse matrix, checked both ways (`lost_cell`,
> `invented_cell`), and a cell is never both refined and unrefined

A kind K

- <a id="coarse_of"></a>has a shaped cell in a layer Lay of a language Lang if K [is a cell](#cell) with some shape in Lay of Lang.
- <a id="lost_cell"></a>is a lost cell in a layer Lay of a language Lang if K [is a cell](#cell) in Lay of Lang, unless K [has a shaped cell](#coarse_of) in Lay of Lang.
- <a id="invented_cell"></a>is an invented cell in a layer Lay of a language Lang if K [has a shaped cell](#coarse_of) in Lay of Lang, unless K [is a cell](#cell) in Lay of Lang.
- <a id="refined_cell"></a>is a refined cell in a layer Lay of a language Lang if K [is a cell](#cell) with a shape S in Lay of Lang and S differs from `none`.
- <a id="double_cell"></a>is a double cell in a layer Lay of a language Lang if K [is a cell](#cell) with `none` in Lay of Lang and K [is a refined cell](#refined_cell) in Lay of Lang.

<a id="orphan_shape"></a>A shape is an orphan shape of a kind K in a language Lang if K [has the shape](#shape_of) it in Lang, unless Lang has the node kind K.

<a id="orphan_axis"></a>An axis X is an orphan axis in a layer Lay either:

1. if X [applies](#axis_applies) in Lay, unless X [is an axis](#axis);
2. if X [applies](#axis_applies) in Lay, unless Lay is a layer.

## THE CLAIM LEDGER AT SHAPE GRANULARITY. A kind-level claim answers only for an

> UNREFINED cell: `handled(js, member_expression, callgraph, …)` ticks nothing
> once the cell is split and is reported by `coarser_claim` rather than
> deleted or honoured. The rest is the coarse machinery at one more argument;
> the check is generic over the LEDGER and not the arity, so a fourth axis
> needs `claim/7` and one more copy.

<a id="shaped_handled"></a>A kind K is handled for shape S in a layer Lay of a language Lang with a reason R either:

1. if K [is handled](#handled) with S in Lay of Lang with R;
2. if all of:
   - K [is handled](#handled) in Lay of Lang with R;
   - K [is a cell](#cell) with `none` in Lay of Lang;
   - S is `none`.

<a id="shaped_ignored"></a>A kind K is ignored for shape S in a layer Lay of a language Lang with a reason R either:

1. if K [is ignored](#ignored) with S in Lay of Lang with R;
2. if all of:
   - K [is ignored](#ignored) in Lay of Lang with R;
   - K [is a cell](#cell) with `none` in Lay of Lang;
   - S is `none`.

<a id="shaped_because"></a>A kind K is unknown for shape S in a layer Lay of a language Lang because a reason R either:

1. if K [is unknown](#unknown_because) with S in Lay of Lang because R;
2. if all of:
   - K [is unknown](#unknown_because) in Lay of Lang because R;
   - K [is a cell](#cell) with `none` in Lay of Lang;
   - S is `none`.

<a id="coarser_claim"></a>A kind K has a coarser claim R in a layer Lay of a language Lang either:

1. if all of:
   - K [is handled](#handled) in Lay of Lang with R;
   - K [has a shape axis](#shape_kind) in Lay of Lang;
   - `shape` [applies](#axis_applies) in Lay;
2. if all of:
   - K [is ignored](#ignored) in Lay of Lang with R;
   - K [has a shape axis](#shape_kind) in Lay of Lang;
   - `shape` [applies](#axis_applies) in Lay.

The verdict of a kind K with a shape S in a layer Lay for a language Lang is a verdict N either:

1. if K [is handled for shape](#shaped_handled) S in Lay of Lang with some reason and N is `modelled`;
2. if K [is ignored for shape](#shaped_ignored) S in Lay of Lang with some reason and N is `waived`;
3. if all of:
   - K [is a cell](#cell) with S in Lay of Lang;
   - N is `not_modelled`;
   - K neither [is handled for shape](#shaped_handled) S in Lay of Lang with some reason nor [is ignored for shape](#shaped_ignored) S in Lay of Lang with some reason.

A kind K is double claimed with a shape S in a layer Lay of a language Lang if [the verdict](#verdict) of K with S in Lay for Lang is `modelled` and [the verdict](#verdict) of K with S in Lay for Lang is `waived`.

In the main:

A kind K is claimed with a shape S in a layer Lay of a language Lang under a ledger N with a reason R either:

1. if K [is handled](#handled) with S in Lay of Lang with R and N is `handled`;
2. if K [is ignored](#ignored) with S in Lay of Lang with R and N is `ignored`;
3. if K [is unknown](#unknown_because) with S in Lay of Lang because R and N is `unknown_because`.

A kind K

- is handled/ignored with a shape S in a layer Lay of a language Lang with a reason R if K [is claimed](#claim) with S in Lay of Lang under `handled`/`ignored` with R.
- is unknown with a shape S in a layer Lay of a language Lang because a reason R if K [is claimed](#claim) with S in Lay of Lang under `unknown_because` with R.

In the audit:

A kind K is orphaned with a shape S in a layer Lay of a language Lang under a ledger What if K [is claimed](#claim) with S in Lay of Lang under What with some reason, unless K [is a cell](#cell) with S in Lay of Lang.

A ledger is an unknown ledger if some kind [is claimed](#claim) with some shape in some layer of some language under it with some reason, unless it [is a ledger](#claim_kind).

A kind K

- is an orphan claim with a shape S in a layer Lay of a language Lang if K [is orphaned](#orphan) with S in Lay of Lang under `handled` or `ignored`.
- is an orphan reason with a shape S in a layer Lay of a language Lang if K [is orphaned](#orphan) with S in Lay of Lang under `unknown_because`.

The reason of a kind K with a shape S in a layer Lay for a language Lang is a reason R either:

1. if [the verdict](#verdict) of K with S in Lay for Lang is `not_modelled` and K [is unknown for shape](#shaped_because) S in Lay of Lang because R;
2. if all of:
   - [the verdict](#verdict) of K with S in Lay for Lang is `not_modelled`;
   - R is `not_yet`;
   - unless K [is unknown for shape](#shaped_because) S in Lay of Lang because some reason.

The bad reason of a kind K with a shape S in a layer Lay for a language Lang is a reason R if K [is unknown](#unknown_because) with S in Lay of Lang because R, unless [`unknown_type`](#unknown_type)(R, something).

A kind K

- is irreducibly unknown with a shape S in a layer Lay of a language Lang if [the reason](#reason) of K with S in Lay for Lang is a reason R and [`unknown_type`](#unknown_type)(R, `irreducible`).
- is our unknown with a shape S in a layer Lay of a language Lang if [the reason](#reason) of K with S in Lay for Lang is a reason R and [`unknown_type`](#unknown_type)(R, `ours`).

## AN AXIS EARNS A LAYER when it makes the model say something different about

> two shapes of the SAME kind there — a different verdict or reason.
> Otherwise it multiplied the table and answered nothing.

<a id="refined_verdict"></a>The refined verdict of a kind K in a layer Lay for a language Lang is a verdict V if [the verdict](#verdict) of K with a shape S in Lay for Lang is V and S differs from `none`.

<a id="refined_reason"></a>The refined reason of a kind K in a layer Lay for a language Lang is a reason R if [the reason](#reason) of K with a shape S in Lay for Lang is R and S differs from `none`.

<a id="axis_earns"></a>An axis X earns its place in a layer Lay either:

1. if all of:
   - X [is an axis](#axis);
   - [the refined verdict](#refined_verdict) of a kind K in Lay for a language Lang is a verdict V;
   - [the refined verdict](#refined_verdict) of K in Lay for Lang is a verdict W;
   - V differs from W;
2. if all of:
   - X [is an axis](#axis);
   - [the refined reason](#refined_reason) of a kind K in Lay for a language Lang is a reason R1;
   - [the refined reason](#refined_reason) of K in Lay for Lang is a reason R2;
   - R1 differs from R2.

<a id="unearned_axis"></a>An axis is unearned in a layer Lay if it [applies](#axis_applies) in Lay, unless it [earns its place](#axis_earns) in Lay.

> [code] reads the kind and shape tables in [main]; [audit] reads the
> scanner's book.

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `code` | `main` |

## THE FRAME ITSELF. A kind nobody declared is outside the matrix, not a hole

> in it — measured: thirty of fifty-one kinds in one probe were undeclared
> while every audit sat at zero. `vocabulary_gap` grows with the corpus, and
> a kind it names is declared or excluded with a reason: `not_a_construct`
> (the scanner's own roots and trivia) or `frame_deferred` with an owner.
> Both exclusion lists are guarded against a misspelling. `ast_node` is edb
> here because this file loads in worlds with no corpus at all.

`lang_of_corpus` includes `js`.

A kind K

- <a id="vocabulary_gap"></a>is a vocabulary gap in a language Lang if all of:
  - some node [is of kind](#ast_node) K;
  - Lang [is the corpus language](#lang_of_corpus);
  - K neither [is not a construct](#not_a_construct) nor [is deferred to the frame](#frame_deferred) because some reason;
  - unless Lang has the node kind K.
- <a id="not_a_construct_unseen"></a>is excluded yet unseen if K [is not a construct](#not_a_construct), unless some node [is of kind](#ast_node) K.
- <a id="frame_deferred_unseen"></a>is deferred yet unseen if K [is deferred to the frame](#frame_deferred) because some reason, unless some node [is of kind](#ast_node) K.
- <a id="double_excluded"></a>is excluded twice if K [is not a construct](#not_a_construct) and K [is deferred to the frame](#frame_deferred) because some reason.
- <a id="declared_and_excluded"></a>is declared yet excluded if some language has the node kind K and K [is not a construct](#not_a_construct).
- <a id="declared_and_deferred"></a>is declared yet deferred if some language has the node kind K and K [is deferred to the frame](#frame_deferred) because some reason.

Declared as facts:

- <a id="ast_node"></a>`ast_node`
- <a id="lang_of_corpus"></a>A language L is the corpus language
- <a id="not_a_construct"></a>A kind K is not a construct
- <a id="frame_deferred"></a>A kind K is deferred to the frame because a reason R
- <a id="kind_absent_ok"></a>A kind K is excused absent because a reason R

> `kind_unexercised`: a declared kind no node in the corpus has — allowed, but
> the reason must be written (`kind_absent_ok`), which is what exposed
> `ts_string_keyword` as a spelling the scanner cannot produce. Guarded by
> `scanned`, a proposition: the first draft used `lang_of_corpus(Lang)`, a
> constant that guarded nothing. A `kind_absent_ok` row belongs in the pack
> that declares its kind.

<a id="corpus_scanned"></a>`corpus_scanned`() if some node [is of kind](#ast_node) some kind.

<a id="scanned"></a>A language has a scanned corpus if it [is the corpus language](#lang_of_corpus) and [`corpus_scanned`](#corpus_scanned)().

A kind K

- <a id="kind_unexercised"></a>is unexercised in a language Lang if all of:
  - Lang has the node kind K;
  - Lang [has a scanned corpus](#scanned);
  - unless some node [is of kind](#ast_node) K or K [is excused absent](#kind_absent_ok) because some reason.
- <a id="kind_absent_stale"></a>is excused yet present if K [is excused absent](#kind_absent_ok) because some reason and some node [is of kind](#ast_node) K.
- <a id="kind_absent_undeclared"></a>is excused yet undeclared if K [is excused absent](#kind_absent_ok) because some reason, unless some language has the node kind K.

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `audit` | `code` |


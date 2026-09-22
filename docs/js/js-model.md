---
world: js-model
books: audit, code, main
---

# js-model

## Terms

*kind*.

> js-model.rofl — THE COVERAGE MATRIX: node kind x layer (x shape), and
> every cell carries a verdict. The one claim this file tests: adding a layer
> is ONE FACT, and the audit enumerates every cell it needs with no rule edit.
> Declared as [audit]: a coverage gap is a statement about the model, not
> about the domain.

> Three buckets partition the matrix, and a waiver moves a cell between them
> rather than out of sight: the first version let `ignored` count as covered,
> and declaring the whole matrix ignored drove the audit to zero.

<a id="modelled"></a>`modelled`(Lang, K, L) if [`handled`](#handled)(Lang, K, L, something).

<a id="waived"></a>`waived`(Lang, K, L) if [`ignored`](#ignored)(Lang, K, L, something).

<a id="unaccounted"></a>`unaccounted`(Lang, K, L) if all of:
  - `node_kind`(Lang, K);
  - `layer`(L);
  - unless [`modelled`](#modelled)(Lang, K, L);
  - unless [`waived`](#waived)(Lang, K, L).

<a id="double_claimed"></a>`double_claimed`(Lang, K, L) if [`modelled`](#modelled)(Lang, K, L) and [`waived`](#waived)(Lang, K, L).

> A CLAIM NAMING A CELL THAT DOES NOT EXIST evaporates silently (`handled(js,
> variable_declarator, …)` for an undeclared kind moved no count). The check
> was written by hand once per ledger and the fourth ledger reopened it, so
> the ledger name is an ARGUMENT: `claim(What, …)` is one relation, the
> vocabulary check is one rule per arity, and `claim_kind` closes the hole the
> normalisation opens — a misspelt ledger name. Adoption and projection go
> both ways: the authored facts stay bare, and a claim in the new spelling
> still ticks.

<a id="claim_kind"></a>`claim_kind` includes handled, ignored, unknown_because.

<a id="claim"></a>`claim`(N, Lang, K, L, R) either:

1. if [`handled`](#handled)(Lang, K, L, R) and N is handled;
2. if [`ignored`](#ignored)(Lang, K, L, R) and N is ignored;
3. if [`unknown_because`](#unknown_because)(Lang, K, L, R) and N is unknown_because.

<a id="handled"></a>`handled`(Lang, K, L, R) if [`claim`](#claim)(handled, Lang, K, L, R).

<a id="ignored"></a>`ignored`(Lang, K, L, R) if [`claim`](#claim)(ignored, Lang, K, L, R).

<a id="unknown_because"></a>`unknown_because`(Lang, K, L, R) if [`claim`](#claim)(unknown_because, Lang, K, L, R).

Declared as facts: claim, claim_kind.

> `not cell` rather than `not node_kind` and `not layer` apart: the cell is
> their conjunction.

<a id="orphan"></a>`orphan`(What, Lang, K, L) if [`claim`](#claim)(What, Lang, K, L, something), unless [`cell`](#cell)(Lang, K, L).

<a id="unknown_ledger"></a>`unknown_ledger`(What) if [`claim`](#claim)(What, something, something, something, something), unless [`claim_kind`](#claim_kind)(What).

<a id="orphan_claim"></a>`orphan_claim`(Lang, K, L) either:

1. if [`orphan`](#orphan)(handled, Lang, K, L);
2. if [`orphan`](#orphan)(ignored, Lang, K, L).

<a id="cell"></a>`cell`(Lang, K, L) if `node_kind`(Lang, K) and `layer`(L).

## THE LAYER LIST IS THE OWNER'S, as a row. `layer(L)` is one fact and opens

> 59 cells, so the size of the programme is set by this list and by nothing
> else. A promise cannot refuse; `layer_unauthorised` can. Five layers, each
> added by his word, the fifth with the ownership of its cells in one commit.

<a id="layer_authorised"></a>`layer_authorised` includes callgraph, dataflow, modules, controlflow, effect.

<a id="layer_unauthorised"></a>`layer_unauthorised`(L) if `layer`(L), unless [`layer_authorised`](#layer_authorised)(L).

Declared as facts: layer_authorised.

> Convergence between languages needs EVIDENCE on both sides: `checked` is a
> cell run against an oracle. The first version compared rule atoms and
> reported eight agreements between rules that existed nowhere.

<a id="verified"></a>`verified`(Lang, K, L, Rule) if [`handled`](#handled)(Lang, K, L, Rule) and [`checked`](#checked)(Lang, K, L, Rule, something, something).

<a id="converges"></a>`converges`(L, Rule, X, B) if all of:
  - [`verified`](#verified)(X, something, L, Rule);
  - [`verified`](#verified)(B, something, L, Rule);
  - X differs from B.

<a id="unverified"></a>`unverified`(Lang, K, L, Rule) if [`handled`](#handled)(Lang, K, L, Rule), unless [`checked`](#checked)(Lang, K, L, Rule, something, something).

Declared as facts: checked.

## THE DEFAULT VERDICT. Every cell carries one and `not_modelled` is the one it

> is born with — a positive row `why` can answer, where the absence of an
> `unaccounted` row could only be approached with `whynot`. The first two arms
> deliberately carry no `cell` premise: a claim over no cell yields a verdict
> with no cell under it and the partition stops summing — a second, independent
> detector for what `orphan_claim` reports.

<a id="verdict"></a>`verdict`(Lang, K, L, N) either:

1. if [`handled`](#handled)(Lang, K, L, something) and N is modelled;
2. if [`ignored`](#ignored)(Lang, K, L, something) and N is waived;
3. if all of:
   - [`cell`](#cell)(Lang, K, L);
   - N is not_modelled;
   - unless [`handled`](#handled)(Lang, K, L, something);
   - unless [`ignored`](#ignored)(Lang, K, L, something).

> THE TYPE OF THE UNKNOWN turns a count into a queue. `runtime_dependent` and
> `no_source_target` (a synthesised constructor with no node to point at) are
> the subject's; `not_yet`, `budget_exhausted`, `out_of_scope` are ours. A
> not_modelled cell nobody explained is `not_yet`. `bad_reason` is a word in no
> taxonomy — it also falls out of both counts, so the test asserts the sum.
> `stale_reason` is an excuse that outlived its cause, and demands the cell
> EXIST so an unknown kind is not laundered into "fixed".

<a id="unknown_type"></a>`unknown_type` lists:

| arg 1 | arg 2 |
|---|---|
| runtime_dependent | irreducible |
| no_source_target | irreducible |
| not_yet | ours |
| budget_exhausted | ours |
| out_of_scope | ours |

<a id="reason"></a>`reason`(Lang, K, L, R) either:

1. if [`verdict`](#verdict)(Lang, K, L, not_modelled) and [`unknown_because`](#unknown_because)(Lang, K, L, R);
2. if all of:
   - [`verdict`](#verdict)(Lang, K, L, not_modelled);
   - R is not_yet;
   - unless [`unknown_because`](#unknown_because)(Lang, K, L, something).

<a id="irreducible_unknown"></a>`irreducible_unknown`(Lang, K, L) if [`reason`](#reason)(Lang, K, L, R) and [`unknown_type`](#unknown_type)(R, irreducible).

<a id="our_unknown"></a>`our_unknown`(Lang, K, L) if [`reason`](#reason)(Lang, K, L, R) and [`unknown_type`](#unknown_type)(R, ours).

<a id="bad_reason"></a>`bad_reason`(Lang, K, L, R) if [`unknown_because`](#unknown_because)(Lang, K, L, R), unless [`unknown_type`](#unknown_type)(R, something).

<a id="stale_reason"></a>`stale_reason`(Lang, K, L, R) if all of:
  - [`unknown_because`](#unknown_because)(Lang, K, L, R);
  - [`cell`](#cell)(Lang, K, L);
  - unless [`verdict`](#verdict)(Lang, K, L, not_modelled).

<a id="orphan_reason"></a>`orphan_reason`(Lang, K, L) if [`orphan`](#orphan)(unknown_because, Lang, K, L).

Declared as facts: unknown_type, unknown_because.

## THE THIRD AXIS — SHAPE. `member_expression` is one kind and six jobs, and

> six of eleven missed edges sat inside one ticked cell, where a table keyed
> by kind is silent by construction. An axis is a COLUMN here, so adding one
> is a rule edit; what is a fact is which values it takes (`shape_of`), which
> layers it applies to (`axis_applies`) and that it exists (`axis`).
> Applicability is declared, not assumed — a callee shape says nothing about
> a module graph — and `unearned_axis` says when a declaration was wrong.
> `shape_in` gives each layer its own value vocabulary, so a specifier shape
> mints no phantom call-graph cell.

Declared as facts: axis, axis_applies, shape_of, shape_in.

> A kind with no declared shape is ATOMIC and keeps one cell. `none` is earned
> two ways — the axis absent from the layer, or present with a kind that does
> not split — as two rules, so the second stays removable.

<a id="shape_kind"></a>`shape_kind`(Lang, K, Lay) if [`shape_of`](#shape_of)(Lang, K, S) and [`shape_in`](#shape_in)(S, Lay).

`cell`(Lang, K, N, Lay) either:

1. if all of:
   - `node_kind`(Lang, K);
   - `layer`(Lay);
   - N is none;
   - unless [`axis_applies`](#axis_applies)(shape, Lay);
2. if all of:
   - `node_kind`(Lang, K);
   - `layer`(Lay);
   - [`axis_applies`](#axis_applies)(shape, Lay);
   - N is none;
   - unless [`shape_kind`](#shape_kind)(Lang, K, Lay);
3. if all of:
   - [`shape_of`](#shape_of)(Lang, K, N);
   - [`shape_in`](#shape_in)(N, Lay);
   - [`axis_applies`](#axis_applies)(shape, Lay).

> the refinement partitions the coarse matrix, checked both ways (`lost_cell`,
> `invented_cell`), and a cell is never both refined and unrefined

<a id="coarse_of"></a>`coarse_of`(Lang, K, Lay) if [`cell`](#cell)(Lang, K, something, Lay).

<a id="lost_cell"></a>`lost_cell`(Lang, K, Lay) if [`cell`](#cell)(Lang, K, Lay), unless [`coarse_of`](#coarse_of)(Lang, K, Lay).

<a id="invented_cell"></a>`invented_cell`(Lang, K, Lay) if [`coarse_of`](#coarse_of)(Lang, K, Lay), unless [`cell`](#cell)(Lang, K, Lay).

<a id="refined_cell"></a>`refined_cell`(Lang, K, Lay) if [`cell`](#cell)(Lang, K, S, Lay) and S differs from none.

<a id="double_cell"></a>`double_cell`(Lang, K, Lay) if [`cell`](#cell)(Lang, K, none, Lay) and [`refined_cell`](#refined_cell)(Lang, K, Lay).

<a id="orphan_shape"></a>`orphan_shape`(Lang, K, S) if [`shape_of`](#shape_of)(Lang, K, S), unless `node_kind`(Lang, K).

<a id="orphan_axis"></a>`orphan_axis`(X, Lay) either:

1. if [`axis_applies`](#axis_applies)(X, Lay), unless [`axis`](#axis)(X);
2. if [`axis_applies`](#axis_applies)(X, Lay), unless `layer`(Lay).

## THE CLAIM LEDGER AT SHAPE GRANULARITY. A kind-level claim answers only for an

> UNREFINED cell: `handled(js, member_expression, callgraph, …)` ticks nothing
> once the cell is split and is reported by `coarser_claim` rather than
> deleted or honoured. The rest is the coarse machinery at one more argument;
> the check is generic over the LEDGER and not the arity, so a fourth axis
> needs `claim/7` and one more copy.

<a id="shaped_handled"></a>`shaped_handled`(Lang, K, S, Lay, R) either:

1. if [`handled`](#handled)(Lang, K, S, Lay, R);
2. if [`handled`](#handled)(Lang, K, Lay, R), [`cell`](#cell)(Lang, K, none, Lay), and S is none.

<a id="shaped_ignored"></a>`shaped_ignored`(Lang, K, S, Lay, R) either:

1. if [`ignored`](#ignored)(Lang, K, S, Lay, R);
2. if [`ignored`](#ignored)(Lang, K, Lay, R), [`cell`](#cell)(Lang, K, none, Lay), and S is none.

<a id="shaped_because"></a>`shaped_because`(Lang, K, S, Lay, R) either:

1. if [`unknown_because`](#unknown_because)(Lang, K, S, Lay, R);
2. if all of:
   - [`unknown_because`](#unknown_because)(Lang, K, Lay, R);
   - [`cell`](#cell)(Lang, K, none, Lay);
   - S is none.

<a id="coarser_claim"></a>`coarser_claim`(Lang, K, Lay, R) either:

1. if all of:
   - [`handled`](#handled)(Lang, K, Lay, R);
   - [`shape_kind`](#shape_kind)(Lang, K, Lay);
   - [`axis_applies`](#axis_applies)(shape, Lay);
2. if all of:
   - [`ignored`](#ignored)(Lang, K, Lay, R);
   - [`shape_kind`](#shape_kind)(Lang, K, Lay);
   - [`axis_applies`](#axis_applies)(shape, Lay).

`verdict`(Lang, K, S, Lay, N) either:

1. if [`shaped_handled`](#shaped_handled)(Lang, K, S, Lay, something) and N is modelled;
2. if [`shaped_ignored`](#shaped_ignored)(Lang, K, S, Lay, something) and N is waived;
3. if all of:
   - [`cell`](#cell)(Lang, K, S, Lay);
   - N is not_modelled;
   - unless [`shaped_handled`](#shaped_handled)(Lang, K, S, Lay, something);
   - unless [`shaped_ignored`](#shaped_ignored)(Lang, K, S, Lay, something).

`double_claimed`(Lang, K, S, Lay) if [`verdict`](#verdict)(Lang, K, S, Lay, modelled) and [`verdict`](#verdict)(Lang, K, S, Lay, waived).

`claim`(N, Lang, K, S, Lay, R) either:

1. if [`handled`](#handled)(Lang, K, S, Lay, R) and N is handled;
2. if [`ignored`](#ignored)(Lang, K, S, Lay, R) and N is ignored;
3. if [`unknown_because`](#unknown_because)(Lang, K, S, Lay, R) and N is unknown_because.

`handled`(Lang, K, S, Lay, R) if [`claim`](#claim)(handled, Lang, K, S, Lay, R).

`ignored`(Lang, K, S, Lay, R) if [`claim`](#claim)(ignored, Lang, K, S, Lay, R).

`unknown_because`(Lang, K, S, Lay, R) if [`claim`](#claim)(unknown_because, Lang, K, S, Lay, R).

`orphan`(What, Lang, K, S, Lay) if [`claim`](#claim)(What, Lang, K, S, Lay, something), unless [`cell`](#cell)(Lang, K, S, Lay).

`unknown_ledger`(What) if [`claim`](#claim)(What, something, something, something, something, something), unless [`claim_kind`](#claim_kind)(What).

`orphan_claim`(Lang, K, S, Lay) either:

1. if [`orphan`](#orphan)(handled, Lang, K, S, Lay);
2. if [`orphan`](#orphan)(ignored, Lang, K, S, Lay).

`orphan_reason`(Lang, K, S, Lay) if [`orphan`](#orphan)(unknown_because, Lang, K, S, Lay).

`reason`(Lang, K, S, Lay, R) either:

1. if [`verdict`](#verdict)(Lang, K, S, Lay, not_modelled) and [`shaped_because`](#shaped_because)(Lang, K, S, Lay, R);
2. if all of:
   - [`verdict`](#verdict)(Lang, K, S, Lay, not_modelled);
   - R is not_yet;
   - unless [`shaped_because`](#shaped_because)(Lang, K, S, Lay, something).

`bad_reason`(Lang, K, S, Lay, R) if [`unknown_because`](#unknown_because)(Lang, K, S, Lay, R), unless [`unknown_type`](#unknown_type)(R, something).

`irreducible_unknown`(Lang, K, S, Lay) if [`reason`](#reason)(Lang, K, S, Lay, R) and [`unknown_type`](#unknown_type)(R, irreducible).

`our_unknown`(Lang, K, S, Lay) if [`reason`](#reason)(Lang, K, S, Lay, R) and [`unknown_type`](#unknown_type)(R, ours).

## AN AXIS EARNS A LAYER when it makes the model say something different about

> two shapes of the SAME kind there — a different verdict or reason.
> Otherwise it multiplied the table and answered nothing.

<a id="refined_verdict"></a>`refined_verdict`(Lang, K, Lay, V) if [`verdict`](#verdict)(Lang, K, S, Lay, V) and S differs from none.

<a id="refined_reason"></a>`refined_reason`(Lang, K, Lay, R) if [`reason`](#reason)(Lang, K, S, Lay, R) and S differs from none.

<a id="axis_earns"></a>`axis_earns`(X, Lay) either:

1. if all of:
   - [`axis`](#axis)(X);
   - [`refined_verdict`](#refined_verdict)(Lang, K, Lay, V);
   - [`refined_verdict`](#refined_verdict)(Lang, K, Lay, W);
   - V differs from W;
2. if all of:
   - [`axis`](#axis)(X);
   - [`refined_reason`](#refined_reason)(Lang, K, Lay, R1);
   - [`refined_reason`](#refined_reason)(Lang, K, Lay, R2);
   - R1 differs from R2.

<a id="unearned_axis"></a>`unearned_axis`(X, Lay) if [`axis_applies`](#axis_applies)(X, Lay), unless [`axis_earns`](#axis_earns)(X, Lay).

> [code] reads the kind and shape tables in [main]; [audit] reads the
> scanner's book.

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| code | main |

## THE FRAME ITSELF. A kind nobody declared is outside the matrix, not a hole

> in it — measured: thirty of fifty-one kinds in one probe were undeclared
> while every audit sat at zero. `vocabulary_gap` grows with the corpus, and
> a kind it names is declared or excluded with a reason: `not_a_construct`
> (the scanner's own roots and trivia) or `frame_deferred` with an owner.
> Both exclusion lists are guarded against a misspelling. `ast_node` is edb
> here because this file loads in worlds with no corpus at all.

<a id="lang_of_corpus"></a>`lang_of_corpus` includes js.

<a id="vocabulary_gap"></a>`vocabulary_gap`(Lang, K) if all of:
  - some node [is of kind](#ast_node) K;
  - [`lang_of_corpus`](#lang_of_corpus)(Lang);
  - unless `node_kind`(Lang, K);
  - unless [`not_a_construct`](#not_a_construct)(K);
  - unless [`frame_deferred`](#frame_deferred)(K, something).

<a id="not_a_construct_unseen"></a>`not_a_construct_unseen`(K) if [`not_a_construct`](#not_a_construct)(K), unless some node [is of kind](#ast_node) K.

<a id="frame_deferred_unseen"></a>`frame_deferred_unseen`(K) if [`frame_deferred`](#frame_deferred)(K, something), unless some node [is of kind](#ast_node) K.

<a id="double_excluded"></a>`double_excluded`(K) if [`not_a_construct`](#not_a_construct)(K) and [`frame_deferred`](#frame_deferred)(K, something).

<a id="declared_and_excluded"></a>`declared_and_excluded`(K) if `node_kind`(something, K) and [`not_a_construct`](#not_a_construct)(K).

<a id="declared_and_deferred"></a>`declared_and_deferred`(K) if `node_kind`(something, K) and [`frame_deferred`](#frame_deferred)(K, something).

Declared as facts: ast_node, lang_of_corpus, not_a_construct, frame_deferred, kind_absent_ok.

> `kind_unexercised`: a declared kind no node in the corpus has — allowed, but
> the reason must be written (`kind_absent_ok`), which is what exposed
> `ts_string_keyword` as a spelling the scanner cannot produce. Guarded by
> `scanned`, a proposition: the first draft used `lang_of_corpus(Lang)`, a
> constant that guarded nothing. A `kind_absent_ok` row belongs in the pack
> that declares its kind.

<a id="corpus_scanned"></a>`corpus_scanned`() if some node [is of kind](#ast_node) some kind.

<a id="scanned"></a>`scanned`(Lang) if [`lang_of_corpus`](#lang_of_corpus)(Lang) and [`corpus_scanned`](#corpus_scanned)().

<a id="kind_unexercised"></a>`kind_unexercised`(Lang, K) if all of:
  - `node_kind`(Lang, K);
  - [`scanned`](#scanned)(Lang);
  - unless some node [is of kind](#ast_node) K;
  - unless [`kind_absent_ok`](#kind_absent_ok)(K, something).

<a id="kind_absent_stale"></a>`kind_absent_stale`(K) if [`kind_absent_ok`](#kind_absent_ok)(K, something) and some node [is of kind](#ast_node) K.

<a id="kind_absent_undeclared"></a>`kind_absent_undeclared`(K) if [`kind_absent_ok`](#kind_absent_ok)(K, something), unless `node_kind`(something, K).

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| audit | code |

## Not defined in these files

- `layer`
- `node_kind`


---
world: js-env
books: audit, code, main
default: audit
---

# js-env

> js-env.rofl — THE ENVIRONMENT LAYER: is this program valid HERE, and what
> exactly stops being valid THERE. Reads `ast_node[code]` and facts/js-env.rofl
> and nothing else; the call graph has nothing to say about whether `a?.b`
> parses in es5, so this pack does not pay for it.
> 
> THE ENVIRONMENT IS A COLUMN, NOT A BOOK. The form this layer wants is
> `unsupported[node18](Site, Feat)`, two books whose disagreement is the
> answer, as rules/js-resolve.rofl writes it. A variable ledger on the LEFT
> of a crossing is gathered by `collects`; on the RIGHT it has no instrument
> (`f_the_leak_audit_now_fires_on_a_ledger_polymorphic_head`), and a derived
> per-environment conclusion is that case. When that is fixed the head of
> `unsupported`, `valid` and `lost` loses its first argument and gains a
> bracket, and nothing else moves. The column is a placeholder for a bracket.

> the audits read the scanner's book

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `audit` | `code` |

## 1. WHAT AN ENVIRONMENT GIVES — COMPOSITION, NOT COMPARISON. An integer rank

> was the wrong key: TypeScript is not a later edition, two environments in
> one year could not separate each other, and the authority this repository
> reads models it as composition (lib.es2022.d.ts is es2021 plus six named
> parts). `reaches` is reflexive on purpose: a release provides its own
> features, and the transitive arm carries a release that includes two.

<a id="reaches"></a>`reaches`(R, N) either:

1. if `release`(R) and N is R;
2. if `includes`(R, Q) and [`reaches`](#reaches)(Q, N).

<a id="has_feature"></a>`has_feature`(R, F) if [`reaches`](#reaches)(R, P) and `provides`(P, F).

<a id="env_has"></a>`env_has`(E, F) if `environment`(E) and [`has_feature`](#has_feature)(E, F).

## 2. WHAT THE PROGRAM USES — one rule per place the era can hide, because the

> KIND IS NOT ALWAYS THE FEATURE:
>   the kind itself           `a?.b`                          kind_needs
>   an attribute of the node  `a ** b` beside `a * b`         attr_needs
>   a child of the node       `new.target` beside `import.meta`   child_needs
>   an ancestor of the node   top-level `await`               outside_attr_needs
> A `meta_property` carries no `ast_attr` at all, so only its `meta` child
> can tell ES2015 from ES2020. Top-level `await` is decided by an ancestor:
> `ast_attr(F, async, true)` marks every function form the scanner emits.

<a id="uses"></a>`uses`(N, F) either:

1. if N [is of kind](js-model.md#ast_node) K, `env_lang`(L), and `kind_needs`(L, K, F);
2. if all of:
   - N [is of kind](js-model.md#ast_node) K;
   - `env_lang`(L);
   - `attr_needs`(L, K, Key, V, F);
   - the attribute Key of N is V;
3. if all of:
   - N [is of kind](js-model.md#ast_node) K;
   - `env_lang`(L);
   - `child_needs`(L, K, Field, Name, F);
   - the Field of N is C;
   - C [is named](js-structure.md#ast_name) Name.

> Order is for cost: the two-row table binds Key and V, `ast_attr` is probed
> by the rare `async=true`, and only then does `ast_within` walk down. The
> negation goes last with N bound.

<a id="within_attr"></a>`within_attr`(N, Key, V) if all of:
  - `outside_attr_needs`(something, something, Key, V, something);
  - the attribute Key of X is V;
  - X [is within](js-structure.md#ast_within) N.

`uses`(N, F) if all of:
  - N [is of kind](js-model.md#ast_node) K;
  - `env_lang`(L);
  - `outside_attr_needs`(L, K, Key, V, F);
  - unless [`within_attr`](#within_attr)(N, Key, V).

<a id="used_feature"></a>`used_feature`(F) if [`uses`](#uses)(something, F).

## 3. THE VERDICT. `unsupported` is the whole answer; everything below is a

> projection of it to a coordinate a human can find, because `query` takes
> ONE literal and a join at the call site is not askable.

<a id="unsupported"></a>`unsupported`(E, N, F) if `environment`(E) and [`uses`](#uses)(N, F), unless [`env_has`](#env_has)(E, F).

<a id="unsupported_at"></a>`unsupported_at`(E, File, Line, F) if [`unsupported`](#unsupported)(E, N, F) and N [is of kind](js-model.md#ast_node) some kind in file File at line Line.

<a id="uses_at"></a>`uses_at`(File, Line, F) if [`uses`](#uses)(N, F) and N [is of kind](js-model.md#ast_node) some kind in file File at line Line.

<a id="uses_kind"></a>`uses_kind`(K, F) if [`uses`](#uses)(N, F) and N [is of kind](js-model.md#ast_node) K.

<a id="unsupported_in"></a>`unsupported_in`(E, File, F) if [`unsupported_at`](#unsupported_at)(E, File, something, F).

> «Валидна ли эта программа в окружении X?» — total over the files scanned,
> so a clean file produces a POSITIVE row: a silence cannot be told from a
> model that did not run.

<a id="file_broken"></a>`file_broken`(E, File) if [`unsupported`](#unsupported)(E, N, something) and N [is of kind](js-model.md#ast_node) some kind in file File.

> A FILE THE SCANNER REFUSED is neither valid nor invalid unless the host
> says so; the denominator is every file the scanner reported on, and a
> refused file is broken in EVERY environment (`w_env_scan_failed`). `edb`
> because corpus-free worlds load this pack.

<a id="scanned_file"></a>`scanned_file`(File) either:

1. if `ast_file`(something, File);
2. if [`ast_parse_error`](#ast_parse_error)(File, something).

`file_broken`(E, File) if `environment`(E) and [`ast_parse_error`](#ast_parse_error)(File, something).

<a id="valid"></a>`valid`(E, File) if all of:
  - `environment`(E);
  - [`scanned_file`](#scanned_file)(File);
  - unless [`file_broken`](#file_broken)(E, File).

<a id="invalid"></a>`invalid`(E, File) if all of:
  - `environment`(E);
  - [`scanned_file`](#scanned_file)(File);
  - [`file_broken`](#file_broken)(E, File).

Declared as facts: ast_parse_error.

## 4. «А что именно перестанет быть валидным?» — the difference between two

> environments, attributed to a site and a feature. A SET DIFFERENCE with no
> ordering premise: `lost(es2023, es5, ...)` is non-empty and the reverse is
> not because the data says so, and an edition and a runtime, incomparable,
> each lose things to the other.

<a id="lost"></a>`lost`(From, To, N, F) if all of:
  - [`unsupported`](#unsupported)(To, N, F);
  - `environment`(From);
  - From differs from To;
  - unless [`unsupported`](#unsupported)(From, N, F).

<a id="lost_feature"></a>`lost_feature`(From, To, F) if [`lost`](#lost)(From, To, something, F).

<a id="lost_at"></a>`lost_at`(From, To, File, Line, F) if [`lost`](#lost)(From, To, N, F) and N [is of kind](js-model.md#ast_node) some kind in file File at line Line.

## 5. THE GATES. Each is a statement this layer makes about itself, and

> test/js-env.test.ts plants a defect for every one.
> 
> `gate_feature` is the one place every gate table feeds; the audits were
> once written against `kind_needs` alone, and a typo in `attr_needs` moved
> `unsupported` with no audit naming it. One arm per table, here.

<a id="gate_feature"></a>`gate_feature`(L, K, F) either:

1. if `kind_needs`(L, K, F);
2. if `attr_needs`(L, K, something, something, F);
3. if `outside_attr_needs`(L, K, something, something, F);
4. if `child_needs`(L, K, something, something, F).

> `kind_gated` is NOT a consumer of `gate_feature`: it asks whether a kind's
> era is decided by the kind ITSELF. `binary_expression` is baseline and only
> its operator is gated, so wiring `attr_needs` here double-books it;
> `meta_property` has no baseline spelling, so `child_needs` belongs.

<a id="kind_gated"></a>`kind_gated`(L, K) either:

1. if `kind_needs`(L, K, something);
2. if `child_needs`(L, K, something, something, something).

<a id="kind_unaccounted"></a>`kind_unaccounted`(L, K) if all of:
  - `env_lang`(L);
  - `node_kind`(L, K);
  - unless [`kind_gated`](#kind_gated)(L, K);
  - unless `kind_baseline`(L, K).

> gated AND baseline: harmless to the answer, a lie about what was decided

<a id="kind_double_booked"></a>`kind_double_booked`(L, K) if [`kind_gated`](#kind_gated)(L, K) and `kind_baseline`(L, K).

> a feature a gate table names and `feature` does not declare: the site
> reports unsupported EVERYWHERE, a red that is a spelling mistake

<a id="feature_undeclared"></a>`feature_undeclared`(F) if [`gate_feature`](#gate_feature)(something, something, F), unless `feature`(F).

> a declared feature no environment has: `unsupported` trivially total for it

<a id="feature_unreachable"></a>`feature_unreachable`(F) if `feature`(F), unless [`any_env_has`](#any_env_has)(F).

<a id="any_env_has"></a>`any_env_has`(F) if [`env_has`](#env_has)(something, F).

> a declared feature no site uses — not an error, the number that says how
> much of the table the corpus exercises; and a waiver the corpus nevertheless
> produces, the day the scanner's plugin list grows

<a id="feature_unexercised"></a>`feature_unexercised`(F) if `feature`(F), unless [`used_feature`](#used_feature)(F), unless [`unscannable`](#unscannable)(F).

<a id="unscannable"></a>`unscannable`(F) if `feature_unscannable`(F, something).

<a id="unscannable_seen"></a>`unscannable_seen`(F) if [`unscannable`](#unscannable)(F) and [`used_feature`](#used_feature)(F).

> THE FRONTIER, expected non-zero: `node_kind` is authored and babel has 252
> concrete types. `kind_unaccounted` asks the same of the DECLARED
> vocabulary, where the answer must be zero.

<a id="kind_ungoverned"></a>`kind_ungoverned`(K) if all of:
  - some node [is of kind](js-model.md#ast_node) K;
  - `env_lang`(L);
  - unless [`kind_gated`](#kind_gated)(L, K);
  - unless `kind_baseline`(L, K).

> an environment with no place on the scale looks very old rather than broken

<a id="env_unranked"></a>`env_unranked`(E) if `environment`(E), unless [`has_rank`](#has_rank)(E).

<a id="has_rank"></a>`has_rank`(E) if `env_rank`(E, something).

> two environments agreeing on every site are one environment. No rank
> premise: `RA < RB` made two environments with the SAME rank — the
> indistinct case — never considered at all. `lost` carries the direction;
> both ways is the whole test.

<a id="env_separates"></a>`env_separates`(X, B) if [`lost_feature`](#lost_feature)(X, B, something).

<a id="env_pair_indistinct"></a>`env_pair_indistinct`(X, B) if all of:
  - `environment`(X);
  - `environment`(B);
  - X differs from B;
  - unless [`env_separates`](#env_separates)(X, B);
  - unless [`env_separates`](#env_separates)(B, X).

## Read from other files

- [ast_name](js-structure.md#ast_name)
- [ast_node](js-model.md#ast_node)
- [ast_within](js-structure.md#ast_within)

## Not defined in these files

- `ast_attr`
- `ast_child`
- `ast_file`
- `attr_needs`
- `child_needs`
- `env_lang`
- `env_rank`
- `environment`
- `feature`
- `feature_unscannable`
- `includes`
- `kind_baseline`
- `kind_needs`
- `node_kind`
- `outside_attr_needs`
- `provides`
- `release`


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

Reads:

- from js-model, in the code: [ast_node](js-model.rofl.md#ast_node)
- from js-structure, in the code: [ast_name](js-structure.rofl.md#ast_name), [ast_within](js-structure.rofl.md#ast_within)
- from outside these files, in the code:
  - <a id="ast_attr"></a>The attribute of a node is a value (`ast_attr`)
  - <a id="ast_child"></a>A node is a child of a node (`ast_child`)
  - <a id="ast_file"></a>`ast_file`
- from outside these files, in the main:
  - <a id="attr_needs"></a>`attr_needs`
  - <a id="child_needs"></a>A kind K needs at a field Field holding a text V a feature F in a language L (`child_needs`)
  - <a id="env_lang"></a>A language L is the environment language (`env_lang`)
  - <a id="env_rank"></a>An environment E dates from a number Year (`env_rank`)
  - <a id="environment"></a>An environment E is an environment (`environment`)
  - <a id="feature"></a>A feature F is a feature of a form Form (`feature`)
  - <a id="feature_unscannable"></a>A feature F is unscannable because a reason R (`feature_unscannable`)
  - <a id="includes"></a>A release R includes a release Q (`includes`)
  - <a id="kind_baseline"></a>A kind K is baseline in a language L (`kind_baseline`)
  - <a id="kind_needs"></a>A kind K needs a feature F in a language L (`kind_needs`)
  - <a id="node_kind"></a>A language L has the node kind K (`node_kind`)
  - <a id="outside_attr_needs"></a>`outside_attr_needs`
  - <a id="provides"></a>A release P provides the feature F (`provides`)
  - <a id="release"></a>A release R is a release (`release`)

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

<a id="reaches"></a>A release R reaches the release N either:

1. if R [is a release](#release) and N is R;
2. if R [includes](#includes) a release Q and Q [reaches the release](#reaches) N.

<a id="has_feature"></a>A release has the feature F if it [reaches the release](#reaches) P and P [provides the feature](#provides) F.

<a id="env_has"></a>An environment supports a feature F if it [is an environment](#environment) and it [has the feature](#has_feature) F.

## 2. WHAT THE PROGRAM USES — one rule per place the era can hide, because the

> KIND IS NOT ALWAYS THE FEATURE:
>   the kind itself           `a?.b`                          kind_needs
>   an attribute of the node  `a ** b` beside `a * b`         attr_needs
>   a child of the node       `new.target` beside `import.meta`   child_needs
>   an ancestor of the node   top-level `await`               outside_attr_needs
> A `meta_property` carries no `ast_attr` at all, so only its `meta` child
> can tell ES2015 from ES2020. Top-level `await` is decided by an ancestor:
> `ast_attr(F, async, true)` marks every function form the scanner emits.

<a id="uses"></a>A node N uses the feature F either:

1. if all of:
   - N [is of kind](js-model.rofl.md#ast_node) K;
   - a language L [is the environment language](#env_lang);
   - K [needs](#kind_needs) F in L;
2. if all of:
   - N [is of kind](js-model.rofl.md#ast_node) K;
   - a language L [is the environment language](#env_lang);
   - [`attr_needs`](#attr_needs)(L, K, Key, V, F);
   - [the attribute](#ast_attr) Key of N is V;
3. if all of:
   - N [is of kind](js-model.rofl.md#ast_node) K;
   - a language L [is the environment language](#env_lang);
   - K [needs at](#child_needs) a field Field holding Name F in L;
   - [the](#ast_child) Field of N [is named](js-structure.rofl.md#ast_name) Name.

> Order is for cost: the two-row table binds Key and V, `ast_attr` is probed
> by the rare `async=true`, and only then does `ast_within` walk down. The
> negation goes last with N bound.

A node

- <a id="within_attr"></a>contains the attribute Key holding V if all of:
  - [`outside_attr_needs`](#outside_attr_needs)(something, something, Key, V, something);
  - [the attribute](#ast_attr) Key of a node X is V;
  - it [is within](js-structure.rofl.md#ast_within) X.
- uses the feature F if all of:
  - it [is of kind](js-model.rofl.md#ast_node) K;
  - a language L [is the environment language](#env_lang);
  - [`outside_attr_needs`](#outside_attr_needs)(L, K, Key, V, F);
  - unless it [contains the attribute](#within_attr) Key holding V.

<a id="used_feature"></a>A feature is used if some node [uses the feature](#uses) it.

## 3. THE VERDICT. `unsupported` is the whole answer; everything below is a

> projection of it to a coordinate a human can find, because `query` takes
> ONE literal and a join at the call site is not askable.

<a id="unsupported"></a>A node fails in an environment E for a feature F if all of:
  - E [is an environment](#environment);
  - it [uses the feature](#uses) F;
  - unless E [supports](#env_has) F.

<a id="unsupported_at"></a>File fails at Line in an environment E for a feature F if a node N [fails](#unsupported) in E for F and N [is of kind](js-model.rofl.md#ast_node) some kind in file File at line Line.

<a id="uses_at"></a>File uses the feature F at Line if a node N [uses the feature](#uses) F and N [is of kind](js-model.rofl.md#ast_node) some kind in file File at line Line.

<a id="uses_kind"></a>A kind K is seen using a feature F if a node N [uses the feature](#uses) F and N [is of kind](js-model.rofl.md#ast_node) K.

<a id="unsupported_in"></a>File fails somewhere in an environment E for a feature F if File [fails](#unsupported_at) at some line in E for F.

> «Валидна ли эта программа в окружении X?» — total over the files scanned,
> so a clean file produces a POSITIVE row: a silence cannot be told from a
> model that did not run.

<a id="file_broken"></a>File is broken in an environment E if a node N [fails](#unsupported) in E for some feature and N [is in file](js-model.rofl.md#ast_node) File.

> A FILE THE SCANNER REFUSED is neither valid nor invalid unless the host
> says so; the denominator is every file the scanner reported on, and a
> refused file is broken in EVERY environment (`w_env_scan_failed`). `edb`
> because corpus-free worlds load this pack.

<a id="scanned_file"></a>File is scanned either:

1. if [`ast_file`](#ast_file)(something, File);
2. if [`ast_parse_error`](#ast_parse_error)(File, something).

File is broken in an environment E if E [is an environment](#environment) and [`ast_parse_error`](#ast_parse_error)(File, something).

<a id="valid"></a>File is valid in an environment E if all of:
  - E [is an environment](#environment);
  - File [is scanned](#scanned_file);
  - unless File [is broken in](#file_broken) E.

<a id="invalid"></a>File is invalid in an environment E if all of:
  - E [is an environment](#environment);
  - File [is scanned](#scanned_file);
  - File [is broken in](#file_broken) E.

Declared as facts:

- <a id="ast_parse_error"></a>`ast_parse_error`

## 4. «А что именно перестанет быть валидным?» — the difference between two

> environments, attributed to a site and a feature. A SET DIFFERENCE with no
> ordering premise: `lost(es2023, es5, ...)` is non-empty and the reverse is
> not because the data says so, and an edition and a runtime, incomparable,
> each lose things to the other.

<a id="lost"></a>A node is lost from an environment From to an environment To by a feature F if all of:
  - it [fails](#unsupported) in To for F;
  - From [is an environment](#environment);
  - From differs from To;
  - unless it [fails](#unsupported) in From for F.

<a id="lost_feature"></a>A feature is lost between an environment From and To if some node [is lost](#lost) from From to To by it.

<a id="lost_at"></a>File loses the feature F at Line from an environment From to an environment To if a node N [is lost](#lost) from From to To by F and N [is of kind](js-model.rofl.md#ast_node) some kind in file File at line Line.

## 5. THE GATES. Each is a statement this layer makes about itself, and

> test/js-env.test.ts plants a defect for every one.
> 
> `gate_feature` is the one place every gate table feeds; the audits were
> once written against `kind_needs` alone, and a typo in `attr_needs` moved
> `unsupported` with no audit naming it. One arm per table, here.

In the main:

<a id="gate_feature"></a>A kind K requires a feature F in a language L either:

1. if K [needs](#kind_needs) F in L;
2. if [`attr_needs`](#attr_needs)(L, K, something, something, F);
3. if [`outside_attr_needs`](#outside_attr_needs)(L, K, something, something, F);
4. if K [needs at](#child_needs) some field holding some text F in L.

> `kind_gated` is NOT a consumer of `gate_feature`: it asks whether a kind's
> era is decided by the kind ITSELF. `binary_expression` is baseline and only
> its operator is gated, so wiring `attr_needs` here double-books it;
> `meta_property` has no baseline spelling, so `child_needs` belongs.

<a id="kind_gated"></a>A kind K is gated in a language L either:

1. if K [needs](#kind_needs) some feature in L;
2. if K [needs at](#child_needs) some field holding some text some feature in L.

In the audit:

<a id="kind_unaccounted"></a>A kind K is unaccounted in a language L if all of:
  - L [is the environment language](#env_lang);
  - L [has the node kind](#node_kind) K;
  - K neither [is gated](#kind_gated) in L nor [is baseline](#kind_baseline) in L.

> gated AND baseline: harmless to the answer, a lie about what was decided

<a id="kind_double_booked"></a>A kind K is double booked in a language L if K [is gated](#kind_gated) in L and K [is baseline](#kind_baseline) in L.

> a feature a gate table names and `feature` does not declare: the site
> reports unsupported EVERYWHERE, a red that is a spelling mistake

<a id="feature_undeclared"></a>A feature is an undeclared feature if some kind [requires](#gate_feature) it in some language, unless [`feature`](#feature)(it).

> a declared feature no environment has: `unsupported` trivially total for it

A feature

- <a id="feature_unreachable"></a>is unreachable if [`feature`](#feature)(it), unless it [is supported somewhere](#any_env_has).
- <a id="any_env_has"></a>is supported somewhere if some environment [supports](#env_has) it.

> a declared feature no site uses — not an error, the number that says how
> much of the table the corpus exercises; and a waiver the corpus nevertheless
> produces, the day the scanner's plugin list grows

<a id="feature_unexercised"></a>A feature is unexercised if [`feature`](#feature)(it) and it neither [is used](#used_feature) nor [is unscannable](#unscannable).

In the main:

<a id="unscannable"></a>A feature is unscannable if it [is unscannable](#feature_unscannable) because some reason.

In the audit:

<a id="unscannable_seen"></a>A feature is unscannable yet seen if it [is unscannable](#unscannable) and it [is used](#used_feature).

> THE FRONTIER, expected non-zero: `node_kind` is authored and babel has 252
> concrete types. `kind_unaccounted` asks the same of the DECLARED
> vocabulary, where the answer must be zero.

<a id="kind_ungoverned"></a>A kind K is ungoverned if all of:
  - some node [is of kind](js-model.rofl.md#ast_node) K;
  - a language L [is the environment language](#env_lang);
  - K neither [is gated](#kind_gated) in L nor [is baseline](#kind_baseline) in L.

> an environment with no place on the scale looks very old rather than broken

<a id="env_unranked"></a>An environment is unranked if it [is an environment](#environment), unless it [has a rank](#has_rank).

In the main:

<a id="has_rank"></a>An environment has a rank if it [dates from](#env_rank) some number.

> two environments agreeing on every site are one environment. No rank
> premise: `RA < RB` made two environments with the SAME rank — the
> indistinct case — never considered at all. `lost` carries the direction;
> both ways is the whole test.

In the audit:

An environment

- <a id="env_separates"></a>is separated from an environment B if some feature [is lost between](#lost_feature) it and B.
- <a id="env_pair_indistinct"></a>is indistinct from an environment B if all of:
  - it [is an environment](#environment);
  - B [is an environment](#environment);
  - it differs from B;
  - unless it [is separated from](#env_separates) B or B [is separated from](#env_separates) it.


---
world: js-host
books: audit, code, flow, main, surface
default: audit
---

# js-host

> js-host.rofl — THE RUNTIME LAYER: what a program reaches for that is in
> neither the program nor the language. rules/js-env.rofl asks whether SYNTAX
> parses; rules/js-env-api.rofl whether a PROTOTYPE METHOD exists; neither can
> see `console.log`, `fs.readFileSync` or `fetch`, which come from the HOST.
> 
> TWO DOORS, ONE PRODUCT. A MODULE arrives through a boundary the model owns:
> rules/js-modules.rofl classifies, canonicalises and resolves `node:fs`, and
> the value layer follows it wherever it goes. A GLOBAL arrives from nowhere: the only
> thing that makes `console` a global is that NOTHING IN THE PROGRAM BINDS
> IT, a negation over the file. The doors are `host_module_ns` with
> `builtin_member`, and `host_global_ref[code]`; they meet at
> `host_call_effect[audit]`, the row the effect layer joins against.

> the audits read the scanner's book; `ast_parse_error` is `edb` because
> corpus-free worlds load this pack with no AST at all

Reads:

- from facts/js-host-surface.rofl, in the main:
  - <a id="host"></a>A host H is a host (`host`)
  - <a id="host_global"></a>A host H has the global Name (`host_global`)
  - <a id="host_member_deprecated"></a>A host H deprecates a key Key of a spec Spec (`host_member_deprecated`)
  - <a id="host_member_replaced_by"></a>A host H replaces a key Key of a spec Spec with a key Use (`host_member_replaced_by`)
  - <a id="host_member_since"></a>A runtime F adds a key Key of a spec Spec since a text Since being a number Sv (`host_member_since`)
  - <a id="host_module_member"></a>A host H exposes a key Key of a spec Spec (`host_module_member`)
- from facts/js-host.rofl, in the main:
  - <a id="host_effect_atom"></a>An effect E is a host effect (`host_effect_atom`)
  - <a id="host_global_effect"></a>A host H attributes the global Name to an effect E (`host_global_effect`)
  - <a id="host_member_effect"></a>A host H attributes the member Key of a spec Spec to an effect E (`host_member_effect`)
  - <a id="host_module_effect"></a>A host H attributes the module Spec to an effect E (`host_module_effect`)
  - <a id="host_no_effects"></a>A host H claims no effects because a reason R (`host_no_effects`)
  - <a id="provides_release"></a>A runtime P ships the release Rel (`provides_release`)
  - <a id="runtime"></a>A runtime F is a runtime (`runtime`)
  - <a id="runtime_includes"></a>A runtime R includes the runtime P (`runtime_includes`)
  - <a id="runtime_undated"></a>A runtime R is undated because a reason Reason (`runtime_undated`)
  - <a id="runtime_version"></a>A runtime R is the version V of a runtime F (`runtime_version`)
- from js-callgraph, in the code: [callee_of](js-callgraph.rofl.md#callee_of)
- from js-concat, in the flow: [may_be_node](js-concat.rofl.md#may_be_node)
- from js-dataflow, in the code: [binder](js-dataflow.rofl.md#binder), [destr_prop](js-dataflow.rofl.md#destr_prop), [external_import](js-dataflow.rofl.md#external_import), [free_global](js-dataflow.rofl.md#free_global), [key_name](js-dataflow.rofl.md#key_name), [sees_binder](js-dataflow.rofl.md#sees_binder)
- from js-dataflow, in the flow: [decl_value](js-dataflow.rofl.md#decl_value), [external_value](js-dataflow.rofl.md#external_value), [member_node_v](js-dataflow.rofl.md#member_node_v), [selects](js-dataflow.rofl.md#selects)
- from js-env: [reaches](js-env.rofl.md#reaches)
- from js-env-api, in the code: [lib_call](js-env-api.rofl.md#lib_call)
- from js-model, in the code: [ast_line](js-model.rofl.md#ast_line), [ast_node](js-model.rofl.md#ast_node)
- from js-modules, in the code: [builtin_canonical](js-modules.rofl.md#builtin_canonical)
- from js-modules, in the main: [host_module](js-modules.rofl.md#host_module)
- from js-structure, in the code: [ast_name](js-structure.rofl.md#ast_name)
- from outside these files, in the main:
  - <a id="host_member_module"></a>`host_member_module`
- from the scanner, in the code:
  - <a id="ast_child"></a>A node is a child of a node (`ast_child`)

## Words

What this file calls a node, and what each word stands for:

| word | stands for |
|---|---|
| <a id="noun-assignment"></a>an assignment | a node of kind `assignment_expression` |
| a member access | a node [`member_node_v`](js-dataflow.rofl.md#member_node_v) holds of |

Phrases this file defines in one step, each by the sentence it stands for:

- <a id="host_effect_used"></a>An effect is used by a host call if some call [has the host effect](#host_call_effect) it by some route.
- <a id="runtime_has_release"></a>A runtime has a release if it [runs the release](#runtime_reaches_release) some release.

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `audit` | `code` |

Declared as facts:

- `ast_parse_error` — rows from the scanner

## 1. THE GLOBAL DOOR — a free global (rules/js-globals.rofl) the host carries.

> The host stays in the row: `console` under node and under browser are two rows.

In the code:

<a id="host_global_ref"></a>A node refers to the global Name of a host H if it [refers to the free](js-dataflow.rofl.md#free_global) Name in some file and H [has the global](#host_global) Name.

> `document` is a reference under `browser` and there is no `node` row for it.

<a id="host_global_only_in"></a>A node refers to a global Name only in a host H if all of:
  - it [refers to the global](#host_global_ref) Name of H;
  - a host G [is a host](#host);
  - G differs from H;
  - unless G [has the global](#host_global) Name.

## 2. THE MODULE DOOR — a VALUE that is a node builtin, or a member of one.

> The value layer (rules/js-dataflow.rofl, external values) carries the module
> through `require`, imports, aliases and patterns; a door matched by the
> local name would open for a parameter that happens to be called `fs` and
> stay shut for `const fs = require('fs')`.

In the flow:

<a id="builtin_ns"></a>A node is the builtin module of a spec Spec if it [comes out of](js-dataflow.rofl.md#external_value) it and [the canonical builtin](js-modules.rofl.md#builtin_canonical) of it is Spec.

<a id="builtin_ns_at"></a>`builtin_ns_at`(O, Spec) if a node Y [is the builtin module](#builtin_ns) of a spec Spec and a node O [points to](js-concat.rofl.md#may_be_node) Y.

`builtin_ns_at`(O, Sub) if all of:
  - a node X [is a member of the builtin](#builtin_member) of a spec Spec Key;
  - [`host_member_module`](#host_member_module)(`node`, Spec, Key, Sub);
  - a node O [points to](js-concat.rofl.md#may_be_node) X.

<a id="builtin_member"></a>M is a member of the builtin of a spec Spec Key either:

1. if all of:
   - [`builtin_ns_at`](#builtin_ns_at)(O, Spec);
   - the `object` of M is a node O;
   - M is a [member access](js-dataflow.rofl.md#member_node_v);
   - M [selects](js-dataflow.rofl.md#selects) Key;
2. if all of:
   - M [imports from outside](js-dataflow.rofl.md#external_import) some name from a module S in some file;
   - [the canonical builtin](js-modules.rofl.md#builtin_canonical) of S is Spec;
   - the `imported` of M [is named](js-structure.rofl.md#ast_name) Key;
3. if all of:
   - a node Y [is the builtin module](#builtin_ns) of Spec;
   - a node Init [points to](js-concat.rofl.md#may_be_node) Y;
   - D [takes its value from](js-dataflow.rofl.md#decl_value) Init;
   - [`destr_prop`](js-dataflow.rofl.md#destr_prop)(D, M, K, something, something);
   - a node K [spells](js-dataflow.rofl.md#key_name) Key.

> An import naming something the generated surface lacks: a typo, a member
> newer than @types/node, or one the declarations do not carry. The module
> door's twin of `stdlib_unattributed[audit]`.

In the audit:

<a id="host_import_unknown"></a>File imports an unknown member Key of a spec Spec if all of:
  - a node Sp [imports from outside](js-dataflow.rofl.md#external_import) some name from some module in File;
  - Sp [is a member of the builtin](#builtin_member) of Spec Key;
  - unless `node` [exposes](#host_module_member) Key of Spec.

## 3. THE SITES — four shapes, because a rule covering three would report a

> program as pure:
>    console.log(x)         3a. a member call on a global
>    fetch(u)               3b. a plain call of a global
>    fs.readFileSync(p)     3c. a call of a member of a module, however it
>    readFileSync(p)            was reached: dotted, imported, destructured, aliased
> `selects[flow]` answers the key for the dotted and the computed form alike.

In the code:

<a id="host_member_call"></a>C calls the host member Key of Name in a host H if all of:
  - [the callee](js-callgraph.rofl.md#callee_of) of C is a node N;
  - the `object` of N [refers to the global](#host_global_ref) Name of H;
  - N [selects](js-dataflow.rofl.md#selects) Key.

<a id="host_global_call"></a>C calls the host global Name of a host H if [the callee](js-callgraph.rofl.md#callee_of) of C [refers to the global](#host_global_ref) Name of H.

<a id="host_module_call"></a>C calls the module member Key of a spec Spec if all of:
  - a node X [is a member of the builtin](#builtin_member) of Spec Key;
  - a node G [points to](js-concat.rofl.md#may_be_node) X;
  - [the callee](js-callgraph.rofl.md#callee_of) of C is G.

> The union, with the receiver in the origin column: the canonical specifier
> for a module, the global's own name for a member call, and the atom `itself`
> for a plain call of a global, so the two shapes stay distinguishable.

<a id="host_site"></a>C is a host site of a host N from an origin Spec at Key either:

1. if C [calls the module member](#host_module_call) Key of Spec and N is `node`;
2. if C [calls the host member](#host_member_call) Key of Spec in N;
3. if C [calls the host global](#host_global_call) Spec of N and Key is `itself`.

<a id="host_site_at"></a>File has a host site at Line of a host H from an origin Origin at Key if all of:
  - a node C [is a host site](#host_site) of H from Origin at Key;
  - C [is in file](js-model.rofl.md#ast_node) File;
  - C [is at line](js-model.rofl.md#ast_line) Line.

## 4. THE EFFECT ROW the effect layer joins against, at a call site, with the

> PROVENANCE as third argument: an effect by module default and one by member
> name are not equally strong. A member's own row wins over its module's
> default; the negation is what makes it a default rather than a second
> opinion (`path.resolve` would otherwise be both total and io).

<a id="member_effect"></a>A spec Spec has the member effect E at Key either:

1. if `node` [attributes the member](#host_member_effect) Key of Spec to E;
2. if all of:
   - `node` [exposes](#host_module_member) Key of Spec;
   - `node` [attributes the module](#host_module_effect) Spec to E;
   - unless `node` [attributes the member](#host_member_effect) Key of Spec to some effect.

In the audit:

<a id="host_call_effect"></a>C has the host effect E by a route N either:

1. if all of:
   - C [calls the module member](#host_module_call) Key of a spec Spec;
   - `node` [attributes the member](#host_member_effect) Key of Spec to E;
   - N is `by_member`;
2. if all of:
   - C [calls the module member](#host_module_call) Key of a spec Spec;
   - `node` [attributes the module](#host_module_effect) Spec to E;
   - N is `by_module`;
   - unless `node` [attributes the member](#host_member_effect) Key of Spec to some effect;
3. if all of:
   - C [calls the host global](#host_global_call) Name of a host H;
   - H [attributes the global](#host_global_effect) Name to E;
   - N is `by_global`;
4. if all of:
   - C [calls the host member](#host_member_call) some key of Name in a host H;
   - H [attributes the global](#host_global_effect) Name to E;
   - N is `by_global`.

> at a coordinate, and the set of effects the corpus exercises

<a id="host_effect_at"></a>File has the host effect E at Line by a route Why if all of:
  - a node C [has the host effect](#host_call_effect) E by Why;
  - C [is in file](js-model.rofl.md#ast_node) File;
  - C [is at line](js-model.rofl.md#ast_line) Line.

> The FRONTIER, expected non-zero: a site here is one the effect layer sees
> as silent, which it must not mistake for `total`.

<a id="host_call_uneffected"></a>C has no host effect from an origin Origin at Key if C [is a host site](#host_site) of some host from Origin at Key, unless C [has the host effect](#host_call_effect) some effect by some route.

## 5. THE RUNTIME AXIS — a composition in the ES scale's shape: a runtime

> version is a subkind of a family, `runtime_includes` orders them, and the
> walk is `reaches` over different atoms. Reflexive on purpose: a version
> provides its own surface.

<a id="runtime_reaches"></a>A runtime R reaches the runtime N either:

1. if R [is the version](#runtime_version) some number of some runtime and N is R;
2. if R [includes the runtime](#runtime_includes) Q and Q [reaches the runtime](#runtime_reaches) N.

> `provides_api` is DERIVED from a semver point (`@since v18.9.0`) with one
> comparison; the arithmetic lives in these three rules only. The encoding
> is the surface pack's, maj*1000000 + min*1000 + patch, and a runtime
> declares a MAJOR: `node18` is v18.0.0 and does NOT have `os.machine`.

In the code:

<a id="runtime_vnum"></a>The version number of a runtime R is VN if R [is the version](#runtime_version) V of some runtime and VN is V * 1000000.

> The family is bound once and used in both premises; hard-coding `node`
> compared the browser against node's surface and reported 718 absences.

<a id="arrived_by"></a>A runtime has received Key of a spec Spec if all of:
  - [the version number](#runtime_vnum) of it is VN;
  - it [is the version](#runtime_version) some number of a runtime F;
  - F [adds](#host_member_since) Key of Spec since some text being Sv;
  - Sv <= VN.

> What a version adds of its own. `arrived_by` is a threshold, hence monotone
> along the chain; subtracting every predecessor keeps working the day a
> version includes two.

A runtime

- <a id="inherited"></a>inherits Key of a spec Spec if it [includes the runtime](#runtime_includes) P and P [has received](#arrived_by) Key of Spec.
- <a id="provides_api"></a>provides Key of a spec Spec if it [has received](#arrived_by) Key of Spec, unless it [inherits](#inherited) Key of Spec.

> test/js-host.test.ts asserts `has_api` equals `arrived_by` set for set:
> the walk and the comparison must agree.

In the audit:

<a id="has_api"></a>A runtime reaches the api Key of a spec Spec if it [reaches the runtime](#runtime_reaches) P and P [provides](#provides_api) Key of Spec.

> The counterexample to monotone inclusion, empty by construction: with ONE
> @types/node snapshot a removed member simply stops being in the file. A
> second snapshot populates it with no other change.

<a id="runtime_drops"></a>A runtime drops Key of a spec Spec from a runtime B if all of:
  - it [includes the runtime](#runtime_includes) B;
  - B [reaches the api](#has_api) Key of Spec;
  - unless it [reaches the api](#has_api) Key of Spec.

> -------------------------------------------------------------------------
> THE BRIDGE between the axes, one rule: `provides_release(node18, es2022)`
> and `reaches[audit]` from rules/js-env.rofl carries it the rest of the way.
> No `release`, `includes` or `environment` row is minted here.

<a id="runtime_reaches_release"></a>A runtime runs the release Rel if all of:
  - it [reaches the runtime](#runtime_reaches) P;
  - P [ships the release](#provides_release) Rel0;
  - Rel0 [reaches the release](js-env.rofl.md#reaches) Rel.

> `runtime_has_release` is a GUARD: a runtime with no bridge row reaches no
> release, and without the premise every stdlib call reports unsupported
> against it. `runtime_lib_unsupported` is `lib_unsupported[audit]` asked of
> a runtime over the same `lib_call[code]`.

In the main:

In the audit:

<a id="runtime_no_release"></a>A runtime has no release if it [is the version](#runtime_version) some number of some runtime, unless it [has a release](#runtime_has_release).

<a id="runtime_lib_unsupported"></a>C is unsupported on a runtime R at Key of a prototype P if all of:
  - C [calls the stdlib](js-env-api.rofl.md#lib_call) Key of P since a release Rel;
  - R [has a release](#runtime_has_release);
  - unless R [runs the release](#runtime_reaches_release) Rel.

> -------------------------------------------------------------------------
> THE VERSION QUESTION AT A SITE: this call, this member, this line.

<a id="host_member_absent"></a>A runtime lacks the member Key of a spec Spec if all of:
  - it [is the version](#runtime_version) some number of a runtime F;
  - F [adds](#host_member_since) Key of Spec since some text being some number;
  - unless it [reaches the api](#has_api) Key of Spec.

<a id="host_call_absent"></a>C is absent on a runtime R at Key of a spec Spec if C [calls the module member](#host_module_call) Key of Spec and R [lacks the member](#host_member_absent) Key of Spec.

<a id="host_call_absent_at"></a>File has an absent call at Line on a runtime R at Key of a spec Spec if all of:
  - a node C [is absent on](#host_call_absent) R at Key of Spec;
  - C [is in file](js-model.rofl.md#ast_node) File;
  - C [is at line](js-model.rofl.md#ast_line) Line.

> The set difference between two runtimes, WITHIN ONE FAMILY (a browser did
> not LOSE `fs`), and with no ordering premise, as `lost[audit]` in js-env.

<a id="host_lost"></a>A runtime loses the call C to a spec Spec at Key since a runtime From if all of:
  - C [is absent on](#host_call_absent) it at Key of Spec;
  - it [is the version](#runtime_version) some number of a runtime F;
  - From [is the version](#runtime_version) some number of F;
  - From differs from it;
  - unless C [is absent on](#host_call_absent) From at Key of Spec.

> -------------------------------------------------------------------------
> THE DEPRECATION — the visible half of a removal and the only half this
> source records; a deprecation note naming its replacement is one join from
> a remedy.

<a id="host_call_deprecated"></a>C calls a deprecated member Key of a spec Spec if C [calls the module member](#host_module_call) Key of Spec and `node` [deprecates](#host_member_deprecated) Key of Spec.

<a id="host_call_remedy"></a>C has the host remedy Use for Key of a spec Spec if C [calls a deprecated member](#host_call_deprecated) Key of Spec and `node` [replaces](#host_member_replaced_by) Key of Spec with Use.

## 6. THE GATES. Each is a statement this layer makes about itself, and

> test/js-host.test.ts plants a defect for every one.
> 
> an effect atom nobody declared: a misspelt `ioo` would propagate as real

<a id="host_effect_undeclared"></a>An effect E is an undeclared host effect either:

1. if some host [attributes the module](#host_module_effect) some spec to E, unless E [is a host effect](#host_effect_atom);
2. if some host [attributes the member](#host_member_effect) some key of some spec to E, unless E [is a host effect](#host_effect_atom);
3. if some host [attributes the global](#host_global_effect) some name to E, unless E [is a host effect](#host_effect_atom).

> the authored effect table accountable to the generated surface

<a id="host_effect_orphan"></a>A spec Spec has an orphan effect at Key either:

1. if `node` [attributes the member](#host_member_effect) Key of Spec to some effect, unless `node` [exposes](#host_module_member) Key of Spec;
2. if all of:
   - `node` [attributes the module](#host_module_effect) Spec to some effect;
   - Key is `global`;
   - unless `node` [has the module](js-modules.rofl.md#host_module) Spec.

<a id="host_global_effect_orphan"></a>A host has an orphan global effect at Name if it [attributes the global](#host_global_effect) Name to some effect, unless it [has the global](#host_global) Name.

> The residue, over hosts that CLAIM attribution; `host_no_effects` is a
> declared absence rather than a permanently red gate.

In the main:

<a id="effects_claimed"></a>A host claims its effects if it [is a host](#host), unless it [claims no effects](#host_no_effects) because some reason.

In the audit:

<a id="host_module_uneffected"></a>A spec has no module effect if `node` [has the module](js-modules.rofl.md#host_module) it, unless `node` [attributes the module](#host_module_effect) it to some effect.

<a id="host_global_uneffected"></a>A host has no global effect at Name if all of:
  - it [has the global](#host_global) Name;
  - it [claims its effects](#effects_claimed);
  - unless it [attributes the global](#host_global_effect) Name to some effect.

> a runtime with no version answers NO to every version question and looks
> new rather than broken; `runtime_undated` is the waiver for `browser`

<a id="runtime_unversioned"></a>A runtime is unversioned if it [is the version](#runtime_version) 0 of some runtime, unless it [is undated](#runtime_undated) because some reason.

> two runtimes agreeing on every member are one runtime; no ordering premise,
> for the reason `env_pair_indistinct` records

A runtime

- <a id="runtime_separates"></a>is told apart from a runtime B if B [lacks the member](#host_member_absent) Key of a spec Spec, unless it [lacks the member](#host_member_absent) Key of Spec.
- <a id="runtime_pair_indistinct"></a>is not told apart from a runtime B if all of:
  - it [is the version](#runtime_version) some number of a runtime F;
  - B [is the version](#runtime_version) some number of F;
  - it differs from B;
  - unless it [is told apart from](#runtime_separates) B or B [is told apart from](#runtime_separates) it.

> an inclusion ACROSS families claims one runtime is a later edition of
> another; the order is not total across families

A runtime

- <a id="runtime_family_undeclared"></a>has an undeclared family F if it [is the version](#runtime_version) some number of F, unless F [is a runtime](#runtime).
- <a id="runtime_cross_family"></a>includes across families a runtime B if all of:
  - it [includes the runtime](#runtime_includes) B;
  - it [is the version](#runtime_version) some number of a runtime FA;
  - B [is the version](#runtime_version) some number of a runtime FB;
  - FA differs from FB.

> `host/1` is generated, `runtime/1` authored; they must name the same families

<a id="host_family_mismatch"></a>A host H is half declared either:

1. if H [is a host](#host), unless H [is a runtime](#runtime);
2. if H [is a runtime](#runtime), unless H [is a host](#host).

## 7. THE ENVIRONMENT a program reads: `process.env.NAME`, `process.env[k]`,

> `const { NAME } = process.env`, through any alias of `process.env`. A key the
> value layer cannot name is said, with its place, rather than dropped.

In the flow:

<a id="env_member"></a>`env_member`(a [member access](js-dataflow.rofl.md#member_node_v) M) if all of:
  - a node P [refers to the global](#host_global_ref) "process" of `node`;
  - the `object` of M is P;
  - M [selects](js-dataflow.rofl.md#selects) "env".

In the surface:

<a id="sx_env"></a>`sx_env`(M) if [`env_member`](#env_member)(M).

In the flow:

<a id="env_object"></a>`env_object`(M) if [`sx_env`](#sx_env)(M).

`env_object`(E) if a node E [points to](js-concat.rofl.md#may_be_node) a node M and [`sx_env`](#sx_env)(M).

`env_object`(E) if all of:
  - a node E [sees](js-dataflow.rofl.md#sees_binder) D;
  - D [binds](js-dataflow.rofl.md#binder) some name to a node Init in some file;
  - [`env_object`](#env_object)(Init).

<a id="env_key"></a>`env_key`(a [member access](js-dataflow.rofl.md#member_node_v) M) if [`env_object`](#env_object)(O) and the `object` of M is a node O.

<a id="env_written"></a>`env_written`(M) if [`env_key`](#env_key)(M) and the `left` of an [assignment](#noun-assignment) X is a node M.

<a id="env_read"></a>`env_read`(M, Name) if all of:
  - [`env_key`](#env_key)(M);
  - M [selects](js-dataflow.rofl.md#selects) Name;
  - unless [`env_written`](#env_written)(M).

<a id="env_write"></a>`env_write`(M, Name) if [`env_written`](#env_written)(M) and M [selects](js-dataflow.rofl.md#selects) Name.

`env_read`(P, Name) if all of:
  - D [takes its value from](js-dataflow.rofl.md#decl_value) a node Init;
  - [`sx_env`](#sx_env)(Init);
  - [`destr_prop`](js-dataflow.rofl.md#destr_prop)(D, P, K, something, something);
  - a node K [spells](js-dataflow.rofl.md#key_name) Name.

<a id="env_read_unnamed"></a>`env_read_unnamed`(M) if all of:
  - [`env_key`](#env_key)(M);
  - unless [`env_named`](#env_named)(M);
  - unless [`env_written`](#env_written)(M).

<a id="env_write_unnamed"></a>`env_write_unnamed`(M) if [`env_written`](#env_written)(M), unless [`env_named`](#env_named)(M).

<a id="env_named"></a>`env_named`(M) if [`env_key`](#env_key)(M) and M [selects](js-dataflow.rofl.md#selects) some key.

<a id="env_read_at"></a>`env_read_at`(Name, File, Line) if all of:
  - [`env_read`](#env_read)(M, Name);
  - a node M [is in file](js-model.rofl.md#ast_node) File;
  - M [is at line](js-model.rofl.md#ast_line) Line.

<a id="env_read_unnamed_at"></a>`env_read_unnamed_at`(File, Line) if all of:
  - [`env_read_unnamed`](#env_read_unnamed)(M);
  - a node M [is in file](js-model.rofl.md#ast_node) File;
  - M [is at line](js-model.rofl.md#ast_line) Line.

<a id="env_write_unnamed_at"></a>`env_write_unnamed_at`(File, Line) if all of:
  - [`env_write_unnamed`](#env_write_unnamed)(M);
  - a node M [is in file](js-model.rofl.md#ast_node) File;
  - M [is at line](js-model.rofl.md#ast_line) Line.


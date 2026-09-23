---
world: js-host
books: audit, code, flow, main
default: audit
---

# js-host

## Terms

*function declaration*.

## Kinds

A noun is a node of one of its kinds:

| noun | kinds |
|---|---|
| a function declaration | function_declaration |

## Signatures

- binds_the_name(file File, name Name) (name_bound_in), in the code
- refers_to_the_global(node E, name Name:2, of host H:1) (host_global_ref), in the code
- refers_to_a_global(node E, name Name:2, only in host H:1) (host_global_only_in), in the code
- imports_the_namespace(file File, name Local, of spec Spec) (host_module_ns), in the code
- imports(file File, name Local, as key Key:3, of spec Spec:2) (host_module_named), in the code
- imports_an_unknown_member(file File, key Key:2, of spec Spec:1) (host_import_unknown)
- calls_the_host_member(call C, key Key:3, of name Name:2, in host H:1) (host_member_call), in the code
- calls_the_host_global(call C, name Name:2, of host H:1) (host_global_call), in the code
- calls_the_module_member(call C, key Key:2, of spec Spec:1) (host_module_call), in the code
- is_a_host_site(call C, of host H, from origin Origin, at key Key) (host_site), in the code
- has_a_host_site(file File:1, at line Line:2, of host H:0, from origin Origin:3, at key Key:4) (host_site_at), in the code
- has_the_member_effect(spec Spec, effect E:2, at key Key:1) (member_effect), in the code
- has_the_host_effect(call C, effect E, by route N) (host_call_effect)
- has_the_host_effect(file File:1, effect E:0, at line Line:2, by route Why:3) (host_effect_at)
- is_used_by_a_host_call(effect E) (host_effect_used)
- has_no_host_effect(call C, from origin Origin, at key Key) (host_call_uneffected)
- reaches_the_runtime(runtime R, runtime N) (runtime_reaches)
- the_version_number(of runtime R, is number VN) (runtime_vnum), in the code
- has_received(runtime R, key Key:2, of spec Spec:1) (arrived_by), in the code
- inherits(runtime R, key Key:2, of spec Spec:1) (inherited), in the code
- provides(runtime R, key Key:2, of spec Spec:1) (provides_api), in the code
- reaches_the_api(runtime R, key Key:2, of spec Spec:1) (has_api)
- drops(runtime A, key Key:3, of spec Spec:2, from runtime B:1) (runtime_drops)
- runs_the_release(runtime R, release Rel) (runtime_reaches_release)
- has_a_release(runtime R) (runtime_has_release), in the main
- has_no_release(runtime R) (runtime_no_release)
- is_unsupported_on(call C:1, runtime R:0, at key Key:3, of prototype P:2) (runtime_lib_unsupported)
- lacks_the_member(runtime R, key Key:2, of spec Spec:1) (host_member_absent)
- is_absent_on(call C:1, runtime R:0, at key Key:3, of spec Spec:2) (host_call_absent)
- has_an_absent_call(file File:1, at line Line:2, on runtime R:0, at key Key:4, of spec Spec:3) (host_call_absent_at)
- loses_the_call(runtime To:1, call C:2, to spec Spec:3, at key Key:4, since runtime From:0) (host_lost)
- calls_a_deprecated_member(call C, key Key:2, of spec Spec:1) (host_call_deprecated)
- has_the_host_remedy(call C, key Use:3, for key Key:2, of spec Spec:1) (host_call_remedy)
- is_an_undeclared_host_effect(effect E) (host_effect_undeclared)
- has_an_orphan_effect(spec Spec, at key Key) (host_effect_orphan)
- has_an_orphan_global_effect(host H, at name Name) (host_global_effect_orphan)
- claims_its_effects(host H) (effects_claimed), in the main
- has_no_module_effect(spec Spec) (host_module_uneffected)
- has_no_global_effect(host H, at name Name) (host_global_uneffected)
- is_unversioned(runtime R) (runtime_unversioned)
- is_told_apart_from(runtime X, runtime B) (runtime_separates)
- is_not_told_apart_from(runtime X, runtime B) (runtime_pair_indistinct)
- is_listed_bare(spec Spec) (bare_listed), in the main
- is_not_listed_bare(spec Spec) (bare_builtin_unlisted)
- has_an_undeclared_family(runtime R, runtime F) (runtime_family_undeclared)
- includes_across_families(runtime X, runtime B) (runtime_cross_family)
- is_half_declared(host H) (host_family_mismatch)

> js-host.rofl — THE RUNTIME LAYER: what a program reaches for that is in
> neither the program nor the language. rules/js-env.rofl asks whether SYNTAX
> parses; rules/js-env-api.rofl whether a PROTOTYPE METHOD exists; neither can
> see `console.log`, `fs.readFileSync` or `fetch`, which come from the HOST.
> 
> TWO DOORS, ONE PRODUCT. A MODULE arrives through a boundary the model owns:
> rules/js-modules.rofl classifies, canonicalises, resolves and BINDS
> `node:fs`, four positive joins. A GLOBAL arrives from nowhere: the only
> thing that makes `console` a global is that NOTHING IN THE PROGRAM BINDS
> IT, a negation over the file. The doors are `host_module_ns` with
> `host_module_named`, and `host_global_ref[code]`; they meet at
> `host_call_effect[audit]`, the row the effect layer joins against.

> the audits read the scanner's book; `ast_parse_error` is `edb` because
> corpus-free worlds load this pack with no AST at all

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `audit` | `code` |

Declared as facts: ast_parse_error.

## 1. THE GLOBAL DOOR — an identifier nothing in this FILE binds. The ceiling

> is that `name_bound_in` is file-scoped, not scope-scoped: a name bound
> anywhere in a file suppresses the global everywhere in it. Chosen: the
> precise relation `sees_binder[code]` covers declarators and destructuring
> only, so `not sees_binder` would call every parameter named `url` a global
> reference and attribute io to a program that does none. Under-reporting a
> shadowed global is a missed row; over-reporting is a false accusation.

<a id="name_bound_in"></a>File binds the name Name if some declarator [introduces](js-dataflow.md#binds_name) Name in File.

> the `id` child and not `fn_name[code]`, which also covers object and class
> METHODS: `{ log() {} }` would have suppressed `console`

File binds the name Name either:

1. if a function declaration F is in file File and the `id` of F [is named](js-structure.md#ast_name) Name;
2. if a node F [takes](js-dataflow.md#param_of) Name at some index and F [is in file](js-model.md#ast_node) File;
3. if some class [is named](js-dataflow.md#class_named) Name in File;
4. if a site I [binds the name](js-modules.md#binding) Name to some name at some specifier and I [sits in](js-modules.md#site_file) File.

> The host stays in the row: `console` under node and under browser are two rows.

<a id="host_global_ref"></a>A node refers to the global Name of a host H if all of:
  - it [reads](js-dataflow.md#ident_in) Name in File;
  - H has the global Name;
  - unless File [binds the name](#name_bound_in) Name.

> `document` is a reference under `browser` and there is no `node` row for it.

<a id="host_global_only_in"></a>A node refers to a global Name only in a host H if all of:
  - it [refers to the global](#host_global_ref) Name of H;
  - a host G is a host;
  - G differs from H;
  - unless G has the global Name.

## 2. THE MODULE DOOR — a local name bound to a node builtin. Four joins over

> rules/js-modules.rofl's work, no new scanner contract. The NAMESPACE form
> (`import * as fs`, `import fs`) binds a name standing for the whole module.

<a id="host_module_ns"></a>File imports the namespace Local of a spec Spec if all of:
  - a site I [resolves to the builtin](js-modules.md#resolved_builtin) Spec;
  - I [sits in](js-modules.md#site_file) File;
  - I [binds the name](js-modules.md#binding) Local to "*" or "default" at some specifier.

> The NAMED form binds ONE member under a local name that need not be its
> own; reading `Imported` for the member covers the rename without a test.

<a id="host_module_named"></a>File imports Local as Key of a spec Spec if all of:
  - a site I [resolves to the builtin](js-modules.md#resolved_builtin) Spec;
  - I [sits in](js-modules.md#site_file) File;
  - I [binds the name](js-modules.md#binding) Local to Key at some specifier;
  - Key differs from "*";
  - Key differs from "default".

> An import naming something the generated surface lacks: a typo, a member
> newer than @types/node, or one the declarations do not carry. The module
> door's twin of `stdlib_unattributed[audit]`.

<a id="host_import_unknown"></a>File imports an unknown member Key of a spec Spec if File [imports](#host_module_named) some name as Key of Spec, unless `node` exposes Key of Spec.

## 3. THE SITES — four shapes, because a rule covering three would report a

> program as pure:
>    console.log(x)         3a. a member call on a global
>    fetch(u)               3b. a plain call of a global
>    fs.readFileSync(p)     3c. a member call on a module namespace
>    readFileSync(p)        3d. a plain call of a named import
> `selects[flow]` answers the key for the dotted and the computed form alike.

<a id="host_member_call"></a>C calls the host member Key of Name in a host H if all of:
  - [the callee](js-callgraph.md#callee_of) of C is a node N;
  - the `object` of N [refers to the global](#host_global_ref) Name of H;
  - N [selects](js-dataflow.md#selects) Key.

<a id="host_global_call"></a>C calls the host global Name of a host H if [the callee](js-callgraph.md#callee_of) of C [refers to the global](#host_global_ref) Name of H.

<a id="host_module_call"></a>C calls the module member Key of a spec Spec either:

1. if all of:
   - [the callee](js-callgraph.md#callee_of) of C is a node N;
   - the `object` of N [reads](js-dataflow.md#ident_in) Local in File;
   - File [imports the namespace](#host_module_ns) Local of Spec;
   - N [selects](js-dataflow.md#selects) Key;
2. if [the callee](js-callgraph.md#callee_of) of C [reads](js-dataflow.md#ident_in) Local in File and File [imports](#host_module_named) Local as Key of Spec.

> The union, with the receiver in the origin column: the canonical specifier
> for a module, the global's own name for a member call, and the atom `itself`
> for a plain call of a global, so the two shapes stay distinguishable.

<a id="host_site"></a>C is a host site of a host N from an origin Spec at Key either:

1. if C [calls the module member](#host_module_call) Key of Spec and N is `node`;
2. if C [calls the host member](#host_member_call) Key of Spec in N;
3. if C [calls the host global](#host_global_call) Spec of N and Key is `itself`.

<a id="host_site_at"></a>File has a host site at Line of a host H from an origin Origin at Key if a node C [is a host site](#host_site) of H from Origin at Key and C [is of kind](js-model.md#ast_node) some kind in file File at line Line.

## 4. THE EFFECT ROW the effect layer joins against, at a call site, with the

> PROVENANCE as third argument: an effect by module default and one by member
> name are not equally strong. A member's own row wins over its module's
> default; the negation is what makes it a default rather than a second
> opinion (`path.resolve` would otherwise be both total and io).

<a id="member_effect"></a>A spec Spec has the member effect E at Key either:

1. if `node` attributes the member Key of Spec to E;
2. if all of:
   - `node` exposes Key of Spec;
   - `node` attributes the module Spec to E;
   - unless `node` attributes the member Key of Spec to some effect.

<a id="host_call_effect"></a>C has the host effect E by a route N either:

1. if all of:
   - C [calls the module member](#host_module_call) Key of a spec Spec;
   - `node` attributes the member Key of Spec to E;
   - N is `by_member`;
2. if all of:
   - C [calls the module member](#host_module_call) Key of a spec Spec;
   - `node` attributes the module Spec to E;
   - N is `by_module`;
   - unless `node` attributes the member Key of Spec to some effect;
3. if all of:
   - C [calls the host global](#host_global_call) Name of a host H;
   - H attributes the global Name to E;
   - N is `by_global`;
4. if all of:
   - C [calls the host member](#host_member_call) some key of Name in a host H;
   - H attributes the global Name to E;
   - N is `by_global`.

> at a coordinate, and the set of effects the corpus exercises

<a id="host_effect_at"></a>File has the host effect E at Line by a route Why if a node C [has the host effect](#host_call_effect) E by Why and C [is of kind](js-model.md#ast_node) some kind in file File at line Line.

<a id="host_effect_used"></a>An effect is used by a host call if some call [has the host effect](#host_call_effect) it by some route.

> The FRONTIER, expected non-zero: a site here is one the effect layer sees
> as silent, which it must not mistake for `total`.

<a id="host_call_uneffected"></a>C has no host effect from an origin Origin at Key if C [is a host site](#host_site) of some host from Origin at Key, unless C [has the host effect](#host_call_effect) some effect by some route.

## 5. THE RUNTIME AXIS — a composition in the ES scale's shape: a runtime

> version is a subkind of a family, `runtime_includes` orders them, and the
> walk is `reaches` over different atoms. Reflexive on purpose: a version
> provides its own surface.

<a id="runtime_reaches"></a>A runtime R reaches the runtime N either:

1. if R is the version some number of some runtime and N is R;
2. if R includes the runtime Q and Q [reaches the runtime](#runtime_reaches) N.

> `provides_api` is DERIVED from a semver point (`@since v18.9.0`) with one
> comparison; the arithmetic lives in these three rules only. The encoding
> is the surface pack's, maj*1000000 + min*1000 + patch, and a runtime
> declares a MAJOR: `node18` is v18.0.0 and does NOT have `os.machine`.

<a id="runtime_vnum"></a>The version number of a runtime R is VN if R is the version V of some runtime and VN is V * 1000000.

> The family is bound once and used in both premises; hard-coding `node`
> compared the browser against node's surface and reported 718 absences.

<a id="arrived_by"></a>A runtime has received Key of a spec Spec if all of:
  - [the version number](#runtime_vnum) of it is VN;
  - it is the version some number of a runtime F;
  - F adds Key of Spec since some text being Sv;
  - Sv <= VN.

> What a version adds of its own. `arrived_by` is a threshold, hence monotone
> along the chain; subtracting every predecessor keeps working the day a
> version includes two.

A runtime

- <a id="inherited"></a>inherits Key of a spec Spec if it includes the runtime P and P [has received](#arrived_by) Key of Spec.
- <a id="provides_api"></a>provides Key of a spec Spec if it [has received](#arrived_by) Key of Spec, unless it [inherits](#inherited) Key of Spec.

> test/js-host.test.ts asserts `has_api` equals `arrived_by` set for set:
> the walk and the comparison must agree.

<a id="has_api"></a>A runtime reaches the api Key of a spec Spec if it [reaches the runtime](#runtime_reaches) P and P [provides](#provides_api) Key of Spec.

> The counterexample to monotone inclusion, empty by construction: with ONE
> @types/node snapshot a removed member simply stops being in the file. A
> second snapshot populates it with no other change.

<a id="runtime_drops"></a>A runtime drops Key of a spec Spec from a runtime B if all of:
  - it includes the runtime B;
  - B [reaches the api](#has_api) Key of Spec;
  - unless it [reaches the api](#has_api) Key of Spec.

> -------------------------------------------------------------------------
> THE BRIDGE between the axes, one rule: `provides_release(node18, es2022)`
> and `reaches[audit]` from rules/js-env.rofl carries it the rest of the way.
> No `release`, `includes` or `environment` row is minted here.

<a id="runtime_reaches_release"></a>A runtime runs the release Rel if all of:
  - it [reaches the runtime](#runtime_reaches) P;
  - P ships the release Rel0;
  - Rel0 [reaches the release](js-env.md#reaches) Rel.

> `runtime_has_release` is a GUARD: a runtime with no bridge row reaches no
> release, and without the premise every stdlib call reports unsupported
> against it. `runtime_lib_unsupported` is `lib_unsupported[audit]` asked of
> a runtime over the same `lib_call[code]`.

A runtime

- <a id="runtime_has_release"></a>has a release if it [runs the release](#runtime_reaches_release) some release.
- <a id="runtime_no_release"></a>has no release if it is the version some number of some runtime, unless it [has a release](#runtime_has_release).

<a id="runtime_lib_unsupported"></a>C is unsupported on a runtime R at Key of a prototype P if all of:
  - C [calls the stdlib](js-env-api.md#lib_call) Key of P since a release Rel;
  - R [has a release](#runtime_has_release);
  - unless R [runs the release](#runtime_reaches_release) Rel.

> -------------------------------------------------------------------------
> THE VERSION QUESTION AT A SITE: this call, this member, this line.

<a id="host_member_absent"></a>A runtime lacks the member Key of a spec Spec if all of:
  - it is the version some number of a runtime F;
  - F adds Key of Spec since some text being some number;
  - unless it [reaches the api](#has_api) Key of Spec.

<a id="host_call_absent"></a>C is absent on a runtime R at Key of a spec Spec if C [calls the module member](#host_module_call) Key of Spec and R [lacks the member](#host_member_absent) Key of Spec.

<a id="host_call_absent_at"></a>File has an absent call at Line on a runtime R at Key of a spec Spec if a node C [is absent on](#host_call_absent) R at Key of Spec and C [is of kind](js-model.md#ast_node) some kind in file File at line Line.

> The set difference between two runtimes, WITHIN ONE FAMILY (a browser did
> not LOSE `fs`), and with no ordering premise, as `lost[audit]` in js-env.

<a id="host_lost"></a>A runtime loses the call C to a spec Spec at Key since a runtime From if all of:
  - C [is absent on](#host_call_absent) it at Key of Spec;
  - it is the version some number of a runtime F;
  - From is the version some number of F;
  - From differs from it;
  - unless C [is absent on](#host_call_absent) From at Key of Spec.

> -------------------------------------------------------------------------
> THE DEPRECATION — the visible half of a removal and the only half this
> source records; a deprecation note naming its replacement is one join from
> a remedy.

<a id="host_call_deprecated"></a>C calls a deprecated member Key of a spec Spec if C [calls the module member](#host_module_call) Key of Spec and `node` deprecates Key of Spec.

<a id="host_call_remedy"></a>C has the host remedy Use for Key of a spec Spec if C [calls a deprecated member](#host_call_deprecated) Key of Spec and `node` replaces Key of Spec with Use.

## 6. THE GATES. Each is a statement this layer makes about itself, and

> test/js-host.test.ts plants a defect for every one.
> 
> an effect atom nobody declared: a misspelt `ioo` would propagate as real

<a id="host_effect_undeclared"></a>An effect E is an undeclared host effect either:

1. if some host attributes the module some spec to E, unless E is a host effect;
2. if some host attributes the member some key of some spec to E, unless E is a host effect;
3. if some host attributes the global some name to E, unless E is a host effect.

> the authored effect table accountable to the generated surface

<a id="host_effect_orphan"></a>A spec Spec has an orphan effect at Key either:

1. if `node` attributes the member Key of Spec to some effect, unless `node` exposes Key of Spec;
2. if all of:
   - `node` attributes the module Spec to some effect;
   - Key is `global`;
   - unless `node` has the module Spec.

<a id="host_global_effect_orphan"></a>A host has an orphan global effect at Name if it attributes the global Name to some effect, unless it has the global Name.

> The residue, over hosts that CLAIM attribution; `host_no_effects` is a
> declared absence rather than a permanently red gate.

<a id="effects_claimed"></a>A host claims its effects if it is a host, unless it claims no effects because some reason.

<a id="host_module_uneffected"></a>A spec has no module effect if `node` has the module it, unless `node` attributes the module it to some effect.

<a id="host_global_uneffected"></a>A host has no global effect at Name if all of:
  - it has the global Name;
  - it [claims its effects](#effects_claimed);
  - unless it attributes the global Name to some effect.

> a runtime with no version answers NO to every version question and looks
> new rather than broken; `runtime_undated` is the waiver for `browser`

<a id="runtime_unversioned"></a>A runtime is unversioned if it is the version 0 of some runtime but is not undated because some reason.

> two runtimes agreeing on every member are one runtime; no ordering premise,
> for the reason `env_pair_indistinct` records

A runtime

- <a id="runtime_separates"></a>is told apart from a runtime B if B [lacks the member](#host_member_absent) Key of a spec Spec, unless it [lacks the member](#host_member_absent) Key of Spec.
- <a id="runtime_pair_indistinct"></a>is not told apart from a runtime B if all of:
  - it is the version some number of a runtime F;
  - B is the version some number of F;
  - it differs from B;
  - unless it [is told apart from](#runtime_separates) B or B [is told apart from](#runtime_separates) it.

> a builtin no bare import can reach: `explicit_shape` knows the `node:`
> scheme for all 57 and the bare spelling only through `node_builtin_bare`,
> so `"fs/promises"` classifies as a third-party package. A modules-layer
> gap this pack can see and must not fix.

A spec

- <a id="bare_listed"></a>is listed bare if some text [is the bare name](js-modules.md#node_builtin_bare) of it.
- <a id="bare_builtin_unlisted"></a>is not listed bare if `node` has the module it, unless it [is listed bare](#bare_listed).

> an inclusion ACROSS families claims one runtime is a later edition of
> another; the order is not total across families

A runtime

- <a id="runtime_family_undeclared"></a>has an undeclared family a runtime F if it is the version some number of F, unless F is a runtime.
- <a id="runtime_cross_family"></a>includes across families a runtime B if all of:
  - it includes the runtime B;
  - it is the version some number of a runtime FA;
  - B is the version some number of a runtime FB;
  - FA differs from FB.

> `host/1` is generated, `runtime/1` authored; they must name the same families

<a id="host_family_mismatch"></a>A host H is half declared either:

1. if H is a host but is not a runtime;
2. if H is a runtime but is not a host.

## Read from other files

- [ast_name](js-structure.md#ast_name), in the code
- [ast_node](js-model.md#ast_node), in the code
- [binding](js-modules.md#binding), in the code
- [binds_name](js-dataflow.md#binds_name), in the code
- [callee_of](js-callgraph.md#callee_of), in the code
- [class_named](js-dataflow.md#class_named), in the flow
- [ident_in](js-dataflow.md#ident_in), in the code
- [lib_call](js-env-api.md#lib_call), in the code
- [node_builtin_bare](js-modules.md#node_builtin_bare), in the main
- [param_of](js-dataflow.md#param_of), in the flow
- [reaches](js-env.md#reaches), in the audit
- [resolved_builtin](js-modules.md#resolved_builtin), in the code
- [selects](js-dataflow.md#selects), in the flow
- [site_file](js-modules.md#site_file), in the code

## Not defined in these files

- `ast_child`, in the code
- `host`, in the main
- `host_effect_atom`, in the main
- `host_global`, in the main
- `host_global_effect`, in the main
- `host_member_deprecated`, in the main
- `host_member_effect`, in the main
- `host_member_replaced_by`, in the main
- `host_member_since`, in the main
- `host_module`, in the main
- `host_module_effect`, in the main
- `host_module_member`, in the main
- `host_no_effects`, in the main
- `provides_release`, in the main
- `runtime`, in the main
- `runtime_includes`, in the main
- `runtime_undated`, in the main
- `runtime_version`, in the main


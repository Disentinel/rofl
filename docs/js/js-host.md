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

- refers_to_the_global(node E, name Name:2, of host H:1) (host_global_ref), in the code
- refers_to_a_global(node E, name Name:2, only in host H:1) (host_global_only_in), in the code
- is_a_host_site(call C, of host H, from origin Origin, at key Key) (host_site), in the code
- has_the_member_effect(spec Spec, effect E:2, at key Key:1) (member_effect), in the code
- provides(runtime R, key Key:2, of spec Spec:1) (provides_api), in the code
- drops(runtime A, key Key:3, of spec Spec:2, from runtime B:1) (runtime_drops)
- lacks_the_member(runtime R, key Key:2, of spec Spec:1) (host_member_absent)
- loses_the_call(runtime To:1, call C:2, to spec Spec:3, at key Key:4, since runtime From:0) (host_lost)

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

<a id="name_bound_in"></a>`name_bound_in`(File, Name) if some declarator [introduces](js-dataflow.md#binds_name) Name in File.

> the `id` child and not `fn_name[code]`, which also covers object and class
> METHODS: `{ log() {} }` would have suppressed `console`

`name_bound_in`(File, Name) either:

1. if a function declaration F is in file File and the `id` of F [is named](js-structure.md#ast_name) Name;
2. if F [takes](js-dataflow.md#param_of) Name at some index and F [is of kind](js-model.md#ast_node) some kind in file File;
3. if some class [is named](js-dataflow.md#class_named) Name in File;
4. if I [binds the name](js-modules.md#binding) Name to some name at some specifier and [`site_file`](js-modules.md#site_file)(I, File).

> The host stays in the row: `console` under node and under browser are two rows.

<a id="host_global_ref"></a>E refers to the global Name of H if all of:
  - E [reads](js-dataflow.md#ident_in) Name in File;
  - `host_global`(H, Name);
  - unless [`name_bound_in`](#name_bound_in)(File, Name).

> `document` is a reference under `browser` and there is no `node` row for it.

<a id="host_global_only_in"></a>E refers to a global Name only in H if all of:
  - E [refers to the global](#host_global_ref) Name of H;
  - `host`(G);
  - G differs from H;
  - unless `host_global`(G, Name).

## 2. THE MODULE DOOR — a local name bound to a node builtin. Four joins over

> rules/js-modules.rofl's work, no new scanner contract. The NAMESPACE form
> (`import * as fs`, `import fs`) binds a name standing for the whole module.

<a id="host_module_ns"></a>`host_module_ns`(File, Local, Spec) if all of:
  - [`resolved_builtin`](js-modules.md#resolved_builtin)(I, Spec);
  - [`site_file`](js-modules.md#site_file)(I, File);
  - I [binds the name](js-modules.md#binding) Local to "*" or "default" at some specifier.

> The NAMED form binds ONE member under a local name that need not be its
> own; reading `Imported` for the member covers the rename without a test.

<a id="host_module_named"></a>`host_module_named`(File, Local, Spec, Key) if all of:
  - [`resolved_builtin`](js-modules.md#resolved_builtin)(I, Spec);
  - [`site_file`](js-modules.md#site_file)(I, File);
  - I [binds the name](js-modules.md#binding) Local to Key at some specifier;
  - Key differs from "*";
  - Key differs from "default".

> An import naming something the generated surface lacks: a typo, a member
> newer than @types/node, or one the declarations do not carry. The module
> door's twin of `stdlib_unattributed[audit]`.

<a id="host_import_unknown"></a>`host_import_unknown`(File, Spec, Key) if [`host_module_named`](#host_module_named)(File, something, Spec, Key), unless `host_module_member`(`node`, Spec, Key).

## 3. THE SITES — four shapes, because a rule covering three would report a

> program as pure:
>    console.log(x)         3a. a member call on a global
>    fetch(u)               3b. a plain call of a global
>    fs.readFileSync(p)     3c. a member call on a module namespace
>    readFileSync(p)        3d. a plain call of a named import
> `selects[flow]` answers the key for the dotted and the computed form alike.

<a id="host_member_call"></a>`host_member_call`(C, H, Name, Key) if all of:
  - [`callee_of`](js-callgraph.md#callee_of)(C, N);
  - the `object` of N [refers to the global](#host_global_ref) Name of H;
  - N [selects](js-dataflow.md#selects) Key.

<a id="host_global_call"></a>`host_global_call`(C, H, Name) if [`callee_of`](js-callgraph.md#callee_of)(C, N) and N [refers to the global](#host_global_ref) Name of H.

<a id="host_module_call"></a>`host_module_call`(C, Spec, Key) either:

1. if all of:
   - [`callee_of`](js-callgraph.md#callee_of)(C, N);
   - the `object` of N [reads](js-dataflow.md#ident_in) Local in File;
   - [`host_module_ns`](#host_module_ns)(File, Local, Spec);
   - N [selects](js-dataflow.md#selects) Key;
2. if all of:
   - [`callee_of`](js-callgraph.md#callee_of)(C, N);
   - N [reads](js-dataflow.md#ident_in) Local in File;
   - [`host_module_named`](#host_module_named)(File, Local, Spec, Key).

> The union, with the receiver in the origin column: the canonical specifier
> for a module, the global's own name for a member call, and the atom `itself`
> for a plain call of a global, so the two shapes stay distinguishable.

<a id="host_site"></a>C is a host site of N from Spec at Key either:

1. if [`host_module_call`](#host_module_call)(C, Spec, Key) and N is `node`;
2. if [`host_member_call`](#host_member_call)(C, N, Spec, Key);
3. if [`host_global_call`](#host_global_call)(C, N, Spec) and Key is `itself`.

<a id="host_site_at"></a>`host_site_at`(H, File, Line, Origin, Key) if C [is a host site](#host_site) of H from Origin at Key and C [is of kind](js-model.md#ast_node) some kind in file File at line Line.

## 4. THE EFFECT ROW the effect layer joins against, at a call site, with the

> PROVENANCE as third argument: an effect by module default and one by member
> name are not equally strong. A member's own row wins over its module's
> default; the negation is what makes it a default rather than a second
> opinion (`path.resolve` would otherwise be both total and io).

<a id="member_effect"></a>Spec has the member effect E at Key either:

1. if `host_member_effect`(`node`, Spec, Key, E);
2. if all of:
   - `host_module_member`(`node`, Spec, Key);
   - `host_module_effect`(`node`, Spec, E);
   - unless `host_member_effect`(`node`, Spec, Key, something).

<a id="host_call_effect"></a>`host_call_effect`(C, E, N) either:

1. if all of:
   - [`host_module_call`](#host_module_call)(C, Spec, Key);
   - `host_member_effect`(`node`, Spec, Key, E);
   - N is `by_member`;
2. if all of:
   - [`host_module_call`](#host_module_call)(C, Spec, Key);
   - `host_module_effect`(`node`, Spec, E);
   - N is `by_module`;
   - unless `host_member_effect`(`node`, Spec, Key, something);
3. if all of:
   - [`host_global_call`](#host_global_call)(C, H, Name);
   - `host_global_effect`(H, Name, E);
   - N is `by_global`;
4. if all of:
   - [`host_member_call`](#host_member_call)(C, H, Name, something);
   - `host_global_effect`(H, Name, E);
   - N is `by_global`.

> at a coordinate, and the set of effects the corpus exercises

<a id="host_effect_at"></a>`host_effect_at`(E, File, Line, Why) if [`host_call_effect`](#host_call_effect)(C, E, Why) and C [is of kind](js-model.md#ast_node) some kind in file File at line Line.

<a id="host_effect_used"></a>`host_effect_used`(E) if [`host_call_effect`](#host_call_effect)(something, E, something).

> The FRONTIER, expected non-zero: a site here is one the effect layer sees
> as silent, which it must not mistake for `total`.

<a id="host_call_uneffected"></a>`host_call_uneffected`(C, Origin, Key) if C [is a host site](#host_site) of some host from Origin at Key, unless [`host_call_effect`](#host_call_effect)(C, something, something).

## 5. THE RUNTIME AXIS — a composition in the ES scale's shape: a runtime

> version is a subkind of a family, `runtime_includes` orders them, and the
> walk is `reaches` over different atoms. Reflexive on purpose: a version
> provides its own surface.

<a id="runtime_reaches"></a>`runtime_reaches`(R, N) either:

1. if `runtime_version`(R, something, something) and N is R;
2. if `runtime_includes`(R, Q) and [`runtime_reaches`](#runtime_reaches)(Q, N).

> `provides_api` is DERIVED from a semver point (`@since v18.9.0`) with one
> comparison; the arithmetic lives in these three rules only. The encoding
> is the surface pack's, maj*1000000 + min*1000 + patch, and a runtime
> declares a MAJOR: `node18` is v18.0.0 and does NOT have `os.machine`.

<a id="runtime_vnum"></a>`runtime_vnum`(R, VN) if `runtime_version`(R, something, V) and VN is V * 1000000.

> The family is bound once and used in both premises; hard-coding `node`
> compared the browser against node's surface and reported 718 absences.

<a id="arrived_by"></a>`arrived_by`(R, Spec, Key) if all of:
  - [`runtime_vnum`](#runtime_vnum)(R, VN);
  - `runtime_version`(R, F, something);
  - `host_member_since`(F, Spec, Key, something, Sv);
  - Sv <= VN.

> What a version adds of its own. `arrived_by` is a threshold, hence monotone
> along the chain; subtracting every predecessor keeps working the day a
> version includes two.

<a id="inherited"></a>`inherited`(R, Spec, Key) if `runtime_includes`(R, P) and [`arrived_by`](#arrived_by)(P, Spec, Key).

<a id="provides_api"></a>R provides Key of Spec if [`arrived_by`](#arrived_by)(R, Spec, Key), unless [`inherited`](#inherited)(R, Spec, Key).

> test/js-host.test.ts asserts `has_api` equals `arrived_by` set for set:
> the walk and the comparison must agree.

<a id="has_api"></a>`has_api`(R, Spec, Key) if [`runtime_reaches`](#runtime_reaches)(R, P) and P [provides](#provides_api) Key of Spec.

> The counterexample to monotone inclusion, empty by construction: with ONE
> @types/node snapshot a removed member simply stops being in the file. A
> second snapshot populates it with no other change.

<a id="runtime_drops"></a>X drops Key of Spec from B if all of:
  - `runtime_includes`(X, B);
  - [`has_api`](#has_api)(B, Spec, Key);
  - unless [`has_api`](#has_api)(X, Spec, Key).

> -------------------------------------------------------------------------
> THE BRIDGE between the axes, one rule: `provides_release(node18, es2022)`
> and `reaches[audit]` from rules/js-env.rofl carries it the rest of the way.
> No `release`, `includes` or `environment` row is minted here.

<a id="runtime_reaches_release"></a>`runtime_reaches_release`(R, Rel) if all of:
  - [`runtime_reaches`](#runtime_reaches)(R, P);
  - `provides_release`(P, Rel0);
  - [`reaches`](js-env.md#reaches)(Rel0, Rel).

> `runtime_has_release` is a GUARD: a runtime with no bridge row reaches no
> release, and without the premise every stdlib call reports unsupported
> against it. `runtime_lib_unsupported` is `lib_unsupported[audit]` asked of
> a runtime over the same `lib_call[code]`.

<a id="runtime_has_release"></a>`runtime_has_release`(R) if [`runtime_reaches_release`](#runtime_reaches_release)(R, something).

<a id="runtime_no_release"></a>`runtime_no_release`(R) if `runtime_version`(R, something, something), unless [`runtime_has_release`](#runtime_has_release)(R).

<a id="runtime_lib_unsupported"></a>`runtime_lib_unsupported`(R, C, P, Key) if all of:
  - [`lib_call`](js-env-api.md#lib_call)(C, P, Key, Rel);
  - [`runtime_has_release`](#runtime_has_release)(R);
  - unless [`runtime_reaches_release`](#runtime_reaches_release)(R, Rel).

> -------------------------------------------------------------------------
> THE VERSION QUESTION AT A SITE: this call, this member, this line.

<a id="host_member_absent"></a>R lacks the member Key of Spec if all of:
  - `runtime_version`(R, F, something);
  - `host_member_since`(F, Spec, Key, something, something);
  - unless [`has_api`](#has_api)(R, Spec, Key).

<a id="host_call_absent"></a>`host_call_absent`(R, C, Spec, Key) if [`host_module_call`](#host_module_call)(C, Spec, Key) and R [lacks the member](#host_member_absent) Key of Spec.

<a id="host_call_absent_at"></a>`host_call_absent_at`(R, File, Line, Spec, Key) if [`host_call_absent`](#host_call_absent)(R, C, Spec, Key) and C [is of kind](js-model.md#ast_node) some kind in file File at line Line.

> The set difference between two runtimes, WITHIN ONE FAMILY (a browser did
> not LOSE `fs`), and with no ordering premise, as `lost[audit]` in js-env.

<a id="host_lost"></a>To loses the call C to Spec at Key since From if all of:
  - [`host_call_absent`](#host_call_absent)(To, C, Spec, Key);
  - `runtime_version`(To, F, something);
  - `runtime_version`(From, F, something);
  - From differs from To;
  - unless [`host_call_absent`](#host_call_absent)(From, C, Spec, Key).

> -------------------------------------------------------------------------
> THE DEPRECATION — the visible half of a removal and the only half this
> source records; a deprecation note naming its replacement is one join from
> a remedy.

<a id="host_call_deprecated"></a>`host_call_deprecated`(C, Spec, Key) if [`host_module_call`](#host_module_call)(C, Spec, Key) and `host_member_deprecated`(`node`, Spec, Key).

<a id="host_call_remedy"></a>`host_call_remedy`(C, Spec, Key, Use) if [`host_call_deprecated`](#host_call_deprecated)(C, Spec, Key) and `host_member_replaced_by`(`node`, Spec, Key, Use).

## 6. THE GATES. Each is a statement this layer makes about itself, and

> test/js-host.test.ts plants a defect for every one.
> 
> an effect atom nobody declared: a misspelt `ioo` would propagate as real

<a id="host_effect_undeclared"></a>`host_effect_undeclared`(E) either:

1. if `host_module_effect`(something, something, E), unless `host_effect_atom`(E);
2. if `host_member_effect`(something, something, something, E), unless `host_effect_atom`(E);
3. if `host_global_effect`(something, something, E), unless `host_effect_atom`(E).

> the authored effect table accountable to the generated surface

<a id="host_effect_orphan"></a>`host_effect_orphan`(Spec, Key) either:

1. if `host_member_effect`(`node`, Spec, Key, something), unless `host_module_member`(`node`, Spec, Key);
2. if all of:
   - `host_module_effect`(`node`, Spec, something);
   - Key is `global`;
   - unless `host_module`(`node`, Spec).

<a id="host_global_effect_orphan"></a>`host_global_effect_orphan`(H, Name) if `host_global_effect`(H, Name, something), unless `host_global`(H, Name).

> The residue, over hosts that CLAIM attribution; `host_no_effects` is a
> declared absence rather than a permanently red gate.

<a id="effects_claimed"></a>`effects_claimed`(H) if `host`(H), unless `host_no_effects`(H, something).

<a id="host_module_uneffected"></a>`host_module_uneffected`(Spec) if `host_module`(`node`, Spec), unless `host_module_effect`(`node`, Spec, something).

<a id="host_global_uneffected"></a>`host_global_uneffected`(H, Name) if all of:
  - `host_global`(H, Name);
  - [`effects_claimed`](#effects_claimed)(H);
  - unless `host_global_effect`(H, Name, something).

> a runtime with no version answers NO to every version question and looks
> new rather than broken; `runtime_undated` is the waiver for `browser`

<a id="runtime_unversioned"></a>`runtime_unversioned`(R) if `runtime_version`(R, something, 0), unless `runtime_undated`(R, something).

> two runtimes agreeing on every member are one runtime; no ordering premise,
> for the reason `env_pair_indistinct` records

<a id="runtime_separates"></a>`runtime_separates`(X, B) if B [lacks the member](#host_member_absent) Key of Spec, unless X [lacks the member](#host_member_absent) Key of Spec.

<a id="runtime_pair_indistinct"></a>`runtime_pair_indistinct`(X, B) if all of:
  - `runtime_version`(X, F, something);
  - `runtime_version`(B, F, something);
  - X differs from B;
  - unless [`runtime_separates`](#runtime_separates)(X, B);
  - unless [`runtime_separates`](#runtime_separates)(B, X).

> a builtin no bare import can reach: `explicit_shape` knows the `node:`
> scheme for all 57 and the bare spelling only through `node_builtin_bare`,
> so `"fs/promises"` classifies as a third-party package. A modules-layer
> gap this pack can see and must not fix.

<a id="bare_listed"></a>`bare_listed`(Spec) if [`node_builtin_bare`](js-modules.md#node_builtin_bare)(something, Spec).

<a id="bare_builtin_unlisted"></a>`bare_builtin_unlisted`(Spec) if `host_module`(`node`, Spec), unless [`bare_listed`](#bare_listed)(Spec).

> an inclusion ACROSS families claims one runtime is a later edition of
> another; the order is not total across families

<a id="runtime_family_undeclared"></a>`runtime_family_undeclared`(R, F) if `runtime_version`(R, F, something), unless `runtime`(F).

<a id="runtime_cross_family"></a>`runtime_cross_family`(X, B) if all of:
  - `runtime_includes`(X, B);
  - `runtime_version`(X, FA, something);
  - `runtime_version`(B, FB, something);
  - FA differs from FB.

> `host/1` is generated, `runtime/1` authored; they must name the same families

<a id="host_family_mismatch"></a>`host_family_mismatch`(H) either:

1. if `host`(H), unless `runtime`(H);
2. if `runtime`(H), unless `host`(H).

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


---
world: js-modules
books: audit, code, main
default: code
---

# js-modules

## Terms

*default export*, *default import*, *dynamic import*, *export specifier*, *export-all*, *identifier*, *import*, *import attribute*, *import specifier*, *named export*, *namespace export*, *namespace import*, *string literal*.

## Kinds

A noun is a node of one of its kinds:

| noun | kinds |
|---|---|
| a default export | export_default_declaration |
| a default import | import_default_specifier |
| a dynamic import | import_expression |
| an export specifier | export_specifier |
| an export-all | export_all_declaration |
| an identifier | identifier |
| an import | import_declaration |
| an import attribute | import_attribute |
| an import specifier | import_specifier |
| a named export | export_named_declaration |
| a namespace export | export_namespace_specifier |
| a namespace import | import_namespace_specifier |
| a string literal | string_literal |

## Signatures

- walks(import I, at step K, to directory D) (walk)
- binds_the_name(import I, name Local:2, to name Imported:3, at specifier Sp:1) (binding)
- has_two_export_bindings(node Sp, name A, name B) (export_binding_conflict), in the audit
- has_two_internal_bindings(node Sp, node A, node B) (export_internal_conflict), in the audit
- has_two_default_internals(node E, node A, node B) (default_internal_conflict), in the audit
- has_two_default_exports(file F, node A, node B) (default_conflict), in the audit
- has_two_site_shapes(import I, shape A, shape B) (shape_conflict), in the audit
- lacks_a_reason(kind K, for shape Sh, with verdict R) (reason_missing), in the audit

> js-modules.rofl — THE FILE IMPORT, at the module-graph layer.
> 
> Three relations and never one `imports` edge: DEPENDS is potential (if B
> changes, A might break), FLOWS is actual (a value travels), EVALUATES means
> the module body runs. A type-only import is a DEPENDS with nothing flowing,
> and erasure has TWO markers, neither implying the other:
>   import type { e } from './d'   declaration "type", specifier "value"
>   import { type c } from './d'   declaration "value", specifier "type"
> so a rule reading one marker is wrong about one form.
> 
> Resolution is a path walk over the disk, which no AST can see: the host
> emits the specifier cut into segments and the file tree as facts, blind.
> Which directory to start in, when to walk up and what counts as arriving is
> a join, and it is here.

> from outside the AST (facts/js-modules.rofl): str_seg(S, K, Seg) cut on "/",
> str_segs(S, N), str_char0(S, C), str_scheme(S, Scheme) before the first
> ":"; fs_file, fs_dir, fs_parent, fs_file_in(Dir, Name, Path),
> fs_dir_in(Dir, Name, Child), fs_dir_of(File, Dir); node_builtin_bare(Bare,
> Canonical); shape_verdict(Shape, Reason); unknown_because.

Declared as facts: str_seg, str_segs, str_char0, str_scheme, fs_file, fs_dir, fs_parent, fs_file_in, fs_dir_in, fs_dir_of, node_builtin_bare, shape_verdict, unknown_because.

## 1. THE PLACES A MODULE SPECIFIER OCCURS — four kinds. A re-export is a site

> because it has a `source`, not because of its kind: `export { a as b }` and
> `export { a as b } from './d'` are one kind. `import_site` keeps its meaning
> (section 4 binds LOCAL names and a re-export introduces none); `module_site`
> is the union every later rule reads.

<a id="import_site"></a>`import_site`(I, N) either:

1. if I is an import and N is `static_import`;
2. if I is a dynamic import and N is `dynamic_import`.

<a id="reexport_site"></a>`reexport_site`(E, N) either:

1. if E is a named export, the `source` of E is some node, and N is `reexport_named`;
2. if E is an export-all, the `source` of E is some node, and N is `reexport_all`.

<a id="module_site"></a>`module_site`(N, K) either:

1. if [`import_site`](#import_site)(N, K);
2. if [`reexport_site`](#reexport_site)(N, K).

<a id="site_kind"></a>`site_kind`(I, N) either:

1. if I is an import and N is `import_declaration`;
2. if I is a dynamic import and N is `import_expression`;
3. if [`reexport_site`](#reexport_site)(I, `reexport_named`) and N is `export_named_declaration`;
4. if [`reexport_site`](#reexport_site)(I, `reexport_all`) and N is `export_all_declaration`.

<a id="site_file"></a>`site_file`(I, F) if [`module_site`](#module_site)(I, something) and I [is of kind](js-model.md#ast_node) some kind in file F.

<a id="site_line"></a>`site_line`(I, L) if [`module_site`](#module_site)(I, something) and I [is of kind](js-model.md#ast_node) some kind in file some file at line L.

<a id="site_source_node"></a>`site_source_node`(I, Src) if [`module_site`](#module_site)(I, something) and the `source` of I is Src.

<a id="site_source"></a>`site_source`(I, S) if [`site_source_node`](#site_source_node)(I, a string literal Src) and Src [is written as](js-structure.md#ast_value) S.

<a id="site_source_literal"></a>`site_source_literal`(I) if [`site_source`](#site_source)(I, something).

> the one irreducible cell: `import(pathVar)` names a module that does not
> exist until the expression is evaluated

<a id="site_source_computed"></a>`site_source_computed`(I) if [`site_source_node`](#site_source_node)(I, something), unless [`site_source_literal`](#site_source_literal)(I).

## 2. SOURCE SHAPE — total over literal sources, disjoint, keyed on the STRING.

> `./x` and `../x`: the first character discriminates. `#foo` is a package
> subpath (needs package.json `imports`, not read here). `node:` is a builtin
> by scheme, whatever follows; the bare form is a lookup keyed on the whole
> specifier, so `fs/promises` falls to `bare` and the oracle reports it rather
> than a rule guessing. `bare` is the complement: the classification has no hole.

<a id="explicit_shape"></a>`explicit_shape`(S, N) either:

1. if [`str_char0`](#str_char0)(S, ".") and N is `relative`;
2. if [`str_char0`](#str_char0)(S, "#") and N is `subpath`;
3. if [`str_scheme`](#str_scheme)(S, "node") and N is `node_builtin`;
4. if [`node_builtin_bare`](#node_builtin_bare)(S, something) and N is `node_builtin`.

<a id="has_explicit_shape"></a>`has_explicit_shape`(S) if [`explicit_shape`](#explicit_shape)(S, something).

<a id="src_shape"></a>`src_shape`(S, Sh) either:

1. if [`explicit_shape`](#explicit_shape)(S, Sh);
2. if all of:
   - [`str_char0`](#str_char0)(S, something);
   - Sh is `bare`;
   - unless [`has_explicit_shape`](#has_explicit_shape)(S).

<a id="site_shape"></a>`site_shape`(I, Sh) if [`site_source`](#site_source)(I, S) and [`src_shape`](#src_shape)(S, Sh).

`has_shape`(I) if [`site_shape`](#site_shape)(I, something).

## 3. RESOLUTION — a walk over the directory tree one segment at a time,

> STARTING in the importing file's own directory, which is the whole content of
> `relative`. `..` stops at the scanned root. Arrival: the LAST segment names a
> file where the walk reached — without `str_segs(S, N)` `./sub/c.ts` would
> also claim a file called `sub`. A builtin resolves to its canonical `node:`
> name by table, because a rule cannot prefix a string. `dangling_import` is a
> broken import, not a missing rule.

<a id="walk"></a>I walks at 0 to D if all of:
  - [`site_shape`](#site_shape)(I, `relative`);
  - [`site_file`](#site_file)(I, F);
  - [`fs_dir_of`](#fs_dir_of)(F, D).

I walks at K1 to D if all of:
  - I [walks](#walk) at K to D;
  - [`site_source`](#site_source)(I, S);
  - [`str_seg`](#str_seg)(S, K, ".");
  - K1 is K + 1.

I walks at K1 to P if all of:
  - I [walks](#walk) at K to D;
  - [`site_source`](#site_source)(I, S);
  - [`str_seg`](#str_seg)(S, K, "..");
  - [`fs_parent`](#fs_parent)(D, P);
  - K1 is K + 1.

I walks at K1 to C if all of:
  - I [walks](#walk) at K to D;
  - [`site_source`](#site_source)(I, S);
  - [`str_seg`](#str_seg)(S, K, Seg);
  - Seg differs from ".";
  - Seg differs from "..";
  - [`fs_dir_in`](#fs_dir_in)(D, Seg, C);
  - K1 is K + 1.

<a id="resolved_import"></a>`resolved_import`(I, T) if all of:
  - I [walks](#walk) at K to D;
  - [`site_source`](#site_source)(I, S);
  - [`str_seg`](#str_seg)(S, K, Seg);
  - [`fs_file_in`](#fs_file_in)(D, Seg, T);
  - N is K + 1;
  - [`str_segs`](#str_segs)(S, N).

<a id="builtin_canonical"></a>`builtin_canonical`(S, N) either:

1. if [`str_scheme`](#str_scheme)(S, "node") and N is S;
2. if [`node_builtin_bare`](#node_builtin_bare)(S, N).

<a id="resolved_builtin"></a>`resolved_builtin`(I, C) if all of:
  - [`site_shape`](#site_shape)(I, `node_builtin`);
  - [`site_source`](#site_source)(I, S);
  - [`builtin_canonical`](#builtin_canonical)(S, C).

`resolved_site`(I) either:

1. if [`resolved_import`](#resolved_import)(I, something);
2. if [`resolved_builtin`](#resolved_builtin)(I, something).

<a id="dangling_import"></a>`dangling_import`(I, S) if all of:
  - [`site_shape`](#site_shape)(I, `relative`);
  - [`site_source`](#site_source)(I, S);
  - unless [`resolved_site`](js-callgraph.md#resolved_site)(I).

## 4. IMPORT BINDINGS — the four specifier kinds. `imported` may be a

> StringLiteral (`import { "a-b" as c }`): two lines are cheaper than a
> verdict. A default binds `"default"`, a namespace `"*"`.

<a id="import_specifier_node"></a>`import_specifier_node`(Sp) if Sp is an import specifier or a default import or a namespace import.

<a id="import_spec"></a>`import_spec`(I, Sp) if [`import_site`](#import_site)(I, `static_import`) and Sp is among the `specifiers` of I.

<a id="spec_local"></a>`spec_local`(Sp, L) if [`import_specifier_node`](#import_specifier_node)(Sp) and the `local` of Sp [is named](js-structure.md#ast_name) L.

<a id="spec_imported"></a>`spec_imported`(Sp, M) either:

1. if Sp is an import specifier and the `imported` of Sp [is named](js-structure.md#ast_name) M;
2. if Sp is an import specifier and the `imported` of Sp [is written as](js-structure.md#ast_value) M;
3. if Sp is a default import and M is "default";
4. if Sp is a namespace import and M is "*".

<a id="binding"></a>I binds the name Local to Imported at Sp if all of:
  - [`import_spec`](#import_spec)(I, Sp);
  - [`spec_local`](#spec_local)(Sp, Local);
  - [`spec_imported`](#spec_imported)(Sp, Imported).

<a id="has_specifier"></a>`has_specifier`(I) if [`import_spec`](#import_spec)(I, something).

## 4b. EXPORT BINDINGS mirror section 4 and read OPPOSITE children: an export

> binds an EXTERNAL name to a name in THIS module, and the two can differ. An
> ExportNamespaceSpecifier carries `exported` and NO `local`, and
> `export * as ns from` is an ExportNamedDeclaration. Nothing here reads
> `source`: the naming question and the edge question are separate. Erasure
> has the same two markers as an import; a namespace specifier carries none
> and is a value binding, correctly.

<a id="export_site"></a>`export_site`(a named export E).

<a id="export_spec"></a>`export_spec`(E, Sp) if [`export_site`](#export_site)(E) and Sp is among the `specifiers` of E.

<a id="export_specifier_node"></a>`export_specifier_node`(Sp) if Sp is an export specifier or a namespace export.

<a id="spec_external"></a>`spec_external`(Sp, X) either:

1. if [`export_specifier_node`](#export_specifier_node)(Sp) and the `exported` of Sp [is named](js-structure.md#ast_name) X;
2. if [`export_specifier_node`](#export_specifier_node)(Sp) and the `exported` of Sp [is written as](js-structure.md#ast_value) X.

<a id="spec_internal"></a>`spec_internal`(Sp, L) either:

1. if Sp is an export specifier and the `local` of Sp [is named](js-structure.md#ast_name) L;
2. if Sp is a namespace export and L is "*".

<a id="export_binding"></a>`export_binding`(E, Sp, External, Internal) if all of:
  - [`export_spec`](#export_spec)(E, Sp);
  - [`spec_external`](#spec_external)(Sp, External);
  - [`spec_internal`](#spec_internal)(Sp, Internal).

<a id="export_renamed"></a>`export_renamed`(Sp, External, Internal) if [`export_binding`](#export_binding)(something, Sp, External, Internal) and External differs from Internal.

<a id="export_decl_type_only"></a>`export_decl_type_only`(E) if the attribute `export_kind` of E is "type".

<a id="export_spec_type_only"></a>`export_spec_type_only`(Sp) if the attribute `export_kind` of Sp is "type".

<a id="export_value_binding"></a>`export_value_binding`(E, Sp) if all of:
  - [`export_binding`](#export_binding)(E, Sp, something, something);
  - unless [`export_decl_type_only`](#export_decl_type_only)(E);
  - unless [`export_spec_type_only`](#export_spec_type_only)(Sp).

> the gates: every specifier yields exactly one external and one internal name
> — none is an unread child, two is a name that is not a function of the node

<a id="export_bound"></a>`export_bound`(Sp) if [`export_binding`](#export_binding)(something, Sp, something, something).

<a id="export_binding_missing"></a>`export_binding_missing`(Sp) if [`export_spec`](#export_spec)(something, Sp), unless [`export_bound`](#export_bound)(Sp).

<a id="export_binding_conflict"></a>Sp has two export bindings X and B if all of:
  - [`export_binding`](#export_binding)(something, Sp, X, something);
  - [`export_binding`](#export_binding)(something, Sp, B, something);
  - X differs from B.

<a id="export_internal_conflict"></a>Sp has two internal bindings X and B if all of:
  - [`export_binding`](#export_binding)(something, Sp, something, X);
  - [`export_binding`](#export_binding)(something, Sp, something, B);
  - X differs from B.

## 4c. THE DEFAULT EXPORT — no specifier node to hang a name on. Eight spellings

> split four and four on whether an internal name exists at all: `export
> default 42` offers `default` and nothing is named. The external name is the
> string `"default"`, the same section 4 writes for an ImportDefaultSpecifier,
> so both ends meet on one spelling. `export default q`: the declaration IS
> the name (an identifier has `name` and no `id`), hence the second arm.
> `export default interface I {}` is erased and carries `export_kind`
> "value"; its kind is outside the vocabulary and `vocabulary_gap[audit]`
> says so the day it arrives.

<a id="export_default_site"></a>`export_default_site`(a default export E).

<a id="default_external"></a>`default_external`(E, "default") if [`export_default_site`](#export_default_site)(E).

<a id="default_declaration"></a>`default_declaration`(E, D) if [`export_default_site`](#export_default_site)(E) and the `declaration` of E is D.

<a id="default_internal"></a>`default_internal`(E, N) either:

1. if [`default_declaration`](#default_declaration)(E, D) and the `id` of D [is named](js-structure.md#ast_name) N;
2. if [`default_declaration`](#default_declaration)(E, an identifier D) and D [is named](js-structure.md#ast_name) N.

<a id="has_default_internal"></a>`has_default_internal`(E) if [`default_internal`](#default_internal)(E, something).

<a id="default_anonymous"></a>`default_anonymous`(E) if [`default_declaration`](#default_declaration)(E, something), unless [`has_default_internal`](#has_default_internal)(E).

<a id="default_export_file"></a>`default_export_file`(F, a default export E) if E is in file F.

> totality, one internal name, one default per module (two in one File is
> what a collision between scanned modules would look like from here)

<a id="default_accounted"></a>`default_accounted`(E) either:

1. if [`default_internal`](#default_internal)(E, something);
2. if [`default_anonymous`](#default_anonymous)(E).

<a id="default_unaccounted"></a>`default_unaccounted`(E) if [`export_default_site`](#export_default_site)(E), unless [`default_accounted`](#default_accounted)(E).

<a id="default_internal_conflict"></a>E has two default internals X and B if all of:
  - [`default_internal`](#default_internal)(E, X);
  - [`default_internal`](#default_internal)(E, B);
  - X differs from B.

<a id="default_conflict"></a>F has two default exports X and B if all of:
  - [`default_export_file`](#default_export_file)(F, X);
  - [`default_export_file`](#default_export_file)(F, B);
  - X differs from B.

## 5. DEPENDS, FLOWS, EVALUATES. DEPENDS: the file is named. FLOWS: a binding

> that survives erasure (both negations load-bearing, one per marker) or a
> dynamic import carrying the module object. EVALUATES: the body RUNS —
> `import './side'` executes a file and `import type {}` executes nothing,
> and both read as "depends, nothing flows".

<a id="decl_type_only"></a>`decl_type_only`(I) if the attribute `import_kind` of I is "type".

<a id="spec_type_only"></a>`spec_type_only`(Sp) if the attribute `import_kind` of Sp is "type".

<a id="value_binding"></a>`value_binding`(I, Sp) if all of:
  - I [binds the name](#binding) some name to some name at Sp;
  - unless [`decl_type_only`](#decl_type_only)(I);
  - unless [`spec_type_only`](#spec_type_only)(Sp).

<a id="has_value_binding"></a>`has_value_binding`(I) if [`value_binding`](#value_binding)(I, something).

<a id="no_specifiers"></a>`no_specifiers`(I) if [`import_site`](#import_site)(I, `static_import`), unless [`has_specifier`](#has_specifier)(I).

<a id="depends"></a>`depends`(F, T) if [`resolved_import`](#resolved_import)(I, T) and [`site_file`](#site_file)(I, F).

<a id="flows"></a>`flows`(F, T) either:

1. if all of:
   - [`has_value_binding`](#has_value_binding)(I);
   - [`resolved_import`](#resolved_import)(I, T);
   - [`site_file`](#site_file)(I, F);
2. if all of:
   - [`import_site`](#import_site)(I, `dynamic_import`);
   - [`resolved_import`](#resolved_import)(I, T);
   - [`site_file`](#site_file)(I, F).

<a id="evaluates"></a>`evaluates`(F, T) either:

1. if [`flows`](#flows)(F, T);
2. if all of:
   - [`no_specifiers`](#no_specifiers)(I);
   - [`resolved_import`](#resolved_import)(I, T);
   - [`site_file`](#site_file)(I, F);
   - unless [`decl_type_only`](#decl_type_only)(I).

## 5b. THE RE-EXPORT EDGE, through a different set of markers: the export-all

> forms carry theirs on the DECLARATION with no specifier; the named forms
> carry it in both places, neither implying the other. `export {} from
> './side'` is the side-effect import's twin — measured on node: the file runs
> and nothing flows.

<a id="reexport_spec"></a>`reexport_spec`(E, Sp) if [`reexport_site`](#reexport_site)(E, `reexport_named`) and Sp is among the `specifiers` of E.

<a id="reexport_value_spec"></a>`reexport_value_spec`(E, Sp) if all of:
  - [`reexport_spec`](#reexport_spec)(E, Sp);
  - unless [`export_decl_type_only`](#export_decl_type_only)(E);
  - unless [`export_spec_type_only`](#export_spec_type_only)(Sp).

<a id="reexport_value"></a>`reexport_value`(E) either:

1. if [`reexport_value_spec`](#reexport_value_spec)(E, something);
2. if [`reexport_site`](#reexport_site)(E, `reexport_all`), unless [`export_decl_type_only`](#export_decl_type_only)(E).

<a id="has_reexport_spec"></a>`has_reexport_spec`(E) if [`reexport_spec`](#reexport_spec)(E, something).

<a id="no_reexport_specifiers"></a>`no_reexport_specifiers`(E) if [`reexport_site`](#reexport_site)(E, `reexport_named`), unless [`has_reexport_spec`](#has_reexport_spec)(E).

`flows`(F, T) if all of:
  - [`reexport_value`](#reexport_value)(E);
  - [`resolved_import`](#resolved_import)(E, T);
  - [`site_file`](#site_file)(E, F).

`evaluates`(F, T) if all of:
  - [`no_reexport_specifiers`](#no_reexport_specifiers)(E);
  - [`resolved_import`](#resolved_import)(E, T);
  - [`site_file`](#site_file)(E, F);
  - unless [`export_decl_type_only`](#export_decl_type_only)(E).

> the join: the resolver says which FILE, the specifier which name in it.
> What `export * from` offers is the other file's export list —
> `exports_name` in rules/js-dataflow.rofl, not a module-graph question.
> `"*"` rides the internal column unchanged: the module `export * as ns
> from './m'` offers IS m.

<a id="reexport_offers"></a>`reexport_offers`(F, External, T, Internal) if all of:
  - [`reexport_value_spec`](#reexport_value_spec)(E, Sp);
  - [`spec_external`](#spec_external)(Sp, External);
  - [`spec_internal`](#spec_internal)(Sp, Internal);
  - [`resolved_import`](#resolved_import)(E, T);
  - [`site_file`](#site_file)(E, F).

## 5c. WHICH MODULE AN INTERNAL NAME LIVES IN. `export { helper as reHelper }

> from './c'`: `helper` is c's name, not this file's. The guard `export_local`
> carries in js-dataflow is not transplantable — `export * as ns;` without a
> source is a SyntaxError, so excluding sourced declarations from
> `export_site` would empty the namespace-specifier cell in every program. So
> the row is kept and the silence closed: under a declaration with no
> `source` the name lives here, under a re-export in the file resolved to, and
> an unresolved re-export is placed by SHAPE, a positive relation.

<a id="local_export_site"></a>`local_export_site`(E) if [`export_site`](#export_site)(E), unless [`reexport_site`](#reexport_site)(E, `reexport_named`).

<a id="export_internal_in"></a>`export_internal_in`(Sp, F) either:

1. if all of:
   - [`export_spec`](#export_spec)(E, Sp);
   - [`local_export_site`](#local_export_site)(E);
   - E [is of kind](js-model.md#ast_node) some kind in file F;
2. if [`reexport_spec`](#reexport_spec)(E, Sp) and [`resolved_import`](#resolved_import)(E, F).

<a id="export_internal_unplaced"></a>`export_internal_unplaced`(Sp, Sh) if [`reexport_spec`](#reexport_spec)(E, Sp) and [`unresolved_import`](#unresolved_import)(E, Sh).

<a id="export_internal_elsewhere"></a>`export_internal_elsewhere`(F, X, T) if all of:
  - [`export_binding`](#export_binding)(E, Sp, X, something);
  - E [is of kind](js-model.md#ast_node) some kind in file F;
  - [`export_internal_in`](#export_internal_in)(Sp, T);
  - T differs from F.

<a id="has_internal_home"></a>`has_internal_home`(Sp) either:

1. if [`export_internal_in`](#export_internal_in)(Sp, something);
2. if [`export_internal_unplaced`](#export_internal_unplaced)(Sp, something).

<a id="export_internal_homeless"></a>`export_internal_homeless`(Sp) if [`export_binding`](#export_binding)(something, Sp, something, something), unless [`has_internal_home`](#has_internal_home)(Sp).

## 6. THE FRONTIER, AS A POSITIVE RELATION: every site is resolved or

> unresolved-with-a-shape, and `unaccounted_site` says so.

<a id="unresolved_import"></a>`unresolved_import`(I, Sh) either:

1. if [`site_shape`](#site_shape)(I, Sh), unless [`resolved_site`](js-callgraph.md#resolved_site)(I);
2. if [`site_source_computed`](#site_source_computed)(I) and Sh is `computed`.

<a id="accounted"></a>`accounted`(I) either:

1. if [`resolved_site`](js-callgraph.md#resolved_site)(I);
2. if [`unresolved_import`](#unresolved_import)(I, something).

<a id="unaccounted_site"></a>`unaccounted_site`(I) if [`module_site`](#module_site)(I, something), unless [`accounted`](#accounted)(I).

## 7. THE AUDIT — the model checked against itself; the test plants a defect

> for every row. `resolve_gap`: a shape whose verdict is `resolves` that did
> not, and is not a broken path — a builtin missing from the table.
> `site_without_kind`: the bookkeeping below is keyed on `site_kind`, so a
> site outside it leaves without moving a row, which the re-export forms did.
> Reasons are keyed on (kind, shape): per kind, one excuse satisfied every
> shape and `stale_reason` reported false rows.

<a id="resolve_gap"></a>`resolve_gap`(I, Sh) if all of:
  - [`unresolved_import`](#unresolved_import)(I, Sh);
  - [`shape_verdict`](js-callgraph.md#shape_verdict)(Sh, `resolves`) in the main;
  - unless [`dangling_import`](#dangling_import)(I, something).

<a id="has_site_kind"></a>`has_site_kind`(I) if [`site_kind`](#site_kind)(I, something).

<a id="site_without_kind"></a>`site_without_kind`(I) if [`module_site`](#module_site)(I, something), unless [`has_site_kind`](#has_site_kind)(I).

<a id="shape_conflict"></a>I has two site shapes X and B if [`site_shape`](#site_shape)(I, X), [`site_shape`](#site_shape)(I, B), and X differs from B.

<a id="shape_missing"></a>`shape_missing`(I) if [`site_source_literal`](#site_source_literal)(I), unless [`has_shape`](js-callgraph.md#has_shape)(I).

<a id="has_verdict"></a>`has_verdict`(Sh) if [`shape_verdict`](js-callgraph.md#shape_verdict)(Sh, something) in the main.

<a id="shape_without_verdict"></a>`shape_without_verdict`(Sh) either:

1. if [`site_shape`](#site_shape)(something, Sh), unless [`has_verdict`](#has_verdict)(Sh);
2. if all of:
   - [`site_source_computed`](#site_source_computed)(something);
   - Sh is `computed`;
   - unless [`has_verdict`](#has_verdict)(`computed`).

<a id="reason_missing"></a>K lacks a reason for Sh with R if all of:
  - [`unresolved_import`](#unresolved_import)(I, Sh);
  - [`site_kind`](#site_kind)(I, K);
  - [`shape_verdict`](js-callgraph.md#shape_verdict)(Sh, R) in the main;
  - R differs from `resolves`;
  - unless [`unknown_because`](js-model.md#unknown_because)(`js`, K, Sh, `modules`, R).

<a id="reason_unexercised"></a>`reason_unexercised`(K, R) if [`unknown_because`](js-model.md#unknown_because)(`js`, K, Sh, `modules`, R), unless [`reason_earned`](#reason_earned)(K, R).

<a id="reason_earned"></a>`reason_earned`(K, R) if all of:
  - [`unresolved_import`](#unresolved_import)(I, Sh);
  - [`site_kind`](#site_kind)(I, K);
  - [`shape_verdict`](js-callgraph.md#shape_verdict)(Sh, R) in the main.

## 8. THE MODULE'S OWN METADATA. `import.meta` points a module at itself;

> `meta_form` in rules/js-structure.rofl tells it from `new.target`, which
> shares the kind. `import.meta.resolve(spec)` is a specifier in a fifth place
> and NOT modelled: wiring it into `module_site` changes the relation the test
> compares site for site against node's own resolver.

<a id="module_meta"></a>`module_meta`(F, M) if M [has the meta form](js-structure.md#meta_form) `import_meta` and M [is of kind](js-model.md#ast_node) some kind in file F.

<a id="self_referential_module"></a>`self_referential_module`(F) if [`module_meta`](#module_meta)(F, something).

<a id="not_module_meta"></a>`not_module_meta`(M) if M [has the meta form](js-structure.md#meta_form) `new_target`.

## 9. IMPORT ATTRIBUTES — `with { type: "json" }` says what the module IS,

> not where. Hung off the `attributes` field, which import and export
> declarations both have. `type` is the only key ECMAScript defines; an
> unknown key is a `module_attr` row nothing reads. A module imported as data
> is NOT evaluated as code — `effect_of_module` assumes an imported module
> runs, and for these it does not. Two frontiers: an attribute whose parent is
> not a site, and one whose key or value the join could not read.

<a id="import_attr"></a>`import_attr`(an import attribute X, Key, Value) if the `key` of X [is named](js-structure.md#ast_name) Key and the `value` of X [is written as](js-structure.md#ast_value) Value.

<a id="import_attr_of"></a>`import_attr_of`(D, X) if X is among the `attributes` of D.

<a id="module_attr"></a>`module_attr`(D, Key, Value) if [`import_attr_of`](#import_attr_of)(D, X) and [`import_attr`](#import_attr)(X, Key, Value).

<a id="module_type"></a>`module_type`(D, T) if [`module_attr`](#module_attr)(D, "type", T).

<a id="module_is_data"></a>`module_is_data`(D, T) if [`module_type`](#module_type)(D, T) and T differs from "javascript".

<a id="import_attr_unsited"></a>`import_attr_unsited`(an import attribute X) unless [`import_attr_of`](#import_attr_of)(something, X).

<a id="import_attr_unread"></a>`import_attr_unread`(an import attribute X) unless [`import_attr`](#import_attr)(X, something, something).

## Read from other files

- [ast_name](js-structure.md#ast_name), in the code
- [ast_node](js-model.md#ast_node), in the code
- [ast_value](js-structure.md#ast_value), in the code
- [has_shape](js-callgraph.md#has_shape), in the code
- [meta_form](js-structure.md#meta_form), in the code
- [resolved_site](js-callgraph.md#resolved_site), in the code
- [shape_verdict](js-callgraph.md#shape_verdict), in the audit
- [unknown_because](js-model.md#unknown_because), in the main

## Not defined in these files

- `ast_attr`, in the code
- `ast_child`, in the code

> 3 trailing comments on rule lines are not carried over.


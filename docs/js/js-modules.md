---
world: js-modules
books: audit, code, main
default: code
---

# js-modules

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

<a id="import_site"></a>I is an import site of a form N either:

1. if I is an import and N is `static_import`;
2. if I is a dynamic import and N is `dynamic_import`.

<a id="reexport_site"></a>E is a reexport site of a form N either:

1. if E is a named export, the `source` of E is some node, and N is `reexport_named`;
2. if E is an export-all, the `source` of E is some node, and N is `reexport_all`.

<a id="module_site"></a>A node N is a module site of a form K either:

1. if N [is an import site](#import_site) of K;
2. if N [is a reexport site](#reexport_site) of K.

<a id="site_kind"></a>The site kind of I is N either:

1. if I is an import and N is `import_declaration`;
2. if I is a dynamic import and N is `import_expression`;
3. if I [is a reexport site](#reexport_site) of `reexport_named` and N is `export_named_declaration`;
4. if I [is a reexport site](#reexport_site) of `reexport_all` and N is `export_all_declaration`.

A site

- <a id="site_file"></a>sits in a file F if it [is a module site](#module_site) of some form and it [is in file](js-model.md#ast_node) F.
- <a id="site_line"></a>sits at line L if it [is a module site](#module_site) of some form and it [is at line](js-model.md#ast_node) L.

<a id="site_source_node"></a>The source node of a site I is a node Src if I [is a module site](#module_site) of some form and the `source` of I is Src.

<a id="site_source"></a>The source text of a site I is S if [the source node](#site_source_node) of I is a string literal Src and Src [is written as](js-structure.md#ast_value) S.

<a id="site_source_literal"></a>A site has a literal source if [the source text](#site_source) of it is some text.

> the one irreducible cell: `import(pathVar)` names a module that does not
> exist until the expression is evaluated

<a id="site_source_computed"></a>A site has a computed source if [the source node](#site_source_node) of it is some node, unless it [has a literal source](#site_source_literal).

## 2. SOURCE SHAPE — total over literal sources, disjoint, keyed on the STRING.

> `./x` and `../x`: the first character discriminates. `#foo` is a package
> subpath (needs package.json `imports`, not read here). `node:` is a builtin
> by scheme, whatever follows; the bare form is a lookup keyed on the whole
> specifier, so `fs/promises` falls to `bare` and the oracle reports it rather
> than a rule guessing. `bare` is the complement: the classification has no hole.

<a id="explicit_shape"></a>A text S has the explicit shape N either:

1. if S [starts with](#str_char0) "." and N is `relative`;
2. if S [starts with](#str_char0) "#" and N is `subpath`;
3. if S [has the scheme](#str_scheme) "node" and N is `node_builtin`;
4. if S [is the bare name](#node_builtin_bare) of some spec and N is `node_builtin`.

<a id="has_explicit_shape"></a>A text S has an explicit shape if S [has the explicit shape](#explicit_shape) some shape.

<a id="src_shape"></a>The shape of a text S is a shape Sh either:

1. if S [has the explicit shape](#explicit_shape) Sh;
2. if all of:
   - S [starts with](#str_char0) some text;
   - Sh is `bare`;
   - unless S [has an explicit shape](#has_explicit_shape).

<a id="site_shape"></a>The site shape of a site I is a shape Sh if [the source text](#site_source) of I is S and [the shape](#src_shape) of S is Sh.

A site has a shape if [the site shape](#site_shape) of it is some shape.

## 3. RESOLUTION — a walk over the directory tree one segment at a time,

> STARTING in the importing file's own directory, which is the whole content of
> `relative`. `..` stops at the scanned root. Arrival: the LAST segment names a
> file where the walk reached — without `str_segs(S, N)` `./sub/c.ts` would
> also claim a file called `sub`. A builtin resolves to its canonical `node:`
> name by table, because a rule cannot prefix a string. `dangling_import` is a
> broken import, not a missing rule.

A site

- <a id="walk"></a>walks at 0 to a directory D if all of:
  - [the site shape](#site_shape) of it is `relative`;
  - it [sits in](#site_file) a file F;
  - [`fs_dir_of`](#fs_dir_of)(F, D).
- walks at a step K1 to a directory D if all of:
  - it [walks](#walk) at a step K to D;
  - [the source text](#site_source) of it is S;
  - [`str_seg`](#str_seg)(S, K, ".");
  - K1 is K + 1.
- walks at a step K1 to a directory P if all of:
  - it [walks](#walk) at a step K to a directory D;
  - [the source text](#site_source) of it is S;
  - [`str_seg`](#str_seg)(S, K, "..");
  - [`fs_parent`](#fs_parent)(D, P);
  - K1 is K + 1.
- walks at a step K1 to a directory C if all of:
  - it [walks](#walk) at a step K to a directory D;
  - [the source text](#site_source) of it is S;
  - [`str_seg`](#str_seg)(S, K, Seg);
  - Seg differs from ".";
  - Seg differs from "..";
  - [`fs_dir_in`](#fs_dir_in)(D, Seg, C);
  - K1 is K + 1.
- <a id="resolved_import"></a>resolves to the file T if all of:
  - it [walks](#walk) at a step K to a directory D;
  - [the source text](#site_source) of it is S;
  - [`str_seg`](#str_seg)(S, K, Seg);
  - D [holds the file](#fs_file_in) Seg being T;
  - N is K + 1;
  - [`str_segs`](#str_segs)(S, N).

<a id="builtin_canonical"></a>The canonical builtin of a text S is a spec N either:

1. if S [has the scheme](#str_scheme) "node" and N is S;
2. if S [is the bare name](#node_builtin_bare) of N.

<a id="resolved_builtin"></a>A site resolves to the builtin C if all of:
  - [the site shape](#site_shape) of it is `node_builtin`;
  - [the source text](#site_source) of it is S;
  - [the canonical builtin](#builtin_canonical) of S is C.

A node I is resolved either:

1. if I [resolves to the file](#resolved_import) some file;
2. if I [resolves to the builtin](#resolved_builtin) some spec.

<a id="dangling_import"></a>A site is a dangling import of a text S if all of:
  - [the site shape](#site_shape) of it is `relative`;
  - [the source text](#site_source) of it is S;
  - unless it [is resolved](js-callgraph.md#resolved_site).

## 4. IMPORT BINDINGS — the four specifier kinds. `imported` may be a

> StringLiteral (`import { "a-b" as c }`): two lines are cheaper than a
> verdict. A default binds `"default"`, a namespace `"*"`.

<a id="import_specifier_node"></a>Sp names an import if Sp is an import specifier or a default import or a namespace import.

<a id="import_spec"></a>A site has the import specifier Sp if it [is an import site](#import_site) of `static_import` and Sp is among the `specifiers` of it.

<a id="spec_local"></a>A node binds locally L if it [names an import](#import_specifier_node) and the `local` of it [is named](js-structure.md#ast_name) L.

<a id="spec_imported"></a>Sp imports the name M either:

1. if Sp is an import specifier and the `imported` of Sp [is named](js-structure.md#ast_name) M;
2. if Sp is an import specifier and the `imported` of Sp [is written as](js-structure.md#ast_value) M;
3. if Sp is a default import and M is "default";
4. if Sp is a namespace import and M is "*".

A site

- <a id="binding"></a>binds the name Local to Imported at a specifier Sp if all of:
  - it [has the import specifier](#import_spec) Sp;
  - Sp [binds locally](#spec_local) Local;
  - Sp [imports the name](#spec_imported) Imported.
- <a id="has_specifier"></a>has a specifier if it [has the import specifier](#import_spec) some node.

## 4b. EXPORT BINDINGS mirror section 4 and read OPPOSITE children: an export

> binds an EXTERNAL name to a name in THIS module, and the two can differ. An
> ExportNamespaceSpecifier carries `exported` and NO `local`, and
> `export * as ns from` is an ExportNamedDeclaration. Nothing here reads
> `source`: the naming question and the edge question are separate. Erasure
> has the same two markers as an import; a namespace specifier carries none
> and is a value binding, correctly.

<a id="export_site"></a>A named export is an export site.

<a id="export_spec"></a>A node has the export specifier Sp if it [is an export site](#export_site) and Sp is among the `specifiers` of it.

<a id="export_specifier_node"></a>Sp names an export if Sp is an export specifier or a namespace export.

<a id="spec_external"></a>A node Sp exports as X either:

1. if Sp [names an export](#export_specifier_node) and the `exported` of Sp [is named](js-structure.md#ast_name) X;
2. if Sp [names an export](#export_specifier_node) and the `exported` of Sp [is written as](js-structure.md#ast_value) X.

<a id="spec_internal"></a>Sp exports the local L either:

1. if Sp is an export specifier and the `local` of Sp [is named](js-structure.md#ast_name) L;
2. if Sp is a namespace export and L is "*".

A node

- <a id="export_binding"></a>exports Internal as External at a node Sp if all of:
  - it [has the export specifier](#export_spec) Sp;
  - Sp [exports as](#spec_external) External;
  - Sp [exports the local](#spec_internal) Internal.
- <a id="export_renamed"></a>renames on export Internal to External if some node [exports](#export_binding) Internal as External at it and External differs from Internal.
- <a id="export_decl_type_only"></a>is a type only export if the attribute `export_kind` of it is "type".
- <a id="export_spec_type_only"></a>is a type only export specifier if the attribute `export_kind` of it is "type".
- <a id="export_value_binding"></a>binds a value export at a node Sp if it [exports](#export_binding) some name as some name at Sp, unless it [is a type only export](#export_decl_type_only) or Sp [is a type only export specifier](#export_spec_type_only).

> the gates: every specifier yields exactly one external and one internal name
> — none is an unread child, two is a name that is not a function of the node

In the audit:

A node

- <a id="export_bound"></a>has an export binding if some node [exports](#export_binding) some name as some name at it.
- <a id="export_binding_missing"></a>has no export binding if some node [has the export specifier](#export_spec) it, unless it [has an export binding](#export_bound).
- <a id="export_binding_conflict"></a>has two export bindings X and B if all of:
  - some node [exports](#export_binding) some name as X at it;
  - some node [exports](#export_binding) some name as B at it;
  - X differs from B.
- <a id="export_internal_conflict"></a>has two internal bindings X and B if all of:
  - some node [exports](#export_binding) X as some name at it;
  - some node [exports](#export_binding) B as some name at it;
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

In the code:

<a id="export_default_site"></a>A default export is a default export site.

<a id="default_external"></a>A node exports by default as "default" if it [is a default export site](#export_default_site).

<a id="default_declaration"></a>The default declaration of a node E is a node D if E [is a default export site](#export_default_site) and the `declaration` of E is D.

<a id="default_internal"></a>A node E exports by default N either:

1. if [the default declaration](#default_declaration) of E is a node D and the `id` of D [is named](js-structure.md#ast_name) N;
2. if [the default declaration](#default_declaration) of E is an identifier D and D [is named](js-structure.md#ast_name) N.

A node

- <a id="has_default_internal"></a>has a default internal if it [exports by default](#default_internal) some name.
- <a id="default_anonymous"></a>exports an anonymous default if [the default declaration](#default_declaration) of it is some node, unless it [has a default internal](#has_default_internal).

<a id="default_export_file"></a>A file F has the default export E if E is in file F and E is a default export.

> totality, one internal name, one default per module (two in one File is
> what a collision between scanned modules would look like from here)

In the audit:

<a id="default_accounted"></a>A node E is an accounted default either:

1. if E [exports by default](#default_internal) some name;
2. if E [exports an anonymous default](#default_anonymous).

A node

- <a id="default_unaccounted"></a>is an unaccounted default if it [is a default export site](#export_default_site), unless it [is an accounted default](#default_accounted).
- <a id="default_internal_conflict"></a>has two default internals X and B if all of:
  - it [exports by default](#default_internal) X;
  - it [exports by default](#default_internal) B;
  - X differs from B.

<a id="default_conflict"></a>A file F has two default exports X and B if all of:
  - F [has the default export](#default_export_file) X;
  - F [has the default export](#default_export_file) B;
  - X differs from B.

## 5. DEPENDS, FLOWS, EVALUATES. DEPENDS: the file is named. FLOWS: a binding

> that survives erasure (both negations load-bearing, one per marker) or a
> dynamic import carrying the module object. EVALUATES: the body RUNS —
> `import './side'` executes a file and `import type {}` executes nothing,
> and both read as "depends, nothing flows".

In the code:

A node

- <a id="decl_type_only"></a>is a type only import if the attribute `import_kind` of it is "type".
- <a id="spec_type_only"></a>is a type only import specifier if the attribute `import_kind` of it is "type".

A site

- <a id="value_binding"></a>binds a value at a node Sp if it [binds the name](#binding) some name to some name at Sp, unless it [is a type only import](#decl_type_only) or Sp [is a type only import specifier](#spec_type_only).
- <a id="has_value_binding"></a>binds a value if it [binds a value](#value_binding) at some node.
- <a id="no_specifiers"></a>has no specifiers if it [is an import site](#import_site) of `static_import`, unless it [has a specifier](#has_specifier).

<a id="depends"></a>A file F depends on a file T if a site I [resolves to the file](#resolved_import) T and I [sits in](#site_file) F.

<a id="flows"></a>A file F takes values from a file T either:

1. if all of:
   - a site I [binds a value](#has_value_binding);
   - I [resolves to the file](#resolved_import) T;
   - I [sits in](#site_file) F;
2. if all of:
   - a node I [is an import site](#import_site) of `dynamic_import`;
   - I [resolves to the file](#resolved_import) T;
   - I [sits in](#site_file) F.

<a id="evaluates"></a>A file F evaluates the module T either:

1. if F [takes values from](#flows) T;
2. if all of:
   - a site I [has no specifiers](#no_specifiers);
   - I [resolves to the file](#resolved_import) T;
   - I [sits in](#site_file) F;
   - unless I [is a type only import](#decl_type_only).

## 5b. THE RE-EXPORT EDGE, through a different set of markers: the export-all

> forms carry theirs on the DECLARATION with no specifier; the named forms
> carry it in both places, neither implying the other. `export {} from
> './side'` is the side-effect import's twin — measured on node: the file runs
> and nothing flows.

A node

- <a id="reexport_spec"></a>has the reexport specifier Sp if it [is a reexport site](#reexport_site) of `reexport_named` and Sp is among the `specifiers` of it.
- <a id="reexport_value_spec"></a>reexports a value at a node Sp if it [has the reexport specifier](#reexport_spec) Sp, unless it [is a type only export](#export_decl_type_only) or Sp [is a type only export specifier](#export_spec_type_only).

<a id="reexport_value"></a>A node E reexports a value either:

1. if E [reexports a value at](#reexport_value_spec) some node;
2. if E [is a reexport site](#reexport_site) of `reexport_all`, unless E [is a type only export](#export_decl_type_only).

A node

- <a id="has_reexport_spec"></a>has a reexport specifier if it [has the reexport specifier](#reexport_spec) some node.
- <a id="no_reexport_specifiers"></a>has no reexport specifiers if it [is a reexport site](#reexport_site) of `reexport_named`, unless it [has a reexport specifier](#has_reexport_spec).

A file F

- takes values from a file T if all of:
  - a node E [reexports a value](#reexport_value);
  - E [resolves to the file](#resolved_import) T;
  - E [sits in](#site_file) F.
- evaluates the module T if all of:
  - a node E [has no reexport specifiers](#no_reexport_specifiers);
  - E [resolves to the file](#resolved_import) T;
  - E [sits in](#site_file) F;
  - unless E [is a type only export](#export_decl_type_only).

> the join: the resolver says which FILE, the specifier which name in it.
> What `export * from` offers is the other file's export list —
> `exports_name` in rules/js-dataflow.rofl, not a module-graph question.
> `"*"` rides the internal column unchanged: the module `export * as ns
> from './m'` offers IS m.

<a id="reexport_offers"></a>A file F reexports Internal of a file T as External if all of:
  - a node E [reexports a value at](#reexport_value_spec) a node Sp;
  - Sp [exports as](#spec_external) External;
  - Sp [exports the local](#spec_internal) Internal;
  - E [resolves to the file](#resolved_import) T;
  - E [sits in](#site_file) F.

## 5c. WHICH MODULE AN INTERNAL NAME LIVES IN. `export { helper as reHelper }

> from './c'`: `helper` is c's name, not this file's. The guard `export_local`
> carries in js-dataflow is not transplantable — `export * as ns;` without a
> source is a SyntaxError, so excluding sourced declarations from
> `export_site` would empty the namespace-specifier cell in every program. So
> the row is kept and the silence closed: under a declaration with no
> `source` the name lives here, under a re-export in the file resolved to, and
> an unresolved re-export is placed by SHAPE, a positive relation.

<a id="local_export_site"></a>A node is a local export site if it [is an export site](#export_site), unless it [is a reexport site](#reexport_site) of `reexport_named`.

<a id="export_internal_in"></a>A node Sp has its internal in a file F either:

1. if all of:
   - a node E [has the export specifier](#export_spec) Sp;
   - E [is a local export site](#local_export_site);
   - E [is in file](js-model.md#ast_node) F;
2. if a node E [has the reexport specifier](#reexport_spec) Sp and E [resolves to the file](#resolved_import) F.

<a id="export_internal_unplaced"></a>A node has an unplaced internal of a shape Sh if a node E [has the reexport specifier](#reexport_spec) it and E [is unresolved with shape](#unresolved_import) Sh.

<a id="export_internal_elsewhere"></a>A file F exports X from a file T if all of:
  - a node E [exports](#export_binding) some name as X at a node Sp;
  - E [is in file](js-model.md#ast_node) F;
  - Sp [has its internal in](#export_internal_in) T;
  - T differs from F.

In the audit:

<a id="has_internal_home"></a>A node Sp has an internal home either:

1. if Sp [has its internal in](#export_internal_in) some file;
2. if Sp [has an unplaced internal](#export_internal_unplaced) of some shape.

<a id="export_internal_homeless"></a>A node has no internal home if some node [exports](#export_binding) some name as some name at it, unless it [has an internal home](#has_internal_home).

## 6. THE FRONTIER, AS A POSITIVE RELATION: every site is resolved or

> unresolved-with-a-shape, and `unaccounted_site` says so.

In the code:

<a id="unresolved_import"></a>A site I is unresolved with shape Sh either:

1. if [the site shape](#site_shape) of I is Sh, unless I [is resolved](js-callgraph.md#resolved_site);
2. if I [has a computed source](#site_source_computed) and Sh is `computed`.

In the audit:

<a id="accounted"></a>A site I is an accounted site either:

1. if I [is resolved](js-callgraph.md#resolved_site);
2. if I [is unresolved with shape](#unresolved_import) some shape.

<a id="unaccounted_site"></a>A site is an unaccounted site if it [is a module site](#module_site) of some form, unless it [is an accounted site](#accounted).

## 7. THE AUDIT — the model checked against itself; the test plants a defect

> for every row. `resolve_gap`: a shape whose verdict is `resolves` that did
> not, and is not a broken path — a builtin missing from the table.
> `site_without_kind`: the bookkeeping below is keyed on `site_kind`, so a
> site outside it leaves without moving a row, which the re-export forms did.
> Reasons are keyed on (kind, shape): per kind, one excuse satisfied every
> shape and `stale_reason` reported false rows.

A site

- <a id="resolve_gap"></a>is a resolve gap of a shape Sh if all of:
  - it [is unresolved with shape](#unresolved_import) Sh;
  - [`shape_verdict`](js-callgraph.md#shape_verdict)(Sh, `resolves`) in the main;
  - unless it [is a dangling import](#dangling_import) of some text.
- <a id="has_site_kind"></a>has a site kind if [the site kind](#site_kind) of it is some kind.
- <a id="site_without_kind"></a>has no site kind if it [is a module site](#module_site) of some form, unless it [has a site kind](#has_site_kind).
- <a id="shape_conflict"></a>has two site shapes X and B if all of:
  - [the site shape](#site_shape) of it is X;
  - [the site shape](#site_shape) of it is B;
  - X differs from B.
- <a id="shape_missing"></a>has no site shape if it [has a literal source](#site_source_literal), unless it [has a shape](js-callgraph.md#has_shape).

<a id="has_verdict"></a>A shape has a verdict if [`shape_verdict`](js-callgraph.md#shape_verdict)(it, something) in the main.

<a id="shape_without_verdict"></a>A shape Sh has no verdict either:

1. if [the site shape](#site_shape) of some site is Sh, unless Sh [has a verdict](#has_verdict);
2. if all of:
   - some site [has a computed source](#site_source_computed);
   - Sh is `computed`;
   - unless `computed` [has a verdict](#has_verdict).

A kind K

- <a id="reason_missing"></a>lacks a reason for a shape Sh with a verdict R if all of:
  - a site I [is unresolved with shape](#unresolved_import) Sh;
  - [the site kind](#site_kind) of I is K;
  - [`shape_verdict`](js-callgraph.md#shape_verdict)(Sh, R) in the main;
  - R differs from `resolves`;
  - unless K [is unknown](js-model.md#unknown_because) with Sh in `modules` of `js` because R.
- <a id="reason_unexercised"></a>has an unexercised reason R if K [is unknown](js-model.md#unknown_because) with a shape Sh in `modules` of `js` because R, unless K [earns the reason](#reason_earned) R.
- <a id="reason_earned"></a>earns the reason R if all of:
  - a site I [is unresolved with shape](#unresolved_import) Sh;
  - [the site kind](#site_kind) of I is K;
  - [`shape_verdict`](js-callgraph.md#shape_verdict)(Sh, R) in the main.

## 8. THE MODULE'S OWN METADATA. `import.meta` points a module at itself;

> `meta_form` in rules/js-structure.rofl tells it from `new.target`, which
> shares the kind. `import.meta.resolve(spec)` is a specifier in a fifth place
> and NOT modelled: wiring it into `module_site` changes the relation the test
> compares site for site against node's own resolver.

In the code:

A file F

- <a id="module_meta"></a>has the module meta M if M [has the meta form](js-structure.md#meta_form) `import_meta` and M [is in file](js-model.md#ast_node) F.
- <a id="self_referential_module"></a>is self referential if F [has the module meta](#module_meta) some node.

In the audit:

<a id="not_module_meta"></a>A node is not module meta if it [has the meta form](js-structure.md#meta_form) `new_target`.

## 9. IMPORT ATTRIBUTES — `with { type: "json" }` says what the module IS,

> not where. Hung off the `attributes` field, which import and export
> declarations both have. `type` is the only key ECMAScript defines; an
> unknown key is a `module_attr` row nothing reads. A module imported as data
> is NOT evaluated as code — `effect_of_module` assumes an imported module
> runs, and for these it does not. Two frontiers: an attribute whose parent is
> not a site, and one whose key or value the join could not read.

In the code:

<a id="import_attr"></a>An import attribute carries Key holding Value if the `key` of it [is named](js-structure.md#ast_name) Key and the `value` of it [is written as](js-structure.md#ast_value) Value.

A node

- <a id="import_attr_of"></a>has the import attribute X if X is among the `attributes` of it.
- <a id="module_attr"></a>imports with the attribute Key holding Value if it [has the import attribute](#import_attr_of) X and X [carries](#import_attr) Key holding Value.
- <a id="module_type"></a>imports the module type T if it [imports with the attribute](#module_attr) "type" holding T.
- <a id="module_is_data"></a>imports a data module of a text T if it [imports the module type](#module_type) T and T differs from "javascript".

In the audit:

An import attribute

- <a id="import_attr_unsited"></a>is unsited unless some node [has the import attribute](#import_attr_of) it.
- <a id="import_attr_unread"></a>is unread unless it [carries](#import_attr) some key holding some text.

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


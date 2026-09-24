---
world: js-controlflow
books: audit, code, flow, main
default: code
---

# js-controlflow

> js-controlflow.rofl — THE CONTROL-FLOW LAYER: not WHICH function a site
> reaches but WHETHER the site runs at all. It writes into [code]; everything
> here is a fact about a position in the tree.
> 
> The whole layer is a MAY-set in one direction: `guarded` means "may not
> run", never "never runs". A set too WIDE is a hedge; a set too NARROW is a
> claim, and the narrow direction is the dangerous one throughout.

Reads:

- from js-callgraph: [call_site](js-callgraph.rofl.md#call_site), [fn_name](js-callgraph.rofl.md#fn_name), [fn_node](js-callgraph.rofl.md#fn_node), [for_of_iterates](js-callgraph.rofl.md#for_of_iterates), [nearest_fn](js-callgraph.rofl.md#nearest_fn), [resolves](js-callgraph.rofl.md#resolves), [top_call](js-callgraph.rofl.md#top_call)
- from js-dataflow: [export_local](js-dataflow.rofl.md#export_local), [pattern_takes](js-dataflow.rofl.md#pattern_takes), [private_binds](js-dataflow.rofl.md#private_binds), [rest_in_pattern](js-dataflow.rofl.md#rest_in_pattern)
- from js-dataflow, in the flow: [catch_of](js-dataflow.rofl.md#catch_of), [catch_param](js-dataflow.rofl.md#catch_param), [may_be_lit](js-dataflow.rofl.md#may_be_lit), [may_be_node](js-dataflow.rofl.md#may_be_node), [member_node_v](js-dataflow.rofl.md#member_node_v), [member_value](js-dataflow.rofl.md#member_value), [nearest_v](js-dataflow.rofl.md#nearest_v), [returns](js-dataflow.rofl.md#returns), [selects](js-dataflow.rofl.md#selects), [try_block](js-dataflow.rofl.md#try_block)
- from js-model: [ast_node](js-model.rofl.md#ast_node)
- from js-structure: [ast_within](js-structure.rofl.md#ast_within)
- from the scanner:
  - <a id="ast_attr"></a>The attribute of a node is a value (`ast_attr`)
  - <a id="ast_child"></a>A node is a child of a node (`ast_child`)

## Words

What this file calls a node, and what each word stands for:

| word | stands for |
|---|---|
| <a id="noun-abrupt_statement"></a>an abrupt statement | a node of one of the kinds `return_statement`, `throw_statement`, `break_statement`, `continue_statement` (`abrupt_kind`) |
| <a id="noun-array_pattern"></a>an array pattern | a node of kind `array_pattern` |
| <a id="noun-block"></a>a block | a node of kind `block_statement` |
| <a id="noun-declarator"></a>a declarator | a node of kind `variable_declarator` |
| <a id="noun-export_declaration"></a>an export declaration | a node of one of the kinds `export_named_declaration`, `export_default_declaration` (`export_kind`) |
| <a id="noun-for-of"></a>a for-of | a node of kind `for_of_statement` |
| <a id="noun-if"></a>an if | a node of kind `if_statement` |
| <a id="noun-label"></a>a label | a node of kind `labeled_statement` |
| <a id="noun-object_literal"></a>an object literal | a node of kind `object_expression` |
| <a id="noun-object_pattern"></a>an object pattern | a node of kind `object_pattern` |
| <a id="noun-rest"></a>a rest | a node of kind `rest_element` |
| <a id="noun-return"></a>a return | a node of kind `return_statement` |
| <a id="noun-short_circuit"></a>a short circuit | a node of one of the kinds `optional_call_expression`, `optional_member_expression` (`short_circuit_kind`) |
| <a id="noun-spread"></a>a spread | a node of kind `spread_element` |
| <a id="noun-throw"></a>a throw | a node of kind `throw_statement` |
| <a id="noun-try"></a>a try | a node of kind `try_statement` |
| a function | a node [`fn_node`](js-callgraph.rofl.md#fn_node) holds of |
| a member access | a node [`member_node_v`](js-dataflow.rofl.md#member_node_v) holds of |

Phrases this file defines in one step, each by the sentence it stands for:

- <a id="label_escaped"></a>LS is escaped if some node [targets the label](#label_target) LS.
- <a id="has_return"></a>A [function](js-callgraph.rofl.md#fn_node) has a return if a [return](#noun-return) R [is within](js-structure.rofl.md#ast_within) it.
- <a id="hidden_call_fires"></a>A node fires a hidden call if it [fires the hidden call](#hidden_call_user) some node.
- <a id="hidden_call_sourced"></a>A node has a sourced hidden call if [the hidden call source](#hidden_call_src) of it is some node.
- <a id="try_of"></a>A [try](#noun-try) lies in F if F [is nearest to](js-dataflow.rofl.md#nearest_v) it.
- A node is a function if it [answers to](js-callgraph.rofl.md#fn_name) some name.
- <a id="in_fn"></a>A node is inside a function if some function [is nearest to](js-dataflow.rofl.md#nearest_v) it.
- <a id="entry_point"></a>F is an entry point if F [is exported](#exported_fn).

## 1. A POSITION THAT ONLY RUNS SOMETIMES — one row per (parent, arm), and

> the vocabulary is closed: `guard_unmodelled[audit]` reports a kind that
> branches and is not here. `&&`, `||`, `??` all short-circuit, so the kind
> suffices. `do_while_statement` is NOT here: its body runs before the test. A `for`'s
> `update` runs zero times when the test fails at once. A default value (the
> `right` of an `assignment_pattern`) runs only when the argument is absent;
> the `left` is a name and not conditional. Of a `try` only the HANDLER is a
> guard: the block and the finalizer always run.

`guard_kind` lists:

| kind | field |
|---|---|
| `if_statement` | `consequent` |
| `if_statement` | `alternate` |
| `conditional_expression` | `consequent` |
| `conditional_expression` | `alternate` |
| `logical_expression` | `right` |
| `for_of_statement` | `body` |
| `for_statement` | `body` |
| `for_statement` | `update` |
| `for_in_statement` | `body` |
| `while_statement` | `body` |
| `assignment_pattern` | `right` |
| `switch_case` | `consequent` |
| `try_statement` | `handler` |

Declared as facts:

- <a id="guard_kind"></a>A kind K guards the field Field — rows in this file

> ANY index: `switch_case`'s `consequent` is an array, one arm per statement.

<a id="guard_arm"></a>A node guards the arm X if all of:
  - a kind K [guards the field](#guard_kind) Field;
  - it [is of kind](js-model.rofl.md#ast_node) K;
  - X [is among the](#ast_child) Field of it.

> A non-static field initialiser runs once per construction and never if the
> class is never constructed; a static one runs with the definition. Derived
> from `transfer_mechanism(K, per_construction)`, not a second list.

A node

- <a id="field_init"></a>has the field initialiser V if all of:
  - a kind K [transfers by](#transfer_mechanism) `per_construction`;
  - it [is of kind](js-model.rofl.md#ast_node) K;
  - [the attribute](#ast_attr) `static` of it is `false`;
  - the `value` of it is V.
- guards the arm V if it [has the field initialiser](#field_init) V.
- <a id="guarded"></a>is guarded if some node [guards the arm](#guard_arm) it.
- is guarded if some node [guards the arm](#guard_arm) X and it [is within](js-structure.rofl.md#ast_within) X.

## 2. STATEMENT ORDER. After a return/throw/break/continue the rest of the list

> never runs; `guarded` weakens that NEVER into a MAY on purpose — one
> vocabulary, one reader. Statement lists sit under `body` and under
> `switch_case`'s `consequent`; the field is carried so an abrupt in one field
> cannot reach a statement in another.

`stmt_seq_field` includes `body`, `consequent`.

Declared as facts:

- <a id="abrupt_kind"></a>`abrupt_kind` — rows in Words
- <a id="stmt_seq_field"></a>A field F is a statement sequence field — rows in this file

> `abrupt_at` is a handful of rows and binds B and F: the second literal probes.

<a id="after_abrupt"></a>A node follows an abrupt completion if all of:
  - a node B [is abrupt](#abrupt_at) at a field F from an index I;
  - it is the J-th of the F of B;
  - I < J.

> A SUSPENSION (`await`, `yield`) is a point after which the rest may not run —
> control comes back only if the promise settles — so it lands in `guarded` as
> a MAY and is deliberately not an `abrupt_at` arm. Confined to the suspending
> function: without `nearest_v` an `await` inside a function would guard
> everything after that function's declaration at module level.

A node

- <a id="suspend_at"></a>suspends at a field F from an index I if all of:
  - a kind K [transfers by](#transfer_mechanism) `suspend`;
  - a node X [is of kind](js-model.rofl.md#ast_node) K;
  - a node G [is nearest to](js-dataflow.rofl.md#nearest_v) X;
  - a node S [is within](js-structure.rofl.md#ast_within) G;
  - X [is within](js-structure.rofl.md#ast_within) S;
  - F [is a statement sequence field](#stmt_seq_field);
  - S is the I-th of the F of it.
- <a id="after_suspend"></a>follows a suspension if all of:
  - a node B [suspends](#suspend_at) at a field F from an index I;
  - it is the J-th of the F of B;
  - I < J.

> a sequence field the scanner never emits: the typo hole, as `guard_arm_unseen`

In the audit:

<a id="stmt_seq_unseen"></a>A field is an unseen statement field if it [is a statement sequence field](#stmt_seq_field), unless the it of some node is some node.

> A LABEL is a boundary an ordinary break cannot cross: `break outer` kills the
> statements between the reference and its target, and the walk stops at the
> label. The label is read, not the keyword, so an unlabelled break derives
> nothing here. The target is unique by grammar (a nested duplicate label is a
> SyntaxError) and a label is not in scope inside a nested function, so no
> function-boundary literal is needed. `if (c) break outer;` puts a guard
> between reference and target and the walking arms then say NEVER where the
> honest word is MAY (f_after_abrupt_says_never_and_the_walking_arms_say_may);
> harmless, because both consumers read through `guarded`.

In the code:

<a id="label_name"></a>The label name of a [label](#noun-label) LS is N if the `label` of LS is a node I and [the attribute](#ast_attr) `name` of I is N.

<a id="label_ref"></a>An [abrupt statement](#noun-abrupt_statement) refers to the label N if the `label` of it is a node I and [the attribute](#ast_attr) `name` of I is N.

A node

- <a id="label_target"></a>targets the label LS if all of:
  - it [refers to the label](#label_ref) N;
  - [the label name](#label_name) of LS is N;
  - it [is within](js-structure.rofl.md#ast_within) LS.
- <a id="abrupt_at"></a>is abrupt at a field F from an index I if all of:
  - a node X [targets the label](#label_target) LS;
  - a node S [is within](js-structure.rofl.md#ast_within) LS;
  - X [is within](js-structure.rofl.md#ast_within) S;
  - F [is a statement sequence field](#stmt_seq_field);
  - S is the I-th of the F of it.

## COMPLETION — not a ninth mechanism but the CLOSURE: does this statement

> complete normally? A sound under-approximation: a statement it does not name
> may still complete abruptly (a `guarded` set too small); it must never name
> one that CAN complete normally, so each arm is the language's rule for its
> kind. A block completes abruptly if ANY statement in it does — not the last:
> an abrupt statement is the last that runs. An `if` only if BOTH arms exist
> and both do. A labelled statement only if its body does AND nothing breaks
> out of it. Seeded from `completes_abruptly` and walked UP one edge; the other
> way the first literal is every block in the corpus.

`completion_kind` includes `block_statement`, `if_statement`, `labeled_statement`.

<a id="completes_abruptly"></a>An [abrupt statement](#noun-abrupt_statement) completes abruptly.

A [block](#noun-block) completes abruptly if a node S [completes abruptly](#completes_abruptly) and S [is among the](#ast_child) `body` of it.

An [if](#noun-if) completes abruptly if all of:
  - a node C [completes abruptly](#completes_abruptly);
  - the `consequent` of it is C;
  - the `alternate` of it [completes abruptly](#completes_abruptly).

A [label](#noun-label) completes abruptly if all of:
  - a node S [completes abruptly](#completes_abruptly);
  - the `body` of it is S;
  - unless it [is escaped](#label_escaped).

Declared as facts:

- <a id="completion_kind"></a>A kind K is a completion kind — rows in this file

> the consumer: it replaces the old four-kind arm rather than sitting beside
> it, since the base case IS that arm

A node is abrupt at a field F from an index I if all of:
  - a node S [completes abruptly](#completes_abruptly);
  - F [is a statement sequence field](#stmt_seq_field);
  - S is the I-th of the F of it.

> a kind this closure claims and never decides — misspelled, deleted or
> unexercised all read as "the closure is smaller than it says"

<a id="completion_decided"></a>A kind K has a decided completion if a node S [completes abruptly](#completes_abruptly) and S [is of kind](js-model.rofl.md#ast_node) K.

In the audit:

<a id="completion_unreached"></a>A kind K has an unreached completion if all of:
  - K [is a completion kind](#completion_kind);
  - some node [is of kind](js-model.rofl.md#ast_node) K;
  - unless K [has a decided completion](#completion_decided).

> Seven kinds can hold a `return` and still complete normally, declared rather
> than left to fall through the block arm: a loop body may run zero times (its
> condition); `do_while_statement` and `switch` need the completion REASON — a
> `continue` or `break` completes the loop or switch normally — which this
> relation does not carry; a `try`'s handler may swallow the transfer and
> `finally` may override it.

`completion_deferred` lists:

| kind | reason |
|---|---|
| `while_statement` | `a_condition_this_layer_cannot_decide` |
| `for_statement` | `a_condition_this_layer_cannot_decide` |
| `for_in_statement` | `a_condition_this_layer_cannot_decide` |
| `for_of_statement` | `a_condition_this_layer_cannot_decide` |
| `do_while_statement` | `a_completion_reason_this_relation_does_not_carry` |
| `switch_statement` | `a_completion_reason_this_relation_does_not_carry` |
| `try_statement` | `a_handler_that_may_swallow_the_transfer` |

In the main:

<a id="completion_known"></a>A kind K has a known completion either:

1. if K [is a completion kind](#completion_kind);
2. if K [defers its completion](#completion_deferred) because some reason;
3. if [`abrupt_kind`](#abrupt_kind)(K).

Declared as facts:

- <a id="completion_deferred"></a>A kind K defers its completion because a reason R — rows in this file

> The gate: a statement kind holding an abrupt completion inside its own
> region, in a statement list, in neither table — silently read as "completes
> normally". The function boundary is the precision clause:
> `const f = () => { return 1 }` is a declaration holding a return. Seeded from
> the candidate and the boundary asked of it; the other order crossed every
> function with every abrupt completion, 8.8 s to 21.7 s for one rule.

In the code:

A node

- <a id="completion_outer"></a>carries the completion of a node S if all of:
  - S [completes abruptly](#completes_abruptly);
  - S [is within](js-structure.rofl.md#ast_within) it;
  - it [is of kind](js-model.rofl.md#ast_node) K but is not a [function](js-callgraph.rofl.md#fn_node);
  - a field F [is a statement sequence field](#stmt_seq_field);
  - it [is among the](#ast_child) F of some node;
  - unless K [has a known completion](#completion_known).
- <a id="completion_fn_between"></a>is cut by a function from a node S if all of:
  - it [carries the completion](#completion_outer) of S;
  - a [function](js-callgraph.rofl.md#fn_node) G [is within](js-structure.rofl.md#ast_within) it;
  - S [is within](js-structure.rofl.md#ast_within) G.

In the audit:

<a id="completion_unaccounted"></a>A kind K has an unaccounted completion if all of:
  - a node P [carries the completion](#completion_outer) of a node S;
  - P [is of kind](js-model.rofl.md#ast_node) K;
  - unless P [is cut by a function from](#completion_fn_between) S.

## 3. A CALL IS AN EXIT. Decidable from syntax alone: no `return` anywhere in

> the body and a `throw` at its top level. The error direction is safe: a
> function that always throws but has a return somewhere is simply not named.
> The return statement leads: leading with `fn_node(F)` enumerated every
> return against every function — 94 % of the layer's read cost, measured on
> two corpora with two instruments.

In the code:

<a id="top_throw"></a>A [function](js-callgraph.rofl.md#fn_node) throws at the top if the `body` of it is a node B and a [throw](#noun-throw) S [is among the](#ast_child) `body` of B.

<a id="always_throws"></a>F always throws if F [throws at the top](#top_throw), unless F [has a return](#has_return).

<a id="throwing_call"></a>C is a throwing call if all of:
  - C [is a call site](js-callgraph.rofl.md#call_site) in some file;
  - C [resolves to](js-callgraph.rofl.md#resolves) F;
  - F [always throws](#always_throws).

> AN ACCESSOR IS A CALL WEARING A READ'S SYNTAX: `o.p` on a getter transfers
> control; what the getter returns is a different question, not answered here.
> `accessor_of` binds Obj and Key first, then `selects(N, Key)` before
> `member_node_v(N)`, or every accessor is laid beside every member read. A
> private accessor needs no receiver literal: `private_binds` decided both
> halves. A getter that always throws makes the READ an exit. The call graph
> has to say so too: `resolves`, and the read must be a `site` or the edge has
> no caller — declaring `member_expression` a transfer kind would make every
> property read in the corpus a site.

`accessor_kind` includes "get", "set".

In the flow:

<a id="accessor_of"></a>The accessor of a node Obj at Key is a node M if all of:
  - [the member](js-dataflow.rofl.md#member_value) Key of Obj holds M;
  - a kind K [is an accessor kind](#accessor_kind);
  - [the attribute](#ast_attr) `kind` of M is K.

In the code:

<a id="accessor_read"></a>N reads through the accessor M either:

1. if all of:
   - [the accessor](#accessor_of) of a node Obj at Key is M;
   - N [selects](js-dataflow.rofl.md#selects) Key;
   - N is a [member access](js-dataflow.rofl.md#member_node_v);
   - the `object` of N [may be the node](js-dataflow.rofl.md#may_be_node) Obj;
2. if all of:
   - N [binds privately to](js-dataflow.rofl.md#private_binds) M;
   - a kind K [is an accessor kind](#accessor_kind);
   - [the attribute](#ast_attr) `kind` of M is K.

A node

- is a throwing call if it [reads through the accessor](#accessor_read) M and M [always throws](#always_throws).
- resolves to a node M if it [reads through the accessor](#accessor_read) M.
- is a site if it [reads through the accessor](#accessor_read) some node.

Declared as facts:

- <a id="accessor_kind"></a>A kind K is an accessor kind — rows in this file

## 4. A DESTRUCTURING FORM HIDES A CALL. Measured on V8's own stack:

> `{ notch } = dial` runs `get notch`; a rest runs every getter the pattern
> did not take; an object spread runs every getter (it overrides a key and
> still READS it, so no exclusion); an array pattern, an array spread and a
> spread argument run `[Symbol.iterator]` and `next`; a plain array or object
> runs no user code. THE RECEIVER DECIDES, not the syntax — which is what
> `accessor_of` and `member_value(Obj, "iterator", M)` already decide. Only
> the declarator form: a pattern in a parameter reads the argument, a
> call-site question, so it is silent here rather than wrong.

<a id="pattern_source"></a>The pattern source of a node P is a node Init if the `id` of a [declarator](#noun-declarator) D is P and the `init` of D is Init.

<a id="pattern_accessor"></a>An [object pattern](#noun-object_pattern) destructures through the accessor M if all of:
  - [the pattern source](#pattern_source) of it [may be the node](js-dataflow.rofl.md#may_be_node) Obj;
  - it [takes the key](js-dataflow.rofl.md#pattern_takes) Key;
  - [the accessor](#accessor_of) of Obj at Key is M.

A node destructures through the accessor M if all of:
  - a node D [holds a rest](js-dataflow.rofl.md#rest_in_pattern) it in some file;
  - the `id` of D is a node P;
  - the `init` of D [may be the node](js-dataflow.rofl.md#may_be_node) Obj;
  - [the accessor](#accessor_of) of Obj at Key is M;
  - unless P [takes the key](js-dataflow.rofl.md#pattern_takes) Key.

A [spread](#noun-spread) destructures through the accessor M if all of:
  - it [is among the](#ast_child) `properties` of an [object literal](#noun-object_literal) O;
  - the `argument` of it [may be the node](js-dataflow.rofl.md#may_be_node) Obj;
  - [the accessor](#accessor_of) of Obj at Key is M.

> `spread_element` is one kind doing two things: in `properties` it copies
> keys, in `elements`/`arguments` it exhausts an iterator — keyed by FIELD.

`spread_iterable_field` includes `elements`, `arguments`.

<a id="spread_iterated"></a>A [spread](#noun-spread) is iterated if a field F [holds iterated spreads](#spread_iterable_field) and it [is among the](#ast_child) F of some node.

<a id="pattern_iterates"></a>P destructures through M either:

1. if all of:
   - P is an [array pattern](#noun-array_pattern);
   - [the pattern source](#pattern_source) of P [may be the node](js-dataflow.rofl.md#may_be_node) Obj;
   - [the member](js-dataflow.rofl.md#member_value) "iterator" of Obj holds M;
   - M is a [function](js-callgraph.rofl.md#fn_node);
2. if all of:
   - P [is iterated](#spread_iterated);
   - the `argument` of P [may be the node](js-dataflow.rofl.md#may_be_node) Obj;
   - [the member](js-dataflow.rofl.md#member_value) "iterator" of Obj holds M;
   - M is a [function](js-callgraph.rofl.md#fn_node).

Declared as facts:

- <a id="spread_iterable_field"></a>A field F holds iterated spreads — rows in this file

> The two sides reach the call graph differently. An iterable position has one
> `[Symbol.iterator]` per receiver, so two answers are two candidate receivers
> -> `resolves`. An object position runs one getter PER KEY, so a rest over two
> getters is two true calls at one node -> `calls` directly, or
> `ambiguous_call[audit]` would read a correct model as an over-approximation.
> `site` on both sides: `nearest_fn` ranges over sites, and a `resolves` row at
> a non-site draws no edge (six missing edges, measured). `pattern_next` is a
> relation so the effect layer can name the callee it drops
> (`w_effect_reads_only_what_resolves`).

A node is a site if it [destructures through the accessor](#pattern_accessor) some node.

Caller calls a node M either:

1. if a node N [destructures through the accessor](#pattern_accessor) M and Caller [is the nearest function of](js-callgraph.rofl.md#nearest_fn) N;
2. if a node N [destructures through the accessor](#pattern_accessor) M and N [runs at the top of](js-callgraph.rofl.md#top_call) Caller.

A node

- is a site if it [destructures through](#pattern_iterates) some node.
- resolves to a node M if it [destructures through](#pattern_iterates) M.
- <a id="pattern_next"></a>iterates with the next Next if all of:
  - it [destructures through](#pattern_iterates) a node M;
  - M [returns](js-dataflow.rofl.md#returns) a node E;
  - E [may be the node](js-dataflow.rofl.md#may_be_node) IterObj;
  - [the member](js-dataflow.rofl.md#member_value) "next" of IterObj holds a node V;
  - V [may be the node](js-dataflow.rofl.md#may_be_node) Next;
  - Next is a [function](js-callgraph.rofl.md#fn_node).

Caller calls Next if a node X [iterates with the next](#pattern_next) Next and Caller [is the nearest function of](js-callgraph.rofl.md#nearest_fn) X.

## 5. THE SOURCE DECIDES, SO COUNT THE SOURCES. Every position that runs a

> protocol, by mechanism, and five answers that partition them: the rule
> fired (user code); traced to something owning no such member, so the
> language's own iterator or prototype runs — a positive statement that rests
> on the transfer rules being right; a primitive; untraced — the frontier,
> named rather than seeded, since seeding would put every plain array on it;
> unsourced — a parameter pattern, which `pattern_source` does not cover.
> `hidden_call_unaccounted` is the identity. `hidden_call_off_table` checks
> the hand-written mechanism column against `transfer_mechanism`; it is blind
> to `spread_element`, which carries both mechanisms — mutant d9 reads the
> edges instead.

<a id="hidden_call_pos"></a>N hides a call by a mechanism E either:

1. if N is an [object pattern](#noun-object_pattern) and E is `accessor_call`;
2. if all of:
   - N is a [rest](#noun-rest);
   - N [is among the](#ast_child) `properties` of an [object pattern](#noun-object_pattern) P;
   - E is `accessor_call`;
3. if all of:
   - N [is among the](#ast_child) `properties` of an [object literal](#noun-object_literal) O;
   - N is a [spread](#noun-spread);
   - E is `accessor_call`;
4. if N is an [array pattern](#noun-array_pattern) or a [for-of](#noun-for-of) and E is `iterator_call`;
5. if N [is iterated](#spread_iterated) and E is `iterator_call`.

<a id="hidden_call_src"></a>The hidden call source of P is a node Init either:

1. if P is an [object pattern](#noun-object_pattern) or an [array pattern](#noun-array_pattern) and [the pattern source](#pattern_source) of P is Init;
2. if a node D [holds a rest](js-dataflow.rofl.md#rest_in_pattern) P in some file and the `init` of D is Init;
3. if all of:
   - P is a [spread](#noun-spread);
   - P [hides a call by](#hidden_call_pos) some mechanism;
   - the `argument` of P is Init;
4. if P is a [for-of](#noun-for-of) and the `right` of P is Init.

In the flow:

<a id="hidden_call_user"></a>A node N fires the hidden call M either:

1. if N [destructures through the accessor](#pattern_accessor) M;
2. if N [destructures through](#pattern_iterates) M;
3. if N [iterates through](js-callgraph.rofl.md#for_of_iterates) M.

In the code:

In the flow:

A node

- <a id="hidden_call_builtin"></a>hides a builtin call on a node O if [the hidden call source](#hidden_call_src) of it [may be the node](js-dataflow.rofl.md#may_be_node) O, unless it [fires a hidden call](#hidden_call_fires).
- <a id="hidden_call_primitive"></a>hides a call on the primitive V if [the hidden call source](#hidden_call_src) of it [may be the literal](js-dataflow.rofl.md#may_be_lit) V, unless it [has a traced hidden call](#hidden_call_traced).

In the code:

<a id="hidden_call_traced"></a>A node has a traced hidden call if [the hidden call source](#hidden_call_src) of it [may be the node](js-dataflow.rofl.md#may_be_node) some node.

In the flow:

<a id="hidden_call_untraced"></a>A node has an untraced hidden call from a node Src if [the hidden call source](#hidden_call_src) of it is Src and Src neither [may be the literal](js-dataflow.rofl.md#may_be_lit) some text nor [may be the node](js-dataflow.rofl.md#may_be_node) some node.

In the code:

In the flow:

<a id="hidden_call_unsourced"></a>A node has an unsourced hidden call of a kind K if all of:
  - it [hides a call by](#hidden_call_pos) some mechanism;
  - it [is of kind](js-model.rofl.md#ast_node) K;
  - unless it [has a sourced hidden call](#hidden_call_sourced).

In the audit:

<a id="hidden_call_accounted"></a>A node N has an accounted hidden call either:

1. if N [fires a hidden call](#hidden_call_fires);
2. if N [hides a builtin call on](#hidden_call_builtin) some node;
3. if N [hides a call on the primitive](#hidden_call_primitive) some value;
4. if N [has an untraced hidden call from](#hidden_call_untraced) some node;
5. if N [has an unsourced hidden call](#hidden_call_unsourced) of some kind.

<a id="hidden_call_unaccounted"></a>A node has an unaccounted hidden call if it [hides a call by](#hidden_call_pos) some mechanism, unless it [has an accounted hidden call](#hidden_call_accounted).

<a id="hidden_call_off_table"></a>A kind K hides a call off the table by a mechanism M if all of:
  - a node N [hides a call by](#hidden_call_pos) M;
  - N [is of kind](js-model.rofl.md#ast_node) K;
  - unless K [transfers by](#transfer_mechanism) M.

## 6. WHAT PROPAGATES. A try catches what runs in ITS OWN function:

> `try { const f = () => g() } catch {}` has `g()` inside the block textually
> and it runs later, elsewhere. A throw in a HANDLER is not caught by its own
> clause: `block`, not the whole try.

In the code:

<a id="in_try_block"></a>A [try](#noun-try) tries a node N if the `block` of it is a node B and N [is within](js-structure.rofl.md#ast_within) B.

> A try discharges through its `handler`; a finalizer alone catches nothing —
> `finalizer`'s absence from this table is the statement. Repaired 2026-09-11
> with `leaky` in alpha.mjs as the site
> (f_a_try_with_no_handler_catches_nothing_and_caught_here_says_it_does).

`catches_via` lists:

| kind | field |
|---|---|
| `try_statement` | `handler` |

A node

- <a id="try_catches"></a>has a handler if all of:
  - a kind K [catches via](#catches_via) a field Field;
  - it [is of kind](js-model.rofl.md#ast_node) K;
  - the Field of it is some node.
- <a id="caught_here"></a>is caught here if all of:
  - a node TS [tries](#in_try_block) it;
  - TS [lies in](#try_of) F;
  - F [is nearest to](js-dataflow.rofl.md#nearest_v) it;
  - TS [has a handler](#try_catches).

<a id="throws_outright"></a>F throws outright if F [is nearest to](js-dataflow.rofl.md#nearest_v) a [throw](#noun-throw) T, unless T [is caught here](#caught_here).

Declared as facts:

- <a id="catches_via"></a>A kind K catches via a field Field — rows in this file

> `may_throw` is a handful of rows and binds G, so `resolves` is probed by
> callee. The value travels with the throw: `thrown_by`, `caught_value`.

<a id="may_throw"></a>F may throw either:

1. if F [throws outright](#throws_outright);
2. if all of:
   - G [may throw](#may_throw);
   - a node C [resolves to](js-callgraph.rofl.md#resolves) G;
   - F [is nearest to](js-dataflow.rofl.md#nearest_v) C;
   - unless C [is caught here](#caught_here).

In the flow:

<a id="thrown_by"></a>F throws out a node V either:

1. if all of:
   - F [is nearest to](js-dataflow.rofl.md#nearest_v) a [throw](#noun-throw) T;
   - the `argument` of T is V;
   - unless T [is caught here](#caught_here);
2. if all of:
   - G [throws out](#thrown_by) V;
   - a node C [resolves to](js-callgraph.rofl.md#resolves) G;
   - F [is nearest to](js-dataflow.rofl.md#nearest_v) C;
   - unless C [is caught here](#caught_here).

<a id="caught_value"></a>A node catches a node V if all of:
  - [the catch](js-dataflow.rofl.md#catch_of) of T is H;
  - [the param](js-dataflow.rofl.md#catch_param) of H is it;
  - [the block](js-dataflow.rofl.md#try_block) of T is a node B;
  - a node C [is within](js-structure.rofl.md#ast_within) B;
  - C [resolves to](js-callgraph.rofl.md#resolves) G;
  - G [throws out](#thrown_by) V.

> A throwing call is an abrupt transfer for every list out to the `try` that
> catches it — code after the try runs precisely because the handler caught —
> and out to the FUNCTION boundary: without `ast_within(G, S)` the walk
> reached the module's own list and everything after `class Lit` was
> unreachable (`after_abrupt` 3 -> 37).

In the code:

<a id="try_stops"></a>A node is stopped by a [try](#noun-try) T if it [is a throwing call](#throwing_call) and it [is within](js-structure.rofl.md#ast_within) T.

C is stopped by a node S if C [is stopped by](#try_stops) a node T and T [is within](js-structure.rofl.md#ast_within) S.

A node is abrupt at a field F from an index I if all of:
  - a node C [is a throwing call](#throwing_call);
  - a node G [is nearest to](js-dataflow.rofl.md#nearest_v) C;
  - a node S [is within](js-structure.rofl.md#ast_within) G;
  - C [is within](js-structure.rofl.md#ast_within) S;
  - F [is a statement sequence field](#stmt_seq_field);
  - S is the I-th of the F of it;
  - unless C [is stopped by](#try_stops) S.

> After an abrupt transfer the rest NEVER runs; `guarded` says MAY, on purpose.
> A suspension is a may and belongs here more exactly.

A node

- is guarded if it [follows an abrupt completion](#after_abrupt).
- is guarded if a node S [follows an abrupt completion](#after_abrupt) and it [is within](js-structure.rofl.md#ast_within) S.
- is guarded if it [follows a suspension](#after_suspend).
- is guarded if a node S [follows a suspension](#after_suspend) and it [is within](js-structure.rofl.md#ast_within) S.

> A function every one of whose sites is guarded may never be entered.
> `may_not_run` is LOCAL, one level; the transitive question is reachability.

<a id="guarded_call"></a>A node is a guarded call if it [is a call site](js-callgraph.rofl.md#call_site) in some file and it [is guarded](#guarded).

<a id="reached_unguarded"></a>F is reached unguarded if a node C [resolves to](js-callgraph.rofl.md#resolves) F, unless C [is guarded](#guarded).

<a id="may_not_run"></a>F may not run if some call [resolves to](js-callgraph.rofl.md#resolves) F, unless F [is reached unguarded](#reached_unguarded).

## 7. TRANSITIVE REACHABILITY needs an ENTRY POINT: without one the question is

> unstratified (`live`/`dead` through negation; the kernel refused it). A
> module's export surface is its entry surface — a fact about the language.
> Containment, not paths: `export function`, `export const g = () =>` and
> `export default function` are three shapes. `not in_fn` keeps a closure
> inside an exported function out and a method of an exported class in.
> `export { f as g }` contains no function, so the second arm joins
> `export_local`, which already excludes re-exports and type-only exports.
> `export_all_declaration` introduces no local entry.

<a id="exported_fn"></a>F is exported either:

1. if all of:
   - F [is within](js-structure.rofl.md#ast_within) an [export declaration](#noun-export_declaration) E;
   - F is a [function](js-callgraph.rofl.md#fn_node);
   - unless F [is inside a function](#in_fn);
2. if all of:
   - a node L [is exported locally as](js-dataflow.rofl.md#export_local) some name from some file;
   - L [may be the node](js-dataflow.rofl.md#may_be_node) F;
   - F is a [function](js-callgraph.rofl.md#fn_node);
   - unless F [is inside a function](#in_fn).

Declared as facts:

- <a id="export_kind"></a>`export_kind` — rows in Words

> ...and a top-level call runs on import, with no enclosing function.

<a id="reachable"></a>F is reachable either:

1. if F [is an entry point](#entry_point);
2. if a node C [resolves to](js-callgraph.rofl.md#resolves) F and C neither [is guarded](#guarded) nor [is inside a function](#in_fn);
3. if all of:
   - G [is reachable](#reachable);
   - G [is nearest to](js-dataflow.rofl.md#nearest_v) a node C;
   - C [resolves to](js-callgraph.rofl.md#resolves) F;
   - unless C [is guarded](#guarded).

<a id="may_not_be_reached"></a>F may not be reached if some call [resolves to](js-callgraph.rofl.md#resolves) F, unless F [is reachable](#reachable).

> the typo hole again: a misspelling shrinks the entry surface and reports
> live functions as maybe-dead, the dangerous direction

In the audit:

<a id="export_kind_unseen"></a>A kind K is an unseen export kind if [`export_kind`](#export_kind)(K), unless some node [is of kind](js-model.rofl.md#ast_node) K.

> A file with functions and no entry point reports every function dead — an
> artefact of the seed, named. `has_entry` is [code]: a denominator, not a gate.

In the code:

<a id="has_entry"></a>File has an entry point if a node F [is an entry point](#entry_point) and F [is in file](js-model.rofl.md#ast_node) File.

In the audit:

<a id="no_entry_point"></a>File has no entry point if a [function](js-callgraph.rofl.md#fn_node) F [is in file](js-model.rofl.md#ast_node) File, unless File [has an entry point](#has_entry).

## 8. THE GATES. Every kind that transfers control carries a MECHANISM, and

> mechanisms are not one bucket: `skip_arm`; `short_circuit` (`a?.b()` guards
> the site itself, not a child); `suspend`; `abrupt`; `accessor_call`;
> `loop_at_least_once` (`do_while_statement`, waived: its body always runs);
> `label_boundary` (a label RECEIVES a transfer); `definition_time_call` (a
> decorator runs once, at definition); `per_construction` (a field
> initialiser); `iterator_call`. `spread_element` and `for_of_statement` carry
> two — one row per (kind, mechanism).

`transfer_mechanism` lists:

| kind | mechanism |
|---|---|
| `if_statement` | `skip_arm` |
| `conditional_expression` | `skip_arm` |
| `logical_expression` | `skip_arm` |
| `for_of_statement` | `skip_arm` |
| `optional_call_expression` | `short_circuit` |
| `optional_member_expression` | `short_circuit` |
| `member_expression` | `accessor_call` |
| `await_expression` | `suspend` |
| `yield_expression` | `suspend` |
| `return_statement` | `abrupt` |
| `throw_statement` | `abrupt` |
| `break_statement` | `abrupt` |
| `continue_statement` | `abrupt` |
| `while_statement` | `skip_arm` |
| `for_statement` | `skip_arm` |
| `for_in_statement` | `skip_arm` |
| `switch_statement` | `skip_arm` |
| `switch_case` | `skip_arm` |
| `try_statement` | `skip_arm` |
| `catch_clause` | `skip_arm` |
| `do_while_statement` | `loop_at_least_once` |
| `assignment_pattern` | `skip_arm` |
| `labeled_statement` | `label_boundary` |
| `decorator` | `definition_time_call` |
| `class_property` | `per_construction` |
| `class_private_property` | `per_construction` |
| `object_pattern` | `accessor_call` |
| `rest_element` | `accessor_call` |
| `spread_element` | `accessor_call` |
| `array_pattern` | `iterator_call` |
| `spread_element` | `iterator_call` |
| `for_of_statement` | `iterator_call` |

Declared as facts:

- <a id="transfer_mechanism"></a>A kind K transfers by a mechanism M — rows in this file

> Three states, not two: modelled, waived with a reason, or open with an owner.
> `mechanism_open` is empty since 2026-09-06 and kept: the next mechanism that
> is neither needs somewhere honest to sit, and an audit red on an honest tree
> gets switched off.

`mechanism_modelled` includes `skip_arm`, `short_circuit`, `accessor_call`, `abrupt`, `suspend`, `label_boundary`, `definition_time_call`, `per_construction`, `iterator_call`.

`mechanism_waived` lists:

| mechanism | reason |
|---|---|
| `loop_at_least_once` | `a_body_that_always_runs_guards_nothing` |

In the main:

<a id="mechanism_known"></a>A mechanism M is a known mechanism either:

1. if M [is modelled](#mechanism_modelled);
2. if M [is waived](#mechanism_waived) because some reason;
3. if M [is open](#mechanism_open) because some reason.

In the audit:

<a id="mechanism_unanswered"></a>A mechanism is an unanswered mechanism if some kind [transfers by](#transfer_mechanism) it, unless it [is a known mechanism](#mechanism_known).

Declared as facts:

- <a id="mechanism_modelled"></a>A mechanism M is modelled — rows in this file
- <a id="mechanism_waived"></a>A mechanism M is waived because a reason R — rows in this file
- <a id="mechanism_open"></a>A mechanism M is open because a reason R — no rows: declared so a rule may read it

> A kind carrying a modelled mechanism that no rule reaches. Derived from
> `transfer_mechanism` where a mechanism has one door (suspend, label, field,
> iterator), so claiming the mechanism without the rule reddens
> `guard_unmodelled`. Named by hand where the door is another relation:
> `catch_clause` is a try's arm, `switch_statement` selects a case,
> `member_expression` and `decorator` transfer INTO a callee, and the three
> object-key kinds go through `pattern_accessor` — one per kind rather than
> derived, or the derived line would cover `member_expression` and silence
> its mutant.

In the code:

<a id="guard_named"></a>A kind K is a named guard kind either:

1. if K [guards the field](#guard_kind) some field;
2. if [`short_circuit_kind`](#short_circuit_kind)(K);
3. if [`abrupt_kind`](#abrupt_kind)(K);
4. if K [transfers by](#transfer_mechanism) `suspend` or `label_boundary` or `per_construction`.

`guard_named` includes `catch_clause`, `switch_statement`, `member_expression`, `decorator`, `object_pattern`, `rest_element`, `spread_element`.

A kind K is a named guard kind if K [transfers by](#transfer_mechanism) `iterator_call`.

In the audit:

<a id="guard_unmodelled"></a>A kind K is an unmodelled guard kind if all of:
  - K [transfers by](#transfer_mechanism) a mechanism M;
  - M [is modelled](#mechanism_modelled);
  - some node [is of kind](js-model.rofl.md#ast_node) K;
  - unless K [is a named guard kind](#guard_named).

> SHORT-CIRCUIT: `a?.b()` stops the whole chain, so the site and everything
> further along it is conditional.

In the code:

N is guarded either:

1. if N is a [short circuit](#noun-short_circuit);
2. if N [is within](js-structure.rofl.md#ast_within) a [short circuit](#noun-short_circuit) P.

Declared as facts:

- <a id="short_circuit_kind"></a>`short_circuit_kind` — rows in Words

> an arm declared for a field the scanner never emits under that kind: a typo
> makes the guarded set quietly smaller

<a id="guard_arm_seen"></a>A kind K is seen guarding a field Field if all of:
  - K [guards the field](#guard_kind) Field;
  - a node P [is of kind](js-model.rofl.md#ast_node) K;
  - the Field of P is some node.

In the audit:

<a id="guard_arm_unseen"></a>A kind K is unseen guarding a field F if all of:
  - K [guards the field](#guard_kind) F;
  - some node [is of kind](js-model.rofl.md#ast_node) K;
  - unless K [is seen guarding](#guard_arm_seen) F.

> a guarded site at a coordinate, for the report and the runtime comparison

In the code:

<a id="guarded_at"></a>File has a guarded call at Line if a node C [is a guarded call](#guarded_call) and C [is of kind](js-model.rofl.md#ast_node) some kind in file File at line Line.


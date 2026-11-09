---
world: js-controlflow
books: audit, code, execution, flow, main, surface, tree, value
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

- from js-callgraph: [await_arg](js-callgraph.rofl.md#await_arg), [call_site](js-callgraph.rofl.md#call_site), [fn_node](js-callgraph.rofl.md#fn_node), [for_of_iterates](js-callgraph.rofl.md#for_of_iterates), [nearest_fn](js-callgraph.rofl.md#nearest_fn), [resolves](js-callgraph.rofl.md#resolves), [top_call](js-callgraph.rofl.md#top_call)
- from js-callgraph, in the flow: [field_init](js-callgraph.rofl.md#field_init)
- from js-dataflow: [declarator_id](js-dataflow.rofl.md#declarator_id), [export_local](js-dataflow.rofl.md#export_local), [obj_lit](js-dataflow.rofl.md#obj_lit), [pat_in](js-dataflow.rofl.md#pat_in), [pattern_takes](js-dataflow.rofl.md#pattern_takes), [private_binds](js-dataflow.rofl.md#private_binds), [rest_in_pattern](js-dataflow.rofl.md#rest_in_pattern), [spread_of](js-dataflow.rofl.md#spread_of)
- from js-dataflow, in the flow: [catch_of](js-dataflow.rofl.md#catch_of), [catch_param](js-dataflow.rofl.md#catch_param), [decl_value](js-dataflow.rofl.md#decl_value), [may_be_lit](js-dataflow.rofl.md#may_be_lit), [may_be_node](js-dataflow.rofl.md#may_be_node), [member_node_v](js-dataflow.rofl.md#member_node_v), [member_value](js-dataflow.rofl.md#member_value), [plain_assign](js-dataflow.rofl.md#plain_assign), [selects](js-dataflow.rofl.md#selects)
- from js-model: [ast_node](js-model.rofl.md#ast_node)
- from js-modules: [export_default_site](js-modules.rofl.md#export_default_site)
- from js-structure: [conditional_write](js-structure.rofl.md#conditional_write), [object_of](js-structure.rofl.md#object_of), [object_pat](js-structure.rofl.md#object_pat), [seq_at](js-structure.rofl.md#seq_at), [step_in](js-structure.rofl.md#step_in)
- from js-surface, in the flow: [fn_nested](js-surface.rofl.md#fn_nested), [fn_value](js-surface.rofl.md#fn_value), [ret_node_any](js-surface.rofl.md#ret_node_any)
- from js-surface, in the surface: [sx_called](js-surface.rofl.md#sx_called), [sx_reach](js-surface.rofl.md#sx_reach), [sx_reached](js-surface.rofl.md#sx_reached)
- from outside these files, in the flow:
  - <a id="nearest_v"></a>A [function](js-callgraph.rofl.md#fn_node) F is nearest to a node R (`nearest_v`)
- from outside these files, in the tree:
  - <a id="at"></a>`at`
  - <a id="inside"></a>`inside`
  - <a id="nth"></a>`nth`
  - <a id="parent"></a>`parent`
  - <a id="strict"></a>`strict`
- from outside these files, in the value:
  - <a id="assign"></a>`assign`
  - <a id="body"></a>`body`
  - <a id="class"></a>`class`
  - <a id="decl"></a>`decl`
  - <a id="executes_if"></a>`executes_if`
  - <a id="exits"></a>`exits`
  - <a id="finalizes"></a>`finalizes`
  - <a id="generator"></a>`generator`
  - <a id="getter"></a>`getter`
  - <a id="has"></a>`has`
  - <a id="iterates"></a>`iterates`
  - <a id="jumps_to"></a>`jumps_to`
  - <a id="labeled_as"></a>`labeled_as`
  - <a id="logical"></a>`logical`
  - <a id="mark"></a>`mark`
  - <a id="repeats"></a>`repeats`
  - <a id="rest_props"></a>`rest_props`
  - <a id="setter"></a>`setter`
  - <a id="spread_args"></a>`spread_args`
  - <a id="spread_elems"></a>`spread_elems`
  - <a id="spread_props"></a>`spread_props`
  - <a id="static"></a>`static`
  - <a id="target"></a>`target`
  - <a id="throws"></a>`throws`
  - <a id="tries"></a>`tries`
  - <a id="value"></a>`value`
- from the scanner:
  - <a id="ast_child"></a>A node is a child of a node (`ast_child`)

## Words

What this file calls a node, and what each word stands for:

| word | stands for |
|---|---|
| <a id="noun-abrupt_statement"></a>an abrupt statement | a node of one of the kinds `return_statement`, `throw_statement`, `break_statement`, `continue_statement` (`abrupt_kind`) |
| a function | a node [`fn_node`](js-callgraph.rofl.md#fn_node) holds of |
| a member access | a node [`member_node_v`](js-dataflow.rofl.md#member_node_v) holds of |

Phrases this file defines in one step, each by the sentence it stands for:

- <a id="label_ref"></a>A node refers to the label N if [`jumps_to`](#jumps_to)(it, N).
- <a id="label_escaped"></a>LS is escaped if some node [targets the label](#label_target) LS.
- <a id="accessor_of"></a>The accessor of a node Obj at Key is a node M if [the accessor](#accessor_as) of Obj and some kind at Key is M.
- <a id="hidden_call_fires"></a>A node fires a hidden call if it [fires the hidden call](#hidden_call_user) some node.
- <a id="hidden_call_sourced"></a>A node has a sourced hidden call if [the hidden call source](#hidden_call_src) of it is some node.
- <a id="try_catches"></a>A node has a handler if [`tries`](#tries)(it, something).
- <a id="caught_here"></a>A node is caught here if [`try_walk`](#try_walk)(something, it).
- <a id="reached_unguarded"></a>F is reached unguarded if [`sx_reached`](js-surface.rofl.md#sx_reached)(F).
- <a id="in_fn"></a>A node is inside a function if some function [is nearest to](#nearest_v) it.
- <a id="entry_point"></a>F is an entry point if F [is exported](#exported_fn).

## 1. A POSITION THAT ONLY RUNS SOMETIMES — one row per (parent, arm), read from the roles (`executes_if`). `&&`,

> `||`, `??` and their assignments, `?:`, `if`, a loop's body and update, a `for-in` / `for-of` head, a case, a
> default, a catch handler and the tail of `?.` all say it. `do_while_statement` says nothing: its body runs before
> the test, and a `for` with no test runs its body at once. A default value (the `right` of an `assignment_pattern`)
> runs only when the argument is absent. Of a `try` only the HANDLER is a guard: the block and the finalizer always
> run.
> A branch is a role: `executes_if(X, G, How)` says X executes depending on how G completed. The arm is the child
> of G's parent that holds X (a statement wrapper around X is the arm, not X). A switch case guards its consequents,
> not its test; a default is guarded as unmatched. The default value of a pattern has no role: its kind is read.

<a id="guard_arm"></a>A node Y is conditional on a node P either:

1. if all of:
   - [`executes_if`](#executes_if)(Y, G, How);
   - How differs from `unmatched`;
   - [`parent`](#parent)(P, G);
   - [`parent`](#parent)(P, Y);
   - unless [`arm_first`](#arm_first)(P, Y, G);
2. if all of:
   - [`executes_if`](#executes_if)(X, G, How);
   - How differs from `unmatched`;
   - [`parent`](#parent)(P, G);
   - [`parent`](#parent)(P, Y);
   - [`inside`](#inside)(Y, X);
   - unless [`arm_first`](#arm_first)(P, Y, G).

> an arm that is a step of its owner before the guard (the body of a do-while) runs once before the guard completes

<a id="arm_first"></a>`arm_first`(P, X, G) if all of:
  - [`executes_if`](#executes_if)(something, G, something);
  - [`parent`](#parent)(P, G);
  - [`nth`](#nth)(P, J, G);
  - [`nth`](#nth)(P, I, X);
  - I < J.

A node S is conditional on a node C either:

1. if [`executes_if`](#executes_if)(C, T, `matches`), [`parent`](#parent)(C, S), and S differs from T;
2. if [`executes_if`](#executes_if)(C, something, `unmatched`) and [`parent`](#parent)(C, S);
3. if all of:
   - [`conditional_write`](js-structure.rofl.md#conditional_write)(C);
   - [`assign`](#assign)(C, something, S);
   - unless [`logical`](#logical)(C, something, something, something).

> `a?.b.c(x)` runs its tail when the head is defined: every link of the chain and all it holds but the head (and
> the links below, which have their own row) are conditional.

A node

- <a id="guarded"></a>is guarded if [`executes_if`](#executes_if)(it, something, `defined`).
- is conditional on a node N if all of:
  - [`executes_if`](#executes_if)(N, G, `defined`);
  - [`parent`](#parent)(N, it);
  - it differs from G;
  - unless [`inside`](#inside)(it, G).

> A non-static member of a class with a value runs once per construction and never if the class is never
> constructed; a static one runs with the definition.

`field_init`(P, V), in the code if all of:
  - [`class`](#class)(CD);
  - [`has`](#has)(CD, P);
  - [`value`](#value)(P, V);
  - unless [`static`](#static)(P).

A node

- is conditional on a node P if [`field_init`](js-callgraph.rofl.md#field_init)(P, it) in the code.
- is guarded if it [is conditional on](#guard_arm) some node.
- is guarded if a node X [is conditional on](#guard_arm) some node and [`inside`](#inside)(X, it).

## 2. STATEMENT ORDER. After a return/throw/break/continue the rest of the list

> never runs; `guarded` weakens that NEVER into a MAY on purpose — one
> vocabulary, one reader. Statement lists sit under `body` and under
> `switch_case`'s `consequent`; the field is carried so an abrupt in one field
> cannot reach a statement in another.

`stmt_seq_field` includes `body`, `consequent`.

Declared as facts:

- <a id="abrupt_kind"></a>`abrupt_kind` — rows in Words
- <a id="stmt_seq_field"></a>A field F is a statement sequence field — rows in this file

> `abrupt_at` is a handful of rows and binds B: the second literal probes.

<a id="after_abrupt"></a>A node follows an abrupt completion if all of:
  - B [is abrupt](#abrupt_at) from a step I;
  - [`seq_at`](js-structure.rofl.md#seq_at)(B, J, it);
  - I < J;
  - unless [`finalizes`](#finalizes)(it, something).

> A SUSPENSION (`await`, `yield`) is a point after which the rest may not run —
> control comes back only if the promise settles — so it lands in `guarded` as
> a MAY and is deliberately not an `abrupt_at` arm. Confined to the suspending
> function: without `nearest_v` an `await` inside a function would guard
> everything after that function's declaration at module level.

In the execution:

<a id="suspends"></a>B suspends from a step I either:

1. if all of:
   - [`suspends`](#suspends)(X, a [function](js-callgraph.rofl.md#fn_node) G, something) in the value;
   - [`step_in`](js-structure.rofl.md#step_in)(S, X);
   - [`inside`](#inside)(G, S);
   - [`seq_at`](js-structure.rofl.md#seq_at)(B, I, S);
   - unless [`iterates`](#iterates)(X, something, something);
2. if all of:
   - [`suspends`](#suspends)(X, a [function](js-callgraph.rofl.md#fn_node) G, something) in the value;
   - [`seq_at`](js-structure.rofl.md#seq_at)(B, I, X);
   - unless [`iterates`](#iterates)(X, something, something).

In the code:

<a id="after_suspend"></a>A node follows a suspension if all of:
  - B [suspends](#suspends) from a step I;
  - [`seq_at`](js-structure.rofl.md#seq_at)(B, J, it);
  - I < J.

> A LABEL is a boundary an ordinary break cannot cross: `break outer` kills the
> statements between the reference and its target, and the walk stops at the
> label. The label is read, not the keyword, so an unlabelled break derives
> nothing here. The target is unique by grammar (a nested duplicate label is a
> SyntaxError) and a label is not in scope inside a nested function, so no
> function-boundary literal is needed. `if (c) break outer;` puts a guard
> between reference and target and the walking arms then say NEVER where the
> honest word is MAY (f_after_abrupt_says_never_and_the_walking_arms_say_may);
> harmless, because both consumers read through `guarded`.

<a id="label_target"></a>A node targets the label LS if all of:
  - it [refers to the label](#label_ref) N;
  - [`labeled_as`](#labeled_as)(LS, N);
  - [`inside`](#inside)(LS, it).

<a id="abrupt_at"></a>B is abrupt from a step I if all of:
  - a node X [targets the label](#label_target) LS;
  - [`step_in`](js-structure.rofl.md#step_in)(S, X);
  - [`inside`](#inside)(LS, S);
  - [`seq_at`](js-structure.rofl.md#seq_at)(B, I, S);
  - unless [`repeats`](#repeats)(B, S).

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

<a id="completes_abruptly"></a>A node completes abruptly if [`exits`](#exits)(it, something).

Declared as facts:

- <a id="completion_kind"></a>A kind K is a completion kind — rows in this file

> a step that carries a label is the labelled statement's body: the owner completes abruptly if the labelled
> statement does, which it does not when a break leaves it

A node B completes abruptly either:

1. if all of:
   - a node S [completes abruptly](#completes_abruptly);
   - [`nth`](#nth)(B, something, S);
   - [`strict`](#strict)(B);
   - unless [`labeled_as`](#labeled_as)(S, something);
   - unless [`repeats`](#repeats)(B, something);
   - unless [`finalizes`](#finalizes)(something, S);
2. if all of:
   - a node S [completes abruptly](#completes_abruptly);
   - [`labeled_as`](#labeled_as)(S, something);
   - [`nth`](#nth)(B, something, S);
   - [`strict`](#strict)(B);
   - unless S [is escaped](#label_escaped);
   - unless [`repeats`](#repeats)(B, something);
3. if all of:
   - a node C [completes abruptly](#completes_abruptly);
   - [`executes_if`](#executes_if)(C, G, `truthy`);
   - [`parent`](#parent)(B, C);
   - [`executes_if`](#executes_if)(X, G, `falsy`);
   - [`parent`](#parent)(B, X);
   - a node X [completes abruptly](#completes_abruptly).

> the consumer: it replaces the old four-kind arm rather than sitting beside
> it, since the base case IS that arm

B is abrupt from a step I if all of:
  - a node S [completes abruptly](#completes_abruptly);
  - [`seq_at`](js-structure.rofl.md#seq_at)(B, I, S);
  - unless [`repeats`](#repeats)(B, S);
  - unless S [is escaped](#label_escaped).

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
  - [`inside`](#inside)(it, S);
  - it [is of kind](js-model.rofl.md#ast_node) K but is not a [function](js-callgraph.rofl.md#fn_node);
  - it [is among the](#ast_child) F of some node;
  - F [is a statement sequence field](#stmt_seq_field);
  - unless K [has a known completion](#completion_known).
- <a id="completion_fn_between"></a>is cut by a function from a node S if all of:
  - it [carries the completion](#completion_outer) of S;
  - [`inside`](#inside)(a [function](js-callgraph.rofl.md#fn_node) G, S);
  - [`inside`](#inside)(it, G).

In the audit:

<a id="completion_unaccounted"></a>A kind K has an unaccounted completion if all of:
  - a node P [carries the completion](#completion_outer) of a node S;
  - P [is of kind](js-model.rofl.md#ast_node) K;
  - unless P [is cut by a function from](#completion_fn_between) S.

## 3. A CALL IS AN EXIT. Decidable from syntax alone: no `return` in the

> function's own body and a `throw` at its top level. The error direction is
> safe: a function that always throws but has a return somewhere is simply not
> named. An async function or a generator throws nothing at its call: the
> call hands back a promise or an iterator, and the throw comes out of that.

`deferred_attr` includes `async`, `generator`.

In the code:

<a id="deferred_body"></a>A [function](js-callgraph.rofl.md#fn_node) runs its body later if [`mark`](#mark)(it, X) and an attribute X [defers the body](#deferred_attr).

<a id="async_body"></a>F is async if F [runs its body later](#deferred_body), unless [`generator`](#generator)(F).

<a id="sync_body"></a>A [function](js-callgraph.rofl.md#fn_node) runs its body at once unless it [runs its body later](#deferred_body).

<a id="has_return"></a>F has a return if [`exits`](#exits)(R, `return`) and F [is nearest to](#nearest_v) a node R.

<a id="top_throw"></a>A [function](js-callgraph.rofl.md#fn_node) throws at the top if [`body`](#body)(it, B), [`parent`](#parent)(B, S), and [`exits`](#exits)(S, `throw`).

<a id="always_throws"></a>F always throws if F [throws at the top](#top_throw) and F neither [has a return](#has_return) nor [runs its body later](#deferred_body).

<a id="throwing_call"></a>A call is a throwing call if all of:
  - F [always throws](#always_throws);
  - it [resolves to](js-callgraph.rofl.md#resolves) F;
  - it [is a call site](js-callgraph.rofl.md#call_site) in some file.

Declared as facts:

- <a id="deferred_attr"></a>An attribute A defers the body — rows in this file

> AN ACCESSOR IS A CALL WEARING A READ'S SYNTAX: `o.p` on a getter transfers
> control; what the getter returns is a different question, not answered here.
> The read is found from the receiver, by the object's value, never by the
> key: over vscode the planner went from `accessor_of` to every read of a key
> as common as `value` (20 s and 9.7 M lookups for 292 reads). A
> private accessor needs no receiver literal: `private_binds` decided both
> halves. A getter that always throws makes the READ an exit. The call graph
> has to say so too: `resolves`, and the read must be a `site` or the edge has
> no caller — declaring `member_expression` a transfer kind would make every
> property read in the corpus a site.

In the flow:

<a id="accessor_as"></a>The accessor of a node Obj and N at Key is a node M either:

1. if all of:
   - [the member](js-dataflow.rofl.md#member_value) Key of Obj holds M;
   - [`getter`](#getter)(M, M);
   - N is "get";
2. if all of:
   - [the member](js-dataflow.rofl.md#member_value) Key of Obj holds M;
   - [`setter`](#setter)(M, M);
   - N is "set".

`accessor_of` of A, B and C is read through its rules and never stored.

<a id="accessor_obj"></a>`accessor_obj`(Obj) if [the accessor](#accessor_of) of a node Obj at some key is some node.

<a id="accessor_recv"></a>`accessor_recv`(a [member access](js-dataflow.rofl.md#member_node_v) N, Obj) if all of:
  - [`accessor_obj`](#accessor_obj)(Obj);
  - a node O [points to](js-dataflow.rofl.md#may_be_node) a node Obj;
  - [`object_of`](js-structure.rofl.md#object_of)(N, O).

> A read runs the getter, `o.p = v` the setter, `o.p += v` and `o.p++` both.

In the code:

<a id="accessor_read"></a>A node N reads through the accessor M either:

1. if all of:
   - [`accessor_recv`](#accessor_recv)(N, Obj);
   - [the accessor](#accessor_as) of a node Obj and "get" at Key is M;
   - N [selects](js-dataflow.rofl.md#selects) Key;
   - unless N [is only written](#only_written);
2. if all of:
   - [`accessor_recv`](#accessor_recv)(N, Obj);
   - [the accessor](#accessor_as) of a node Obj and "set" at Key is M;
   - N [selects](js-dataflow.rofl.md#selects) Key;
   - N [is written](#written_member);
3. if all of:
   - N [binds privately to](js-dataflow.rofl.md#private_binds) M;
   - [`getter`](#getter)(M, M);
   - unless N [is only written](#only_written);
4. if all of:
   - N [binds privately to](js-dataflow.rofl.md#private_binds) M;
   - [`setter`](#setter)(M, M);
   - N [is written](#written_member).

A member

- <a id="written_member"></a>is written if all of:
  - [`assign`](#assign)(something, it, something);
  - [`object_of`](js-structure.rofl.md#object_of)(it, something);
  - unless [`pat_in`](js-dataflow.rofl.md#pat_in)(something, something, it).
- <a id="only_written"></a>is only written if X [is plain](js-dataflow.rofl.md#plain_assign) and [`assign`](#assign)(X, it, something).

A call

- is a throwing call if it [reads through the accessor](#accessor_read) M and M [always throws](#always_throws).
- resolves to a node M if it [reads through the accessor](#accessor_read) M.

A node is a site if it [reads through the accessor](#accessor_read) some node.

## 4. A DESTRUCTURING FORM HIDES A CALL. Measured on V8's own stack:

> `{ notch } = dial` runs `get notch`; a rest runs every getter the pattern
> did not take; an object spread runs every getter (it overrides a key and
> still READS it, so no exclusion); an array pattern, an array spread and a
> spread argument run `[Symbol.iterator]` and `next`; a plain array or object
> runs no user code. THE RECEIVER DECIDES, not the syntax — which is what
> `accessor_of` and `member_value(Obj, symbol_iterator, M)` already decide. Only
> the declarator form: a pattern in a parameter reads the argument, a
> call-site question, so it is silent here rather than wrong.

<a id="pattern_source"></a>The pattern source of a node P is a node Init if [`declarator_id`](js-dataflow.rofl.md#declarator_id)(D, P) and D [takes its value from](js-dataflow.rofl.md#decl_value) Init.

A node

- <a id="pattern_accessor"></a>destructures through the accessor M if all of:
  - [the accessor](#accessor_of) of a node Obj at Key is M;
  - a node Init [points to](js-dataflow.rofl.md#may_be_node) Obj;
  - [the pattern source](#pattern_source) of it is Init;
  - it [takes the key](js-dataflow.rofl.md#pattern_takes) Key.
- destructures through the accessor M if all of:
  - D [holds a rest](js-dataflow.rofl.md#rest_in_pattern) it in some file;
  - [`declarator_id`](js-dataflow.rofl.md#declarator_id)(D, P);
  - D [takes its value from](js-dataflow.rofl.md#decl_value) a node Init;
  - Init [points to](js-dataflow.rofl.md#may_be_node) a node Obj;
  - [the accessor](#accessor_of) of Obj at Key is M;
  - unless P [takes the key](js-dataflow.rofl.md#pattern_takes) Key.
- destructures through the accessor M if all of:
  - [the accessor](#accessor_of) of a node Obj at Key is M;
  - it [points to](js-dataflow.rofl.md#may_be_node) Obj;
  - [`spread_props`](#spread_props)(O, something, it);
  - [`obj_lit`](js-dataflow.rofl.md#obj_lit)(O).

> `spread_element` is one kind doing two things: in `properties` it copies
> keys, in `elements`/`arguments` it exhausts an iterator — keyed by FIELD.

<a id="spread_iterated"></a>X is iterated either:

1. if [`spread_elems`](#spread_elems)(something, something, X);
2. if [`spread_args`](#spread_args)(something, something, X).

<a id="pattern_iterates"></a>A node P destructures through a node M either:

1. if [`iterates`](#iterates)(P, P, something) and P [iterates through](js-callgraph.rofl.md#for_of_iterates) M;
2. if all of:
   - P [is iterated](#spread_iterated);
   - P [points to](js-dataflow.rofl.md#may_be_node) a node Obj;
   - [the member](js-dataflow.rofl.md#member_value) `symbol_iterator` of Obj holds M;
   - [`fn_value`](js-surface.rofl.md#fn_value)(M).

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

A node is a site if it [destructures through](#pattern_iterates) some node.

A call resolves to a node M if it [destructures through](#pattern_iterates) M.

<a id="pattern_next"></a>A node iterates with the next Next if all of:
  - it [destructures through](#pattern_iterates) a node M;
  - [`ret_node_any`](js-surface.rofl.md#ret_node_any)(M, IterObj);
  - [the member](js-dataflow.rofl.md#member_value) "next" of a node IterObj holds a node V;
  - V [points to](js-dataflow.rofl.md#may_be_node) Next;
  - [`fn_value`](js-surface.rofl.md#fn_value)(Next).

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

In the execution:

<a id="hidden_call"></a>A node N hides a call by a mechanism E either:

1. if [`object_pat`](js-structure.rofl.md#object_pat)(N) and E is `accessor_call`;
2. if [`rest_props`](#rest_props)(something, N) and E is `accessor_call`;
3. if all of:
   - [`obj_lit`](js-dataflow.rofl.md#obj_lit)(O);
   - [`spread_props`](#spread_props)(O, something, N);
   - E is `accessor_call`;
4. if N [is iterated](#spread_iterated) and E is `iterator_call`;
5. if [`iterates`](#iterates)(N, something, something) and E is `iterator_call`.

In the code:

<a id="hidden_call_src"></a>The hidden call source of a node P is a node Init either:

1. if [the pattern source](#pattern_source) of P is Init and [`object_pat`](js-structure.rofl.md#object_pat)(P);
2. if D [holds a rest](js-dataflow.rofl.md#rest_in_pattern) P in some file and D [takes its value from](js-dataflow.rofl.md#decl_value) Init;
3. if P [is iterated](#spread_iterated) and Init is P;
4. if [`spread_of`](js-dataflow.rofl.md#spread_of)(something, P) and Init is P;
5. if [`iterates`](#iterates)(P, something, Init) and P differs from Init;
6. if all of:
   - [`iterates`](#iterates)(P, P, P);
   - [`declarator_id`](js-dataflow.rofl.md#declarator_id)(D, P);
   - D [takes its value from](js-dataflow.rofl.md#decl_value) Init;
7. if [`iterates`](#iterates)(P, P, P) and P [points to](js-dataflow.rofl.md#may_be_node) Init.

In the flow:

<a id="hidden_call_user"></a>A node N fires the hidden call M either:

1. if N [destructures through the accessor](#pattern_accessor) M;
2. if N [destructures through](#pattern_iterates) M;
3. if N [iterates through](js-callgraph.rofl.md#for_of_iterates) M.

In the code:

In the flow:

A node

- <a id="hidden_call_builtin"></a>hides a builtin call on a node O if [the hidden call source](#hidden_call_src) of it [points to](js-dataflow.rofl.md#may_be_node) O, unless it [fires a hidden call](#hidden_call_fires).
- <a id="hidden_call_primitive"></a>hides a call on the primitive V if [the hidden call source](#hidden_call_src) of it [may be the literal](js-dataflow.rofl.md#may_be_lit) V, unless it [has a traced hidden call](#hidden_call_traced).

In the code:

<a id="hidden_call_traced"></a>A node has a traced hidden call if [the hidden call source](#hidden_call_src) of it [points to](js-dataflow.rofl.md#may_be_node) some node.

In the flow:

<a id="hidden_call_untraced"></a>A node has an untraced hidden call from a node Src if [the hidden call source](#hidden_call_src) of it is Src and Src neither [may be the literal](js-dataflow.rofl.md#may_be_lit) some text nor [points to](js-dataflow.rofl.md#may_be_node) some node.

In the code:

In the flow:

<a id="hidden_call_unsourced"></a>A node has an unsourced hidden call if it [hides a call by](#hidden_call) some mechanism, unless it [has a sourced hidden call](#hidden_call_sourced).

In the audit:

<a id="hidden_call_accounted"></a>A node N has an accounted hidden call either:

1. if N [fires a hidden call](#hidden_call_fires);
2. if N [hides a builtin call on](#hidden_call_builtin) some node;
3. if N [hides a call on the primitive](#hidden_call_primitive) some value;
4. if N [has an untraced hidden call from](#hidden_call_untraced) some node;
5. if N [has an unsourced hidden call](#hidden_call_unsourced).

<a id="hidden_call_unaccounted"></a>A node has an unaccounted hidden call if it [hides a call by](#hidden_call) some mechanism, unless it [has an accounted hidden call](#hidden_call_accounted).

<a id="hidden_call_off_table"></a>A kind K hides a call off the table by a mechanism M if all of:
  - a node N [hides a call by](#hidden_call) M;
  - N [is of kind](js-model.rofl.md#ast_node) K;
  - unless K [transfers by](#transfer_mechanism) M.

## 6. WHAT PROPAGATES. A try catches what runs in ITS OWN function:

> `try { const f = () => g() } catch {}` has `g()` inside the block textually
> and it runs later, elsewhere. A throw in a HANDLER is not caught by its own
> clause: `block`, not the whole try. Only a try with a handler has the block as a role (`tries`).

In the code:

<a id="in_try_block"></a>TS tries a node N if [`tries`](#tries)(TS, B) and [`inside`](#inside)(B, N).

> A try discharges through its `handler`; a finalizer alone catches nothing —
> `tries` is written for a try with a handler only, and that is the statement. Repaired 2026-09-11
> with `leaky` in alpha.mjs as the site
> (f_a_try_with_no_handler_catches_nothing_and_caught_here_says_it_does).

> The block walked down to the first function boundary, as `nearest_v` walks:
> the whole subtree joined back to its function was 1.4 M probes.

<a id="try_walk"></a>`try_walk`(TS, X) either:

1. if a node TS [has a handler](#try_catches), [`tries`](#tries)(TS, B), and [`parent`](#parent)(B, X);
2. if all of:
   - [`try_walk`](#try_walk)(TS, P);
   - [`parent`](#parent)(P, X);
   - unless P is a [function](js-callgraph.rofl.md#fn_node).

<a id="throws_outright"></a>F throws outright if all of:
  - [`exits`](#exits)(T, `throw`);
  - F [is nearest to](#nearest_v) a node T;
  - unless T [is caught here](#caught_here).

> `may_throw` is a handful of rows and binds G, so `resolves` is probed by
> callee. The value travels with the throw: `thrown_by`, `caught_value`.

<a id="may_throw"></a>F may throw either:

1. if F [throws outright](#throws_outright);
2. if all of:
   - G [may throw](#may_throw);
   - G [runs its body at once](#sync_body);
   - a call C [resolves to](js-callgraph.rofl.md#resolves) G;
   - F [is the nearest function of](js-callgraph.rofl.md#nearest_fn) C;
   - unless C [is caught here](#caught_here).

> an async callee's throw is the rejection of its promise, and comes out where
> the promise is awaited

F may throw if all of:
  - G [may throw](#may_throw);
  - G [is async](#async_body);
  - a call C [resolves to](js-callgraph.rofl.md#resolves) G;
  - a node X [awaits](js-callgraph.rofl.md#await_arg) C;
  - F [is nearest to](#nearest_v) X;
  - unless X [is caught here](#caught_here).

In the flow:

<a id="thrown_by"></a>F throws out a node V either:

1. if all of:
   - [`throws`](#throws)(T, V);
   - F [is nearest to](#nearest_v) a node T;
   - unless T [is caught here](#caught_here);
2. if all of:
   - G [throws out](#thrown_by) V;
   - G [runs its body at once](#sync_body);
   - a call C [resolves to](js-callgraph.rofl.md#resolves) G;
   - F [is the nearest function of](js-callgraph.rofl.md#nearest_fn) C;
   - unless C [is caught here](#caught_here);
3. if all of:
   - G [throws out](#thrown_by) V;
   - G [is async](#async_body);
   - a call C [resolves to](js-callgraph.rofl.md#resolves) G;
   - a node X [awaits](js-callgraph.rofl.md#await_arg) C;
   - F [is nearest to](#nearest_v) X;
   - unless X [is caught here](#caught_here).

<a id="caught_value"></a>A node P catches a node V either:

1. if all of:
   - [the catch](js-dataflow.rofl.md#catch_of) of T is H;
   - [the param](js-dataflow.rofl.md#catch_param) of H is P;
   - [`try_walk`](#try_walk)(T, C);
   - a call C [resolves to](js-callgraph.rofl.md#resolves) G;
   - G [runs its body at once](#sync_body);
   - G [throws out](#thrown_by) V;
2. if all of:
   - [the catch](js-dataflow.rofl.md#catch_of) of T is H;
   - [the param](js-dataflow.rofl.md#catch_param) of H is P;
   - [`try_walk`](#try_walk)(T, X);
   - X [awaits](js-callgraph.rofl.md#await_arg) a node C;
   - C [resolves to](js-callgraph.rofl.md#resolves) G;
   - G [is async](#async_body);
   - G [throws out](#thrown_by) V.

> A throwing call is an abrupt transfer for every list out to the `try` that
> catches it — code after the try runs precisely because the handler caught —
> and out to the FUNCTION boundary: without `ast_within(G, S)` the walk
> reached the module's own list and everything after `class Lit` was
> unreachable (`after_abrupt` 3 -> 37). A try catches only from its block and
> only with a handler: `try { f() } finally {}` stops nothing.

In the code:

A call

- <a id="try_stops"></a>is stopped by T if it [is a throwing call](#throwing_call) and [`try_walk`](#try_walk)(T, it).
- is stopped by S if it [is stopped by](#try_stops) T and [`inside`](#inside)(S, T).

B is abrupt from a step I either:

1. if all of:
   - a call C [is a throwing call](#throwing_call);
   - G [is nearest to](#nearest_v) C;
   - [`step_in`](js-structure.rofl.md#step_in)(S, C);
   - [`inside`](#inside)(G, S);
   - [`seq_at`](js-structure.rofl.md#seq_at)(B, I, S);
   - unless [`repeats`](#repeats)(B, S);
   - unless C [is stopped by](#try_stops) S;
2. if all of:
   - a call C [is a throwing call](#throwing_call);
   - some function [is nearest to](#nearest_v) C;
   - [`seq_at`](js-structure.rofl.md#seq_at)(B, I, C).

> After an abrupt transfer the rest NEVER runs; `guarded` says MAY, on purpose.
> A suspension is a may and belongs here more exactly.

A node

- is guarded if it [follows an abrupt completion](#after_abrupt).
- is guarded if a node S [follows an abrupt completion](#after_abrupt) and [`inside`](#inside)(S, it).
- is guarded if it [follows a suspension](#after_suspend).
- is guarded if a node S [follows a suspension](#after_suspend) and [`inside`](#inside)(S, it).

> A function every one of whose sites is guarded may never be entered.
> `may_not_run` is LOCAL, one level; the transitive question is reachability.

<a id="guarded_call"></a>A call is a guarded call if it [is a call site](js-callgraph.rofl.md#call_site) in some file and it [is guarded](#guarded).

> Both are the CALLEE's and their support is the callers': each caller publishes the call
> (rules/js-surface.rofl `sx_called`, `sx_reached`), and the callee's volume reads them.

<a id="may_not_run"></a>F may not run if [`sx_called`](js-surface.rofl.md#sx_called)(F), unless F [is reached unguarded](#reached_unguarded).

## 7. TRANSITIVE REACHABILITY needs an ENTRY POINT: without one the question is

> unstratified (`live`/`dead` through negation; the kernel refused it). A
> module's export surface is its entry surface — a fact about the language.
> Containment, not paths: `export function`, `export const g = () =>` and
> `export default function` are three shapes. `not in_fn` keeps a closure
> inside an exported function out and a method of an exported class in.
> `export { f as g }` contains no function, so the second arm joins
> `export_local`, which already excludes re-exports and type-only exports.
> `export_all_declaration` introduces no local entry.

`in_fn` of N is read through its rules and never stored.

> A declaration is exported when a name it introduces is a member of a namespace, a module's or a TypeScript one's:
> `export function f`, `export class C`, `export const a = 1`, `export const { a, b = () => 1 } = o`.

<a id="declares_export"></a>`declares_export`(D) either:

1. if [`target`](#target)(D, I) and [`has`](#has)(something, I);
2. if all of:
   - [`decl`](#decl)(D, something);
   - [`assign`](#assign)(D, T, something);
   - [`has`](#has)(something, T);
3. if all of:
   - [`decl`](#decl)(D, something);
   - [`assign`](#assign)(D, T, something);
   - [`inside`](#inside)(T, X);
   - [`has`](#has)(something, X).

<a id="exported_fn"></a>F is exported either:

1. if all of:
   - F is a [function](js-callgraph.rofl.md#fn_node);
   - [`declares_export`](#declares_export)(F);
   - unless F [is inside a function](#in_fn);
2. if all of:
   - F is a [function](js-callgraph.rofl.md#fn_node);
   - [`inside`](#inside)(D, F);
   - [`declares_export`](#declares_export)(D);
   - unless F [is inside a function](#in_fn);
3. if all of:
   - F is a [function](js-callgraph.rofl.md#fn_node);
   - [`inside`](#inside)(E, F);
   - E [is a default export site](js-modules.rofl.md#export_default_site);
   - unless F [is inside a function](#in_fn).

> `export { f }` may hand on a function of another file: the exporting file publishes it, the function's file reads it

In the surface:

<a id="sx_entry"></a>`sx_entry`(F) if all of:
  - a node L [is exported locally as](js-dataflow.rofl.md#export_local) some name from some file;
  - L [points to](js-dataflow.rofl.md#may_be_node) a node F;
  - [`fn_value`](js-surface.rofl.md#fn_value)(F);
  - unless [`fn_nested`](js-surface.rofl.md#fn_nested)(F).

In the code:

F is exported if [`sx_entry`](#sx_entry)(F).

> ...and a top-level call runs on import, with no enclosing function. A top-level call and a call from reachable
> code are published for the callee (`sx_reach`, rules/js-surface.rofl).

<a id="reachable"></a>F is reachable either:

1. if F [is an entry point](#entry_point);
2. if [`sx_reach`](js-surface.rofl.md#sx_reach)(F).

<a id="may_not_be_reached"></a>F may not be reached if [`sx_called`](js-surface.rofl.md#sx_called)(F), unless F [is reachable](#reachable).

> A file with functions and no entry point reports every function dead — an
> artefact of the seed, named. `has_entry` is [code]: a denominator, not a gate.

<a id="has_entry"></a>File has an entry point if F [is an entry point](#entry_point) and [`at`](#at)(F, File, something).

In the audit:

<a id="no_entry_point"></a>File has no entry point if [`at`](#at)(a [function](js-callgraph.rofl.md#fn_node) F, File, something), unless File [has an entry point](#has_entry).

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

> a guarded site at a coordinate, for the report and the runtime comparison

In the code:

<a id="guarded_at"></a>File has a guarded call at Line if all of:
  - a call C [is a guarded call](#guarded_call);
  - [`at`](#at)(C, File, something);
  - [`at`](#at)(C, something, Line).

> the callee-keyed verdicts read the callers through rules/js-surface.rofl

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `code` | `surface` |
| `surface` | `code` |
| `surface` | `flow` |

> the world of execution (suspends, hidden_call, transfers, fallback, coerces) and narrows in [type]: the doc's «Миры поведения»

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `execution` | `value` |
| `execution` | `tree` |
| `execution` | `code` |
| `execution` | `flow` |
| `execution` | `main` |
| `code` | `execution` |
| `flow` | `execution` |
| `audit` | `execution` |
| `surface` | `execution` |
| `type` | `code` |
| `type` | `flow` |
| `code` | `type` |
| `flow` | `type` |


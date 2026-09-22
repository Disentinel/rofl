---
world: js-controlflow
books: audit, code, flow, main
---

# js-controlflow

## Terms

*array pattern*, *block*, *call*, *catch*, *child*, *declarator*, *file*, *for-of*, *function*, *index*, *key*, *kind*, *line*, *literal*, *member access*, *node*, *object literal*, *object pattern*, *rest*, *return*, *spread*, *throw*, *try*.

Kinds without a noun: if_statement, labeled_statement.

> js-controlflow.rofl — THE CONTROL-FLOW LAYER: not WHICH function a site
> reaches but WHETHER the site runs at all. It writes into [code]; everything
> here is a fact about a position in the tree.
> 
> The whole layer is a MAY-set in one direction: `guarded` means "may not
> run", never "never runs". A set too WIDE is a hedge; a set too NARROW is a
> claim, and the narrow direction is the dangerous one throughout.

## 1. A POSITION THAT ONLY RUNS SOMETIMES — one row per (parent, arm), and

> the vocabulary is closed: `guard_unmodelled[audit]` reports a kind that
> branches and is not here. `&&`, `||`, `??` all short-circuit, so the kind
> suffices. `do_while_statement` is NOT here: its body runs before the test. A `for`'s
> `update` runs zero times when the test fails at once. A default value (the
> `right` of an `assignment_pattern`) runs only when the argument is absent;
> the `left` is a name and not conditional. Of a `try` only the HANDLER is a
> guard: the block and the finalizer always run.

<a id="guard_kind"></a>`guard_kind` lists:

| arg 1 | arg 2 |
|---|---|
| if_statement | consequent |
| if_statement | alternate |
| conditional_expression | consequent |
| conditional_expression | alternate |
| logical_expression | right |
| for_of_statement | body |
| for_statement | body |
| for_statement | update |
| for_in_statement | body |
| while_statement | body |
| assignment_pattern | right |
| switch_case | consequent |
| try_statement | handler |

Declared as facts: guard_kind.

> ANY index: `switch_case`'s `consequent` is an array, one arm per statement.

<a id="guard_arm"></a>`guard_arm`(a node P, a node A) if all of:
- [`guard_kind`](#guard_kind)(K, a child Field);
- P [is of kind](js-model.md#ast_node) K;
- A is among the Field of P.

> A non-static field initialiser runs once per construction and never if the
> class is never constructed; a static one runs with the definition. Derived
> from `transfer_mechanism(K, per_construction)`, not a second list.

<a id="field_init"></a>`field_init`(a node P, a node V) if all of:
- [`transfer_mechanism`](#transfer_mechanism)(K, per_construction);
- P [is of kind](js-model.md#ast_node) K;
- the attribute static of P is false;
- the value of P is V.

`guard_arm`(P, V) if [`field_init`](#field_init)(P, V).

<a id="guarded"></a>`guarded`(A) if [`guard_arm`](#guard_arm)(something, A).

<a id="guarded"></a>`guarded`(a node N) if [`guard_arm`](#guard_arm)(something, a node A) and A [is within](js-structure.md#ast_within) N.

## 2. STATEMENT ORDER. After a return/throw/break/continue the rest of the list

> never runs; `guarded` weakens that NEVER into a MAY on purpose — one
> vocabulary, one reader. Statement lists sit under `body` and under
> `switch_case`'s `consequent`; the field is carried so an abrupt in one field
> cannot reach a statement in another.

<a id="abrupt_kind"></a>`abrupt_kind` includes return_statement, throw_statement, break_statement, continue_statement.

<a id="stmt_seq_field"></a>`stmt_seq_field` includes body, consequent.

Declared as facts: abrupt_kind, stmt_seq_field.

> `abrupt_at` is a handful of rows and binds B and F: the second literal probes.

<a id="after_abrupt"></a>`after_abrupt`(a node S) if [`abrupt_at`](#abrupt_at)(a node B, a child F, I), S is the J-th of the F of B, and I < J.

> A SUSPENSION (`await`, `yield`) is a point after which the rest may not run —
> control comes back only if the promise settles — so it lands in `guarded` as
> a MAY and is deliberately not an `abrupt_at` arm. Confined to the suspending
> function: without `nearest_v` an `await` inside a function would guard
> everything after that function's declaration at module level.

<a id="suspend_at"></a>`suspend_at`(a node B, a child F, I) if all of:
- [`transfer_mechanism`](#transfer_mechanism)(K, suspend);
- a node X [is of kind](js-model.md#ast_node) K;
- a function G [is nearest to](js-dataflow.md#nearest_v) X;
- G [is within](js-structure.md#ast_within) a node S;
- S [is within](js-structure.md#ast_within) X;
- [`stmt_seq_field`](#stmt_seq_field)(F);
- S is the I-th of the F of B.

<a id="after_suspend"></a>`after_suspend`(a node S) if [`suspend_at`](#suspend_at)(a node B, a child F, I), S is the J-th of the F of B, and I < J.

> a sequence field the scanner never emits: the typo hole, as `guard_arm_unseen`

<a id="stmt_seq_unseen"></a>`stmt_seq_unseen`(a child F) if [`stmt_seq_field`](#stmt_seq_field)(F), unless the F of some node is some node.

> A LABEL is a boundary an ordinary break cannot cross: `break outer` kills the
> statements between the reference and its target, and the walk stops at the
> label. The label is read, not the keyword, so an unlabelled break derives
> nothing here. The target is unique by grammar (a nested duplicate label is a
> SyntaxError) and a label is not in scope inside a nested function, so no
> function-boundary literal is needed. `if (c) break outer;` puts a guard
> between reference and target and the walking arms then say NEVER where the
> honest word is MAY (f_after_abrupt_says_never_and_the_walking_arms_say_may);
> harmless, because both consumers read through `guarded`.

<a id="label_name"></a>`label_name`(a labeled_statement node LS, N) if the label of LS is a node I and the attribute name of I is N.

<a id="label_ref"></a>`label_ref`(a node X, N) if all of:
- [`abrupt_kind`](#abrupt_kind)(K);
- X [is of kind](js-model.md#ast_node) K;
- the label of X is a node I;
- the attribute name of I is N.

<a id="label_target"></a>`label_target`(a node X, a node LS) if all of:
- [`label_ref`](#label_ref)(X, N);
- [`label_name`](#label_name)(LS, N);
- LS [is within](js-structure.md#ast_within) X.

<a id="abrupt_at"></a>`abrupt_at`(a node B, a child F, I) if all of:
- [`label_target`](#label_target)(a node X, a node LS);
- LS [is within](js-structure.md#ast_within) a node S;
- S [is within](js-structure.md#ast_within) X;
- [`stmt_seq_field`](#stmt_seq_field)(F);
- S is the I-th of the F of B.

## COMPLETION — not a ninth mechanism but the CLOSURE: does this statement

> complete normally? A sound under-approximation: a statement it does not name
> may still complete abruptly (a `guarded` set too small); it must never name
> one that CAN complete normally, so each arm is the language's rule for its
> kind. A block completes abruptly if ANY statement in it does — not the last:
> an abrupt statement is the last that runs. An `if` only if BOTH arms exist
> and both do. A labelled statement only if its body does AND nothing breaks
> out of it. Seeded from `completes_abruptly` and walked UP one edge; the other
> way the first literal is every block in the corpus.

<a id="completion_kind"></a>`completion_kind` includes block_statement, if_statement, labeled_statement.

<a id="completes_abruptly"></a>`completes_abruptly`(a node S) if [`abrupt_kind`](#abrupt_kind)(K) and S [is of kind](js-model.md#ast_node) K.

<a id="completes_abruptly"></a>`completes_abruptly`(a block B) if [`completes_abruptly`](#completes_abruptly)(a node S) and S is among the body of B.

<a id="completes_abruptly"></a>`completes_abruptly`(an if_statement node S) if all of:
- [`completes_abruptly`](#completes_abruptly)(a node C);
- the consequent of S is C;
- the alternate of S is a node A;
- [`completes_abruptly`](#completes_abruptly)(A).

<a id="label_escaped"></a>`label_escaped`(LS) if [`label_target`](#label_target)(something, LS).

`completes_abruptly`(a labeled_statement node LS) if all of:
- [`completes_abruptly`](#completes_abruptly)(a node S);
- the body of LS is S;
- unless [`label_escaped`](#label_escaped)(LS).

Declared as facts: completion_kind.

> the consumer: it replaces the old four-kind arm rather than sitting beside
> it, since the base case IS that arm

`abrupt_at`(a node B, a child F, I) if all of:
- [`completes_abruptly`](#completes_abruptly)(a node S);
- [`stmt_seq_field`](#stmt_seq_field)(F);
- S is the I-th of the F of B.

> a kind this closure claims and never decides — misspelled, deleted or
> unexercised all read as "the closure is smaller than it says"

<a id="completion_decided"></a>`completion_decided`(K) if [`completes_abruptly`](#completes_abruptly)(a node S) and S [is of kind](js-model.md#ast_node) K.

<a id="completion_unreached"></a>`completion_unreached`(K) if all of:
- [`completion_kind`](#completion_kind)(K);
- some node [is of kind](js-model.md#ast_node) K;
- unless [`completion_decided`](#completion_decided)(K).

> Seven kinds can hold a `return` and still complete normally, declared rather
> than left to fall through the block arm: a loop body may run zero times (its
> condition); `do_while_statement` and `switch` need the completion REASON — a
> `continue` or `break` completes the loop or switch normally — which this
> relation does not carry; a `try`'s handler may swallow the transfer and
> `finally` may override it.

<a id="completion_deferred"></a>`completion_deferred` lists:

| arg 1 | arg 2 |
|---|---|
| while_statement | a_condition_this_layer_cannot_decide |
| for_statement | a_condition_this_layer_cannot_decide |
| for_in_statement | a_condition_this_layer_cannot_decide |
| for_of_statement | a_condition_this_layer_cannot_decide |
| do_while_statement | a_completion_reason_this_relation_does_not_carry |
| switch_statement | a_completion_reason_this_relation_does_not_carry |
| try_statement | a_handler_that_may_swallow_the_transfer |

<a id="completion_known"></a>`completion_known`(K) either:

1. if [`completion_kind`](#completion_kind)(K);
2. if [`completion_deferred`](#completion_deferred)(K, something);
3. if [`abrupt_kind`](#abrupt_kind)(K).

Declared as facts: completion_deferred.

> The gate: a statement kind holding an abrupt completion inside its own
> region, in a statement list, in neither table — silently read as "completes
> normally". The function boundary is the precision clause:
> `const f = () => { return 1 }` is a declaration holding a return. Seeded from
> the candidate and the boundary asked of it; the other order crossed every
> function with every abrupt completion, 8.8 s to 21.7 s for one rule.

<a id="completion_outer"></a>`completion_outer`(a node P, a node S) if all of:
- [`completes_abruptly`](#completes_abruptly)(S);
- P [is within](js-structure.md#ast_within) S;
- P [is of kind](js-model.md#ast_node) K;
- [`stmt_seq_field`](#stmt_seq_field)(a child F);
- P is among the F of some node;
- unless [`completion_known`](#completion_known)(K);
- unless [`fn_node_v`](js-dataflow.md#fn_node_v)(P).

<a id="completion_fn_between"></a>`completion_fn_between`(a node P, a node S) if all of:
- [`completion_outer`](#completion_outer)(P, S);
- P [is within](js-structure.md#ast_within) a node G;
- [`fn_node_v`](js-dataflow.md#fn_node_v)(G);
- G [is within](js-structure.md#ast_within) S.

<a id="completion_unaccounted"></a>`completion_unaccounted`(K) if all of:
- [`completion_outer`](#completion_outer)(a node P, S);
- P [is of kind](js-model.md#ast_node) K;
- unless [`completion_fn_between`](#completion_fn_between)(P, S).

## 3. A CALL IS AN EXIT. Decidable from syntax alone: no `return` anywhere in

> the body and a `throw` at its top level. The error direction is safe: a
> function that always throws but has a return somewhere is simply not named.
> The return statement leads: leading with `fn_node(F)` enumerated every
> return against every function — 94 % of the layer's read cost, measured on
> two corpora with two instruments.

<a id="has_return"></a>`has_return`(a node F) if F [is within](js-structure.md#ast_within) a return R and [`fn_node`](js-callgraph.md#fn_node)(F).

<a id="top_throw"></a>`top_throw`(a node F) if all of:
- [`fn_node`](js-callgraph.md#fn_node)(F);
- the body of F is a node B;
- a throw S is among the body of B.

<a id="always_throws"></a>`always_throws`(F) if [`top_throw`](#top_throw)(F), unless [`has_return`](#has_return)(F).

<a id="throwing_call"></a>`throwing_call`(a call C) if all of:
- [`call_site`](js-callgraph.md#call_site)(C, something);
- C [resolves to](js-callgraph.md#resolves) a function F;
- [`always_throws`](#always_throws)(F).

> AN ACCESSOR IS A CALL WEARING A READ'S SYNTAX: `o.p` on a getter transfers
> control; what the getter returns is a different question, not answered here.
> `accessor_of` binds Obj and Key first, then `selects(N, Key)` before
> `member_node_v(N)`, or every accessor is laid beside every member read. A
> private accessor needs no receiver literal: `private_binds` decided both
> halves. A getter that always throws makes the READ an exit. The call graph
> has to say so too: `resolves`, and the read must be a `site` or the edge has
> no caller — declaring `member_expression` a transfer kind would make every
> property read in the corpus a site.

<a id="accessor_kind"></a>`accessor_kind` includes "get", "set".

<a id="accessor_of"></a>`accessor_of`(a node Obj, Key, a node M) if all of:
- [the member](js-dataflow.md#member_value) Key of Obj holds M;
- [`accessor_kind`](#accessor_kind)(K);
- the attribute kind of M is K.

<a id="accessor_read"></a>`accessor_read`(a member access N, M) either:

1. if all of:
   - [`accessor_of`](#accessor_of)(a node Obj, Key, M);
   - N [selects](js-dataflow.md#selects) Key;
   - N [is a member access](js-dataflow.md#member_node_v);
   - the object of N is a node O;
   - O [may be the node](js-dataflow.md#may_be_node) Obj;
2. if all of:
   - N [binds privately to](js-dataflow.md#private_binds) M;
   - [`accessor_kind`](#accessor_kind)(K);
   - the attribute kind of M is K.

`throwing_call`(N) if [`accessor_read`](#accessor_read)(N, M) and [`always_throws`](#always_throws)(M).

A call N resolves to a function M if [`accessor_read`](#accessor_read)(N, M).

`site`(N) if [`accessor_read`](#accessor_read)(N, something).

Declared as facts: accessor_kind.

## 4. A DESTRUCTURING FORM HIDES A CALL. Measured on V8's own stack:

> `{ notch } = dial` runs `get notch`; a rest runs every getter the pattern
> did not take; an object spread runs every getter (it overrides a key and
> still READS it, so no exclusion); an array pattern, an array spread and a
> spread argument run `[Symbol.iterator]` and `next`; a plain array or object
> runs no user code. THE RECEIVER DECIDES, not the syntax — which is what
> `accessor_of` and `member_value(Obj, "iterator", M)` already decide. Only
> the declarator form: a pattern in a parameter reads the argument, a
> call-site question, so it is silent here rather than wrong.

<a id="pattern_source"></a>`pattern_source`(a node P, a node Init) if the id of a declarator D is P and the init of D is Init.

<a id="pattern_accessor"></a>`pattern_accessor`(an object pattern P, M) if all of:
- [`pattern_source`](#pattern_source)(P, a node Init);
- Init [may be the node](js-dataflow.md#may_be_node) a node Obj;
- P [takes the key](js-dataflow.md#pattern_takes) Key;
- [`accessor_of`](#accessor_of)(Obj, Key, M).

<a id="pattern_accessor"></a>`pattern_accessor`(a node R, M) if all of:
- a declarator D [holds a rest](js-dataflow.md#rest_in_pattern) R in some file;
- the id of D is a node P;
- the init of D is a node Init;
- Init [may be the node](js-dataflow.md#may_be_node) a node Obj;
- [`accessor_of`](#accessor_of)(Obj, Key, M);
- unless P [takes the key](js-dataflow.md#pattern_takes) Key.

<a id="pattern_accessor"></a>`pattern_accessor`(a spread S, M) if all of:
- S is among the properties of an object literal O;
- the argument of S is a node A;
- A [may be the node](js-dataflow.md#may_be_node) a node Obj;
- [`accessor_of`](#accessor_of)(Obj, Key, M).

> `spread_element` is one kind doing two things: in `properties` it copies
> keys, in `elements`/`arguments` it exhausts an iterator — keyed by FIELD.

<a id="spread_iterable_field"></a>`spread_iterable_field` includes elements, arguments.

<a id="spread_iterated"></a>`spread_iterated`(a spread S) if [`spread_iterable_field`](#spread_iterable_field)(a child F) and S is among the F of some node.

<a id="pattern_iterates"></a>`pattern_iterates`(a node P, a node M) either:

1. if all of:
   - P is an array pattern;
   - [`pattern_source`](#pattern_source)(P, a node Init);
   - Init [may be the node](js-dataflow.md#may_be_node) a node Obj;
   - [the member](js-dataflow.md#member_value) "iterator" of Obj holds M;
   - [`fn_node`](js-callgraph.md#fn_node)(M);
2. if all of:
   - [`spread_iterated`](#spread_iterated)(P);
   - the argument of P is a node A;
   - A [may be the node](js-dataflow.md#may_be_node) a node Obj;
   - [the member](js-dataflow.md#member_value) "iterator" of Obj holds M;
   - [`fn_node`](js-callgraph.md#fn_node)(M).

Declared as facts: spread_iterable_field.

> The two sides reach the call graph differently. An iterable position has one
> `[Symbol.iterator]` per receiver, so two answers are two candidate receivers
> -> `resolves`. An object position runs one getter PER KEY, so a rest over two
> getters is two true calls at one node -> `calls` directly, or
> `ambiguous_call[audit]` would read a correct model as an over-approximation.
> `site` on both sides: `nearest_fn` ranges over sites, and a `resolves` row at
> a non-site draws no edge (six missing edges, measured). `pattern_next` is a
> relation so the effect layer can name the callee it drops
> (`w_effect_reads_only_what_resolves`).

`site`(N) if [`pattern_accessor`](#pattern_accessor)(N, something).

`calls`(Caller, M) either:

1. if [`pattern_accessor`](#pattern_accessor)(N, M) and [`nearest_fn`](js-callgraph.md#nearest_fn)(Caller, N);
2. if [`pattern_accessor`](#pattern_accessor)(N, M) and [`top_call`](js-callgraph.md#top_call)(N, Caller).

`site`(N) if [`pattern_iterates`](#pattern_iterates)(N, something).

A call N resolves to a function M if [`pattern_iterates`](#pattern_iterates)(N, M).

<a id="pattern_next"></a>`pattern_next`(X, a node Next) if all of:
- [`pattern_iterates`](#pattern_iterates)(X, a function M);
- M [returns](js-dataflow.md#returns) a node E;
- E [may be the node](js-dataflow.md#may_be_node) a node IterObj;
- [the member](js-dataflow.md#member_value) "next" of IterObj holds a node V;
- V [may be the node](js-dataflow.md#may_be_node) Next;
- [`fn_node`](js-callgraph.md#fn_node)(Next).

`calls`(Caller, Next) if [`pattern_next`](#pattern_next)(X, Next) and [`nearest_fn`](js-callgraph.md#nearest_fn)(Caller, X).

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

<a id="hidden_call_pos"></a>`hidden_call_pos`(a node N, accessor_call) either:

1. if N is an object pattern and X1 is accessor_call;
2. if N is a rest, N is among the properties of an object pattern P, and X1 is accessor_call;
3. if N is among the properties of an object literal O, N is a spread, and X1 is accessor_call;
4. if N is an array pattern and X1 is iterator_call;
5. if [`spread_iterated`](#spread_iterated)(N) and X1 is iterator_call;
6. if N is a for-of and X1 is iterator_call.

<a id="hidden_call_src"></a>`hidden_call_src`(a node P, Init) either:

1. if P is an object pattern and [`pattern_source`](#pattern_source)(P, Init);
2. if P is an array pattern and [`pattern_source`](#pattern_source)(P, Init);
3. if a declarator D [holds a rest](js-dataflow.md#rest_in_pattern) P in some file and the init of D is Init;
4. if P is a spread, [`hidden_call_pos`](#hidden_call_pos)(P, something), and the argument of P is Init;
5. if P is a for-of and the right of P is Init.

<a id="hidden_call_user"></a>`hidden_call_user`(N, M) either:

1. if [`pattern_accessor`](#pattern_accessor)(N, M);
2. if [`pattern_iterates`](#pattern_iterates)(N, M);
3. if [`for_of_iterates`](js-callgraph.md#for_of_iterates)(N, M).

<a id="hidden_call_fires"></a>`hidden_call_fires`(N) if [`hidden_call_user`](#hidden_call_user)(N, something).

<a id="hidden_call_builtin"></a>`hidden_call_builtin`(N, a node O) if all of:
- [`hidden_call_src`](#hidden_call_src)(N, a node Src);
- Src [may be the node](js-dataflow.md#may_be_node) O;
- unless [`hidden_call_fires`](#hidden_call_fires)(N).

<a id="hidden_call_primitive"></a>`hidden_call_primitive`(N, V) if all of:
- [`hidden_call_src`](#hidden_call_src)(N, a node Src);
- Src [may be the literal](js-dataflow.md#may_be_lit) V;
- unless [`hidden_call_traced`](#hidden_call_traced)(N).

<a id="hidden_call_traced"></a>`hidden_call_traced`(N) if [`hidden_call_src`](#hidden_call_src)(N, a node Src) and Src [may be the node](js-dataflow.md#may_be_node) some node.

<a id="hidden_call_untraced"></a>`hidden_call_untraced`(N, a node Src) if all of:
- [`hidden_call_src`](#hidden_call_src)(N, Src);
- unless Src [may be the literal](js-dataflow.md#may_be_lit) some literal;
- unless Src [may be the node](js-dataflow.md#may_be_node) some node.

<a id="hidden_call_sourced"></a>`hidden_call_sourced`(N) if [`hidden_call_src`](#hidden_call_src)(N, something).

<a id="hidden_call_unsourced"></a>`hidden_call_unsourced`(a node N, K) if all of:
- [`hidden_call_pos`](#hidden_call_pos)(N, something);
- N [is of kind](js-model.md#ast_node) K;
- unless [`hidden_call_sourced`](#hidden_call_sourced)(N).

<a id="hidden_call_accounted"></a>`hidden_call_accounted`(N) either:

1. if [`hidden_call_fires`](#hidden_call_fires)(N);
2. if [`hidden_call_builtin`](#hidden_call_builtin)(N, something);
3. if [`hidden_call_primitive`](#hidden_call_primitive)(N, something);
4. if [`hidden_call_untraced`](#hidden_call_untraced)(N, something);
5. if [`hidden_call_unsourced`](#hidden_call_unsourced)(N, something).

<a id="hidden_call_unaccounted"></a>`hidden_call_unaccounted`(N) if [`hidden_call_pos`](#hidden_call_pos)(N, something), unless [`hidden_call_accounted`](#hidden_call_accounted)(N).

<a id="hidden_call_off_table"></a>`hidden_call_off_table`(K, M) if all of:
- [`hidden_call_pos`](#hidden_call_pos)(a node N, M);
- N [is of kind](js-model.md#ast_node) K;
- unless [`transfer_mechanism`](#transfer_mechanism)(K, M).

## 6. WHAT PROPAGATES. A try catches what runs in ITS OWN function:

> `try { const f = () => g() } catch {}` has `g()` inside the block textually
> and it runs later, elsewhere. A throw in a HANDLER is not caught by its own
> clause: `block`, not the whole try.

<a id="try_of"></a>`try_of`(a try TS, a function F) if F [is nearest to](js-dataflow.md#nearest_v) TS.

<a id="in_try_block"></a>`in_try_block`(a try TS, a node N) if the block of TS is a node B and B [is within](js-structure.md#ast_within) N.

> A try discharges through its `handler`; a finalizer alone catches nothing —
> `finalizer`'s absence from this table is the statement. Repaired 2026-09-11
> with `leaky` in alpha.mjs as the site
> (f_a_try_with_no_handler_catches_nothing_and_caught_here_says_it_does).

<a id="catches_via"></a>`catches_via` lists:

| arg 1 | arg 2 |
|---|---|
| try_statement | handler |

<a id="try_catches"></a>`try_catches`(a node TS) if all of:
- [`catches_via`](#catches_via)(K, a child Field);
- TS [is of kind](js-model.md#ast_node) K;
- the Field of TS is some node.

<a id="caught_here"></a>`caught_here`(a node N) if all of:
- [`in_try_block`](#in_try_block)(TS, N);
- [`try_of`](#try_of)(TS, a function F);
- F [is nearest to](js-dataflow.md#nearest_v) N;
- [`try_catches`](#try_catches)(TS).

<a id="throws_outright"></a>`throws_outright`(a function F) if F [is nearest to](js-dataflow.md#nearest_v) a throw T, unless [`caught_here`](#caught_here)(T).

Declared as facts: catches_via.

> `may_throw` is a handful of rows and binds G, so `resolves` is probed by
> callee. The value travels with the throw: `thrown_by`, `caught_value`.

<a id="may_throw"></a>`may_throw`(F) either:

1. if [`throws_outright`](#throws_outright)(F);
2. if all of:
   - [`may_throw`](#may_throw)(a function G);
   - a call C [resolves to](js-callgraph.md#resolves) G;
   - F [is nearest to](js-dataflow.md#nearest_v) C;
   - unless [`caught_here`](#caught_here)(C).

<a id="thrown_by"></a>`thrown_by`(a function F, a node V) either:

1. if all of:
   - F [is nearest to](js-dataflow.md#nearest_v) a throw T;
   - the argument of T is V;
   - unless [`caught_here`](#caught_here)(T);
2. if all of:
   - [`thrown_by`](#thrown_by)(a function G, V);
   - a call C [resolves to](js-callgraph.md#resolves) G;
   - F [is nearest to](js-dataflow.md#nearest_v) C;
   - unless [`caught_here`](#caught_here)(C).

<a id="caught_value"></a>A node P catches a node V if all of:
- [the catch](js-dataflow.md#catch_of) of a try T is a catch H;
- [the param](js-dataflow.md#catch_param) of H is P;
- [the block](js-dataflow.md#try_block) of T is a node B;
- B [is within](js-structure.md#ast_within) a node C;
- C [resolves to](js-callgraph.md#resolves) a function G;
- [`thrown_by`](#thrown_by)(G, V).

> A throwing call is an abrupt transfer for every list out to the `try` that
> catches it — code after the try runs precisely because the handler caught —
> and out to the FUNCTION boundary: without `ast_within(G, S)` the walk
> reached the module's own list and everything after `class Lit` was
> unreachable (`after_abrupt` 3 -> 37).

<a id="try_stops"></a>`try_stops`(a node C, a try T) if [`throwing_call`](#throwing_call)(C) and T [is within](js-structure.md#ast_within) C.

<a id="try_stops"></a>`try_stops`(C, a node S) if [`try_stops`](#try_stops)(C, a node T) and S [is within](js-structure.md#ast_within) T.

`abrupt_at`(a node B, a child F, I) if all of:
- [`throwing_call`](#throwing_call)(a node C);
- a function G [is nearest to](js-dataflow.md#nearest_v) C;
- G [is within](js-structure.md#ast_within) a node S;
- S [is within](js-structure.md#ast_within) C;
- [`stmt_seq_field`](#stmt_seq_field)(F);
- S is the I-th of the F of B;
- unless [`try_stops`](#try_stops)(C, S).

> After an abrupt transfer the rest NEVER runs; `guarded` says MAY, on purpose.
> A suspension is a may and belongs here more exactly.

`guarded`(S) if [`after_abrupt`](#after_abrupt)(S).

`guarded`(a node N) if [`after_abrupt`](#after_abrupt)(a node S) and S [is within](js-structure.md#ast_within) N.

`guarded`(S) if [`after_suspend`](#after_suspend)(S).

`guarded`(a node N) if [`after_suspend`](#after_suspend)(a node S) and S [is within](js-structure.md#ast_within) N.

> A function every one of whose sites is guarded may never be entered.
> `may_not_run` is LOCAL, one level; the transitive question is reachability.

<a id="guarded_call"></a>`guarded_call`(C) if [`call_site`](js-callgraph.md#call_site)(C, something) and [`guarded`](#guarded)(C).

<a id="reached_unguarded"></a>`reached_unguarded`(a function F) if a call C [resolves to](js-callgraph.md#resolves) F, unless [`guarded`](#guarded)(C).

<a id="may_not_run"></a>`may_not_run`(a function F) if some call [resolves to](js-callgraph.md#resolves) F, unless [`reached_unguarded`](#reached_unguarded)(F).

## 7. TRANSITIVE REACHABILITY needs an ENTRY POINT: without one the question is

> unstratified (`live`/`dead` through negation; the kernel refused it). A
> module's export surface is its entry surface — a fact about the language.
> Containment, not paths: `export function`, `export const g = () =>` and
> `export default function` are three shapes. `not in_fn` keeps a closure
> inside an exported function out and a method of an exported class in.
> `export { f as g }` contains no function, so the second arm joins
> `export_local`, which already excludes re-exports and type-only exports.
> `export_all_declaration` introduces no local entry.

<a id="export_kind"></a>`export_kind` includes export_named_declaration, export_default_declaration.

`fn_node`(F) if [`fn_name`](js-callgraph.md#fn_name)(F, something).

<a id="in_fn"></a>`in_fn`(a node N) if some function [is nearest to](js-dataflow.md#nearest_v) N.

<a id="exported_fn"></a>`exported_fn`(a node F) either:

1. if all of:
   - [`export_kind`](#export_kind)(K);
   - a node E [is of kind](js-model.md#ast_node) K;
   - E [is within](js-structure.md#ast_within) F;
   - [`fn_node`](js-callgraph.md#fn_node)(F);
   - unless [`in_fn`](#in_fn)(F);
2. if all of:
   - a node L [is exported locally as](js-dataflow.md#export_local) some name from some file;
   - L [may be the node](js-dataflow.md#may_be_node) F;
   - [`fn_node`](js-callgraph.md#fn_node)(F);
   - unless [`in_fn`](#in_fn)(F).

<a id="entry_point"></a>`entry_point`(F) if [`exported_fn`](#exported_fn)(F).

Declared as facts: export_kind.

> ...and a top-level call runs on import, with no enclosing function.

<a id="reachable"></a>`reachable`(F) either:

1. if [`entry_point`](#entry_point)(F);
2. if all of:
   - a call C [resolves to](js-callgraph.md#resolves) F;
   - unless [`guarded`](#guarded)(C);
   - unless [`in_fn`](#in_fn)(C);
3. if all of:
   - [`reachable`](#reachable)(a function G);
   - G [is nearest to](js-dataflow.md#nearest_v) a node C;
   - C [resolves to](js-callgraph.md#resolves) F;
   - unless [`guarded`](#guarded)(C).

<a id="may_not_be_reached"></a>`may_not_be_reached`(a function F) if some call [resolves to](js-callgraph.md#resolves) F, unless [`reachable`](#reachable)(F).

> the typo hole again: a misspelling shrinks the entry surface and reports
> live functions as maybe-dead, the dangerous direction

<a id="export_kind_unseen"></a>`export_kind_unseen`(K) if [`export_kind`](#export_kind)(K), unless some node [is of kind](js-model.md#ast_node) K.

> A file with functions and no entry point reports every function dead — an
> artefact of the seed, named. `has_entry` is [code]: a denominator, not a gate.

<a id="has_entry"></a>`has_entry`(File) if [`entry_point`](#entry_point)(a node F) and F [is of kind](js-model.md#ast_node) some kind in file File.

<a id="no_entry_point"></a>`no_entry_point`(File) if all of:
- [`fn_node`](js-callgraph.md#fn_node)(a node F);
- F [is of kind](js-model.md#ast_node) some kind in file File;
- unless [`has_entry`](#has_entry)(File).

## 8. THE GATES. Every kind that transfers control carries a MECHANISM, and

> mechanisms are not one bucket: `skip_arm`; `short_circuit` (`a?.b()` guards
> the site itself, not a child); `suspend`; `abrupt`; `accessor_call`;
> `loop_at_least_once` (`do_while_statement`, waived: its body always runs);
> `label_boundary` (a label RECEIVES a transfer); `definition_time_call` (a
> decorator runs once, at definition); `per_construction` (a field
> initialiser); `iterator_call`. `spread_element` and `for_of_statement` carry
> two — one row per (kind, mechanism).

<a id="transfer_mechanism"></a>`transfer_mechanism` lists:

| arg 1 | arg 2 |
|---|---|
| if_statement | skip_arm |
| conditional_expression | skip_arm |
| logical_expression | skip_arm |
| for_of_statement | skip_arm |
| optional_call_expression | short_circuit |
| optional_member_expression | short_circuit |
| member_expression | accessor_call |
| await_expression | suspend |
| yield_expression | suspend |
| return_statement | abrupt |
| throw_statement | abrupt |
| break_statement | abrupt |
| continue_statement | abrupt |
| while_statement | skip_arm |
| for_statement | skip_arm |
| for_in_statement | skip_arm |
| switch_statement | skip_arm |
| switch_case | skip_arm |
| try_statement | skip_arm |
| catch_clause | skip_arm |
| do_while_statement | loop_at_least_once |
| assignment_pattern | skip_arm |
| labeled_statement | label_boundary |
| decorator | definition_time_call |
| class_property | per_construction |
| class_private_property | per_construction |
| object_pattern | accessor_call |
| rest_element | accessor_call |
| spread_element | accessor_call |
| array_pattern | iterator_call |
| spread_element | iterator_call |
| for_of_statement | iterator_call |

Declared as facts: transfer_mechanism.

> Three states, not two: modelled, waived with a reason, or open with an owner.
> `mechanism_open` is empty since 2026-09-06 and kept: the next mechanism that
> is neither needs somewhere honest to sit, and an audit red on an honest tree
> gets switched off.

<a id="mechanism_modelled"></a>`mechanism_modelled` includes skip_arm, short_circuit, accessor_call, abrupt, suspend, label_boundary, definition_time_call, per_construction, iterator_call.

<a id="mechanism_waived"></a>`mechanism_waived` lists:

| arg 1 | arg 2 |
|---|---|
| loop_at_least_once | a_body_that_always_runs_guards_nothing |

<a id="mechanism_known"></a>`mechanism_known`(M) either:

1. if [`mechanism_modelled`](#mechanism_modelled)(M);
2. if [`mechanism_waived`](#mechanism_waived)(M, something);
3. if [`mechanism_open`](#mechanism_open)(M, something).

<a id="mechanism_unanswered"></a>`mechanism_unanswered`(M) if [`transfer_mechanism`](#transfer_mechanism)(something, M), unless [`mechanism_known`](#mechanism_known)(M).

Declared as facts: mechanism_modelled, mechanism_waived, mechanism_open.

> A kind carrying a modelled mechanism that no rule reaches. Derived from
> `transfer_mechanism` where a mechanism has one door (suspend, label, field,
> iterator), so claiming the mechanism without the rule reddens
> `guard_unmodelled`. Named by hand where the door is another relation:
> `catch_clause` is a try's arm, `switch_statement` selects a case,
> `member_expression` and `decorator` transfer INTO a callee, and the three
> object-key kinds go through `pattern_accessor` — one per kind rather than
> derived, or the derived line would cover `member_expression` and silence
> its mutant.

<a id="guard_named"></a>`guard_named`(K) either:

1. if [`guard_kind`](#guard_kind)(K, something);
2. if [`short_circuit_kind`](#short_circuit_kind)(K);
3. if [`abrupt_kind`](#abrupt_kind)(K);
4. if [`transfer_mechanism`](#transfer_mechanism)(K, suspend);
5. if [`transfer_mechanism`](#transfer_mechanism)(K, label_boundary);
6. if [`transfer_mechanism`](#transfer_mechanism)(K, per_construction).

`guard_named` includes catch_clause, switch_statement, member_expression, decorator, object_pattern, rest_element, spread_element.

`guard_named`(K) if [`transfer_mechanism`](#transfer_mechanism)(K, iterator_call).

<a id="guard_unmodelled"></a>`guard_unmodelled`(K) if all of:
- [`transfer_mechanism`](#transfer_mechanism)(K, M);
- [`mechanism_modelled`](#mechanism_modelled)(M);
- some node [is of kind](js-model.md#ast_node) K;
- unless [`guard_named`](#guard_named)(K).

> SHORT-CIRCUIT: `a?.b()` stops the whole chain, so the site and everything
> further along it is conditional.

<a id="short_circuit_kind"></a>`short_circuit_kind` includes optional_call_expression, optional_member_expression.

`guarded`(a node N) either:

1. if [`short_circuit_kind`](#short_circuit_kind)(K) and N [is of kind](js-model.md#ast_node) K;
2. if all of:
   - [`short_circuit_kind`](#short_circuit_kind)(K);
   - a node P [is of kind](js-model.md#ast_node) K;
   - P [is within](js-structure.md#ast_within) N.

Declared as facts: short_circuit_kind.

> an arm declared for a field the scanner never emits under that kind: a typo
> makes the guarded set quietly smaller

<a id="guard_arm_seen"></a>`guard_arm_seen`(K, a child Field) if all of:
- [`guard_kind`](#guard_kind)(K, Field);
- a node P [is of kind](js-model.md#ast_node) K;
- the Field of P is some node.

<a id="guard_arm_unseen"></a>`guard_arm_unseen`(K, F) if all of:
- [`guard_kind`](#guard_kind)(K, F);
- some node [is of kind](js-model.md#ast_node) K;
- unless [`guard_arm_seen`](#guard_arm_seen)(K, F).

> a guarded site at a coordinate, for the report and the runtime comparison

<a id="guarded_at"></a>`guarded_at`(File, Line) if [`guarded_call`](#guarded_call)(a node C) and C [is of kind](js-model.md#ast_node) some kind in file File at line Line.

## Read from other files

- [ast_node](js-model.md#ast_node)
- [ast_within](js-structure.md#ast_within)
- [call_site](js-callgraph.md#call_site)
- [catch_of](js-dataflow.md#catch_of)
- [catch_param](js-dataflow.md#catch_param)
- [export_local](js-dataflow.md#export_local)
- [fn_name](js-callgraph.md#fn_name)
- [fn_node](js-callgraph.md#fn_node)
- [fn_node_v](js-dataflow.md#fn_node_v)
- [for_of_iterates](js-callgraph.md#for_of_iterates)
- [may_be_lit](js-dataflow.md#may_be_lit)
- [may_be_node](js-dataflow.md#may_be_node)
- [member_node_v](js-dataflow.md#member_node_v)
- [member_value](js-dataflow.md#member_value)
- [nearest_fn](js-callgraph.md#nearest_fn)
- [nearest_v](js-dataflow.md#nearest_v)
- [pattern_takes](js-dataflow.md#pattern_takes)
- [private_binds](js-dataflow.md#private_binds)
- [resolves](js-callgraph.md#resolves)
- [rest_in_pattern](js-dataflow.md#rest_in_pattern)
- [returns](js-dataflow.md#returns)
- [selects](js-dataflow.md#selects)
- [top_call](js-callgraph.md#top_call)
- [try_block](js-dataflow.md#try_block)

## Not defined in these files

- `ast_attr`
- `ast_child`


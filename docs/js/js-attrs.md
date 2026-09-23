---
world: js-attrs
books: audit, code, main
default: main
---

# js-attrs

## Signatures

- tests_the_attribute(rule R, attribute K, on term S, under field F) (attr_guard_slot)
- guards_the_attribute(rule R, attribute K, on term S, as kind Kind) (attr_guard_kind)
- is_a_slot_gap(attribute K, at field F, of kind Kind) (attr_slot_gap)
- tests_the_attribute_positively(rule R, attribute K, on term S, under field F) (attr_guard_slot_pos)
- is_a_positive_slot_gap(attribute K, at field F, of kind Kind) (attr_pos_slot_gap)
- is_a_blind_guard(attribute K, at field F, of kind Kind) (attr_blind_guard), in the audit
- is_excused_unseen(attribute K, at field F, of kind Kind) (attr_slot_gap_ok_unseen), in the audit

> js-attrs.rofl — AN ATTRIBUTE THE SCANNER EMITS AND NO RULE READS
> (`w_unconsumed_attribute`). Four times a design note claimed a fact was
> missing that was already on the store, because the note was written while
> looking at the RULES. So ask the rules: clauses are stored as facts after
> parsing, and "which attribute keys does any rule name" is a query over
> `premise_lit`, through `lit_rel` and `lit_arg` from rules/js-vocabulary.rofl.
> Its own pack because it needs a corpus and the vocabulary pack is
> deliberately corpus-free.

> What a rule names, literal by literal: one literal naming a key AND a
> value, where a key read with a variable value is a rule reading every value.

<a id="attr_lit"></a>`attr_lit`(L, K, V) if all of:
  - [`lit_rel`](js-vocabulary.md#lit_rel)(L, `ast_attr`);
  - [the argument](js-vocabulary.md#lit_arg) 2 of a term L is a term K;
  - [the argument](js-vocabulary.md#lit_arg) 3 of L is a term V.

<a id="attr_lit_kvar"></a>`attr_lit_kvar`(L, $var(X)) if [`attr_lit`](#attr_lit)(L, $var(X), something).

<a id="attr_lit_vvar"></a>`attr_lit_vvar`(L, $var(X)) if [`attr_lit`](#attr_lit)(L, something, $var(X)).

> a key some rule names; a key read with the value free, for which
> `unconsumed_value` must not fire; a (key, value) pair named outright

<a id="attr_key_read"></a>`attr_key_read`(K) if [`attr_lit`](#attr_lit)(L, K, something), unless [`attr_lit_kvar`](#attr_lit_kvar)(L, K).

<a id="attr_key_read_free"></a>`attr_key_read_free`(K) if all of:
  - [`attr_lit`](#attr_lit)(L, K, V);
  - [`attr_lit_vvar`](#attr_lit_vvar)(L, V);
  - unless [`attr_lit_kvar`](#attr_lit_kvar)(L, K).

<a id="attr_pair_read"></a>`attr_pair_read`(K, V) if all of:
  - [`attr_lit`](#attr_lit)(L, K, V);
  - unless [`attr_lit_kvar`](#attr_lit_kvar)(L, K);
  - unless [`attr_lit_vvar`](#attr_lit_vvar)(L, V).

> THE TWO AUDITS: a whole key nobody reads (`async`, `generator`, `prefix`),
> and a key read only with constant values, one of which no rule names. Two
> excuse lists, the `not_a_construct` / `frame_deferred` split of js-model:
> a key the model will never read is a different fact from one nobody has
> read YET. The first list's criterion is measurable: the distinction the
> attribute carries is also carried by something the model reads, usually
> the kind (`optional` is `optional_member_expression`).

<a id="unconsumed_attr"></a>`unconsumed_attr`(K) if all of:
  - the attribute K of some node is some value;
  - unless [`attr_key_read`](#attr_key_read)(K);
  - unless [`attr_unread_ok`](#attr_unread_ok)(K, something);
  - unless [`attr_deferred`](#attr_deferred)(K, something).

<a id="unconsumed_value"></a>`unconsumed_value`(K, V) if all of:
  - the attribute K of some node is V;
  - [`attr_key_read`](#attr_key_read)(K);
  - unless [`attr_key_read_free`](#attr_key_read_free)(K);
  - unless [`attr_pair_read`](#attr_pair_read)(K, V);
  - unless [`attr_value_unread_ok`](#attr_value_unread_ok)(K, V, something).

Declared as facts: attr_unread_ok, attr_deferred, attr_value_unread_ok.

> both excuse lists guarded, as `not_a_construct_unseen` in js-model: a
> misspelling would silently readmit the key to nothing

<a id="attr_unread_ok_unseen"></a>`attr_unread_ok_unseen`(K) if [`attr_unread_ok`](#attr_unread_ok)(K, something), unless the attribute K of some node is some value.

<a id="attr_unread_ok_read"></a>`attr_unread_ok_read`(K) if [`attr_unread_ok`](#attr_unread_ok)(K, something) and [`attr_key_read`](#attr_key_read)(K).

<a id="attr_value_ok_unseen"></a>`attr_value_ok_unseen`(K, V) if [`attr_value_unread_ok`](#attr_value_unread_ok)(K, V, something), unless the attribute K of some node is V.

<a id="attr_deferred_unseen"></a>`attr_deferred_unseen`(K) if [`attr_deferred`](#attr_deferred)(K, something), unless the attribute K of some node is some value.

<a id="attr_deferred_read"></a>`attr_deferred_read`(K) if [`attr_deferred`](#attr_deferred)(K, something) and [`attr_key_read`](#attr_key_read)(K).

<a id="attr_double_excused"></a>`attr_double_excused`(K) if [`attr_unread_ok`](#attr_unread_ok)(K, something) and [`attr_deferred`](#attr_deferred)(K, something).

> A KEY READ THROUGH A TABLE, which `attr_key_read` cannot see: js-env reads
> `attr_needs(L, K, Key, V, F), ast_attr[code](N, Key, V)`, so the literal
> carries two variables, and `async` sat in `attr_deferred` while a table
> read it 398 times. A rule joining a two-variable `ast_attr` literal to
> another relation carrying the same two variables reads whatever pairs that
> relation holds; going from its NAME to its ROWS is not a query, so the
> bridge is two lines by hand and `attr_table_unbridged[audit]` makes the
> list impossible to forget. BOTH literals must be positive: a negated
> co-literal FILTERS the pairs (`unconsumed_value` has that shape), a
> positive one SUPPLIES them.

<a id="pos_prem"></a>`pos_prem`(R, L) if `premise_lit`(R, something, L) and L is $lit(something, something, something, something).

<a id="attr_lit_kvvar"></a>`attr_lit_kvvar`(L) if all of:
  - [`attr_lit`](#attr_lit)(L, K, V);
  - [`attr_lit_kvar`](#attr_lit_kvar)(L, K);
  - [`attr_lit_vvar`](#attr_lit_vvar)(L, V).

<a id="attr_table_read"></a>`attr_table_read`(Rel, I, J) if all of:
  - [`pos_prem`](#pos_prem)(R, L);
  - [`attr_lit_kvvar`](#attr_lit_kvvar)(L);
  - [`attr_lit`](#attr_lit)(L, K, V);
  - [`pos_prem`](#pos_prem)(R, L2);
  - [`lit_rel`](js-vocabulary.md#lit_rel)(L2, Rel);
  - Rel differs from `ast_attr`;
  - [the argument](js-vocabulary.md#lit_arg) I of a term L2 is a term K;
  - [the argument](js-vocabulary.md#lit_arg) J of L2 is a term V.

<a id="attr_table_unbridged"></a>`attr_table_unbridged`(Rel, I, J) if [`attr_table_read`](#attr_table_read)(Rel, I, J), unless [`attr_table_bridged`](#attr_table_bridged)(Rel).

<a id="attr_table_bridged_unread"></a>`attr_table_bridged_unread`(Rel) if [`attr_table_bridged`](#attr_table_bridged)(Rel), unless [`attr_table_read`](#attr_table_read)(Rel, something, something).

Declared as facts: attr_table_bridged.

> the bridge itself, feeding both audits

`attr_pair_read`(K, V) either:

1. if `attr_needs`(something, something, K, V, something);
2. if `outside_attr_needs`(something, something, K, V, something).

`attr_key_read`(K) if [`attr_pair_read`](#attr_pair_read)(K, something).

> WHICH KINDS IN A GUARDED POSITION CARRY NO SUCH ATTRIBUTE AT ALL
> (`f_a_positive_attribute_test_is_blind_to_a_kind_that_has_no_such_attribute`).
> A constant-valued `ast_attr` premise whose subject variable is also the
> PARENT of an `ast_child` premise in the same rule is a guard over a
> position; the field is what makes the population meaningful (a bare sweep
> reports `computed` absent from `block_statement`, true and useless). Where
> the clause also pins the subject to a declared kind through `ast_node`,
> only that kind is the population. The mirror reading, a guard on the CHILD
> of an `ast_child` premise, is not seen: the two clauses with that shape pin
> their kind and the kind arm covers them.

<a id="rule_prem"></a>`rule_prem`(R, L) either:

1. if `premise_lit`(R, something, L) and L is $lit(something, something, something, something);
2. if `premise_lit`(R, something, $not(L)).

<a id="attr_test_lit"></a>`attr_test_lit`(L, S, K) if all of:
  - [`attr_lit`](#attr_lit)(L, K, V);
  - [the argument](js-vocabulary.md#lit_arg) 1 of a term L is a term S;
  - unless [`attr_lit_kvar`](#attr_lit_kvar)(L, K);
  - unless [`attr_lit_vvar`](#attr_lit_vvar)(L, V).

<a id="attr_test_svar"></a>`attr_test_svar`(L, $var(X)) if [`attr_test_lit`](#attr_test_lit)(L, $var(X), something).

<a id="child_lit"></a>`child_lit`(L, S, F) if all of:
  - [`body_lit`](js-vocabulary.md#body_lit)(L);
  - [`lit_rel`](js-vocabulary.md#lit_rel)(L, `ast_child`);
  - [the argument](js-vocabulary.md#lit_arg) 1 of a term L is a term S;
  - [the argument](js-vocabulary.md#lit_arg) 2 of L is a term F.

<a id="child_lit_svar"></a>`child_lit_svar`(L, $var(X)) if [`child_lit`](#child_lit)(L, $var(X), something).

<a id="child_lit_fvar"></a>`child_lit_fvar`(L, $var(X)) if [`child_lit`](#child_lit)(L, something, $var(X)).

A rule

- <a id="attr_guard_slot"></a>tests the attribute K on a term S under F if all of:
  - [`rule_prem`](#rule_prem)(it, L);
  - [`attr_test_lit`](#attr_test_lit)(L, S, K);
  - [`attr_test_svar`](#attr_test_svar)(L, S);
  - [`rule_prem`](#rule_prem)(it, L2);
  - [`child_lit`](#child_lit)(L2, S, F);
  - [`child_lit_svar`](#child_lit_svar)(L2, S);
  - unless [`child_lit_fvar`](#child_lit_fvar)(L2, F).
- <a id="attr_guard_kind"></a>guards the attribute K on a term S as Kind if all of:
  - [`rule_prem`](#rule_prem)(it, L);
  - [`attr_test_lit`](#attr_test_lit)(L, S, K);
  - [`attr_test_svar`](#attr_test_svar)(L, S);
  - [`rule_prem`](#rule_prem)(it, L2);
  - [`lit_rel`](js-vocabulary.md#lit_rel)(L2, `ast_node`);
  - [the argument](js-vocabulary.md#lit_arg) 1 of a term L2 is S;
  - [the argument](js-vocabulary.md#lit_arg) 2 of L2 is Kind;
  - `node_kind`(`js`, Kind).

<a id="attr_guard_pinned"></a>`attr_guard_pinned`(R, K, S) if a rule R [guards the attribute](#attr_guard_kind) K on a term S as some kind.

<a id="attr_slot_gap"></a>An attribute K is a slot gap at F of Kind either:

1. if all of:
   - a rule R [tests the attribute](#attr_guard_slot) K on a term S under F;
   - some node is among the F of a node P;
   - P [is of kind](js-model.md#ast_node) Kind;
   - unless [`attr_guard_pinned`](#attr_guard_pinned)(R, K, S);
   - unless the attribute K of P is some value;
2. if all of:
   - a rule R [tests the attribute](#attr_guard_slot) K on a term S under F;
   - R [guards the attribute](#attr_guard_kind) K on S as Kind;
   - some node is among the F of a node P;
   - P [is of kind](js-model.md#ast_node) Kind;
   - unless the attribute K of P is some value.

> THE POLARITY IS THE GATE. A gap under a NEGATED test is harmless:
> `not ast_attr(P, computed, true)` keeps a node with no `computed` at all,
> which `key_name` in js-structure relies on. The same gap under a POSITIVE
> test silently drops those nodes. The report carries both, the audit only
> the positive ones, and swapping `key_name`'s negation for `computed, false`
> moves two rows across — the survivor the finding recorded with no oracle.

<a id="attr_guard_slot_pos"></a>A rule tests the attribute positively K on a term S under F if all of:
  - [`pos_prem`](#pos_prem)(it, L);
  - [`attr_test_lit`](#attr_test_lit)(L, S, K);
  - [`attr_test_svar`](#attr_test_svar)(L, S);
  - [`rule_prem`](#rule_prem)(it, L2);
  - [`child_lit`](#child_lit)(L2, S, F);
  - [`child_lit_svar`](#child_lit_svar)(L2, S);
  - unless [`child_lit_fvar`](#child_lit_fvar)(L2, F).

<a id="attr_pos_slot_gap"></a>An attribute K is a positive slot gap at F of Kind either:

1. if all of:
   - a rule R [tests the attribute positively](#attr_guard_slot_pos) K on a term S under F;
   - some node is among the F of a node P;
   - P [is of kind](js-model.md#ast_node) Kind;
   - unless [`attr_guard_pinned`](#attr_guard_pinned)(R, K, S);
   - unless the attribute K of P is some value;
2. if all of:
   - a rule R [tests the attribute positively](#attr_guard_slot_pos) K on a term S under F;
   - R [guards the attribute](#attr_guard_kind) K on S as Kind;
   - some node is among the F of a node P;
   - P [is of kind](js-model.md#ast_node) Kind;
   - unless the attribute K of P is some value.

<a id="attr_blind_guard"></a>An attribute K is a blind guard at F of Kind if K [is a positive slot gap](#attr_pos_slot_gap) at F of Kind, unless [`attr_slot_gap_ok`](#attr_slot_gap_ok)(K, F, Kind, something).

Declared as facts: attr_slot_gap_ok.

> the excuse list is checked against the WHOLE report: an excuse no longer
> needed because a guard became a negation is still a true row

<a id="attr_slot_gap_ok_unseen"></a>An attribute K is excused unseen at F of Kind if [`attr_slot_gap_ok`](#attr_slot_gap_ok)(K, F, Kind, something), unless K [is a slot gap](#attr_slot_gap) at F of Kind.

> THE HALF NO KIND-LEVEL READING CAN STATE: `class_private_method` carries
> `computed` on its accessor forms and not on the plain one, so the presence
> of an attribute can depend on ANOTHER attribute of the same node. A split
> kind is present in the slot, so `attr_slot_gap` finds nothing, and the
> guard is blind to exactly the nodes that lack it.

<a id="attr_kind_has"></a>`attr_kind_has`(Kind, K) if a node P [is of kind](js-model.md#ast_node) Kind and the attribute K of P is some value.

<a id="attr_kind_lacks"></a>`attr_kind_lacks`(Kind, K) if all of:
  - [`attr_kind_has`](#attr_kind_has)(Kind, K);
  - a node P [is of kind](js-model.md#ast_node) Kind;
  - unless the attribute K of P is some value.

<a id="attr_kind_split"></a>`attr_kind_split`(K, Kind) if all of:
  - [`attr_key_read`](#attr_key_read)(K);
  - [`attr_kind_lacks`](#attr_kind_lacks)(Kind, K);
  - unless [`attr_split_ok`](#attr_split_ok)(K, Kind, something).

<a id="attr_split_ok_unseen"></a>`attr_split_ok_unseen`(K, Kind) if [`attr_split_ok`](#attr_split_ok)(K, Kind, something), unless [`attr_kind_lacks`](#attr_kind_lacks)(Kind, K).

Declared as facts: attr_split_ok.

## Read from other files

- [ast_node](js-model.md#ast_node), in the code
- [body_lit](js-vocabulary.md#body_lit), in the main
- [lit_arg](js-vocabulary.md#lit_arg), in the main
- [lit_rel](js-vocabulary.md#lit_rel), in the main

## Not defined in these files

- `ast_attr`, in the code
- `ast_child`, in the code
- `attr_needs`, in the main
- `node_kind`, in the main
- `outside_attr_needs`, in the main
- `premise_lit`, in the main

> 6 trailing comments on rule lines are not carried over.


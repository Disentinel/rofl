---
world: js-attrs
books: audit, code, main
default: main
---

# js-attrs

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

A term

- <a id="attr_lit"></a>reads the attribute K with a term V if all of:
  - [the relation](js-vocabulary.md#lit_rel) of it is `ast_attr`;
  - [the argument](js-vocabulary.md#lit_arg) 2 of it is K;
  - [the argument](js-vocabulary.md#lit_arg) 3 of it is V.
- <a id="attr_lit_kvar"></a>has a variable key $var(X) if it [reads the attribute](#attr_lit) $var(X) with some term.
- <a id="attr_lit_vvar"></a>has a variable value $var(X) if it [reads the attribute](#attr_lit) some key with $var(X).

> a key some rule names; a key read with the value free, for which
> `unconsumed_value` must not fire; a (key, value) pair named outright

A key K

- <a id="attr_key_read"></a>is read if a term L [reads the attribute](#attr_lit) K with some term, unless L [has a variable key](#attr_lit_kvar) K.
- <a id="attr_key_read_free"></a>is read with the value free if all of:
  - a term L [reads the attribute](#attr_lit) K with a term V;
  - L [has a variable value](#attr_lit_vvar) V;
  - unless L [has a variable key](#attr_lit_kvar) K.
- <a id="attr_pair_read"></a>is read with a term V if a term L [reads the attribute](#attr_lit) K with V and L neither [has a variable key](#attr_lit_kvar) K nor [has a variable value](#attr_lit_vvar) V.

> THE TWO AUDITS: a whole key nobody reads (`async`, `generator`, `prefix`),
> and a key read only with constant values, one of which no rule names. Two
> excuse lists, the `not_a_construct` / `frame_deferred` split of js-model:
> a key the model will never read is a different fact from one nobody has
> read YET. The first list's criterion is measurable: the distinction the
> attribute carries is also carried by something the model reads, usually
> the kind (`optional` is `optional_member_expression`).

In the audit:

A key K

- <a id="unconsumed_attr"></a>is unconsumed if all of:
  - the attribute K of some node is some value;
  - unless K [is read](#attr_key_read);
  - unless [`attr_unread_ok`](#attr_unread_ok)(K, something);
  - unless [`attr_deferred`](#attr_deferred)(K, something).
- <a id="unconsumed_value"></a>has an unconsumed value V if all of:
  - the attribute K of some node is V;
  - K [is read](#attr_key_read);
  - K neither [is read with the value free](#attr_key_read_free) nor [is read with](#attr_pair_read) V;
  - unless [`attr_value_unread_ok`](#attr_value_unread_ok)(K, V, something).

Declared as facts: attr_unread_ok, attr_deferred, attr_value_unread_ok.

> both excuse lists guarded, as `not_a_construct_unseen` in js-model: a
> misspelling would silently readmit the key to nothing

A key K

- <a id="attr_unread_ok_unseen"></a>is an unseen excuse if [`attr_unread_ok`](#attr_unread_ok)(K, something), unless the attribute K of some node is some value.
- <a id="attr_unread_ok_read"></a>is excused yet read if [`attr_unread_ok`](#attr_unread_ok)(K, something) and K [is read](#attr_key_read).
- <a id="attr_value_ok_unseen"></a>is an unseen value excuse with V if [`attr_value_unread_ok`](#attr_value_unread_ok)(K, V, something), unless the attribute K of some node is V.
- <a id="attr_deferred_unseen"></a>is deferred unseen if [`attr_deferred`](#attr_deferred)(K, something), unless the attribute K of some node is some value.
- <a id="attr_deferred_read"></a>is deferred yet read if [`attr_deferred`](#attr_deferred)(K, something) and K [is read](#attr_key_read).
- <a id="attr_double_excused"></a>is excused twice if [`attr_unread_ok`](#attr_unread_ok)(K, something) and [`attr_deferred`](#attr_deferred)(K, something).

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

In the main:

<a id="pos_prem"></a>A rule has the positive premise L if `premise_lit`(it, something, L) and L is $lit(something, something, something, something).

<a id="attr_lit_kvvar"></a>A term reads attributes freely if all of:
  - it [reads the attribute](#attr_lit) K with a term V;
  - it [has a variable key](#attr_lit_kvar) K;
  - it [has a variable value](#attr_lit_vvar) V.

<a id="attr_table_read"></a>A relation carries attribute pairs from an index I to an index J if all of:
  - a rule R [has the positive premise](#pos_prem) L;
  - L [reads attributes freely](#attr_lit_kvvar);
  - L [reads the attribute](#attr_lit) K with a term V;
  - R [has the positive premise](#pos_prem) L2;
  - [the relation](js-vocabulary.md#lit_rel) of L2 is it;
  - it differs from `ast_attr`;
  - [the argument](js-vocabulary.md#lit_arg) I of L2 is K;
  - [the argument](js-vocabulary.md#lit_arg) J of L2 is V.

In the audit:

A relation

- <a id="attr_table_unbridged"></a>carries attribute pairs unbridged from an index I to an index J if it [carries attribute pairs](#attr_table_read) from I to J, unless [`attr_table_bridged`](#attr_table_bridged)(it).
- <a id="attr_table_bridged_unread"></a>is bridged yet unread if [`attr_table_bridged`](#attr_table_bridged)(it), unless it [carries attribute pairs](#attr_table_read) from some index to some index.

Declared as facts: attr_table_bridged.

> the bridge itself, feeding both audits

In the main:

A key K is read with V either:

1. if `attr_needs`(something, something, K, V, something);
2. if `outside_attr_needs`(something, something, K, V, something).

A key K is read if K [is read with](#attr_pair_read) some value.

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

<a id="rule_prem"></a>A rule R has the premise L either:

1. if `premise_lit`(R, something, L) and L is $lit(something, something, something, something);
2. if `premise_lit`(R, something, $not(L)).

A term

- <a id="attr_test_lit"></a>is an attribute test of a term S on a key K if all of:
  - it [reads the attribute](#attr_lit) K with a term V;
  - [the argument](js-vocabulary.md#lit_arg) 1 of it is S;
  - it neither [has a variable key](#attr_lit_kvar) K nor [has a variable value](#attr_lit_vvar) V.
- <a id="attr_test_svar"></a>tests a variable subject $var(X) if it [is an attribute test](#attr_test_lit) of $var(X) on some key.
- <a id="child_lit"></a>reads the child of a term S at a term F if all of:
  - it [is a body literal](js-vocabulary.md#body_lit);
  - [the relation](js-vocabulary.md#lit_rel) of it is `ast_child`;
  - [the argument](js-vocabulary.md#lit_arg) 1 of it is S;
  - [the argument](js-vocabulary.md#lit_arg) 2 of it is F.
- <a id="child_lit_svar"></a>reads the child of a variable $var(X) if it [reads the child](#child_lit) of $var(X) at some field.
- <a id="child_lit_fvar"></a>reads a variable field $var(X) if it [reads the child](#child_lit) of some term at $var(X).

A rule

- <a id="attr_guard_slot"></a>tests the attribute K on a term S under a term F if all of:
  - it [has the premise](#rule_prem) L;
  - L [is an attribute test](#attr_test_lit) of S on K;
  - L [tests a variable subject](#attr_test_svar) S;
  - it [has the premise](#rule_prem) L2;
  - L2 [reads the child](#child_lit) of S at F;
  - L2 [reads the child of a variable](#child_lit_svar) S;
  - unless L2 [reads a variable field](#child_lit_fvar) F.
- <a id="attr_guard_kind"></a>guards the attribute K on a term S as Kind if all of:
  - it [has the premise](#rule_prem) L;
  - L [is an attribute test](#attr_test_lit) of S on K;
  - L [tests a variable subject](#attr_test_svar) S;
  - it [has the premise](#rule_prem) L2;
  - [the relation](js-vocabulary.md#lit_rel) of L2 is `ast_node`;
  - [the argument](js-vocabulary.md#lit_arg) 1 of L2 is S;
  - [the argument](js-vocabulary.md#lit_arg) 2 of L2 is Kind;
  - `js` has the node kind Kind.
- <a id="attr_guard_pinned"></a>pins the attribute guard K on a term S if it [guards the attribute](#attr_guard_kind) K on S as some kind.

<a id="attr_slot_gap"></a>An attribute K is a slot gap at F of Kind either:

1. if all of:
   - a rule R [tests the attribute](#attr_guard_slot) K on a term S under F;
   - some node is among the F of a node P;
   - P [is of kind](js-model.md#ast_node) Kind;
   - unless R [pins the attribute guard](#attr_guard_pinned) K on S;
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

<a id="attr_guard_slot_pos"></a>A rule tests the attribute positively K on a term S under a term F if all of:
  - it [has the positive premise](#pos_prem) L;
  - L [is an attribute test](#attr_test_lit) of S on K;
  - L [tests a variable subject](#attr_test_svar) S;
  - it [has the premise](#rule_prem) L2;
  - L2 [reads the child](#child_lit) of S at F;
  - L2 [reads the child of a variable](#child_lit_svar) S;
  - unless L2 [reads a variable field](#child_lit_fvar) F.

<a id="attr_pos_slot_gap"></a>An attribute K is a positive slot gap at F of Kind either:

1. if all of:
   - a rule R [tests the attribute positively](#attr_guard_slot_pos) K on a term S under F;
   - some node is among the F of a node P;
   - P [is of kind](js-model.md#ast_node) Kind;
   - unless R [pins the attribute guard](#attr_guard_pinned) K on S;
   - unless the attribute K of P is some value;
2. if all of:
   - a rule R [tests the attribute positively](#attr_guard_slot_pos) K on a term S under F;
   - R [guards the attribute](#attr_guard_kind) K on S as Kind;
   - some node is among the F of a node P;
   - P [is of kind](js-model.md#ast_node) Kind;
   - unless the attribute K of P is some value.

In the audit:

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

In the main:

<a id="attr_kind_has"></a>Kind carries the attribute K if a node P [is of kind](js-model.md#ast_node) Kind and the attribute K of P is some value.

<a id="attr_kind_lacks"></a>Kind sometimes lacks the attribute K if all of:
  - Kind [carries the attribute](#attr_kind_has) K;
  - a node P [is of kind](js-model.md#ast_node) Kind;
  - unless the attribute K of P is some value.

In the audit:

A key K

- <a id="attr_kind_split"></a>splits the kind Kind if all of:
  - K [is read](#attr_key_read);
  - Kind [sometimes lacks the attribute](#attr_kind_lacks) K;
  - unless [`attr_split_ok`](#attr_split_ok)(K, Kind, something).
- <a id="attr_split_ok_unseen"></a>is an unseen split excuse for Kind if [`attr_split_ok`](#attr_split_ok)(K, Kind, something), unless Kind [sometimes lacks the attribute](#attr_kind_lacks) K.

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


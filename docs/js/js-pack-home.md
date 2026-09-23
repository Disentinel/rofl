---
world: js-pack-home
books: audit, main
default: main
---

# js-pack-home

Reads:

- from outside these files: `asserted_by`, `node_kind`

> js-pack-home.rofl — WHERE A `node_kind` ROW BELONGS, as a rule rather than
> a convention (`w_vocabulary_home`). facts/js-kinds.rofl is not the
> vocabulary's home: it is the deliberately tiny BASE every world loads.
> 
> A `node_kind(js, K)` row belongs in the pack of layer P iff
>   (1) P SPEAKS ABOUT K: some fact P asserts carries K in a position that
>       holds kinds — a verdict ledger or a kind table the rules assert
>       beside themselves — or
>   (2) P is the BASE pack, which declares what a layer may borrow.
> Clause (1) is `orphan_claim[audit]` and `rule_opinion_unlisted[audit]`
> read backwards, and the tree already obeys it: `kind_home_unbacked` is
> empty. Gathering the rows into the base would enlarge every partial world
> and put 68 rows in a pack that speaks about none of them;
> test/js-pack-home.test.ts measures that counterfactual.

## WHICH PACK A ROW CAME FROM. The finest grain the store records is the

> PRINCIPAL a load named, so the loader (test/js-pack-home.test.ts) gives
> each pack a `who`. A layer is two files and one principal: a row in the
> wrong FILE of the right layer is invisible here, and packs concatenated
> into one `load()` are one pack, which is why this is its own pack with its
> own loader.

<a id="pack_fact"></a>A pack asserts a relation Rel with a term Args if `asserted_by`($fact(Rel, `main`, Args), it, something).

> the argument walk, as rules/js-vocabulary.rofl runs it over `premise_lit`:
> that file walks what the RULES MATCH, this one what the FACTS SAY

<a id="fwalk"></a>The arguments of a relation Rel in a pack P from an index N are a term Args either:

1. if P [asserts](#pack_fact) Rel with Args and N is 1;
2. if [the arguments](#fwalk) of Rel in P from an index I are $cons(something, Args) and N is I + 1.

<a id="fslot"></a>The slot I of a relation Rel in a pack P holds a term X if [the arguments](#fwalk) of Rel in P from I are $cons(X, something).

> Which positions carry a kind — DISCOVERED, not declared: a position is a
> kind position when a declared kind stands in it, so the audit configures
> itself. `node_kind` itself is excluded, or every declaration would back
> itself.

<a id="fkind_slot"></a>A relation has a kind slot in facts at an index I if [the slot](#fslot) I of it in some pack holds a term X and `js` has the node kind X.

A pack

- <a id="pack_declares"></a>declares the kind K if [the slot](#fslot) 2 of `node_kind` in it holds K and `js` has the node kind K.
- <a id="pack_speaks"></a>speaks of the kind K if all of:
  - [the slot](#fslot) I of a relation Rel in it holds K;
  - Rel [has a kind slot in facts](#fkind_slot) at I;
  - Rel differs from `node_kind`.

> one row, not a waiver list: it names no kind and cannot go quiet on one

<a id="base_pack"></a>`base_pack` includes `p_js_kinds`.

Declared as facts: base_pack.

## THE VERDICT. A row in a pack that does not speak about the kind opens cells

> nobody in that world can answer. Where this cannot look: it cannot tell
> facts/js-X.rofl from rules/js-X.rofl; it cannot see a kind a layer's rules
> only MATCH on, since `premise_lit` has no file
> (`f_a_rule_has_no_file_and_a_fact_does`); and it says nothing about a world
> it is not loaded into, where `orphan_claim` stays the check.

In the audit:

<a id="kind_home_unbacked"></a>A pack declares without speaking of a kind K if it [declares the kind](#pack_declares) K and it neither [speaks of the kind](#pack_speaks) K nor [is the base pack](#base_pack).

> The other direction is a REPORT, not a gate: a pack speaking about a kind
> it does not declare borrows from one it is loaded beside, 118 times on the
> honest tree, and `orphan_claim[audit]` refuses the illegitimate case per
> world. The tempting third rule — a base kind some layer now speaks about
> should have moved — was written, run and deleted: every row is a legitimate
> borrow, and separating stale from borrowed needs the LOADERS.

<a id="pack_borrows"></a>A pack borrows the kind K if all of:
  - it [speaks of the kind](#pack_speaks) K;
  - `js` has the node kind K;
  - unless it [declares the kind](#pack_declares) K.


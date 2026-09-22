---
world: js-pack-home
books: audit, main
default: main
---

# js-pack-home

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

<a id="pack_fact"></a>`pack_fact`(P, Rel, Args) if `asserted_by`($fact(?Rel,main,?Args), P, something).

> the argument walk, as rules/js-vocabulary.rofl runs it over `premise_lit`:
> that file walks what the RULES MATCH, this one what the FACTS SAY

<a id="fwalk"></a>`fwalk`(P, Rel, N, Args) either:

1. if [`pack_fact`](#pack_fact)(P, Rel, Args) and N is 1;
2. if [`fwalk`](#fwalk)(P, Rel, I, $cons(?_$0,?T)) and N is +(?I,1).

<a id="fslot"></a>`fslot`(P, Rel, I, X) if [`fwalk`](#fwalk)(P, Rel, I, $cons(?A,?_$0)).

> Which positions carry a kind — DISCOVERED, not declared: a position is a
> kind position when a declared kind stands in it, so the audit configures
> itself. `node_kind` itself is excluded, or every declaration would back
> itself.

<a id="fkind_slot"></a>`fkind_slot`(Rel, I) if [`fslot`](#fslot)(something, Rel, I, X) and `node_kind`(`js`, X).

<a id="pack_declares"></a>`pack_declares`(P, K) if [`fslot`](#fslot)(P, `node_kind`, 2, K) and `node_kind`(`js`, K).

<a id="pack_speaks"></a>`pack_speaks`(P, K) if all of:
  - [`fslot`](#fslot)(P, Rel, I, K);
  - [`fkind_slot`](#fkind_slot)(Rel, I);
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

<a id="kind_home_unbacked"></a>`kind_home_unbacked`(P, K) if all of:
  - [`pack_declares`](#pack_declares)(P, K);
  - unless [`pack_speaks`](#pack_speaks)(P, K);
  - unless [`base_pack`](#base_pack)(P).

> The other direction is a REPORT, not a gate: a pack speaking about a kind
> it does not declare borrows from one it is loaded beside, 118 times on the
> honest tree, and `orphan_claim[audit]` refuses the illegitimate case per
> world. The tempting third rule — a base kind some layer now speaks about
> should have moved — was written, run and deleted: every row is a legitimate
> borrow, and separating stale from borrowed needs the LOADERS.

<a id="pack_borrows"></a>`pack_borrows`(P, K) if all of:
  - [`pack_speaks`](#pack_speaks)(P, K);
  - `node_kind`(`js`, K);
  - unless [`pack_declares`](#pack_declares)(P, K).

## Not defined in these files

- `asserted_by`, in the main
- `node_kind`, in the main


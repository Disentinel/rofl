---
world: untyped
books: main
default: main
---

# untyped

> A VARIABLE NOTHING IN ITS RULE TYPES, as a query over the reflection
> (`rofl-render --facts`) and the sentence vocabulary.
>
> A letter is not the smell; a letter that pretends to be a type is. `F` reads
> as a function to whoever wrote it, and the rule says so only when a guard
> names F (`ast_node(F, K, _, _)`, `fn_node(F)`) or a signature types the
> position F stands in. A variable with neither is typed in the author's head
> and nowhere else, and the renderer shows it as the bare letter it is.
>
> This file is authored as Markdown: it has no `.rofl` twin, the reader
> (`npm run read`) turns it into rules for the goldens and the lint, and the
> sentence of every relation is declared where the relation is first
> defined. `signed` is computed by scripts/untyped.ts from the signatures
> and phrases; `noun_guard` comes from facts/js-phrases.rofl.

## What the reflection and the vocabulary supply

Declared as facts:

- <a id="signed"></a>A relation Rel at an arity A at an index I is signed a noun N
- <a id="signed_rel"></a>A relation Rel is signed at an arity A
- <a id="nargs"></a>A rule R at a literal K carries an arity A
- <a id="arity"></a>A relation Rel is used at an arity A
- <a id="noun_guard"></a>A relation Rel wears a noun N
- <a id="head"></a>A rule R concludes a relation Rel
- <a id="lit"></a>A rule R at a literal K reads a relation Rel with a sign S
- <a id="argv"></a>A rule R at a literal K at an index I has the variable V

## The letter, the guard, the signature

> One letter, or a letter and a digit (K1).

<a id="letter"></a>A rule R has the letter V either:

1. if R at some literal at some index has the variable V, L is the length of V, and L is 1;
2. if R at some literal at some index has the variable V, L is the length of V, L is 2, C is the character 1 of V, C >= 48, and C <= 57.

> Typed by a guard: the subject of a kind guard or of a relation a noun is bound to.

<a id="guarded"></a>A rule R guards the variable V either:

1. if R at a literal K reads `ast_node` with `pos` and R at K at 0 has the variable V;
2. if a relation Rel wears some noun, R at a literal K reads Rel with `pos`, and R at K at 0 has the variable V.

> Typed by a signature: the position says what stands in it, `node` counting as the weakest word.

<a id="signed_here"></a>A rule R types the variable V as a noun N either:

1. if R at a literal K reads a relation Rel with some sign, R at K carries an arity A, R at K at an index I has the variable V, and Rel at A at I is signed N;
2. if R concludes a relation Rel, R at 0 carries an arity A, R at 0 at an index I has the variable V, and Rel at A at I is signed N.

<a id="signed_strongly"></a>A rule R types the variable V strongly if R types the variable V as N and N differs from "node".

<a id="signed_weakly"></a>A rule R types the variable V weakly if R types the variable V as some noun, unless R types the variable V strongly.

## The verdicts

<a id="untyped"></a>A rule R leaves the variable V untyped if R has the letter V, unless R guards the variable V, unless R types the variable V as some noun.

<a id="only_a_node"></a>A rule R types the variable V only as a node if R has the letter V, unless R guards the variable V, and R types the variable V weakly.

<a id="untyped_long"></a>A rule R leaves the name V untyped if R at some literal at some index has the variable V, unless R has the letter V, unless R guards the variable V, unless R types the variable V as some noun.

> By the relation the rule concludes.

<a id="untyped_in"></a>A relation Rel is concluded by a rule R leaving V untyped if R leaves the variable V untyped and R concludes Rel.

> The two kinds of finding: some relation the rule reads or concludes has no
> signature (a debt of the vocabulary), or every one has and the variable is
> still untyped (the rule's own).

`guard_rel` includes `ast_node`.

<a id="guard_rel"></a>A relation Rel is a guard relation if Rel wears some noun.

<a id="unsigned_in"></a>A rule R reads an unsigned relation either:

1. if R concludes a relation Rel, R at 0 carries an arity A, unless Rel is signed at A;
2. if R at a literal K reads a relation Rel with some sign, R at K carries an arity A, unless Rel is signed at A, unless Rel is a guard relation.

<a id="unsigned_arity"></a>A relation Rel is used unsigned at an arity A if Rel is used at A, Rel is signed at some arity, unless Rel is signed at A.

<a id="untyped_own"></a>A relation Rel is concluded by a rule R leaving V untyped on its own if Rel is concluded by R leaving V untyped, unless R reads an unsigned relation.

<a id="untyped_debt"></a>A relation Rel is concluded by a rule R leaving V untyped as the vocabulary's debt if Rel is concluded by R leaving V untyped and R reads an unsigned relation.

> One letter, many types: the nouns a letter is signed as across the model.

<a id="letter_means"></a>A letter V means a noun N if a rule R has the letter V and R types the variable V as N.

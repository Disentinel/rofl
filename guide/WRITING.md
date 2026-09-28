# Writing sentences and rules

A notebook's prose is read as a small language. This page is all of it.

## The form

- **A sentence is declared once**, where its anchor is:
  `<a id="owns"></a>A team T owns a module M`. The typed holes (`a team T`,
  `a module M`) are its arguments, in order. The anchor's id is its name.
  After that, write it with the holes filled: `T owns M`,
  `` `platform` owns `auth` ``. The type words may stay or go:
  `C touches a module M` and `C touches M` are the same sentence.
- **Facts are a list** of filled sentences, each ending in a full stop,
  under a paragraph that ends in a colon (`The repository today:`). A
  sentence that only ever holds listed facts is declared in a list under
  `Declared as facts:`.
- **A rule is `HEAD if CONDITION, CONDITION, unless CONDITION.`** Several
  ways to one conclusion are a numbered list under `either:`, each item
  starting with `if` or `unless`. That is the only nesting there is.
- **Say a sentence the same way everywhere.** Only `a` and `an` type words
  may be dropped: `guards the variable V` and `guards V` are two sentences.
- **Prose for people goes in a quote** (`>`). A plain paragraph that ends
  in a full stop is read as a sentence of the language. Headings are free.
- **Rules one to a line need no blank line between.** A long sentence may
  wrap.

## Terms

| Write | Means |
|---|---|
| `T`, `Team` | a variable: a blank to fill in |
| `` `platform` `` | a name: always in backticks |
| `"a string"`, `42` | a string, a number |
| `some team`, `something` | a blank whose value does not matter |
| `it` | the subject of the sentence before |

**Names go in backticks.** A bare word is not a term: `ben likes cat` is
not read. A variable named `A` is written typed (`an arity A`), because a
bare `A` at the start of a sentence is an article.

## A world, whole

A world is a file of facts and rules that asks nothing. This is
`~/rofl-examples/review.rofl.md`; `notebook/review.rofl.md` reads it:

<!-- BEGIN file examples/review.rofl.md -->
```markdown
# review: a world, not a notebook

> This file holds facts and rules and asks nothing, so running it prints no
> answers. `notebook/review.rofl.md` reads it and asks the questions: open
> that one.
>
> Who has to approve a change before it merges: every team that owns a
> module the change touches, unless someone on that team wrote it or has
> approved it.

## What the repository knows

Declared as facts:

- <a id="owns"></a>A team T owns a module M
- <a id="member"></a>A person P is on a team T
- <a id="touches"></a>A change C touches a module M
- <a id="author"></a>A change C is written by a person P
- <a id="approved"></a>A change C is approved by a person P

The repository today:

- `platform` owns `auth`.
- `platform` owns `storage`.
- `payments` owns `billing`.
- `ana` is on `platform`.
- `ben` is on `payments`.
- `c1` touches `billing`.
- `c1` touches `auth`.
- `c1` is written by `ana`.
- `c1` is approved by `ben`.
- `c2` touches `storage`.
- `c2` is written by `ben`.

## The rules

<a id="needs"></a>A change C needs a team T if C touches a module M and T owns M.

<a id="covered"></a>A change C is covered for a team T either:

1. if C is approved by a person P and P is on T;
2. if C is written by a person P and P is on T.

<a id="blocked"></a>A change C is blocked by a team T if C needs T, unless C is covered for T.

<a id="mergeable"></a>A change C is mergeable if C is written by some person, unless C is blocked by some team.
```
<!-- END file -->

## A new sentence in a cell

A rule whose head no sentence declares yet declares it, named after its own
words, so a cell needs no anchor. `~/rofl-examples/notebook/small.rofl.md`
does this twice:

<!-- BEGIN file examples/notebook/small.rofl.md -->
````markdown
---
model: js
code:
  - small.js
---

# Promises nobody waits for

> A notebook over `small.js` with the JS model. Run it with
> `rofl-nb small.rofl.md`.

> An async function called as a statement of its own drops its promise:
> nothing awaits it, returns it or keeps it. This is a question, not an
> invariant: `load('b')` is one such call and the answer says where it is.
> A promise kept in a variable (`const p = load('c'); return p;`) is not
> dropped and is not listed; neither is one kept and then forgotten, which
> this rule does not see.

```rofl
A call C is unawaited if C resolves to a function F, the attribute `async` of F is `true`, a node S is of kind `expression_statement` and the `expression` of S is C.

? C is unawaited
```

> No function calls itself, directly.

```rofl
A call C recurses if C resolves to a function F and F is the nearest function of C.

never C recurses
```
````
<!-- END file -->

A cell whose rule concludes one of the model's own sentences must say
`extends <name>`, so that it is on purpose.

## Sentences for what a notebook reads

A `.rofl` file a notebook `reads:` brings relations with no sentence. A
`Reads:` list gives each one, the anchor its name:

    Reads:

    - from spat:
      - <a id="uncovered"></a>A child Ch is alone on a day D at a minute S

## What the reader reports

Nothing is dropped in silence. What the reader could not read is an error
that says what to do, and the run ends with exit 2:

<!-- BEGIN file guide/examples/typo.rofl.md -->
````markdown
Declared as facts:

- <a id="likes"></a>A person P likes a pet X

Who likes what:

- `ana` likes `cat`.
- ben likes `snake`.

A person P is happy if P likes some pet and P is rich.

```rofl
? P is happy
```
````
<!-- END file -->

<!-- BEGIN run+exit guide/examples: rofl-nb typo.rofl.md -->
```
$ rofl-nb typo.rofl.md
typo.rofl.md:1: cell 0 · prose
  error: not read (list item): ben likes `snake`: ben is not a sentence word here: names go in backticks: `ben`
  error: not read: P is rich
  error: left out: A person P is happy: a condition was not read
typo.rofl.md:13: cell 1 · rofl
  typo.rofl.md:13: ? P is happy  ->  0 answers · nothing in the model can put a row here: check the name, the book and the number of arguments
typo.rofl.md: 1 question answered — not everything was read (exit 2; see rofl-nb --help)
$ echo $?
2
```
<!-- END run+exit -->

- **not read (list item)**: a fact that matches no sentence. The error says
  why; here `ben` has no backticks.
- **not read** with a sentence: no declared sentence matches it.
  `P is rich` was never declared.
- **left out**: a rule with a condition that was not read is not loaded.
- **no sentence reads this question**: an asking line in words nothing
  declares.
- **ambiguities**: a sentence that matches two declared ones. Reword one.

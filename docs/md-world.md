# Writing a world as Markdown

ROFL 1.05: a world is a Markdown file of sentences, named `X.rofl.md`, and it
loads wherever a `.rofl` file loads. The extension is the distinction: a
`.rofl.md` is executable Markdown, a plain `.md` is a document and no world.
The JS model rendered under `docs/js/` is `.rofl.md` for the same reason. This page is the writer's side; `sentence-form.md` is
where the form was measured and `roadmap.md` is what 1.05 ships and defers.

## The whole of the form

- **A relation is a sentence with typed holes, declared once**, where its
  anchor is: `<a id="owns"></a>A team T owns a module M`. The typed holes
  (`a team T`, `a module M`) are the arguments, in order. Once declared, the
  sentence is used with the holes filled: `T owns M`, `` `platform` owns `auth` ``.
- **A rule is `HEAD if CONDITION, CONDITION, unless CONDITION.`** Several
  bodies are a numbered list under `either:`, each item starting with `if`
  or `unless`. That is the only nesting there is.
- **Data is a list of ground sentences** under any paragraph that ends in a
  colon, or a `` `rel` lists: `` line followed by a Markdown table. A
  relation that only ever holds data is declared under `Declared as facts:`.
- **A term** is a variable (`T`), an atom in backticks (`` `platform` ``), a
  string in quotes, a number, `something` or `some team` for a hole that does
  not matter, and `it` for the subject of the sentence before.
- **Prose is a quote block** (`>`). A paragraph that ends in a full stop is a
  sentence of the language, so an essay goes in quotes. Headings are free.
- **A book is a block**: `In the audit:` opens the rules that write there.
- **Say a sentence the same way everywhere.** The head declares `guards the
  variable V`; a body that says `guards V` is a different sentence and is
  reported. A variable named `A` is written typed (`an arity A`), because a
  bare `A` at the start of a sentence is an article.

## A world, whole

`examples/review.rofl.md`, which the goldens load like any world:

```markdown
---
world: review
books: main
default: main
---

# review

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

What the reader makes of it, one rule per sentence:

    needs(C, T) :- touches(C, M), owns(T, M).
    covered(C, T) :- approved(C, P), member(P, T).
    covered(C, T) :- author(C, P), member(P, T).
    blocked(C, T) :- needs(C, T), not covered(C, T).
    mergeable(C) :- author(C, _), not blocked(C, _).

## Showing it

    npm run view -- examples/review.rofl.md

writes `examples/view.html`, one page with the sentences colored and every
link live; a directory gives one tab per `.rofl.md` in it. The page parses the
file with the reader's own Markdown parser, so what it shows as a list or a
table is what the reader reads as one.

## Asking it

    npm run repl -- examples/review.rofl.md

A question is a sentence of the document with a variable where the answer
goes; `why` and `whynot` take a ground one.

    rofl> ? C is blocked by T
    `c2` is blocked by `platform`  [C = c2, T = platform]
    rofl> ? `c1` needs T
    `c1` needs `payments`  [T = payments]
    `c1` needs `platform`  [T = platform]
    rofl> why `c2` is blocked by `platform`
    `c2` is blocked by `platform`  <= r754007c9 @tick 0
      `c2` needs `platform`  <= r25f18f99 @tick 0
        `c2` touches `storage` [axiom]
        `platform` owns `storage` [axiom]
      not `c2` is covered for `platform` [finite failure]
        whynot `c2` is covered for `platform`:
          rule rb96244a3: ?C is covered for ?T @now :- ?C is approved by ?P @now, ?P is on ?T @now
            failed premise: `c2` is approved by ?P#0
          rule r4c36db17: ?C is covered for ?T @now :- ?C is written by ?P @now, ?P is on ?T @now
            failed premise: `ben` is on `platform`
    rofl> whynot `c2` is mergeable
    whynot `c2` is mergeable:
      rule rb0580d29: ?C is mergeable @now :- ?C is written by something @now, not ?C is blocked by something @now
        failed premise: not `c2` is blocked by ?_$1#0 -- blocked: `c2` is blocked by `platform` holds

A question no sentence of the document reads is refused by name:
`error: no sentence in the vocabulary reads: C is owned by T`. The
positional form still works everywhere: `? blocked(C, T)`.

## What the reader reports

Loading a `.md` world prints, on stderr, everything it could not read,
because a sentence that vanishes silently is the one failure a writer
cannot debug:

    examples/x.rofl.md: not everything was read
      unparsed (3)
      FACT `a` is near `b`
      T is huge
      TABLE x | y
      dropped: A team T is big: a condition was not read

- **unparsed**: a sentence no declared sentence matches. `T is huge` is not
  `T = huge`: a bare word is not a term.
- **FACT**, **LIST**, **TABLE**: a list item or a table nothing above it
  claimed.
- **dropped**: a rule with a condition that was not read is not loaded at
  all, so the world never answers more than its sentences say.
- **used with nowhere to link**: a sentence used as a condition that is
  neither declared in the file nor listed under `Reads:`.
- **alternatives not starting with if or unless**, and **ambiguities**: a
  sentence that matches two declared sentences at once.

`npm run read -- X.md --out X.rofl` prints the same report in full and
writes the rules, so the desugared world can be read beside the sentences.

## Where it stops today

- Vocabulary is per file: a file declares every sentence it uses, or lists
  what it reads from another under `Reads:`. The JS model's vocabulary comes
  in only with a file rendered from it (`docs/js/`); `--vocab FILE` adds one.
- A string with a space in it, and a term built by a destructor, work in
  rules but not in a question at the REPL.
- Tables are Markdown tables; the map form the design asks for is an open
  decision (`sentence-form.md`).

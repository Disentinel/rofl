# Self-application: what it costs, measured

Opened 2026-09-04, from a conversation with the owner about writing ROFL's
parser in ROFL. Nothing here is shipped; every number below came from a probe
run against the live kernel, and the probes are reproduced inline so they can
be re-run.

The session began with a claim I made from memory — *a grammar cannot be
loaded by itself* — and the owner asked for the exact dependency. It was
wrong as stated, and the four walls below are what is actually there.

## The four walls

| # | wall | where | applies to a parser | applies to a macro |
|---|---|---|---|---|
| 1 | no string → atom | `STR_ARITY`, `src/reflect.ts` | yes | no |
| 2 | `conclusion_lit` is write-protected | load path | yes | yes |
| 3 | no substring by range | `evalStrOp` | yes | no |
| 4 | `reifyTerm` is not injective | `src/reflect.ts:432` | yes | partly |

Walls 1 and 3 are absences rather than decisions: a substring of a string the
program already holds has a finite image, so both `str_sub(S, I, Len)` and
`atom_of(S)` pass the criterion recorded in
`f_string_destructors_are_free_and_constructors_are_not` exactly as the five
existing destructors do. Wall 2 is a host-side veto of the same class as the
`$` ban that was lifted on 2026-09-01.

Wall 4 was found by a control that fired:

    hit(C)  :- gen(C, $lit(R, main, $cons($var("X"),   T), $now)).   -- 1 row
    miss(C) :- gen(C, $lit(R, main, $cons($var("QQQ"), T), $now)).   -- 1 row

Both matched, so neither matched a name — `unreifyTerm` had rewritten the
literal into a variable. A rule may *transport* and *construct* a reified
variable when the name arrives through the body; it may not write one as a
literal, nor match one by name.

## Ring 0 does not shrink usefully

`Rofl.fromSnapshot` already bypasses the parser, so ring 0 need not be a ROFL
parser at all. The question is how small it gets, and it was measured against
a working ring 1 — grammar as facts, tokenizer and chart parser as rules —
that parses `q(X) :- p(X), r(X, b).` into a tree.

- Surface enumerated from `src/parser.ts`: **28 features**.
- Ring 1 uses **20**; a saturation walk adds back escaping, because the
  character-class table needs `cls("\"", quote).` — **21 of 28**.
- Dropped: `$`-names, wildcards, negative literals, `* / mod`, parenthesised
  expressions, **perspectives**, **temporal markers**. The last two go
  because ring 1 parses text rather than reasoning about a world.
- Oracle, exact and free: a parser with those seven cut out gives a
  byte-identical `97848ee2e4bb3c96d3a7707e39b0c88a` over ring 1's canonical
  clauses.
- Negative control: it rejects `boot.rofl` on `$`, `js-modules.rofl` on `[`,
  `findings.rofl` on `\`, and accepts 21 of the corpus 67.
- Code: 231 → 177 lines, **54 saved, 23%**.

**The 23% is on the wrong side of the book.** Ring 0 loses 54 lines while the
host gains a promoter and the kernel gains two operations. As a way to get the
parser out of the engine, it does not pay.

What survives is the justification recorded on 2026-09-01 — a why-tree for a
parse, a `whynot` for a failure, ambiguity as a counted number — and the last
of those was *observed* on the first run rather than promised: the chart
returned a spurious `factnode` at index 14, correctly seeing `r(X, b).` as a
fact inside the rule.

## A macro layer, by contrast, is free

A term-level macro never touches text, so only wall 2 applies, and it costs one
host promoter of about twenty lines built from `unreifyLit` and `addClause`.

    closure(reaches, edge).          -- the whole user program

    ?- reaches(X, Y)  ->  a→b | a→c | a→d | b→c | b→d | c→d

    why reaches(a, d):
      reaches[main](a,d)  <= ra025e2f9
        reaches[main](a,c)  <= ra025e2f9
          reaches[main](a,b)  <= r537887ae
            edge[main](a,b) [axiom]

The why-tree walks the generated rules: the macro is not opaque, and every
existing audit applies to a generated rule for free because a generated rule is
an ordinary row of reflection.

Open: **provenance** — the installed rule's trail names `ra025e2f9` with no
link back to the declaration that produced it; and **hygiene** —
`vars("X", "Y", "Z")` is a manual gensym, and two nested sugars will capture
each other.

### It is not syntactic sugar, and calling it that was the error

`closure(reaches, edge).` is an ordinary fact. Nothing about the grammar
changed. Measured against the real parser afterwards, the free category is
anything expressible as a **term**:

| accepted today | refused today |
|---|---|
| `closure(reaches, edge).` | `reaches := edge+.` |
| `define(reaches, transitive_of(edge)).` | `reaches <- edge, edge.` |
| `project(r, cols(a, b, c)).` | `edge(X, *, Z)` |
| `macro("reaches := edge+").` | `group { … }`, `p :- q ; r.` |

So the free category is new **vocabulary**, not new syntax — wide only because
ROFL's surface is thin, which is the Lisp bargain and not a property of this
design. The join is the last row of the left column: a string is a legal term,
so arbitrary surface syntax travels inside one with no parser change, and the
thing that reads it is ring 1 — at which point the cost is exactly `str_sub`
and `atom_of`.

## What the owner's notation exposed

Asked for an example of why sugar is wanted, the owner wrote testimony:

    [alice]
    * bob is jerk
    * alice delivered pizza yesterday at 20:00

Today a perspective is a bracket on **every literal**, which says the book is a
property of each statement. It is a property of the **source** — a witness, a
document, a session. The block form is not brevity; the current notation
misplaces where the perspective lives.

Then the sharper version, separating author from book:

    @alice
    [tells]   * bob is a jerk
    [thinks]  * bob is cute

The model already holds half of this: `authority(tells, alice).` and
`authority(thinks, alice).` both load, and `isa[B](bob, W)` returns
`tells/jerk` beside `thinks/cute`. A nested proposition rides along as a term.

What does not hold is the namespace. A book is a flat atom carrying no owner,
so two authors granted `tells` share **one** book and nothing says whose
statement is whose. The repair is blocked in both directions: a compound
perspective `isa[tells(alice)](…)` is refused by the parser (`expected ']',
got '('`), and the flattened `alice_tells` is accepted but cannot be
*generated*, because building it is concatenation.

The way out that fits this repository's own shape is a **host emitter**: rules
emit `book_of(alice, tells)`, the promoter mints the atom, the audit counts the
loan, and the kernel does not grow. The better answer on the merits — a
perspective as a compound term — is deeper than the parser, because the store
keys a perspective by string.

This also gives `f_naming_yourself_is_itself_a_forgery` a reading it did not
have: when the book is `tells` and the author is `alice`, the self-signature on
the preamble disappears, because author and book have stopped being one name.

## Two process notes, both paid for here

**A demo without a *before* is not a measurement.** The first sugar run used
`flow` and `flows_to`, both already defined in `boot.rofl`, so the closure was
computed by boot's rules and the demo would have been reported as a success
while proving nothing. What caught it was the negative control being
*implausible* — `before promotion: 1 rows`, when the whole point was 0 — and
not a test and not reading the output.

**A working demo answers the question it answers, not the one that was asked.**
I built the macro, priced it, and called it sugar throughout; the tell was one
grep away and I never ran it. The question that would have settled it before
the first line of code: **which token is new?**

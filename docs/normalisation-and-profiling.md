# Where a fact per PART carries something true of the WHOLE

Written 2026-09-09. Every number below was measured on 16 real files of
`eslint/lib` — 43 078 base AST facts — and the questions were asked of the data
rather than of the schema.

## The question, and the name it already has

The owner's question was: where else do we store a fact per part that could be
one fact about the whole?

The activity has an established name — **data profiling**: computing metadata
about the data itself rather than about the domain. The specific thing being
looked for is a **functional dependency**, `X → Y`, which holds when no two rows
agreeing on `X` disagree on `Y`. Finding them in an instance is **functional
dependency discovery**; removing them by moving the determined column into a
relation keyed by its determinant is **normalisation**, and putting it back on
purpose is **denormalisation**.

**The distinction that matters most has a name too.** A dependency that holds in
the data at hand is DISCOVERED; one that holds by construction is DECLARED. The
gap between them is not our caution, it is the standard gap, and it decides who
gets to act on a finding — see "who collapses" below.

## What a plain count cannot tell you

A census of "rows against distinct values" ranks the AST relations like this,
in bytes of canonical text:

| relation | position | rows | distinct | redundant |
|---|---|---|---|---|
| `ast_node` | 2 = File | 14 678 | **16** | 387 353 |
| `ast_node` | 1 = Kind | 14 678 | 64 | 200 435 |
| `asserted_by` | 1 = Who | 41 721 | **2** | 166 894 |
| `ast_child` | 1 = Field | 14 662 | 33 | 93 343 |
| `asserted_by` | 2 = Tick | 41 721 | **1** | 41 720 |

**And it is wrong about half of them.** `Kind` and `Field` draw from a small
alphabet and every row genuinely says something; no fact about a whole could
replace them. `File`, `Who` and `Tick` are functions of the group the row
belongs to. A count of distinct values cannot separate the two, and reading the
table as a to-do list would delete real data.

**The grouping separates them, and it is one pass.** Ask instead whether the
column is CONSTANT WITHIN THE GROUP the row already belongs to — for AST facts,
the volume, which `scanners/js_ast.ts` mints into every id as
`n<sha256(path)[0..8]>_`:

    ast_node|2  (File)   YES — one fact about the whole would do
    ast_node|1  (Kind)   NO  — varies inside a single file
    ast_child|1 (Field)  NO  — varies inside a single file
    ast_file|0, |1       YES — but vacuously; see below

## The rule, and why it needs two clauses

```rofl
-- 1. NOBODY DISAGREES. "Constant" cannot be said any other way: a positive
--    rule would have to enumerate, and only a negation over a witness of
--    violation can say NONE and stay checkable.
fd_holds(R, P, G) :- column(R, P), grouped(R, G), not disagrees(R, P, G).

-- 2. THE GROUP MUST ACTUALLY GROUP: two distinct facts inside one of them.
grouped(R, G) :- in_group(F1, G), in_group(F2, G),
                 rel_of(F1, R), rel_of(F2, R), F1 != F2.
```

**The second clause is not tidiness.** Without it the measurement above reports
`ast_file|0` and `ast_file|1` as collapsible — and they are, vacuously, because
`ast_file` has exactly one row per volume. A relation whose groups are all
singletons satisfies every functional dependency and none of them means
anything.

**We get the cheap case of an expensive problem.** General FD discovery searches
subsets of columns for a determinant and is exponential in the width of the
relation. Here the determinant is GIVEN — the volume, minted by the scanner and
readable off the key — so the pass is a single walk of the store.

## Two tiers, and the second is a deletion

- **COLLAPSIBLE** — the column could be replaced by a fact about the whole.
  That is a migration: something must be written that is not there yet.
- **ALREADY DENORMALISED** — the fact about the whole EXISTS, and the column
  duplicates it. That is a deletion.

`ast_node.File` is the second tier. `ast_file[code](RootId, File)` is already
in the vocabulary, one row per file, and the column repeats it 14 678 times.
Stated precisely: **the schema is already normalised and the scanner is
denormalising it on emit.**

## Two other profiling categories, and both found something

**UNIQUE COLUMN COMBINATIONS** — does a column identify its row?

    ast_node|0   unique over 14 678 rows — the key, as expected
    ast_child|3  unique over 14 662 rows — EVERY NODE HAS AT MOST ONE PARENT
    ast_file|0   unique over 16 rows
    ast_file|1   unique over 16 rows

The second is a real discovery about the shape of the data: `ast_child(Parent,
Field, Index, Child)` is keyed by its LAST argument, not its first. It is a
function from child to (parent, field, position) — the tree stored child-wise —
and nothing in the vocabulary said so.

**INCLUSION DEPENDENCIES** — is every value of `R.A` a value of `S.B`? This is
the foreign key, and it is the integrity check nothing here was making:

    ast_child|0 -> ast_node|0   7 141 values, 0 dangling
    ast_child|3 -> ast_node|0  14 662 values, 0 dangling
    ast_attr|0  -> ast_node|0  10 513 values, 0 dangling
    ast_file|0  -> ast_node|0      16 values, 0 dangling

Four clean foreign keys over 14 678 nodes. And the counts close on their own:
**14 678 nodes minus 14 662 children is 16, which is the number of files, which
is the number of roots.** An arithmetic invariant across three relations that no
rule states and nothing was checking.

## Who collapses, and who only reports

**The analysis REPORTS. The scanner COLLAPSES. A person decides between them.**

The reason is the discovered/declared gap and not caution. "Constant within its
volume across these sixteen files" is not "constant by construction"; a
seventeenth file may disagree. The pass finds a CANDIDATE, and only the author
of the scanner knows whether it is a law about the domain or an accident of the
corpus. This is the same phrasing `boot.rofl` already uses for `widened[audit]`
— empty over nineteen worlds, and deliberately called a report rather than a
guarantee.

**Collapsing at load time or at cool time would be worse than useless.** If the
scanner emits `ast_node(Id, Kind, File, Line)` and the engine quietly stores
arity 3, then `canonicalState` stops describing the program, both engines must
agree on the trick, and a rule reading position 2 breaks. That is a semantic
change made by an optimiser, which is the class this repository refuses
everywhere else.

It also belongs to the scanner by the argument already made for volumes in
`docs/volumes-and-residency.md`: only the scanner knows what a unit of source
is, and by the same token only the scanner knows that a path is a property of
the file rather than of the node.

## It is opt-in from birth, and that is a paid-for lesson

This pass reads EVERY FACT. That is the exact shape of `forged[audit]`, which
led with `asserted_by` unbound and cost one hundred per cent of the evaluation
of an AST index until it was moved out of the kernel on 2026-09-09
(`f_four_rules_that_never_fire_are_the_entire_cost_of_an_index`).

So the profile is a pack a world loads when it wants to be profiled — not a
thing added to the kernel and moved out later once somebody measures it. The
sequence is known; there is no reason to walk it a second time.

## What this does not cover

Only one grouping is implemented: the volume. The same rule accepts any
grouping the host can name — the book, the tick, the rule that concluded a fact
— and each would find a different family. None of those has been measured, and
this document does not claim they would find anything.

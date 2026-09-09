# Normalisation: when a fact per PART carries something true of the WHOLE

A model grows by adding facts. It gets *cheap* by noticing that some of those
facts are one fact repeated. This is how you find them, and — more importantly
— how you avoid deleting real data while trying.

## The names, so you can look them up

- **Data profiling** — computing metadata about the DATA rather than the domain.
- **Functional dependency** `X → Y` — no two rows agreeing on `X` disagree on
  `Y`. What you are hunting.
- **Normalisation** — moving a determined column into a relation keyed by its
  determinant. **Denormalisation** — putting it back on purpose.
- **Discovered vs declared** — a dependency that holds IN THE DATA AT HAND,
  versus one that holds BY CONSTRUCTION. The whole discipline below hangs on
  keeping these apart.

## Do not read a count of distinct values as a to-do list

The tempting measurement is rows against distinct values: a column with 14 678
rows and 16 distinct values looks redundant. Measured on real AST facts, that
ranking puts a genuinely redundant column and a genuinely necessary one within
a factor of two of each other:

    ast_node|2  (File)   14 678 rows, 16 distinct   <- redundant
    ast_node|1  (Kind)   14 678 rows, 64 distinct   <- NOT redundant

`Kind` draws from a small alphabet and every row says something of its own.
Deleting it because it "repeats" destroys the model.

## Ask instead whether it is constant WITHIN ITS GROUP

The question that separates them is not how many distinct values there are, but
whether the value is a FUNCTION of a group the row already belongs to:

    ast_node|2  (File)   constant within a file  -> one fact about the whole
    ast_node|1  (Kind)   varies within a file    -> a real per-part value

Write it as a rule, in two clauses:

```rofl
-- 1. NOBODY DISAGREES. Only a negation over a witness of violation can say
--    NONE and stay checkable; a positive rule would have to enumerate.
fd_holds(R, P, G) :- column(R, P), grouped(R, G), not disagrees(R, P, G).

-- 2. THE GROUP MUST ACTUALLY GROUP: two distinct facts inside one of them.
grouped(R, G) :- in_group(F1, G), in_group(F2, G),
                 rel_of(F1, R), rel_of(F2, R), F1 != F2.
```

**The second clause is load-bearing.** Without it, a relation with one row per
group satisfies every dependency vacuously and is reported as collapsible.
Measured: `ast_file` has exactly one row per file and shows up beside the real
finding, meaning nothing.

## Two tiers. The second is free

- **COLLAPSIBLE** — the column *could* become a fact about the whole. A
  migration: something has to be written that is not there yet.
- **ALREADY DENORMALISED** — the fact about the whole EXISTS and the column
  duplicates it. A deletion.

The real case found in this repository was the second: `ast_file(RootId, File)`
was already in the vocabulary, one row per file, while `ast_node(Id, Kind, File,
Line)` repeated the path on all 14 678 nodes. **The schema was already
normalised and the scanner was denormalising it on emit.** Look for that shape
first — it costs nothing to fix and nothing to decide.

## Two more profiling questions, both cheap, both found something

- **Unique column combinations** — does a column identify its row? Asking it of
  `ast_child(Parent, Field, Index, Child)` found that CHILD is unique: every
  node has at most one parent, so the relation is keyed by its LAST argument.
  Nothing in the vocabulary said so.
- **Inclusion dependencies** — is every value of `R.A` a value of `S.B`? That is
  a foreign key, and it is an integrity check most models never make. Four of
  them came back with zero dangling references over 14 678 nodes.

Both are one pass over the data and neither needs a schema.

## Who is allowed to collapse

**The analysis REPORTS. The scanner COLLAPSES. A person decides between them.**

Not caution — the discovered/declared gap. "Constant across these sixteen
files" is not "constant by construction", and the seventeenth file may
disagree. Only whoever wrote the scanner knows whether a dependency is a law
about the domain or an accident of the corpus.

**Never collapse inside the engine.** If the scanner emits four arguments and
the engine quietly stores three, the state stops describing the program and any
rule reading that position breaks. A semantic change made by an optimiser is
the one thing an engine must not do.

## Make it opt-in before you make it

A profiling pass reads EVERY FACT, which is the same shape as an audit that
leads with an unbound premise. In this repository that shape — four rules that
had never fired on any world — cost one hundred per cent of the evaluation of
an AST index until it was moved out of the kernel.

So a profile is a pack a world loads when it wants to be profiled. Not
something added to the kernel and moved out later once somebody measures it:
the sequence is known, and there is no reason to walk it twice.

## The full working, with numbers

`docs/normalisation-and-profiling.md` in the ROFL repository, measured on 16
real files of `eslint/lib`.

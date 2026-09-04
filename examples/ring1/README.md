# ring1 — the ROFL front end, written in ROFL

`ring1.rofl` tokenizes and parses ROFL source with rules. `demo.ts` is the host
side, and its size is the measurement: it hands the source in as one fact,
reads the parse trees back, and **resolves ranges to text**.

That last job is the declared loan. A token here is a **pair of indices** and
never text, because the kernel has no substring-by-range destructor and
lengthening a string is concatenation, which the finiteness proof forbids. The
rules decide *where* every name is; the host reads *what* it says. That
boundary is why none of this needed a kernel change.

## Where it stands, measured

Over the 23 `.rofl` files at or under 2.5 KiB, compared against `src/parser.ts`
as canonical clauses:

| outcome | count |
|---|---|
| **identical to the host parser** | **23** |
| refused, with the offset named | 0 |
| silently divergent | 0 |

**All of them.** The test in CI sweeps a smaller set — files at or under 1200
bytes, 10 of 10 identical — because the cost per file grows with the file:
measured 2026-09-04, 7.1 s at 900 B, 14.5 s at 1200 B, 30.9 s at 1600 B and
72.7 s at 2500 B, against a whole suite of about 117 s. Raise `SWEEP_CAP` in
`test/example-ring1.test.ts` to reproduce the 2.5 KiB number.

The silent count is pinned at a **ceiling of zero**, because that is the only
category where ring 1 returns a *different program* without saying so.

Covered: comments, facts, rules, `not`, perspective brackets holding an atom
**or a variable**, temporal markers, builtins and arithmetic with precedence
and parentheses, compound terms, clause-local wildcards, and string literals
with C-style escapes.

**Not covered, on purpose: a negative integer literal.** `X - 1` and `X, -1`
are genuinely ambiguous; the host resolves them by parsing greedily from the
left, and a chart reports both. Matching that needs its own pass, and refusing
loudly is the right interim answer — it also keeps the "refused and located"
gate alive with a real subject rather than a planted one.

## The five silent divergences were one host bug

All five were wildcards, and the fix was in `src/parser.ts`, not here. The host
numbers `_` per clause — `_$0`, `_$1` — so two underscores in one clause are two
different variables; read as an ordinary variable named `_` they merge, which
adds a join the author never wrote. Ring 1 numbering them 0, 1, 2 then still
disagreed, because **the host was numbering them 1, 3, 5**: a positive body
literal is parsed twice (once as an expression, then rewound and parsed as a
literal), and the rewind restored `pos` but not `freshCounter`. A variable's
name was therefore a function of how often the parser backtracked over it
rather than of the program — and `ruleIdOf` is a content hash over the
canonical clause *including variable names*.

A chart parser has no backtracking, which is why it could see this and the
host could not. This is the "divergences on cases the author never held in
mind" that a second independent implementation was predicted to buy.

## Three silent-empty modes, each found by walking into it

A front end that returns a **prefix** and calls it a file is the failure this
example exists to refuse. Three separate ways to do that turned up, and none
was a grammar bug:

1. **The walk stops mid-file.** The top-level chain goes clause to clause, so
   the first uncovered construct ends it and every later clause never appears.
   `examples/counter.rofl` gave 0 clauses against the host's 3, with no error.
   Caught by `stuck_at`, which names the offset.
2. **The walk never starts.** When the *first* clause fails there is nothing
   for the chain to stand on, so `stuck_at` is empty too. Caught by `covered`
   / `uncovered`: every token must lie inside some accepted clause.
3. **The evaluation does not finish.** `nexttok` was written as `follows` over
   all pairs plus `blocked` over all triples — cubic in tokens. On
   `rules/strata.rofl` (123 tokens, 2.2 KiB) it hit the space wall, and every
   relation downstream came back empty: zero clauses, zero stuck, zero
   uncovered, and a green-looking answer from an evaluation that never ran.
   Caught by checking `evaluate().partial` and `hole`. Fixed by walking
   forward one character at a time, which is linear per token; tokens on that
   file went from a truncated 123 to a complete 218.

## Two things about the language, measured here

**A ROFL escape means "take the next character literally".** So `"\n"` is the
LETTER n, and there is no escape that produces a line feed — a newline in a
string literal is written as itself. This silently made `cls(n, nl)` true and
ended every comment at the first `n` inside it. `JSON.stringify` is therefore
the wrong escaper for ROFL source; `roflStr` in `demo.ts` is the right one.

**`scripts/text_check.ts` allows TAB and LF but reports a lone CR**, so the
character-class table carries exactly one literal control character — the line
feed — and everything unclassified is simply not a token character, which is
what spaces, tabs and carriage returns need.

## Running it

    node --test --test-reporter=spec test/example-ring1.test.ts

## Two more defects found by building the grammar out

**A quote inside a comment opened a string.** The first lexer paired quotes
across the whole file and found comments separately — a chicken and egg, since
a comment is only a comment outside a string and a string only starts outside a
comment. Two corpus files carry a quoted phrase in prose and both were refused
at the comment rather than at anything real. The fix is what a hand-written
lexer does: one left-to-right walk carrying a state (`code`, `str`, `esc`,
`cmt`), which is positive recursion with the character tests as its only
negation.

**The first dash of a comment is still in `code`.** So `--` produced a spurious
minus token and *all 23 files* were refused — after eight hand-written cases
had all passed. A test set that only grows by hand is blind to exactly this:
the failure needed a real file with a comment in it, and every one of them has
one.

## Two shapes worth naming

**A keyword operator spans its whole word.** `nexttok` is keyed on a token's
*end*, so returning the *start* of `is`, `mod`, `init`, `now` or `next` leaves
the next lookup with no boundary to stand on, and the clause silently fails to
form. Three separate rules had it.

**The literal is built from parts.** Three kinds of book times two tenses would
be six near-copies of one rule; `relbook` and `lit0` factor them so each
decision is written once.

## The image

Ring 1 compiled ahead of time. `image()` builds it; `fromImage()` restores it.

| | |
|---|---|
| size | 702 KiB |
| load from source | 50.5 ms |
| restore the image | 12.3 ms |
| **ratio** | **4.1×** |

**It is deliberately not committed.** An image moves the thing a reviewer reads
from a `.rofl` file to 700 KiB of JSON nobody opens, and that class is already
recorded here — so it stays a *cache* built on demand, and committing one is a
separate decision that needs the gate below standing first.

### What cutting ring 0 without an image would do

Measured, with the 60-line terms-and-facts reader:

| file | facts | rules | reduced ring 0 |
|---|---|---|---|
| `charclass.rofl` | 83 | 0 | **loads** |
| `ring1.rofl` | 7 | 126 | refused at the first `:-` |
| `boot.rofl` | 7 | 21 | refused at the first `:-` |

The data survives and every rule dies — `boot.rofl` included, so the system does
not degrade, it does not start. Hand-encoding those rules as reflection rows
instead would be **827 rows**: 104 for `boot.rofl` and 723 for the grammar, each
`conclusion_lit` carrying a nested `$lit`/`$cons`/`$var` term. That number is the
price of not having an image, and it is why the image comes first.

### The gate compares content, not bytes

Rebuild and compare — but **not on raw bytes**, and the reason was measured
rather than assumed. Loading the same three files in a different order leaves
`facts`, `wits`, `firings`, `tickLog` and `tick` byte-identical and changes one
section: `evals`, which logs *how* the image was built rather than what is in
it. `canonicalState()` agrees across both orders. A gate on raw bytes would go
red on a reordered list, and a gate red on an honest checkout gets switched off.

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
| identical to the host parser | 8 |
| refused, with the offset named | 10 |
| **silently divergent** | **5** |

Covered: comments, facts, rules, `not`, perspective brackets, and terms that
are atoms, variables, integers or strings. Not covered: builtins and
arithmetic, temporal markers, compound terms, wildcards as distinct from
variables. The five silent divergences are the next thing to fix — they are
the only category where ring 1 returns a *different program* without saying so.

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

# The complexity objection found a real bug

## What was said

A reader of the wiring README — an engineer with no stake in the project —
made two objections in the same breath:

1. Rules like these "scream NP-complete or worse", and the README says nothing
   about complexity, so what is the sane ceiling on rule count and codebase
   size?
2. Once you have written the parsers, why keep the logic layer at all? Write
   the rule as a function in the same language, in the same file. Better
   messages, clearer code, no exotica.

The second objection is the interesting one and is answered below. The first
one deserved a number, and the attempt to produce that number found a genuine
defect.

## The measurement

The claim I would have made from theory is correct and was worth nothing on
its own. This is Datalog, not Prolog. There is no search and no backtracking:
evaluation is a bottom-up seminaive fixpoint, every rule is a join, and the
loop halts when a round derives nothing new. Data complexity is PTIME; the
rule count is linear; only a single rule's own variable count sits in an
exponent.

So I generated a wiring corpus — the `examples/wiring` fixture replicated *n*
times — and ran the real 17 rules over it:

| services | facts | fixpoint |
|---|---|---|
| 100 | 800 | 0.27 s |
| 500 | 4,000 | 3.98 s |
| 2,000 | 16,000 | 71.2 s |

Five times the facts, fifteen times the time. That is quadratic, and no amount
of correct theory makes it linear. The semantics were PTIME; **the
implementation was not**.

## The defect

Two places, both in the join path:

- `matchPremise` took the candidate facts for a premise by scanning the entire
  relation and unifying each fact, once per partial solution. A join of two
  *n*-sized relations therefore cost *n²* unifications, whatever the join key
  said.
- Worse, and less obvious: in seminaive mode a premise matched against the
  *front* (the previous round's delta) rebuilt that front — spread the set,
  sort it, look every key up in the store — **once per partial solution**, so
  the delta optimization was itself quadratic in the delta.

The fixes are unremarkable and belong in any Datalog engine:

- `Store` maintains an argument index: `(relation, position, value) → keys`,
  maintained on every add and remove, and a relation holding a non-ground
  argument is marked unservable so the index is never half-right. `argMatch`
  returns candidates or `null`, never a partial answer.
- `Evaluation.indexed` picks, among the premise's arguments that the partial
  substitution has already bound, the *narrowest* bucket — the standard "most
  selective join key" choice, at O(1) per candidate position.
- The front is materialized once per front per relation and cached
  (`frontSlice`), and when the premise has a bound argument the index answers
  first and the front only filters.

Same corpus, after:

| services | facts | before | after |
|---|---|---|---|
| 250 | 2,000 | 1.02 s | 0.17 s |
| 1,000 | 8,000 | 16.4 s | 0.71 s |
| 2,000 | 16,000 | 71.2 s | 1.66 s |
| 8,000 | 64,000 | (≈ 20 min extrapolated) | 9.2 s |

Cost per fact is now flat at ~90–110 µs from 2K to 32K facts: linear in the
fact base, as the theory said all along. The repository's own test suite went
from 62 s to 20 s as a side effect, which is the clearest sign of how much of
the engine's time was going into rescanning relations.

`bench/scale.ts` (`npm run bench:scale`) keeps all three sweeps — facts,
rules, recursion — reproducible, and `test/store-index.test.ts` pins the index
against a full scan on every relation, position and value, plus the cases
where an index quietly goes wrong: retraction leaving a stale key, two
perspectives sharing a value, a non-ground argument, structured terms, and a
self-join on a repeated variable. An incomplete index does not crash; it
returns a clean, wrong fixpoint. That is exactly the failure a mutation-style
test has to catch.

## Why not just write the rule in TypeScript

The objection is right about the case it names. One check, over one parsed
source, with no need to cross-reference anything: write the function, put it in
CI, do not add a language. ROFL has nothing to offer there and pretending
otherwise is how logic programming earned its reputation.

What changes the arithmetic is the second axis. Writing the check imperatively
couples *M* rules to *N* sources: every new invariant reopens the parsers to
expose whatever state it needs, and each script re-implements the same joins
over the same files. Facts factor that: extractors are written once per source
and never again, rules join across all of them. In `examples/wiring`, five
dialects — Node, Go, an opaque Rust binary, k8s manifests, nginx, a DNS zone —
are joined by ~40 lines of rules that do not mention any of them. Adding a
language is an extractor and zero rule changes; adding an invariant is one
line and zero extractor changes. The imperative version of the same demo is
one file per rule, each of which has to re-walk five file formats.

Three other things come out of the substrate rather than being written:

- **Why-traces.** The break message is derived, not authored. A hand-written
  message is better for one check; when a break is five joins deep across five
  files, "which file do I blame" is exactly the question a derivation tree
  answers and a string literal does not.
- **Incrementality.** Change one file, re-extract that file, re-reach
  fixpoint. A script re-parses the world on every run.
- **A writable surface for agents.** A one-line rule against a closed
  vocabulary is something a model can add and a human can review at a glance;
  a two-hundred-line imperative checker is a code review. This matters when
  the intended author of most rules is not a person.

The crossover is not subtle and there is no reason to be coy about it: below
roughly three sources and ten rules, the single imperative file wins. Above
it, the N×M coupling is what you are paying, and it is paid in the place
nobody measures — every time someone needs a new check and finds the parser
does not expose the field.

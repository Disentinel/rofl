# What the Rust engine has to expose before anyone else can use it

Written 2026-09-09 as a design, not an implementation. Every constraint below
is a measurement made on this branch, and the point of writing them down first
is that a surface designed without them will hide exactly the things a caller
needs to see.

**IMPLEMENTED 2026-09-09** in `rust/rofl/src/session.rs`, gated by
`rust/rofl/tests/session.rs` (6 tests, green). What the gate found on its first
run is the reason it exists: the design above says "`ask(query)`" without ever
writing a query down, and the first implementation invented `rel@book(args)`
for a language whose book is `rel[book](args)` and whose `@` is the TENSE. A
surface designed on paper will get the paper right and the syntax wrong.

## What existed when this was written

```rust
pub fn load(json: &str, budget: i64) -> Result<Loaded, String>
pub fn describe(e: &Halt) -> String
pub mod dense; pub mod engine; pub mod reflect; pub mod seed; pub mod store; pub mod term;
```

One binary, `rofl-eval`, which reads a seed and prints the state to stdout.

**So the port was not an engine, it was an accelerator.** Its only input was a
snapshot the TypeScript kernel produced; there was no parser, no incremental
assert, no query entry point and no way to advance a tick from a program. What
could be offered was the PAIR, and the pair had no documented interface.

Four of those five are now closed — parser, assert, ask, tick — and the fifth
is named at the end of this document. The rest of the page is left as it was
written, because the measurements are what shaped the answer and a design read
back with its constraints removed is just an opinion.

## Five measurements that constrain the design

**1. A question's cost is a property of the question, not of the corpus.** Over
a 128-file world of 5 676 864 facts, after the fixpoint: a point with its key
bound is 5.5 ms, a bound prefix 8.6 ms, a large relation scanned 72 ms, and the
largest — 1 093 150 rows — **12 469 ms**. Three orders of magnitude.

*So the surface must make the difference visible to the caller.* One `query`
that sometimes returns in five milliseconds and sometimes in twelve seconds is
a trap. Either the shape of the ask is part of the type, or the result carries
what it cost and what it scanned.

**2. Starting is 383 ms and forking is 3 ms.** The core — the packs, no source
— is 20 630 facts and 383 ms to build; `fork` of a built core is 3 ms, a
hundred and twenty-eight times cheaper. Rebuilding per unit of work is what
made 64 volumes cost 5.87x a single world of the same files.

*So `fork` belongs on the surface*, not only in the host. A session is a forked
core, and that has to be the cheap and obvious path rather than an optimisation
a caller discovers.

**3. A volume may be lifted at a tick boundary and nowhere else.** The engine
freezes what `not p` is judged against for the duration of a round, so a
mid-round lift answers some negations against a world without the volume and
others against a world with it.

*So loading is an operation on the tick boundary*, and the surface must not
offer a "load more data" call that can be issued mid-evaluation. This is a
statement about what the program MEANS; see `docs/volumes-and-residency.md`.

**4. Exhaustion is a FACT, and the two kinds demand opposite repairs.** A
budget or space wall emits a `hole` into the store, so the unfinished part
names itself and can be queried. `space_exhausted` and `budget_exhausted` are
separate atoms because one wants more room and the other more steps.

*So a partial answer is not an error.* The surface must return the answer AND
the holes, never an exception that discards the work done. The TypeScript side
already models this: `evaluate` returns `{ partial, peakRows, space }`.

**5. Rows are not facts, and the wall is counted in rows.** `DEFAULT_SPACE` is
500 000 rows; measured on the JS model the ratio is 0.507 rows per fact and on
a control-flow world 0.614.

*So whatever reports the margin must say which unit it is in.* A caller reading
a row wall against a fact count is a category error, and it has already been
made once here.

## The shape this suggests, and the shape that was built

Small, and the smallness is the point — five verbs.

- **`open(packs) -> Session`** — build the core once. Expensive, once per
  process.
- **`Session::fork() -> Session`** — cheap, per unit of work. The normal way to
  get a world.
- **`Session::assert(facts)`** — add base facts. Legal between ticks.
- **`Session::evaluate(budget) -> Outcome`** — where `Outcome` carries
  `partial`, the holes, `peak_rows` and `space`, so the caller learns the margin
  without hitting the wall.
- **`Session::ask(query) -> Answer`** — where `Answer` carries the rows AND what
  the ask cost, so measurement 1 is visible rather than hidden.

Plus `tick()` for the boundary, since that is where a volume may be lifted.

**Deliberately NOT on the surface**: anything that lets a caller mutate the
world mid-evaluation, and any `query` that hides whether it probed an index or
scanned a relation.

### What changed between the design and the code

- **`ask` takes ROFL, not a query type.** `ask("kind[js](F, _)")` — the source
  language IS the query language, which is the point of having a parser in the
  crate at all. A caller who can write a rule can write a question, there is no
  second syntax to keep in step with the first, and a syntax change reaches the
  query surface for free. `_` and a named variable are both columns; a repeated
  variable constrains, exactly as it does in a body.
- **Measurement 3 is honoured by CONSTRUCTION, not by a guard.** The design
  says `assert` must refuse mid-evaluation. There is no mid-evaluation to
  refuse from: `evaluate()` is one call that reaches the fixpoint or halts at a
  wall, and `assert` only marks the store dirty, so what it adds is first judged
  by the next WHOLE evaluation. A guard would have been a check against a state
  the surface cannot reach; the absence of a verb is the stronger statement.
- **`Answer` carries `scanned` and `probed`, and the gate holds them to
  something.** `scanned` is the candidate superset the store handed back —
  the number that separates 5.5 ms from 12 469 ms — and `probed` says whether an
  index served the ask or the relation was walked. The gate asserts that a
  wholly-unbound ask NEVER probes (it has no bound position to probe with) and
  that a bound ask sometimes scans less than its whole relation. Without the
  second assertion the cost fields would be decoration.
- **A tick is `tick()` N times and nothing else.** The gate mirrors the corpus
  generator rather than calling `evaluate()` beside it — calling both re-derives
  a layer the tick already has and re-dates every witness, which is the harness
  defect recorded at the top of `rust/rofl/src/bin/rofl_eval.rs`.

### What the gate compares against

Not itself. `evaluate` is diffed against `<name>.expected.txt` on all 34 corpus
cases, so the session path is provably the harness path. `fork` is judged in
BOTH directions — two forks of one core must evaluate identically, and a fact
asserted into one must be invisible to the other — because sharing everything
passes the first test and sharing nothing passes the second. `ask` is counted
against a census taken straight off the store, over every (relation, book,
arity) in every case: two counts from two pieces of code that must agree.

### The sixth verb, and the one that ends the pair

**`Session::load(text, who)`** — `rust/rofl/src/program.rs`, added the same day.
`open(packs)` meant `open(seed)` until it existed, so the port could not be
handed to anyone without also handing them the TypeScript kernel that makes
seeds. `Session::fresh()` + `load` builds a world out of `.rofl` text.

The oracle is the LIVE KERNEL, not a file: for every world the corpus generator
can build, `new Rofl(); load(boot); load(files); evaluate()` runs in TypeScript
and the same text is loaded in Rust, and the two `canonicalState`s are compared
byte for byte. That checks far more than the parse — the same facts, the same
provenance, the same `asserted_by` tick, the same `edb` registrations, the same
`authority` rows, the same encoded rules.

A load is not "parse and insert", and the door is the half that matters: the
kernel claim, the `$` ring in both slots, arity (a CRASH gate on the JS side,
not tidiness — the readers destructure positionally), orderability, and the
refusal to let a program grant authority to a `$` principal. A forgery is
deliberately NOT refused: it is audited, because `forged[audit]` has to be
plantable or it can never be shown to fire.

## The input question, and how it was settled

The port had no parser. It has one now: `rust/rofl/src/rofl_parse.rs`, written
by hand, identical to `src/parser.ts` on 65 of 66 files with 0 differing and 0
refused.

The route there is worth keeping, because the obvious answer was tried first
and lost. `examples/ring1` parses ROFL with RULES, is 41 of 41 identical to
`src/parser.ts` over 267 KiB with 0 refused, and costs **9 758x** the host
parser with the ratio FLAT in size — so interpreting the tower in production is
out by four orders of magnitude. Generating a Rust parser from those rules was
the next answer, and the generated tokenizer was correct and **700x too slow**;
a hand-written one was 260x faster than it. The owner's decision, 2026-09-09:
**hand-written parser, ring1 kept as the ORACLE.**

That keeps what the tower was built for. A syntax change is still a change to
the RULES first — ring1 defines every production, each one is quoted above the
Rust that implements it, and `test/rofl-parse.test.ts` renders BOTH trees into
one s-expression so a divergence cannot be silent. The syntax is not back in
the code; the code is held to the syntax.

`open(packs)` above still means `open(seed)`. Parsing a `.rofl` file into
CLAUSES the engine will run is a different bridge from parsing it into an AST,
and it is not built.

## What must be said to anyone handed this

- The port is verified **56/56 on both conformance oracles** over the demo
  corpus, and **unjudged above about 3M facts** — `canonicalState` returns one string
  and V8 caps it. The owner's position, 2026-09-09, is that this is acceptable:
  the TypeScript engine is for small worlds and the port for large ones, and
  the reference is not built to reach there. It is still the case that nothing
  checks the port at the scale it exists for.
- **That 56 was 34 until 2026-09-09, and the 34 was against a photograph.**
  `facts/port-corpus/` is gitignored and `rust/run_corpus.sh` read whatever was
  on disk, so every conformance pass reported on this branch was against a
  snapshot of the kernel from whenever the generator last ran. All 34 cases
  differed from a fresh generation, and 22 worlds had never been checked by
  anything. Nothing could go red, because the seed and the expected output are
  written in the same instant and therefore agree with each other forever. The
  harness now generates its own oracle before running and refuses to report a
  pass if generation fails. The port itself was never wrong — see
  `f_the_conformance_corpus_was_a_photograph_of_the_kernel_not_the_kernel`.
- The port and the reference differ by 434 `derived_by` rows on the JS model.
  The port is right; the defect is
  `f_a_stale_firing_outlives_the_premise_it_rests_on` and the repair is a
  measured trade — see
  `f_the_third_repair_makes_the_engines_agree_and_still_costs_twenty_tests`.
- **The Rust parser is 2.1x `src/parser.ts`, and that is measured**: 105 800
  KiB/s against 49 802 at load 7.6, and 96 241 against 45 738 at 8.0. It was
  1.75x before the parser interned its own names (three runs, 1.76 / 1.75 /
  1.74, at load 8). Both sides run a FIXED WALL WINDOW started at the same moment and the
  work finished is counted, so the two share the contention — the machine was
  never quiet this session. The ratio held to within 1% while the absolute
  throughputs moved 19%, which is what makes it a statement about the parsers
  rather than about the afternoon. It is smaller than anyone would guess, and
  the reason is the other side: V8 on a warm tight loop is fast and
  `src/parser.ts` is itself a tuned hand-written parser. The headroom that was
  guessed at — a `String` per name where the host interns — has now been taken,
  and it was worth about a fifth of the gap rather than the order of magnitude
  the profile's share column implied. Against ring1 at 9 758x, 1.75 and 2.1 are
  the same answer.
- Density and time are measured on one workload: the JS model over JavaScript,
  plus the demo corpus. 198 B/fact and 45.7 s at 5.68M facts is what that
  workload does, not what the engine does.

# Time, and what a continuous model would need

What is decided, what is built, and what is deliberately not built yet. Read
this before designing anything that runs for longer than one evaluation.

## What `not p` means — decided 2026-08-30

**`not p` means "p is not derivable in the CURRENT TICK's store."** Not "p is
not derivable ever."

The evidence that settled it was counted rather than argued. Every one of the
52 uses of `@next` across the whole corpus is either a **carry** rule
(`p @next :- p.`, a fact surviving into the next tick) or a **clock**
increment. Both point from the present into the future; neither reads the
future into the present. No example and no unbuilt spec asks for a property
that would require foresight — HECK's "does it converge" is about the semiring
fold, HONK's and MOOT's "is it reachable" is a static graph property, and
SPAT's "does the schedule converge" is Boolean satisfiability over static
facts, with its "and it did not" an oracle against a lived week.

The argument that decided it: the opposite reading does not *provide*
foresight, it *declines to answer without it* — and the engine computes one
tick's fixpoint at a time and can never supply it. Its refusal would therefore
be permanent rather than provisional, forbidding a class of programs in
exchange for a guarantee nothing can deliver.

The residual risk is covered by machinery that already exists: facts are
tick-scoped and carry provenance, so a conclusion drawn at tick 5 is a
statement *about tick 5* and its why-tree says so.

**Consequence, implemented:** the dependency graph is about ONE tick. A rule
whose head is `@next` contributes no edge to it, and its conclusion relation
gets stratum 0, because a fact arriving at the tick boundary is base for the
tick that sees it. See `boot.rofl` and `test/next-tense.test.ts`.

**Second consequence, implemented: the semiring fold is about one tick too.**
"In how many ways is this true" is a question about the current tick by the
same argument, so a carried fact is a GIVEN in it — count one, exactly like an
asserted base fact — and `evaluateSemiring` does not walk a support edge whose
witness names a rule with `conclusion_tense(R, next)`. Without that the
kernel's own persistence idiom (`p(X) @next :- p(X).`) made every carried fact
its own support one tick back, because facts are named by content and not by
tick; the CLOSED counting instance read that self-loop as `star(one)` and
answered "infinitely many" for everything downstream, including a hand-asserted
fact citing nothing. Four examples had paid for it (OOPS, LOOT, NPC, SUS) and
the YAK probe that found it now guards it.

Two details are load-bearing. The **rule** is what identifies a boundary edge,
not the clock: `advanceTick` stamps a staged fact's witness with the tick just
entered, so a fact carried into tick 1 carries a witness stamped 1 and "older
than now" names nothing. And the narrowing must not blind the fold to cycles
*inside* one tick, which stay INFINITE and are the answer the metric exists to
give — `test/semiring.test.ts` asserts both halves on one fixture that holds
both kinds of loop. `why` had made the honest choice first, printing the
self-loop and stopping at `[cycle]`; the fold now agrees with the renderer.

## Reading the future is not built, and the door is open

`@next` in a rule **body** is rejected by the parser, deliberately. Allowing it
means opening the staging area to matching *inside* the fixpoint, which is the
riskiest part of the kernel, and nothing in the corpus needs it.

The door is open because `conclusion_tense` gives a next-tick conclusion its
own identity in the dependency graph. Once `p` and `p@next` are distinct,
ordinary stratification can police a body that names the future: a genuine
cycle is caught, a stratifiable lookahead is permitted.

If it is ever built, one thing must be settled first. **`not p@next` means
something materially different from `not p`** — the first is a claim about a
fixpoint that has not finished, the second about the store as it stands — and
the two would sit side by side distinguished by a single word. That difference
wants *mandatory* syntax that makes it cognitively visible, not a marker a
reader can skim past. The governing principle: the semantics are optimised for
comprehension by an agent, and the syntax should evoke the maximum number of
*correct* associations with neighbouring languages, so that a reader arriving
from Datalog, Prolog or SQL has their first guess be right.

## Queries arriving during a tick — roadmapped

A model of a continuous process receives queries while it is computing. The
current API is synchronous and single-threaded, so "between ticks" does not
physically occur: a query queues and is answered against whatever tick is
current.

**The place for the queue already exists and nothing uses it.**
`tickAdvance(opts)` takes an `onFixpoint` hook, documented as observing the
tick at fixpoint, *before the world advances*. At that moment tick T's
conclusions are complete and the `@next` staging is computed but not installed
— so what an agent *intends* is a fact with a full why-tree while the world's
response to it has not happened. That is the point at which a solver with
real-world effects can be inspected before the effect lands.

Roadmapped, in order of weight:

1. **Queue queries during a tick, drain them at the fixpoint, before advancing.**
   Runtime-layer work over the existing hook. No kernel change.
2. **An answer carries the tick it is about.** `QueryResult` has `rows`,
   `partial` and `error` — an honest caveat for an exhausted budget and none
   for time. One field. Without it a holder of an answer cannot tell whether it
   is stale, and layers 1 and 3 cannot be discussed concretely.
3. **`asserted_by` carries its tick.** `derived_by(F, RuleId, T)` records when;
   `asserted_by(F, who)` does not. The kernel already records the two hard
   parts — what, and who — and omits the cheap one, which is `store.tick` at
   the moment of the call. Until inputs are dated, a past state cannot be
   reconstructed: replaying would apply an assertion made at tick 9 while
   rebuilding tick 5. This is the prerequisite for everything below.
4. **Real concurrency** — several threads, simultaneous writes. Deliberately
   NOT taken. The fixpoint queue gives continuity without a second thread, and
   concurrency becomes necessary only when one tick's computation stops fitting
   inside the acceptable latency. That is measurable and has not been measured.

## Where a veto belongs

**A veto the model can express belongs inside the model.** It is an ordinary
rule — `blocked(A) :- intends(A), forbidden(A).` with the effect rule reading
`not blocked(A)` — evaluated in its own stratum, with no circularity. Inside,
it has a why-tree, and "why did the agent not do that" has an answer. A veto
implemented host-side is invisible to the audit and explains nothing.

The fixpoint hook is therefore for **observation**, and for the vetoes that
*cannot* be expressed — an external system or a person saying no after seeing
the intent, which is not known when the fixpoint runs. If such a veto changed
what gets staged it would mean adding a premise after the conclusion was
declared complete, which is the negative-cycle problem one level up; so it does
not change tick T's conclusions, it decides whether to advance.

## Past states: stored, or reconstructed

Tick-scoped facts are dropped at the boundary. Measured: a fact asserted by
hand and carried by nobody is gone at the next tick, and `why` about anything
derived from it answers "does not hold". Frozen `derived_by` still *reports*
that the derivation happened — so the store answers "what was derived" but not
"what could have been asked".

Four scenarios in this corpus genuinely want a past state: OOPS (a retraction —
which conclusions rested on it, and when did we stop believing them), NPC (when
was this last derivable), SPAT on a server (the schedule stopped converging —
why, which needs the previous converging state to diff against), and AFK
(contradictions between agents writing over hours).

The sharper question is whether a past state is **stored** or **reconstructed**.
Determinism decides it: same program plus same inputs gives a bit-identical
fixpoint, tested over 100 shuffles, so a reconstructed past is not an
approximation but the same state — OOPS proved it, with the ticked store and
the re-seeded one agreeing on 142 facts byte-identical. **Determinism turns
storing the past from a requirement into an optimisation.** The condition is
item 3 above: reconstruction needs the inputs, with their times.

## Retaining completed-tick provenance — decided 2026-08-30

Once frozen provenance is an optimisation rather than a record, how much of it
to keep is a policy, and the kernel had none. NPC measured what that costs:
~2000 `derived_by` facts per tick, dwarfing what the domain itself produces,
and every fold walks the whole store. **Provenance is not on the cost curve,
it is the cost curve** — measured from both sides on ten agents over eight
ticks, snapshots off, one laptop at load average 3.2: 366 ms per tick keeping
it, 248 pruning it, and the first number is a slope (236 ms at tick 0, 531 at
tick 7) where the second is flat (220, 249).

**`new Rofl({ retainTicks: N })`** keeps the current tick's provenance plus the
last N completed ticks. Three things about its shape, each of which could have
gone the other way:

**It is off unless asked for, and the default is unchanged byte for byte.** A
reconstructable past needs the reconstruction machinery, and that does not
exist yet — item 3 above landed today, items 1 and 2 have not. Pruning by
default would remove an answer nobody can currently recover, which is a
different thing from evicting a cache.

**Retention is conditional on whether the program reads its own provenance.**
A program whose rules never mention `derived_by` cannot observe its completed
ticks' provenance from inside, so dropping it changes no derivable fact. A
program that does read it — `examples/loot` §5, four rules joining provenance
with a pack manifest — keeps everything whatever `retainTicks` says. The
predicate is `Evaluation.readsProvenance`, which already existed for a
neighbouring purpose: reuse turns derived-relation caching off for exactly the
same programs, because a rule triggered by derivations anywhere is outside the
dependency cone. One function answers both, so the two policies cannot drift
into disagreeing about one program.

**The tick a fact was derived in is what ages out**, not the fact's own age:
`derived_by(F, R, T)` carries T, `advanceTick` freezes before it increments,
so keeping N completed ticks is `T >= tick + 1 - N` at the boundary. N = 0
keeps only the tick being entered.

**And a tick now records the budget it was evaluated with** (`Store.evalLog`,
beside the `partialEval` boolean it completes). This is what makes
"reconstructable" true without a caveat: a tick cut short at 100_000 steps and
replayed at 500_000 derives more, and the replay would disagree with the
history it claims to be. No retention policy trims that log — three numbers per
tick against the two thousand facts a policy exists to drop, and it is
precisely what lets the dropped ones be rebuilt.

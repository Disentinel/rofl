# YAK — model as a by-product: scanners written mid-task

Every other example here demonstrates the engine. This one demonstrates
**working with it** — what happens inside an ordinary task when a question
comes up, and what sediment is left behind afterwards.

The thesis it argues against is the one every formal method runs into: the
model is required *before* it pays off. TLA+ wants the process rewritten.
CodeQL wants queries written in advance, by people not working on your bug.
Expert systems want a year of knowledge acquisition first. Writing scanners as
you go inverts that. You are not building a model; you are solving a task and
**leaving a rule behind**. The unit cost is minutes, and each step is paid for
by the task that demanded it. The ontology of a subsystem is not designed. It
**sediments**.

What changes is not quality but **frequency**. Against `grep` the bar is lower
and meaner: grep finds text, a scanner finds what is *derivable* — transitive
dependencies, combinations of conditions, the things a regex cannot say — and
grep leaves nothing behind.

## The rule that governs this file

> **Fragments must be records of real runs, not written text. Invented
> fragments look more convincing than real ones, which is exactly why they are
> forbidden. If a mode has no real run, no fragment is written. An empty cell
> in the catalogue is more honest than a filled one.**

Nothing below was composed. Every fragment names an artefact, and
`demo.ts` re-runs the nine that still run.

Two provenance labels are used, and both mean a real run happened:

| label | meaning |
|---|---|
| **caught** | it happened on its own, in real work |
| **provoked** | reproduced on purpose — the going-there was deliberate, the run was not staged |

A third label, *predicted*, would mean "described, never reproduced". **No
predicted mode is written up as a fragment.** Those are one line each in
[What to expect](#what-to-expect) at the end.

## Run it

```
node --experimental-strip-types examples/yak/demo.ts
```

Under half a minute. The test suite (`test/example-yak.test.ts`) runs the same
scanners and pins what they return.

## The catalogue

| # | mode | label | rule's fate | evidence | scanner |
|---|---|---|---|---|---|
| 01 | sedimentary success | caught | kept | CONFIRMED | `fragments/01-sediment.ts` |
| 02 | redefining success | caught | discarded | CONFIRMED | `fragments/02-scc.ts` |
| 03 | quick success | caught | discarded | CONFIRMED | `fragments/03-metadep.ts` |
| 04 | false miss | provoked | discarded | CONFIRMED | `fragments/04-false-miss.ts` |
| 05 | diverging semiring | provoked | kept | CONFIRMED | `fragments/05-diverging-semiring.ts` |
| 06 | stale model | caught | discarded | CONFIRMED | `fragments/06-stale-model.ts` |
| 07 | the scanner was not needed | caught | discarded | CONFIRMED | `fragments/07-not-needed.ts` |
| 08 | a rule that codes an accident | caught | corrected | CONFIRMED | `fragments/08-golden-accident.ts` |
| 09 | the wrong premise | caught | discarded | CONFIRMED | `fragments/09-wrong-premise.ts` |
| 10 | yak shaving | caught | discarded | CONFIRMED | none — that is the fragment |

Seven of ten rules were **thrown away**. Two were kept, one was corrected.
A catalogue that showed only retention would be teaching hoarding.

---

## 01 — sedimentary success · caught · rule KEPT

**Task.** Make the HUH pipe demo say which stage ate a log line.

**Question.** `hit(N) :- msg(N,S), contains(S,"404").` loads clean, and `hit`
is silently always empty — `contains` is not a builtin, so it parses as an
ordinary relation with no rules and no facts. How many relations in a program
can never hold a fact at all?

**Scanner.** One rule. It is in `boot.rofl` to this day:

```prolog
undefined_premise[audit](R, Rel) :- premise_pos(R, Rel),
                                    not concludes(_, Rel), not edb(Rel).
```

Positive premises only: an unpopulatable *negated* premise always succeeds, so
it hides nothing.

**What it returned.** On the HUH program: `contains`.

**What happened next.** This is the only fragment where that section is about
something other than the day it was written. The rule went into `boot.rofl`
with a test and stayed. Replayed now over the six rule files shipped *after*
it, it fires on one:

```
examples/blam/blam.rofl    load=ok   undefined_premise: changed
```

`changed/1` is BLAM's diff relation, supplied by `demo.ts` at runtime, and
`blam.rofl` declares no `edb`. So the rule file alone is mute — which is
exactly what the audit exists to say, and cannot be told apart from a
misspelling by reading it. `moot.rofl`, written the same day, declares its
twelve inputs and cites this audit in its header; strip those declarations and
the audit names all twelve, which is the positive control proving the five
`(none)` rows are measurements rather than an instrument that stopped working.

**Fate.** KEPT — in `boot.rofl`, with `test/undefined-premise.test.ts`.

**Lesson.** A rule earns its keep by firing on code its author never saw.

---

## 02 — redefining success · caught · rule DISCARDED

**Task.** Verify the counting column of a semiring fold over a cyclic crafting
graph (petroleum cracking: heavy → light → petrol → light).

**Question.** As first asked: *enumerate the derivations of
`craftable(light_oil)` and check the count against the fold.*

**Scanner.** Writing that enumerator down is what killed it. The graph has a
cycle, so the set of derivations is infinite: enumeration does not terminate,
and no budget makes it terminate. The question was wrong. The replacement —
*can "infinitely many" be **decided**?* — is twenty lines of Tarjan over the
support hypergraph, where a fact's successors are the premises of its
witnesses. **The enumerator was never written.**

**What it returned.**

```
infinitely many derivations : craftable(heavy_oil) craftable(light_oil) craftable(petrol_gas)
finite, safe to report      : craftable(coal) craftable(crude_oil) craftable(water)
```

Also, separately: `why` does not mark the cycle. Its `[cycle]` marker is a
render guard and never fires here, because the tree follows the first witness
and reaches an axiom without revisiting.

**What happened next.** The answer arrived with its own correction, and the
correction is why the rule was not kept. SCC membership implies an infinite
count **only for a non-idempotent plus**. The same scan over the kernel's own
Boolean meta-layer flags 12 of 64 `reach` facts and 6 of 46 `stratum` facts,
where a support cycle is completely harmless. The naive rule cries wolf on
every recursive Boolean program.

**Fate.** DISCARDED as a scanner. What was kept is a *definition*: "infinitely
many" is decidable, cheaply, and must be read through the instance's declared
discipline.

**Lesson.** The payoff was the definition, not the computation.

---

## 03 — quick success · caught · rule DISCARDED

**Task.** Cache `boot.rofl`'s meta-layer — about 15 s of a 29.8 s load on
`examples/spat`, rebuilt from scratch every time.

**Question.** A cache needs an invalidation key. What actually moves the meta
relations — the rules, or the data?

**Scanner.** Four mutations, seven meta relations watched. Three minutes to
write.

**What it returned.**

```
after program            : dep=37 dep_neg=8 reach=53 stratum=43 sees=2 perspective=2 forged=0
+ fact of existing rel   : dep=37 dep_neg=8 reach=53 stratum=43 sees=2 perspective=2 forged=0
+ fact of NEW relation   : dep=37 dep_neg=8 reach=53 stratum=44 sees=2 perspective=2 forged=0
+ fact in NEW perspective: dep=37 dep_neg=8 reach=53 stratum=45 sees=3 perspective=3 forged=0
+ fact with an author    : dep=37 dep_neg=8 reach=53 stratum=46 sees=3 perspective=3 forged=1
```

**What happened next.** The expensive part turned out to have the cheapest
key. `dep`, `dep_neg` and `reach` do not move for *any* data change — and
`reach` is the 1799 facts that cost the 15 seconds — so their key is just the
set of rule ids, which are already content-addressed. `stratum` needs a
slightly wider key because it moves on the first appearance of a relation or a
perspective, though not on fact volume. That went straight into the cache
design. The probe was deleted.

**Fate.** DISCARDED.

**Lesson.** Three minutes of measurement replaced a heuristic invalidation key
with an exact one.

---

## 04 — FALSE MISS · provoked · rule DISCARDED

The most dangerous failure, because it is invisible. A false positive argues
with you; a false miss agrees with you.

**Task.** Review a newly written `runtime/semirings.ts` before landing it.

**Question.** What does this file export?

**Scanner.** `grep`.

**What it returned.** Nothing.

**What happened next.** It was read as "no exports". That was false: the file
held a literal NUL byte — a separator constant written as the raw character
instead of the escape — and a grep that skips binary files skipped it, in
silence. No warning, no "binary file matches", empty stdout, exit 1. Every
other gate agreed: `tsc` clean, the file's own eleven tests green,
`npm run grepcheck` clean because that check scans `src/` only. Only `git`
objected, calling a TypeScript source `Bin 0 -> 7930 bytes` and refusing to
diff it.

Provoked here on two files identical but for one NUL, with the same question
put to two invocations:

```
   instrument             clean.ts         withnul.ts
   /usr/bin/grep -c       3  [exit 0]      3  [exit 0]
   /usr/bin/grep -I -c    3  [exit 0]      (NOTHING AT ALL)  [exit 1]
```

The sting is in which one you get by default: typing `grep` does not name a
program, it names whatever the environment has bound, and in this shell that
is a wrapper with `-I` already applied. The silent row is the ordinary one.

This is also the fragment for *claimed but never run*: the assertion "this
file has no exports" was made about a file the instrument never read.

**Fate.** The narrow scanner DISCARDED. Replaced by `scripts/text_check.ts`,
which reads bytes rather than lines and is in CI. Its own test plants a NUL to
prove the gate can say no — and it rejected its author on the first run.

**Lesson.** A negative result is a fact about the instrument until a positive
control says otherwise.

---

## 05 — diverging semiring · provoked · rule KEPT

**Task.** Fold Counting over a citation graph that advances with a clock.

**Question.** The kernel's own persistence idiom is a carry rule,
`fact(X) @next :- fact(X).` — "persistence is not a storage property",
`examples/counter.rofl`. Does that idiom poison a non-idempotent semiring?

**Scanner.** Seven facts, a clock, and the counting fold at three tick counts.

**What it returned.**

```
tick=0  domain facts=7  INFINITE=0  self-supported=0
   solo(z), which cites nothing = 1           hop(a,c), one route = 1
tick=1  domain facts=7  INFINITE=6  self-supported=3
   solo(z), which cites nothing = INFINITE    hop(a,c), one route = INFINITE
```

**What happened next.** Every carried fact becomes its own support one tick
back — a self-loop in the support hypergraph — so the closed counting instance
multiplies by `star(one)` and answers "infinitely many" for a fact that cites
nothing and has exactly one origin. **The engine is not wrong.** It answers
"how many derivations" about a support graph that now contains time travel. It
is the question that stopped meaning what it meant at tick 0.

The first two attempts at this probe measured a store that never moved: without
a clock the ticks do not advance and the defect never appears. That is worth
saying out loud, because those two runs looked like a clean bill of health.

**Fate.** The probe DISCARDED; the RULE it produced KEPT as a demo-level
discipline — fold semirings over an as-of store, never over a ticked one, and
prove it is the same world by comparing the domain facts.

**Lesson.** A correct answer to the question you asked is not an answer to the
question you meant.

**POSTSCRIPT — the subject is gone and the probe outlived it.** This is that
probe, unchanged, still runnable. Run it now:

```
tick=0  domain facts=7  INFINITE=0  self-supported=0
   solo(z), which cites nothing = 1      hop(a,c), one route = 1
tick=1  domain facts=7  INFINITE=0  self-supported=3
   solo(z), which cites nothing = 1      hop(a,c), one route = 1
tick=3  domain facts=7  INFINITE=0  self-supported=3
   solo(z), which cites nothing = 1      hop(a,c), one route = 1
control, same store plus a citation cycle p<->q, at tick 3:
   cite(a,b), carried over the boundary = 1   hop(p,p), a cycle inside the tick = INFINITE
```

The rule this fragment produced has been retired, and by a decision rather than
a workaround: `not p` was settled to mean "not derivable in the CURRENT tick's
store", and the same argument narrows the fold — "in how many ways is this
true" is a question about the current tick, so a fact that arrived over the
boundary is a *given* in it, count one, and the edge back is not walked
(`docs/time-and-continuity.md`, `src/semiring.ts`). Folding as-of is now a
convenience, not a correctness rule. `examples/oops` agrees fact for fact
between its ticked and as-of stores, 142 of 142.

**And the last line is why the fragment is worth keeping.** `INFINITE=0` is not
evidence of the fix. A fold that walked no support at all would print it, and
so would a fold that had simply stopped detecting cycles — one output, three
readings, which is fragment 04's silent grep in a different costume. The
control block separates them, because it puts both kinds of loop in one store:
a carried fact whose loop closes across the boundary, beside a citation cycle
that closes inside the tick. Measured against two deliberate mutants: the
pre-fix fold prints `INFINITE   INFINITE`, and the fix with cycle closure
disabled prints `1   30` — a number that grows with the round cap, which is
exactly what `star` exists to prevent. Only the fix prints `1   INFINITE`.
Note `self-supported=3` in the table above as well: the self-loop is still in
the store; the fold is declining to walk it, which is a different fact from the
loop being gone.

## 06 — stale model · caught · rule DISCARDED

Caught today, by replaying a kept scanner.

**Task.** Write this example; replay the probes the session left behind.

**Question.** Does the arrival-order effect still hold? The recorded finding
says the store's quadratic insert is not a property of the sorted-array index
but of the **order keys arrive in**, measured at 64k facts in three arrival
orders: ascending 132 ms, integer args 505 ms, shuffled 716 ms — a **5.4×
spread**.

**Scanner.** That probe, unchanged, still runnable.

**What it returned.**

```
  integer args (lex order is scrambled)         102 ms
  zero-padded (keys strictly ascending)          84 ms
  zero-padded, shuffled arrival                  88 ms
  spread: 1.2x     (recorded when this probe was written: 5.4x)
```

**What happened next.** The probe survived; its subject did not.
`src/store.ts` grew `arrived` and `absorb`, which append instead of splicing
and cite `performance-invariants.md` I1 by name. All three arrival orders now
take the identical append path, so the spread is absent **by construction** —
not because the effect was never there, but because it mattered enough to be
engineered away. A reader who trusted this probe today would conclude the exact
opposite of the truth.

**Fate.** DISCARDED — and it should have been deleted the day the fix landed.

**Lesson.** A kept scanner with no owner goes on answering. It does not go on
being about anything.

---

## 07 — THE SCANNER WAS NOT NEEDED · caught · rule DISCARDED

The mandatory fragment. Without it this demonstration is unfalsifiable: a
method that always helps is advertising.

**Task.** The same one as 06 — establish why the spread vanished.

**Question.** "No spread" has two readings. Either the effect never existed,
or the probe can no longer *see* it. Fragment 04's rule applies to me here: a
negative result is a fact about the instrument until a positive control
separates them. So force the one path `absorb` still splices on — a read after
every single write — and watch the spread come back.

**Scanner.** That control.

**What it returned.** At 64k it did not finish inside two minutes. Resized to
16k: 6.1 s / 6.1 s / 7.4 s — a 1.2× spread, the same non-answer, because an
O(n) read per write swamps the splice it was built to expose. Two runs, two
resizes, about four minutes, question still open.

**What happened next.** The answer was in `src/store.ts`, lines 29–42, in
English, in a comment written by whoever landed the fix:

> Inserting one key at a time into a sorted array is free at the end and a
> memmove of the tail anywhere else, so the cost of a fact is decided by the
> ORDER facts arrive in. […] Arrivals are appended instead, and the run is put
> back in order once, for a batch, by `absorb`.

Under a minute to read, and conclusive.

**Fate.** DISCARDED. The failed control is kept *in the fragment*, because a
criterion with no counter-example attached is a slogan.

**Lesson.** The scanner was not needed. Reading the code would have been
faster.

### The criterion of abstention

Abstention is a mode of work, not the absence of it, so it needs a criterion
rather than a wish. **Do not write a scanner when the question is "what does
this one named function do" and the function is open in front of you.**
Measurement is the wrong instrument for a question whose answer is a
*mechanism* rather than a *quantity*.

A scanner earns its cost when the question is about behaviour **emergent over
many sites** (fragment 01: which of six rule files has an unpopulatable
premise), or over **data too large to eyeball** (fragment 08: how deep are
these programs, really). Both of those resist reading precisely because no
single place contains the answer.

---

## 08 — a rule that codes an accident · caught · rule CORRECTED

**Task.** Land the meta-layer cache — about 15 s off a spat-sized load.

**Question.** Did the change move observable behaviour?

**Scanner.** A golden capture: why-trees, `canonicalState` and snapshot
round-trips over three programs — `craft`, `multi`, `sensors` — byte-compared
before and after.

**What it returned.** Zero bytes moved. Twice, across two separate kernel
changes. 461489 bytes, byte-identical.

**What happened next.** On that evidence two findings were settled and the
worker was stopped. Then the full node suite came back **291 pass / 9 FAIL**,
every failure in `examples/wtf`, with a creature computed 2/2 where an
independent implementation of the Magic layer rules says 3/3. Wrong answers,
not flakes.

The golden set was never chosen. It was what happened to be lying around when
somebody needed a diff. One number settles what it covered, and the engine
reports it about itself, since `boot.rofl` derives `stratum/2` from the rule
dependency graph:

```
program            in the golden set   relations   max stratum   distinct strata
craft              yes                        48             2                3
multi              yes                        48             2                3
sensors            yes                        47             2                3
wtf                NO                        200            13               14
```

Every golden program stops two boundaries in, against thirteen for the one they
left out. The change being checked was to the layer the engine activates
stratum by stratum — so the capture could not have exercised it however many
bytes it compared.

(The three shallow programs read `1` when this was written, and the relation
counts were 41/41/40 against 193. Both moved because `boot.rofl` itself grew —
the transitive flow closure and then the collection graph, which added a second
negation level. The fragment recomputes the table on every run, so the numbers
here are a transcript and the claim is the ratio.)

**Fate.** CORRECTED, not discarded. The golden capture is still there and is
still worth having; what changed is its rank. It is a substitute for a *diff*,
never for *coverage*, and `CLAUDE.md` now requires the full suite before a
finding is settled.

**Lesson.** A green check whose corpus is an accident of what was lying around
certifies the corpus, not the change.

---

## 09 — the wrong premise · caught · rule DISCARDED

**Task.** Land the semiring layer across three demos in parallel.

**Report.** A demo agent reported: a rule outside range restriction is silently
demand-evaluated, and this corrupts the semiring fold because its facts
**vanish** from it, while the Boolean answer stays right.

**Question.** Do they vanish?

**Scanner.** The shape the report described, built to confirm it.

**What it returned.**

```
the shape the report described is real:
  non-range-restricted rules : risky
  demand-backed relations    : risky, safe

the claimed consequence is not:
  query answers for risky    : 2
  risky facts in the store   : 2
  of those, annotated by the fold: 2
  nothing vanished.
```

**What happened next.** The probe refuted the symptom it was written to
reproduce — and that is the only reason the real defect was found, because the
report was right that something was wrong and wrong about what. A second,
narrower probe found it: the clause-renaming counter was leaking into the
**firing signature**, so a fact with exactly one derivation recorded as two
supports. Inflation, not disappearance — and only counting could see it,
because the Boolean verdict stayed correct throughout, which is precisely what
made it invisible to every behavioural test.

**Fate.** This probe DISCARDED, its premise being false. The second one KEPT —
promoted verbatim into `test/firing-signature.test.ts`, same two fixtures.
Replayed today both sides return 1: the repair landed.

**Lesson.** Take the report seriously and its diagnosis provisionally. The
probe that refutes the stated symptom is what finds the real one.

---

## 10 — yak shaving · caught · NO SCANNER

The name obliges. This one ends badly, with no recovery.

**Task.** Ship three demo examples.

**Question.** `CLAUDE.md` said "both runners must stay green: `bun test` too".
So: enforce it.

**Scanner.** None was ever written. That is the fragment.

**What happened instead.** "npm test AND npm run test:bun both green" went into
all four subagent briefs. Then a whole turn was spent *predicting* that the new
demos would push bun over the 300-second budget — while bun already had its own
job in `.github/workflows/ci.yml`, so nothing local was being protected at all.
Cost: about five minutes of dead verification per agent cycle, three agents in
parallel, bun measured at 295 s against node's 117 s.

It compounded from there. Three agents sat inside bun runs, and a message
reaches a subagent only at its *next tool round*, so three polite countermands
sat undelivered. Killing a child process does not cancel the intent — it looks
to the agent like a failed run and triggers a retry — so a fourth bun started
minutes after the third was killed. Load hit 111 on 4 cores. Every timing taken
during that window was inflated and had to be re-measured before it could be
quoted.

**Fate.** No rule to discard. What the detour left behind is a `CLAUDE.md` fix
naming the measured 117 s vs 295 s and stating explicitly that "both runners
green **in CI**" is a different instruction from "run both by hand".

**Lesson.** The detour is only paid for by the artefact it leaves; here it
left one, and the thing it started out to protect never needed protecting.

---

## Accumulation hygiene

Three hundred rules nobody trusts is the fate of every linter with an
accumulated configuration, and the remedy has to be mechanical. It already
exists: **MOOT pointed at the accumulated scanner set** — the same five
verdicts (unreachable, shadowed, tautological, contradictory, dependent), only
turned on your own rules. `examples/moot/` already points itself at
`boot.rofl`, so this reuses it rather than growing a second one.

```
  22 rules encoded as clauses over 38 dimensions, 29 relations as flags

  unreachable relations: asserted_by forged imports
  rules that can never fire in this store: 3
    r0145d338  concluding sees
    r66afcc0f  concluding forged
    rfc45fb4a  concluding sees
  shadowed rule pairs: (none)
```

`undefined_premise` — fragment 01's rule — is not among the dead, which is
what this was run to find out. `forged[audit]` is: it reads `asserted_by`,
which nothing here populates, so it has been answering "clean" to every
program in this repository and would answer "clean" to a forged fact too.

### And the gap, which is the more useful half

Of the ten scanners catalogued here, **exactly one is a rule**. The other nine
are TypeScript probes against the store API. That is not an accident of this
session: the questions were about the *engine*, and a rule cannot ask how many
milliseconds an insert took. MOOT decides rule-shaped scanners exactly and has
nothing whatsoever to say about probe-shaped ones.

**Fragment 06 is the proof.** A probe that has gone stale is not unreachable,
not shadowed, not tautological. It runs, it returns a number, and it is about
nothing. No verdict in this hygiene pass catches it. The hygiene that would —
*does this probe still measure what its comment claims* — is not mechanised
anywhere in this repository, and naming that is more useful than a clean bill
of health would have been.

## What to expect

Modes reasoned about but **not reproduced here**. One line each, no invented
session. As runs accumulate these should move up into the catalogue with a
*caught* label — and the ones that turn out to be imaginary should be struck
out instead.

- **a rule instead of a fix** — formalisation as a substitute for the hard
  work; converging useful activity in place of solving the problem.
- **premature generalisation** — a rule inferred from a single case.
- **burial under scanners** — six months on, half the firings are false, and
  everybody ignores all of them.
- **a rule that codes a snapshot** — it matched today and is meaningless
  tomorrow. (Fragment 08 is the *corpus* version of this; the snapshot version
  needs a repository with history and was not attempted.)
- **approval without looking** — an agent emits a rule with a plausible but
  wrong premise and a human agrees. Trivially provoked; not provoked here.
- **false positive** — a rule written too broadly. Provoked trivially, and
  weak as a lesson. The nearest real thing in this session is inside fragment
  02, where the naive rule condemns 18 harmless kernel facts, so it is written
  up there rather than given a fragment of its own.
- **stale model against a snapshot** — fragment 06 is the code-moved-under-the-
  probe form. The extracted-model form, where a model is extracted once and the
  code diverges from it, needs a prepared repository and was not attempted.

## Modes of work

| mode | description |
|---|---|
| reactive | question in a task → scanner → answer → usually thrown away |
| retained | a scanner promoted to a standing check on diffs |
| reflexive | MOOT over your own scanner set |
| **abstention** | do not write a scanner — see the criterion in fragment 07 |

## Relation to the rest of the set

The other examples demonstrate the engine. This is the first that demonstrates
working with it, which — if the value really does live in the translation layer
rather than in the kernel — is the one that shows the thing worth showing.

## On the name

Yak shaving: went to do one thing, ended up in another. Here the detour is paid
for by the artefact left behind after it. Plus the honest line of `yacc` and
YAML: Yet Another Kit. Name availability was checked only superficially; inside
this repository that does not matter, but it needs a proper look before any
separate package.

# ROFL among the formal reasoning systems — a swarm-built landscape

Produced 2026-08-28 by a 12-agent research swarm (fresh Haiku subagents,
one per system family, each given only the comparison frame and its
target; assignment and completion tracked as facts through
`rules/swarm.rofl`; frontier reached quiescence in one wave, 12/12
deliverables, zero contract violations). Raw per-system profiles with
sources live in the run record; ~28% of matrix cells cite a fetched URL,
the rest are model-knowledge and marked so. Single-sourced cells carry
that uncertainty — see Threats at the end.

**The projection is ROFL-centric by construction**: the ten axes are
ROFL's own property list, so ROFL scores ten-for-ten by definition. The
matrix does not say ROFL is better; it says which of its properties exist
elsewhere. The field's own strengths ROFL lacks are in "Where the field
is ahead".

## The matrix

Axes: A1 perspectives-as-ledgers/authority · A2 kernel-emitted provenance ·
A3 derived open-world epistemic states · A4 deterministic stratified
fixpoint + replay · A5 incremental materialization · A6 validated LLM
admission gate · A7 anytime budgets · A8 typed inquiry → derived work
frontier · A9 zero-dep embeddable kernel · A10 rule mutation-testing
discipline. (H = has, P = partial, – = lacks.)

| system | A1 | A2 | A3 | A4 | A5 | A6 | A7 | A8 | A9 | A10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Soufflé / Doop | – | P | – | H | P | – | – | – | P | – |
| CodeQL | – | P | – | P | P | – | P | – | P | – |
| Glean / Kythe | – | P | – | P | – | – | – | – | – | – |
| DDlog / DD / Materialize | – | P | – | H | H | – | – | – | P | – |
| clingo / ASP | – | P | – | H | – | – | P | – | P | P |
| Prolog (SWI, Scryer) | – | P | – | P | – | – | – | – | – | – |
| Z3 / CVC5 | – | P | P | P | – | – | P | – | P | – |
| Lean / Coq / Isabelle | – | P | – | – | – | – | P | – | H | – |
| TMS / ATMS / AGM | P | P | H | – | H | – | – | – | P | – |
| Argumentation (Dung/ASPIC+) | – | P | P | P | – | – | – | – | P | – |
| OWL / SHACL / Cyc | – | P | P | – | P | – | P | – | P | – |
| LLM×formal + agent memory | P | P | – | – | – | P | P | – | P | – |

## Three facts the matrix states

1. **Column A2 is partial everywhere and full nowhere.** Every family has
   a provenance story (proof objects, provenance debugging, why-traces on
   demand); none emits derivation provenance from the kernel over a
   mutable, multi-writer fact store. Provenance alone is not the
   differentiator — provenance × write-authority (A2×A1) is.
2. **Column A6 is empty except a partial in the newest family.** The
   problem ROFL is built around — an LLM as a first-class but *untrusted*
   writer, entering through a validated, attributed gate — is unaddressed
   by the classical field and only half-addressed by agent-memory systems
   (which persist LLM output but do not gate it).
3. **Column A8 is empty, full stop.** Deriving the work queue from
   epistemic state (typed inquiry → typed intents) appears in no profiled
   system. This is the least borrowed, most original part of the design.

## The families, positioned

**The Datalog performance family** (Soufflé/Doop, DDlog/Differential
Dataflow/Materialize, Glean/Kythe, CodeQL) shares ROFL's computational
substrate and dwarfs it on scale, and has zero epistemic layer and zero
agent model. These are potential *backends*, not competitors: if scale
ever hurts, compile the rule packs down to them; the discipline is the
product, the fixpoint is a commodity.

**The solver family** (clingo/ASP, Prolog, Z3/CVC5, OWL reasoners) offers
richer logics than stratified Datalog — choice rules, constraints,
theories, description logic — over static, trusted inputs. No ledgers, no
who-said-what, no untrusted writers. Their natural role in a ROFL world
is *oracle*: a solver call is an evidence-producing tool behind a typed
intent, entering through the same admission gate as any agent.

**The certainty extreme** (Lean, Coq, Isabelle) certifies individual
proofs in a closed formal world — the opposite operating point from
working memory under uncertainty. Telling detail: the researcher's
"steal" list for this family inverted, recommending ROFL's properties
*into* LLM-guided proof search (gated untrusted provers, contested-blocks
rather than tactic order). The families meet exactly where AlphaProof
lives.

**The ancestors** (JTMS/ATMS, AGM belief revision, computational
argumentation) are the closest intellectual relatives and the sharpest
finding of the run: dependency-tracked revisable belief, contested as a
first-class state, burden of proof — all worked out in 1979–1995, then
dormant. Dormant, arguably, for lack of two things: a writer that
produces beliefs at scale (now: LLMs) and a modern incremental substrate
(now: Datalog engines). Stated honestly, **ROFL is a TMS reborn on
Datalog with an LLM at the door** — and that lineage is a strength to
cite, not a priority claim to hide.

**The market neighbors** (Logic-LM/LINC/AlphaProof pipelines;
MemGPT/Letta, Zep/Graphiti memory) are the only family touching A6.
Solver pipelines formalize per query — translate, solve, interpret,
discard; no persistent epistemic store. Memory systems persist — but what
the LLM writes is stored, not validated, and served back by retrieval,
not derivation. ROFL's seam between them: *persistent + derived + gated*.

## What ROFL should steal (consolidated, ranked)

1. **Nogood explanations** (ATMS): when a claim is contested, derive the
   explicit conflict set, not just the state.
2. **Assumption labels / environments** (ATMS): tag derivations by the
   assumption set entailing them; multi-scenario what-if without excise
   round-trips.
3. **Temporal edges** (Zep/Graphiti): valid-time on facts ("became true /
   ceased") — orthogonal to perspectives, needed the moment ledgers live
   for weeks.
4. **AGM postulates as mutation tests** for retract/revision semantics —
   the belief-change test suite already exists in axiomatic form.
5. **Solver-as-oracle intents**: Z3/clingo calls as evidence tools behind
   verify intents (their proof certificates map onto evidence provenance).
6. **Tabling and elastic incremental deltas** (Prolog / Soufflé / DDlog)
   when derivation cost ever becomes the bottleneck.
7. **Burden-of-proof semantics** (Carneades) as the formal reading of
   blocking-claim confirmation grades.

## Where the field is ahead (no spin)

Raw performance and scale (everything in the first family); expressive
logic (ASP choice rules, SMT theories, dependent types); ecosystem and
maturity (decades vs weeks); multi-language semantic extraction (CodeQL,
Glean) against ROFL's one babel scanner; temporal modeling (Zep);
distributed execution (Timely/DD). None of these are the contested
ground, but any pitch that omits them is dishonest.

## Positioning in one paragraph

ROFL occupies a cell the field leaves empty: kernel-emitted provenance
over write-authority ledgers, open-world epistemic states derived from
evidence, a validated admission gate for untrusted LLM writers, and a
work frontier derived from epistemic state — in a zero-dependency kernel
small enough to live inside an agent harness. The ancestors (TMS,
argumentation) had the epistemics without the writer; the moderns (agent
memory, LLM+solver pipelines) have the writer without the epistemics.
ROFL is the join.

## Method note and threats to validity

One researcher per family, one wave — cells are single-sourced and
unverified pairwise; the dispute machinery (`agent_disputed`,
`axis_disputed`) never fired because no cell had two writers. Several
cells read generous (TMS A5 "has", Lean A9 "has") and should be
challenged in a verification wave before any cell is quoted
load-bearingly. ~72% of cells rest on model knowledge rather than fetched
sources. The swarm's own run record (assignments, reports, axis facts,
sources, confidence) is replayable from the fact files.

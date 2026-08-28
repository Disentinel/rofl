# Guided Formal Reasoning on Top of Codefacts

## Status

Draft roadmap and architecture specification.

## Objective

Build a guided formal inquiry system on top of Codefacts that:

1. Converts a question or decision into verifiable proof obligations.
2. Explicitly represents facts, hypotheses, contradictions, unknowns, evidence, and perspectives.
3. Deterministically derives intents for the next inquiry step.
4. Uses LLM agents and deterministic tools to execute those intents.
5. Limits inquiry breadth and depth through budgets and prioritization.
6. Preserves unresolved branches and context.
7. Produces a useful intermediate result after any number of steps.
8. Turns gaps discovered by humans into reusable rules and regression tests stored in the repository.

The system does not attempt to build a complete model of the world. It searches for a **minimally sufficient certificate for a specific decision**, while preserving the remaining frontier for later inquiry.

---

# 1. Core Hypothesis

Most complex questions can be represented as:

```text
decision
  → criteria
  → proof obligations
  → claims
  → evidence and assumptions
  → unresolved uncertainty
  → inquiry intents
```

The operating loop is:

```text
Frame decision
  → Derive proof obligations
  → Assess epistemic state
  → Generate candidate intents
  → Select a bounded batch
  → Execute agents and tools
  → Admit assertions and evidence
  → Recompute
  → Stop, continue, or escalate
```

The key principle is:

> Do not follow a fully predetermined path. Construct the path backward from the evidence required to justify the decision.

---

# 2. Theoretical Foundation

## 2.1. Scientific Method

Relevant elements include:

- formulation of testable claims;
- deduction of observable consequences;
- collection of observations and experiments;
- separation of confirmation from refutation;
- counterexample search;
- reproducibility;
- explicit representation of knowledge boundaries.

The primary difference from pure scientific inquiry is:

> The system optimizes for sufficiently justified action under constraints of time, cost, and acceptable risk—not for complete knowledge.

## 2.2. Deduction

Deduction derives decisions from explicit criteria:

```text
If every blocking requirement is covered,
capacity is verified,
monitoring and rollback are ready,
and residual risk is accepted,
then a production launch is permitted.
```

Datalog provides the primary mechanism for deterministic deductive closure.

## 2.3. Abduction

Abduction generates possible explanations for observations:

```text
Observation:
Delivery rate is below expectations.

Candidate hypotheses:
- source rate is insufficient;
- the pipeline contains a bottleneck;
- records are being filtered;
- the metrics are incorrect.
```

Hypotheses are not admitted as facts. They produce discriminating inquiry intents.

## 2.4. Falsification

For every significant claim, the system should ask:

```text
What observation would show that this claim is false?
Was a test capable of detecting that failure actually performed?
```

A successful happy-path test does not prove the absence of a failure mode that the test could not observe.

## 2.5. Paraconsistent Logic

The system does not need to collapse contradictions immediately:

```prolog
asserted_by("ready(atlas)", "product").
asserted_by("not_ready(atlas)", "operations").
```

Instead, it should identify the address of the disagreement:

- factual disagreement;
- semantic disagreement;
- scope disagreement;
- different assumptions;
- different risk preferences;
- different authority.

Contradictions are first-class states that produce intents for clarification, discrimination, or escalation.

## 2.6. Provenance and Truth Maintenance

Every significant claim should preserve:

- who asserted it;
- where it was extracted from;
- what evidence supports it;
- which scope it applies to;
- when it was valid;
- which assumptions it depends on.

Changing or retracting a premise should invalidate dependent conclusions.

## 2.7. Bounded Rationality and Satisficing

Absolute certainty is generally unavailable and unnecessary.

Inquiry may stop when:

- a sufficient decision certificate has been constructed;
- a decisive blocker has been found;
- additional inquiry is unlikely to change the decision;
- the research budget has been exhausted;
- only authority or risk acceptance remains unresolved.

## 2.8. Rational Metareasoning

The system should reason not only about the problem, but also about the value of its next reasoning step:

```text
Is this intent worth another tick?
How likely is its result to change the decision?
How expensive is it?
Is there a cheaper discriminating action?
```

## 2.9. Value of Information and Value of Computation

A rough intent priority function is:

```text
priority ≈
    decision impact
  × probability of changing the result
  × expected uncertainty reduction
  × urgency
  ÷ execution cost
```

The first implementation may use symbolic categories:

```text
impact: critical | high | medium | low
cost: trivial | cheap | medium | expensive
discrimination: strong | medium | weak
urgency: immediate | soon | later
```

## 2.10. Best-First Search and Branch-and-Bound

The system should preserve the full inquiry frontier but execute only a bounded set of high-value intents.

Branches that:

- do not affect the decision;
- duplicate or are subsumed by another branch;
- cost more while providing less expected value;
- become irrelevant after a new fact;

should remain preserved but become `dormant`, `superseded`, or `pruned_for_budget`.

## 2.11. Progressive Widening

The system should not expand all possible questions immediately.

It should begin with:

- blocking obligations;
- cheap discriminating questions;
- high-impact assumptions.

Additional perspectives and hypotheses should be activated only when necessary or through a bounded exploration budget.

## 2.12. Anytime Algorithms

After any number of ticks, the system should be able to return:

- the current recommendation;
- its assurance level;
- supported and refuted claims;
- blockers;
- unresolved obligations;
- active and dormant frontier;
- highest-value next actions.

## 2.13. Distributed Cognition and Living Knowledge

Gaps discovered by people should become:

- domain terms;
- rules;
- decision criteria;
- authority policies;
- mutation and regression tests.

The repository becomes an executable external model of organizational knowledge.

---

# 3. Architectural Layers

## 3.1. Scanners

Purpose:

> Convert external reality into facts.

Potential sources:

- source code;
- configuration;
- CI and test reports;
- monitoring;
- task tracker;
- team chat;
- documents;
- deployment state;
- human responses;
- embeddings and semantic candidates.

Scanners observe and extract facts. They do not make decisions.

## 3.2. Fact and Ontology Layer

Purpose:

> Store the stable structure of the domain and epistemic model.

Core entities:

```text
decision
claim
obligation
assertion
evidence
assumption
hypothesis
perspective
authority
intent
experiment
budget
snapshot
```

## 3.3. `.cf` Rules

Purpose:

> Deterministically derive states, violations, obligations, intents, and recommendations.

The `.cf` library should contain:

- epistemic states;
- proof obligations;
- contradiction detection;
- relevance;
- intent generation;
- decision packs;
- authority and evidence policies;
- progress and termination rules.

## 3.4. Agent Skills

Purpose:

> Explain how an agent should execute a typed intent.

Skills define:

- how to clarify ambiguity;
- how to generate hypotheses;
- how to find counterexamples;
- how to compare options;
- how to propose model extensions;
- how to return structured results;
- what must not be treated as evidence.

## 3.5. Runtime

Purpose:

> Control ticks, budgets, scheduling, tools, and external effects.

The runtime handles:

- candidate intent derivation;
- ranking and top-K scheduling;
- parallel agent execution;
- tool calls;
- timeouts and retries;
- budget accounting;
- result admission;
- snapshots;
- human checkpoints;
- persistence.

## 3.6. Human Authority

Humans remain responsible for:

- reviewing whether the model is sufficient;
- defining authority and trust policies;
- accepting residual risk;
- discovering missing concern axes;
- teaching the system after failures or omissions.

---

# 4. Core Ontology

> The examples below are prototypes. Exact syntax and identity representation should be adapted to the current ROFL/Codefacts implementation.

## 4.1. Decisions

```prolog
decision("atlas_launch", "production_readiness").
decision_scope("atlas_launch", "atlas_full_production").
decision_deadline("atlas_launch", "2026-08-31").
decision_authority("atlas_launch", "dana").
```

## 4.2. Claims and Obligations

```prolog
claim("requirements_complete").
claim("aggregate_capacity_verified").
claim("monitoring_ready").
claim("rollback_ready").
claim("billing_e2e_verified").

requires("atlas_launch", "requirements_complete").
requires("atlas_launch", "aggregate_capacity_verified").
requires("atlas_launch", "monitoring_ready").
requires("atlas_launch", "rollback_ready").
requires("atlas_launch", "billing_e2e_verified").

blocking("atlas_launch", "aggregate_capacity_verified").
blocking("atlas_launch", "billing_e2e_verified").
```

## 4.3. Assertions and Perspectives

```prolog
asserted_by("atlas_ready", "alex_pm").
perspective("alex_pm", "product").

asserted_by("aggregate_capacity_unknown", "dana").
perspective("dana", "engineering").
```

## 4.4. Evidence

```prolog
evidence("load_test_184").
evidence_kind("load_test_184", "measured").
produced_by("load_test_184", "k6").
supports("load_test_184", "capacity_3000_rps").
evidence_scope("load_test_184", "build_100_isolated_load").
```

## 4.5. Hypotheses

```prolog
hypothesis("source_rate_low").
hypothesis("pipeline_bottleneck").
hypothesis("customer_filtering").
hypothesis("metrics_incomplete").
```

## 4.6. Intent Identity

Datalog should not be required to generate fresh identifiers. Logical intent identity should be represented as a tuple:

```text
kind × decision × target × perspective
```

For example:

```prolog
candidate_intent(
    "verify",
    "atlas_launch",
    "aggregate_capacity_verified",
    "engineering"
).
```

The runtime may assign an execution ID:

```text
intent-run-2026-08-28-0042
```

---

# 5. Inquiry Kernel Prototype

## 5.1. Epistemic States

```prolog
supported(Claim) :-
    supports(_, Claim).

refuted(Claim) :-
    refutes(_, Claim).

contested(Claim) :-
    supported(Claim),
    refuted(Claim).
```

Unknowns should preferably be represented explicitly instead of being inferred only through negation:

```prolog
epistemic_state("aggregate_capacity_verified", "unknown").
epistemic_state("billing_e2e_verified", "unknown").
```

This preserves the distinction between:

```text
No supporting evidence was found.
```

and:

```text
The claim was proven false.
```

> **Amendment (2026-08-28, PR1):** the implemented kernel derives unknownness
> instead of hand-asserting it: `unknown :- claim(C), not supported(C),
> not refuted(C)`. Because claims are declared in the frame and `refuted`
> requires an explicit evidence-journal entry, this derives *unknownness*,
> never falsehood — the invariant lives in `refuted`, and no hand-maintained
> `epistemic_state` facts are needed. See `rules/inquiry/epistemic.rofl` and
> finding `f_roadmap_explicit_unknown`.

## 5.2. Proof Obligations

```prolog
obligation(Decision, Claim) :-
    decision(Decision, _),
    requires(Decision, Claim).
```

## 5.3. Open Obligations

```prolog
open_obligation(Decision, Claim) :-
    obligation(Decision, Claim),
    epistemic_state(Claim, "unknown").
```

## 5.4. Contested Obligations

```prolog
contested_obligation(Decision, Claim) :-
    obligation(Decision, Claim),
    contested(Claim).
```

## 5.5. Intent Generation

```prolog
candidate_intent(
    "verify",
    Decision,
    Claim,
    "evidence"
) :-
    open_obligation(Decision, Claim),
    observable(Claim).
```

```prolog
candidate_intent(
    "clarify",
    Decision,
    Claim,
    "semantics"
) :-
    obligation(Decision, Claim),
    ambiguous(Claim).
```

```prolog
candidate_intent(
    "discriminate",
    Decision,
    Claim,
    "evidence"
) :-
    contested_obligation(Decision, Claim).
```

```prolog
candidate_intent(
    "escalate",
    Decision,
    Claim,
    "authority"
) :-
    obligation(Decision, Claim),
    requires_authority(Claim).
```

## 5.6. Blocking Violations

```prolog
violated_blocking_obligation(Decision, Claim) :-
    blocking(Decision, Claim),
    refuted(Claim).
```

## 5.7. Preliminary Recommendations

```prolog
recommendation(Decision, "no_go") :-
    violated_blocking_obligation(Decision, _).
```

```prolog
recommendation(Decision, "insufficient_evidence") :-
    unresolved_critical_obligation(Decision, _),
    budget_exhausted(Decision).
```

A full `GO` should normally be derived by a domain-specific certificate rather than a generic rule.

---

# 6. Formal Intent Contract

Every executable intent should define:

```text
kind
target
parent decision
parent obligation
rationale
possible outcomes
expected model updates
admissible evidence
preferred sources
cost
priority
stop condition
escalation condition
```

Example:

```json
{
  "kind": "verify",
  "decision": "atlas_launch",
  "target": "aggregate_capacity_verified",
  "rationale": "Full production readiness requires capacity under combined load.",
  "possible_outcomes": [
    "supported",
    "refuted",
    "inconclusive"
  ],
  "admissible_evidence": [
    "measured load-test result",
    "production metrics",
    "capacity report"
  ],
  "preferred_sources": [
    "CI",
    "monitoring",
    "load-test storage"
  ],
  "cost": "medium",
  "stop_condition": "A scoped capacity bound has been established.",
  "escalation_condition": "Expected production load cannot be determined."
}
```

---

# 7. Intent Quality Discipline

An intent is admissible if it can do at least one of the following:

```text
- close an open obligation;
- change the recommendation;
- change the assurance level;
- eliminate a hypothesis;
- discover a blocker;
- test a high-impact assumption;
- propose a material model extension.
```

An intent should be rejected, postponed, or merged if:

```text
- its target has already been resolved;
- it duplicates another intent;
- it is subsumed by a more general or cheaper intent;
- none of its plausible outcomes would change the model;
- it has no observable outcome;
- its cost exceeds the remaining budget;
- it has no path to the current decision.
```

## Intent Quality Checklist

- [ ] The target claim is explicit.
- [ ] The parent obligation is explicit.
- [ ] The claim’s relevance to the decision is known.
- [ ] At least two plausible outcomes exist.
- [ ] Different outcomes update the model or assurance differently.
- [ ] Admissible evidence is defined.
- [ ] A stop condition exists.
- [ ] The intent does not duplicate an existing inquiry.
- [ ] The intent does not depend on an unresolved prerequisite.
- [ ] Its expected value is proportionate to its cost.

---

# 8. Progress Model

A successfully executed intent should produce at least one of:

```text
resolved obligation
supported or refuted claim
split ambiguous claim
eliminated hypothesis
discovered contradiction
added material concern
identified authority boundary
produced executable experiment
declared unresolvable within budget
```

Prototype facts:

```prolog
intent_outcome(IntentRun, "resolved_obligation").
intent_outcome(IntentRun, "added_evidence").
intent_outcome(IntentRun, "split_claim").
intent_outcome(IntentRun, "added_model_concern").
intent_outcome(IntentRun, "blocked").
```

Stagnation:

```prolog
stalled(IntentRun) :-
    intent_finished(IntentRun),
    intent_outcome(IntentRun, "no_progress").
```

Repeated stagnation may produce a reframing intent:

```prolog
needs_reframe(Decision, Target) :-
    repeated_stall(Decision, Target).
```

---

# 9. Scheduler and Cardinality Control

## 9.1. Candidate vs. Scheduled Intents

Codefacts derives:

```text
candidate_intent
```

The runtime selects:

```text
scheduled_intent
```

All candidates are preserved, but only a bounded subset is executed.

## 9.2. Frontier States

```text
candidate
scheduled
running
resolved
blocked
dormant
superseded
pruned_for_budget
```

## 9.3. Ranking

Initial symbolic model:

```prolog
intent_impact(Intent, "critical").
intent_cost(Intent, "cheap").
intent_discrimination(Intent, "strong").
intent_urgency(Intent, "immediate").
```

A policy maps combinations into priorities:

```text
critical + cheap + strong → highest
critical + expensive + strong → high
low + expensive + weak → dormant
```

## 9.4. Initial Execution Policy

```text
max_active_intents_per_tick = 3
max_agent_runs_per_intent = 3
max_new_children_per_intent = 3
human_checkpoint_after_ticks = 10
```

These values are runtime policy, not logical truth.

## 9.5. Exploration Budget

Example allocation:

```text
70% — closing known proof obligations;
20% — challenge and counterexample search;
10% — searching for missing concern axes.
```

## 9.6. Human Checkpoint

When the budget is exhausted, the system should show:

- current recommendation;
- supporting certificate;
- blockers;
- unresolved critical obligations;
- highest-value next intents;
- expected benefit of additional budget;
- a concrete question about whether inquiry should continue.

---

# 10. Runtime Loop

```text
1. Load the current fact base and snapshot.
2. Derive obligations and candidate intents.
3. Normalize intent targets.
4. Deduplicate and apply subsumption.
5. Remove resolved and superseded intents.
6. Compute relevance to the root decision.
7. Rank by expected value of computation.
8. Reserve an exploration quota.
9. Select a bounded batch.
10. Execute agents and deterministic tools.
11. Validate structured results.
12. Admit assertions and evidence.
13. Tick Codefacts.
14. Measure progress.
15. Build an anytime decision certificate.
16. Continue, terminate, or request human direction.
```

Pseudocode:

```js
while (!terminal(decision)) {
  const candidates = deriveCandidateIntents(decision);
  const normalized = normalizeAndDeduplicate(candidates);
  const eligible = filterEligible(normalized);
  const scheduled = selectBoundedBatch(eligible, budget);

  const results = await executeInParallel(scheduled);
  const admitted = validateAndAdmit(results);

  codefacts.assert(admitted);
  codefacts.tick();

  updateBudget(results);
  recordProgress(decision);

  if (checkpointRequired(decision))
    return buildHumanCheckpoint(decision);
}

return buildDecisionCertificate(decision);
```

---

# 11. Agent Skill

Suggested structure:

```text
skills/guided-formal-reasoning/
  SKILL.md
  clarify.md
  verify.md
  reason.md
  challenge.md
  discriminate.md
  compare.md
  propose-model-extension.md
  synthesize-decision.md
```

## 11.1. General Instructions

The agent must:

- execute the specific intent rather than restarting the entire analysis;
- preserve the target, scope, and perspective;
- distinguish hypotheses, assertions, and evidence;
- never treat its own generated reasoning as observed evidence;
- make assumptions explicit;
- return structured results;
- stop once the intent’s stop condition is met;
- avoid unrelated generic risks;
- return proposed model extensions separately from established facts.

## 11.2. `clarify`

- [ ] Which term or claim is ambiguous?
- [ ] What plausible interpretations exist?
- [ ] Would they affect the decision differently?
- [ ] What is the minimum question that distinguishes them?
- [ ] Who has authority to answer?
- [ ] Can the answer be obtained from documents instead of a person?

## 11.3. `verify`

- [ ] Which claim is being verified?
- [ ] What evidence is admissible?
- [ ] Which scope must the evidence cover?
- [ ] Is the evidence fresh?
- [ ] Does the system version match?
- [ ] Is there a direct source?
- [ ] Which assumptions remain after verification?
- [ ] Does the evidence support the full claim or only a weaker one?

## 11.4. `challenge`

- [ ] What is the weakest premise in the current derivation?
- [ ] What is the smallest plausible counterexample?
- [ ] How can it be observed?
- [ ] Would confirmation change the decision?
- [ ] Does the challenge duplicate an existing branch?
- [ ] Is the challenge proportionate to the stakes?

## 11.5. `discriminate`

- [ ] Which claims or hypotheses conflict?
- [ ] Do they predict different observations?
- [ ] What is the cheapest experiment that distinguishes them?
- [ ] Does the experiment depend on either disputed hypothesis?
- [ ] How should inconclusive results be represented?

## 11.6. `propose-model-extension`

- [ ] Which material concern is missing?
- [ ] Which decision does it affect?
- [ ] Is there a historical failure or precedent?
- [ ] Does a related canonical term already exist?
- [ ] Is this an alias, broader concept, narrower concept, or new perspective?
- [ ] Should it become a permanent rule?
- [ ] What regression test would demonstrate its importance?

---

# 12. Agent Result Format

```json
{
  "intent": {
    "kind": "verify",
    "decision": "atlas_launch",
    "target": "billing_e2e_verified"
  },
  "outcome": "progress",
  "assertions": [
    {
      "claim": "billing_e2e_verified",
      "state": "refuted",
      "asserted_by": "agent_claude",
      "perspective": "evidence",
      "based_on": ["chat_note_17"]
    }
  ],
  "evidence": [
    {
      "id": "chat_note_17",
      "kind": "human_assertion",
      "source": "sam_qa",
      "content": "We never tested that.",
      "scope": "atlas_billing",
      "observed_at": "2026-08-26"
    }
  ],
  "new_intents": [
    {
      "kind": "run_test",
      "target": "billing_e2e_verified",
      "rationale": "Measured E2E evidence is absent."
    }
  ],
  "model_extensions": [],
  "summary": "Current evidence refutes the claim that billing was tested E2E."
}
```

The runtime must validate the schema before admission.

---

# 13. Terminology and Canonicalization

## 13.1. Closed Core Vocabulary

The following should be controlled:

- intent kinds;
- epistemic states;
- evidence kinds;
- decision outcomes;
- perspective kinds;
- authority levels;
- lifecycle states.

Agents must not invent new epistemic states without an ontology change.

## 13.2. Extensible Domain Vocabulary

The system may add terms such as:

```text
aggregate_capacity
legacy_import
billing_e2e
language_filter
parquet_delivery
```

## 13.3. Relationships Between Terms

Semantic similarity must not be reduced to `same_as`.

Supported relationships should include:

```text
alias_of
same_as
broader_than
narrower_than
overlaps_with
possibly_related
```

## 13.4. Embedding Scanner

The embedding scanner produces candidates:

```prolog
semantic_candidate(
    "aggregate_capacity",
    "production_capacity",
    "0.91"
).
```

Embedding similarity is not proof of equivalence.

## 13.5. Reversible Normalization

Prefer mappings over destructive merges:

```prolog
maps_to("total_shared_load_capacity", "aggregate_capacity").
maps_to("combined_production_load", "aggregate_capacity").
```

Original mentions and provenance must remain available.

## 13.6. Canonicalization Checklist

- [ ] Are the terms equivalent or merely related?
- [ ] Does the scope match?
- [ ] Is one term broader or narrower?
- [ ] Would important qualifiers be lost?
- [ ] Is the mapping reversible?
- [ ] Is the original mention preserved?
- [ ] Would the merge change existing conclusions?
- [ ] Does the mapping pass mutation tests?

---

# 14. Multi-Agent Execution

## 14.1. Purpose

Multiple agents increase hypothesis and perspective coverage. They do not automatically provide independent confirmation of reality.

## 14.2. Example Roles

```text
Agent A — construct the strongest supporting case
Agent B — find counterexamples and missing assumptions
Agent C — judge scope and evidence quality
```

Alternatively:

```text
product
engineering
operations
customer
security
billing
```

## 14.3. Facts

```prolog
asserted_by(Claim, Agent).
agent_model(Agent, Model).
perspective(Agent, Perspective).
agent_role(Agent, Role).
```

## 14.4. Aggregation Checklist

- [ ] Did the agents receive the same scoped claim?
- [ ] Are their roles materially different?
- [ ] Do their arguments differ, or only their wording?
- [ ] Is external evidence available?
- [ ] Are three LLM outputs incorrectly treated as three measurements?
- [ ] Has the disagreement been localized?
- [ ] Does resolution require evidence, clarification, or authority?

---

# 15. Decision Packs and Checklists

## 15.1. Universal Framing Checklist

- [ ] What decision is being made?
- [ ] What underlying outcome is desired?
- [ ] What is the scope?
- [ ] What is the deadline?
- [ ] Who are the stakeholders?
- [ ] Who has decision authority?
- [ ] What constitutes success?
- [ ] What constitutes failure?
- [ ] Is the decision reversible?
- [ ] What is the cost of a false positive?
- [ ] What is the cost of a false negative?
- [ ] Is `do nothing` considered?
- [ ] Is the stated question a proxy for another problem?

## 15.2. Evidence Quality Checklist

- [ ] Is the evidence direct or indirect?
- [ ] Is the source deterministic, stochastic, human, or reality-measured?
- [ ] Does the source have authority in this domain?
- [ ] Does the evidence match the required scope?
- [ ] Is it fresh?
- [ ] Does it refer to the correct version?
- [ ] Is provenance available?
- [ ] Is there independent corroboration?
- [ ] Do several evidence items originate from one assertion?
- [ ] What exactly does the evidence prove?
- [ ] Which stronger claim does it not prove?
- [ ] Is it reproducible?

## 15.3. Production Readiness Checklist

### Requirements

- [ ] The specification exists and has an owner.
- [ ] Scope is explicit.
- [ ] Requirements are internally consistent.
- [ ] Ambiguous terms have been clarified.
- [ ] Assumptions are explicit.
- [ ] Blocking and optional requirements are separated.
- [ ] Acceptance criteria are defined.
- [ ] Known gaps are documented.
- [ ] Customer expectations are mapped to formal scope.

### Product Coverage

- [ ] Every requirement maps to a product capability.
- [ ] The capability is enabled in production configuration.
- [ ] The deployed version matches the tested version.
- [ ] Feature flags are configured.
- [ ] External dependencies are available.
- [ ] No unverified manual steps remain.

### Testing

- [ ] Functional tests were executed.
- [ ] E2E tests were executed.
- [ ] Negative tests were executed.
- [ ] The test oracle checks the required property.
- [ ] Test data is representative.
- [ ] The environment is representative.
- [ ] Results are reproducible.
- [ ] Evidence has not become stale after changes.

### Load and Capacity

- [ ] Expected average load is defined.
- [ ] Expected peak load is defined.
- [ ] Burst patterns are defined.
- [ ] Required duration is defined.
- [ ] Other customers’ aggregate load is included.
- [ ] Downstream dependencies were tested.
- [ ] Sufficient headroom exists.
- [ ] Acceptable degradation is defined.
- [ ] Backpressure and queue growth were tested.
- [ ] Recovery after overload was tested.

### Operations

- [ ] Monitoring collects key signals.
- [ ] Alerts are configured.
- [ ] SLO or acceptance thresholds are defined.
- [ ] An on-call owner is assigned.
- [ ] A runbook exists.
- [ ] Rollback was tested.
- [ ] A kill switch is available.
- [ ] Incident escalation is defined.
- [ ] Stakeholders have access to dashboards.

### Billing and Economics

- [ ] Pricing is agreed.
- [ ] Billing was tested end to end.
- [ ] Usage is measured correctly.
- [ ] Minimum charges and limits are applied.
- [ ] The cost model supports expected load.
- [ ] Cost anomalies are monitored.

### Customer Acceptance

- [ ] Acceptance tests are agreed.
- [ ] The customer verified the required output.
- [ ] Format and delivery mechanism are confirmed.
- [ ] Known limitations are accepted.
- [ ] Acceptance has an author and date.
- [ ] Temporary exceptions have an expiry.

### Launch Strategy

- [ ] Full, limited, or conditional launch is selected.
- [ ] Gradual rollout is possible.
- [ ] Traffic limits are configured.
- [ ] Rollback triggers are defined.
- [ ] A success/failure review is scheduled.

## 15.4. Incident Analysis Checklist

- [ ] Observation is separated from interpretation.
- [ ] A timeline exists.
- [ ] Recent changes are listed.
- [ ] Symptoms are not confused with root causes.
- [ ] Competing hypotheses are defined.
- [ ] Predicted observations exist for each hypothesis.
- [ ] A discriminating experiment is selected.
- [ ] Monitoring failure is considered.
- [ ] Shared dependencies are checked.
- [ ] Blast radius is understood.
- [ ] Mitigation is separated from permanent correction.
- [ ] A preventive invariant is identified.

## 15.5. Architecture Decision Checklist

- [ ] The problem is stated independently of the proposed solution.
- [ ] Constraints are listed.
- [ ] Must-haves and preferences are separated.
- [ ] `Do nothing` is considered.
- [ ] At least two realistic alternatives are considered.
- [ ] Performance, reliability, and complexity are compared.
- [ ] Operational cost is compared.
- [ ] Reversibility is assessed.
- [ ] Migration cost and lock-in are assessed.
- [ ] Failure modes are listed.
- [ ] Discriminating prototypes are defined.
- [ ] Evidence that would change the decision is documented.

---

# 16. Decision Certificate

The system should produce a structured result:

```yaml
decision: atlas_launch
recommendation: CONDITIONAL_GO
scope: 10_percent_production_traffic
assurance: medium

supported:
  - requirements_complete
  - monitoring_ready
  - rollback_ready

blocking:
  - billing_e2e_verified: refuted

contested:
  - legacy_import_is_mandatory

unknown:
  - aggregate_capacity_at_full_load

conditions:
  - traffic_limit_is_10_percent
  - kill_switch_enabled
  - on_call_owner_assigned

residual_risks:
  - full aggregate capacity not measured

requires_human_authority:
  - accept temporary capacity uncertainty

next_best_intents:
  - run aggregate load test
  - clarify legacy import requirement

frontier:
  active: 2
  dormant: 17
  resolved: 11

budget:
  consumed_ticks: 8
  remaining_ticks: 2
```

Certificate checklist:

- [ ] Recommendation has an explicit scope.
- [ ] Assurance is stated.
- [ ] Supporting facts are listed.
- [ ] Blockers are listed.
- [ ] Unknowns are visible.
- [ ] Contested claims are visible.
- [ ] Assumptions are explicit.
- [ ] Conditions are executable.
- [ ] Residual risk is stated.
- [ ] Authority boundaries are explicit.
- [ ] Evidence has provenance.
- [ ] `why` and `whynot` are available.
- [ ] Next intents are listed.

---

# 17. Implementation Roadmap

## Phase 0 — Fix the Design Around One Use Case

### Goal

Choose one end-to-end use case: `production_readiness`.

### Artifacts

```text
docs/guided-formal-reasoning-roadmap.md
docs/adr/inquiry-engine.md
examples/atlas-launch/
```

### Work

- [ ] Describe one concrete decision.
- [ ] Define obligations manually.
- [ ] Collect a small evidence fixture.
- [ ] Define the expected certificate.
- [ ] Define authority boundaries.
- [ ] Create 5–10 mutation scenarios.

### Exit Criteria

- One real case can be represented as facts with an expected verdict.
- The `.cf` / skill / runtime boundary is clear.
- Embeddings and an advanced scheduler are not required.

---

## Phase 1 — Minimal Inquiry Kernel

### Goal

Implement the deterministic loop:

```text
obligation → epistemic state → candidate intent
```

### Implement

```text
rules/inquiry/ontology.cf
rules/inquiry/epistemic.cf
rules/inquiry/obligations.cf
rules/inquiry/intents.cf
```

### Support

```text
supported
refuted
unknown
contested

clarify
verify
discriminate
escalate
```

### Tests

- [ ] Unknown blocking claim produces `verify`.
- [ ] Ambiguous claim produces `clarify`.
- [ ] Supported and refuted produce `contested`.
- [ ] Contested claim produces `discriminate`.
- [ ] Authority-only claim produces `escalate`.
- [ ] Resolved obligation produces no new intent.
- [ ] Missing evidence does not derive `refuted`.

### Exit Criteria

- `why` and `whynot` explain where an intent came from.
- Mutating epistemic state changes the frontier.
- The kernel contains no production-specific semantics.

---

## Phase 2 — Agent Execution Contract

### Goal

Allow one agent to execute typed intents and return validated results.

### Implement

```text
skills/guided-formal-reasoning/SKILL.md
skills/guided-formal-reasoning/clarify.md
skills/guided-formal-reasoning/verify.md
skills/guided-formal-reasoning/challenge.md

runtime/execute-intent.mjs
runtime/admission.mjs

schemas/intent-result.json
```

### Tests

- [ ] The agent preserves target and decision.
- [ ] The response passes JSON schema validation.
- [ ] Agent reasoning is not admitted as measured evidence.
- [ ] New concerns are returned separately.
- [ ] `no_progress` is a valid outcome.
- [ ] Every intent has a bounded stop condition.
- [ ] The agent does not restart framing without a meta-intent.

### Exit Criteria

- One intent can be executed, admitted, and recomputed.
- Invalid agent output cannot contaminate the fact base.

---

## Phase 3 — Production Readiness Decision Pack

### Goal

Build the first useful domain pack.

### Implement

```text
rules/decisions/production-readiness.cf
rules/policies/evidence.cf
rules/policies/authority.cf
examples/atlas-launch/
```

### Criteria

- requirements;
- product coverage;
- testing;
- load;
- monitoring;
- rollback;
- billing;
- dependencies;
- customer acceptance.

### Tests

- [ ] Removing billing reduces model coverage.
- [ ] A failed blocking test produces `NO-GO`.
- [ ] An unknown blocking test prevents unconditional `GO`.
- [ ] An accepted non-blocking gap permits `CONDITIONAL_GO`.
- [ ] Limited rollout may be permitted without full-capacity proof.
- [ ] Stale tests do not support the current deployment.
- [ ] Isolated load does not prove aggregate capacity.

### Exit Criteria

- The system builds a readiness certificate for one real launch.
- A human can review it without manually collecting all facts.

---

## Phase 4 — Tick Runtime, Budget, and Anytime Output

### Goal

Make inquiry bounded and persistent.

### Implement

```text
runtime/tick.mjs
runtime/scheduler.mjs
runtime/budget.mjs
runtime/checkpoint.mjs

rules/inquiry/progress.cf
rules/inquiry/termination.cf
```

### Support

- candidate vs. scheduled intents;
- top-K execution;
- tick budget;
- token and time budgets;
- stagnation detection;
- human checkpoints;
- anytime certificates.

### Tests

- [ ] No more than top-K intents are executed.
- [ ] Unexecuted intents are preserved.
- [ ] Budget exhaustion produces a checkpoint.
- [ ] Resolved intents are not executed again.
- [ ] Stalled intents obey retry policy.
- [ ] A certificate exists after every tick.
- [ ] Inconclusive results are not treated as success.

### Exit Criteria

- Inquiry cannot continue indefinitely without a checkpoint.
- The frontier survives process termination and restart.

---

## Phase 5 — Relevance, Deduplication, and Terminology

### Goal

Limit semantic multiplication of intents.

### Implement

```text
rules/inquiry/relevance.cf
rules/inquiry/terminology.cf
scanners/embeddings.mjs
runtime/canonicalize.mjs
facts/terminology/
```

### First Version

Use manually controlled canonical terms and aliases.

### Second Version

Add embedding candidates:

```text
mention
  → semantic candidates
  → relation proposal
  → admission
```

### Tests

- [ ] Alias intents normalize to one target.
- [ ] Broader and narrower concepts remain distinct.
- [ ] Mappings are reversible.
- [ ] Original mention provenance is preserved.
- [ ] Duplicate intents are not executed twice.
- [ ] Scope qualifiers are preserved.
- [ ] Embedding similarity does not create automatic equivalence.

### Exit Criteria

- Semantic duplicates do not materially inflate the active frontier.
- Incorrect mappings can be reverted without data loss.

---

## Phase 6 — Priority and Rational Metareasoning

### Goal

Move from FIFO or all-intents execution to best-first inquiry.

### Implement

```text
rules/inquiry/priority.cf
rules/inquiry/subsumption.cf
runtime/value-of-computation.mjs
```

### Initial Model

Use symbolic values:

```text
impact
cost
discrimination
urgency
```

### Later Model

Use semiring annotations:

```text
confidence
expected information gain
decision influence
execution cost
```

### Tests

- [ ] Cheap critical clarification outranks expensive dependent work.
- [ ] A strong discriminating experiment outranks generic analysis.
- [ ] A subsumed intent becomes `superseded`.
- [ ] An intent with no decision path becomes `dormant`.
- [ ] Exploration receives a guaranteed quota.
- [ ] A critical blocker is not displaced by many low-impact intents.

### Exit Criteria

- The scheduler remains productive with tens or hundreds of candidate intents.
- Priority can be explained through `why`.

---

## Phase 7 — Multi-Agent Perspectives

### Goal

Increase hypothesis recall and contradiction detection.

### Implement

```text
runtime/multi-agent.mjs
rules/inquiry/perspectives.cf
skills/guided-formal-reasoning/perspectives.md
```

### Roles

```text
advocate
challenger
evidence judge
product
engineering
operations
customer
```

### Tests

- [ ] Assertions preserve agent model and perspective.
- [ ] Disagreements are localized to claims.
- [ ] Three LLM assertions do not become measured evidence.
- [ ] Scope conflicts produce split or clarification intents.
- [ ] Risk preference conflicts produce authority intents.
- [ ] Factual conflicts produce discriminating intents.

### Exit Criteria

- Multi-agent execution produces structured perspectives rather than unrelated essays.

---

## Phase 8 — Model Expansion and Learning Loop

### Goal

Convert human observations into permanent executable knowledge.

### Implement

```text
rules/inquiry/model-extension.cf
skills/guided-formal-reasoning/propose-model-extension.md
runtime/admit-model-extension.mjs
test/mutations/model-coverage/
```

### Learning Cycle

```text
Human discovers missing billing concern
  → model extension proposal
  → add canonical term
  → add decision rule
  → add regression or mutation test
  → apply to future launches
```

### Model Extension Checklist

- [ ] Would the missing concern affect the decision?
- [ ] Is it recurring or case-specific?
- [ ] Which decision pack owns it?
- [ ] Does an existing term already cover it?
- [ ] Which rule should be added?
- [ ] Which mutation demonstrates that the rule has teeth?
- [ ] Who has authority to approve the ontology change?
- [ ] Could the rule create persistent false positives?

### Exit Criteria

- A human-discovered gap becomes a pull request containing a rule and test.
- Future decision packs automatically reuse the new knowledge.

---

## Phase 9 — Advanced Provenance, Snapshots, and Temporal Validity

### Goal

Support a changing operational world.

### Implement

```text
rules/inquiry/temporal.cf
rules/inquiry/provenance.cf
runtime/snapshot.mjs
```

### Support

- snapshot identity;
- evidence validity intervals;
- build and deployment scope;
- supersession;
- invalidation after deployment;
- correlated source tracking.

### Tests

- [ ] A new deployment invalidates version-specific tests.
- [ ] Historical evidence remains stored but is no longer current.
- [ ] Three documents derived from one assertion are not independent.
- [ ] Snapshot invalidation recomputes the certificate.

### Exit Criteria

- A certificate cannot accidentally combine evidence from incompatible world states.

---

## Phase 10 — Guarded Actions

### Goal

Allow the runtime to perform safe actions in addition to inquiry.

### Examples

- create a tracker task;
- request clarification;
- run a read-only query;
- execute an approved test;
- prepare a rollout plan;
- notify an owner.

### Requirements

- action allowlist;
- authority policy;
- cost limits;
- idempotency;
- audit log;
- rollback;
- human approval for high-impact actions.

### Exit Criteria

- Every side effect is bounded, explainable, and auditable.
- Reasoning and execution share one provenance trail.

---

# 18. Mutation and Regression Testing

Every invariant should be tested by changing its premises and verifying that the conclusion changes.

## Evidence Removal

```text
Remove load-test evidence.
Expected: full GO disappears.
```

## Scope Mutation

```text
Replace aggregate load with isolated load.
Expected: aggregate capacity becomes unknown.
```

## Freshness Mutation

```text
Add a new deployment.
Expected: the old test becomes stale.
```

## Contradiction Mutation

```text
Add refuting evidence.
Expected: the claim becomes contested.
```

## Authority Mutation

```text
Replace authorized acceptance with an observer’s opinion.
Expected: the risk is no longer considered accepted.
```

## Model Coverage Mutation

```text
Remove the billing concern.
Expected: coverage warning or certificate regression.
```

## Scheduler Mutation

```text
Add 100 low-impact intents.
Expected: the critical blocker remains in top-K.
```

## Terminology Mutation

```text
Merge isolated capacity with aggregate capacity.
Expected: terminology tests detect invalid claim strengthening.
```

---

# 19. Success Metrics

## 19.1. Reasoning Quality

- percentage of intents producing formal progress;
- percentage of stalled intents;
- average ticks to certificate;
- number of open high-impact obligations;
- contradictions discovered;
- claims with provenance;
- unsupported conclusions detected.

## 19.2. Cardinality Control

- candidate intents per tick;
- scheduled intents per tick;
- frontier growth factor;
- duplicate and subsumed intent ratio;
- active frontier size;
- dormant frontier size;
- maximum active branch depth.

## 19.3. Human Efficiency

- manual questions required per decision;
- human review time per certificate;
- questions resolved without a human;
- escalations containing complete context;
- missing concerns discovered by humans;
- human observations converted into rules and tests.

## 19.4. Operational Value

- reduction in chat interruptions;
- time to readiness verdict;
- premature launches prevented;
- launches converted into safe limited rollouts;
- reuse rate of decision packs.

---

# 20. Core System Invariants

```text
Every blocking criterion must have an explicit epistemic state.
```

```text
Absence of evidence must not derive falsehood.
```

```text
LLM reasoning must not be treated as measured evidence.
```

```text
Every scheduled intent must have a parent decision or an explicit exploration justification.
```

```text
Every intent must have a stop condition.
```

```text
Every completed intent must report progress or blockage.
```

```text
A contested blocking claim prevents unconditional GO.
```

```text
Evidence must not inherit scope or freshness implicitly.
```

```text
Semantic similarity must not create equivalence automatically.
```

```text
Several artifacts derived from one primary source must not count as independent corroboration.
```

```text
Budget exhaustion must produce a human checkpoint rather than infinite reasoning.
```

```text
An anytime certificate must be available after every tick.
```

```text
A recurring gap discovered by a human must be representable as a rule and regression test.
```

---

# 21. Proposed Repository Layout

```text
codefacts/
  boot.cf

  docs/
    guided-formal-reasoning-roadmap.md
    adr/
      inquiry-engine.md

  rules/
    inquiry/
      ontology.cf
      epistemic.cf
      obligations.cf
      intents.cf
      relevance.cf
      progress.cf
      termination.cf
      terminology.cf
      perspectives.cf
      provenance.cf
      temporal.cf
      model-extension.cf

    decisions/
      production-readiness.cf
      incident-analysis.cf
      architecture-choice.cf

    policies/
      authority.cf
      evidence.cf
      budget.cf
      scheduling.cf

  facts/
    generated/
    sessions/
    terminology/
    authority/

  scanners/
    chat.mjs
    tracker.mjs
    docs.mjs
    tests.mjs
    monitoring.mjs
    deployments.mjs
    embeddings.mjs

  runtime/
    tick.mjs
    scheduler.mjs
    executor.mjs
    admission.mjs
    budget.mjs
    checkpoint.mjs
    snapshot.mjs
    canonicalize.mjs
    multi-agent.mjs

  skills/
    guided-formal-reasoning/
      SKILL.md
      clarify.md
      verify.md
      reason.md
      challenge.md
      discriminate.md
      compare.md
      perspectives.md
      propose-model-extension.md
      synthesize-decision.md

  schemas/
    intent.json
    intent-result.json
    decision-certificate.json
    model-extension.json

  examples/
    atlas-launch/

  test/
    inquiry-kernel.test.mjs
    production-readiness.test.mjs
    terminology.test.mjs
    scheduler.test.mjs
    mutations/
```

---

# 22. Immediate Implementation Plan

## First Pull Request

- [ ] Add this roadmap.
- [ ] Define the minimal ontology.
- [ ] Implement `obligation → unknown → verify intent`.
- [ ] Implement `contested → discriminate intent`.
- [ ] Add inquiry kernel tests.
- [ ] Create a minimal Atlas fixture.

## Second Pull Request

- [ ] Create `guided-formal-reasoning/SKILL.md`.
- [ ] Define `clarify`, `verify`, and `challenge`.
- [ ] Add the agent result JSON schema.
- [ ] Implement one `derive → execute → admit → recompute` tick.

## Third Pull Request

- [ ] Add `production-readiness.cf`.
- [ ] Convert the readiness checklist into obligations.
- [ ] Build the first decision certificate.
- [ ] Mutation-test billing, load, monitoring, and rollback.

## Fourth Pull Request

- [ ] Add budgets.
- [ ] Add candidate and scheduled frontier states.
- [ ] Implement top-K selection and human checkpoints.
- [ ] Add anytime summaries.

## Fifth Pull Request

- [ ] Add controlled terminology.
- [ ] Implement aliases and reversible mappings.
- [ ] Add embedding candidates without automatic merging.
- [ ] Implement intent deduplication.

---

# 23. First-Version Success Criterion

The first version is successful if, when asked:

> Are we ready to launch Atlas?

it can:

1. Create an explicit set of readiness obligations.
2. Show supported, refuted, unknown, and contested claims.
3. Derive concrete inquiry intents.
4. Execute those intents through an agent or scanner.
5. Avoid treating agent reasoning as evidence.
6. Stop according to a budget.
7. Return `GO`, `NO-GO`, `CONDITIONAL_GO`, or `INSUFFICIENT_EVIDENCE`.
8. Explain `why` and `whynot`.
9. Preserve the unexecuted frontier.
10. Let a human add a missing billing concern as a rule with a regression test.

---

# 24. Final Design Principle

The system should combine:

```text
broad persistent memory
+ a small active frontier
+ deterministic proof obligations
+ stochastic hypothesis expansion
+ paraconsistent perspectives
+ best-first scheduling
+ bounded budgets
+ anytime decision certificates
+ human learning encoded as rules and tests
```

The primary cardinality-control principle is:

> Preserve everything, activate little, and choose the next step according to its expected effect on the decision.

The final responsibility boundary is:

```text
Scanner:
  Converts external reality into facts.

Codefacts:
  Determines what follows from those facts and which inquiry is required.

Agent skill:
  Determines how to execute that inquiry well.

Runtime:
  Determines what to execute now, with which agent, and under which budget.

Human:
  Reviews model sufficiency, defines authority, accepts residual risk,
  and turns discovered gaps into permanent executable knowledge.
```

# MOOT — proving which feature flags are dead

Every large codebase has hundreds of feature flags and nobody can prove which
ones are dead. They get deleted by feel — by creation date, by "the experiment
finished surely" — and every so often somebody deletes a live one and takes
down checkout.

The usual instrument is traffic: *this flag was not seen in the logs*. That is
statistics, and it lies at low traffic. A flag guarding an enterprise-only path
in one region may legitimately see nothing for a month, and a flag that CANNOT
be on looks exactly the same in the dashboard.

MOOT answers a different question, with a proof:

> **is there any context at all in which this flag can be on?**

A flag IS a rule-as-data. Its enabling condition is a predicate over a context
— segment, region, version, rollout bucket, channel, another flag — and a
config file is already the reflection of that rule. Nothing needs translating.
So MOOT is `boot.rofl`'s faculty pointed at a domain: rules over the reflection
of other rules, condemning them, with a derivation tree.

```
MOOT — proving which feature flags are dead.
not "we saw no traffic": proofs about the structure of the conditions.

config   52 flags, 65 clauses, 104 conditions, 1 exclusion, parsed into 553 facts
context  segment:6 x region:8 x version:12 x bucket:10 x channel:4 = 23,040 contexts
rules    examples/moot/moot.rofl, loaded next to boot.rofl
```

## Run it

```
node --experimental-strip-types examples/moot/demo.ts
```

Everything below is that program's stdout, pasted. The test suite
(`test/example-moot.test.ts`) runs the same code and pins the same output.

## The five verdicts

| verdict | what it proves |
|---|---|
| `unreachable(F)` | no context whatsoever turns F on |
| `shadowed(F, C, C0)` | another clause admits every context C admits, so deleting C changes no decision |
| `tautological(F, C)` | C constrains nothing and needs nothing: the flag is effectively deleted, the branch is not |
| `contradictory(F, G, C1, C2)` | two flags declared mutually exclusive are both on somewhere, so behaviour is decided by the order of the branches |
| `dependent(F, G)` | every usable clause of F requires G: F's own conditions never decide anything |

All five live in `[audit]`, next to `boot.rofl`'s `malformed`, `breach`, `leak`,
`forged`, `unmoded` and `undefined_premise`, and are written the same way.

```
52 flags in. 5 of them can never be on, under any of the 23,040 contexts:
  unreachable   eu_price_test    1 clause(s): version empty
  unreachable   loyalty_banner   1 clause(s): segment empty
  unreachable   new_checkout     2 clause(s): needs payments_v2 | channel empty
  unreachable   payments_v2      1 clause(s): region empty
  unreachable   wallet_topup     1 clause(s): needs new_checkout

  shadowed      ai_summaries     c_ai_summaries_2 is contained in c_ai_summaries_1
                                 "segment is pro; region is us; channel is beta"
                                 inside "segment in pro team enterprise; channel in beta canary"
  shadowed      bulk_export      c_bulk_export_2 is contained in c_bulk_export_1
                                 "segment is enterprise; version >= 5; needs data_lake"
                                 inside "segment is enterprise; version >= 5"
  tautological  dark_mode        c_dark_mode_1 constrains nothing and needs nothing
  contradictory express_checkout and one_page_checkout are declared exclusive, and
                c_express_checkout_1 overlaps c_one_page_checkout_1

  dependent     7 flags cannot be enabled by their own condition at all:
                audit_log_export->data_lake cost_alerts->usage_dashboard
                feature_usage_beacon->telemetry_v2
                mention_notifications->inline_comments
                referral_widget->growth_experiments
                risk_manual_review->fraud_score_v3 scim_provisioning->sso_saml

  A flag audit that counts requests would call most of these healthy: they
  have no traffic because they have no reachable context, which reads exactly
  like a flag nobody happens to have hit yet. The difference is a proof.
```

## The hygiene the rest of it rests on

Every rule range-restricted, nothing demand-evaluated, nothing unstratifiable,
and every `boot.rofl` audit over MOOT's own reflection empty. If a rule were
unsafe the engine would unfold it top-down at call sites and the semiring folds
would run over a different fact set than the verdicts describe — so this is
checked before anything else, not assumed.

Every verdict negates something, so the ordering matters and it is READ from
`stratum/2`, which `boot.rofl` computes from MOOT's rule dependency graph.
Nothing in the kernel schedules it.

```
  65 rules loaded (boot.rofl + moot.rofl); every one range-restricted: true
  relations evaluated by demand (top-down unfolding): 0
  unstratified: (none)
  boot.rofl's audits over MOOT's own reflection: malformed 0, breach 0, leak 0, forged 0, unmoded 0, undefined_premise 0

  the strata boot.rofl computed for MOOT, from the rule dependency graph.
  Every verdict below negates something, so this is the ordering that makes
  them mean anything — read off stratum/2, not assumed:
    stratum(cond_admits,      1)
    stratum(rejects,          2)
    stratum(admits,           3)
    stratum(empty,            4)
    stratum(usable,           5)
    stratum(live,             5)
    stratum(unreachable,      6)
    stratum(shadowed,         5)
    stratum(tautological,     3)
    stratum(contradictory,    5)
    stratum(dependent,        6)
```

## whynot: the question people currently answer with a canary

`moot -n new_checkout` — why can this flag not turn on, and what would have to
change. Today that answer is obtained experimentally: ship to a canary and
wait.

```
$ moot -n new_checkout

whynot live[main](f_new_checkout):
  rule r09d4c1fc: live[main](?F)@now :- ordered[main](?F,?C,?_$1)@now, usable[main](?C)@now
    failed premise: usable[main](c_new_checkout_1)
      rule r1f24f2b8: usable[main](?C)@now :- clause_known[main](?C)@now, not dead_clause[main](?C)@now, ok_from[main](?C,1)@now
        failed premise: ok_from[main](c_new_checkout_1,1)
          rule re44c5a95: ok_from[main](?C,?K)@now :- req_at[main](?C,?K,?G)@now, live[main](?G)@now, ?K1 is +(?K,1), ok_from[main](?C,?K1)@now
            failed premise: live[main](f_payments_v2)
              rule r09d4c1fc: live[main](?F)@now :- ordered[main](?F,?C,?_$1)@now, usable[main](?C)@now
                failed premise: usable[main](c_payments_v2_1)
                  rule r1f24f2b8: usable[main](?C)@now :- clause_known[main](?C)@now, not dead_clause[main](?C)@now, ok_from[main](?C,1)@now
                    failed premise: not dead_clause[main](c_payments_v2_1) -- blocked: dead_clause[main](c_payments_v2_1) holds
          rule r81b00576: ok_from[main](?C,?N1)@now :- req_count[main](?C,?N)@now, ?N1 is +(?N,1)
            failed premise: 1 is +(1,1) [builtin fails]
    failed premise: usable[main](c_new_checkout_2)
      rule r1f24f2b8: usable[main](?C)@now :- clause_known[main](?C)@now, not dead_clause[main](?C)@now, ok_from[main](?C,1)@now
        failed premise: not dead_clause[main](c_new_checkout_2) -- blocked: dead_clause[main](c_new_checkout_2) holds

read it as a sentence. new_checkout has two clauses and BOTH are dead, for
two different reasons, and the tree names both:

  c_new_checkout_1:  segment in pro team enterprise; region in us ca; version >= 7; needs payments_v2
    needs payments_v2, and payments_v2 is itself unreachable —
      c_payments_v2_1: region in us ca; region in eu uk
      dimension 'region' is empty: "region in us ca" and "region in eu uk" share no value

  c_new_checkout_2:  channel is dev; channel is canary
    dimension 'channel' admits nothing: "channel is dev" and "channel is canary" share no value
    to revive it, delete one of: "channel is dev", "channel is canary"

and that is the whole answer: which condition, at which clause, and what
would have to change. Nobody had to ship it to a canary to find out.
```

Two clauses, two different causes, both named: one dies on a requirement whose
own condition is empty, the other on a pair of conditions that share no value.
The recursion through the requirement chain is `whynot`'s own — nothing in
MOOT arranges it.

### the emptiness no PAIR of conditions explains

`conflict/4` is the human-readable naming of an emptiness: two conditions on
one dimension that share no value. It is sufficient and NOT necessary, and the
config contains the case that proves it.

```
  loyalty_banner:  segment in free trial; segment in trial pro; segment in free pro

    "segment in free trial" admits {free, trial}
    "segment in trial pro" admits {pro, trial}
    "segment in free pro" admits {free, pro}

  every PAIR of them intersects. All three together do not, and
  conflict/4 correctly names no pair: true
  `empty(C, D)` is the proof — the intersection itself, not a pairwise
  approximation of it. A linter that looks for contradicting pairs misses
  this flag, and this is the commonest way a segment list goes empty:
  three people each narrowed it once.
```

`empty(C, D)` is the proof — the intersection itself. A linter that greps for
contradicting pairs misses this flag, and this is the commonest way a segment
list goes empty: three people each narrowed it once.

## Best-derivation: not "reachable" but a context you can paste

```
  scim_provisioning    segment=enterprise region=us version=10 bucket=0 channel=stable
                       via c_scim_provisioning_1 + c_sso_saml_1
  win_back_campaign    segment=free region=us version=1 bucket=0 channel=stable
                       via c_win_back_campaign_1
  realtime_presence    segment=team region=us version=11 bucket=0 channel=stable
                       via c_realtime_presence_1

the engine is handed the first one back as ctx/2 facts and asked to prove it:
$ ctx(segment, enterprise).  ctx(region, us).  ctx(version, 10).  ctx(bucket, 0).  ctx(channel, stable).
$ why flag_on(f_scim_provisioning)
flag_on[main](f_scim_provisioning)  <= rbb8a7699 @tick 0
  ordered[main](f_scim_provisioning,c_scim_provisioning_1,1) [axiom]
  ctx_ok[main](c_scim_provisioning_1)  <= r7543e143 @tick 0
    clause_known[main](c_scim_provisioning_1)  <= r3d568e85 @tick 0
      ordered[main](f_scim_provisioning,c_scim_provisioning_1,1) [axiom]
    not ctx_bad[main](c_scim_provisioning_1) [finite failure]
      whynot ctx_bad[main](c_scim_provisioning_1):
        rule r8045b66c: ctx_bad[main](?C)@now :- clause_known[main](?C)@now, dim[main](?D)@now, not ctx_dim_ok[main](?C,?D)@now
          failed premise: not ctx_dim_ok[main](c_scim_provisioning_1,bucket) -- blocked: ctx_dim_ok[main](c_scim_provisioning_1,bucket) holds
          failed premise: not ctx_dim_ok[main](c_scim_provisioning_1,channel) -- blocked: ctx_dim_ok[main](c_scim_provisioning_1,channel) holds
          failed premise: not ctx_dim_ok[main](c_scim_provisioning_1,region) -- blocked: ctx_dim_ok[main](c_scim_provisioning_1,region) holds
          failed premise: not ctx_dim_ok[main](c_scim_provisioning_1,segment) -- blocked: ctx_dim_ok[main](c_scim_provisioning_1,segment) holds
          failed premise: not ctx_dim_ok[main](c_scim_provisioning_1,version) -- blocked: ctx_dim_ok[main](c_scim_provisioning_1,version) holds
  on_here[main](c_scim_provisioning_1,1)  <= rd308e215 @tick 0
    req_at[main](c_scim_provisioning_1,1,f_sso_saml) [axiom]
    flag_on[main](f_sso_saml)  <= rbb8a7699 @tick 0
      ordered[main](f_sso_saml,c_sso_saml_1,1) [axiom]
      ctx_ok[main](c_sso_saml_1)  <= r7543e143 @tick 0
        clause_known[main](c_sso_saml_1)  <= r3d568e85 @tick 0
          ordered[main](f_sso_saml,c_sso_saml_1,1) [axiom]
        not ctx_bad[main](c_sso_saml_1) [finite failure]
          whynot ctx_bad[main](c_sso_saml_1):
            rule r8045b66c: ctx_bad[main](?C)@now :- clause_known[main](?C)@now, dim[main](?D)@now, not ctx_dim_ok[main](?C,?D)@now
              failed premise: not ctx_dim_ok[main](c_sso_saml_1,bucket) -- blocked: ctx_dim_ok[main](c_sso_saml_1,bucket) holds
              failed premise: not ctx_dim_ok[main](c_sso_saml_1,channel) -- blocked: ctx_dim_ok[main](c_sso_saml_1,channel) holds
              failed premise: not ctx_dim_ok[main](c_sso_saml_1,region) -- blocked: ctx_dim_ok[main](c_sso_saml_1,region) holds
              failed premise: not ctx_dim_ok[main](c_sso_saml_1,segment) -- blocked: ctx_dim_ok[main](c_sso_saml_1,segment) holds
              failed premise: not ctx_dim_ok[main](c_sso_saml_1,version) -- blocked: ctx_dim_ok[main](c_sso_saml_1,version) holds
      on_here[main](c_sso_saml_1,1)  <= r7fc06a55 @tick 0
        req_count[main](c_sso_saml_1,0) [axiom]
        1 is +(0,1) [builtin]
    2 is +(1,1) [builtin]
    on_here[main](c_scim_provisioning_1,2)  <= r7fc06a55 @tick 0
      req_count[main](c_scim_provisioning_1,1) [axiom]
      2 is +(1,1) [builtin]

the tree bottoms out in admits/3 — the same per-dimension sets the audits
used — and in the requirement chain: scim_provisioning needs sso_saml, and
sso_saml is on in the same context. 26 of 52 flags are on there.
  oracle: AGREE — the witness context turns scim_provisioning on
```

The search over coalitions of clauses is host code — v0 has no choice operator
— but every set it intersects is the engine's `admits/3`, and the answer is
handed straight back to the engine to prove. The tree bottoms out in the same
per-dimension sets the audits used.

## Semirings

```
counting over the support hypergraph: how many INDEPENDENT routes enable
each flag. 32 of the 47 live flags have exactly one:
  address_autocomplete apple_pay checkout_upsell cost_alerts dark_mode
  dunning_emails empty_state_illustrations express_checkout
  feature_usage_beacon google_pay guest_checkout inline_comments
  invoice_pdf_v3 keyboard_shortcuts localized_pricing mention_notifications
  offline_mode onboarding_v4 one_page_checkout pix_payments realtime_presence
  saved_cards seat_management sepa_direct_debit slow_query_log
  subscription_pause tax_engine_v2 telemetry_v2 trial_extension upi_payments
  usage_dashboard win_back_campaign

one route means one segment list, one version window, one gate flag. The
day that segment stops existing the flag dies and no test fails. The 15
with more than one route survive losing one:
  referral_widget          4
  bulk_export              3
  ai_summaries             2
  audit_log_export         2
  command_palette          2
  crash_reporter           2
  data_lake                2
  fraud_score_v3           2
  growth_experiments       2
  new_nav                  2
  risk_manual_review       2
  scim_provisioning        2
  search_rerank            2
  sso_saml                 2
  three_ds_v2              2

IN THIS DOMAIN THE COUNT IS ROBUSTNESS, not magnitude: it counts derivations
of live/1, never contexts or users. Two routes are two ways to be switched
on, the way two policies are two ways to be allowed in NOPE — not two log
lines, the way they are in HUH.

the fold reports cyclic: 66 facts on a cycle of the support graph, all of
them in reach, stratum — boot.rofl's transitive closure over MOOT's own
mutually recursive relations (live -> usable -> ok_from -> live). NO flag fact
is on a cycle, because the requirement graph of this config is a DAG, which is
why every count above is a finite number rather than "infinitely many".
  flag facts on a cycle: 0

tropical (min-plus, 1 per firing) on the same graph gives GATE DEPTH: how
many other flags must already be on. The identity cost = 5G + 4 is checked,
not assumed — gateDepth() throws if a cost is not of that form.
  depth 0   40 flags
  depth 1   7 flags   audit_log_export cost_alerts feature_usage_beacon mention_notifications referral_widget risk_manual_review scim_provisioning

and one thing the semirings do NOT give here, measured rather than argued:
provenance folded with the 104 cond/4 facts as the base annotation puts
0 of them in the polynomial of live/1. Zero, and necessarily zero: liveness
rests on `not dead_clause`, and a negated premise contributes the
multiplicative identity because finite failure carries no annotation
(src/semiring.ts says so in its header). An audit built on universal
quantification is exactly the shape that provenance cannot follow. The
per-condition answer comes from cond_admits/2 and empty/2 instead, which is
what section 2 printed.
```

**What the count means here.** In MOOT it is ROBUSTNESS, as in NOPE and OOPS,
and not magnitude as in HUH. It counts derivations of `live/1` — ways to be
switched on — never contexts and never users. A flag with one route dies
silently the day its one segment stops existing.

## Reflection, for real: the engine pointed at rule sets

The strongest thing in the kernel is that `boot.rofl` judges a loaded program
using its own rules over that program's reflection. MOOT is that faculty
pointed at a domain — so point it back. The mapping is not an analogy; it is
the same structure read twice:

| MOOT | a ROFL program |
|---|---|
| flag | a relation |
| clause | a rule concluding it (plus a condition-free clause if the store holds base facts for it) |
| condition | one body element, as a dimension over `{yes, no}` |
| requirement | a relation the rule reads POSITIVELY |
| `exclusive/2` | **no analogue** — a rule set declares no mutual exclusions |

Four of the five verdicts transfer. Saying which one does not is part of the
answer.

```
boot.rofl is the meta-kernel: its rules, over the REFLECTION of a loaded
program, condemn that program. MOOT is the same faculty pointed at a domain.
So point MOOT at boot.rofl. The mapping is not an analogy — it is the same
structure read twice:

   flag := a relation      clause := a rule concluding it
   condition := one body element, over {yes, no}
   requirement := a relation the rule reads POSITIVELY

  22 rules encoded as clauses over 38 dimensions, 29 relations as flags

  unreachable relations: asserted_by forged imports
  rules that can never fire in this store: 3
    r0145d338  sees[main](?P,?Q)@now :- imports[main](?P,?X)@now, sees[main](?X,?Q)@now
    r66afcc0f  forged[audit](?F)@now :- asserted_by[main](?F,?Who)@now, in_perspective[main](?F,?P)@now, not authority[main](?P,?Who)@now
    rfc45fb4a  sees[main](?P,?Q)@now :- imports[main](?P,?Q)@now
  shadowed rule pairs: (none — no rule body of boot.rofl is a subset of a sibling)

READ THAT SECOND LINE. `forged[audit]` is boot.rofl's forgery audit: a fact
whose author is not an authority for the perspective it landed in. It reads
`asserted_by`, which the kernel emits only when an assert names a `who` —
and nothing in this store does. So the audit CANNOT FIRE. It has been
answering "clean" to every program in this repository, and it would answer
"clean" to a forged fact too. That is not a bug in the rule; it is a rule
with no input, and it is invisible to every test that asserts the audit is
empty. MOOT proves it in one query.

the same for `sees`: two of its three rules read `imports`, which boot.rofl
declares edb and nothing populates, so visibility here is reflexive only and
the `leak` audit is weaker than its text suggests. Both findings are about
the program AS LOADED, facts included — which is the correct reading, and it
is testable: give the input and watch the verdict flip.

  $ assert dim(segment).   who = release_captain
  unreachable relations: imports
  rules that can never fire: 2 — r0145d338 (sees), rfc45fb4a (sees)
  and boot.rofl's forgery audit, which could not fire a moment ago, now says:
    forged[audit]($fact(dim,main,$cons(segment,$nil)))
  release_captain is not an authority for [main], so the first fact it ever
  authored is the first thing the audit catches. One assert moved the verdict
  from "cannot fire" to a finding.
  oracle: AGREE — boot.rofl's forged/1 is unreachable until asserted_by is populated
```

```
  43 rules of moot.rofl encoded as clauses over 84 dimensions

  unreachable relations: ctx ctx_dim_ok
  rules that can never fire in this store: 1
    r8c5b9f31  ctx_dim_ok[main](?C,?D)@now :- ctx[main](?D,?V)@now, admits[main](?C,?D,?V)@now
  shadowed rule pairs: 0  — and that is the honest answer.

MOOT finds its OWN evaluator layer dead: `ctx/2` is the one input a caller
supplies per query, and in a world where nobody asked about a context there
is none, so ctx_dim_ok/2 cannot fire and nothing downstream of it can. The
same verdict, on the same rules, in the world of section 4 — where a witness
context WAS asserted:
  unreachable relations: (none)

nothing was planted. `shadowed` came back empty for both programs, and empty
is what gets printed: no rule body in boot.rofl or moot.rofl is a subset of a
sibling with the same head. The six cond_admits rules are the near miss —
same premise RELATIONS, different operands — and they are correctly NOT
condemned, because the dimensions are premises as written, not relation names.
  oracle: AGREE — the self-application finds moot.rofl's evaluator layer dead without a context
```

`shadowed` came back empty for both programs and empty is what is printed.
Nothing was planted.

## The oracle: every context, enumerated

```
the same questions decided a second time, by walking the whole declared
context space in plain TypeScript that shares no rule with the engine.
Because every dimension is finite and every condition constrains exactly
one of them, that walk is a COMPLETE oracle and not a sample:

  23,040 contexts x 52 flags = 1,198,080 evaluations

   5 claims   unreachable(F): F is off in every context
             refuted: none
  oracle: AGREE — unreachable(F): F is off in every context
   2 claims   shadowed(F, C, C0): C fires only where C0 does
             refuted: none
  oracle: AGREE — shadowed(F, C, C0): C fires only where C0 does
   1 claims   tautological(F, C): C fires in every context
             refuted: none
             found by enumeration and NOT claimed by the rules:
               search_rerank is on in all 23040 contexts, by a UNION of partial clauses
  oracle: AGREE — tautological(F, C): C fires in every context
   1 claims   contradictory(F, G): both on in some context
             refuted: none
  oracle: AGREE — contradictory(F, G): both on in some context
   7 claims   dependent(F, G): F is on only where G is
             refuted: none
             found by enumeration and NOT claimed by the rules:
               bulk_export is on only where data_lake is
  oracle: AGREE — dependent(F, G): F is on only where G is

the two gaps are the point of the section, not an embarrassment:

  search_rerank is on in every one of the 23,040 contexts, and no single
  clause of it is total: two partial segment lists cover the space between
  them. DNF tautology does not decompose per dimension the way emptiness and
  containment do (it is co-NP-hard in general), so tautological/2 does not
  claim it. Enumeration finds it because enumeration does not decompose.

  bulk_export is on only where data_lake is, and yet is NOT dependent on it:
  its first clause never asks for data_lake. The implication is an ACCIDENT
  of the two condition sets, not a contract, and it evaporates the moment
  either is edited. dependent/2 reports the contract; the enumeration reports
  today's coincidence. Which one you want is a real question — and the
  actionable one is the contract.
```

## Decidability: where this stops

```
every dimension is FINITE and DECLARED (dim/1, dom/2), and every condition
constrains exactly one of them. Those two hypotheses carry the whole file:
the contexts a clause admits are then a PRODUCT of per-dimension sets, so
satisfiability and containment both decompose, and enumeration decides
everything. Neither hypothesis is about the operators — `version >= 7` is a
comparison and stays inside them, because on a finite domain it denotes a
finite set that moot.rofl enumerates with an ordinary rule.

what breaks it:
  * an UNBOUNDED dimension (a timestamp, a float): no product to walk, and
    the oracle stops being complete;
  * a constraint RELATING two dimensions (bucket < version * 8): contexts(C)
    is no longer a product, so (1) and (2) both fail and per-dimension
    emptiness is neither sound nor complete for the clause;
  * a hash function over the user id, which is what a real percentage
    rollout is: `bucket` here is the OUTPUT of that hash, declared as a
    dimension, and MOOT reasons about the bucket, never about the hash.
past those, the answers need SMT and stop being complete. That is a real
boundary, stated here rather than discovered by a reader.
```

## What this does not do

- **No DNF tautology.** `tautological/2` is about ONE clause. A flag whose
  clauses are individually partial but jointly cover the space is also always
  on, and these rules do not claim it — DNF tautology does not decompose per
  dimension (it is co-NP-hard in general). The oracle measures the gap and the
  transcript names the flag.
- **No semantic dependency.** `dependent/2` reports a CONTRACT — a syntactic
  requirement on every usable clause. The enumeration also finds implications
  that hold by coincidence of two condition sets and evaporate the moment
  either is edited. Both are printed; only the first is actionable.
- **No cross-flag shadowing.** Containment is checked between clauses of the
  SAME flag, because the verdict is "delete this clause".
- **No provenance through the audits.** Measured, not argued: folding the
  provenance semiring with the config's `cond/4` facts as the base annotation
  puts zero of them in the polynomial of `live/1`. Liveness rests on
  `not dead_clause`, and a negated premise contributes the multiplicative
  identity because finite failure carries no annotation (`src/semiring.ts`
  says so in its header). An audit built on universal quantification is
  exactly the shape provenance cannot follow; `cond_admits/2` and `empty/2`
  answer the per-condition question instead.
- **No hash.** A real percentage rollout hashes a user id into a bucket.
  `bucket` here is the OUTPUT of that hash, declared as a dimension. MOOT
  reasons about the bucket and never about the hash — which is the right
  boundary, and it is the same boundary HUH draws at its tokenizer.
- **No first-match-wins.** Clauses are OR'd (the semantics a strategy list
  has in Unleash). A first-match evaluator combined with cross-flag
  requirements puts `fires` and `match` in a relation-level negative cycle,
  which `boot.rofl` rejects — correctly, since stratification here is
  relation-level and the requirement graph being acyclic in the DATA does not
  help. That is a real cost of the design, paid deliberately; the same cost is
  what forces the `ok_from/2` index walk instead of the obvious
  `blocked(C) :- requires(C, G), not live(G)`.

## Files

| file | what it is |
|---|---|
| `moot.rofl` | the rules: six operator rules, the per-dimension intersection, the five verdicts, and the evaluator |
| `demo.ts` | the config, its parser, the witness search, the self-application encoder, the enumeration oracle, and the transcript above |
| `README.md` | this file |
| `page.html` | the same story for two audiences, self-contained |
| `../../test/example-moot.test.ts` | the demo as a test, pinned line for line |

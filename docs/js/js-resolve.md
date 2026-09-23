---
world: js-resolve
books: audit, book A, book B, book E, book Env, code, main
default: audit
---

# js-resolve

## Signatures

- arrives(site S, at step K, in path P) (arrival), in the book E
- diverges(site S, in environment A, with verdict VA, from environment B, with verdict VB) (env_divergence)
- resolves_without_a_trace(site S, in environment Env, to node P) (answer_without_trace)
- has_two_answers(site S, in environment Env, node A, node B) (answer_ambiguous)
- has_two_model_keys(site S, key I, key J) (site_key_ambiguous)

> js-resolve.rofl — THE SECOND MODEL OF IMPORT RESOLUTION, and the referee
> between it and the first. rules/js-modules.rofl resolves by REASONING over
> the disk listing; this pack records node's own resolver, asked out loud with
> its search written down, and a relation that says where the two disagree.
> Resolution depends on the machine (registered extensions, `exports`
> conditions, where node_modules sits), none of which is in the AST, so
> what the observer emits is an OBSERVATION and `resolves_to` is derived
> from it.
> 
> DERIVED, NOT ASSERTED: an observer writing `resolves_to` directly would make
> `why` print `[axiom]`, "node said so". So the observer writes the SEARCH —
> every candidate put to the disk, in order, with the disk's answer — and
> section 2 replays it; the answer stands on the failed attempts as much as
> on the hit. Disagreement between the two models is not an error to silence
> but a queue, and `resolve_divergence` prints its length (facts/spec.rofl:
> the structural layer's only oracle is the agreement of two modellers).

> what the host supplies (scanners/js_resolve.ts), then what the ledger side
> declares (facts/js-resolve.rofl)

Declared as facts: resolve_site, resolve_site_computed, resolve_try, resolve_answer, resolve_failed, resolve_unasked, resolve_via, env_ran, env_extension, env_declared, resolve_mechanism.

## 1. THE PLACES, both kinds unioned, so that "every place" is a relation.

<a id="resolve_place"></a>`resolve_place`(S) either:

1. if [`resolve_site`](#resolve_site)(S, something, something, something);
2. if [`resolve_site_computed`](#resolve_site_computed)(S, something, something).

## 2. THE SEARCH, REPLAYED. node stops at the first candidate that IS a file;

> a directory and an absent path both mean "keep looking" and are kept apart
> because a directory is what makes an index file possible.

<a id="candidate_missed"></a>`candidate_missed`(S, K) if [`resolve_try`](#resolve_try)(S, K, something, `miss` or `dir`).

> candidate 0 is reached by starting; K+1 only BECAUSE K missed, which puts
> every failed attempt into the why-tree of the answer

<a id="reached"></a>`reached`(S, N) either:

1. if [`resolve_try`](#resolve_try)(S, 0, something, something) and N is 0;
2. if [`reached`](#reached)(S, K), [`candidate_missed`](#candidate_missed)(S, K), and N is K + 1.

<a id="arrival"></a>S arrives at K in P if [`reached`](#reached)(S, K) and [`resolve_try`](#resolve_try)(S, K, P, `file`).

## 3. THE ANSWER: the search arrived HERE, node returned THIS, and a named

> mechanism accounts for it. An answer failing any premise is reported by
> section 7 rather than published.

<a id="has_via"></a>`has_via`(S) if [`resolve_via`](#resolve_via)(S, something, something).

<a id="resolves_to"></a>`resolves_to`(S, P) if all of:
  - S [arrives](#arrival) at some step in P;
  - [`resolve_answer`](#resolve_answer)(S, P);
  - [`has_via`](#has_via)(S).

> a builtin resolves without touching the disk (the trace of
> `require.resolve("node:path")` is empty), so the mechanism row is the whole
> explanation and carries the canonical `node:` spelling

`resolves_to`(S, C) if [`resolve_via`](#resolve_via)(S, `builtin`, C) and [`resolve_answer`](#resolve_answer)(S, something).

<a id="explained"></a>`explained`(S) if [`resolves_to`](#resolves_to)(S, something).

## 4. WHAT THE ENVIRONMENT SAID — three ways to speak; silence is section 7's.

<a id="env_spoke"></a>`env_spoke`(S) either:

1. if [`resolve_answer`](#resolve_answer)(S, something);
2. if [`resolve_failed`](#resolve_failed)(S, something);
3. if [`resolve_unasked`](#resolve_unasked)(S, something).

> TOTAL over the places the environment spoke about: `no_answer` is an atom
> rather than a missing row, so the comparison in section 6 cannot lose a site

<a id="host_has_answer"></a>`host_has_answer`(S) if [`resolves_to`](#resolves_to)(S, something).

<a id="host_verdict"></a>`host_verdict`(S, P) either:

1. if [`resolves_to`](#resolves_to)(S, P);
2. if all of:
   - [`env_spoke`](#env_spoke)(S);
   - P is `no_answer`;
   - unless [`host_has_answer`](#host_has_answer)(S).

## 5. THE BRIDGE TO THE FIRST MODEL. The rule model names a site by babel node

> id; the observer by (file, line, specifier), from its own parse. The JOIN is
> here, and section 7 reports both directions of failure.

<a id="model_site"></a>`model_site`(S, I) either:

1. if all of:
   - [`resolve_site`](#resolve_site)(S, F, L, Sp);
   - [`site_file`](js-modules.md#site_file)(I, F);
   - [`site_line`](js-modules.md#site_line)(I, L);
   - [`site_source`](js-modules.md#site_source)(I, Sp);
2. if all of:
   - [`resolve_site_computed`](#resolve_site_computed)(S, F, L);
   - [`site_file`](js-modules.md#site_file)(I, F);
   - [`site_line`](js-modules.md#site_line)(I, L);
   - [`site_source_computed`](js-modules.md#site_source_computed)(I).

<a id="rules_answer"></a>`rules_answer`(S, T) either:

1. if [`model_site`](#model_site)(S, I) and [`resolved_import`](js-modules.md#resolved_import)(I, T);
2. if [`model_site`](#model_site)(S, I) and [`resolved_builtin`](js-modules.md#resolved_builtin)(I, T).

<a id="rules_has_answer"></a>`rules_has_answer`(S) if [`rules_answer`](#rules_answer)(S, something).

<a id="rules_verdict"></a>`rules_verdict`(S, T) either:

1. if [`rules_answer`](#rules_answer)(S, T);
2. if all of:
   - [`model_site`](#model_site)(S, something);
   - T is `no_answer`;
   - unless [`rules_has_answer`](#rules_has_answer)(S).

## 6. THE TWO COMPARISONS, both joins of TOTAL relations.

> (a) rules against host, per environment — THE WORK QUEUE: every row is a
> resolution node performs and the rule model does not.

<a id="resolve_divergence"></a>`resolve_divergence`(S, ByRules, ByHost, Env) if all of:
  - [`rules_verdict`](#rules_verdict)(S, ByRules);
  - [`host_verdict`](#host_verdict)(S, ByHost) in the book Env;
  - ByRules differs from ByHost.

> agreement is positive so that "compared" can be defined and a site that
> stopped being compared is a row rather than a smaller number

<a id="resolve_agreement"></a>`resolve_agreement`(S, V, Env) if [`rules_verdict`](#rules_verdict)(S, V) and [`host_verdict`](#host_verdict)(S, V) in the book Env.

<a id="compared"></a>`compared`(S, Env) either:

1. if [`resolve_agreement`](#resolve_agreement)(S, something, Env);
2. if [`resolve_divergence`](#resolve_divergence)(S, something, something, Env).

<a id="uncompared"></a>`uncompared`(S, Env) if all of:
  - [`rules_verdict`](#rules_verdict)(S, something);
  - [`host_verdict`](#host_verdict)(S, something) in the book Env;
  - unless [`compared`](#compared)(S, Env).

> (b) environment against environment: the two rows are two books, and their
> disagreement answers "how will this resolve on the other machine?"

<a id="env_divergence"></a>S diverges in X with VA from B with VB if all of:
  - [`host_verdict`](#host_verdict)(S, VA) in the book A;
  - [`host_verdict`](#host_verdict)(S, VB) in the book B;
  - X differs from B;
  - VA differs from VB.

<a id="env_divergent_site"></a>`env_divergent_site`(S) if S [diverges](#env_divergence) in some environment with some verdict from some environment with some verdict.

## 7. THE GATES. Each must be able to say no; test/js-resolve.test.ts plants a

> defect for every one.
> 
> an answer the trace cannot account for: the gate that makes the trace
> load-bearing

<a id="answer_without_trace"></a>S resolves without a trace in Env to P if [`resolve_answer`](#resolve_answer)(S, P) in the book Env, unless [`explained`](#explained)(S) in the book Env.

> the observer emits no `resolve_via` rather than inventing a label

<a id="answer_without_mechanism"></a>`answer_without_mechanism`(S, Env) if [`resolve_answer`](#resolve_answer)(S, something) in the book Env, unless [`has_via`](#has_via)(S) in the book Env.

> no answer, no failure, not even "nothing to ask": an observer that swallows
> the resolver's exception, indistinguishable from the outside

<a id="resolve_silent"></a>`resolve_silent`(S, Env) if all of:
  - [`resolve_place`](#resolve_place)(S);
  - [`env_ran`](#env_ran)(Env);
  - unless [`env_spoke`](#env_spoke)(S) in the book Env.

> resolution is a function of (place, environment)

<a id="answer_ambiguous"></a>S has two answers in Env X and B if all of:
  - [`resolves_to`](#resolves_to)(S, X) in the book Env;
  - [`resolves_to`](#resolves_to)(S, B) in the book Env;
  - X differs from B.

> a ledger only in the facts file is decoration; only in the run, unaccountable

<a id="env_unobserved"></a>`env_unobserved`(Env) if [`env_declared`](#env_declared)(Env), unless [`env_ran`](#env_ran)(Env).

<a id="env_undeclared"></a>`env_undeclared`(Env) if [`env_ran`](#env_ran)(Env), unless [`env_declared`](#env_declared)(Env).

> the two enumerations, both directions; `module_site` and not `import_site`,
> because a re-export names a module and node resolves it by the same rules

<a id="model_site_known"></a>`model_site_known`(S) if [`model_site`](#model_site)(S, something).

<a id="site_unseen_by_model"></a>`site_unseen_by_model`(S) if [`resolve_place`](#resolve_place)(S), unless [`model_site_known`](#model_site_known)(S).

<a id="host_saw"></a>`host_saw`(I) if [`model_site`](#model_site)(something, I).

<a id="site_unseen_by_host"></a>`site_unseen_by_host`(I) if [`module_site`](js-modules.md#module_site)(I, something), unless [`host_saw`](#host_saw)(I).

> which kind of place the referee compared, so the `checked` ledger's per-kind
> counts are re-derived rather than checked against a total

<a id="checked_site_kind"></a>`checked_site_kind`(K, S) if [`model_site`](#model_site)(S, I) and [`site_kind`](js-modules.md#site_kind)(I, K).

> (file, line, specifier) is a key only while no two sites share all three

<a id="site_key_ambiguous"></a>S has two model keys I and J if [`model_site`](#model_site)(S, I), [`model_site`](#model_site)(S, J), and I differs from J.

> the mechanism vocabulary, both directions, as the frontier reasons in js-modules

<a id="mechanism_seen"></a>`mechanism_seen`(M) if [`env_ran`](#env_ran)(E) and [`resolve_via`](#resolve_via)(something, M, something).

<a id="mechanism_undeclared"></a>`mechanism_undeclared`(M) if [`mechanism_seen`](#mechanism_seen)(M), unless [`resolve_mechanism`](#resolve_mechanism)(M).

<a id="mechanism_unexercised"></a>`mechanism_unexercised`(M) if [`resolve_mechanism`](#resolve_mechanism)(M), unless [`mechanism_seen`](#mechanism_seen)(M).

> The environment ledger is a VARIABLE here (`resolve_answer[Env](S, P)`),
> which is the case `collects` exists for (docs/books-and-permission.md 2.1):
> comparing one environment against another is the referee's whole point.
> Not in boot.rofl, where it would license nothing and permit everything.

<a id="collects"></a>`collects` includes `audit`.

## Read from other files

- [module_site](js-modules.md#module_site), in the code
- [resolved_builtin](js-modules.md#resolved_builtin), in the code
- [resolved_import](js-modules.md#resolved_import), in the code
- [site_file](js-modules.md#site_file), in the code
- [site_kind](js-modules.md#site_kind), in the code
- [site_line](js-modules.md#site_line), in the code
- [site_source](js-modules.md#site_source), in the code
- [site_source_computed](js-modules.md#site_source_computed), in the code

> 11 trailing comments on rule lines are not carried over.


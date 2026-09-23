---
world: js-resolve
books: audit, book A, book B, book E, book Env, code, main
default: audit
---

# js-resolve

Reads:

- from js-modules, in the code: [module_site](js-modules.md#module_site), [resolved_builtin](js-modules.md#resolved_builtin), [resolved_import](js-modules.md#resolved_import), [site_file](js-modules.md#site_file), [site_kind](js-modules.md#site_kind), [site_line](js-modules.md#site_line), [site_source](js-modules.md#site_source), [site_source_computed](js-modules.md#site_source_computed)

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

Declared as facts:

- <a id="resolve_site"></a>A site S is a resolve site in a file File at a line Line for a text Spec
- <a id="resolve_site_computed"></a>A site S is a computed resolve site in a file File at a line Line
- <a id="resolve_try"></a>A site S tries at a step K a path Path with a verdict Outcome
- <a id="resolve_answer"></a>A site S is answered with a path P
- <a id="resolve_failed"></a>A site S fails to resolve because a reason R
- <a id="resolve_unasked"></a>A site S is unasked because a reason R
- <a id="resolve_via"></a>A site S resolves via a mechanism M with a text D
- <a id="env_ran"></a>An environment Env ran
- <a id="env_extension"></a>`env_extension`
- <a id="env_declared"></a>An environment Env is declared
- <a id="resolve_mechanism"></a>A mechanism M is a resolve mechanism

## 1. THE PLACES, both kinds unioned, so that "every place" is a relation.

In the code:

<a id="resolve_place"></a>A site S is a resolve place either:

1. if S [is a resolve site](#resolve_site) in some file at some line for some text;
2. if S [is a computed resolve site](#resolve_site_computed) in some file at some line.

## 2. THE SEARCH, REPLAYED. node stops at the first candidate that IS a file;

> a directory and an absent path both mean "keep looking" and are kept apart
> because a directory is what makes an index file possible.

In the book E:

<a id="candidate_missed"></a>A site misses the candidate at a step K if it [tries](#resolve_try) at K some path with `miss` or `dir`.

> candidate 0 is reached by starting; K+1 only BECAUSE K missed, which puts
> every failed attempt into the why-tree of the answer

<a id="reached"></a>A site S reaches the step N either:

1. if S [tries](#resolve_try) at 0 some path with some verdict and N is 0;
2. if all of:
   - S [reaches the step](#reached) K;
   - S [misses the candidate](#candidate_missed) at K;
   - N is K + 1.

<a id="arrival"></a>A site arrives at a step K in a path P if it [reaches the step](#reached) K and it [tries](#resolve_try) at K P with `file`.

## 3. THE ANSWER: the search arrived HERE, node returned THIS, and a named

> mechanism accounts for it. An answer failing any premise is reported by
> section 7 rather than published.

A site

- <a id="has_via"></a>has a mechanism if it [resolves via](#resolve_via) some mechanism with some text.
- <a id="resolves_to"></a>resolves by the host to a path P if all of:
  - it [arrives](#arrival) at some step in P;
  - it [is answered with](#resolve_answer) P;
  - it [has a mechanism](#has_via).

> a builtin resolves without touching the disk (the trace of
> `require.resolve("node:path")` is empty), so the mechanism row is the whole
> explanation and carries the canonical `node:` spelling

A site

- resolves by the host to a path C if it [resolves via](#resolve_via) `builtin` with C and it [is answered with](#resolve_answer) some path.
- <a id="explained"></a>is explained if it [resolves by the host to](#resolves_to) some path.

## 4. WHAT THE ENVIRONMENT SAID — three ways to speak; silence is section 7's.

<a id="env_spoke"></a>A site S is reported either:

1. if S [is answered with](#resolve_answer) some path;
2. if S [fails to resolve](#resolve_failed) because some reason;
3. if S [is unasked](#resolve_unasked) because some reason.

> TOTAL over the places the environment spoke about: `no_answer` is an atom
> rather than a missing row, so the comparison in section 6 cannot lose a site

<a id="host_has_answer"></a>A site has a host answer if it [resolves by the host to](#resolves_to) some path.

<a id="host_verdict"></a>The host verdict of a site S is a path P either:

1. if S [resolves by the host to](#resolves_to) P;
2. if S [is reported](#env_spoke) and P is `no_answer`, unless S [has a host answer](#host_has_answer).

## 5. THE BRIDGE TO THE FIRST MODEL. The rule model names a site by babel node

> id; the observer by (file, line, specifier), from its own parse. The JOIN is
> here, and section 7 reports both directions of failure.

In the audit:

<a id="model_site"></a>A site S is modelled as a site I either:

1. if all of:
   - S [is a resolve site](#resolve_site) in a file F at a line L for Sp;
   - I [sits in](js-modules.md#site_file) F;
   - I [sits at line](js-modules.md#site_line) L;
   - [the source text](js-modules.md#site_source) of I is Sp;
2. if all of:
   - S [is a computed resolve site](#resolve_site_computed) in a file F at a line L;
   - I [sits in](js-modules.md#site_file) F;
   - I [sits at line](js-modules.md#site_line) L;
   - I [has a computed source](js-modules.md#site_source_computed).

<a id="rules_answer"></a>The rules answer of a site S is a path T either:

1. if S [is modelled as](#model_site) a site I and I [resolves to the file](js-modules.md#resolved_import) T;
2. if S [is modelled as](#model_site) a site I and I [resolves to the builtin](js-modules.md#resolved_builtin) T.

<a id="rules_has_answer"></a>A site has a rules answer if [the rules answer](#rules_answer) of it is some path.

<a id="rules_verdict"></a>The rules verdict of a site S is a path T either:

1. if [the rules answer](#rules_answer) of S is T;
2. if all of:
   - S [is modelled as](#model_site) some site;
   - T is `no_answer`;
   - unless S [has a rules answer](#rules_has_answer).

## 6. THE TWO COMPARISONS, both joins of TOTAL relations.

> (a) rules against host, per environment — THE WORK QUEUE: every row is a
> resolution node performs and the rule model does not.

<a id="resolve_divergence"></a>A site is resolved differently by rules to a path ByRules by host to a path ByHost in an environment Env if all of:
  - [the rules verdict](#rules_verdict) of it is ByRules;
  - [`host_verdict`](#host_verdict)(it, ByHost) in the book Env;
  - ByRules differs from ByHost.

> agreement is positive so that "compared" can be defined and a site that
> stopped being compared is a row rather than a smaller number

<a id="resolve_agreement"></a>A site is resolved alike to a path V in an environment Env if [the rules verdict](#rules_verdict) of it is V and [`host_verdict`](#host_verdict)(it, V) in the book Env.

<a id="compared"></a>A site S is compared in an environment Env either:

1. if S [is resolved alike](#resolve_agreement) to some path in Env;
2. if S [is resolved differently](#resolve_divergence) by rules to some path by host to some path in Env.

<a id="uncompared"></a>A site is uncompared in an environment Env if all of:
  - [the rules verdict](#rules_verdict) of it is some path;
  - [`host_verdict`](#host_verdict)(it, something) in the book Env;
  - unless it [is compared](#compared) in Env.

> (b) environment against environment: the two rows are two books, and their
> disagreement answers "how will this resolve on the other machine?"

A site

- <a id="env_divergence"></a>diverges in an environment X with a verdict VA from an environment B with a verdict VB if all of:
  - [`host_verdict`](#host_verdict)(it, VA) in the book A;
  - [`host_verdict`](#host_verdict)(it, VB) in the book B;
  - X differs from B;
  - VA differs from VB.
- <a id="env_divergent_site"></a>diverges between environments if it [diverges](#env_divergence) in some environment with some verdict from some environment with some verdict.

## 7. THE GATES. Each must be able to say no; test/js-resolve.test.ts plants a

> defect for every one.
> 
> an answer the trace cannot account for: the gate that makes the trace
> load-bearing

<a id="answer_without_trace"></a>A site resolves without a trace in an environment Env to a node P if [`resolve_answer`](#resolve_answer)(it, P) in the book Env, unless [`explained`](#explained)(it) in the book Env.

> the observer emits no `resolve_via` rather than inventing a label

<a id="answer_without_mechanism"></a>A site is answered without a mechanism in an environment Env if [`resolve_answer`](#resolve_answer)(it, something) in the book Env, unless [`has_via`](#has_via)(it) in the book Env.

> no answer, no failure, not even "nothing to ask": an observer that swallows
> the resolver's exception, indistinguishable from the outside

<a id="resolve_silent"></a>A site is unreported in an environment Env if all of:
  - it [is a resolve place](#resolve_place);
  - Env [ran](#env_ran);
  - unless [`env_spoke`](#env_spoke)(it) in the book Env.

> resolution is a function of (place, environment)

<a id="answer_ambiguous"></a>A site has two answers in an environment Env a node X and B if all of:
  - [`resolves_to`](#resolves_to)(it, X) in the book Env;
  - [`resolves_to`](#resolves_to)(it, B) in the book Env;
  - X differs from B.

> a ledger only in the facts file is decoration; only in the run, unaccountable

An environment

- <a id="env_unobserved"></a>is unobserved if it [is declared](#env_declared), unless it [ran](#env_ran).
- <a id="env_undeclared"></a>is an undeclared environment if it [ran](#env_ran), unless it [is declared](#env_declared).

> the two enumerations, both directions; `module_site` and not `import_site`,
> because a re-export names a module and node resolves it by the same rules

A site

- <a id="model_site_known"></a>is known to the model if it [is modelled as](#model_site) some site.
- <a id="site_unseen_by_model"></a>is unseen by the model if it [is a resolve place](#resolve_place), unless it [is known to the model](#model_site_known).
- <a id="host_saw"></a>is seen by the host if some site [is modelled as](#model_site) it.
- <a id="site_unseen_by_host"></a>is unseen by the host if it [is a module site](js-modules.md#module_site) of some form, unless it [is seen by the host](#host_saw).

> which kind of place the referee compared, so the `checked` ledger's per-kind
> counts are re-derived rather than checked against a total

<a id="checked_site_kind"></a>A kind K is checked at a site S if S [is modelled as](#model_site) a site I and [the site kind](js-modules.md#site_kind) of I is K.

> (file, line, specifier) is a key only while no two sites share all three

<a id="site_key_ambiguous"></a>A site has two model keys I and J if it [is modelled as](#model_site) I, it [is modelled as](#model_site) J, and I differs from J.

> the mechanism vocabulary, both directions, as the frontier reasons in js-modules

A mechanism

- <a id="mechanism_seen"></a>is a seen mechanism if an environment E [ran](#env_ran) and some site [resolves via](#resolve_via) it with some text.
- <a id="mechanism_undeclared"></a>is an undeclared mechanism if it [is a seen mechanism](#mechanism_seen), unless it [is a resolve mechanism](#resolve_mechanism).
- <a id="mechanism_unexercised"></a>is an unexercised mechanism if it [is a resolve mechanism](#resolve_mechanism), unless it [is a seen mechanism](#mechanism_seen).

> The environment ledger is a VARIABLE here (`resolve_answer[Env](S, P)`),
> which is the case `collects` exists for (docs/books-and-permission.md 2.1):
> comparing one environment against another is the referee's whole point.
> Not in boot.rofl, where it would license nothing and permit everything.

<a id="collects"></a>`collects` includes `audit`.

> 11 trailing comments on rule lines are not carried over.


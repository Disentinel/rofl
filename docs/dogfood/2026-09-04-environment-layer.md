# The environment layer, and one design argument I lost

2026-09-04. `rules/js-env.rofl`, `facts/js-env.rofl`, `test/fixtures/js-env/`,
`test/js-env.test.ts`. 22 tests, 9 s, `leak[audit]` 0.

## The question

The owner's, in his words:

> «Валидна ли эта программа в окружении node22? А если node18? А что именно
> перестанет быть валидным? А что заменить чтобы снова стало валидным?»

Four questions. This slice answers the first three on the **syntax** axis and
says out loud that it does not answer the fourth.

## The argument I lost, and the measurement that settled it

I argued that an environment does not belong in the perspective slot, from
`docs/choosing-perspectives.md`: the writer list is identical for every pack, so
it distinguishes *which world* rather than *whose book*; and the slot is already
carrying the layer (`[code]`, `[flow]`, `[audit]`), so a per-environment ledger
would demand a cross-product.

**I was arguing about where the DATA lives and he was asking where the VERDICT
lives.** `unsupported[node18](Site, Feature)` is a *derived ledger* — "the book
of conclusions reached under discipline X" — which the same document explicitly
allows and `sensors.rofl` already demonstrates as `[trust]` and `[verified]`.
And `rules/js-resolve.rofl` has been writing exactly that sentence for module
resolution since before this session, with a comment that says so:

> the two rows are not a contradiction, they are two books, and their
> disagreement is the answer to "how will this resolve on the other machine?"

So the form is right, the precedent is in the tree, and my objection was aimed
one layer below the question.

## What the measurement added, which the argument could not

Four arms, four separate stores, bare `boot.rofl` plus a five-line program:

| form | `leak[audit]` |
|---|---|
| `uses[E](X) :- env_reg(E), thing[code](X).` | **3** |
| …plus `authority(node18, js_env)` and `imports(node18, code)`, per environment | **3** |
| `bad[audit](E, X) :- env_reg(E), thing[code](X), not provides[E](oc).` | **1** |
| …plus `collects(audit)` and `imports(audit, code)` | **0** |

The three rows are all `<something> -> $var("E")`. **The second arm is the one
that matters**: registering every environment as a real ledger, with authority
and an import, changes nothing, because `flow` is computed from the RULE and not
from the instantiated facts. There is no declaration that reaches it.

That sharpens `f_the_leak_audit_now_fires_on_a_ledger_polymorphic_head` into a
rule with two sides:

> A variable ledger on the **left** of a crossing is gathered by `collects`.
> On the **right** it has no instrument, and no declaration can give it one.

And it explains why `js-resolve` is clean without anyone having written the
discipline down: **every one of its `[E]` heads reads only `[E]`**, and its
per-environment content arrives from a *scanner* as `edb`. No rule there ever
derives *into* a variable book. A derived per-environment conclusion is the case
with no green form at all.

So `rules/js-env.rofl` carries the environment as a column, the file says why in
its header, and the diff on the day the kernel defect is fixed is the head of
three rules. `w_env_ledger_form` sits in the queue `work_needs`-blocked on
`w_leak_variable_on_the_right`, so the queue will not offer it early.

## Four things the work paid for

**1. The kind is not always the feature.** The first table gated on the node
kind, which is what every vocabulary in this model is keyed on. `a ** b` is a
`binary_expression`, `a ?? b` a `logical_expression`, `a ??= b` an
`assignment_expression` — three kinds older than any gate here. A file full of
ES2021 operators reported as **pure ES5** with every audit at zero and the
frontier count at zero, *because every kind was classified*. The fix is one more
rule keyed on a scalar attribute the scanner already emits.

And measuring it needed a second step: the mutant that drops the KEY from the
`attr_needs` join and matches on the value alone **survived**, because nothing
else in the corpus carried `**` or `??`. Two string literals were added to the
fixture and it died. *A join column with no value collision in the corpus is an
unmeasured column, and it looks identical to a measured one.*

**2. A corpus built for a table cannot surprise it.** The frontier gate reports
**0** ungoverned kinds over `test/fixtures/js-env`, which was written from the
table. Over `test/fixtures/js-call` — a corpus written months earlier for the
call-graph question — it reported **6**, all real, all classified in a minute.
No amount of care over the purpose-built fixture could have produced them.
Generalised: **run a gate over a corpus its author did not shape.** One test, no
new fixture, and it is the only measurement here that can surprise by
construction.

**3. A refused file is absent, not invalid.** `scanners/js_ast.ts` parses with
`plugins: ['typescript']`, so a decorator does not yield a missing node — it
*throws*, and the file contributes no facts at all. `valid[audit]` neither
accepts nor refuses it. A corpus can lose a file silently with every count
staying plausible. No rule can derive the absence of everything; it needs
`scan_failed[code](File, Reason)` from the host, and that is `w_env_scan_failed`,
ordered first of the four because every other answer is conditional on it.

**4. A gate written for ordered pairs cannot see an unordered defect.**
`env_pair_indistinct[audit]` borrowed `RA < RB` from `lost`, where the ordering
belongs. The defect it exists to find — two environments at the same rank —
fails that premise and is never considered. The mutant survived. This is the
repository's own `a gate inherits the scope of its INCIDENT` arriving from a new
direction: not a criterion borrowed from the tool that produced the first red,
but a **premise borrowed from the relation next door** because both are about
pairs. The corrected rule drops the ranks and is shorter than the wrong one.

## The blind spot that is pinned rather than fixed

`await` at the top level of a module is ES2022; the same word inside an `async`
function is ES2017; **they are the same node kind.** This layer gates on a kind
and on one scalar attribute, so it reports the older era for both, and
`test/js-env.test.ts` asserts the *wrong* answer so the frontier is a row rather
than a memory. The fix is a third gate shape keyed on an ancestor —
`ast_within` is already there — and it is `w_env_positional_features`.

## What was looked at outside this repository

`Disentinel/grafema`, read-only, for prior art on version packs.

- `packages/lang-defs` declares `extends?: string` on its pack type. **The
  loader never reads it**; packs merge by union with no repeal path. The whole
  package has *no consumer anywhere in the repository*.
- `effects-db`, which *is* consumed (`ManifestGenerator`, two enrichers,
  `traceEffects`), is split by **runtime** — `node.yaml`, `rust.yaml`,
  `python.yaml`, … — and has **no version axis at all**.

The axis that was designed as versioned died unused; the axis that shipped is
the runtime. That is the empirical half of the argument for putting `since` on
one integer scale and reserving repeal for the exception.

Two ideas there are worth keeping for the API slice: `resolveMethod(name) →
string[]` is a MAY-set keyed on the method name with no receiver, which is what
member lookup on a library value degrades into without a type layer; and
`kind: class | function | namespace` splits the standard library in half —
`JSON`, `Math`, `console` and every `node:` builtin are static-only and need no
type layer, while `Array.prototype.map` does. That correction is worth making
explicitly: the standard library does **not** force a type layer, only its
prototype half does.

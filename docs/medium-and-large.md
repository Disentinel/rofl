# ROFL Medium and ROFL Large — two engines, and the line between them

Decided 2026-09-08. Medium is the Rust engine now under construction; Large is
the next work and does not start until the measurements below say it must.

The line is **not** a size threshold picked for convenience. It falls out of a
property this repository already derives, and that is the reason it is worth
writing down rather than negotiating each time.

## The line: negation decides it

`negated_under(Rel, P)` (`boot.rofl:340`) says which relations are negated in
which book. It was added for the widened-negation audit and it turns out to
decide locality, because **a negation needs completeness**: `not p(X)` asserts
an absence, and an absence cannot be proven from a partial view. So:

> A body of facts may live remote, sharded and spilled exactly when nothing is
> negated under it. A body that is negated must be complete where it is read.

Measured over six worlds (`npm run booklocality`): goof 72% of facts movable,
aka 7%, sus 4%, npc and the single-book programs 0%. `main` is negated in every
program without exception, which is not a defect — it is where a program's own
content lives.

Apply that to the two workloads the owner actually has, and they separate
cleanly rather than sitting on a spectrum.

## ROFL Medium — the code dimension, one machine

**Subject.** The facts a scanner derives from a source tree, and everything
reasoned from them.

**Measured, 2026-09-08.** The AST scanner emits **9.9 facts per line** (73-file
sample of a real repository). A 15 000-file monorepo is ≈2.9M LOC ≈ **28.7M base
facts**; at the corpus-measured multiplier of 1.96–3.85 stored facts per base
fact that is **56–110M stored**, which at the Rust engine's **296 B/fact** is
**15.5–30.4 GB**, and at the JS kernel's 784 B/fact is **41–81 GB**.

So: **the JS kernel does not fit this workload at any point in the range**, and
the Rust engine fits the bottom of it and not the top. That is the whole
justification for Medium, and it is a straddle rather than a comfortable margin.

**Shape.** Heavily negated — an analysis is made of `not`. Rebuilt wholesale
rather than appended (measured: 75 250 `add` calls for 11 591 facts, then the
derived layer dropped whole). Queried across the whole graph, not over a window.

**Therefore.** Single machine, single process, complete in memory, columnar for
density with spill as the safety valve at the top of the range — **not** as the
architecture. Forks for concurrency, which are built and measured.

**Explicitly not in Medium:** sharding, remote books, federation, distributed
fixpoint, MVCC across users. Not because they are hard, but because negation
makes them unsound for this data without a per-relation barrier, and because
nothing here needs them.

## ROFL Large — the runtime dimension, and it is a different shape

**Subject.** Metrics, traces, messages, and whatever else a fleet emits.

**Estimated, and the assumption is stated because it is not measured:** at one
fact per sample, 1000 servers × 100 metrics × once a minute is **4.3 billion
facts a month**, ≈1.2 TB at Medium's density; a year is 52.6 billion and ≈14 TB.
Five years of Slack at 200 messages a day over 50 channels is 18 million facts
and rounds to nothing on that scale.

**Shape.** Append-only. Time-ordered. **Almost never negated** — nobody asks
"there is no reading" of a metric, they ask about a window. Queried over
windows rather than over the whole graph.

**Therefore.** Remote, sharded, columnar, spilled — and admissible under the
locality rule precisely because it is not negated. This is the workload
columnar stores exist for, and out-of-core is a differentiator the field does
not have (invariant I6: Soufflé, RecStep, DDlog and the GPU engines all OOM
rather than spill).

## What is NOT decided, and it is what starts Large

Three unknowns, each worth an order of magnitude. Large begins when these are
measured, not when they are assumed:

1. **Per-sample or aggregate.** A fact per sample is 4.3 billion a month; a fact
   per "metric X of service Y crossed a threshold in window Z" is millions. This
   is a modelling decision and it moves the answer by three orders.
2. **Retention.** A month, a year, forever.
3. **Concurrent inquiries.** A handful are forks in one process, which exists and
   is measured at 3.11× on eight cores. Dozens from different people make
   snapshot isolation a requirement rather than a nicety.

## The bridge, which belongs to neither and must be designed once

A metric is *about* a service, and a service is *in* the code. That crossing is
narrow, declarable, and is where the two engines meet. It is also exactly the
shape `imports(P, Q)` already speaks — a licence on a pair of ledgers — so the
bridge is a declaration rather than a new mechanism. Nothing is built for it
yet, deliberately.

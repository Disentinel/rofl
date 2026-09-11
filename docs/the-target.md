# The target: a Rust engine that chews a real codebase

Set 2026-09-08 by the owner. Everything on this branch is instrumental to it,
and a piece of work that cannot say which rung it moves is not on the path.

> A Rust engine that can chew all of grafema's code — and since grafema is
> mostly not JavaScript, a comparable JS project stands in for it.

## The stand-in, and why this one

Grafema is 1212 source files and ~338 000 lines across eleven languages
(ts 303/110043, js 543/97300, rs 72/64783, hs 249/59529, and a tail). The JS
model this engine runs reads JavaScript, so the target has to be a JS tree of
that size rather than grafema itself.

**eslint** at `~/eslint-corpus` (shallow clone, MIT): **1426 JS files, 531 415
lines** — 1.6x grafema's whole line count and 1.2x its file count, so it has
headroom rather than being a near miss. It is plain JavaScript with no build
step, which keeps the scanner honest: what babel parses is what shipped.

It lives in the home directory and not in `/tmp`, which is a correction rather
than a preference: a reboot on 2026-09-09 emptied `/tmp` and took the corpus and
four built seeds with it — an hour of measurement lost to a directory the
operating system is entitled to clear. Anything a multi-day loop must be able to
re-measure against belongs somewhere the OS does not own.

## The ladder

Each rung is a measurement, not an intention. The engine is at rung 0.

| rung | subject | files | lines | AST facts (est.) | stored (est.) |
|---|---|---|---|---|---|
| **L0** | the Rust engine LOADS the JS model at all | — | — | — | — |
| **L1** | eslint/lib, 8 files | 8 | ~2 000 | ~19 000 | ~310 000 |
| **L2** | eslint/lib, 64 files | 64 | ~16 000 | ~150 000 | ~2 500 000 |
| **L3** | eslint/lib entire | 388 | 98 706 | ~928 000 | ~15 000 000 |
| **L4** | eslint entire | 1426 | 531 415 | ~5 000 000 | ~85 000 000 |

Estimates use the two figures measured on real code 2026-09-08
(the js-volume scanner, deleted 2026-09-10; branch `wip/jsvolume`): **9.4 AST facts per line** and
a **16–17x** stored-per-base multiplier. The second replaces the 1.96–3.85 in
`docs/medium-and-large.md`, which came from the demo corpus and is wrong for
this workload by four to eight times.

## Where the engine actually stands, 2026-09-09

Measured on real eslint/lib source at 8, 16, 32 and 64 files, both engines on
the same worlds, seeds built by the js-seed scanner (deleted 2026-09-10) and required to
round-trip on the reference before they count.

| | 8 files | 16 | 32 | 64 | 128 |
|---|---|---|---|---|---|
| facts | 186 224 | 853 567 | 1 176 561 | 2 968 422 | 5 676 864 |
| JS bytes/fact | 799 | 880 | 894 | 911 | 908.5 |
| **Rust bytes/fact** | **182** | **191** | **232** | **179** | **198.3** |
| JS seconds | 1.16 | 6.85 | 9.71 | 39.87 | 88.34 |
| **Rust seconds** | **0.42** | **2.80** | **4.43** | **16.81** | **45.72** |

Four to five times denser and about twice as fast at every size measured.

**The 128 column is UNJUDGED and says so.** `canonicalState` returns one string
and V8 caps a string near 512 MB, so above roughly 3M facts the reference throws
`RangeError: Invalid string length` and no heap flag moves it. The seed was
built with `scanners/js_seed.ts --no-oracle`, which writes
`128.unjudged.seed.json` and skips the round-trip, because a round-trip whose
comparison cannot be computed is not a check. The port's fact count is
5 677 298 against the reference's 5 676 864 — the same constant 434 that holds
at every judged size — so the two agree as far as anything here can still see,
and that is a weaker statement than 34/34 on both oracles.

**A claim this column RETRACTS.** The previous version of this table said the
density gap widens with size "because the JS figure drifts up while the Rust one
does not". Over 64 to 128 both halves of that are false: JS is flat (911 ->
908.5) and Rust drifts UP (179 -> 198.3). The ratio therefore NARROWS, 5.09x to
4.58x, and so does the time ratio, 2.37x to 1.93x. Four points looked like a
trend and the fifth was the first one outside the region the trend was fitted
in.

**And the curve steepens at the top, which is the number that matters for L4.**
Measured in ONE session at a load average held at 4.2 from start to finish, so
the two points are comparable to each other: 64 files 17.73 s, 128 files 45.72 s,
over 1.913x the facts. That is an exponent of **1.46** — against the 1.34 fitted
over 8 to 64. The reference over the same interval is 1.23, from a 64-file
figure taken in an earlier session, so that half of the comparison is
cross-session and weaker. The port is faster at every size AND its curve is the
steeper one at the top, and only the first of those was known before.

**Rows are not facts, and the ratio is 0.507.** `DEFAULT_SPACE` is 500 000 ROWS,
which is what the accumulator charges against, not facts. Measured on this
world: 64 files 2 968 856 facts / 1 509 144 peak rows, 128 files 5 677 298 /
2 879 275 — 0.508 and 0.507, stable across a doubling. The port's row accounting
is a line-for-line port of the reference's (`rows++`, the same high-water mark,
the same `rows + next.len()` correction, the same `rows > space` wall), so the
figure is the reference's too. It is a property of these RULES and does not
transfer to another rule set unmeasured.

**L3** (eslint/lib entire, 388 files, ~17.0M facts): about 3.0 GB and a few
minutes on the port; 15.5 GB on the reference, which needs
`--max-old-space-size=14000` above 32 files and dies at node's 4 GB default.
**L4** (all 1426 files, ~91.3M facts): 16.4–21.2 GB and about 28 minutes on the
port, against 83.2 GB on the reference. The machine has 21.5 GB. So L4 is at
the edge of feasible with the port and out of reach by four times without it.

The port's remaining difference from the reference is **434 facts, constant at
every size measured** — `derived_by` rows the reference loses to a stale firing
(`f_a_stale_firing_outlives_the_premise_it_rests_on`), where the port is right.

### The old table



- The **Rust engine** passes 34/34 on both conformance oracles, and the largest
  world it has ever evaluated is **11 591 facts** (the `spat` corpus case). It
  has **never been given the JS model**; whether it even loads `rules/js-*.rofl`
  is unknown, and that is rung L0.
- The **TypeScript kernel** with the JS model reaches **64 files / 2 960 417
  facts / 67 s / 2.6 GB**, and only with `DEFAULT_SPACE` raised — which is not
  settable from the public API. That is rung L2 on the reference implementation,
  at 843–870 bytes a fact.
- L4 at the JS kernel's density is ~71 GB on a 21.5 GB machine. At the Rust
  engine's measured 215 B/fact it is ~18 GB, which fits and has no margin. So
  density is a rung requirement and not a nicety — but **time is the tighter
  one**: 32 files to 64 files is 2x the input and **4.5x the time**.

## What this makes true of any piece of work

1. **Which rung does it move?** Storage bytes move L4. Join order and the
   superlinear time curve move L2 and L3. Cold books move all of them, because
   ten of seven hundred services resident is a different problem from all of them.
2. **The two branches have to meet.** The JS model lives on `modeljs`, the Rust
   engine on `nextver`, and neither has seen the other. L0 is that meeting.
3. **A number measured on the demo corpus does not transfer.** Said here because
   it has already cost four wrong conclusions in two days — the multiplier, the
   store boundary summed over seven instances, an RSS delta with a free inside
   the window, and a comparator priced at group size twelve and quoted at a
   million.

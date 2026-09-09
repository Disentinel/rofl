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
(`scanners/js_volume.ts`, branch `wip/jsvolume`): **9.4 AST facts per line** and
a **16–17x** stored-per-base multiplier. The second replaces the 1.96–3.85 in
`docs/medium-and-large.md`, which came from the demo corpus and is wrong for
this workload by four to eight times.

## Where the engine actually stands

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

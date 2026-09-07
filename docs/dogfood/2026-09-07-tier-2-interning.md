# Tier 2 of the memory plan, measured: 1.02–1.13×, and the coupling census

Date: 2026-09-07. Machine: 8-vCPU Apple M4 Pro (Virtual), load average 5.7–6.7
throughout, several agents running. Every memory figure below is a heap reading
after three forced `gc()` with the world still reachable, taken one program per
process; every timing is paired A/B in alternation with the load average stated
beside it.

`docs/performance-invariants.md` sets tier 2 as *intern names and perspectives,
typed tuples for small arity*, and estimates **2–3×**. Measured, tier 2 as it
can actually be built without changing `FactRec.args`'s type is **1.02–1.13×** —
1.02–1.11 on the demo worlds, 1.13 on the marginal byte of a scan-shaped
program at scale.
That is the result. The doc's own sentence — *the order of magnitude is not in
interning* — is right, and it is more right than its own number.

---

## 1. What was tried, in stages, and what each measured

| stage | what | measured | kept |
|---|---|---|---|
| 1 | intern `rel` / `persp` STRINGS in `Store.add` | **0.0%** | reverted |
| 2a | hash-cons argument terms and tuples in `Store.add` | **−15% to −21%** (worse) | reverted |
| 2b | one atom object per name, at the constructor (`mka`) | **+2.3% to +10.0%** | kept |
| 3 | flatten the three retained premise-description strings | **+0.4%** (3/3 paired) | kept |

### Stage 1 measured zero, and the control says the zero is real

Interning the relation and perspective strings inside `Store.add` moved the live
heap by less than the run-to-run noise on all seven programs. The instrument was
not blind: the same code path with `intern` replaced by `s.split('').join('')` —
which forces one fresh flat copy per name per fact — costs **+41 to +64 bytes
per fact**, exactly the two string headers it adds. So the ceiling for name
interning exists and is about 4% of a fact, and the kernel was already sitting
on it: the parser hands one string object to every fact of a relation, and V8
shares it from there.

This is `f_interning_alone_does_not_buy_the_order_of_magnitude`'s own measured
marginal — *46 extra characters of name cost 30 bytes per fact* — read forward
instead of backward. Nothing was left to reclaim.

### Stage 2a made every program BIGGER, for two reasons worth keeping

Hash-consing the argument terms inside the store — one object per distinct
value, keyed by canonical rendering — was the obvious form of "compact fact
representation", and it cost **15–21% more** heap on every program.

1. **The term the store replaces is still alive.** A `Term` reaches `Store.add`
   from a parsed clause or from a `resolve` the evaluator still holds, and the
   store substituting an equal object does not free the original: it adds one.
2. **A table keyed by canonical renderings retains one string per distinct
   value**, and for a functor that string is as long as the thing it indexes.
   `spat` holds 9,351 distinct functor terms and 9,080 distinct argument
   tuples; the table's keys alone are a second copy of every fact key's
   argument half.

Both disappear if the sharing happens at the CONSTRUCTOR, where the duplicate is
never made and the table key is the atom's own name — a string the atom is
holding anyway. That is stage 2b.

### Stage 2b: one atom object per name

`src/unify.ts`, `mka`. Paired A/B, three pairs per program, B won 21 of 21:

| world | facts | before B/fact | after B/fact | saved |
|---|---|---|---|---|
| spat | 11,380 | 1154.8 | 1012.7 | 7.4–10.0% |
| wtf | 7,595 | 959.0 | 870.4 | 9.0–9.2% |
| sus | 4,533 | 1866.3 | 1707.7 | 8.5% |
| ring1 | 3,035 | 1096.3 | 1009.5 | 8.3–9.2% |
| loot | 1,731 | 1522.8 | 1443.1 | 5.0–5.2% |
| boot | 438 | 2995.7 | 2879.3 | 3.9% |
| goof | 4,742 | 1904.1 | 1854.6 | 2.3–2.6% |

Atoms carry about three quarters of what leaf interning is worth; interning
integers and strings as well adds a further 1.2–3.2% and was **not** kept,
because their value space is the DATA's rather than the program's and a bound on
them would be a bound on how much of a data set can be shared.

---

## 2. The number an extrapolation needs is the MARGINAL byte

A demo's average bytes-per-fact charges every fact a share of the program — the
rules, the parse, the reflection the kernel emits per rule — and on a
four-thousand-fact world that share is most of the number. `bench/mem_scale.ts`
measures the same program at 20,000 and 40,000 base facts and reports the slope.

The program is one rule over a flat EDB, the shape of a scan. 20,000 base facts
become **100,070 stored facts**, of which **60,010 (60%) are the `[$kernel]`
book** — its own reflection plus one `derived_by` row per conclusion.

| shape | marginal B / STORED fact | marginal B / BASE fact | base facts in 16 GB |
|---|---|---|---|
| distinct symbols, before | 638.2 | 3190.9 | **5.4M** |
| distinct symbols, after | 566.1 | 2830.6 | **6.1M** |
| repeated symbols, before | 634.8 | 3174.1 | **5.4M** |
| repeated symbols, after | 552.0 | 2759.9 | **6.2M** |

Assumptions, stated because the number is only worth them: heap only (no
process, no V8 baseline, no fragmentation headroom); this rule shape, which
produces one derived fact and one `derived_by` row per base fact — a program
deriving more pays proportionally more; node's pointer compression on, so a
heap over 4 GB is a different regime this measurement does not reach; and no
`retainTicks` pruning.

**Against a millions-to-billions requirement this is the finding, not the 9%.**
A 16 GB heap holds about six million base facts of this shape after tier 2
against five and a half before. The gap to a requirement measured in billions is
three orders of magnitude, and tier 2 closes 0.05 of one. Nothing containable to
this representation reaches it.

---

## 3. Where the saved bytes come from: the kernel book, not the data

The two data shapes above are the experiment. In `distinct`, every symbol in the
data is unique, so no interning of data is possible and the whole saving must be
the program's own vocabulary and the `[$kernel]` book. In `repeated`, the data's
symbols come from a hundred-symbol vocabulary.

- saving on `distinct` data: **72.1 B/fact** — all of it program + kernel book
- saving on `repeated` data: **82.8 B/fact**
- therefore the data's own repetition contributes **10.7 B/fact, 13%**

**Eighty-seven per cent of what tier 2 saves is the `[$kernel]` book and the
program's vocabulary; thirteen per cent is repetition in the data.** That is the
worst possible split for a workload of enormous data over a program of ordinary
size: the part that scales with the program is the part that shrank.

The kernel book's share of all facts, measured on the demos:
`loot` 77.3%, `wtf` 71.9%, `sus` 65.8%, `spat` 60.9%, `goof` 59.2%.

---

## 4. Build cost and query cost, measured apart

A suite re-raises a world about a thousand times a run; a question against a
standing world is a different loop. The change is on the CONSTRUCTION path
(`mka` is called by the parser, by `factTerm`, by the reflection) and not on the
matching path.

Paired A/B in alternation, load average 6.2–6.7:

| program | build (load + evaluate) | query (warm, point) |
|---|---|---|
| 8,000-base-fact scan (40,070 facts) | 91.4 → 95.7 ms median, B slower in 3/4 | 0.0038 → 0.0042 ms median, inside either arm's own 0.0032–0.0063 spread |
| `examples/goof` | 50.7 → 54.7 ms median, B slower in **7/8** | not measured |
| `examples/spat` | 87.7 → 87.6 ms median, B slower in 2/4 | not measured |

So the atom cache costs **0–8% of BUILD, program-dependent, and 0% of QUERY**.
`goof` is the expensive case and `spat` is free; the difference is how many
terms a program constructs per fact it keeps. Stated plainly: this is a memory
change that is paid for in build time on some programs, and build time is the
loop a developer sits through. It is a real trade and not a free win.

---

## 5. The coupling census: how bound is this kernel to the key being a STRING?

`scanners/key_coupling.ts` (`npm run keycoupling`, `--sites` for the list).
Counts are of CODE lines with comments stripped.

| layer | C1 spell | C2 parse | C3 order | C4 hash | C5 embed | C6 surface | total |
|---|---|---|---|---|---|---|---|
| `src/` (kernel) | 19 | 1 | 24 | 38 | 13 | 58 | **153** |
| `adapters/` | 3 | 0 | 3 | 11 | 4 | 16 | 37 |
| `runtime/` + `scanners/` | 2 | 5 | 8 | 27 | 3 | 10 | 55 |
| `examples/` | 3 | 60 | 2 | 70 | 1 | 64 | 200 |
| `test/` | 20 | 45 | 8 | 28 | 2 | 64 | 167 |

- **C1 spell** — builds the `rel[persp](args)` text.
- **C2 parse** — reads a key's TEXT (`startsWith` / `slice` / `includes` / regex).
- **C3 order** — lexicographic key order IS the canonical order.
- **C4 hash** — a key is a Map/Set member or an array element.
- **C5 embed** — a key is concatenated into a longer string that is KEPT.
- **C6 surface** — a key crosses the published `FactStore` / `Rofl` surface.

By kernel file:

| file | C1 | C2 | C3 | C4 | C5 | C6 | total |
|---|---|---|---|---|---|---|---|
| `src/store.ts` | 5 | 0 | 20 | 14 | 4 | 21 | 64 |
| `src/engine.ts` | 7 | 0 | 2 | 15 | 8 | 14 | 46 |
| `src/api.ts` | 6 | 1 | 1 | 1 | 1 | 16 | 26 |
| `src/semiring.ts` | 0 | 0 | 1 | 4 | 0 | 6 | 11 |
| `src/rounds.ts` | 0 | 0 | 0 | 3 | 0 | 0 | 3 |
| `src/reflect.ts` | 1 | 0 | 0 | 1 | 0 | 0 | 2 |
| `src/repl.ts` | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| `adapters/sqlite-store.ts` | 3 | 0 | 3 | 11 | 4 | 16 | 37 |

**C4 is a floor, not a count.** A coupling with no textual tell — a helper taking
`k: string` that is only ever passed a fact key — is invisible to a grep. The
census says what it cannot see rather than implying it is complete.

### The load-bearing half of the census is C3 and C5, and it is not in the store

C4 is cheap: "a key hashes" survives any identity that hashes, and 38 sites in
the kernel would change type and nothing else. C6 is a rename. **C3 and C5 are
the port's real size**, and they say something the byte counts do not:

1. **The canonical witness is a function of the lexicographic order of fact key
   STRINGS.** `Store.witnessOf` (`src/store.ts:697–703`) picks the LEAST firing
   signature; a signature is `ruleId|fact:<key>|fact:<key>|…`
   (`src/engine.ts:1262`, `sigOf` at `src/engine.ts:1777`). Change how a key is
   spelled and the least signature changes, so the *recorded* witness of a fact
   changes even though the fact set, the firing set and the support hypergraph
   are identical. Measured: mutant M3 renders `p<main>(a)` instead of `p[main](a)`
   and the order census goes red; mutant M4 takes the GREATEST signature and the
   census goes red on 185 of `goof`'s facts.

   As of commit `e7932b1` order-independence of the whole record is a THEOREM.
   That theorem is stated over a fixed key SPELLING. **A numeric fact identity is
   therefore not a representation change — it is a change to what the kernel
   records**, and every golden in the repository moves with it.

2. **`canonicalState()` and `snapshot()` print the key.** They sort by it
   (`src/store.ts:719, 725, 735, 742, 746`), so the key's collation is the
   record's line order as well.

3. **The store's whole index is sorted key strings.** `absorb`, `lowerBound`,
   `relPersp`, `relAll` (`src/store.ts:169–221, 423–439`) — 20 of the kernel's 24
   C3 sites are in `src/store.ts`, and they are the ones a Rust port would
   replace with an ordered map over a comparable id. That half IS containable.

**The answer to the question the census was built to price: tier 2 CAN be
contained to the store, and only because it does not touch the key.** Atom
interning changed no key, no signature and no digest. The moment an identity
stops being the string that spells it, the containment ends: the firing
signature (13 C5 sites, 8 of them in `src/engine.ts`), `canonicalState`,
`snapshot`, `whyText`, the reuse fingerprint (`src/engine.ts:762` pushes `f.key`
into the per-relation input hash) and the `derived_by` reification all read the
spelling, and every golden in `test/` and every `startsWith('rel[')` in
`examples/` (60 sites) reads it too.

That is the port's size, stated as a number: **153 kernel sites, of which 37
(C3+C5) are semantic rather than mechanical**, plus 200 in `examples/` and 167
in `test/` that read a key as text.

### What tier 2 does to the SQLite adapter: nothing

`adapters/sqlite-store.ts` was untouched and its conformance test is green. The
atom cache lives in `src/unify.ts`'s term constructors, below every store, so
the adapter gets the same shared atoms without knowing. **If interning had had
to reach the key, the adapter's 37 coupling sites would all have moved** — it
stores keys as TEXT and rebuilds `canonicalState` from them
(`adapters/sqlite-store.ts:650, 655`). That contrast is the census's own
positive control.

---

## 6. The lifetime question, measured

The atom cache is process-wide and bounded: `ATOM_CAP = 8192`, cleared whole on
overflow. `remove`, `clearDerived`, `advanceTick` and `excise` do **not** prune
it, and that was measured rather than asserted:

```
  start                              atoms=    0/8192
  loaded + evaluated (659 facts)     atoms=  196/8192
  after clearDerived (453 facts)     atoms=  196/8192
  after remove of every fact (0)     atoms=  196/8192
  after excise                       atoms=  196/8192
  after 20 advanceTick               atoms=  217/8192
  after dropping the world entirely  atoms=  217/8192
```

The bound is what makes that acceptable. Loading and dropping N distinct
programs of 400 fresh atoms each, in one process:

```
   1 program    atoms=  617/8192   heap=11.6 MB
   5 programs   atoms= 2217/8192   heap=11.8 MB
  20 programs   atoms=   31/8192   heap=11.1 MB   <- overflowed and cleared
  60 programs   atoms= 7703/8192   heap=11.9 MB
```

Sharing restarts after a clear, which costs memory and breaks nothing: two equal
atoms that are different objects are exactly what this file did before. The
programs in this repository use 265–645 distinct atoms; the cap is twelve times
the largest.

**Mutant M6 removed the clear and every correctness gate stayed green** while the
cache grew to 20,000 past a cap of 8,192. The leak is invisible to the census,
to conformance and to the suite; only this probe sees it.

---

## 7. Mutants: six, with liveness asserted per mutant

Gate = the order census (facts / firings / witness / minwit / canon over nine
worlds) + `test/store-conformance.test.ts` + `test/firing-signature.test.ts` +
`test/example-spat.test.ts`. Control on the unmutated tree: SURVIVED.

| # | mutant | planted | LIVE (observable) | verdict | targets |
|---|---|---|---|---|---|
| M0 | one dead line added to `src/store.ts` | yes | line present | SURVIVED ✓expected | the gate does not fire on a null edit |
| M1 | `ATOM_CAP = 1` (interning off) | yes | cache size 1 after two atoms | **SURVIVED** ✓expected | no correctness gate can see interning |
| M2 | atom cache keyed by name LENGTH | yes | `mka('bb')` returns `{a,"aa"}` | KILLED (census) | atom identity correctness |
| M3 | `factKey` spells `p<main>(a)` | yes | key printed | KILLED (census) | C1, the spelling contract |
| M4 | canonical witness = GREATEST signature | yes | 185 `goof` facts differ | KILLED (census) | C5, witness ← key order |
| M5 | every fact keeps its own deep copy of args | yes | goof 1854 → 1984 B/fact | **SURVIVED** ✓expected | no gate can see argument sharing |
| M6 | the atom cache never clears | yes | 20,000 atoms past cap 8,192 | **SURVIVED** ✓expected | the leak is invisible to every gate |

Three survivors, all deliberate, and all three are the same shape: **a memory
property is invisible to every gate this repository owns.** M1, M5 and M6 each
switch off, respectively, the change itself, the sharing it depends on, and its
bound — and the suite, the conformance oracle and the order census are green for
all three. That is not a hole in those gates; it is the reason the memory
instrument had to be built before the change, and the reason a memory
regression here can only be caught by a weighing test.

M0's survival is worth one line: `test/bootstrap-dag.test.ts` and
`test/engine-split.test.ts` pin exact code-line counts of `src/engine.ts` and
fire on any edit that MOVES A LINE there. This session's `src/engine.ts` change
replaces three lines with three lines, so both stayed green without being
adjusted — verified by running them.

---

## 8. What this says about tier 3 and the Rust port

- Tier 2 is **1.03–1.13×** where the plan said 2–3×, and the plan's number came
  from an arity-1 synthetic where args are 106 of 332 bytes. On real programs
  the boxed-`Term[]` argument representation retains **8.4–27.7%** of the live
  heap (188–345 B/fact, measured by replacing every fact's args with one shared
  empty array), so even a perfect tuple representation adds at most another
  ~20% — call the whole of tier 2, done ideally, **1.4×**.
- **The remaining factor of forty is not reachable from inside this
  representation**, which is what `f_js_is_the_prototype_rust_is_the_scale`
  already decided and this measures rather than assumes.
- The port's cost is not the 153 mechanical sites. It is the 37 sites where the
  key's SPELLING and COLLATION are in the recorded answer — and the fact that
  the conformance oracle for the port is itself written in terms of that
  spelling. A Rust store with a numeric fact id can be byte-identical on
  `canonicalState` only if it can reproduce the string collation of keys it no
  longer stores as strings, and can reproduce the least-signature witness pick
  under that same collation. **That is the single most decision-relevant
  sentence here**: the port must carry the key's spelling as an ORDERING
  function even if it never materialises the string.

---

## 9. The memory scale was skipped in every run since it was written

`test/key-bytes.test.ts` is the only gate here that can see a memory regression.
It has never run. Node's test runner spawns each test FILE as a child process
and does not forward V8 flags from the parent's argv, so
`node --expose-gc --test test/*.test.ts` gives the parent a `gc` and every child
none; the file's own `typeof globalThis.gc === 'function'` guard then does what
it was written to do and skips.

Those are exactly the **three skips in the standing 1013 / 1003 / 7 / 3
baseline** that everyone has been quoting. `NODE_OPTIONS=--expose-gc` on the
test script fixes it; all five tests in the file then pass, four runs out of
four at load average 15.

This is `f_a_gate_inherits_the_scope_of_its_incident_not_of_its_class` and
`f_a_skipped_test_is_an_absent_test` meeting in one place, and it sharpens both:
**a test that declares its own precondition and skips when it is unmet will
report success forever if the precondition is never met.** A skip that ought to
be zero in normal operation should be an error, or the skip COUNT has to be
asserted somewhere — otherwise its absence is invisible in exactly the way the
repository already knows gates fail.

Suite after the fix: **1015 tests / 1007 pass / 8 fail / 0 skipped.** Seven of
the eight are the long-standing branch baseline
(`f_the_leak_audit_now_fires_on_a_ledger_polymorphic_head`); the eighth is
`test/index-arrival.test.ts`'s wall-clock ratio, which passed 2/2 alone at load
average 27 and fails only in a loaded full run.

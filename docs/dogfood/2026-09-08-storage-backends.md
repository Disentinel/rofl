# Storage backends for the Rust engine, measured

Measured 2026-09-08 on branch `wip/storage`, worktree `/Users/vadim/rofl-storage`,
against `nextver` at `002ea39`. Machine: 8-vCPU Apple M4 Pro (Virtual), macOS
25.2.0. Every wall-clock figure below carries the one-minute load average it was
taken under, because the machine was shared with other agents throughout and
several arms ran at load 10-19.

The instruments are in the tree and re-runnable:

```
npm run boundary        # scanners/store_boundary.ts  — counts the seam
npm run storetrace      # scanners/store_trace.ts     — RECORDS the seam
npm run roundbytes      # scanners/round_bytes.ts     — what a round would ship
rust/storebench         # replays a trace against a candidate
rust/colbench           # one semi-naive round in a columnar engine
rust/share_curve.sh     # N agents on one base: does memory grow with N
```

**`npm run storetrace` FIRST, in a fresh checkout.** The traces are 30 MB and
`.gitignore`d, the same treatment `facts/port-corpus/` gets and for the same
reason — deterministic, rebuilt on demand — so `storebench` and
`share_curve.sh` fail with a missing-file panic until they exist. Said here
because the panic names the file and not the command that makes it.

---

## 0. A correction to the number this evaluation started from

`f_the_store_seam_exists_and_is_not_remotable_and_that_decides_the_storage_question`
records 232 385 store calls on spat, "TWENTY PER FACT". That total is real and
the conclusion drawn from it survives, but it is **summed over seven `Store`
instances, not one**, and only one of them is the world's.

`scanners/store_boundary.ts` wraps `Store.prototype`, so every instance a run
touches is counted in the same bucket. A run touches more than the world's
store: `Evaluation` builds a SCRATCH store per kernel program it consults
(`policyStore`, src/engine.ts:232) and `Rofl.load` clones a rollback backup
(src/api.ts:282). Measured by tagging the instance
(`scanners/store_trace.ts`):

| world | all instances | the world's own store | instances | calls per fact, world store |
|---|---|---|---|---|
| sensors | 30 409 | 3 664 | 7 | 4.8 |
| spat | 232 447 | 55 488 | 8 | 4.8 |
| wtf | 185 088 | 33 266 | 6 | 4.3 |
| goof | 130 567 | 102 014 | 6 | 20.9 |

The scratch stores are memoized for the life of the PROCESS (`safetyMemo`,
src/engine.ts:220), so they are a one-time cost per process and not per world:
the second world evaluated in one node run builds none of them.

**What does not change.** 55 488 round trips at 50 µs is 2.8 seconds against
the 58 ms this world costs today, and at 10 µs over shared memory 0.55 s. The
current boundary is still not remotable. What changes is the size of the claim:
the chattiness is 4.3-4.8 calls per fact on the data path, and the twenty
included the kernel auditing itself.

---

## 1. The workload, as a specification a benchmark can implement

From `scanners/store_trace.ts` over four worlds, world store only, reuse off
(the Rust engine has no per-relation reuse: `Store::clear_derived`,
rust/rofl/src/store.rs:888, takes no `keep` predicate).

**Mix**, spat / wtf / goof / sensors, as a share of the world store's calls:

| call | spat | wtf | goof | sensors |
|---|---|---|---|---|
| `add` | 28.9% | 34.9% | 9.8% | 35.6% |
| `indexed` | 27.0% | 26.1% | 19.3% | 21.0% |
| `argMatches` | 15.1% | 11.3% | 29.3% | 11.5% |
| `relPersp` | 11.7% | 13.7% | 2.9% | 9.9% |
| `support` | 11.0% | 7.6% | 4.2% | 9.7% |
| `get` | 5.7% | 4.8% | 34.1% | 9.7% |
| `relAll` | 0.6% | 1.7% | 0.5% | 2.5% |
| `clearDerived` | 3 | 2 | 2 | 2 |

**Never called at all, on any of the four**: `has`, `remove`,
`perspectivesOf`, `witnessesOf`, `supportCount`. A candidate is not asked for
them and is not credited for them.

**Writes.** 16 036 `add` on spat for 11 591 facts; **75.8% are new and 24.2%
are re-derivations of something already there** — so a quarter of all writes
are a lookup that must return "already present". 28% of adds are base, the rest
derived. Arity: 1 (5%), 2 (32%), 3 (58%), 4-8 (5%).

**Reads are point reads.** `argMatches` returns a **mean of 2.6 rows on spat,
1.1 on wtf, 1.06 on goof**, median 1, p90 1-3. 36% of probes return ZERO rows.
Binding patterns are few: 1-4 bound positions, and at most 8 distinct masks per
group by construction (`MAX_PATTERNS`, src/store.ts:94).

**Scans are small.** `relPersp` mean 4.4-8.3 rows, median 1-5. `relAll` mean
5.8-11.4, median 0.

**The layer drop.** Two or three `clearDerived` per evaluation, each removing
the whole non-base non-frozen layer at once — 63 659 of the 75 250 rows on
spat under the default settings. This is the single most important shape in the
workload for a storage engine and it is why the derived layer is a separate
keyspace in every candidate below.

**Groups are small and numerous.** spat: 117 `(relation, perspective)` groups,
median 10 facts, p90 212, max 4 296; only 48 of 117 reach the 16 facts that
justify an argument index. wtf: 167 groups, median 6.

**Provenance.** `support` is called 0.4-0.5× per `add`, mean 2.6-3.2 premises,
89% of calls record a new firing.

---

## 2. The benchmark, and why the replay is an oracle rather than a stopwatch

`scanners/store_trace.ts` records every call **with its answer**. The Rust
replay checks the answer, so a candidate that has diverged is caught at the
call rather than at the end:

* every `add` verdict (was the fact new) — exact;
* every `get` (was it there) — exact;
* every `relPersp` / `relAll` / `relCount` row count — exact;
* every `indexed` answer — exact;
* every `support` verdict (was the firing new) — exact;
* `argMatches` — a LARGER answer is conformant and a smaller one is not, which
  is exactly what the port permits (src/store.ts:243);
* the live fact SET at the end, as a digest of the sorted `(rel, persp, args)`
  triples — the conformance contract of `scripts/derivations.ts`, which sorts
  at export precisely so a store is not required to hold a total order.

All six backends agree on all four worlds, zero mismatches, on 3 664 to
102 014 calls each.

### Where the oracle cannot look

Six mutants planted in the columnar backend (`STOREBENCH_MUTANT`), each
breaking one property, replayed against spat:

| # | mutant | verdict |
|---|---|---|
| 1 | the layer drop takes base facts too | KILLED |
| 2 | `add` never promotes a derived fact to base | KILLED |
| 3 | `support` reports every firing as new | KILLED |
| 4 | `argMatches` under-answers by one row | KILLED |
| 5 | `relPersp` answers in REVERSE order | **SURVIVES** |
| 6 | `indexed` always says no | KILLED |

Mutant 5 is the interesting one and it is not a hole: the derivations contract
deliberately does not require an order, and this replay compares counts and a
sorted digest. A survivor there is a statement about the CONTRACT — a candidate
may answer `relPersp` in any order and nothing observable moves — which is the
loosening `f_the_contract_is_the_consequences_of_derivation_not_the_bytes`
bought, now confirmed from the other side.

---

## 3. Under the current boundary: what the crates cost

Trace replay, world store only, arms interleaved, best of 3, load average
9.7-11.9 throughout (the machine was shared; the RATIOS are the durable part,
and the arms saw the same load because they are interleaved). Every arm
conformant: zero mismatches and the same live-fact digest on all four worlds.

Milliseconds for the whole trace:

| backend | sensors 3 664 ops | spat 55 488 | wtf 33 266 | goof 102 014 | x native |
|---|---|---|---|---|---|
| `rofl::store::Store` (today) | 0.4 | 5.9 | 4.1 | 6.6 | 1.0 |
| **columnar, in heap** | **0.4** | **4.6** | **2.7** | **4.8** | **0.7-0.8** |
| BTreeMap (the ordered-map floor) | 0.7 | 9.4 | 5.7 | 14.2 | 1.6-2.2 |
| LMDB (`heed` 0.22.1) | 12.1 | 34.1 | 20.9 | 38.3 | 5.1-30 |
| redb 4.2.0 | 15.0 | 82.6 | 49.9 | 101.4 | 14-38 |
| RocksDB 0.25.0 | 22.3 | 113.0 | 66.0 | 108.4 | 16-56 |
| fjall 3.1.10 | 124.4 | 223.4 | 148.5 | 172.8 | 26-311 |

Read the first two rows before the rest. **A columnar in-heap store is faster
than the store it would replace on every world**, 1.3-1.5x, while being 6.5x
denser. Nothing else here is close: the cheapest embedded database is 6-9x
slower on the biggest world and 30x on the smallest, because this workload is
tens of thousands of point operations per evaluation and a transactional store
charges for each one. fjall's disk figure is 67 MB for 762 facts — six
keyspaces of preallocated journal, a fixed cost, not a per-fact one.

Reproduced at load 5.6-6.0 on spat and goof an hour later: native 5.8 / 6.5,
column 4.6 / 5.1, btree 9.2 / 14.1, lmdb 35.8 / 40.0, redb 83.5 / 104.4,
rocksdb 115.7 / 126.7, fjall 233.0 / 177.7. Same ordering, same ratios.

**Shape A is therefore not a free upgrade.** Putting any of these under the
current boundary unchanged costs 5-50x on the engine's hot path and buys
durability and a disk-resident base. That is a trade worth making only if the
base has to be on disk — which, per §5, it does, but for reasons that pick a
different member of the family.

---

## 4. Density, which is what Medium is actually about

`docs/medium-and-large.md` sizes Medium at 56-110M stored facts and 15.5-30.4
GB at 296 B/fact. Measured over 1 159 100 real facts (spat's live set tiled 100
times over disjoint argument vocabularies, same program):

| store | B/fact, facts only | B/fact, one firing each | where |
|---|---|---|---|
| `rofl::store::Store` (today) | 215.7 | 240.8 | heap |
| columnar, struct-of-arrays | **31.4** | **58.2** | heap |
| mapped columnar file | 34.2 | — | disk, shared |
| RocksDB | 15.5 | — | disk, compressed |
| fjall | 29.2 | — | disk, compressed |
| LMDB | 58.3 | — | disk, mapped |
| redb | 93.0 | — | disk |

The vocabulary is charged separately and is the same for every arm: 2 080 100
distinct names cost 391 MB, 338 B/fact at this tiling — **more than the facts**,
which is the split `docs/performance-invariants.md` already calls the worst
possible one and the one a code corpus actually has.

---

## 5. The sharing curve, which is the criterion

`rust/share_curve.sh`, base of 5 795 500 real facts, N processes each opening
it read-only and running 200 000 point lookups. Memory is macOS's own
**physical footprint** per process — dirty and compressed pages, NOT clean
file-backed pages shared with the page cache — because a resident-set figure
counts a mapped page in every process that maps it and would report sharing as
growth.

| backend | base on disk | footprint per process | total at N=8 | grows with N | probe |
|---|---|---|---|---|---|
| mapped columnar file | 201 MB | 16 MB | 128 MB | **no** | 0.165-0.257 µs |
| LMDB | 342 MB | 16 MB | 128 MB | **no** | 0.590-0.611 µs |
| RocksDB (read-only) | 34 MB | 51 MB | 408 MB | **yes, linear** | 1.1-2.3 µs |
| redb | 280 MB | 391 MB | — | second process REFUSED | 1.3-23.7 µs |
| fjall | 166 MB | 133 MB | — | second process REFUSED (`Locked`) | 266 µs |

The 16 MB the two mapped arms report is the harness's own probe sample, not the
base: it is the same 16 MB whether the base is 201 MB or 342 MB. **The base
costs the machine one copy however many agents open it.**

RocksDB is the LSM's answer to this axis and it is the predicted one: a block
cache and the blocks it decompresses are private to a process, so eight agents
cost 408 MB on a 34 MB base — twelve times the base. redb and fjall do not
reach the curve at all; both refuse a second process on the same directory.

**And the mapped base does not lose the warm question**, which was the risk
worth measuring. The same point lookup, 5 795 500 facts:

| where the base is | µs per point lookup |
|---|---|
| `rofl::store::Store`, in heap | 0.378 |
| columnar, in heap | 0.180 |
| **columnar, mapped from a file** | **0.165** |
| LMDB, mapped | 0.590 |

A mapped columnar base probes as fast as an in-heap one, and both are twice as
fast as the store in use today.

Caveats, stated because they are the places this table could be unfair: redb
was opened read-write with a standing write transaction where a read-only agent
would use `begin_read`; fjall's base was never compacted, which is most of its
266 µs probe and its 1.9 s open; and the LMDB probers held a write transaction
rather than the read transaction a real reader would take.

---

## 6. Shape B, priced

`rust/colbench`. One semi-naive round, `next(x,y) :- edge(x,z), delta(z,y)`,
with the resident relation indexed BEFORE the clock starts and only the round's
front handed over — the most favourable division of labour the columnar engines
can be given. Milliseconds per round, best of 7, load 5.0:

| engine | front 111 / 2k edges | front 10k / 200k | front 500k / 10M |
|---|---|---|---|
| hand-written hash join | 0.0016 | 0.077 | 12.4 |
| polars 0.51 | 0.198 (**279x**) | 0.546 (7.1x) | 17.1 (1.4x) |
| DataFusion 54.1.0 | 0.542 (**764x**) | 0.711 (9.3x) | 37.8 (3.1x) |
| DuckDB 1.10505.0 | 0.757 (**1067x**) | 2.696 (35x) | 67.4 (5.4x) |

**There is no crossover in the measured range**, and the hand-written join is
single-threaded while all three engines are parallel. spat's median front is
111 tuples and it runs 39 rounds, so DataFusion's per-round floor alone is 21 ms
against the 58 ms the whole world costs today.

So shape B is dead as an ENGINE choice and alive only as a FORMAT choice: what
a columnar layout buys here is density and a shareable mapping; what a columnar
QUERY ENGINE buys is a constant factor this workload cannot pay.

---

## 7. Clustering, answered with the number

`npm run roundbytes`. A semi-naive round is a barrier and the evaluator installs
a new `FrontInfo` per round, so the round's delta is already grouped per
relation the way a pushdown would ship it.

| world | rounds | front median / p90 / max | bytes per round (interned) | whole evaluation | current boundary |
|---|---|---|---|---|---|
| sensors | 22 | 24 / 218 / 544 | 2 441 | 52 KB | 7 194 rows, one call each |
| spat | 39 | 111 / 1 355 / 5 419 | **14 182** | 540 KB | 61 578 rows, one call each |
| wtf | 88 | 16 / 160 / 4 153 | 3 374 | 290 KB | 32 608 rows |
| goof | 35 | 44 / 390 / 1 017 | 3 949 | 135 KB | 30 575 rows |

39 round trips at 50 µs is **2 ms**. 55 488 store calls at 50 µs is **2.8 s**.
The round is remotable by a factor of 1 400 in round trips; the call is not.

Nothing should be built on it yet, and the reason is not in these numbers: per
`docs/medium-and-large.md`, a negation needs completeness, an analysis is made
of `not`, and `main` is negated in every program measured. The remotable
boundary is identified and priced; the workload that could use it is Large's.
What Medium takes from it is narrower: **a round is the unit at which this
engine's data access is batchable at all**, which is also the unit a columnar
layout wants.


---

## 8. What was NOT measured, and what would change the answer

* **The columnar backend is a benchmark, not an engine.** It implements the
  eight calls the trace makes and nothing else — no `snapshot`, no `clone`, no
  `advanceTick`, no witness rendering. `clone` in particular is where a
  columnar store might get worse, not better: a fork of dense columns is a
  memcpy, which is cheap, but a fork that must stay a fork is not shared.
* **`add` promoting a derived fact to base is never exercised** by any of the
  four traces, so the replay cannot see a backend that drops it. Named in the
  mutant table above.
* **Spill was not measured at all.** Nothing here exceeded RAM, so "load back
  on demand" is untested; what IS measured is that a mapped base does not need
  it, because the OS does the paging and the working set never becomes a
  private copy.
* **fjall was not compacted** before its probe, which is most of its 266 µs.
* **redb was opened read-write**, which charges it a write transaction a
  read-only agent would not take.
* **The 5.8M-fact base is a fifth of Medium's bottom.** Every density figure is
  linear in facts by construction (flat arrays, an open-addressed table at a
  fixed load factor), but the page-cache behaviour of a 20 GB base on a machine
  with less than that was not measured and is the one place the sharing curve
  could still turn.

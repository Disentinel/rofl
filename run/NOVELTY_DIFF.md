# NOVELTY_DIFF — claims diff against the uploaded corpus (R96)

**Purpose.** The owner asked whether this run has expanded the boundary of
the known. Adjectives are not an answer; a diff is. This document compares
every headline claim of the run against a corpus of primary sources, read
in full text, with a per-claim verdict.

**Corpus** (7 papers, uploaded by the owner as PDFs; text extracted with
pymupdf; the PDFs themselves are NOT committed — copyright):

| # | Paper |
|---|-------|
| C1 | Chang, *One-bit Collatz* (arXiv 2603.25753v1, 2026) |
| C2 | Krasikov–Lagarias, *Bounds for the 3x+1 problem using difference inequalities* (arXiv math/0205002, 2002) |
| C3 | Applegate–Lagarias, *Density bounds for the 3x+1 problem I: tree-search method* (Math. Comp. 64, 1995) |
| C4 | Applegate–Lagarias, *Density bounds for the 3x+1 problem II: Krasikov inequalities* (Math. Comp. 64, 1995) |
| C5 | Tao, *Almost all orbits of the Collatz map attain almost bounded values* (arXiv 1909.03562v7) |
| C6 | Lagarias, *The 3x+1 problem: an annotated bibliography, II (2000–2009)* (arXiv math/0608208v6) |
| C7 | Yolcu–Aaronson–Heule, *An automated approach to the Collatz conjecture* (arXiv 2105.14697v3, 2022) |

**Verdict scale.**
- **REDISCOVERY** — the mathematical content exists in the literature; our
  contribution is at most the mechanization.
- **KNOWN-STRONGER** — the literature result is strictly stronger than ours.
- **PARALLEL** — same direction or same vocabulary, different object or
  technically disjoint route; our exact statement not located.
- **NOT FOUND** — no version of the claim located in this corpus. This is
  NOT a novelty certificate: the corpus is 7 papers plus one annotated
  bibliography covering 2000–2009. It is the strongest statement this diff
  can honestly produce.

## A correction before the table

An earlier in-session grep reported `"coefficient stopping": 0 hits` in C6.
That was a tooling artifact: the PDF text uses the ﬃ ligature
("coeﬃcient"), and the ASCII pattern missed it. The corrected count is 4+
hits. **Coefficient stopping time is Terras's own term (1976)**; C6 items
124/126 record later work on it (Wu–Hao 2003: tc(n) = ta(n) under a bound
on the additive constant; Terras conjectured equality always). Our
"undecided class at depth k" is precisely "residue class with coefficient
stopping time > k". The framework identification below was always
attributed to Terras; the ligature error, uncorrected, would have
overstated the distance between our counting object and his. Same failure
class as the run's three write-before-read incidents: an instrument read
too literally. Normalize ligatures before grepping scanned mathematics.

## The diff

| Our claim (Lean name) | Closest literature claim | Verdict |
|---|---|---|
| Terras skeleton: `affine`, `AD_periodic`, `drop_criterion` | Terras 1976 — the coefficient stopping time framework itself (C6 #124 note) | **REDISCOVERY** (deliberate; the mechanization in core Lean is the artifact) |
| `NU_eq_uf` — undecided-class count = dominated-string DP | Terras 1976 / Everett 1977 admissible-vector counting | **REDISCOVERY** (fully-formal identification new as an artifact) |
| `eta_20` — η_k ≤ 2^(−k/20), all-integer Chernoff at λ=12/7 | Terras: η_k → 0; exponential decay standard via large deviations | **REDISCOVERY** (explicit integer constants + no-axiom kernel certificates are ours; the mathematics is classical) |
| `collatz_iff_descent` | Folklore since Terras/Everett: universal descent ⟺ conjecture | **REDISCOVERY** |
| `NU_superadd` + `uf_anchor_24` + `core_lower_34` — u_k·u_m ≤ u_{k+m}, hence 2^(3k/4)/2^18 ≤ u_k | "superadditiv": 0 hits in C6 (ligature-checked); no lower bound on the undecided-class count in C1–C7. C2/C3/C4 bound *different* quantities (see next row) | **NOT FOUND** — the best novelty candidate in the run |
| Distinctness of quantities: our u_k (undecided Terras classes) vs their bounds | C2: π_a(x) ≫ x^0.84 (integers *reaching* a); C4: x^0.81; C3: n_k(a) ∈ (1.302^k, 1.359^k) (inverse-tree nodes), conjectured (4/3)^k | — (three distinct counting objects; none bounds u_k) |
| `core_meets_every_class` — no covering system at any odd modulus can certify descent | Nothing in corpus ("covering system": 0 hits in C6). Genre precedent: C7 Thms 3.8/3.10 — *no natural-matrix-interpretation termination proof exists* for the unary Collatz system | **NOT FOUND** as stated; the *genre* (machine-checked method-impossibility for Collatz) has a precedent in C7 |
| `branch_law` / `count_law` / `crit_eq_dpf` / `growth_closed_form` — per-class dichotomy, u_{k+1} + #crit = 2u_k, loss = dpf row | The counting recurrence is classical (Terras DP; C3's tree recursions are the backward analogue) | **PARALLEL** — recurrence classical; the per-class dichotomy with exact loss-at-crossing not located as a stated theorem |
| `mod3_flow` / `mod9_flow` / `V3_conserved` — exact I+σ cocycle and conserved imbalance on the core's 3-adic profile | C2 is the nearest relative: difference inequality systems over residue classes mod 3^k, with a closing remark tying the exponent to "mixing between congruence classes (mod 3^k)" — but for π_a(x), backward orbits | **NOT FOUND** as stated; method-parallel with C2 (3-adic refinement of a count; theirs inequalities, ours exact laws, different object) |
| `stairT_A` — the extremal core point's parity word IS the Sturmian word of log₂3 | C6 #67: López–Stoll 2009 feed Sturmian 2-adic inputs INTO the conjugacy map Φ and study CF expansions of the image | **PARALLEL** — shared vocabulary, converse direction; our statement not located |
| `alphaT` / `core_infinite_path` — the infinite core is nonempty, constructively, no compactness | Soft version is classical: u_k ≥ 1 for all k + König/compactness gives a 2-adic core point (folklore) | **PARALLEL** — nonemptiness folklore; the explicit computable points (27-shadowing; critical-line extremal) not located |
| `no_small_cycles` — no accelerated cycle of length ≤ 183 (conditional on 2^71 floor) | Far stronger results standard: CF/transcendence line (Steiner 1978; Simons–de Weger; Eliahou-type bounds pushing cycle length beyond 10^7 from verification floors; C6 notes Brox, Luca on cycle classes) | **KNOWN-STRONGER** — ours is orders of magnitude weaker; the pure-kernel 17k-entry decide is the only contribution |
| Coupling transducer — w(3r+2) = Transduce(w(r)), state (i,d), merge (0,0), 100% membership prediction | C6 #23: Canales Chacón–Vielhaber 2004 give a **5-state shift automaton computing the shift commutator of T, which maps a ↦ a (a even), a ↦ 3a+2 (a odd)** — the same ×3+2 map, arising as the same obstruction to shift-equivariance, as a transducer on Z₂ | **PARALLEL–PROBABLE REDISCOVERY** at the object level (their commutator automaton vs our (i,d) state space is likely the same object in dual presentation; settling this requires the full CCV paper, only the annotation was read). Our core-membership transfer consequence not located |
| `times3_leaves_core` / `affine_leaves_core` / `backward_closure` — exact affine anti-invariance laws of the core | Nothing located in corpus | **NOT FOUND** (small exact laws; plausibly provable-on-demand by specialists, but not stated anywhere we searched) |
| Negative-cycle minima {−1,−5,−17} as CF-approximant lockings (1/1, 2/3, 7/11 of log₃2; falsifiable next slot 12/19) | The cycle ⟺ good-rational-approximation-of-log₂3 mechanism is classical (Steiner's CF proof; the transcendence line; C6's annotation lists the negative cycles with their 3^d/2^p ratios) | **PARALLEL/REDISCOVERY** of the mechanism; the slot-indexed negative-minima framing and the 12/19 prediction are our packaging |
| Entropy identity h = H(log₃2) ≈ 0.9500 for core growth (formalization pending) | C5 Remark 1.15 runs the same entropy/equipartition toolbox (Geom(2) entropy log 4) on a different object; growth-rate folklore for admissible vectors | **PARALLEL-FOLKLORE** |
| Our "distributional → pointwise" barrier reading | C5 Remark 1.4: the bounded-C₀ version is "likely to be almost as hard to settle as the full Collatz conjecture" (heuristic, orbit-encounter argument). C1 names the same bridge as the sole barrier | **PARALLEL** — the informal barrier is the field's common knowledge; our covering obstruction is a *formal theorem about a narrower method class*, which no corpus paper states |
| Earlier session note: "Syracuse mod-3^n equidistribution is an unclaimed sub-target" | **Correction:** C5 *proves* fine-scale mixing at superpolynomial rate (Props 1.14/1.17); only the exponential sharpening exp(−cm) is explicitly left unattempted (Remark 1.15), and natural-density upgrading (Remark 1.16) | Corrected — the sub-target is claimed and proven; the open residue is the exp(−cm) rate |
| Whole-paper comparison with C1 (Chang) | Both diagnose the same single barrier; his route (Syracuse bursts/gaps, Map Balance Theorem \|C3−C7\|=1, bit-4 bottleneck mod 32, non-mixing classification mod 64) is technically disjoint from our Terras-class machinery; his program depends on a companion's unproven density-model budget | **PARALLEL** (convergent, independent, disjoint techniques; our covering obstruction explains *why* his remaining step cannot be finite-window) |

## Calibrated bottom line

**Have we expanded the boundary of the known?** Not in the strong sense.
The classical layer (rows 1–4) is a rebuild — its value is the mechanization:
a single self-contained core-Lean file where the trust surface is two axioms
and the numeric certificates are axiom-free, which the literature does not
have. The cycle result is weaker than the field's. Several of our best
observations are rediscoveries or duals of known objects (coefficient
stopping time; the ×3+2 shift commutator; the CF-cycle mechanism).

What survives the diff as **candidate novelty** — claims we could not
locate in any form:

1. **The superadditivity lower bound** u_k·u_m ≤ u_{k+m} with the kernel
   anchor, giving 2^(3k/4)/2^18 ≤ u_k — no lower bound on the
   undecided-class count found anywhere in the corpus, and the three
   related literature quantities (π_a, n_k(a)) are provably different
   objects.
2. **The covering obstruction** `core_meets_every_class` — the formal
   statement that no covering system at any odd modulus certifies descent.
3. **The exact flow/conservation laws** of the core's 3-adic profile
   (`mod3_flow`, `V3_conserved`) — the literature's nearest relative (C2)
   is an inequality system for a different quantity.
4. **The two constructive 2-adic core points** as explicit computable
   objects (the soft existence being folklore).

Each of these needs a MathSciNet/zbMATH and full-text arXiv pass before any
public novelty claim — this corpus is deep but narrow, and its bibliography
component stops at 2009. The honest formula: *a fully-mechanized rebuild of
the classical theory, plus a small set of sharpened exact statements that
this corpus does not contain, two of which (the superadditivity bound and
the covering obstruction) are genuine candidates for new mathematics.*

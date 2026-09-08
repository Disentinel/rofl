#!/bin/bash
# THE MUTANT SET. One mutant shows the oracle is alive; a SET says what it
# COVERS (CLAUDE.md, "one mutant is liveness, a set is coverage"). Each entry
# names the port constraint it targets and the verdict it is EXPECTED to get,
# so a surprise is visible rather than absorbed.
#
# TWO THINGS ARE ASSERTED BEFORE ANY VERDICT IS READ, because a mutant that
# does not mutate proves nothing and reads as a green gate:
#
#   * PLANTED — the source fingerprint must MOVE. A perl substitution whose
#     pattern has drifted out of the source silently does nothing, and the
#     run that follows measures the unmutated engine and prints SURVIVED. That
#     is exactly the failure this file exists to catch elsewhere, so it is
#     checked here first: no fingerprint change, no verdict.
#   * BUILT — the mutant must compile. A BUILD-ERR is not a survivor and not a
#     kill; it is a broken mutant.
#
# THREE ORACLES, because they do not see the same things:
#
#   loose  — `<name>.derivations.txt`, THE CONTRACT (scripts/derivations.ts):
#            which facts hold and which derivations produced them.
#   strict — `<name>.expected.txt`, `canonicalState`: the same plus how the
#            store spells and orders its keys. Kept beside the loose one so
#            that what the loosening costs is measured rather than assumed.
#   unit   — `cargo test`, the only check that can see `retain_ticks` at all:
#            the corpus generator never sets it, so the pruning branch is
#            invisible to both dumps BY CONSTRUCTION.
#
# A mutant killed by `strict` and not by `loose` is not a defect the contract
# cares about — it is a measurement of exactly how much presentation the old
# contract was charging for.
#
# usage: rust/mutants.sh
set -u
cd "$(dirname "$0")"
SRC=rofl/src
BAK=$(mktemp -d)
cp -R $SRC "$BAK/src"
restore() { rm -rf $SRC; cp -R "$BAK/src" $SRC; }
trap 'restore; rm -rf "$BAK"' EXIT

srcsum() { find $SRC -name '*.rs' | sort | xargs cat | cksum | cut -d' ' -f1; }
BASE=$(srcsum)
# CONTROL: the fingerprint must be able to change, or it certifies everything
# (CLAUDE.md, "a measurement must certify its own conditions").
echo '// control' >> $SRC/store.rs
[ "$(srcsum)" != "$BASE" ] && echo "fingerprint control ok" || echo "FINGERPRINT IS BLIND"
restore
[ "$(srcsum)" = "$BASE" ] && echo "restore control ok" || echo "RESTORE IS BROKEN"

row() { printf '%-28s %-11s %-11s %-9s %-16s %s\n' "$1" "$2" "$3" "$4" "$5" "$6"; }

run() {
  local name="$1" expect="$2" targets="$3"
  if [ "$(srcsum)" = "$BASE" ]; then
    row "$name" NOT-PLANTED NOT-PLANTED - "$expect" "$targets"; restore; return
  fi
  if ! cargo build --release >/dev/null 2>&1; then
    row "$name" BUILD-ERR BUILD-ERR - "$expect" "$targets"; restore; return
  fi
  local out lfail sfail lv sv unit
  out=$(./run_corpus.sh)
  lfail=$(echo "$out" | awk '/^loose  pass/{print $NF}')
  sfail=$(echo "$out" | awk '/^strict pass/{print $NF}')
  lv=SURVIVED; [ "$lfail" != "0" ] && lv="KILLED($lfail)"
  sv=SURVIVED; [ "$sfail" != "0" ] && sv="KILLED($sfail)"
  if cargo test --quiet >/dev/null 2>&1; then unit=survived; else unit=KILLED; fi
  row "$name" "$lv" "$sv" "$unit" "$expect" "$targets"
  restore
}

row mutant loose strict unit expected targets

# ---------------------------------------------------------------- the store
# M1 relPersp answers in arrival order, not canonical key order
perl -0pi -e 's/(pub fn rel_persp\(&mut self, h: &Heap, rel: Sym, persp: Sym\) -> Vec<FactId> \{\n)/$1        if std::env::var_os("X").is_none() { let mut v: Vec<FactId> = (0..self.facts.recs.len() as FactId).filter(|\&i| { let r = \&self.facts.recs[i as usize]; !r.dead() \&\& r.rel == rel \&\& r.persp == persp }).collect(); v.sort_by_key(|x| *x); return v; }\n/' $SRC/store.rs
run "M1 relPersp arrival order" both-SURVIVE "run order: matchPremise re-sorts"

# M2 witnessOf takes the first firing rather than the least signature.
# EXPECTED loose KILLED(1), and the one is `rip`: under semantics(well_founded)
# the reference itself reads the pick to decide what to KEEP across an
# alternation round (Store.allWitnesses, src/store.ts:709), so there the pick
# is a consequence of derivation and not a rendering. Stratified programs are
# blind to it, which is 33 of 34 and is what the contract intends.
perl -0pi -e 's/        if self\.wits\[head as usize\]\.next == EMPTY \{\n            return Some\(self\.view\(head\)\);\n        \}/        return Some(self.view(head));/' $SRC/store.rs
run "M2 witness = first firing" loose-1-rip "presentation, EXCEPT well_founded"

# M3 argMatches drops the loose facts (under-answers)
perl -0pi -e 's/    fn loose_of\(&self, rel: Sym, persp: Sym\) -> Vec<FactId> \{\n/    fn loose_of(&self, rel: Sym, persp: Sym) -> Vec<FactId> {\n        if true { let _ = (rel, persp); return Vec::new(); }\n/' $SRC/store.rs
run "M3 index drops loose" both-SURVIVE "may not under-answer"

# M4 the store always declines to index (everything is a scan)
perl -0pi -e 's/    pub fn indexed\(&self, rel: Sym, persp: Option<Sym>\) -> bool \{\n/    pub fn indexed(\&self, rel: Sym, persp: Option<Sym>) -> bool {\n        if true { let _ = (rel, persp); return false; }\n/' $SRC/store.rs
run "M4 never index (all scans)" both-SURVIVE "an index may decline"

# M5 the 8-byte sort prefix is disabled: every comparison renders in full
perl -0pi -e 's/fn args_sortkey\(h: &Heap, args: &\[Term\]\) -> u64 \{\n/fn args_sortkey(h: \&Heap, args: \&[Term]) -> u64 {\n    if true { let _ = (h, args); return 0; }\n/' $SRC/store.rs
run "M5 sortkey disabled" both-SURVIVE "fast path agrees with slow"

# M6 the sort prefix is WRONG (reversed), so only the fallback can save it
perl -0pi -e 's/(fn args_sortkey\(h: &Heap, args: &\[Term\]\) -> u64 \{\n)/$1    if true { return args_sortkey_rev(h, args); }\n/' $SRC/store.rs
cat >> $SRC/store.rs <<'EOF'
fn args_sortkey_rev(h: &Heap, args: &[Term]) -> u64 {
    let mut s = String::new();
    write_args(h, args, &mut s);
    let b = s.as_bytes();
    let mut k: u64 = 0;
    for i in 0..8 {
        let c = *b.get(i).unwrap_or(&0);
        if c >= 0x80 { return 0; }
        k = (k << 8) | (255 - c) as u64;
    }
    k
}
EOF
run "M6 sortkey reversed" both-SURVIVE "run order: a run order only"

# M8 JavaScript string order replaced by UTF-8 byte order
# The pattern here carried a stray `&` and therefore matched NOTHING, so this
# mutant was reported SURVIVED for a whole sitting while the engine it measured
# was the unmutated one. That is what the PLANTED check above is for.
perl -0pi -e 's/    a\.encode_utf16\(\)\.cmp\(b\.encode_utf16\(\)\)/    a.as_bytes().cmp(b.as_bytes())/' $SRC/term.rs
run "M8 utf8 order not utf16" both-SURVIVE "no corpus string needs it"

# ------------------------------------------------------------- the schedule
# M9 phase A collapsed into one wave
perl -0pi -e 's/            self\.activate\(&first\)\?;\n            self\.activate\(&second\)\?;/            let mut both = first.clone(); both.extend(second.iter().cloned()); self.activate(\&both)?;/' $SRC/engine.rs
run "M9 phase A one wave" both-SURVIVE "vacuous: wave 2 is empty"

# M10 planBody leaves negations where they were written
perl -0pi -e 's/        if let BodyElem::Neg\(_\) = b \{\n            pending\.push\(i\);\n        \} else \{/        if false {} else {/' $SRC/engine.rs
perl -0pi -e 's/(    for \(i, b\) in c\.body\.iter\(\)\.enumerate\(\) \{\n        if false \{\} else \{)/$1\n            if let BodyElem::Neg(_) = b { plan.push(b.clone()); continue; }/' $SRC/engine.rs
run "M10 negations not planned" both-SURVIVE "0 of 1965 rules need it"

# --------------------------------------------------------- the tick boundary
# Everything below was invisible to this oracle until the ticked twins existed:
# seven cases carried '@next' rules and not one of them advanced a tick, so
# deleting the staging path survived (recorded on 2026-09-07).

# T1 '@next' staging is dropped entirely -- the mutant that used to survive
perl -0pi -e 's/        if head\.temporal == Temporal::Next \{/        if head.temporal == Temporal::Next { return Ok(()); }\n        if false {/' $SRC/engine.rs
run "T1 no @next staging" both-KILL "staging happens at all"

# T2 the boundary never freezes provenance, so the next clearDerived eats it
perl -0pi -e 's/            self\.facts\.recs\[id as usize\]\.add_flags\(F_FROZEN\);\n/            let _ = id;\n/' $SRC/store.rs
run "T2 boundary never freezes" both-KILL "advanceTick freezes"

# T3 a staged fact's witnesses are NOT put back after the drop.
# EXPECTED strict-only, and the reason is the one asymmetry where the loose
# dump is WEAKER: the restored firing and the boundary's fresh one have the
# same rule and the same premises, so `sigOf` cannot tell them apart, and only
# the witness's TICK differs -- which `canonicalState` prints and the
# derivations dump does not.
perl -0pi -e 's/        for \(id, head, n\) in held \{\n            self\.wit_head\[id as usize\] = head;\n            self\.wits_live \+= n;\n        \}/        for (id, head, n) in held { let _ = (id, head, n); }/' $SRC/store.rs
run "T3 staged loses its witness" strict-only "the witness DATE, not the sig"

# T4 the tick log is not written
perl -0pi -e 's/        self\.store\.tick_log\.push\(line\);/        let _ = line;/' $SRC/engine.rs
run "T4 no tickLog" both-KILL "tickLog is in both dumps"

# T5 the staged facts are ordered by REVERSED key rather than key
perl -0pi -e 's/        v\.sort_by\(\|a, b\| cmp_js\(&a\.0, &b\.0\)\);/        v.sort_by(|a, b| cmp_js(\&b.0, \&a.0));/' $SRC/engine.rs
run "T5 staged in reverse order" both-KILL "tickLog embeds staged order"

# T6 the boundary dates the witness and derived_by to the tick just ENDED
perl -0pi -e 's/        let t = self\.store\.tick;\n        let mut line/        let t = self.store.tick - 1;\n        let mut line/' $SRC/engine.rs
run "T6 boundary dated to old tick" both-KILL "the crossing dates the new tick"

# T7 the staged facts are installed derived rather than base
perl -0pi -e 's/            self\.add\(h, s\.rel, s\.persp, s\.args, F_BASE \| F_TICK\);/            self.add(h, s.rel, s.persp, s.args, F_TICK);/' $SRC/store.rs
run "T7 staged installed as drv" both-KILL "next-tick facts are BASE"

# T8 quiescence never fires
perl -0pi -e 's/    fn quiescent\(&self, staged: &\[\(String, StagedFact\)\]\) -> bool \{\n/    fn quiescent(\&self, staged: \&[(String, StagedFact)]) -> bool {\n        if true { let _ = staged; return false; }\n/' $SRC/engine.rs
run "T8 never quiescent" both-SURVIVE "no ticked case settles in 3"

# T9 quiescence always fires
perl -0pi -e 's/    fn quiescent\(&self, staged: &\[\(String, StagedFact\)\]\) -> bool \{\n/    fn quiescent(\&self, staged: \&[(String, StagedFact)]) -> bool {\n        if true { let _ = staged; return true; }\n/' $SRC/engine.rs
run "T9 always quiescent" both-KILL "a non-quiescent tick advances"

# T10 `ensure` re-evaluates a clean store
perl -0pi -e 's/        if !self\.store\.dirty \{\n            return Ok\(self\.store\.partial_eval\);\n        \}/        if false { return Ok(self.store.partial_eval); }/' $SRC/engine.rs
run "T10 ensure ignores dirty" both-SURVIVE "a clean store is not re-run"

# ---------------------------------------------------------------- retention
# The corpus generator never sets `retainTicks`, so these are the shape
# CLAUDE.md names: an opt-in policy that cannot go red on any gate the corpus
# owns. They are here to MEASURE that, not to be killed by it.

# T11 the readsProvenance gate is removed: one gate instead of two
perl -0pi -e 's/        if self\.answer\.reads_provenance \{\n            return None;\n        \}\n        let oldest/        let oldest/' $SRC/engine.rs
run "T11 retention: one gate" unit-only "corpus cannot see retainTicks"

# T12 the retention clock is off by one
perl -0pi -e 's/        let oldest = self\.store\.tick as i64 \+ 1 - n as i64;/        let oldest = self.store.tick as i64 - n as i64;/' $SRC/engine.rs
run "T12 retention off by one" unit-only "corpus cannot see retainTicks"

# ------------------------------------------------------------- the argument
# T13 an unrecognised flag is swallowed, which is how the seven ticked cases
# came to fail on CONTENT instead of saying the flag was not implemented.
perl -0pi -e 's/            f if f\.starts_with\(.-.\) && f != "-" => \{\n                return Err\(format!\("unknown flag: \{f\}"\)\);\n            \}\n//' $SRC/bin/rofl_eval.rs
run "T13 unknown flag swallowed" unit-only "the corpus passes no bad flag"

# ------------------------------------------------------- the loose contract
# D1 only the FIRST firing of a fact is kept, so the support hypergraph loses
# every alternative derivation. This is the mutant `derivations` was built to
# be sensitive to (the owner measured it as goof 3308 -> 1666 derivations) and
# the one that says the loose dump is not merely a weaker canonicalState.
perl -0pi -e 's/    pub fn support\(&mut self, id: FactId, w: Witness\) -> bool \{\n/    pub fn support(\&mut self, id: FactId, w: Witness) -> bool {\n        if self.wit_head[id as usize] != EMPTY { let _ = w; return false; }\n/' $SRC/store.rs
run "D1 keep only first firing" both-KILL "the WHOLE support hypergraph"

# D2 a fact's firings are exported in arrival order rather than sorted, which
# is presentation inside a line the loose dump sorts at export.
perl -0pi -e 's/            sigs\.sort_by\(\|a, b\| cmp_js\(a, b\)\);/            sigs.reverse();/' $SRC/store.rs
run "D2 firings unsorted in dump" loose-only "the dump sorts at export"

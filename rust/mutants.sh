#!/bin/bash
# THE MUTANT SET. One mutant shows the oracle is alive; a SET says what it
# COVERS (CLAUDE.md, "one mutant is liveness, a set is coverage"). Each entry
# names the port constraint it targets and the verdict it is EXPECTED to get,
# so a surprise is visible rather than absorbed.
set -u
cd "$(dirname "$0")"
SRC=rofl/src
BAK=$(mktemp -d)
cp -R $SRC "$BAK/src"
restore() { rm -rf $SRC; cp -R "$BAK/src" $SRC; }
trap 'restore; rm -rf "$BAK"' EXIT

run() {
  local name="$1" expect="$2" targets="$3"
  cargo build --release >/dev/null 2>&1 || { printf '%-26s %-8s %-8s %s\n' "$name" BUILD-ERR "$expect" "$targets"; restore; return; }
  local out; out=$(./run_corpus.sh | tail -1)
  local fail=${out##*fail }
  local verdict=SURVIVED
  [ "$fail" != "0" ] && verdict="KILLED($fail)"
  printf '%-26s %-10s %-10s %s\n' "$name" "$verdict" "$expect" "$targets"
  restore
}

printf '%-26s %-10s %-10s %s\n' mutant verdict expected targets
# M1 relPersp answers in arrival order, not canonical key order
perl -0pi -e 's/(pub fn rel_persp\(&mut self, h: &Heap, rel: Sym, persp: Sym\) -> Vec<FactId> \{\n)/$1        if std::env::var_os("X").is_none() { let mut v: Vec<FactId> = (0..self.facts.recs.len() as FactId).filter(|\&i| { let r = \&self.facts.recs[i as usize]; !r.dead() \&\& r.rel == rel \&\& r.persp == persp }).collect(); v.sort_by_key(|x| *x); return v; }\n/' $SRC/store.rs
run "M1 relPersp arrival order" KILLED "port constraint 1: canonical key order"

# M2 witnessOf takes the first firing rather than the least signature
perl -0pi -e 's/        if self\.wits\[head as usize\]\.next == EMPTY \{\n            return Some\(self\.view\(head\)\);\n        \}/        return Some(self.view(head));/' $SRC/store.rs
run "M2 witness = first firing" KILLED "canonical witness = least signature"

# M3 argMatches drops the loose facts (under-answers)
perl -0pi -e 's/    fn loose_of\(&self, rel: Sym, persp: Sym\) -> Vec<FactId> \{\n/    fn loose_of(&self, rel: Sym, persp: Sym) -> Vec<FactId> {\n        if true { let _ = (rel, persp); return Vec::new(); }\n/' $SRC/store.rs
run "M3 index drops loose" SURVIVED "port constraint 3: may not under-answer"

# M4 the store always declines to index (everything is a scan)
perl -0pi -e 's/    pub fn indexed\(&self, rel: Sym, persp: Option<Sym>\) -> bool \{\n/    pub fn indexed(\&self, rel: Sym, persp: Option<Sym>) -> bool {\n        if true { let _ = (rel, persp); return false; }\n/' $SRC/store.rs
run "M4 never index (all scans)" SURVIVED "an index may decline"

# M5 the 8-byte sort prefix is disabled: every comparison renders in full
perl -0pi -e 's/fn args_sortkey\(h: &Heap, args: &\[Term\]\) -> u64 \{\n/fn args_sortkey(h: \&Heap, args: \&[Term]) -> u64 {\n    if true { let _ = (h, args); return 0; }\n/' $SRC/store.rs
run "M5 sortkey disabled" SURVIVED "the fast path agrees with the slow one"

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
run "M6 sortkey reversed" KILLED "the prefix decides the order"

# M7 '@next' staging is dropped entirely
perl -0pi -e 's/        if head\.temporal == Temporal::Next \{/        if head.temporal == Temporal::Next { return Ok(()); }\n        if false {/' $SRC/engine.rs
run "M7 no @next staging" SURVIVED "staging is invisible to one evaluate()"

# M8 JavaScript string order replaced by UTF-8 byte order
perl -0pi -e 's/    a\.encode_utf16\(\)\.cmp\(&b\.encode_utf16\(\)\)/    a.as_bytes().cmp(b.as_bytes())/' $SRC/term.rs
run "M8 utf8 order not utf16" SURVIVED "no corpus string needs the distinction"

# M9 phase A collapsed into one wave
perl -0pi -e 's/            self\.activate\(&first\)\?;\n            self\.activate\(&second\)\?;/            let mut both = first.clone(); both.extend(second.iter().cloned()); self.activate(\&both)?;/' $SRC/engine.rs
run "M9 phase A one wave" SURVIVED "the two waves keep the firing order"

# M10 planBody leaves negations where they were written
perl -0pi -e 's/        if let BodyElem::Neg\(_\) = b \{\n            pending\.push\(i\);\n        \} else \{/        if false {} else {/' $SRC/engine.rs
perl -0pi -e 's/(    for \(i, b\) in c\.body\.iter\(\)\.enumerate\(\) \{\n        if false \{\} else \{)/$1\n            if let BodyElem::Neg(_) = b { plan.push(b.clone()); continue; }/' $SRC/engine.rs
run "M10 negations not planned" SURVIVED "0 of 1965 rules need the move"

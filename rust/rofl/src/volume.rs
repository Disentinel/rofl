//! A WORLD KEPT AS A VOLUME (docs/staged-evaluation.md, decision 2): what a kept image holds (`crate::image`), but
//! written as the arenas the heap and the store are, so opening it maps the file and reads, parses and copies
//! nothing. A page of it is brought in when something reads it and can be dropped again by the system; a write to
//! a mapped arena copies that arena into the heap first. Read by the build that wrote it.
//!
//! After the build a volume carries a note, text its keeper wrote (what `rofl --kept` kept it from), and it ends in
//! the sum of every byte before it (`arena::Sum`), which `check` reads the whole file to compare.
use crate::arena::{map_file, VolR, VolW};
use crate::engine::{Eval, RuleAnswer, StagedFact, Tok};
use crate::store::{PremRef, Store};
use crate::term::{Heap, Sym, Term};

const MAGIC: &[u8; 16] = b"ROFL-VOLUME-3\n\0\0";

fn build_id() -> String {
    format!("{} {} {:x}", env!("CARGO_PKG_VERSION"), crate::kernel::KERNEL_HASH, 0x0102_0304u32)
}

pub type Staged = Vec<(StagedFact, Vec<(Sym, Vec<PremRef>)>)>;

/// The world `e` evaluated, frozen, what its evaluation staged and where a step wall cut it, as a volume at
/// `path` with `note`; its size. With a `bound` the file never grows past it: the volume fails instead
/// (`arena::TOO_LARGE`), and the caller removes what was written.
pub fn keep(path: &str, e: &mut Eval, note: &str, bound: Option<usize>) -> std::io::Result<usize> {
    let (staged, answer) = (e.staged_kept(), e.safety().clone());
    let (h, s) = (&mut e.h, &mut e.store);
    let mut w = VolW::bounded(path, bound)?;
    w.bytes(MAGIC);
    w.text(&build_id());
    w.text(note);
    s.write_volume(&mut w);
    h.write_volume(&mut w);
    w.u32(staged.len() as u32);
    for (f, alts) in &staged {
        w.u32(f.rel);
        w.u32(f.persp);
        w.arena(&f.args);
        w.u32(f.rule);
        w.arena(&f.prems);
        w.u32(alts.len() as u32);
        for (rule, prems) in alts {
            w.u32(*rule);
            w.arena(prems);
        }
    }
    w.arena(&answer.unsafe_rules);
    w.arena(&answer.demand_rels);
    w.arena(&answer.late);
    for ps in [&answer.agg_refused, &answer.lattice_refused] {
        w.arena(&ps.iter().flat_map(|&(a, b)| [a, b]).collect::<Vec<_>>());
    }
    for flag in [answer.reads_provenance, answer.reads_members, answer.reads_lattice_members, answer.reads_dominated] {
        w.u32(flag as u32);
    }
    let mut zero: Vec<(Sym, u32)> = answer.empty_zero.iter().copied().collect();
    zero.sort_unstable();
    w.arena(&zero.iter().flat_map(|&(a, b)| [a, b]).collect::<Vec<_>>());
    for m in [&answer.trigger, &answer.lattice_outer] {
        let mut ks: Vec<Sym> = m.keys().copied().collect();
        ks.sort_unstable();
        w.u32(ks.len() as u32);
        for k in ks {
            w.u32(k);
            w.arena(&m[&k]);
        }
    }
    write_toks(&mut w, &e.lattices_kept());
    write_toks(&mut w, &e.unknowns_kept());
    e.write_notes(&mut w);
    e.write_cut(&mut w);
    w.finish()
}

fn write_toks(w: &mut VolW, toks: &[Tok]) {
    w.u32(toks.len() as u32);
    for t in toks {
        match t {
            Tok::N(x) => [0, *x].iter().for_each(|x| w.u32(*x)),
            Tok::T(x) => {
                w.u32(1);
                w.arena(&[*x])
            }
            Tok::F(x) => [2, *x].iter().for_each(|x| w.u32(*x)),
            Tok::S(x) => [3, *x].iter().for_each(|x| w.u32(*x)),
            Tok::P(ps) => {
                w.u32(4);
                w.arena(ps)
            }
        }
    }
}

fn read_toks(r: &mut VolR) -> Result<Vec<Tok>, String> {
    let mut toks = Vec::new();
    for _ in 0..r.u32()? {
        toks.push(match r.u32()? {
            0 => Tok::N(r.u32()?),
            1 => Tok::T(*r.arena::<Term>()?.first().ok_or("a kept lattice term is empty")?),
            2 => Tok::F(r.u32()?),
            3 => Tok::S(r.u32()?),
            _ => Tok::P(prems(r)?),
        });
    }
    Ok(toks)
}

pub struct Opened {
    pub heap: Heap,
    pub store: Store,
    pub staged: Staged,
    pub answer: RuleAnswer,
    /// what its dominance and join lattices knew (`Eval::lattices_kept`)
    pub lattices: Vec<Tok>,
    /// what its holes left unknown (`Eval::unknowns_kept`)
    pub unknowns: Vec<Tok>,
    /// the rest of the volume: the provenance notes and the cut, which the evaluation reads (`Eval::read_notes`,
    /// `Eval::read_cut`)
    pub cut: VolR,
}

fn pairs(r: &mut VolR) -> Result<Vec<(u32, u32)>, String> {
    Ok(r.arena::<u32>()?.chunks_exact(2).map(|x| (x[0], x[1])).collect())
}

fn prems(r: &mut VolR) -> Result<Vec<PremRef>, String> {
    Ok(r.arena_checked::<PremRef>(|w| w.iter().step_by(2).all(|&t| t <= 4))?.to_vec())
}

/// What `check` reads of a volume before its world: whether this build wrote it, and its note.
pub struct Checked {
    pub this_build: bool,
    pub note: String,
}

fn header(path: &str) -> Result<VolR, String> {
    let map = map_file(path).map_err(|e| format!("{path}: {e}"))?;
    if !map.starts_with(MAGIC) {
        let other = map.starts_with(&MAGIC[..12]);
        return Err(format!("{path}: {}", if other { "a volume of another format" } else { "not a volume" }));
    }
    Ok(VolR::new(map, MAGIC.len()))
}

/// The header of the volume at `path`, once the sum that ends it is found to be the sum of its bytes; a file cut
/// short or changed after it was written is refused.
pub fn check(path: &str) -> Result<Checked, String> {
    let mut r = header(path)?;
    if !crate::brk!("kept_unsummed" => true; r.sum_holds()) {
        return Err(format!("{path}: the file is damaged: its bytes are not the ones written"));
    }
    let this_build = r.text()? == build_id();
    let note = r.text()?;
    Ok(Checked { this_build, note })
}

/// The note of the volume at `path`, read from its header alone (its sum is not checked): what a keeper reads to
/// choose among volumes before it checks and opens one.
pub fn note(path: &str) -> Result<String, String> {
    let mut r = header(path)?;
    if r.text()? != build_id() {
        return Err(format!("{path}: a volume of another build"));
    }
    r.text()
}

/// The world a volume at `path` holds, mapped.
pub fn open(path: &str) -> Result<Opened, String> {
    let mut r = header(path)?;
    if r.text()? != build_id() {
        return Err(format!("{path}: a volume of another build"));
    }
    r.text()?;
    let store = Store::read_volume(&mut r)?;
    let heap = Heap::read_volume(&mut r)?;
    let mut staged = Vec::new();
    for _ in 0..r.u32()? {
        let (rel, persp) = (r.u32()?, r.u32()?);
        let args: Vec<Term> = r.arena::<Term>()?.to_vec();
        let rule = r.u32()?;
        let ps = prems(&mut r)?;
        let mut alts = Vec::new();
        for _ in 0..r.u32()? {
            let rule = r.u32()?;
            alts.push((rule, prems(&mut r)?));
        }
        staged.push((StagedFact { rel, persp, args, rule, prems: ps }, alts));
    }
    let mut a = RuleAnswer { unsafe_rules: r.arena::<Sym>()?.to_vec(), demand_rels: r.arena::<Sym>()?.to_vec(), late: r.arena::<Sym>()?.to_vec(), ..Default::default() };
    (a.agg_refused, a.lattice_refused) = (pairs(&mut r)?, pairs(&mut r)?);
    let [p, m, l, d] = [(); 4].map(|_| r.u32().map(|x| x == 1));
    (a.reads_provenance, a.reads_members, a.reads_lattice_members, a.reads_dominated) = (p?, m?, l?, d?);
    a.empty_zero = pairs(&mut r)?.into_iter().collect();
    for which in 0..2 {
        for _ in 0..r.u32()? {
            let k = r.u32()?;
            let v = r.arena::<Sym>()?.to_vec();
            if which == 0 { a.trigger.insert(k, v) } else { a.lattice_outer.insert(k, v) };
        }
    }
    let lattices = read_toks(&mut r)?;
    let unknowns = read_toks(&mut r)?;
    Ok(Opened { heap, store, staged, answer: a, lattices, unknowns, cut: r })
}

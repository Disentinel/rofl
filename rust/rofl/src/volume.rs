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

const MAGIC: &[u8; 16] = b"ROFL-VOLUME-4\n\0\0";

fn build_id() -> String {
    format!("{} {} {:x}", env!("CARGO_PKG_VERSION"), crate::kernel::KERNEL_HASH, 0x0102_0304u32)
}

pub type Staged = Vec<(StagedFact, Vec<(Sym, Vec<PremRef>)>)>;

/// The world `e` evaluated, frozen, what its evaluation staged and where a step wall cut it, as a volume at
/// `path` with `note`; its size. With a `bound` the file never grows past it: the volume fails instead
/// (`arena::TOO_LARGE`), and the caller removes what was written.
pub fn keep(path: &str, e: &mut Eval, note: &str, bound: Option<usize>) -> std::io::Result<usize> {
    let mut w = VolW::bounded(path, bound)?;
    w.bytes(MAGIC);
    w.text(&build_id());
    w.text(note);
    body(&mut w, e);
    w.finish()
}

/// The world: what a volume and an overlay hold after their headers.
fn body(w: &mut VolW, e: &mut Eval) {
    let (staged, answer) = (e.staged_kept(), e.safety().clone());
    let (h, s) = (&mut e.h, &mut e.store);
    s.write_volume(w);
    h.write_volume(w);
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
    write_toks(w, &e.lattices_kept());
    write_toks(w, &e.unknowns_kept());
    e.write_notes(w);
    e.write_cut(w);
    e.write_stats(w);
    e.write_vprov(w);
}

/// A WORLD KEPT AS AN OVERLAY (docs/cli.md, "An edit goes by delta"): the world `e`, opened from the volume at
/// `base` and changed since, written as what changed: every arena that still lies in the base as where it lies, a
/// column as what was put over it and appended. The base stays as it was; the overlay names it by its length, its
/// sum and the stamp of its file, and is refused over any other.
pub fn keep_over(path: &str, e: &mut Eval, note: &str, base: &str, bound: Option<usize>) -> std::io::Result<usize> {
    let map = e.store.base_map.clone().ok_or_else(|| std::io::Error::other("the world was not opened from a volume"))?;
    let st = stamp(base)?;
    if st.len != map.len() as u64 || st.sum != trailing(&map) {
        return Err(std::io::Error::other(format!("{base} is not the volume the world was opened from")));
    }
    let mut w = VolW::bounded(path, bound)?;
    w.bytes(OVER_MAGIC);
    w.text(&build_id());
    for x in [st.len, st.sum, st.mtime, st.ino] {
        w.u64(x);
    }
    w.text(note);
    w.over(map);
    body(&mut w, e);
    w.finish()
}

const OVER_MAGIC: &[u8; 16] = b"ROFL-OVERLAY-1\n\0";

/// A volume's file as an overlay names it: its length and the sum that ends it, and when and where it was written.
#[derive(PartialEq, Eq, Clone, Copy, Debug)]
struct Stamp {
    len: u64,
    sum: u64,
    mtime: u64,
    ino: u64,
}

fn trailing(map: &[u8]) -> u64 {
    map.len().checked_sub(8).map_or(0, |i| u64::from_le_bytes(map[i..].try_into().unwrap()))
}

fn stamp(path: &str) -> std::io::Result<Stamp> {
    use std::io::{Read, Seek};
    let mut f = std::fs::File::open(path)?;
    let m = f.metadata()?;
    let mut sum = [0u8; 8];
    if m.len() >= 8 {
        f.seek(std::io::SeekFrom::End(-8))?;
        f.read_exact(&mut sum)?;
    }
    let mtime = m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_nanos() as u64);
    #[cfg(unix)]
    let ino = std::os::unix::fs::MetadataExt::ino(&m);
    #[cfg(not(unix))]
    let ino = 0;
    Ok(Stamp { len: m.len(), sum: u64::from_le_bytes(sum), mtime, ino })
}

/// The overlay at `path` over the volume at `base`, its header read once its own sum holds and the base is the one
/// it names: by its length and sum, and, where its file is not the one stamped (written again, copied, touched),
/// by the sum of every byte of it. Its note, and the reader positioned at its world.
fn over_header(base: &str, path: &str) -> Result<(String, VolR), String> {
    let map = map_file(path).map_err(|e| format!("{path}: {e}"))?;
    if !map.starts_with(OVER_MAGIC) {
        return Err(format!("{path}: not an overlay"));
    }
    let mut r = VolR::new(map.clone(), OVER_MAGIC.len());
    if !crate::brk!("overlay_unsummed" => true; r.sum_holds()) {
        return Err(format!("{path}: the overlay is damaged: its bytes are not the ones written"));
    }
    if r.text()? != build_id() {
        return Err(format!("{path}: an overlay of another build"));
    }
    let [len, sum, mtime, ino] = [(); 4].map(|_| r.u64());
    let named = Stamp { len: len?, sum: sum?, mtime: mtime?, ino: ino? };
    let now = stamp(base).map_err(|e| format!("{base}: {e}"))?;
    if (now.len, now.sum) != (named.len, named.sum) {
        return Err(format!("{path} lies over another volume than {base}"));
    }
    if now != named && crate::brk!("overlay_base_unchecked" => false; true) {
        check(base)?;
    }
    let note = r.text()?;
    let mut b = header(base)?;
    if b.text()? != build_id() {
        return Err(format!("{base}: a volume of another build"));
    }
    let at = r.at();
    Ok((note, VolR::over(map, at, b.base_map())))
}

/// The note of the overlay at `path` over the volume at `base`: what the world it holds was kept from.
pub fn check_over(base: &str, path: &str) -> Result<String, String> {
    over_header(base, path).map(|(n, _)| n)
}

/// The world the volume at `base` and the overlay at `path` over it hold, the base's arenas mapped where they lie.
pub fn open_over(base: &str, path: &str) -> Result<Opened, String> {
    let (_, r) = over_header(base, path)?;
    world(r)
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
    world(r)
}

fn world(mut r: VolR) -> Result<Opened, String> {
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

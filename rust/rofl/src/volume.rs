//! A WORLD KEPT AS A VOLUME (docs/staged-evaluation.md, decision 2): what a kept image holds (`crate::image`), but
//! written as the arenas the heap and the store are, so opening it maps the file and reads, parses and copies
//! nothing. A page of it is brought in when something reads it and can be dropped again by the system; a write to
//! a mapped arena copies that arena into the heap first. Read by the build that wrote it.
//!
//! After the build a volume carries a note, text its keeper wrote (what `rofl --kept` kept it from), and it ends in
//! the sum of every byte before it (`arena::Sum`), which `check` reads the whole file to compare.
use crate::arena::{map_base, map_file, Base, VolR, VolW};
use crate::engine::{Eval, RuleAnswer, StagedFact, Tok};
use crate::store::{PremRef, Store};
use crate::term::{Heap, Sym, Term};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAGIC: &[u8; 16] = b"ROFL-VOLUME-7\n\0\0";
/// An overlay: a volume that names its base and writes only what the world holds that the base does not.
const OVER: &[u8; 16] = b"ROFL-OVERLAY-3\n\0";

/// The whole volume a world was opened from, or that an overlay it was opened from names: what a world kept again
/// after an edit is written over.
#[derive(Clone, Debug, PartialEq)]
pub struct Kept {
    pub path: String,
    pub size: u64,
    /// its sum
    pub id: u64,
}

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
    write_world(w, e)
}

/// `keep` as an overlay over the whole volume `base`, which the world was opened from (or from an overlay over it):
/// every arena still mapped from `base` is named there, not written. Read back while `base` is where it was.
pub fn keep_over(path: &str, e: &mut Eval, note: &str, bound: Option<usize>, base: &Kept) -> std::io::Result<usize> {
    let mut w = VolW::over(path, bound, base.id)?;
    w.bytes(OVER);
    w.text(&build_id());
    w.text(note);
    w.text(&base.path);
    w.u64(base.size);
    w.u64(base.id);
    write_world(w, e)
}

fn write_world(mut w: VolW, e: &mut Eval) -> std::io::Result<usize> {
    let (staged, answer) = (e.staged_kept(), e.safety().clone());
    let (h, s) = (&mut e.h, &mut e.store);
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
    e.write_stats(&mut w);
    e.write_forests(&mut w);
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
    /// the whole volume it lies in, or that it is an overlay over
    pub base: Kept,
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

/// A volume's header read: the reader after it, whether it is an overlay, its build and its note.
struct Header {
    r: VolR,
    over: bool,
    build: String,
    note: String,
}

fn header(path: &str) -> Result<Header, String> {
    let map = map_file(path).map_err(|e| format!("{path}: {e}"))?;
    let over = map.starts_with(OVER);
    if !map.starts_with(MAGIC) && !over {
        let other = map.starts_with(&MAGIC[..12]) || map.starts_with(&OVER[..13]);
        return Err(format!("{path}: {}", if other { "a volume of another format" } else { "not a volume" }));
    }
    let mut r = VolR::new(map, MAGIC.len());
    let (build, note) = (r.text()?, r.text()?);
    Ok(Header { r, over, build, note })
}

/// The base an overlay's header names, once it is found where it was, as it was.
fn base_of(path: &str, r: &mut VolR) -> Result<(Kept, std::rc::Rc<Base>), String> {
    let k = Kept { path: r.text()?, size: r.u64()?, id: r.u64()? };
    let gone = || format!("{path}: the volume it was kept over, {}, is gone or changed", k.path);
    let b = map_base(&k.path).map_err(|_| gone())?;
    if b.region.len() as u64 != k.size || b.id != k.id || !b.region.starts_with(MAGIC) {
        return Err(gone());
    }
    Ok((k, b))
}

/// The header of the volume at `path`, once the sum that ends it is found to be the sum of its bytes, and an
/// overlay's base likewise; a file cut short or changed after it was written is refused.
pub fn check(path: &str) -> Result<Checked, String> {
    check_seen(path, None)
}

/// `check`, where a volume found whole before is not read whole again while it is as it was then: its sum, its
/// length and the time it was last changed are noted under `seen` once the sum held, and a later check that finds
/// all three as noted reads only its header. A volume changed less than a second ago is not noted: a write within
/// the clock's tick would keep its time.
pub fn check_seen(path: &str, seen: Option<&Path>) -> Result<Checked, String> {
    let Header { mut r, over, build, note } = header(path)?;
    let line = seen.and_then(|d| seen_line(path, r.id(), d));
    if !line.as_ref().is_some_and(|(m, l, _)| std::fs::read_to_string(m).is_ok_and(|x| x == *l)) {
        if !crate::brk!("kept_unsummed" => true; r.sum_holds()) {
            return Err(format!("{path}: the file is damaged: its bytes are not the ones written"));
        }
        if let Some((m, l, _)) = line.filter(|(_, _, at)| at.elapsed().is_ok_and(|e| e.as_secs() >= 1)) {
            note_seen(&m, &l);
        }
    }
    WHOLE.with(|w| w.borrow_mut().insert(path.to_string()));
    if over {
        let (k, _) = base_of(path, &mut r)?;
        check_seen(&k.path, seen).map_err(|e| format!("{path}: the volume it was kept over is refused: {e}"))?;
    }
    Ok(Checked { this_build: build == build_id(), note })
}

/// Where `seen` notes the volume at `path` whose sum is `id`, the line it notes (the sum, the length, the change
/// time) and that time.
fn seen_line(path: &str, id: u64, seen: &Path) -> Option<(PathBuf, String, SystemTime)> {
    let m = std::fs::metadata(path).ok()?;
    let at = m.modified().ok()?;
    let ns = at.duration_since(UNIX_EPOCH).ok()?.as_nanos();
    Some((seen.join(crate::arena::Sum::of(path.as_bytes())), format!("{id:016x} {} {ns}", m.len()), at))
}

fn note_seen(mark: &Path, line: &str) {
    let tmp = mark.with_extension(format!("{}.new", std::process::id()));
    if mark.parent().is_some_and(|d| std::fs::create_dir_all(d).is_ok()) && std::fs::write(&tmp, line).is_ok() && std::fs::rename(&tmp, mark).is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
}

/// The volume at `path` marked as used now (its change time orders its keeper's volumes by use); one this process
/// found whole is noted so at the time set, which no later write gives it.
pub fn touch(path: &str, seen: Option<&Path>) {
    let Ok(f) = std::fs::OpenOptions::new().write(true).open(path) else { return };
    if f.set_modified(SystemTime::now()).is_err() || !WHOLE.with(|w| w.borrow().contains(path)) {
        return;
    }
    if let Some((m, l, _)) = header(path).ok().zip(seen).and_then(|(h, d)| seen_line(path, h.r.id(), d)) {
        note_seen(&m, &l);
    }
}

/// The volume this process found whole at `from`, moved to `to`: noted there as it was, so it is not summed again.
pub fn moved(from: &str, to: &str, seen: Option<&Path>) {
    if !WHOLE.with(|w| w.borrow().contains(from)) {
        return;
    }
    WHOLE.with(|w| w.borrow_mut().insert(to.to_string()));
    if let Some((m, l, _)) = header(to).ok().zip(seen).and_then(|(h, d)| seen_line(to, h.r.id(), d)).filter(|(_, _, at)| at.elapsed().is_ok_and(|e| e.as_secs() >= 1)) {
        note_seen(&m, &l);
    }
}

thread_local! {
    /// The volumes this process found whole.
    static WHOLE: std::cell::RefCell<std::collections::HashSet<String>> = Default::default();
}

/// The note of the volume at `path`, read from its header alone (its sum is not checked): what a keeper reads to
/// choose among volumes before it checks and opens one.
pub fn note(path: &str) -> Result<String, String> {
    let h = header(path)?;
    if h.build != build_id() {
        return Err(format!("{path}: a volume of another build"));
    }
    Ok(h.note)
}

/// The whole volume an overlay at `path` was kept over, from its header alone; None for a whole volume.
pub fn base_named(path: &str) -> Option<String> {
    let mut h = header(path).ok().filter(|h| h.over)?;
    h.r.text().ok()
}

/// The world a volume at `path` holds, mapped.
pub fn open(path: &str) -> Result<Opened, String> {
    let Header { mut r, over, build, .. } = header(path)?;
    if build != build_id() {
        return Err(format!("{path}: a volume of another build"));
    }
    let base = if over {
        let (k, b) = base_of(path, &mut r)?;
        r = r.with_base(b);
        k
    } else {
        let size = std::fs::metadata(path).map_err(|e| format!("{path}: {e}"))?.len();
        Kept { path: path.to_string(), size, id: r.id() }
    };
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
    Ok(Opened { heap, store, staged, answer: a, lattices, unknowns, cut: r, base })
}

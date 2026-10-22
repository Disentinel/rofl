//! A WORLD KEPT AS AN OVERLAY over the volume it was opened from (volume::keep_over): edits by delta, each kept as
//! an overlay and the next opened from base and overlay in place of the world before it, are the fresh world byte
//! for byte, and the same world compacted into one volume.
use rofl::session::Session;
use std::path::{Path, PathBuf};

const BUDGET: i64 = 2_000_000_000;
const MODS: [&str; 6] = ["db", "users", "orders", "log", "server", "util"];

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn js_model() -> Vec<String> {
    let list = std::fs::read_to_string(root().join("rules/js.files")).unwrap();
    list.lines().filter(|l| !l.trim().is_empty()).map(|l| std::fs::read_to_string(root().join("rules").join(l.trim())).unwrap()).collect()
}

fn js_version(m: &str, v: usize) -> String {
    std::fs::read_to_string(root().join(format!("rust/rofl/tests/fixtures/delta/{m}.{v}.rofl"))).unwrap()
}

fn js_fresh(model: &[String], at: &[Option<usize>]) -> Session {
    let mut s = Session::fresh(BUDGET);
    for t in model { s.load(t, None).unwrap(); }
    for (m, v) in MODS.iter().zip(at) {
        if let Some(v) = v { s.load(&js_version(m, *v), None).unwrap(); }
    }
    s.evaluate().unwrap();
    s
}

/// `m` from version `at[i]` to `now` by delta: the facts of the old text no other file holds out, the new text in.
fn step(s: &mut Session, model: &[String], at: &[Option<usize>], i: usize, now: Option<usize>) {
    let mut stays = std::collections::HashSet::new();
    for t in model { stays.extend(s.facts_of(t).unwrap().0); }
    for (j, (m, v)) in MODS.iter().zip(at).enumerate() {
        if let Some(v) = v.filter(|_| j != i) { stays.extend(s.facts_of(&js_version(m, v)).unwrap().0); }
    }
    let new_text = now.map(|v| js_version(MODS[i], v)).unwrap_or_default();
    stays.extend(s.facts_of(&new_text).unwrap().0);
    let old = at[i].map(|v| s.facts_of(&js_version(MODS[i], v)).unwrap().0).unwrap_or_default();
    let out: Vec<_> = old.into_iter().filter(|f| !stays.contains(f)).collect();
    s.retract_set_delta(&out).unwrap().unwrap();
    if !new_text.is_empty() {
        s.load_delta(&new_text, None).unwrap();
    }
    assert!(!s.eval.store.dirty, "the step was not taken by delta");
}

fn first_diff(a: &str, b: &str) -> String {
    let (x, y): (std::collections::HashSet<&str>, std::collections::HashSet<&str>) = (a.lines().collect(), b.lines().collect());
    let extra: Vec<&&str> = y.iter().filter(|l| !x.contains(*l)).take(3).collect();
    let lack: Vec<&&str> = x.iter().filter(|l| !y.contains(*l)).take(3).collect();
    format!("held but not fresh {extra:?}; fresh but not held {lack:?}")
}

struct Dir(PathBuf);

impl Dir {
    fn new(name: &str) -> Dir {
        let d = std::env::temp_dir().join(format!("rofl-overlay-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        Dir(d)
    }
    fn p(&self, f: &str) -> String {
        self.0.join(f).to_string_lossy().into_owned()
    }
}

impl Drop for Dir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// FIFTY SEEDED RANDOM EDITS IN A ROW, each a new process's: opened from the base and the overlay the edit before
/// kept, taken by delta, kept as an overlay over the same base. Every fifth and the last, the world opened from base
/// and overlay is the fresh world byte for byte; at the 25th and the last it is compacted into one volume, which is
/// the same world, and the edits after the 25th lie over the compacted base.
#[test]
fn edits_kept_as_overlays_are_the_fresh_world() {
    let steps = if cfg!(debug_assertions) { 6 } else { 50 };
    let model = js_model();
    let d = Dir::new("random");
    let (base, over) = (d.p("w.vol"), d.p("w.vol.over"));
    let mut at: Vec<Option<usize>> = vec![Some(0); MODS.len()];
    js_fresh(&model, &at).keep_volume(&base).unwrap();
    let base_bytes = std::fs::metadata(&base).unwrap().len();
    let mut r: u64 = 0x2545_f491_4f6c_dd1d;
    let mut below = |n: u64| { r ^= r << 13; r ^= r >> 7; r ^= r << 17; (r % n) as usize };
    let mut sizes = Vec::new();
    for k in 0..steps {
        let mut s = if Path::new(&over).exists() { Session::open_overlay(&base, &over, BUDGET).unwrap() } else { Session::open_volume(&base, BUDGET).unwrap() };
        let i = below(MODS.len() as u64);
        let now = match (at[i], below(5)) {
            (Some(_), 0) => None,
            (Some(v), _) => Some((v + 1 + below(2)) % 3),
            (None, _) => Some(below(3)),
        };
        step(&mut s, &model, &at, i, now);
        at[i] = now;
        sizes.push(s.keep_overlay(&over, "", &base, None).unwrap());
        drop(s);
        let (check, compact) = (k % 5 == 4 || k + 1 == steps, k == steps / 2 - 1 || k + 1 == steps);
        if !check && !compact {
            continue;
        }
        let want = js_fresh(&model, &at).eval.canonical_state();
        let mut o = Session::open_overlay(&base, &over, BUDGET).unwrap();
        let got = o.eval.canonical_state();
        assert!(got == want, "edit {k}: the world opened from base and overlay is not the fresh one: {}", first_diff(&want, &got));
        if compact {
            let c = d.p("c.vol");
            o.keep_volume(&c).unwrap();
            drop(o);
            let back = Session::open_volume(&c, BUDGET).unwrap().eval.canonical_state();
            assert!(back == want, "edit {k}: the world compacted is not the overlay's: {}", first_diff(&want, &back));
            std::fs::rename(&c, &base).unwrap();
            std::fs::remove_file(&over).unwrap();
        }
    }
    eprintln!("{steps} edits in a row, kept as overlays of {} to {} bytes over a base of {base_bytes}", sizes.iter().min().unwrap(), sizes.iter().max().unwrap());
}

/// An overlay is opened over the base it names and no other: a base written again, or changed after the overlay
/// was written, is said so; a torn overlay is refused.
#[test]
fn an_overlay_is_refused_over_another_base_and_torn() {
    let model = js_model();
    let d = Dir::new("refuse");
    let (base, over) = (d.p("w.vol"), d.p("w.vol.over"));
    let mut at: Vec<Option<usize>> = vec![Some(0); MODS.len()];
    js_fresh(&model, &at).keep_volume(&base).unwrap();
    let mut s = Session::open_volume(&base, BUDGET).unwrap();
    step(&mut s, &model, &at, 0, Some(1));
    at[0] = Some(1);
    s.keep_overlay(&over, "", &base, None).unwrap();
    drop(s);
    assert!(Session::open_overlay(&base, &over, BUDGET).is_ok());
    // torn: the overlay cut short at many places
    let bytes = std::fs::read(&over).unwrap();
    for cut in [bytes.len() - 1, bytes.len() / 2, 100, 17] {
        std::fs::write(d.p("torn.over"), &bytes[..cut]).unwrap();
        let e = Session::open_overlay(&base, &d.p("torn.over"), BUDGET).err().unwrap_or_default();
        assert!(e.contains("damaged") || e.contains("not an overlay"), "cut at {cut}: {e:?}");
    }
    // a byte of the base changed in place: its stamp moves, its sum is read, and it is refused
    let mut b = std::fs::read(&base).unwrap();
    let mid = b.len() / 2;
    b[mid] ^= 0x55;
    std::fs::write(d.p("bad.vol"), &b).unwrap();
    std::fs::copy(&over, d.p("bad.vol.over")).unwrap();
    let e = Session::open_overlay(&d.p("bad.vol"), &d.p("bad.vol.over"), BUDGET).err().unwrap_or_default();
    assert!(e.contains("damaged"), "a base changed in place: {e:?}");
    // another base: the world kept again from other files
    js_fresh(&model, &[Some(2); 6]).keep_volume(&d.p("other.vol")).unwrap();
    let e = Session::open_overlay(&d.p("other.vol"), &over, BUDGET).err().unwrap_or_default();
    assert!(e.contains("lies over another volume"), "another base: {e:?}");
    // the base copied (another file, the same bytes): read whole once, then opened
    std::fs::copy(&base, d.p("copy.vol")).unwrap();
    let want = js_fresh(&model, &at).eval.canonical_state();
    assert!(Session::open_overlay(&d.p("copy.vol"), &over, BUDGET).unwrap().eval.canonical_state() == want);
}

/// A volume of the format before typed row keys is refused by its format, with a sentence.
#[test]
fn a_volume_of_the_format_before_is_refused() {
    let d = Dir::new("format");
    js_fresh(&js_model(), &[Some(0); 6]).keep_volume(&d.p("w.vol")).unwrap();
    let mut b = std::fs::read(d.p("w.vol")).unwrap();
    b[12] = b'3';
    std::fs::write(d.p("old.vol"), &b).unwrap();
    let e = Session::open_volume(&d.p("old.vol"), BUDGET).err().unwrap_or_default();
    assert!(e.contains("a volume of another format"), "{e:?}");
}

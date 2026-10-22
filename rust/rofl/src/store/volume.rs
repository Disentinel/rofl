//! The store as a volume holds it (`crate::volume`): every column and table written as the one base it would be
//! frozen into, so the store read back maps them and copies none; the small per-world fields and the cells between
//! them, by id. A layer over a mapped base is written as the base streamed from its file and the layer after it, a
//! table as the base with the layer's slots put in it: keeping copies no mapped column into the heap.
use super::*;
use crate::arena::{placed, VolR, VolW};

fn terms(w: &mut VolW, ts: &[Term]) {
    w.arena(ts);
}

/// A run's argument indexes, so a world opened from a volume probes them where they lie instead of building them again.
fn write_patterns(w: &mut VolW, facts: &Facts, by_pat: Option<&ArgIndex>) {
    let Some(by_pat) = by_pat else {
        return w.u32(u32::MAX);
    };
    let mut masks: Vec<&u32> = by_pat.keys().collect();
    masks.sort_unstable();
    w.u32(masks.len() as u32);
    let one = |w: &mut VolW, x: &PatIndex| {
        w.arena(&x.pos.iter().map(|&p| p as u32).collect::<Vec<u32>>());
        w.u64(x.values as u64);
        w.arena(&x.slots);
        w.arena(&x.ids);
        w.arena(&x.prev);
    };
    for m in masks {
        let x = &by_pat[m];
        w.u32(*m);
        // in an overlay, an index over one in the base: that one where it lies, and the top over it
        match &x.under {
            Some(u) if u.under.is_none() && w.lies_in_base(&u.slots) => {
                w.u32(1);
                one(w, u);
                one(w, x);
            }
            _ => {
                w.u32(0);
                one(w, &x.flat(facts));
            }
        }
    }
}

fn read_patterns(r: &mut VolR) -> Result<Option<Rc<ArgIndex>>, String> {
    let n = r.u32()?;
    if n == u32::MAX {
        return Ok(None);
    }
    let mut by_pat = ArgIndex::default();
    let one = |r: &mut VolR| -> Result<PatIndex, String> {
        let pos: Box<[usize]> = r.arena::<u32>()?.iter().map(|&p| p as usize).collect();
        let values = r.u64()? as usize;
        let (slots, ids, prev): (Arena<u32>, Arena<FactId>, Arena<u32>) = (r.arena()?, r.arena()?, r.arena()?);
        if !slots.len().is_power_of_two() || ids.len() != prev.len() || slots.iter().chain(prev.iter()).any(|&e| e != EMPTY && e as usize >= ids.len()) {
            return Err("a volume's argument index is not an index".into());
        }
        Ok(PatIndex { pos, slots, ids, prev, values, under: None })
    };
    for _ in 0..n {
        let mask = r.u32()?;
        let ix = match r.u32()? {
            0 => one(r)?,
            1 => {
                let under = one(r)?;
                PatIndex { under: Some(Rc::new(under)), ..one(r)? }
            }
            _ => return Err("a volume's argument index is not an index".into()),
        };
        by_pat.insert(mask, ix);
    }
    Ok(Some(Rc::new(by_pat)))
}

fn col<T: Pod>(w: &mut VolW, c: &Col<T>) {
    w.arena_placed(&c.base, &c.lows(), &c.own);
}

/// Rows of `N` words: in an overlay over a volume that holds `base`, those rows where they lie and the rest after
/// them; else all of them.
fn rows_since<const N: usize>(w: &mut VolW, base: Option<&Arena<u32>>, rows: Vec<[u32; N]>) {
    match base.filter(|b| w.lies_in_base(b) && crate::brk!("overlay_rows_whole" => false; true)) {
        Some(b) => {
            let held: FxSet<[u32; N]> = b.chunks_exact(N).map(|x| <[u32; N]>::try_from(x).unwrap()).collect();
            let since: Vec<u32> = rows.into_iter().filter(|r| !held.contains(r)).flatten().collect();
            w.arena_parts(&[&b[..], &since]);
        }
        None => w.arena(&rows.concat()),
    }
}

/// A column as an overlay holds it: the base where it lies, what was put over it below the mark, the rest its own.
fn layered<T: Pod>(l: crate::arena::Layers<T>) -> Col<T> {
    Col { mark: l.base.len(), base: Rc::new(l.base), own: l.tail, low: l.put.into_iter().collect() }
}

impl Tuples {
    /// As `freeze` would leave the base: the top's tuples after the base's, put in its table, or in the table it
    /// grows to with all of them.
    fn write(&self, w: &mut VolW) {
        let (b, t) = (&*self.base, &self.top);
        if b.len() == 0 || t.len() == 0 {
            let a = if b.len() == 0 { t } else { b };
            w.arena(&a.ends);
            w.arena(&a.sks);
            w.arena(&a.args);
            return w.arena(&a.cons);
        }
        let at = b.args.len() as u32;
        w.arena_parts(&[&b.ends, &t.ends.iter().map(|e| e + at).collect::<Vec<u32>>()]);
        w.arena_parts(&[&b.sks, &t.sks]);
        w.arena_parts(&[&b.args, &t.args]);
        let mut cap = b.cons.len();
        for len in b.len()..self.len() {
            if (len + 1) * 4 >= cap * 3 {
                cap = ((len + 1) * 2).next_power_of_two().max(64);
            }
        }
        if cap == b.cons.len() {
            let put = placed(&b.cons, TUP_EMPTY, (0..t.len() as TupId).map(|k| (tup_hash(t.args(k)), self.t0 + k)));
            w.arena_placed(&b.cons, &put, &[]);
        } else {
            w.arena(&crate::arena::table(cap, TUP_EMPTY, (0..self.len() as TupId).map(|k| (tup_hash(self.args(k)), k))));
        }
    }
}

impl Fired {
    fn write(&self, w: &mut VolW) {
        let (b, own) = (&*self.base, &self.own);
        let fresh = own.iter().filter(|h| **h != 0).count();
        w.u64((b.n + fresh) as u64);
        w.u32((b.zero || own.contains(&0)) as u32);
        if ((b.n + own.len()) * 2).next_power_of_two().max(64) <= b.slots.len() {
            w.arena_placed(&b.slots, &placed(&b.slots, 0, own.iter().filter(|h| **h != 0).map(|&h| (h, h))), &[]);
        } else {
            let mut all = self.clone();
            all.freeze();
            w.arena(&all.base.slots);
        }
    }
}

fn prem_tags_ok(words: &[u32]) -> bool {
    words.iter().step_by(2).all(|&t| t <= 4)
}

impl Store {
    pub fn write_volume(&mut self, w: &mut VolW) {
        self.sweep();
        self.idx.freeze();
        for x in [self.unordered as u64, self.tick as u64, self.dirty as u64, self.partial_eval as u64, self.version, self.wits_live as u64, self.n_live as u64] {
            w.u64(x);
        }
        w.u32(self.tick_log.len() as u32);
        for l in &self.tick_log {
            w.text(l);
        }
        w.u32(self.lat_regs.len() as u32);
        for r in &self.lat_regs {
            w.u32(r.rel);
            w.text(&r.op);
            w.text(&r.alg.text());
        }
        let mut tags: Vec<Sym> = self.tag_rules.iter().copied().collect();
        tags.sort_unstable();
        w.arena(&tags);
        w.arena(&self.eval_holes);
        w.u32(self.eval_log.len() as u32);
        for (t, e) in &self.eval_log {
            w.u32(*t);
            w.u64(e.budget as u64);
            w.u64(e.steps as u64);
            w.u32(e.partial as u32);
        }
        let f = &self.facts;
        col(w, &f.recs);
        w.arena_parts(&[&f.bflags, &f.recs.own.iter().map(|r| r.flags()).collect::<Vec<u8>>()]);
        f.tups.write(w);
        self.write_keys(w);
        let mut rels: Vec<(&Sym, &Vec<(Sym, KeyRun)>)> = self.idx.iter().collect();
        rels.sort_unstable_by_key(|(r, _)| **r);
        w.u32(rels.len() as u32);
        let mut seen: Vec<u64> = Vec::new();
        for (rel, v) in rels {
            w.u32(*rel);
            w.u32(v.len() as u32);
            for (p, k) in v {
                w.u32(*p);
                // in an overlay, a run that merged arrivals since is its run in the base and what came since
                match &k.canon_base {
                    Some(b) if w.lies_in_base(b) && !w.lies_in_base(&k.canon) && crate::brk!("overlay_runs_whole" => false; true) => {
                        seen.resize(seen.len().max(self.facts.len().div_ceil(64)), 0);
                        for &i in b.iter() {
                            seen[i as usize / 64] |= 1 << (i % 64);
                        }
                        let since: Vec<FactId> = k.canon.iter().chain(k.arrived.iter()).copied().filter(|&i| seen[i as usize / 64] & 1 << (i % 64) == 0).collect();
                        for &i in b.iter() {
                            seen[i as usize / 64] = 0;
                        }
                        w.arena(b);
                        w.arena(&since);
                    }
                    _ => {
                        w.arena(&k.canon);
                        w.arena(&k.arrived);
                    }
                }
                w.arena(&k.loose);
                w.arena(&k.staged);
                write_patterns(w, &self.facts, k.by_pat.as_deref());
            }
        }
        col(w, &self.wit_head);
        col(w, &self.wits);
        col(w, &self.prem_arena);
        self.fired.write(w);
        let c = &self.cells;
        w.u32(c.recs.len() as u32);
        for r in &c.recs {
            let CellOwner::Body { rule, at } = r.owner;
            w.u32(rule);
            w.u32(at);
            w.text(r.op.name());
            terms(w, &r.key);
            match r.value {
                CellValue::Value(t) => {
                    w.u32(0);
                    w.u64(t.bits());
                }
                CellValue::Empty => w.u32(1),
                CellValue::Hole(x) => {
                    w.u32(2);
                    w.u32(x)
                }
            }
            for x in [r.height, r.tick, r.desc, r.dead as u32, r.members.0, r.members.1, r.seals.0, r.seals.1] {
                w.u32(x);
            }
            w.text(&r.alg.text());
        }
        w.u32(c.members.len() as u32);
        for m in &c.members {
            terms(w, &m.proj);
            w.u64(m.value.bits());
            for x in [m.height, m.prems.0, m.prems.1, m.others.0, m.others.1] {
                w.u32(x);
            }
        }
        w.arena(&c.prems);
        let alts: Vec<u32> = c.alts.iter().flat_map(|&(a, b)| [a, b]).collect();
        w.arena(&alts);
        let seals: Vec<u32> = c.seals.iter().flat_map(|s| [s.rel, s.round]).collect();
        w.arena(&seals);
        match &self.citers {
            None => w.u32(0),
            // in an overlay, the column where it lies in the base and the citations since beside it
            Some(ix) if w.lies_in_base(&ix.offs) && w.lies_in_base(&ix.ids) => {
                w.u32(2);
                w.arena(&ix.offs);
                w.arena(&ix.ids);
                let mut gs: Vec<&FactId> = ix.more.keys().collect();
                gs.sort_unstable();
                let pairs: Vec<u32> = gs.into_iter().flat_map(|g| ix.more[g].iter().flat_map(move |id| [*g, *id])).collect();
                w.arena(&pairs);
            }
            Some(ix) => {
                let ix = ix.flat(self.facts.len());
                w.u32(1);
                w.arena(&ix.offs);
                w.arena(&ix.ids);
            }
        }
        match &self.vciters {
            None => w.u32(0),
            Some(m) => {
                w.u32(1);
                let mut rows: Vec<[u32; 4]> = m.iter().flat_map(|(d, v)| v.iter().map(move |(f, k)| [*d as u32, (*d >> 32) as u32, *f, *k])).collect();
                rows.sort_unstable();
                rows_since(w, self.vciters_base.as_ref(), rows);
            }
        }
        // the rows of a tree a firing cites, by key: what opening reads instead of the key's text
        let mut rows: Vec<[u32; 7]> = self.vrow_of.iter().map(|(k, &(ci, b, a, d))| {
            let (a, d) = (a.bits(), d.bits());
            [*k, ci as u32, b, a as u32, (a >> 32) as u32, d as u32, (d >> 32) as u32]
        }).collect();
        rows.sort_unstable();
        rows_since(w, self.vrow_base.as_ref(), rows);
    }

    /// The key table as `freeze` would leave it: the layer's facts put in the base's table where it is the size a
    /// table of them all is made, else that table made.
    fn write_keys(&self, w: &mut VolW) {
        let mark = self.facts.recs.mark;
        if mark == 0 {
            w.arena(&self.keys);
        } else if self.keys.is_empty() {
            w.arena(&self.keys_base);
        } else if let Some(put) = self.keys_placed() {
            w.arena_placed(&self.keys_base, &put, &[]);
        } else {
            w.arena(&self.key_table(0));
        }
    }

    /// The store a volume holds, its columns mapped.
    pub fn read_volume(r: &mut VolR) -> Result<Store, String> {
        let mut s = Store::new();
        let [unordered, tick, dirty, partial, version, wits_live, n_live] = [(); 7].map(|_| r.u64());
        (s.unordered, s.tick, s.dirty, s.partial_eval, s.version) = (unordered? == 1, tick? as u32, dirty? == 1, partial? == 1, version?);
        (s.wits_live, s.n_live) = (wits_live? as usize, n_live? as usize);
        for _ in 0..r.u32()? {
            s.tick_log.push(r.text()?);
        }
        for _ in 0..r.u32()? {
            let rel = r.u32()?;
            let op = r.text()?;
            s.lat_regs.push(LatReg { rel, op, alg: Algebra::from_text(&r.text()?) });
        }
        s.tag_rules = r.arena::<Sym>()?.iter().copied().collect();
        s.eval_holes = r.arena::<FactId>()?.to_vec();
        for _ in 0..r.u32()? {
            let t = r.u32()?;
            let (budget, steps, partial) = (r.u64()? as i64, r.u64()? as i64, r.u32()? == 1);
            s.eval_log.insert(t, EvalRecord { budget, steps, partial });
        }
        let recs: Arena<FactRec> = r.arena()?;
        let n = recs.len();
        s.facts.recs = Col { mark: n, base: Rc::new(recs), own: Vec::new(), ..Col::default() };
        s.facts.bflags = Rc::new(r.arena()?);
        let tups = TupSeg { ends: r.arena()?, sks: r.arena()?, args: r.arena()?, cons: r.arena()? };
        s.facts.tups = Tuples { t0: tups.len() as TupId, base: Rc::new(tups), top: TupSeg::default() };
        if s.facts.bflags.len() != n {
            return Err("a volume's flags do not match its facts".into());
        }
        s.keys_base = Rc::new(r.arena()?);
        let mut groups = Groups::default();
        for _ in 0..r.u32()? {
            let rel = r.u32()?;
            let mut v = Vec::new();
            for _ in 0..r.u32()? {
                let p = r.u32()?;
                let (canon, arrived) = (r.arena()?, r.arena()?);
                let loose = r.arena::<FactId>()?.to_vec();
                let staged = r.arena::<FactId>()?.to_vec();
                let by_pat = read_patterns(r)?;
                v.push((p, KeyRun { canon_base: Some(canon.clone()), canon, arrived, loose, staged, by_pat, by_tup: true }));
            }
            groups.insert(rel, v);
        }
        s.idx = Runs { base: Rc::new(groups), own: Groups::default() };
        s.wit_head = layered(r.layers(|_| true)?);
        s.wits = layered(r.layers(|_| true)?);
        s.prem_arena = layered(r.layers(prem_tags_ok)?);
        s.base_map = Some(r.base_map());
        let n = r.u64()? as usize;
        let zero = r.u32()? == 1;
        let slots: Arena<u64> = r.arena()?;
        if !slots.len().is_power_of_two() && !slots.is_empty() {
            return Err("a volume's firing table is not a table".into());
        }
        s.fired = Fired { base: Rc::new(HashSlots { slots, n, zero }), own: FxSet::default() };
        let mut c = Cells::default();
        for _ in 0..r.u32()? {
            let (rule, at) = (r.u32()?, r.u32()?);
            let op = AggOp::from_name(&r.text()?).ok_or("a volume's cell has no such aggregate")?;
            let key: Box<[Term]> = r.arena::<Term>()?.to_vec().into();
            let value = match r.u32()? {
                0 => CellValue::Value(Term::from_bits(r.u64()?)),
                1 => CellValue::Empty,
                _ => CellValue::Hole(r.u32()?),
            };
            let [height, tick, desc, dead, m0, m1, s0, s1] = [(); 8].map(|_| r.u32());
            let alg = Algebra::from_text(&r.text()?);
            c.recs.push(CellRec { owner: CellOwner::Body { rule, at }, op, key, value, height: height?, tick: tick?, desc: desc?, alg, dead: dead? == 1, members: (m0?, m1?), seals: (s0?, s1?) });
        }
        for _ in 0..r.u32()? {
            let proj: Box<[Term]> = r.arena::<Term>()?.to_vec().into();
            let value = Term::from_bits(r.u64()?);
            let [height, p0, p1, o0, o1] = [(); 5].map(|_| r.u32());
            c.members.push(Member { proj, value, height: height?, prems: (p0?, p1?), others: (o0?, o1?) });
        }
        c.prems = r.arena_checked::<PremRef>(prem_tags_ok)?.to_vec();
        c.alts = r.arena::<u32>()?.chunks_exact(2).map(|x| (x[0], x[1])).collect();
        c.seals = r.arena::<u32>()?.chunks_exact(2).map(|x| Seal { rel: x[0], round: x[1] }).collect();
        for (id, rec) in c.recs.iter().enumerate() {
            c.by_key.insert((rec.owner, rec.key.clone(), rec.tick), id as CellId);
        }
        for (id, rec) in c.recs.iter().enumerate() {
            let k = (rec.owner, rec.key.clone(), rec.tick);
            if rec.dead && c.by_key.get(&k) == Some(&(id as CellId)) {
                c.by_key.remove(&k);
            }
        }
        s.cells = Rc::new(c);
        let layered = r.u32()?;
        if layered != 0 {
            let (offs, ids): (Arena<u32>, Arena<FactId>) = (r.arena()?, r.arena()?);
            let n = s.facts.len();
            let more: Arena<u32> = if layered == 2 { r.arena()? } else { Arena::default() };
            let whole = layered == 1 && offs.len() == n + 1;
            let below = layered == 2 && offs.len() <= n + 1 && !offs.is_empty();
            if !(whole || below) || offs.windows(2).any(|w| w[0] > w[1]) || offs[offs.len() - 1] as usize != ids.len() || ids.iter().chain(more.iter()).any(|&i| i as usize >= n) || more.len() % 2 != 0 {
                return Err("a volume's citer index is not an index".into());
            }
            let mut m: HashMap<FactId, Vec<FactId>> = HashMap::new();
            for x in more.chunks_exact(2) {
                m.entry(x[0]).or_default().push(x[1]);
            }
            s.citers = Some(Rc::new(Citers { offs, ids, more: m }));
        }
        if r.u32()? == 1 {
            let l = r.layers::<u32>(|_| true)?;
            if l.base.len() % 4 != 0 || l.tail.len() % 4 != 0 || l.base.chunks_exact(4).chain(l.tail.chunks_exact(4)).any(|x| x[2] as usize >= s.facts.len()) {
                return Err("a volume's index of the rows of a tree is not an index".into());
            }
            let mut m: FxMap<u64, Vec<(FactId, Sym)>> = FxMap::default();
            for x in l.base.chunks_exact(4).chain(l.tail.chunks_exact(4)) {
                m.entry(x[0] as u64 | (x[1] as u64) << 32).or_default().push((x[2], x[3]));
            }
            s.vciters = Some(Rc::new(m));
            s.vciters_base = Some(l.base);
        }
        let l = r.layers::<u32>(|_| true)?;
        if l.base.len() % 7 != 0 || l.tail.len() % 7 != 0 {
            return Err("a volume's rows of a tree are not rows".into());
        }
        let both = |lo: u32, hi: u32| Term::from_bits(lo as u64 | (hi as u64) << 32);
        s.vrow_of = l.base.chunks_exact(7).chain(l.tail.chunks_exact(7)).map(|x| (x[0], (x[1] as usize, x[2], both(x[3], x[4]), both(x[5], x[6])))).collect();
        s.vrow_base = Some(l.base);
        Ok(s)
    }
}

#[cfg(test)]
mod tests {
    use crate::session::Session;

    /// A world opened from a volume and added to is kept as the bytes it keeps frozen: the layer written over the
    /// mapped base is the base `freeze` makes, its tables put in where they have room (a few facts more) and made
    /// again where they grow (thousands).
    #[test]
    fn a_layer_is_kept_as_its_frozen_self() {
        for more in [0, 3000] {
            layer_kept_as_frozen(more);
        }
    }

    fn layer_kept_as_frozen(more: usize) {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let read = |p: &str| std::fs::read_to_string(root.join(p)).unwrap();
        let dir = std::env::temp_dir().join(format!("rofl-layer-{}-{more}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let at = |n: &str| dir.join(n).to_str().unwrap().to_string();
        let mut s = Session::fresh(200_000_000);
        s.load(&read("boot.rofl"), None).unwrap();
        s.load(&read("rules/stage-plan.rofl"), None).unwrap();
        s.evaluate().unwrap();
        s.keep_volume(&at("a.vol")).unwrap();
        let mut o = Session::open_volume(&at("a.vol"), 200_000_000).unwrap();
        let many: String = (0..more).map(|i| format!("plan_file(\"m{i}.ts\", {i}).\n")).collect();
        o.load_delta(&(read("facts/stage-plan.rofl") + &many), None).unwrap();
        let (st, h) = (&o.eval.store, &o.eval.h);
        let layered = [!st.facts.recs.own.is_empty(), st.facts.tups.top.len() > 0, !st.keys.is_empty(), !st.wits.own.is_empty(), !st.fired.own.is_empty(), h.layered().0, h.layered().1];
        assert_eq!(layered, [true; 7], "facts, tuples, keys, witnesses, firings, names, functors");
        o.keep_volume(&at("b.vol")).unwrap();
        o.eval.store.freeze_as_is();
        o.eval.h.freeze();
        o.keep_volume(&at("c.vol")).unwrap();
        let (b, c) = (std::fs::read(at("b.vol")).unwrap(), std::fs::read(at("c.vol")).unwrap());
        std::fs::remove_dir_all(&dir).unwrap();
        let first = b.iter().zip(&c).position(|(x, y)| x != y);
        assert!(b == c, "{more} more: {} and {} bytes, first differing at {first:?}", b.len(), c.len());
    }
}

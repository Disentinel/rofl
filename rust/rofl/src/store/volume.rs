//! The store as a volume holds it (`crate::volume`): every column and table written as the one base it would be
//! frozen into, so the store read back maps them and copies none; the small per-world fields and the cells between
//! them, by id. A layer over a mapped base is written as the base streamed from its file and the layer after it, a
//! table as the base with the layer's slots put in it: keeping copies no mapped column into the heap.
use super::*;
use crate::arena::{placed, VolR, VolW};
use std::borrow::Cow;

/// A run's argument indexes, so a world opened from a volume probes them where they lie instead of building them again.
fn write_patterns(w: &mut VolW, facts: &Facts, by_pat: Option<&ArgIndex>) {
    let Some(by_pat) = by_pat else {
        return w.u32(u32::MAX);
    };
    let mut masks: Vec<&u32> = by_pat.keys().collect();
    masks.sort_unstable();
    w.u32(masks.len() as u32);
    for m in masks {
        let ix = &by_pat[m];
        // over a base, an index the base holds stays there and the entries since are a top over it
        let parts = match ix.bottom() {
            b if ix.under.is_some() && w.in_base(&b.ids) => vec![Cow::Borrowed(b), Cow::Owned(ix.above_bottom(facts))],
            _ => vec![Cow::Owned(ix.flat(facts))],
        };
        w.u32(*m);
        w.arena(&ix.pos.iter().map(|&p| p as u32).collect::<Vec<u32>>());
        w.u32(parts.len() as u32);
        for x in parts {
            w.u64(x.values as u64);
            w.arena(&x.slots);
            w.arena(&x.ids);
            w.arena(&x.prev);
        }
    }
}

fn read_patterns(r: &mut VolR) -> Result<Option<Rc<ArgIndex>>, String> {
    let n = r.u32()?;
    if n == u32::MAX {
        return Ok(None);
    }
    let mut by_pat = ArgIndex::default();
    for _ in 0..n {
        let mask = r.u32()?;
        let pos: Box<[usize]> = r.arena::<u32>()?.iter().map(|&p| p as usize).collect();
        let parts = r.u32()?;
        let mut ix = None;
        for _ in 0..parts {
            let values = r.u64()? as usize;
            let (slots, ids, prev): (Arena<u32>, Arena<FactId>, Arena<u32>) = (r.arena()?, r.arena()?, r.arena()?);
            // its entries are not walked: the sum the volume ends in held, so one out of range is the writer's defect
            if !slots.len().is_power_of_two() || ids.len() != prev.len() {
                return Err("a volume's argument index is not an index".into());
            }
            ix = Some(PatIndex { pos: pos.clone(), slots, ids, prev, values, under: ix.map(Rc::new) });
        }
        by_pat.insert(mask, ix.ok_or("a volume's argument index is not an index")?);
    }
    Ok(Some(Rc::new(by_pat)))
}

fn col<T: Pod>(w: &mut VolW, c: &Col<T>) {
    w.arena_placed(&c.base, &c.lows(), &c.own);
}

impl Tuples {
    /// As `freeze` would leave the base: the top's tuples after the base's, put in its table, or in the table it
    /// grows to with all of them.
    fn write(&self, w: &mut VolW) {
        let (b, t) = (&*self.base, &self.top);
        // over a base that holds the base's tuples, the top goes beside them whole: an edit never grows the base's table
        if w.is_over() && b.len() > 0 && t.len() > 0 && w.in_base(&b.cons) {
            w.u32(2);
            for g in [b, t] {
                g.write(w);
            }
            return;
        }
        w.u32(1);
        if b.len() == 0 || t.len() == 0 {
            let a = if b.len() == 0 { t } else { b };
            w.arena(&a.ends);
            w.arena(&a.sks);
            w.arena(&a.args);
            return w.arena(&a.cons);
        }
        let at = b.args.len() as u32;
        w.arena_parts(&b.ends, &[&t.ends.iter().map(|e| e + at).collect::<Vec<u32>>()]);
        w.arena_parts(&b.sks, &[&t.sks]);
        w.arena_parts(&b.args, &[&t.args]);
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

impl TupSeg {
    fn write(&self, w: &mut VolW) {
        w.arena(&self.ends);
        w.arena(&self.sks);
        w.arena(&self.args);
        w.arena(&self.cons);
    }
    fn read(r: &mut VolR) -> Result<TupSeg, String> {
        Ok(TupSeg { ends: r.arena()?, sks: r.arena()?, args: r.arena()?, cons: r.arena()? })
    }
}

/// Words a cell's record holds: its owner (2), operation, key (2), value (3), height, tick, description, whether
/// it is dead, members (2), seals (2), algebra.
const CELL_WORDS: usize = 17;
/// Words a member's record holds: its projection (2), value (2), height, premises (2), other derivations (2).
const MEMBER_WORDS: usize = 9;

impl Cells {
    /// As arenas of words, terms and premises, the names of operations and algebras before them: what a volume over
    /// another writes as what changed in them.
    fn write(&self, w: &mut VolW) {
        let mut names: Vec<String> = Vec::new();
        let mut ix = |n: String| names.iter().position(|x| *x == n).unwrap_or_else(|| { names.push(n); names.len() - 1 }) as u32;
        let (mut recs, mut keys) = (Vec::with_capacity(self.recs.len() * CELL_WORDS), Vec::new());
        for r in &self.recs {
            let CellOwner::Body { rule, at } = r.owner;
            let (kind, bits) = match r.value {
                CellValue::Value(t) => (0, t.bits()),
                CellValue::Empty => (1, 0),
                CellValue::Hole(x) => (2, x as u64),
            };
            let (op, alg) = (ix(r.op.name().to_string()), ix(r.alg.text()));
            recs.extend([rule, at, op, keys.len() as u32, r.key.len() as u32, kind, bits as u32, (bits >> 32) as u32, r.height, r.tick, r.desc, r.dead as u32, r.members.0, r.members.1, r.seals.0, r.seals.1, alg]);
            keys.extend_from_slice(&r.key);
        }
        let (mut mems, mut projs) = (Vec::with_capacity(self.members.len() * MEMBER_WORDS), Vec::new());
        for m in &self.members {
            let bits = m.value.bits();
            mems.extend([projs.len() as u32, m.proj.len() as u32, bits as u32, (bits >> 32) as u32, m.height, m.prems.0, m.prems.1, m.others.0, m.others.1]);
            projs.extend_from_slice(&m.proj);
        }
        w.u32(names.len() as u32);
        for n in &names {
            w.text(n);
        }
        let was = |k: usize| self.was[k].clone();
        w.arena(&Arena::derived(recs, was(0)));
        w.arena(&Arena::derived(keys, was(1)));
        w.arena(&Arena::derived(mems, was(2)));
        w.arena(&Arena::derived(projs, was(3)));
        w.arena(&Arena::derived(self.prems.clone(), was(4)));
        w.arena(&Arena::derived(self.alts.iter().flat_map(|&(a, b)| [a, b]).collect(), was(5)));
        w.arena(&Arena::derived(self.seals.iter().flat_map(|s| [s.rel, s.round]).collect(), was(6)));
    }

    fn read(r: &mut VolR) -> Result<Cells, String> {
        let bad = || "a volume's cells are not cells".to_string();
        let names: Vec<String> = (0..r.u32()?).map(|_| r.text()).collect::<Result<_, _>>()?;
        let (recs, keys, mems, projs) = (r.arena::<u32>()?, r.arena::<Term>()?, r.arena::<u32>()?, r.arena::<Term>()?);
        let prems = r.arena_checked::<PremRef>(prem_tags_ok)?;
        let (alts, seals) = (r.arena::<u32>()?, r.arena::<u32>()?);
        if recs.len() % CELL_WORDS != 0 || mems.len() % MEMBER_WORDS != 0 || alts.len() % 2 != 0 || seals.len() % 2 != 0 {
            return Err(bad());
        }
        let name = |i: u32| names.get(i as usize).ok_or_else(bad);
        let span = |ts: &Arena<Term>, at: u32, n: u32| ts.get(at as usize..at as usize + n as usize).map(|x| x.to_vec().into_boxed_slice()).ok_or_else(bad);
        let mut c = Cells { was: [recs.origin(), keys.origin(), mems.origin(), projs.origin(), prems.origin(), alts.origin(), seals.origin()], ..Cells::default() };
        for x in recs.chunks_exact(CELL_WORDS) {
            let bits = x[6] as u64 | (x[7] as u64) << 32;
            let value = match x[5] {
                0 => CellValue::Value(Term::from_bits(bits)),
                1 => CellValue::Empty,
                _ => CellValue::Hole(bits as u32),
            };
            let op = AggOp::from_name(name(x[2])?).ok_or("a volume's cell has no such aggregate")?;
            c.recs.push(CellRec { owner: CellOwner::Body { rule: x[0], at: x[1] }, op, key: span(&keys, x[3], x[4])?, value, height: x[8], tick: x[9], desc: x[10], dead: x[11] == 1, members: (x[12], x[13]), seals: (x[14], x[15]), alg: Algebra::from_text(name(x[16])?) });
        }
        for x in mems.chunks_exact(MEMBER_WORDS) {
            c.members.push(Member { proj: span(&projs, x[0], x[1])?, value: Term::from_bits(x[2] as u64 | (x[3] as u64) << 32), height: x[4], prems: (x[5], x[6]), others: (x[7], x[8]) });
        }
        c.prems = prems.to_vec();
        c.alts = alts.chunks_exact(2).map(|x| (x[0], x[1])).collect();
        c.seals = seals.chunks_exact(2).map(|x| Seal { rel: x[0], round: x[1] }).collect();
        for (id, rec) in c.recs.iter().enumerate() {
            c.by_key.insert((rec.owner, rec.key.clone(), rec.tick), id as CellId);
        }
        for (id, rec) in c.recs.iter().enumerate() {
            let k = (rec.owner, rec.key.clone(), rec.tick);
            if rec.dead && c.by_key.get(&k) == Some(&(id as CellId)) {
                c.by_key.remove(&k);
            }
        }
        Ok(c)
    }
}

impl Fired {
    fn write(&self, w: &mut VolW) {
        let (b, own) = (&*self.base, &self.own);
        // over a base that holds the base's firings, the firings since go beside them: an edit never grows its table
        if w.is_over() && w.in_base(&b.slots) {
            w.u64(b.n as u64);
            w.u32(b.zero as u32);
            w.arena(&b.slots);
            let mut since: Vec<u64> = own.iter().copied().collect();
            since.sort_unstable();
            return w.arena(&Arena::derived(since, self.own_was.clone()));
        }
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
        w.arena::<u64>(&[]);
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
        w.arena_parts(&f.bflags, &[&f.recs.own.iter().map(|r| r.flags()).collect::<Vec<u8>>()]);
        f.tups.write(w);
        self.write_keys(w);
        let mut rels: Vec<(&Sym, &Vec<(Sym, KeyRun)>)> = self.idx.iter().collect();
        rels.sort_unstable_by_key(|(r, _)| **r);
        w.u32(rels.len() as u32);
        for (rel, v) in rels {
            w.u32(*rel);
            w.u32(v.len() as u32);
            for (p, k) in v {
                w.u32(*p);
                w.u32(k.by_tup as u32);
                w.arena(&k.canon);
                w.arena(&k.arrived);
                w.arena(&k.loose);
                w.arena(&k.staged);
                write_patterns(w, &self.facts, k.by_pat.as_deref());
            }
        }
        col(w, &self.wit_head);
        col(w, &self.wits);
        col(w, &self.prem_arena);
        self.fired.write(w);
        self.cells.write(w);
        match &self.citers {
            None => w.u32(0),
            // over a base the column stays as the base holds it, and the citers since come after it
            Some(ix) if w.is_over() => {
                w.u32(2);
                w.arena(&ix.offs);
                w.arena(&ix.ids);
                let mut more: Vec<(&FactId, &Vec<FactId>)> = ix.more.iter().collect();
                more.sort_unstable_by_key(|m| *m.0);
                w.arena(&Arena::derived(more.iter().flat_map(|(g, v)| v.iter().flat_map(move |id| [**g, *id])).collect::<Vec<u32>>(), ix.more_was.clone()));
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
            // over a base the rows stay as the base holds them, and those put since come after them
            Some(m) if w.is_over() => {
                w.u32(1);
                w.arena(&m.rows);
                w.arena(&Arena::derived(m.more_rows(), m.more_was.clone()));
            }
            Some(m) => {
                w.u32(1);
                let mut rows: Vec<[u32; 4]> = m.rows.chunks_exact(4).map(|x| [x[0], x[1], x[2], x[3]]).collect();
                rows.extend(m.more_rows().chunks_exact(4).map(|x| [x[0], x[1], x[2], x[3]]));
                rows.sort_unstable();
                w.arena(&rows.concat());
                w.arena::<u32>(&[]);
            }
        }
        match self.vrow_of.grown() {
            None => w.arena(&self.vrow_of.kept),
            Some(rows) => w.arena(&Arena::derived(rows, self.vrow_of.kept.origin())),
        }
    }

    /// The key table: the layer's facts put in the base's table while it has room for them as `key_insert` leaves
    /// room, else a table of them all made.
    fn write_keys(&self, w: &mut VolW) {
        let (n, mark) = (self.facts.len(), self.facts.recs.mark);
        if mark == 0 {
            w.arena(&self.keys);
        } else if self.keys.is_empty() {
            w.arena(&self.keys_base);
        } else if (n + 1) * 4 < self.keys_base.len() * 3 {
            let put = placed(&self.keys_base, EMPTY, (mark as FactId..n as FactId).map(|id| {
                let r = self.facts.recs[id as usize];
                (hash_key(r.rel, r.persp, self.args(id)), id)
            }));
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
        let two = r.u32()? == 2;
        let tups = TupSeg::read(r)?;
        let top = if two { TupSeg::read(r)? } else { TupSeg::default() };
        s.facts.tups = Tuples { t0: tups.len() as TupId, base: Rc::new(tups), top };
        if s.facts.bflags.len() != n {
            return Err("a volume's flags do not match its facts".into());
        }
        s.keys_base = Rc::new(r.arena()?);
        let mut groups = Groups::default();
        for _ in 0..r.u32()? {
            let rel = r.u32()?;
            let mut v = Vec::new();
            for _ in 0..r.u32()? {
                let (p, by_tup) = (r.u32()?, r.u32()? == 1);
                let (canon, arrived) = (r.arena()?, r.arena()?);
                let loose = r.arena::<FactId>()?.to_vec();
                let staged = r.arena::<FactId>()?.to_vec();
                let by_pat = read_patterns(r)?;
                v.push((p, KeyRun { canon, arrived, loose, staged, by_pat, by_tup }));
            }
            groups.insert(rel, v);
        }
        s.idx = Runs { base: Rc::new(groups), own: Groups::default() };
        let heads: Arena<u32> = r.arena()?;
        s.wit_head = Col { mark: heads.len(), base: Rc::new(heads), own: Vec::new(), ..Col::default() };
        let wits: Arena<WitNode> = r.arena()?;
        s.wits = Col { mark: wits.len(), base: Rc::new(wits), own: Vec::new(), ..Col::default() };
        let prems: Arena<PremRef> = r.arena_checked(prem_tags_ok)?;
        s.prem_arena = Col { mark: prems.len(), base: Rc::new(prems), own: Vec::new(), ..Col::default() };
        let n = r.u64()? as usize;
        let zero = r.u32()? == 1;
        let slots: Arena<u64> = r.arena()?;
        if !slots.len().is_power_of_two() && !slots.is_empty() {
            return Err("a volume's firing table is not a table".into());
        }
        let own = r.arena::<u64>()?;
        s.fired = Fired { base: Rc::new(HashSlots { slots, n, zero }), own: own.iter().copied().collect(), own_was: own.origin() };
        let c = Cells::read(r)?;
        s.cells = Rc::new(c);
        let layered = r.u32()?;
        if layered != 0 {
            let (offs, ids): (Arena<u32>, Arena<FactId>) = (r.arena()?, r.arena()?);
            let n = s.facts.len();
            let (mut more, mut more_was): (HashMap<FactId, Vec<FactId>>, _) = (HashMap::new(), None);
            if layered == 2 {
                let pairs = r.arena::<u32>()?;
                for p in pairs.chunks_exact(2) {
                    more.entry(p[0]).or_default().push(p[1]);
                }
                more_was = pairs.origin();
            }
            let to = offs.len().saturating_sub(1);
            if offs.is_empty() || to > n || offs[to] as usize != ids.len() || (layered == 1 && to != n) {
                return Err("a volume's citer index is not an index".into());
            }
            s.citers = Some(Rc::new(Citers { offs, ids, more, more_was }));
        }
        if r.u32()? == 1 {
            // the rows are not walked: the sum the volume ends in held, as an argument index's (`read_patterns`)
            let (rows, more): (Arena<u32>, Arena<u32>) = (r.arena()?, r.arena()?);
            if rows.len() % 4 != 0 || more.len() % 4 != 0 || more.chunks_exact(4).any(|x| x[2] as usize >= s.facts.len()) {
                return Err("a volume's index of the rows of a tree is not an index".into());
            }
            let mut m = crate::store::VCiters { rows, more_was: more.origin(), ..Default::default() };
            for x in more.chunks_exact(4) {
                m.put(x[0] as u64 | (x[1] as u64) << 32, x[2], x[3]);
            }
            s.vciters = Some(Rc::new(m));
        }
        let vrows: Arena<u64> = r.arena()?;
        if !vrows.len().is_multiple_of(5) {
            return Err("a volume's rows of a tree are not rows".into());
        }
        s.vrow_of.kept = vrows;
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

//! The store as a volume holds it (`crate::volume`): every column and table frozen into one base and written as
//! the arenas it is, so the store read back maps them and copies none; the small per-world fields and the cells
//! between them, by id.
use super::*;
use crate::arena::{VolR, VolW};

fn terms(w: &mut VolW, ts: &[Term]) {
    w.arena(ts);
}

fn prem_tags_ok(words: &[u32]) -> bool {
    words.iter().step_by(2).all(|&t| t <= 4)
}

impl Store {
    pub fn write_volume(&mut self, w: &mut VolW) {
        self.sweep();
        self.freeze_as_is();
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
        w.arena(&f.recs.base);
        w.arena(&f.bflags);
        let t = &f.tups.base;
        w.arena(&t.ends);
        w.arena(&t.sks);
        w.arena(&t.args);
        w.arena(&t.cons);
        w.arena(&self.keys_base);
        let mut rels: Vec<(&Sym, &Vec<(Sym, KeyRun)>)> = self.idx.iter().collect();
        rels.sort_unstable_by_key(|(r, _)| **r);
        w.u32(rels.len() as u32);
        for (rel, v) in rels {
            w.u32(*rel);
            w.u32(v.len() as u32);
            for (p, k) in v {
                w.u32(*p);
                w.arena(&k.canon);
                w.arena(&k.arrived);
                w.arena(&k.loose);
                w.arena(&k.staged);
            }
        }
        w.arena(&self.wit_head.base);
        w.arena(&self.wits.base);
        w.arena(&self.prem_arena.base);
        let fired = &self.fired.base;
        w.u64(fired.n as u64);
        w.u32(fired.zero as u32);
        w.arena(&fired.slots);
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
        s.facts.recs = Col { mark: n, base: Rc::new(recs), own: Vec::new() };
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
                v.push((p, KeyRun { canon, arrived, loose, staged, by_pat: None, by_tup: true }));
            }
            groups.insert(rel, v);
        }
        s.idx = Runs { base: Rc::new(groups), own: Groups::default() };
        let col = |a: Arena<u32>| Col { mark: a.len(), base: Rc::new(a), own: Vec::new() };
        s.wit_head = col(r.arena()?);
        let wits: Arena<WitNode> = r.arena()?;
        s.wits = Col { mark: wits.len(), base: Rc::new(wits), own: Vec::new() };
        let prems: Arena<PremRef> = r.arena_checked(prem_tags_ok)?;
        s.prem_arena = Col { mark: prems.len(), base: Rc::new(prems), own: Vec::new() };
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
        Ok(s)
    }
}

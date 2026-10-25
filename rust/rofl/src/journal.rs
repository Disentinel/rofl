//! THE JOURNAL OF INPUTS (docs/intents.md, D5 and phase 0). What a world was told and when: every base fact
//! that came in, by the door (`load`, which writes `asserted_by`) or by `assert`, every one taken out, and every
//! tick boundary with its wall-clock time (`tick_at`). Derived facts are not in it: determinism makes them a
//! function of what is, so the state at a past tick is rebuilt by telling a fresh world the same things in the
//! same ticks (`Session::replay`).
//!
//! A fact is named by its id, which keeps its content when it dies and gets it back when it comes again
//! (`Store::put`), so an entry costs one word. A load that brings rules or declarations is kept whole as text:
//! its facts are in the text and get no entries of their own. A tick-scoped fact goes at the boundary after
//! the tick it came in, unless it is taken out before; a timeless one stays until it is taken out.
//!
//! Words: the top two bits are the kind, the rest the fact; `ESC` entries carry their kind in the low bits and
//! their values in the words after.

use std::sync::Arc as Rc;

use crate::arena::{Arena, VolR, VolW};
use crate::store::FactId;
use crate::term::Sym;

const KIND: u32 = 3 << 30;
const LOADED: u32 = 0;
const PUT: u32 = 1 << 30;
const GONE: u32 = 2 << 30;
const ESC: u32 = 3 << 30;
const E_TICK: u32 = 0;
const E_WHO: u32 = 1;
const E_TEXT: u32 = 2;
const E_WIDE: u32 = 3;
const E_SEED: u32 = 4;
const E_CALL: u32 = 5;
const EVALUATED: u32 = 1 << 8;
const NOBODY: u32 = u32::MAX;
const UNSAID: u32 = u32::MAX - 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Entry {
    /// a base fact through the door, by the author last named
    Loaded(FactId),
    /// a base fact by `assert`
    Put(FactId),
    /// a base fact taken out
    Gone(FactId),
    /// the world entered this tick
    Tick(u32),
    /// the author of what is loaded after, `None` where the load named none
    Who(Option<Sym>),
    /// a load with rules or declarations, whole: where its text lies in `text`
    Text(usize, usize),
    /// the world was opened from a seed or an image, which the journal does not hold
    Seeded,
    /// a call that told the world something, and whether the world was evaluated when it came: what a delta
    /// does depends on it. The entries up to the next call or tick are what it told.
    Call(Verb, bool),
}

/// The calls that tell a world something (`Session`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verb {
    Load,
    LoadDelta,
    Assert,
    AssertDelta,
    Retract,
    RetractDelta,
    RetractSet,
    OneByOne,
}

const VERBS: [Verb; 8] = [Verb::Load, Verb::LoadDelta, Verb::Assert, Verb::AssertDelta, Verb::Retract, Verb::RetractDelta, Verb::RetractSet, Verb::OneByOne];

#[derive(Clone, Copy)]
pub struct Mark {
    at: usize,
    who: u32,
}

#[derive(Clone)]
pub struct Journal {
    kept: Arena<u32>,
    own: Rc<Vec<u32>>,
    kept_text: Arena<u8>,
    own_text: Rc<Vec<u8>>,
    kept_at: Arena<u64>,
    own_at: Rc<Vec<u64>>,
    who: u32,
    late: Vec<FactId>,
    depth: u32,
}

impl Default for Journal {
    fn default() -> Journal {
        Journal { kept: Arena::default(), own: Rc::default(), kept_text: Arena::default(), own_text: Rc::default(), kept_at: Arena::default(), own_at: Rc::default(), who: UNSAID, late: Vec::new(), depth: 0 }
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

impl Journal {
    fn push(&mut self, words: &[u32]) {
        if self.kept_at.is_empty() && self.own_at.is_empty() {
            Rc::make_mut(&mut self.own_at).push(now_ms());
        }
        Rc::make_mut(&mut self.own).extend_from_slice(words);
    }

    fn fact(&mut self, kind: u32, id: FactId) {
        if id & KIND == 0 {
            self.push(&[kind | id]);
        } else {
            self.push(&[ESC | E_WIDE | (kind >> 28), id]);
        }
    }

    pub fn loaded(&mut self, id: FactId, who: Option<Sym>) {
        let w = who.unwrap_or(NOBODY);
        if w != self.who {
            self.who = w;
            self.push(&[ESC | E_WHO, w]);
        }
        self.fact(LOADED, id);
    }

    pub fn put(&mut self, id: FactId) {
        self.fact(PUT, id);
    }

    pub fn gone(&mut self, id: FactId) {
        if crate::brk!("journal_closed_late" => true; false) {
            return self.late.push(id);
        }
        self.fact(GONE, id);
    }

    /// The world entered `tick`, now.
    pub fn tick(&mut self, tick: u32) {
        self.push(&[ESC | E_TICK, tick]);
        Rc::make_mut(&mut self.own_at).push(now_ms());
        for id in std::mem::take(&mut self.late) {
            self.fact(GONE, id);
        }
    }

    /// A load with rules or declarations, whole, in place of the entries written since `mark`.
    pub fn text(&mut self, mark: Mark, text: &str, who: Option<Sym>) {
        Rc::make_mut(&mut self.own).truncate(mark.at - self.kept.len());
        self.who = mark.who;
        let w = who.unwrap_or(NOBODY);
        if w != self.who {
            self.who = w;
            self.push(&[ESC | E_WHO, w]);
        }
        let off = self.kept_text.len() + self.own_text.len();
        Rc::make_mut(&mut self.own_text).extend_from_slice(text.as_bytes());
        self.push(&[ESC | E_TEXT, off as u32, text.len() as u32]);
    }

    /// A call begins; one inside another is the outer one's.
    pub fn begin(&mut self, verb: Verb, evaluated: bool) {
        if self.depth == 0 {
            let v = VERBS.iter().position(|&x| x == verb).unwrap() as u32;
            self.push(&[ESC | E_CALL, v | if evaluated { EVALUATED } else { 0 }]);
        }
        self.depth += 1;
    }

    pub fn end(&mut self) {
        self.depth -= 1;
    }

    /// The world holds facts the journal was not told: it rebuilds no past.
    pub fn seeded(&mut self) {
        self.push(&[ESC | E_SEED, 0]);
    }

    /// Where the next entry goes, for `text`.
    pub fn mark(&self) -> Mark {
        Mark { at: self.kept.len() + self.own.len(), who: self.who }
    }

    pub fn entries(&self) -> Vec<Entry> {
        let words: Vec<u32> = self.kept.iter().chain(self.own.iter()).copied().collect();
        let mut out = Vec::new();
        let mut i = 0;
        while i < words.len() {
            let w = words[i];
            i += 1;
            let e = match w & KIND {
                LOADED => Entry::Loaded(w),
                PUT => Entry::Put(w & !KIND),
                GONE => Entry::Gone(w & !KIND),
                _ => {
                    let x = words[i];
                    i += 1;
                    match w & !KIND {
                        E_TICK => Entry::Tick(x),
                        E_WHO => Entry::Who((x != NOBODY).then_some(x)),
                        E_SEED => Entry::Seeded,
                        E_CALL => Entry::Call(VERBS[(x & 0xff) as usize], x & EVALUATED != 0),
                        E_TEXT => {
                            i += 1;
                            Entry::Text(x as usize, words[i - 1] as usize)
                        }
                        k => match (k & !E_WIDE) << 28 {
                            LOADED => Entry::Loaded(x),
                            PUT => Entry::Put(x),
                            _ => Entry::Gone(x),
                        },
                    }
                }
            };
            out.push(e);
        }
        out
    }

    /// The text of a `Text` entry.
    pub fn text_of(&self, off: usize, len: usize) -> String {
        let k = self.kept_text.len();
        let b = if off >= k { &self.own_text[off - k..off - k + len] } else { &self.kept_text[off..off + len] };
        String::from_utf8_lossy(b).into_owned()
    }

    /// `tick_at(T, Time)`: when the world entered tick `t`, in milliseconds since the epoch.
    pub fn tick_at(&self, t: u32) -> Option<u64> {
        let k = self.kept_at.len();
        let t = t as usize;
        if t < k { Some(self.kept_at[t]) } else { self.own_at.get(t - k).copied() }
    }

    /// What the journal holds, in bytes.
    pub fn bytes(&self) -> usize {
        4 * (self.kept.len() + self.own.len()) + self.kept_text.len() + self.own_text.len() + 8 * (self.kept_at.len() + self.own_at.len())
    }

    pub fn write(&self, w: &mut VolW) {
        w.arena_parts(&self.kept, &[self.own.as_slice()]);
        w.arena_parts(&self.kept_text, &[self.own_text.as_slice()]);
        w.arena_parts(&self.kept_at, &[self.own_at.as_slice()]);
        w.u32(self.who);
    }

    pub fn read(r: &mut VolR) -> Result<Journal, String> {
        Ok(Journal { kept: r.arena()?, own: Rc::default(), kept_text: r.arena()?, own_text: Rc::default(), kept_at: r.arena()?, own_at: Rc::default(), who: r.u32()?, late: Vec::new(), depth: 0 })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_entry_reads_back_as_written() {
        let mut j = Journal::default();
        j.loaded(7, Some(3));
        j.loaded(8, Some(3));
        j.put(1 << 31);
        j.tick(1);
        let m = j.mark();
        j.loaded(9, Some(5));
        j.text(m, "p(X) :- q(X).", None);
        j.gone(7);
        j.gone(u32::MAX);
        assert_eq!(
            j.entries(),
            vec![
                Entry::Who(Some(3)),
                Entry::Loaded(7),
                Entry::Loaded(8),
                Entry::Put(1 << 31),
                Entry::Tick(1),
                Entry::Who(None),
                Entry::Text(0, 13),
                Entry::Gone(7),
                Entry::Gone(u32::MAX),
            ]
        );
        assert_eq!(j.text_of(0, 13), "p(X) :- q(X).");
        assert!(j.tick_at(1).is_some() && j.tick_at(2).is_none());
    }
}

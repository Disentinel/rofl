//! A FOLD IS A SET OF FILES: the files a fact was derived from. A fact a file's text states lies in the fold of that
//! file; one a rule concludes lies in the fold of the files of its premises together. An edit of a file can move only
//! the facts of the folds whose set holds it (the owner, 2026-11-12; f_a_fact_can_lie_where_the_files_of_its_premises_say).
//!
//! One table for the volumes of a world, so a fold's number reads the same in each. Fold `NONE` is of no file (the
//! model's own facts), fold `ALL` of every file: a set past `MOST` files is that one, and any edit moves it.

use std::collections::HashMap;
use std::sync::Mutex;

pub const NONE: u32 = 0;
pub const ALL: u32 = 1;
const MOST: usize = 64;

#[derive(Default)]
struct Table {
    files: Vec<String>,
    by_file: HashMap<String, u32>,
    sets: Vec<Box<[u32]>>,
    ids: HashMap<Box<[u32]>, u32>,
}

pub struct Folds(Mutex<Table>);

impl Default for Folds {
    fn default() -> Self {
        let mut t = Table::default();
        // NONE and ALL: the empty set twice, the second never found by its files
        t.sets.push(Box::new([]));
        t.sets.push(Box::new([]));
        t.ids.insert(Box::new([]), NONE);
        Folds(Mutex::new(t))
    }
}

impl Table {
    fn set(&mut self, v: Vec<u32>) -> u32 {
        if v.len() > MOST {
            return ALL;
        }
        let v: Box<[u32]> = v.into();
        if let Some(k) = self.ids.get(&v) {
            return *k;
        }
        self.sets.push(v.clone());
        self.ids.insert(v, self.sets.len() as u32 - 1);
        self.sets.len() as u32 - 1
    }
}

impl Folds {
    /// The fold of the one file `name`.
    pub fn of_file(&self, name: &str) -> u32 {
        let mut t = self.0.lock().unwrap();
        let f = match t.by_file.get(name) {
            Some(f) => *f,
            None => {
                t.files.push(name.to_string());
                let f = t.files.len() as u32 - 1;
                t.by_file.insert(name.to_string(), f);
                f
            }
        };
        t.set(vec![f])
    }
    /// The fold of the files of `a` and of `b` together.
    pub fn union(&self, a: u32, b: u32) -> u32 {
        if a == b || b == NONE || a == ALL {
            return a;
        }
        if a == NONE || b == ALL {
            return b;
        }
        let mut t = self.0.lock().unwrap();
        let mut v: Vec<u32> = t.sets[a as usize].iter().chain(t.sets[b as usize].iter()).copied().collect();
        v.sort_unstable();
        v.dedup();
        t.set(v)
    }
    /// For each fold, whether its set holds one of `files`: what an edit of them can move.
    pub fn holding(&self, files: &[&str]) -> Vec<bool> {
        let t = self.0.lock().unwrap();
        let fs: Vec<u32> = files.iter().filter_map(|f| t.by_file.get(*f).copied()).collect();
        let mut out: Vec<bool> = t.sets.iter().map(|s| s.iter().any(|f| fs.contains(f))).collect();
        out[ALL as usize] = true;
        out
    }
    pub fn len(&self) -> usize {
        self.0.lock().unwrap().sets.len()
    }
    pub fn is_empty(&self) -> bool {
        false
    }
    /// The table as text: a line a file, then a line a fold, the numbers of its files.
    pub fn text(&self) -> String {
        let t = self.0.lock().unwrap();
        let mut out = format!("folds {} {}\n", t.files.len(), t.sets.len());
        for f in &t.files {
            out.push_str(f);
            out.push('\n');
        }
        for s in &t.sets {
            out.push_str(&s.iter().map(|f| f.to_string()).collect::<Vec<_>>().join(" "));
            out.push('\n');
        }
        out
    }
    pub fn read(text: &str) -> Option<Folds> {
        let mut lines = text.lines();
        let mut head = lines.next()?.split(' ');
        if head.next()? != "folds" {
            return None;
        }
        let (nf, ns): (usize, usize) = (head.next()?.parse().ok()?, head.next()?.parse().ok()?);
        let mut t = Table::default();
        for _ in 0..nf {
            let f = lines.next()?;
            t.by_file.insert(f.to_string(), t.files.len() as u32);
            t.files.push(f.to_string());
        }
        for k in 0..ns {
            let s: Box<[u32]> = lines.next()?.split(' ').filter(|x| !x.is_empty()).map(|x| x.parse().ok()).collect::<Option<Vec<u32>>>()?.into();
            if k as u32 != ALL {
                t.ids.insert(s.clone(), k as u32);
            }
            t.sets.push(s);
        }
        (ns >= 2).then(|| Folds(Mutex::new(t)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fold_is_the_files_of_its_premises_together() {
        let f = Folds::default();
        let (a, b, c) = (f.of_file("a"), f.of_file("b"), f.of_file("c"));
        let ab = f.union(a, b);
        assert_eq!(ab, f.union(b, a));
        assert_eq!(f.union(ab, NONE), ab);
        assert_eq!(f.union(ab, a), ab);
        assert_eq!(f.union(ALL, c), ALL);
        let hit = f.holding(&["a"]);
        assert!(hit[a as usize] && hit[ab as usize] && hit[ALL as usize] && !hit[b as usize] && !hit[c as usize] && !hit[NONE as usize]);
        let g = Folds::read(&f.text()).unwrap();
        assert_eq!(g.text(), f.text());
        assert_eq!(g.union(g.of_file("a"), g.of_file("b")), ab);
    }
}

//! A map that iterates in insertion order, as a JavaScript `Map` does: setting a key it has keeps its place.
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct OMap<V> { idx: HashMap<String, usize>, items: Vec<(String, V)> }

impl<V> Default for OMap<V> { fn default() -> Self { OMap { idx: HashMap::new(), items: Vec::new() } } }

impl<V> OMap<V> {
    pub fn get(&self, k: &str) -> Option<&V> { self.idx.get(k).map(|&i| &self.items[i].1) }
    pub fn get_mut(&mut self, k: &str) -> Option<&mut V> { self.idx.get(k).map(|&i| &mut self.items[i].1) }
    pub fn has(&self, k: &str) -> bool { self.idx.contains_key(k) }
    pub fn set(&mut self, k: &str, v: V) {
        match self.idx.get(k) {
            Some(&i) => self.items[i].1 = v,
            None => { self.idx.insert(k.to_string(), self.items.len()); self.items.push((k.to_string(), v)); }
        }
    }
    pub fn len(&self) -> usize { self.items.len() }
    pub fn is_empty(&self) -> bool { self.items.is_empty() }
    pub fn iter(&self) -> impl Iterator<Item = (&String, &V)> + Clone { self.items.iter().map(|(k, v)| (k, v)) }
    pub fn keys(&self) -> impl Iterator<Item = &String> + Clone { self.items.iter().map(|(k, _)| k) }
    pub fn values(&self) -> impl Iterator<Item = &V> { self.items.iter().map(|(_, v)| v) }
    pub fn clear(&mut self) { self.idx.clear(); self.items.clear(); }
}

impl OMap<()> {
    pub fn add(&mut self, k: &str) { if !self.has(k) { self.set(k, ()); } }
}

//! DECLARED DATA STRUCTURES (docs/data-structures.md); the Rust side of
//! src/structure.ts. A declaration changes no fact: it is a promise about one
//! relation's data, checked after every evaluation, and a licence this engine
//! may use. `function ast_name(N, to Name).` promises one Name for each N, in
//! each book; the planner reads it as "at most one match per bound key"
//! (`Eval::delta_stat`). The facts, `why` and `whynot` are the same with and
//! without the declaration.

use crate::reflect::Vocab;
use crate::rofl_parse::{decl_text, Clause};
use crate::store::{FxMap, Store};
use crate::term::{cmp_js, Heap, Sym, TermK};
use std::collections::{HashMap, HashSet};

/// A declared function: the relation, and the positions of its key and of the
/// values the key determines, from 0.
#[derive(Clone, Debug)]
pub struct Function {
    pub rel: Sym,
    pub key: Vec<usize>,
    pub to: Vec<usize>,
}

/// A STRUCTURE DECLARATION AT THE DOOR (`checkStructureDecl`, src/structure.ts):
/// the refusal, or nothing.
pub fn check_decl(h: &Heap, v: &Vocab, c: &Clause, declared: &HashSet<Sym>) -> Result<(), String> {
    let st = c.structure.as_ref().expect("a structure");
    let (rel, what, kind) = (c.head.rel, decl_text(h, c), h.name(st.kind));
    if v.is_reserved(rel) || h.name(rel).starts_with('$') || v.arity_of(rel).is_some() {
        return Err(format!("{what}: '{}' is a kernel relation and cannot be declared {kind}", h.name(rel)));
    }
    let mut seen: Vec<Sym> = Vec::new();
    for a in &c.head.args {
        match a.kind() {
            TermK::Var(x) if !seen.contains(&x) => seen.push(x),
            TermK::Var(x) => return Err(format!("{what}: '{}' is written twice; a declaration names each argument once", h.name(x))),
            _ => return Err(format!("{what}: a declaration's arguments are variables, each a key or marked with its role")),
        }
    }
    if kind == "function" {
        let Some(first_to) = st.roles.iter().position(|r| r.is_some()) else {
            return Err(format!("{what}: a function names the value its key determines, marked `to`: function {}(N, to V)", h.name(rel)));
        };
        if st.roles[first_to..].iter().any(|r| r.is_none()) {
            return Err(format!("{what}: the values a key determines come last, after the key: function {}(N, to V)", h.name(rel)));
        }
    }
    if brk!("function_twice_admitted" => false; declared.contains(&rel)) {
        return Err(format!("{what}: '{}' is declared a structure twice", h.name(rel)));
    }
    Ok(())
}

/// The relations the program declares a structure of.
pub fn declared(h: &Heap, v: &Vocab, store: &mut Store) -> HashSet<Sym> {
    let mut out = HashSet::new();
    for f in store.rel_persp(h, v.structure_decl, v.kernel_persp) {
        if let Some(r) = store.args(f).first().and_then(|a| a.as_atom()) {
            out.insert(r);
        }
    }
    out
}

/// The functions the program declares, by relation name.
pub fn functions(h: &Heap, v: &Vocab, store: &mut Store) -> Vec<Function> {
    let mut roles: HashMap<Sym, HashMap<usize, Sym>> = HashMap::new();
    for f in store.rel_persp(h, v.structure_role, v.kernel_persp) {
        if let [r, p, role] = store.args(f) {
            if let (Some(r), Some(p), Some(role)) = (r.as_atom(), p.as_int(), role.as_atom()) {
                roles.entry(r).or_default().insert(p as usize - 1, role);
            }
        }
    }
    let mut out = Vec::new();
    for f in store.rel_persp(h, v.structure_decl, v.kernel_persp) {
        if let [r, n, kind] = store.args(f) {
            if let (Some(r), Some(n), Some(kind)) = (r.as_atom(), n.as_int(), kind.as_atom()) {
                if h.name(kind) != "function" {
                    continue;
                }
                let m = roles.get(&r);
                let (mut key, mut vals) = (Vec::new(), Vec::new());
                for i in 0..n as usize {
                    if m.and_then(|m| m.get(&i)).is_some_and(|x| h.name(*x) == "to") { vals.push(i) } else { key.push(i) }
                }
                out.push(Function { rel: r, key, to: vals });
            }
        }
    }
    out
}

#[derive(Hash, PartialEq, Eq)]
enum Key {
    One(Sym, u64),
    Two(Sym, u64, u64),
    Many(Sym, Vec<u64>),
}

/// THE PROMISE OF EVERY DECLARED FUNCTION, checked over the facts an
/// evaluation left, one book at a time (a hypothetical book is judged like any
/// other, and refuses the whole run): two facts with one key and different
/// values refuse, naming the relation, the book, the key and both values. The
/// smallest key and the two smallest values by their canonical text, so both
/// engines name the same ones.
pub fn check_functions(h: &Heap, store: &Store, fs: &[Function]) -> Result<(), String> {
    let mut fs: Vec<&Function> = fs.iter().collect();
    fs.sort_by(|a, b| cmp_js(h.name(a.rel), h.name(b.rel)));
    for f in fs {
        let n = f.key.len() + f.to.len();
        let mut first: FxMap<Key, u32> = FxMap::default();
        let mut bad: Vec<(Sym, u32)> = Vec::new();
        store.each_row(f.rel, |persp, id| {
            let a = store.args(id);
            if a.len() != n {
                return;
            }
            let kp = brk!("function_book_ignored" => 0; persp);
            let key = match f.key.as_slice() {
                [i] => Key::One(kp, a[*i].bits()),
                [i, j] => Key::Two(kp, a[*i].bits(), a[*j].bits()),
                ks => Key::Many(kp, ks.iter().map(|i| a[*i].bits()).collect()),
            };
            match first.get(&key) {
                None => {
                    first.insert(key, id);
                }
                Some(&o) => {
                    let b = store.args(o);
                    if brk!("function_value_unread" => false; f.to.iter().any(|i| a[*i] != b[*i])) {
                        bad.push((persp, id));
                    }
                }
            }
        });
        if brk!("function_check_off" => true; bad.is_empty()) {
            continue;
        }
        // the first book, by name, with a break; in it the smallest key
        let book = bad.iter().map(|(p, _)| *p).min_by(|a, b| cmp_js(h.name(*a), h.name(*b))).unwrap();
        let text = |id: u32, ps: &[usize]| ps.iter().map(|i| h.canon(store.args(id)[*i])).collect::<Vec<_>>().join(", ");
        let mut keys: Vec<(String, u32)> = bad.iter().filter(|(p, _)| *p == book).map(|(_, id)| (text(*id, &f.key), *id)).collect();
        keys.sort_by(|a, b| cmp_js(&a.0, &b.0));
        keys.dedup_by(|a, b| a.0 == b.0);
        let (k, id) = (&keys[0].0, keys[0].1);
        let mut vals: Vec<String> = Vec::new();
        store.each_row(f.rel, |persp, o| {
            let a = store.args(o);
            if persp == book && a.len() == n && f.key.iter().all(|i| a[*i] == store.args(id)[*i]) {
                vals.push(text(o, &f.to));
            }
        });
        vals.sort_by(|a, b| cmp_js(a, b));
        vals.dedup();
        let more = match keys.len() { 1 => String::new(), 2 => "; 1 more key breaks it too".to_string(), m => format!("; {} more keys break it too", m - 1) };
        return Err(format!("program rejected: function {}: key ({k}) has two values in the book {}: ({}) and ({}){more}", h.name(f.rel), h.name(book), vals[0], vals[1]));
    }
    Ok(())
}

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
use crate::term::{cmp_js, Heap, Sym, Term, TermK};
use std::collections::{HashMap, HashSet};

/// A declared function: the relation, and the positions of its key and of the
/// values the key determines, from 0.
#[derive(Clone, Debug)]
pub struct Function {
    pub rel: Sym,
    pub key: Vec<usize>,
    pub to: Vec<usize>,
}

/// A declared tree: its edge relation, and the closure it stands for, if any.
#[derive(Clone, Debug)]
pub struct Tree {
    pub rel: Sym,
    pub closure: Option<Sym>,
}

/// A STRUCTURE DECLARATION AT THE DOOR (`checkStructureDecl`, src/structure.ts):
/// the refusal, or nothing. `concluded` says what already concludes a relation
/// (a rule, or its facts).
pub fn check_decl(h: &Heap, v: &Vocab, c: &Clause, declared: &HashSet<Sym>, concluded: &dyn Fn(Sym) -> Option<String>) -> Result<(), String> {
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
    if kind == "tree" && c.head.args.len() != 2 && !brk!("tree_arity_unchecked" => true; false) {
        return Err(format!("{what}: a tree has two arguments, the parent and the child: tree {}(P, C)", h.name(rel)));
    }
    if brk!("function_twice_admitted" => false; declared.contains(&rel)) {
        return Err(format!("{what}: '{}' is declared a structure twice", h.name(rel)));
    }
    if let Some(cl) = st.closure {
        let cn = h.name(cl);
        if kind != "tree" {
            return Err(format!("{what}: only a tree has a closure"));
        }
        if cl == rel {
            return Err(format!("{what}: a tree's closure is another relation than its edges"));
        }
        if v.is_reserved(cl) || cn.starts_with('$') || v.arity_of(cl).is_some() {
            return Err(format!("{what}: '{cn}' is a kernel relation and cannot be the closure of a tree"));
        }
        if declared.contains(&cl) {
            return Err(format!("{what}: '{cn}' is declared a structure twice"));
        }
        if let Some(other) = concluded(cl) {
            return Err(format!("{what}: '{cn}' is also concluded by {other}; a closure has no other conclusion"));
        }
    }
    Ok(())
}

/// THE CLOSURE OF A TREE IS THE DECLARATION'S, and nothing else concludes it
/// (`checkClosureHead`, src/structure.ts): the refusal of a clause that does.
pub fn check_closure_head(h: &Heap, c: &crate::reflect::Clause, closures: &HashMap<Sym, Sym>) -> Option<String> {
    let tree = closures.get(&c.head.rel).filter(|_| !brk!("tree_closure_head_open" => true; false))?;
    Some(format!(
        "{} rejected: '{}' is the closure of the tree {} and has no other conclusion: {}",
        if c.body.is_empty() { "fact" } else { "rule" },
        h.name(c.head.rel),
        h.name(*tree),
        crate::reflect::canon_clause(h, c)
    ))
}

/// The relations a rule concludes, as `concludes` rows say.
pub fn concluded_by_rules(h: &Heap, v: &Vocab, store: &mut Store) -> HashSet<Sym> {
    let mut out = HashSet::new();
    for f in store.rel_persp(h, v.concludes, v.kernel_persp) {
        if let Some(rel) = store.args(f).get(1).and_then(|a| a.as_atom()) {
            out.insert(rel);
        }
    }
    out
}

/// THE LOWERING OF `closure` (`lowerClosure`, src/structure.ts): the two rules the author would have written, in every
/// book `B`. TypeScript evaluates them; this engine reads them for what they say (reflection, `why`) and answers the
/// relation from the tree.
pub fn lower_closure(h: &Heap, c: &Clause) -> Vec<String> {
    let st = c.structure.as_ref().expect("a structure");
    let (rel, cl) = (h.name(c.head.rel), h.name(st.closure.expect("a closure")));
    let base = format!("{cl}[B](P, C) :- {rel}[B](P, C).");
    let step = format!("{cl}[B](P, D) :- {cl}[B](P, X), {rel}[B](X, D).");
    if brk!("tree_lowering_base_only" => true; false) { vec![base] } else { vec![base, step] }
}

/// The closure each declared tree stands for, by the closure's name.
pub fn closures(h: &Heap, v: &Vocab, store: &mut Store) -> HashMap<Sym, Sym> {
    let mut out = HashMap::new();
    for f in store.rel_persp(h, v.structure_closure, v.kernel_persp) {
        if let [r, c] = store.args(f) {
            if let (Some(r), Some(c)) = (r.as_atom(), c.as_atom()) {
                out.insert(c, r);
            }
        }
    }
    out
}

/// The relations the program declares a structure of.
pub fn declared(h: &Heap, v: &Vocab, store: &mut Store) -> HashSet<Sym> {
    let mut out = HashSet::new();
    for f in store.rel_persp(h, v.structure_decl, v.kernel_persp) {
        if let Some(r) = store.args(f).first().and_then(|a| a.as_atom()) {
            out.insert(r);
        }
    }
    for f in store.rel_persp(h, v.structure_closure, v.kernel_persp) {
        if let Some(c) = store.args(f).get(1).and_then(|a| a.as_atom()) {
            out.insert(c);
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

/// The trees the program declares.
pub fn trees(h: &Heap, v: &Vocab, store: &mut Store) -> Vec<Tree> {
    let by_tree: HashMap<Sym, Sym> = closures(h, v, store).iter().map(|(c, r)| (*r, *c)).collect();
    let mut out = Vec::new();
    for f in store.rel_persp(h, v.structure_decl, v.kernel_persp) {
        if let [r, _, kind] = store.args(f) {
            if let (Some(r), Some(kind)) = (r.as_atom(), kind.as_atom()) {
                if h.name(kind) == "tree" {
                    out.push(Tree { rel: r, closure: by_tree.get(&r).copied() });
                }
            }
        }
    }
    out
}

/// THE PROMISE OF EVERY DECLARED TREE, a forest (`checkTrees`, src/structure.ts): each child has one parent and no node
/// is its own ancestor, in each book. A child with two parents refuses first (the smallest child by its canonical text,
/// its two smallest parents), then a cycle (the one through the smallest node, each node the parent of the one before
/// it); both engines name the same ones.
pub fn check_trees(h: &Heap, store: &Store, ts: &[Tree]) -> Result<(), String> {
    let mut ts: Vec<&Tree> = ts.iter().collect();
    ts.sort_by(|a, b| cmp_js(h.name(a.rel), h.name(b.rel)));
    for t in ts {
        let mut books: FxMap<Sym, Vec<(Term, Term)>> = FxMap::default();
        store.each_row(t.rel, |persp, id| {
            if let [p, c] = store.args(id) {
                books.entry(brk!("tree_book_ignored" => 0; persp)).or_default().push((*p, *c));
            }
        });
        let mut books: Vec<(Sym, Vec<(Term, Term)>)> = books.into_iter().collect();
        books.sort_by(|a, b| cmp_js(h.name(a.0), h.name(b.0)));
        for (book, edges) in books {
            let mut parents: FxMap<u64, (Term, Vec<Term>)> = FxMap::default();
            for (p, c) in &edges {
                parents.entry(c.bits()).or_insert_with(|| (*c, Vec::new())).1.push(*p);
            }
            let canon = |t: Term| h.canon(t);
            let mut two: Vec<(String, &Vec<Term>)> = parents.values().filter(|(_, ps)| ps.len() > brk!("tree_parents_unjudged" => 99; 1)).map(|(c, ps)| (canon(*c), ps)).collect();
            if !two.is_empty() {
                two.sort_by(|a, b| cmp_js(&a.0, &b.0));
                let mut ps: Vec<String> = two[0].1.iter().map(|p| canon(*p)).collect();
                ps.sort_by(|a, b| cmp_js(a, b));
                ps.dedup();
                let more = match two.len() { 1 => String::new(), 2 => "; 1 more child breaks it too".to_string(), m => format!("; {} more children break it too", m - 1) };
                return Err(format!("program rejected: tree {}: node ({}) has two parents in the book {}: ({}) and ({}){more}", h.name(t.rel), two[0].0, h.name(book), ps[0], ps[1]));
            }
            let up: FxMap<u64, u64> = parents.iter().map(|(c, (_, ps))| (*c, ps[0].bits())).collect();
            let text: FxMap<u64, String> = parents.iter().flat_map(|(c, (ct, ps))| [(*c, canon(*ct)), (ps[0].bits(), canon(ps[0]))]).collect();
            let mut nodes: Vec<u64> = up.keys().copied().collect();
            nodes.sort_by(|a, b| cmp_js(&text[a], &text[b]));
            let mut mark: FxMap<u64, u32> = FxMap::default();
            let mut cycles: Vec<Vec<u64>> = Vec::new();
            let mut stamp = 0u32;
            for n in nodes {
                if mark.contains_key(&n) {
                    continue;
                }
                stamp += 1;
                let mut path: Vec<u64> = Vec::new();
                let mut x = Some(n);
                while let Some(y) = x {
                    if mark.contains_key(&y) {
                        break;
                    }
                    mark.insert(y, stamp);
                    path.push(y);
                    x = up.get(&y).copied();
                }
                if let Some(y) = x {
                    if mark[&y] == stamp {
                        let at = path.iter().position(|z| *z == y).unwrap();
                        cycles.push(path[at..].to_vec());
                    }
                }
            }
            if cycles.is_empty() || brk!("tree_cycle_unchecked" => true; false) {
                continue;
            }
            let least = |cy: &Vec<u64>| cy.iter().map(|x| text[x].clone()).min_by(|a, b| cmp_js(a, b)).unwrap();
            cycles.sort_by(|a, b| cmp_js(&least(a), &least(b)));
            let cy = &cycles[0];
            let l = least(cy);
            let i = cy.iter().position(|x| text[x] == l).unwrap();
            let through: Vec<String> = cy[i..].iter().chain(cy[..i].iter()).map(|x| format!("({})", text[x])).collect();
            let more = match cycles.len() { 1 => String::new(), 2 => "; 1 more cycle".to_string(), m => format!("; {} more cycles", m - 1) };
            return Err(format!("program rejected: tree {}: node ({l}) is its own ancestor in the book {}: through {}{more}", h.name(t.rel), h.name(book), through.join(", ")));
        }
    }
    Ok(())
}

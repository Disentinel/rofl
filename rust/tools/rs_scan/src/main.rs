// rs_scan — the facts of a Rust crate's source, for rules/rofl-engine.rofl.
//
//   rs_scan <crate-dir> <crate-name>   prints facts on stdout, the same bytes for the same tree
//
// It only turns syntax into rows: a module, a function, a type, a field, a call as written, a string a dispatch
// matches on. Which function a call reaches is the rules' question, not this file's.
use std::fmt::Write as _;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use syn::spanned::Spanned;
use syn::visit::{self, Visit};

struct Out(String);

impl Out {
    fn fact(&mut self, rel: &str, args: &[&str]) {
        // `#N` is the number N (a line, a count, a position); every other argument is a string
        let a: Vec<String> = args.iter().map(|s| match s.strip_prefix('#') { Some(n) if !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()) => n.to_string(), _ => q(s) }).collect();
        writeln!(self.0, "{rel}[rs]({}).", a.join(", ")).unwrap();
    }
}

fn q(s: &str) -> String {
    let mut o = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            c if c.is_control() => {}
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

fn is_test(attrs: &[syn::Attribute]) -> bool {
    attrs.iter().any(|a| {
        let t = a.meta.to_token_stream_string();
        t == "test" || t.starts_with("cfg (test") || t.starts_with("cfg(test")
    })
}

trait MetaStr {
    fn to_token_stream_string(&self) -> String;
}
impl MetaStr for syn::Meta {
    fn to_token_stream_string(&self) -> String {
        quote::ToTokens::to_token_stream(self).to_string()
    }
}

fn path_str(p: &syn::Path) -> String {
    p.segments.iter().map(|s| s.ident.to_string()).collect::<Vec<_>>().join("::")
}

fn type_name(t: &syn::Type) -> String {
    match t {
        syn::Type::Path(p) => {
            let Some(last) = p.path.segments.last() else { return String::new() };
            // a wrapper is read through to what it holds: `Rc<RefCell<Session>>` is a Session to call a method on
            if let ("Box" | "Rc" | "Arc" | "RefCell" | "Cell" | "Mutex" | "RwLock" | "Option" | "Result", syn::PathArguments::AngleBracketed(a)) = (last.ident.to_string().as_str(), &last.arguments) {
                if let Some(syn::GenericArgument::Type(t)) = a.args.first() {
                    return type_name(t);
                }
            }
            last.ident.to_string()
        }
        syn::Type::Reference(r) => type_name(&r.elem),
        _ => quote::ToTokens::to_token_stream(t).to_string(),
    }
}

fn fn_bound(bounds: &syn::punctuated::Punctuated<syn::TypeParamBound, syn::Token![+]>) -> Vec<syn::Type> {
    for b in bounds {
        if let syn::TypeParamBound::Trait(t) = b {
            if let Some(seg) = t.path.segments.last() {
                if let ("Fn" | "FnMut" | "FnOnce", syn::PathArguments::Parenthesized(p)) = (seg.ident.to_string().as_str(), &seg.arguments) {
                    return p.inputs.iter().cloned().collect();
                }
            }
        }
    }
    vec![]
}

fn fn_args(t: &syn::Type, g: &syn::Generics) -> Vec<syn::Type> {
    match t {
        syn::Type::ImplTrait(i) => fn_bound(&i.bounds),
        syn::Type::Reference(r) => fn_args(&r.elem, g),
        syn::Type::Path(p) if p.path.segments.len() == 1 => {
            let name = &p.path.segments[0].ident;
            let declared = g.type_params().filter(|tp| &tp.ident == name).map(|tp| fn_bound(&tp.bounds));
            let wheres = g.where_clause.iter().flat_map(|w| &w.predicates).filter_map(|w| match w {
                syn::WherePredicate::Type(pt) if matches!(&pt.bounded_ty, syn::Type::Path(b) if b.path.is_ident(name)) => Some(fn_bound(&pt.bounds)),
                _ => None,
            });
            declared.chain(wheres).find(|v| !v.is_empty()).unwrap_or_default()
        }
        _ => vec![],
    }
}

fn num(n: usize) -> String {
    format!("#{n}")
}

fn line(s: proc_macro2::Span) -> String {
    num(s.start().line)
}

struct Scan<'o> {
    out: &'o mut Out,
    types: &'o HashMap<String, Vec<String>>,
    all_uses: &'o [(String, String, String)],
    file: String,
    root: String,
    module: String,
    uses: Vec<(String, String, String)>,
    ty: Option<String>,
    trait_: Option<String>,
    func: Vec<String>,
}

impl Scan<'_> {
    /// A type named in this module, as the module that defines it: its own, one a `use` names, one a glob reaches,
    /// or the crate's only one so named. A type of std or one two modules define and nothing picks stays bare.
    fn qualify(&self, t: &str) -> String {
        qualify_in(self.types, self.all_uses, &self.module, t, 0).unwrap_or_else(|| t.to_string())
    }

    fn here(&self) -> Option<&String> {
        self.func.last()
    }

    fn function(&mut self, name: &str, vis: &syn::Visibility, sig: &syn::Signature, span: proc_macro2::Span, body: impl FnOnce(&mut Self)) {
        let id = match (self.func.last(), &self.ty) {
            (Some(outer), _) => format!("{outer}::{name}"),
            (None, Some(t)) => format!("{}::{}::{name}", self.module, t.rsplit("::").next().unwrap_or(t)),
            (None, None) => format!("{}::{name}", self.module),
        };
        let (file, module) = (self.file.clone(), self.module.clone());
        let lines = num(span.end().line + 1 - span.start().line);
        self.out.fact("rs_fn", &[&id, name, &module, &file, &line(span), &lines]);
        if let Some(t) = self.ty.clone().filter(|_| self.func.is_empty()) {
            self.out.fact("rs_method", &[&id, &t, name]);
            if let Some(tr) = self.trait_.clone() {
                self.out.fact("rs_trait_method", &[&id, &tr]);
            }
        }
        if !matches!(vis, syn::Visibility::Inherited) {
            self.out.fact("rs_pub", &[&id]);
        }
        for (i, input) in sig.inputs.iter().enumerate() {
            if let syn::FnArg::Typed(pt) = input {
                let pn = quote::ToTokens::to_token_stream(&pt.pat).to_string();
                let pn = pn.trim_start_matches("mut ").to_string();
                let t = self.qualify(&type_name(&pt.ty));
                self.out.fact("rs_param", &[&id, &num(i), &pn, &t]);
                // a function passed in: what its closure's arguments are, `impl FnOnce(&mut Session)` or `F: Fn(&Row)`
                for (j, a) in fn_args(&pt.ty, &sig.generics).iter().enumerate() {
                    let a = self.qualify(&type_name(a));
                    self.out.fact("rs_param_fn", &[&id, &num(i), &num(j), &a]);
                }
            }
        }
        if let syn::ReturnType::Type(_, t) = &sig.output {
            let t = self.qualify(&type_name(t));
            self.out.fact("rs_returns", &[&id, &t]);
        }
        self.func.push(id);
        body(self);
        self.func.pop();
    }

    fn call(&mut self, how: &str, name: &str, qual: &str, span: proc_macro2::Span) {
        let Some(f) = self.here().cloned() else { return };
        let l = line(span);
        self.out.fact("rs_call", &[&f, how, name, qual, &l]);
        let segs: Vec<&str> = if qual.is_empty() { vec![] } else { qual.split("::").collect() };
        match (how, segs.as_slice()) {
            ("method", ["self"]) | ("path" | "ref", ["Self"]) => {
                if let Some(t) = self.ty.clone() {
                    self.out.fact("rs_call_ty", &[&f, &t, name, &l]);
                }
                if how == "method" {
                    self.out.fact("rs_recv", &[&f, &call_id(span), name, "self", ""]);
                }
            }
            ("method", [root]) if root.starts_with('=') => {
                // a receiver of fields from a variable or `self`: `=root path`, its type is the rules' to find
                let (root, path) = root[1..].split_once(' ').unwrap_or((&root[1..], ""));
                self.out.fact("rs_recv", &[&f, &call_id(span), name, root, path]);
                self.out.fact("rs_call_any", &[&f, name, &l]);
            }
            ("method", _) => self.out.fact("rs_call_any", &[&f, name, &l]),
            (_, []) => {
                let mut c = vec![format!("{f}::{name}"), format!("{}::{name}", self.module)];
                for (m, path, alias) in &self.uses {
                    if m == &self.module && (alias == name || alias == "*") {
                        c.push(if alias == "*" { format!("{path}::{name}") } else { path.clone() });
                    }
                }
                for c in c {
                    self.out.fact("rs_call_to", &[&f, &c, &l]);
                }
            }
            (_, [first, rest @ ..]) => {
                let mut heads = match *first {
                    "crate" => vec![self.root.clone()],
                    "self" => vec![self.module.clone()],
                    "super" => vec![parent(&self.module)],
                    "Self" => vec![],
                    s => {
                        let mut h: Vec<String> = self.uses.iter().filter(|(m, _, a)| m == &self.module && a == s).map(|(_, p, _)| p.clone()).collect();
                        h.push(format!("{}::{s}", self.module));
                        h.push(s.to_string());
                        h
                    }
                };
                for h in heads.iter_mut() {
                    for r in rest {
                        h.push_str("::");
                        h.push_str(r);
                    }
                    self.out.fact("rs_call_to", &[&f, &format!("{h}::{name}"), &l]);
                }
                let ty = segs.last().unwrap();
                if ty.chars().next().is_some_and(|c| c.is_uppercase()) {
                    let ty = self.qualify(ty);
                    self.out.fact("rs_call_ty", &[&f, &ty, name, &l]);
                }
            }
        }
    }
}

impl<'ast> Visit<'ast> for Scan<'_> {
    fn visit_item_mod(&mut self, m: &'ast syn::ItemMod) {
        if is_test(&m.attrs) {
            return;
        }
        if let Some((_, items)) = &m.content {
            let saved = self.module.clone();
            self.module = format!("{saved}::{}", m.ident);
            self.out.fact("rs_mod", &[&self.module, &self.file]);
            self.out.fact("rs_submod", &[&saved, &self.module]);
            for i in items {
                self.visit_item(i);
            }
            self.module = saved;
        } else {
            let child = format!("{}::{}", self.module, m.ident);
            self.out.fact("rs_submod", &[&self.module, &child]);
        }
    }

    fn visit_item_fn(&mut self, f: &'ast syn::ItemFn) {
        if is_test(&f.attrs) {
            return;
        }
        let ty = self.ty.take();
        let name = f.sig.ident.to_string();
        self.function(&name, &f.vis, &f.sig, f.span(), |s| visit::visit_block(s, &f.block));
        self.ty = ty;
    }

    fn visit_item_impl(&mut self, i: &'ast syn::ItemImpl) {
        if is_test(&i.attrs) {
            return;
        }
        let t = self.qualify(&type_name(&i.self_ty));
        let tr = i.trait_.as_ref().map(|(_, p, _)| self.qualify(&p.segments.last().map(|s| s.ident.to_string()).unwrap_or_default()));
        let (module, tr_s) = (self.module.clone(), tr.clone().unwrap_or_default());
        self.out.fact("rs_impl", &[&t, &tr_s, &module]);
        let saved = (self.ty.replace(t), std::mem::replace(&mut self.trait_, tr));
        for item in &i.items {
            if let syn::ImplItem::Fn(f) = item {
                let name = f.sig.ident.to_string();
                self.function(&name, &f.vis, &f.sig, f.span(), |s| visit::visit_block(s, &f.block));
            }
        }
        (self.ty, self.trait_) = saved;
    }

    fn visit_item_trait(&mut self, t: &'ast syn::ItemTrait) {
        let (id, module) = (format!("{}::{}", self.module, t.ident), self.module.clone());
        self.out.fact("rs_type", &[&id, &module, "trait", &line(t.span())]);
        for item in &t.items {
            if let syn::TraitItem::Fn(f) = item {
                if let Some(b) = &f.default {
                    let saved = (self.ty.replace(id.clone()), self.trait_.replace(id.clone()));
                    let name = f.sig.ident.to_string();
                    self.function(&name, &syn::Visibility::Inherited, &f.sig, f.span(), |s| visit::visit_block(s, b));
                    (self.ty, self.trait_) = saved;
                }
            }
        }
    }

    fn visit_item_struct(&mut self, s: &'ast syn::ItemStruct) {
        if is_test(&s.attrs) {
            return;
        }
        let (id, module) = (format!("{}::{}", self.module, s.ident), self.module.clone());
        self.out.fact("rs_type", &[&id, &module, "struct", &line(s.span())]);
        for (i, f) in s.fields.iter().enumerate() {
            let fname = f.ident.as_ref().map(|i| i.to_string()).unwrap_or_else(|| i.to_string());
            let ft = self.qualify(&type_name(&f.ty));
            self.out.fact("rs_field", &[&id, &fname, &ft]);
        }
    }

    fn visit_item_enum(&mut self, e: &'ast syn::ItemEnum) {
        let (id, module) = (format!("{}::{}", self.module, e.ident), self.module.clone());
        self.out.fact("rs_type", &[&id, &module, "enum", &line(e.span())]);
        for v in &e.variants {
            self.out.fact("rs_variant", &[&id, &v.ident.to_string()]);
        }
    }

    fn visit_item_use(&mut self, u: &'ast syn::ItemUse) {
        let mut acc = Vec::new();
        flatten_use(&u.tree, String::new(), &mut acc);
        let module = self.module.clone();
        for (path, alias) in acc {
            let path = absolute(&path, &self.root, &module);
            self.out.fact("rs_use", &[&module, &path, &alias]);
        }
    }

    fn visit_expr_call(&mut self, c: &'ast syn::ExprCall) {
        if let syn::Expr::Path(p) = &*c.func {
            let segs: Vec<String> = p.path.segments.iter().map(|s| s.ident.to_string()).collect();
            if let Some((name, qual)) = segs.split_last() {
                self.call("path", name, &qual.join("::"), c.span());
            }
        }
        visit::visit_expr_call(self, c);
    }

    fn visit_expr_method_call(&mut self, m: &'ast syn::ExprMethodCall) {
        let recv = match (&*m.receiver, chain(&m.receiver)) {
            (syn::Expr::Path(p), _) if p.path.is_ident("self") => "self".to_string(),
            (_, Some((root, path))) => format!("={root} {path}"),
            _ => String::new(),
        };
        self.call("method", &m.method.to_string(), &recv, m.method.span());
        // a closure's argument is typed by what the called method says it passes
        if let Some(f) = self.here().cloned() {
            for (k, a) in m.args.iter().enumerate() {
                if let syn::Expr::Closure(c) = a {
                    for (j, input) in c.inputs.iter().enumerate() {
                        match input {
                            syn::Pat::Ident(i) => self.out.fact("rs_closure", &[&f, &i.ident.to_string(), &call_id(m.method.span()), &num(k + 1), &num(j)]),
                            syn::Pat::Type(t) => {
                                if let syn::Pat::Ident(i) = &*t.pat {
                                    let ty = self.qualify(&type_name(&t.ty));
                                    self.out.fact("rs_let", &[&f, &i.ident.to_string(), &ty]);
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
        // a receiver another call returns (`self.get(r)?.fork()`): its type is what that call's callee returns
        if let (Some(f), syn::Expr::MethodCall(inner)) = (self.here().cloned(), strip(&m.receiver)) {
            self.out.fact("rs_recv_of", &[&f, &call_id(m.method.span()), &m.method.to_string(), &call_id(inner.method.span())]);
        }
        visit::visit_expr_method_call(self, m);
    }

    fn visit_local(&mut self, l: &'ast syn::Local) {
        if let Some(f) = self.here().cloned() {
            let (pat, ty) = match &l.pat {
                syn::Pat::Type(t) => (&*t.pat, Some(self.qualify(&type_name(&t.ty)))),
                p => (p, None),
            };
            if let syn::Pat::Ident(i) = pat {
                let var = i.ident.to_string();
                if let Some(t) = ty {
                    self.out.fact("rs_let", &[&f, &var, &t]);
                } else if let Some(init) = &l.init {
                    let mut e = &*init.expr;
                    e = strip(e);
                    match e {
                        syn::Expr::MethodCall(m) => self.out.fact("rs_let_call", &[&f, &var, &call_id(m.method.span())]),
                        syn::Expr::Call(c) => {
                            if let syn::Expr::Path(p) = &*c.func {
                                let segs: Vec<String> = p.path.segments.iter().map(|s| s.ident.to_string()).collect();
                                if let Some((name, qual)) = segs.split_last() {
                                    let ty = match qual.last().map(String::as_str) {
                                        None => String::new(),
                                        Some("Self") => self.ty.clone().unwrap_or_default(),
                                        Some(t) => self.qualify(t),
                                    };
                                    self.out.fact("rs_let_path", &[&f, &var, &ty, name]);
                                }
                            }
                        }
                        syn::Expr::Struct(s) => {
                            let t = self.qualify(path_str(&s.path).rsplit("::").next().unwrap_or(""));
                            self.out.fact("rs_let", &[&f, &var, &t]);
                        }
                        e => {
                            if let Some((root, path)) = chain(e) {
                                self.out.fact("rs_let_chain", &[&f, &var, &root, &path]);
                            }
                        }
                    }
                }
            }
        }
        visit::visit_local(self, l);
    }

    fn visit_expr_path(&mut self, p: &'ast syn::ExprPath) {
        // a function named, not called: passed as a value (`map(Self::f)`, a thread's body)
        let segs: Vec<String> = p.path.segments.iter().map(|s| s.ident.to_string()).collect();
        if segs.len() > 1 {
            if let Some((name, qual)) = segs.split_last() {
                if name.chars().next().is_some_and(|c| c.is_lowercase()) {
                    self.call("ref", name, &qual.join("::"), p.span());
                }
            }
        }
        visit::visit_expr_path(self, p);
    }

    fn visit_expr_struct(&mut self, s: &'ast syn::ExprStruct) {
        if let Some(f) = self.here().cloned() {
            let t = self.qualify(path_str(&s.path).rsplit("::").next().unwrap_or(""));
            self.out.fact("rs_builds", &[&f, &t]);
        }
        visit::visit_expr_struct(self, s);
    }

    fn visit_arm(&mut self, a: &'ast syn::Arm) {
        if let Some(f) = self.here().cloned() {
            let mut strs = Vec::new();
            pat_strs(&a.pat, &mut strs);
            let (from, to) = (line(a.span()), num(a.span().end().line));
            for s in strs {
                self.out.fact("rs_case", &[&f, &s, &from, &to]);
            }
        }
        visit::visit_arm(self, a);
    }

    fn visit_expr_binary(&mut self, b: &'ast syn::ExprBinary) {
        if matches!(b.op, syn::BinOp::Eq(_)) {
            if let (Some(f), syn::Expr::Lit(syn::ExprLit { lit: syn::Lit::Str(s), .. })) = (self.here().cloned(), &*b.right) {
                let l = line(b.span());
                self.out.fact("rs_case", &[&f, &s.value(), &l, &l]);
            }
        }
        visit::visit_expr_binary(self, b);
    }
}

/// an expression with what only passes its value along taken off: `&x`, `x?`, `(x)`, `x.await`
fn strip(e: &syn::Expr) -> &syn::Expr {
    match e {
        syn::Expr::Reference(r) => strip(&r.expr),
        syn::Expr::Try(t) => strip(&t.expr),
        syn::Expr::Paren(p) => strip(&p.expr),
        syn::Expr::Await(a) => strip(&a.base),
        e => e,
    }
}

/// `a.b.c` read as its root (`self` or a variable) and the fields after it, `b.c`
fn chain(e: &syn::Expr) -> Option<(String, String)> {
    match e {
        syn::Expr::Path(p) => p.path.get_ident().map(|i| (i.to_string(), String::new())),
        syn::Expr::Field(f) => {
            let (root, path) = chain(&f.base)?;
            let m = quote::ToTokens::to_token_stream(&f.member).to_string();
            Some((root, if path.is_empty() { m } else { format!("{path}.{m}") }))
        }
        syn::Expr::Paren(p) => chain(&p.expr),
        syn::Expr::Reference(r) => chain(&r.expr),
        _ => None,
    }
}

/// a method call named by where it stands: line * 10000 + column
fn call_id(s: proc_macro2::Span) -> String {
    num(s.start().line * 10000 + s.start().column)
}

fn pat_strs(p: &syn::Pat, out: &mut Vec<String>) {
    match p {
        syn::Pat::Lit(syn::ExprLit { lit: syn::Lit::Str(s), .. }) => out.push(s.value()),
        syn::Pat::Or(o) => o.cases.iter().for_each(|c| pat_strs(c, out)),
        syn::Pat::Tuple(t) => t.elems.iter().for_each(|c| pat_strs(c, out)),
        syn::Pat::Slice(t) => t.elems.iter().for_each(|c| pat_strs(c, out)),
        syn::Pat::Reference(r) => pat_strs(&r.pat, out),
        _ => {}
    }
}

fn flatten_use(t: &syn::UseTree, prefix: String, acc: &mut Vec<(String, String)>) {
    let join = |p: &str, s: &str| if p.is_empty() { s.to_string() } else { format!("{p}::{s}") };
    match t {
        syn::UseTree::Path(p) => flatten_use(&p.tree, join(&prefix, &p.ident.to_string()), acc),
        syn::UseTree::Name(n) => {
            let s = n.ident.to_string();
            if s == "self" {
                let last = prefix.rsplit("::").next().unwrap_or("").to_string();
                acc.push((prefix, last));
            } else {
                acc.push((join(&prefix, &s), s));
            }
        }
        syn::UseTree::Rename(r) => acc.push((join(&prefix, &r.ident.to_string()), r.rename.to_string())),
        syn::UseTree::Glob(_) => acc.push((prefix, "*".into())),
        syn::UseTree::Group(g) => g.items.iter().for_each(|i| flatten_use(i, prefix.clone(), acc)),
    }
}

fn qualify_in(types: &HashMap<String, Vec<String>>, uses: &[(String, String, String)], m: &str, t: &str, depth: usize) -> Option<String> {
    if t.is_empty() || t.contains("::") || depth > 6 {
        return None;
    }
    let defs = types.get(t)?;
    if defs.iter().any(|d| d == m) {
        return Some(format!("{m}::{t}"));
    }
    for (um, path, alias) in uses.iter().filter(|u| u.0 == m) {
        if alias == t {
            let (pm, _) = path.rsplit_once("::")?;
            if defs.iter().any(|d| d == pm) {
                return Some(path.clone());
            }
            if let Some(q) = qualify_in(types, uses, pm, t, depth + 1) {
                return Some(q);
            }
        } else if alias == "*" && um == m {
            if let Some(q) = qualify_in(types, uses, path, t, depth + 1) {
                return Some(q);
            }
        }
    }
    (depth == 0 && defs.len() == 1).then(|| format!("{}::{t}", defs[0]))
}

fn collect_types(items: &[syn::Item], module: &str, acc: &mut HashMap<String, Vec<String>>) {
    for i in items {
        let name = match i {
            syn::Item::Struct(x) => x.ident.to_string(),
            syn::Item::Enum(x) => x.ident.to_string(),
            syn::Item::Trait(x) => x.ident.to_string(),
            syn::Item::Type(x) => x.ident.to_string(),
            syn::Item::Mod(x) => {
                if let Some((_, items)) = &x.content {
                    collect_types(items, &format!("{module}::{}", x.ident), acc);
                }
                continue;
            }
            _ => continue,
        };
        acc.entry(name).or_default().push(module.to_string());
    }
}

fn parent(m: &str) -> String {
    m.rsplit_once("::").map(|(p, _)| p.to_string()).unwrap_or_default()
}

fn absolute(path: &str, root: &str, module: &str) -> String {
    let mut segs = path.split("::");
    let mut head = match segs.next() {
        Some("crate") => root.to_string(),
        Some("self") => module.to_string(),
        Some("super") => parent(module),
        _ => return path.to_string(),
    };
    for s in segs {
        if s == "super" { head = parent(&head) } else { head = format!("{head}::{s}") }
    }
    head
}

fn module_of(src: &Path, file: &Path, krate: &str) -> String {
    let rel = file.strip_prefix(src).unwrap();
    let mut parts: Vec<String> = rel.iter().map(|s| s.to_string_lossy().into_owned()).collect();
    let last = parts.pop().unwrap();
    let stem = last.trim_end_matches(".rs");
    let mut segs = vec![krate.to_string()];
    if parts.first().map(|s| s.as_str()) == Some("bin") {
        segs = vec!["bin".into()];
        parts.remove(0);
    }
    segs.extend(parts);
    if !matches!(stem, "lib" | "main" | "mod") {
        segs.push(stem.into());
    }
    segs.join("::")
}

fn collect_uses(items: &[syn::Item], module: &str, root: &str, acc: &mut Vec<(String, String, String)>) {
    for i in items {
        match i {
            syn::Item::Use(u) => {
                let mut v = Vec::new();
                flatten_use(&u.tree, String::new(), &mut v);
                acc.extend(v.into_iter().map(|(p, a)| (module.to_string(), absolute(&p, root, module), a)));
            }
            syn::Item::Mod(m) => {
                if let Some((_, items)) = &m.content {
                    collect_uses(items, &format!("{module}::{}", m.ident), root, acc);
                }
            }
            _ => {}
        }
    }
}

fn walk(dir: &Path, acc: &mut Vec<PathBuf>) {
    let mut es: Vec<_> = std::fs::read_dir(dir).unwrap().map(|e| e.unwrap().path()).collect();
    es.sort();
    for p in es {
        if p.is_dir() {
            walk(&p, acc);
        } else if p.extension().is_some_and(|e| e == "rs") {
            acc.push(p);
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (dir, krate, prefix) = (Path::new(&args[1]), &args[2], args.get(3).cloned().unwrap_or_default());
    let src = dir.join("src");
    let mut files = Vec::new();
    walk(&src, &mut files);
    let mut parsed = Vec::new();
    for f in &files {
        let text = std::fs::read_to_string(f).unwrap();
        match syn::parse_file(&text) {
            Ok(a) => {
                let module = module_of(&src, f, krate);
                let root = if module.starts_with("bin::") { module.splitn(3, "::").take(2).collect::<Vec<_>>().join("::") } else { krate.clone() };
                parsed.push((f, text, a, module, root));
            }
            Err(e) => eprintln!("rs_scan: {}: {e}", f.display()),
        }
    }
    // a type is known by the module that defines it, and a use reaches the whole file wherever it stands: both are
    // read for every file before any call is
    let mut types = HashMap::new();
    let mut all_uses = Vec::new();
    for (_, _, ast, module, root) in &parsed {
        collect_types(&ast.items, module, &mut types);
        collect_uses(&ast.items, module, root, &mut all_uses);
    }
    let mut out = Out(String::new());
    for (f, text, ast, module, root) in &parsed {
        let file = format!("{prefix}{}", f.strip_prefix(dir).unwrap().display());
        out.fact("rs_mod", &[module, &file]);
        out.fact("rs_file", &[&file, &num(text.lines().count())]);
        let uses = all_uses.iter().filter(|u| &u.0 == module).cloned().collect();
        let mut s = Scan { out: &mut out, types: &types, all_uses: &all_uses, file, root: root.clone(), module: module.clone(), uses, ty: None, trait_: None, func: Vec::new() };
        s.visit_file(ast);
    }
    print!("{}", out.0);
}

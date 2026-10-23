//! THE EXEC ADAPTER (docs/intents.md, phase 2): the `reads` wants of a world sent to the program its adapter's book
//! names, one batch per capability per round, and what comes back loaded by delta, until the world wants nothing new.
//!
//! The book (D1): `adapter(Name, exec, Command)`, `capability(Cap, Name, reads)`, `arg(Cap, Pos, ArgName, Type)`,
//! `answers(Cap, Rel, Arity)`. The program gets on its standard input
//! `{"capability": Cap, "book_version": V, "wants": [{"key": K, "args": {ArgName: Value}}]}`, the key the want's row
//! `$want(Cap, A1..An)` as ROFL text, and prints ROFL facts (4.3): its answers, the key as their first column, and
//! `answered(K)` for a want it answered with no fact, `failed(K, Reason)` for one it could not.
//!
//! The outcomes (D9), rows of the main book: an answer's facts go in the adapter's own book (D10) beside `answered(W)`;
//! `failed(W, Reason)` for a want the program refused, or each want of a batch whose program failed, was killed or
//! answered outside its capability's relations; `outcome_unknown(W)` for a want of a batch that ended well and said
//! nothing of it; `want_held(W, Why)` for a want no adapter it can run is declared for. A want with any of them is
//! not sent again.
//!
//! The kinds: `exec` above, `sql` (`run_sql`), `mcp` (src/mcp.rs), `openapi` (src/openapi.rs), `rofl` (`run_rofl`). Evaluation sends only `reads` wants; a `does`
//! want goes only through `dispatch`, which `rofl serve` runs on request (phase 6).

use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::Write;
use std::path::Path;

use crate::rofl_parse;
use crate::session::Session;
use crate::term::{Term, TermK};

/// One batch: the capability, its adapter, the program, the wants by key text.
#[cfg_attr(not(feature = "sql"), allow(dead_code))]
struct Batch {
    cap: String,
    adapter: String,
    kind: String,
    cmd: String,
    input: String,
    params: Vec<Vec<serde_json::Value>>,
    template: Option<String>,
    tool: Option<String>,
    op: Option<crate::openapi::Op>,
    auth: Vec<(String, String, String)>,
    fields: Vec<String>,
    named: Vec<serde_json::Value>,
    idem: Vec<Option<String>>,
    wants: Vec<(String, Term)>,
    answers: HashSet<(String, usize)>,
}

impl Session {
    /// The `reads` wants not yet sent, sent: a batch per capability, all at once, the answers loaded by delta. How many
    /// rows it loaded: none means the world wants nothing more.
    pub fn adapter_wants(&mut self) -> Result<usize, String> {
        self.send(None)
    }

    /// THE DISPATCHER (D2, D6, D7): the `does` wants with `permit(W)`, sent as `reads` wants are, each recorded in
    /// the append-only journal `does.journal` of `dir` before it goes and its outcome after. A want the journal holds
    /// is never sent again: its outcome is read back from there, and one sent with no outcome recorded (the process
    /// died between) is `outcome_unknown(W)`. The key the journal goes by, a digest of the want's row and its
    /// adapter's book version, is sent with it for the far side to honour (`idempotency_key`; an mcp `_meta`).
    pub fn dispatch(&mut self, dir: &Path) -> Result<usize, String> {
        self.send(Some(dir))
    }

    fn send(&mut self, journal: Option<&Path>) -> Result<usize, String> {
        let main = self.eval.v.main;
        let rows = |s: &mut Self, rel: &str, n: usize| -> Vec<Vec<Term>> {
            let r = s.eval.h.intern(rel);
            s.eval.store.rel_persp(&s.eval.h, r, main).into_iter().map(|f| s.eval.store.args(f).to_vec()).filter(|a| a.len() == n).collect()
        };
        let wants = rows(self, "want_of", 2);
        if wants.is_empty() {
            return Ok(0);
        }
        let mut settled: HashSet<Term> = [("answered", 1), ("failed", 2), ("outcome_unknown", 1), ("want_held", 2)]
            .into_iter().flat_map(|(r, n)| rows(self, r, n)).map(|a| a[0]).collect();
        if let Some(p) = self.post.as_ref().filter(|_| crate::brk!("post_resends_flying" => false; true)) {
            settled.extend(p.keys.iter().copied());
        }
        let permitted: HashSet<Term> = rows(self, "permit", 1).into_iter().map(|a| a[0]).collect();
        let mut book = journal.map(Journal::open).transpose()?;
        let trust = crate::brk!("does_journal_ignored" => false; true);
        let mut idems: HashMap<Term, String> = HashMap::new();
        let name = |s: &Self, t: Term| -> String {
            match t.kind() {
                TermK::Atom(x) | TermK::Str(x) => s.eval.h.name(x).to_string(),
                _ => s.eval.h.canon(t),
            }
        };
        let caps: HashMap<String, (String, String)> = rows(self, "capability", 3).into_iter().map(|c| (name(self, c[0]), (name(self, c[1]), name(self, c[2])))).collect();
        let adapters: HashMap<String, (String, String)> = rows(self, "adapter", 3).into_iter().map(|a| (name(self, a[0]), (name(self, a[1]), name(self, a[2])))).collect();
        let mut arg_names: HashMap<(String, i64), (String, String)> = HashMap::new();
        for a in rows(self, "arg", 4) {
            if let Some(p) = a[1].as_int() {
                arg_names.insert((name(self, a[0]), p), (name(self, a[2]), name(self, a[3])));
            }
        }
        let tools: HashMap<String, String> = rows(self, "mcp_tool", 2).into_iter().map(|t| (name(self, t[0]), name(self, t[1]))).collect();
        let mut wire: HashMap<(String, i64), String> = HashMap::new();
        for a in rows(self, "mcp_arg", 3) {
            if let Some(p) = a[1].as_int() {
                wire.insert((name(self, a[0]), p), name(self, a[2]));
            }
        }
        let mut places: HashMap<String, Vec<(i64, String, String)>> = HashMap::new();
        for a in rows(self, "http_in", 4) {
            if let Some(p) = a[1].as_int() {
                wire.insert((name(self, a[0]), p), name(self, a[3]));
                places.entry(name(self, a[0])).or_default().push((p, name(self, a[2]), name(self, a[3])));
            }
        }
        let mut keys_of: HashMap<String, Vec<(String, String, String, String)>> = HashMap::new();
        for a in rows(self, "http_auth", 5) {
            keys_of.entry(name(self, a[0])).or_default().push((name(self, a[1]), name(self, a[2]), name(self, a[3]), name(self, a[4])));
        }
        let mut needs: HashMap<String, Vec<String>> = HashMap::new();
        for n in rows(self, "http_needs", 2) {
            needs.entry(name(self, n[0])).or_default().push(name(self, n[1]));
        }
        // the credentials a capability's calls carry, read from the environment, never from the world
        let mut creds: HashMap<String, Result<Vec<(String, String, String)>, String>> = HashMap::new();
        let ops: HashMap<String, (String, String)> = rows(self, "http_op", 3).into_iter().map(|o| (name(self, o[0]), (name(self, o[1]), name(self, o[2])))).collect();
        let mut fields: HashMap<String, Vec<(i64, String)>> = HashMap::new();
        for f in rows(self, "mcp_field", 3).into_iter().chain(rows(self, "http_field", 3)) {
            if let Some(p) = f[1].as_int() {
                fields.entry(name(self, f[0])).or_default().push((p, name(self, f[2])));
            }
        }
        let mut answers: HashMap<String, HashSet<(String, usize)>> = HashMap::new();
        for a in rows(self, "answers", 3) {
            if let Some(n) = a[2].as_int() {
                answers.entry(name(self, a[0])).or_default().insert((name(self, a[1]), n as usize));
            }
        }
        let mut args: HashMap<Term, Vec<(i64, Term)>> = HashMap::new();
        for a in rows(self, "want_arg", 3) {
            if let Some(i) = a[1].as_int() {
                args.entry(a[0]).or_default().push((i, a[2]));
            }
        }
        let templates: HashMap<String, String> = rows(self, "query", 2).into_iter().map(|q| (name(self, q[0]), name(self, q[1]))).collect();
        let mut held = String::new();
        let mut by_cap: BTreeMap<String, Vec<Term>> = BTreeMap::new();
        for w in wants {
            let (key, cap) = (w[0], name(self, w[1]));
            let Some((adapter, class)) = caps.get(&cap) else { continue };
            let wanted = match journal {
                None => class == "reads" || crate::brk!("mcp_does_sent" => class == "does"; false),
                Some(_) => class == "does" && (permitted.contains(&key) || crate::brk!("does_unpermitted_sent" => true; false)),
            };
            if settled.contains(&key) || !wanted {
                continue;
            }
            let text = self.src(key);
            if let Some(j) = book.as_mut() {
                let idem = idem_key(&text, &self.book_version(adapter, &cap));
                if let Some(out) = j.done.get(&idem).filter(|_| trust) {
                    held.push_str(out);
                    continue;
                }
                if trust && j.sent.contains(&idem) {
                    let out = format!("outcome_unknown({text}).\n");
                    j.write(serde_json::json!({"done": idem, "out": out}))?;
                    held.push_str(&out);
                    continue;
                }
                idems.insert(key, idem);
            }
            let kind = adapters.get(adapter).map(|a| a.0.as_str());
            if matches!(kind, Some("openapi" | "mcp")) && !creds.contains_key(&cap) {
                let declared = keys_of.get(adapter).cloned().unwrap_or_default();
                let wanted: Vec<_> = match needs.get(&cap) {
                    Some(n) => declared.into_iter().filter(|d| n.contains(&d.0)).collect(),
                    None if kind == Some("mcp") => declared,
                    None => Vec::new(),
                };
                let got = wanted.into_iter().map(|(scheme, how, n, env)| match std::env::var(&env).ok().filter(|v| !v.is_empty() && crate::brk!("http_key_ignored" => false; true)) {
                    Some(v) => Ok((how, n, v)),
                    None => Err(format!("declared, not connected: the environment has no {env} (the key of {scheme} for {adapter})")),
                }).collect();
                creds.insert(cap.clone(), got);
            }
            match kind {
                Some("openapi" | "mcp") if creds[&cap].is_err() => {
                    let why = creds[&cap].clone().unwrap_err();
                    held.push_str(&format!("want_held({text}, {}).\n", quote(&why)));
                }
                Some("sql") if !cfg!(feature = "sql") => {
                    held.push_str(&format!("want_held({text}, \"this build has no sql adapter (cargo feature `sql`)\").\n"));
                }
                Some("openapi") if !cfg!(feature = "net") => {
                    held.push_str(&format!("want_held({text}, \"this build has no http (cargo feature `net`)\").\n"));
                }
                Some("exec" | "sql" | "mcp" | "rofl" | "openapi") => {
                    if let (Some(j), Some(idem)) = (book.as_mut(), idems.get(&key)) {
                        j.write(serde_json::json!({"sent": idem, "want": text}))?;
                    }
                    by_cap.entry(cap).or_default().push(key)
                }
                kind => {
                    let why = kind.map_or(format!("no adapter '{adapter}' is declared (`adapter({adapter}, Kind, Address)`)"), |k| format!("an adapter of kind {k} is not built yet"));
                    held.push_str(&format!("want_held({}, {}).\n", self.src(key), quote(&why)));
                }
            }
        }
        let by_cap: Vec<(String, Vec<Term>)> = if crate::brk!("adapter_one_call_per_want" => true; false) {
            by_cap.into_iter().flat_map(|(c, ks)| ks.into_iter().map(move |k| (c.clone(), vec![k]))).collect()
        } else {
            by_cap.into_iter().collect()
        };
        let batches: Vec<Batch> = by_cap.into_iter().map(|(cap, mut keys)| {
            keys.sort_by_key(|k| self.src(*k));
            let adapter = caps[&cap].0.clone();
            let (kind, cmd) = adapters[&adapter].clone();
            let wants: Vec<(String, Term)> = keys.iter().map(|k| (self.src(*k), *k)).collect();
            let (mut params, mut named) = (Vec::new(), Vec::new());
            let idem: Vec<Option<String>> = keys.iter().map(|k| idems.get(k).cloned()).collect();
            let json_wants: Vec<serde_json::Value> = wants.iter().zip(&idem).map(|((text, k), idem)| {
                let mut a = args.get(k).cloned().unwrap_or_default();
                a.sort_by_key(|x| x.0);
                params.push(a.iter().map(|(_, v)| self.json(*v)).collect());
                let arg = |i: i64| arg_names.get(&(cap.clone(), i)).cloned().unwrap_or_else(|| (i.to_string(), String::new()));
                let on_wire = |i: i64| wire.get(&(cap.clone(), i)).cloned().unwrap_or_else(|| arg(i).0);
                named.push(a.iter().map(|(i, v)| (on_wire(*i), typed(self.json(*v), &arg(*i).1))).collect());
                let by_name: serde_json::Map<String, serde_json::Value> = a.iter().map(|(i, v)| (arg(*i).0, self.json(*v))).collect();
                match idem {
                    Some(i) => serde_json::json!({"key": text, "args": by_name, "idempotency_key": i}),
                    None => serde_json::json!({"key": text, "args": by_name}),
                }
            }).collect();
            let version = self.book_version(&adapter, &cap);
            let input = serde_json::json!({"capability": cap, "book_version": version, "wants": json_wants}).to_string();
            let mut f = fields.get(&cap).cloned().unwrap_or_default();
            f.sort();
            let op = ops.get(&cap).map(|(method, path)| {
                let mut p = places.get(&cap).cloned().unwrap_or_default();
                p.sort();
                crate::openapi::Op { method: method.clone(), path: path.clone(), places: p.into_iter().map(|(_, at, n)| (at, n)).collect(), auth: Vec::new() }
            });
            let auth = creds.get(&cap).and_then(|c| c.clone().ok()).unwrap_or_default();
            let op = op.map(|o| crate::openapi::Op { auth: auth.clone(), ..o });
            Batch {
                answers: answers.get(&cap).cloned().unwrap_or_default(), template: templates.get(&cap).cloned(), tool: tools.get(&cap).cloned(), op, auth,
                fields: f.into_iter().map(|x| x.1).collect(), cap, adapter, kind, cmd, input, params, named, idem, wants,
            }
        }).collect();
        if batches.is_empty() && held.is_empty() {
            return Ok(0);
        }
        let posted = self.post.is_some() && journal.is_none();
        let runs: Vec<_> = batches.iter().map(|b| {
            let (cmd, input) = (b.cmd.clone(), b.input.clone());
            let ran: Option<Box<dyn FnOnce() -> Result<String, String> + Send>> = match b.kind.as_str() {
                "exec" => Some(Box::new(move || crate::session::run_program(&cmd, None, Some(&input), false))),
                "mcp" => {
                    let tool = b.tool.clone().unwrap_or_else(|| b.cap.clone());
                    let text = b.answers.contains(&("mcp_text".to_string(), 2));
                    let rel = b.answers.iter().map(|a| a.0.clone()).find(|r| r != "mcp_text").unwrap_or_else(|| "mcp_text".into());
                    let fields = b.fields.clone();
                    let wants: Vec<(String, serde_json::Value, Option<String>)> = b.wants.iter().zip(&b.named).zip(&b.idem).map(|((w, a), i)| (w.0.clone(), a.clone(), i.clone())).collect();
                    let auth = b.auth.clone();
                    Some(Box::new(move || crate::mcp::call(&cmd, &auth, &tool, &rel, &fields, text, &wants)))
                }
                "openapi" => {
                    let op = b.op.clone();
                    let rel = b.answers.iter().map(|a| a.0.clone()).find(|r| r != "http_body").unwrap_or_else(|| "http_body".into());
                    let fields = b.fields.clone();
                    let wants: Vec<(String, serde_json::Value, Option<String>)> = b.wants.iter().zip(&b.named).zip(&b.idem).map(|((w, a), i)| (w.0.clone(), a.clone(), i.clone())).collect();
                    let cap = b.cap.clone();
                    Some(Box::new(move || match op {
                        Some(op) => crate::openapi::call(&cmd, &op, &rel, &fields, &wants),
                        None => Err(format!("'{cap}' has no `http_op({cap}, Method, Path)`")),
                    }))
                }
                _ => None,
            };
            ran.map(|f| match self.post.as_mut().filter(|_| posted) {
                Some(p) => {
                    let (id, tx) = (p.next, p.tx.clone());
                    p.next += 1;
                    std::thread::spawn(move || {
                        let _ = tx.send((id, f()));
                    });
                    Err(id)
                }
                None => Ok(std::thread::spawn(f)),
            })
        }).collect();
        let mut src = held;
        for (b, run) in batches.into_iter().zip(runs) {
            let ran = match run {
                Some(Ok(t)) => t.join().unwrap_or_else(|_| Err("the adapter's thread failed".into())),
                Some(Err(id)) => {
                    let p = self.post.as_mut().expect("posted");
                    p.keys.extend(b.wants.iter().map(|w| w.1));
                    p.flying.insert(id, b);
                    continue;
                }
                None if b.kind == "rofl" => self.run_rofl(&b),
                None => run_sql(&b),
            };
            let b = &b;
            let out = self.answer(b, ran);
            if let Some(j) = book.as_mut() {
                for ((k, _), idem) in b.wants.iter().zip(&b.idem) {
                    let mine: String = out.lines().filter(|l| l.contains(&format!("({k},")) || l.contains(&format!("({k})"))).map(|l| format!("{l}\n")).collect();
                    if let Some(i) = idem {
                        j.write(serde_json::json!({"done": i, "out": mine}))?;
                    }
                }
            }
            src.push_str(&out);
        }
        let n = src.lines().count();
        self.load_delta(&src, None).map_err(|d| format!("an adapter's answer was refused: {}", d.join("; ")))?;
        Ok(n)
    }

    /// What has come back to the post since: each answer loaded by delta, as an evaluation would have loaded it, and
    /// what the world then wants sent. With `wait`, the first answer is waited for that long while any is in flight.
    pub fn collect(&mut self, wait: Option<std::time::Duration>) -> Result<usize, String> {
        let Some(p) = self.post.as_mut() else { return Ok(0) };
        let mut got = Vec::new();
        if let Some(w) = wait.filter(|_| !p.flying.is_empty()) {
            got.extend(p.rx.recv_timeout(w).ok());
        }
        got.extend(p.rx.try_iter());
        let mut src = String::new();
        for (id, ran) in got {
            let p = self.post.as_mut().expect("a post");
            let Some(b) = p.flying.remove(&id) else { continue };
            for w in &b.wants {
                p.keys.remove(&w.1);
            }
            src.push_str(&self.answer(&b, ran));
        }
        if src.is_empty() {
            return Ok(0);
        }
        let n = src.lines().count();
        self.load_delta(&src, None).map_err(|d| format!("an adapter's answer was refused: {}", d.join("; ")))?;
        loop {
            if self.eval.store.dirty {
                self.evaluate().map_err(|e| crate::describe(&e))?;
                break;
            }
            if self.adapter_wants()? == 0 {
                break;
            }
        }
        Ok(n)
    }

    /// D6: what grants permission is protected from rules and facts added to a running world (an agent's, through
    /// `rofl serve`): nothing new may conclude `permit` or a relation a `permit` rule reads, near or far, the rows of
    /// a want head aside. A person's approval arrives through an adapter, never as a fact typed into the world.
    pub fn guard_permit(&mut self, text: &str) -> Result<(), String> {
        let permit = self.eval.h.intern("permit");
        if !self.eval.rules.iter().any(|r| r.clause.head.rel == permit) {
            return Ok(());
        }
        let free: HashSet<crate::term::Sym> = ["want_key", "want_of", "want_arg"].into_iter().map(|r| self.eval.h.intern(r)).collect();
        let mut cone: HashSet<crate::term::Sym> = HashSet::from([permit]);
        loop {
            let mut more = Vec::new();
            for r in self.eval.rules.iter().filter(|r| cone.contains(&r.clause.head.rel)) {
                more.extend(r.clause.body.iter().flat_map(|b| b.lits_deep()).map(|l| l.rel));
            }
            let before = cone.len();
            cone.extend(more.into_iter().filter(|r| !free.contains(r)));
            if cone.len() == before {
                break;
            }
        }
        let clauses = rofl_parse::parse(&mut self.eval.h, text)?;
        match clauses.iter().find(|c| cone.contains(&c.head.rel) && crate::brk!("permit_unguarded" => false; true)) {
            Some(c) => Err(format!(
                "{}: what grants permission to send a does want is not changed in a running world; `{}` is read by `permit` (docs/intents.md D6)",
                rofl_parse::lit_src(&self.eval.h, &c.head),
                self.eval.h.name(c.head.rel)
            )),
            None => Ok(()),
        }
    }

    /// What a batch brings: its facts in the adapter's book and the outcome of each want.
    fn answer(&mut self, b: &Batch, ran: Result<String, String>) -> String {
        let fail_all = |why: &str| b.wants.iter().map(|(k, _)| format!("failed({k}, {}).\n", quote(why))).collect::<String>();
        let out = match ran {
            Ok(out) => out,
            Err(e) => return fail_all(&e),
        };
        let clauses = match rofl_parse::parse(&mut self.eval.h, &out) {
            Ok(c) => c,
            Err(e) => return fail_all(&format!("the answer of {} does not parse: {e}", b.adapter)),
        };
        let keys: HashSet<Term> = b.wants.iter().map(|w| w.1).collect();
        let (mut facts, mut done, mut said) = (String::new(), HashSet::new(), String::new());
        for c in &clauses {
            let (rel, n) = (self.eval.h.name(c.head.rel).to_string(), c.head.args.len());
            let key = c.head.args.first().copied().filter(|k| keys.contains(k));
            let plain = c.body.is_empty() && !c.want && c.lattice.is_none() && c.structure.is_none() && c.dom.is_none() && c.head.book == rofl_parse::Book::Bare;
            match (key, plain) {
                (Some(k), true) if (rel == "answered" && n == 1) || (rel == "failed" && n == 2) || (rel == "sql_snapshot" && n == 2) => {
                    done.insert(k);
                    said.push_str(&format!("{}.\n", rofl_parse::lit_src(&self.eval.h, &c.head)));
                }
                (Some(k), true) if b.answers.contains(&(rel.clone(), n)) => {
                    done.insert(k);
                    let lit = rofl_parse::lit_src(&self.eval.h, &c.head);
                    facts.push_str(&format!("{rel}[{}]{}.\n", b.adapter, &lit[rel.len()..]));
                    said.push_str(&format!("answered({}).\n", self.src(k)));
                }
                _ => return fail_all(&format!("{} answered outside what '{}' answers in: {rel}/{n}", b.adapter, b.cap)),
            }
        }
        let lost: String = b.wants.iter().filter(|w| !done.contains(&w.1)).map(|(k, _)| format!("{}({k}).\n", crate::brk!("adapter_lost_answered" => "answered"; "outcome_unknown"))).collect();
        let mut said: Vec<&str> = said.lines().collect();
        said.sort();
        said.dedup();
        format!("{facts}{}\n{lost}", said.join("\n"))
    }

    /// A `rofl` batch (scenario 5): the adapter is another world, its files the address, evaluated once a process
    /// while they are unchanged. A want of a capability answering in `Rel/N` asks that world `Rel` with the want's
    /// arguments as its first columns, and each row comes back as `Rel(K, Columns...)` in the adapter's book: the why
    /// of an answer stops at that boundary.
    fn run_rofl(&mut self, b: &Batch) -> Result<String, String> {
        thread_local! {
            static WORLDS: std::cell::RefCell<HashMap<String, Session>> = Default::default();
        }
        let mut rels = b.answers.iter();
        let (Some((rel, arity)), None) = (rels.next(), rels.next()) else {
            return Err(format!("a rofl capability answers in one relation; '{}' declares {}", b.cap, b.answers.len()));
        };
        let mut text = String::new();
        for f in b.cmd.split_whitespace() {
            text.push_str(&std::fs::read_to_string(f).map_err(|e| format!("{f}: {e}"))?);
            text.push('\n');
        }
        let stamp = format!("{}\n{:016x}", b.cmd, text.bytes().fold(0xcbf29ce484222325u64, |h, c| (h ^ c as u64).wrapping_mul(0x100000001b3)));
        let mut queries = Vec::new();
        for (key, k) in &b.wants {
            let given: Vec<String> = match k.kind() {
                TermK::Func(i) => self.eval.h.fargs(i)[1..].iter().map(|a| self.src(*a)).collect(),
                _ => Vec::new(),
            };
            if given.len() + 1 > *arity {
                return Err(format!("'{}' gives {} argument(s), {rel}/{arity} has {} column(s) after the key", b.cap, given.len(), arity - 1));
            }
            let free: Vec<String> = (given.len() + 1..*arity).map(|i| format!("V{i}")).collect();
            queries.push((key.clone(), given.clone(), format!("{rel}({})", given.iter().chain(&free).cloned().collect::<Vec<_>>().join(", "))));
        }
        WORLDS.with(|w| {
            let mut w = w.borrow_mut();
            if !w.contains_key(&stamp) {
                let mut s = Session::fresh(self.eval.budget);
                s.load(&text, None).map_err(|d| format!("the world of {}: {}", b.adapter, d.join("; ")))?;
                s.evaluate().map_err(|e| format!("the world of {}: {}", b.adapter, crate::describe(&e)))?;
                w.insert(stamp.clone(), s);
            }
            let s = w.get_mut(&stamp).expect("just kept");
            let mut out = String::new();
            for (key, given, q) in &queries {
                let a = s.ask(q)?;
                if a.partial {
                    out.push_str(&format!("failed({key}, {}).\n", quote(&format!("the world of {} answers {q} only in part", b.adapter))));
                    continue;
                }
                for row in &a.rows {
                    out.push_str(&format!("{rel}({key}, {}).\n", given.iter().chain(row).cloned().collect::<Vec<_>>().join(", ")));
                }
                if a.rows.is_empty() {
                    out.push_str(&format!("answered({key}).\n"));
                }
            }
            Ok(out)
        })
    }

    fn src(&self, t: Term) -> String {
        let mut s = String::new();
        rofl_parse::src_term(&self.eval.h, t, &mut s);
        s
    }

    fn json(&self, t: Term) -> serde_json::Value {
        match t.kind() {
            TermK::Int(v) => v.into(),
            TermK::Atom(x) | TermK::Str(x) => self.eval.h.name(x).into(),
            _ => self.src(t).into(),
        }
    }

    /// The rows of the adapter's book that make this capability what it is, as one digest.
    fn book_version(&mut self, adapter: &str, cap: &str) -> String {
        let main = self.eval.v.main;
        let mut lines = Vec::new();
        for (rel, n, of) in [("adapter", 3, adapter), ("capability", 3, cap), ("arg", 4, cap), ("answers", 3, cap), ("idempotent", 2, cap),
            ("mcp_tool", 2, cap), ("mcp_arg", 3, cap), ("mcp_field", 3, cap), ("http_op", 3, cap), ("http_in", 4, cap), ("http_field", 3, cap), ("http_needs", 2, cap), ("http_auth", 5, adapter)] {
            let r = self.eval.h.intern(rel);
            for f in self.eval.store.rel_persp(&self.eval.h, r, main) {
                let a = self.eval.store.args(f).to_vec();
                if a.len() == n && a[0].as_atom().is_some_and(|x| self.eval.h.name(x) == of) {
                    lines.push(format!("{rel}({})", a.iter().map(|t| self.src(*t)).collect::<Vec<_>>().join(", ")));
                }
            }
        }
        lines.sort();
        let h = lines.join("\n").bytes().fold(0xcbf29ce484222325u64, |h, b| (h ^ b as u64).wrapping_mul(0x100000001b3));
        format!("{h:016x}")
    }
}

/// A sql batch (docs/intents.md 4.3): each want's arguments bound to the parameters of its capability's `query`
/// template, never written into it, every query of the batch in one read transaction on the adapter's kept
/// connection, read-only, and each want stamped with the database's `data_version` there (`sql_snapshot(K, N)`).
/// Answered in the text an exec program prints.
#[cfg(not(feature = "sql"))]
fn run_sql(_: &Batch) -> Result<String, String> {
    Err("this build has no sql adapter (cargo feature `sql`)".into())
}

#[cfg(feature = "sql")]
fn run_sql(b: &Batch) -> Result<String, String> {
    use rusqlite::types::{Value, ValueRef};
    use std::sync::{Mutex, OnceLock};
    static KEPT: OnceLock<Mutex<HashMap<String, rusqlite::Connection>>> = OnceLock::new();
    let template = b.template.as_deref().ok_or_else(|| format!("'{}' has no `query({}, Template)`", b.cap, b.cap))?;
    let mut rels = b.answers.iter();
    let (Some((rel, arity)), None) = (rels.next(), rels.next()) else {
        return Err(format!("a sql capability answers in one relation; '{}' declares {}", b.cap, b.answers.len()));
    };
    let mut kept = KEPT.get_or_init(Default::default).lock().map_err(|_| "the kept connections are poisoned".to_string())?;
    if !kept.contains_key(&b.cmd) {
        let c = rusqlite::Connection::open_with_flags(&b.cmd, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| format!("{}: {e}", b.cmd))?;
        kept.insert(b.cmd.clone(), c);
    }
    let conn = kept.get_mut(&b.cmd).expect("just kept");
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let version: i64 = tx.query_row("PRAGMA data_version", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let mut out = String::new();
    for ((key, _), params) in b.wants.iter().zip(&b.params) {
        let bound: Vec<Value> = params.iter().map(|v| match v {
            serde_json::Value::Number(n) => n.as_i64().map_or(Value::Text(n.to_string()), Value::Integer),
            serde_json::Value::String(s) => Value::Text(s.clone()),
            v => Value::Text(v.to_string()),
        }).collect();
        let text = crate::brk!("sql_arguments_spliced" => bound.iter().enumerate().rev().fold(template.to_string(), |t, (i, v)| {
            t.replace(&format!("?{}", i + 1), &format!("'{}'", match v { Value::Text(s) => s.clone(), Value::Integer(n) => n.to_string(), _ => String::new() }))
        }); template.to_string());
        let mut st = tx.prepare(&text).map_err(|e| format!("the query of '{}': {e}", b.cap))?;
        let cols = st.column_count();
        if cols + 1 != *arity {
            return Err(format!("the query of '{}' gives {cols} column(s), {rel}/{arity} takes {}", b.cap, arity - 1));
        }
        let bound: &[Value] = if text == template { &bound } else { &[] };
        let mut rows = st.query(rusqlite::params_from_iter(bound.iter())).map_err(|e| format!("the query of '{}': {e}", b.cap))?;
        let mut any = false;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            any = true;
            let mut line = format!("{rel}({key}");
            for i in 0..cols {
                line.push_str(", ");
                match row.get_ref(i).map_err(|e| e.to_string())? {
                    ValueRef::Integer(n) => line.push_str(&n.to_string()),
                    ValueRef::Real(f) => line.push_str(&quote(&f.to_string())),
                    ValueRef::Text(t) => line.push_str(&quote(&String::from_utf8_lossy(t))),
                    ValueRef::Null => line.push_str("null"),
                    ValueRef::Blob(_) => return Err(format!("the query of '{}' gave a blob, which no fact holds", b.cap)),
                }
            }
            out.push_str(&line);
            out.push_str(").\n");
        }
        if !any {
            out.push_str(&format!("answered({key}).\n"));
        }
        out.push_str(&format!("sql_snapshot({key}, {version}).\n"));
    }
    Ok(out)
}

/// THE POST (D3): where a world's wants go when its caller does not wait for them. A batch for a program or a server
/// is sent on a thread of its own and the evaluation goes on; what it brings comes back to the inbox, and `collect`
/// loads it by delta whenever it has come. A want in flight is neither sent again nor settled: `pending(W)` holds.
/// A database and another world in this process are answered at once, as without a post.
pub struct Post {
    tx: std::sync::mpsc::Sender<(u64, Result<String, String>)>,
    rx: std::sync::mpsc::Receiver<(u64, Result<String, String>)>,
    next: u64,
    flying: HashMap<u64, Batch>,
    keys: HashSet<Term>,
}

impl Default for Post {
    fn default() -> Self {
        let (tx, rx) = std::sync::mpsc::channel();
        Post { tx, rx, next: 0, flying: HashMap::new(), keys: HashSet::new() }
    }
}

impl Post {
    /// How many wants are in flight.
    pub fn flying(&self) -> usize {
        self.keys.len()
    }
}

/// The journal of `does` (D5): history, not cache. One JSON object a line, `{"sent": K, "want": W}` before a want
/// goes and `{"done": K, "out": Text}` after, the text the facts its outcome loaded; each line on the disk before
/// anything follows it.
struct Journal {
    file: std::fs::File,
    sent: HashSet<String>,
    done: HashMap<String, String>,
}

impl Journal {
    fn open(dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        let path = dir.join("does.journal");
        let (mut sent, mut done) = (HashSet::new(), HashMap::new());
        for line in std::fs::read_to_string(&path).unwrap_or_default().lines() {
            let v: serde_json::Value = serde_json::from_str(line).map_err(|e| format!("{}: a line that is not JSON: {e}", path.display()))?;
            if let Some(k) = v.get("sent").and_then(|k| k.as_str()) {
                sent.insert(k.to_string());
            }
            if let (Some(k), Some(out)) = (v.get("done").and_then(|k| k.as_str()), v.get("out").and_then(|o| o.as_str())) {
                done.insert(k.to_string(), out.to_string());
            }
        }
        let file = std::fs::OpenOptions::new().create(true).append(true).open(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        Ok(Journal { file, sent, done })
    }

    fn write(&mut self, v: serde_json::Value) -> Result<(), String> {
        writeln!(self.file, "{v}").and_then(|_| self.file.sync_data()).map_err(|e| format!("the journal of does: {e}"))
    }
}

fn idem_key(want: &str, version: &str) -> String {
    let h = format!("{want}\n{version}").bytes().fold(0xcbf29ce484222325u64, |h, b| (h ^ b as u64).wrapping_mul(0x100000001b3));
    format!("{h:016x}")
}

/// An argument as its declared type sends it to an mcp tool: `json` parsed, an `atom` true or false a boolean.
fn typed(v: serde_json::Value, ty: &str) -> serde_json::Value {
    match (ty, v.as_str()) {
        ("json", Some(s)) => serde_json::from_str(s).unwrap_or(v),
        ("atom", Some("true")) => true.into(),
        ("atom", Some("false")) => false.into(),
        _ => v,
    }
}

fn quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

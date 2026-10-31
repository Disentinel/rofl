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

#[cfg(feature = "net")]
fn signed_in(issuer: &str) -> bool {
    crate::login::signed_in(issuer)
}

#[cfg(not(feature = "net"))]
fn signed_in(_: &str) -> bool {
    false
}
use crate::session::Session;
use crate::term::{Term, TermK};

/// The wants of one capability an evaluation sends when its book declares no `max_wants(Cap, N)`.
pub const MAX_WANTS: i64 = 1000;

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
    /// The column of an answer that holds when the thing happened (`event_time(Cap, Column)`), counting the key as 1.
    event: Option<usize>,
}

impl Batch {
    fn sole_answer(&self, kind: &str) -> Result<&(String, usize), String> {
        let mut rels = self.answers.iter();
        match (rels.next(), rels.next()) {
            (Some(a), None) => Ok(a),
            _ => Err(format!("a {kind} capability answers in one relation; '{}' declares {}", self.cap, self.answers.len())),
        }
    }

    fn wants_named(&self) -> Vec<(String, serde_json::Value, Option<String>)> {
        self.wants.iter().zip(&self.named).zip(&self.idem).map(|((w, a), i)| (w.0.clone(), a.clone(), i.clone())).collect()
    }
}

/// The rows of the adapter book a send reads: what each capability is and where its wants go, and how they are sent.
struct AdapterBook {
    caps: HashMap<String, (String, String)>,
    adapters: HashMap<String, (String, String)>,
    arg_names: HashMap<(String, i64), (String, String)>,
    tools: HashMap<String, String>,
    wire: HashMap<(String, i64), String>,
    places: HashMap<String, Vec<(i64, String, String)>>,
    keys_of: HashMap<String, Vec<(String, String, String, String)>>,
    needs: HashMap<String, Vec<String>>,
    ops: HashMap<String, (String, String)>,
    fields: HashMap<String, Vec<(i64, String)>>,
    answers: HashMap<String, HashSet<(String, usize)>>,
    events: HashMap<String, usize>,
    args: HashMap<Term, Vec<(i64, Term)>>,
    limits: HashMap<String, i64>,
    templates: HashMap<String, String>,
}

impl AdapterBook {
    fn read(s: &mut Session) -> AdapterBook {
        let caps = rows(s, "capability", 3).into_iter().map(|c| (name(s, c[0]), (name(s, c[1]), name(s, c[2])))).collect();
        let adapters = rows(s, "adapter", 3).into_iter().map(|a| (name(s, a[0]), (name(s, a[1]), name(s, a[2])))).collect();
        let mut arg_names = HashMap::new();
        for a in rows(s, "arg", 4) {
            if let Some(p) = a[1].as_int() {
                arg_names.insert((name(s, a[0]), p), (name(s, a[2]), name(s, a[3])));
            }
        }
        let tools = rows(s, "mcp_tool", 2).into_iter().map(|t| (name(s, t[0]), name(s, t[1]))).collect();
        let mut wire = HashMap::new();
        for a in rows(s, "mcp_arg", 3) {
            if let Some(p) = a[1].as_int() {
                wire.insert((name(s, a[0]), p), name(s, a[2]));
            }
        }
        let mut places: HashMap<String, Vec<(i64, String, String)>> = HashMap::new();
        for a in rows(s, "http_in", 4) {
            if let Some(p) = a[1].as_int() {
                wire.insert((name(s, a[0]), p), name(s, a[3]));
                places.entry(name(s, a[0])).or_default().push((p, name(s, a[2]), name(s, a[3])));
            }
        }
        let mut keys_of: HashMap<String, Vec<(String, String, String, String)>> = HashMap::new();
        for a in rows(s, "http_auth", 5) {
            keys_of.entry(name(s, a[0])).or_default().push((name(s, a[1]), name(s, a[2]), name(s, a[3]), name(s, a[4])));
        }
        let mut needs: HashMap<String, Vec<String>> = HashMap::new();
        for n in rows(s, "http_needs", 2) {
            needs.entry(name(s, n[0])).or_default().push(name(s, n[1]));
        }
        let ops = rows(s, "http_op", 3).into_iter().map(|o| (name(s, o[0]), (name(s, o[1]), name(s, o[2])))).collect();
        let mut fields: HashMap<String, Vec<(i64, String)>> = HashMap::new();
        for f in rows(s, "mcp_field", 3).into_iter().chain(rows(s, "http_field", 3)) {
            if let Some(p) = f[1].as_int() {
                fields.entry(name(s, f[0])).or_default().push((p, name(s, f[2])));
            }
        }
        let mut answers: HashMap<String, HashSet<(String, usize)>> = HashMap::new();
        for a in rows(s, "answers", 3) {
            if let Some(n) = a[2].as_int() {
                answers.entry(name(s, a[0])).or_default().insert((name(s, a[1]), n as usize));
            }
        }
        let events = rows(s, "event_time", 2).into_iter().filter_map(|e| Some((name(s, e[0]), e[1].as_int().filter(|c| *c > 1)? as usize))).collect();
        let mut args: HashMap<Term, Vec<(i64, Term)>> = HashMap::new();
        for a in rows(s, "want_arg", 3) {
            if let Some(i) = a[1].as_int() {
                args.entry(a[0]).or_default().push((i, a[2]));
            }
        }
        let limits = rows(s, "max_wants", 2).into_iter().filter_map(|m| Some((name(s, m[0]), m[1].as_int()?))).collect();
        let templates = rows(s, "query", 2).into_iter().map(|q| (name(s, q[0]), name(s, q[1]))).collect();
        AdapterBook { caps, adapters, arg_names, tools, wire, places, keys_of, needs, ops, fields, answers, events, args, limits, templates }
    }
}

/// The credentials a capability's calls carry: (how, name, value) of each declared key it needs.
type Creds = Vec<(String, String, String)>;

/// What a send picks: the outcomes its journal holds and the reasons held, the wants of each capability, the ids the
/// journal writes them by, and the credentials of each capability that needs some.
#[derive(Default)]
struct Picked {
    held: String,
    by_cap: BTreeMap<String, Vec<Term>>,
    idems: HashMap<Term, String>,
    creds: HashMap<String, Result<Creds, String>>,
}

/// The rows of relation `rel` at arity `n` in the main book, as their argument lists.
fn rows(s: &mut Session, rel: &str, n: usize) -> Vec<Vec<Term>> {
    let main = s.eval.v.main;
    let r = s.eval.h.intern(rel);
    s.eval.store.rel_persp(&s.eval.h, r, main).into_iter().map(|f| s.eval.store.args(f).to_vec()).filter(|a| a.len() == n).collect()
}

fn name(s: &Session, t: Term) -> String {
    match t.kind() {
        TermK::Atom(x) | TermK::Str(x) => s.eval.h.name(x).to_string(),
        _ => s.eval.h.canon(t),
    }
}

/// Whether the journal settles a want: its outcome is held, or it was sent with none recorded, which makes it
/// `outcome_unknown`. Either way the want is not sent again.
fn journal_settles(j: &mut Journal, idem: &str, text: &str, trust: bool, held: &mut String) -> Result<bool, String> {
    if let Some(out) = j.done.get(idem).filter(|_| trust) {
        held.push_str(out);
        return Ok(true);
    }
    if trust && j.sent.contains(idem) {
        let out = format!("outcome_unknown({text}).\n");
        j.write(serde_json::json!({"done": idem, "out": out}))?;
        held.push_str(&out);
        return Ok(true);
    }
    Ok(false)
}

fn want_held(held: &mut String, text: &str, why: &str) {
    held.push_str(&format!("want_held({text}, {}).\n", quote(why)));
}

/// The credentials a capability's calls carry, read from the environment or from a sign-in, never from the world.
fn credentials(book: &AdapterBook, adapter: &str, cap: &str, kind: Option<&str>) -> Result<Creds, String> {
    let declared = book.keys_of.get(adapter).cloned().unwrap_or_default();
    let wanted: Vec<_> = match book.needs.get(cap) {
        Some(n) => declared.into_iter().filter(|d| n.contains(&d.0)).collect(),
        None if kind == Some("mcp") => declared,
        None => Vec::new(),
    };
    wanted
        .into_iter()
        .map(|(scheme, how, n, env)| match std::env::var(&env).ok().filter(|v| !v.is_empty() && crate::brk!("http_key_ignored" => false; true)) {
            _ if how == "login" && signed_in(&n) => Ok((how, n, String::new())),
            _ if how == "login" => Err(format!("declared, not connected: no one has signed in to {n} here (the key of {scheme} for {adapter}): a person runs `rofl adapter login {n}`")),
            Some(v) => Ok((how, n, v)),
            None => Err(format!("declared, not connected: the environment has no {env} (the key of {scheme} for {adapter})")),
        })
        .collect()
}

/// The program a batch runs on a thread; `None` for the kinds the answer runs itself (`rofl`, `sql`).
fn runner(b: &Batch) -> Option<Box<dyn FnOnce() -> Result<String, String> + Send>> {
    let (cmd, input) = (b.cmd.clone(), b.input.clone());
    match b.kind.as_str() {
        "exec" => Some(Box::new(move || crate::session::run_program(&cmd, None, Some(&input), false))),
        "mcp" => {
            let tool = b.tool.clone().unwrap_or_else(|| b.cap.clone());
            let text = b.answers.contains(&("mcp_text".to_string(), 2));
            let rel = b.answers.iter().map(|a| a.0.clone()).find(|r| r != "mcp_text").unwrap_or_else(|| "mcp_text".into());
            let fields = b.fields.clone();
            let wants = b.wants_named();
            let auth = b.auth.clone();
            Some(Box::new(move || crate::mcp::call(&cmd, &auth, &tool, &rel, &fields, text, &wants)))
        }
        "openapi" => {
            let op = b.op.clone();
            let rel = b.answers.iter().map(|a| a.0.clone()).find(|r| r != "http_body").unwrap_or_else(|| "http_body".into());
            let fields = b.fields.clone();
            let wants = b.wants_named();
            let cap = b.cap.clone();
            Some(Box::new(move || match op {
                Some(op) => crate::openapi::call(&cmd, &op, &rel, &fields, &wants),
                None => Err(format!("'{cap}' has no `http_op({cap}, Method, Path)`")),
            }))
        }
        _ => None,
    }
}

/// Records each want's outcome of a batch in the journal: the lines of the answer that name it.
fn record_outcomes(j: &mut Journal, b: &Batch, out: &str) -> Result<(), String> {
    for ((k, _), idem) in b.wants.iter().zip(&b.idem) {
        if let Some(i) = idem {
            let mine: String = out.lines().filter(|l| l.contains(&format!("({k},")) || l.contains(&format!("({k})"))).map(|l| format!("{l}\n")).collect();
            j.write(serde_json::json!({"done": i, "out": mine}))?;
        }
    }
    Ok(())
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
        let adapters = AdapterBook::read(self);
        let mut picked = self.pick(&adapters, &mut book, &settled, &permitted, wants)?;
        let by_cap = std::mem::take(&mut picked.by_cap);
        let by_cap: Vec<(String, Vec<Term>)> = if crate::brk!("adapter_one_call_per_want" => true; false) {
            by_cap.into_iter().flat_map(|(c, ks)| ks.into_iter().map(move |k| (c.clone(), vec![k]))).collect()
        } else {
            by_cap.into_iter().collect()
        };
        let batches: Vec<Batch> = by_cap.into_iter().map(|(cap, keys)| self.batch(&adapters, &picked, cap, keys)).collect();
        if batches.is_empty() && picked.held.is_empty() {
            return Ok(0);
        }
        let posted = self.post.is_some() && journal.is_none();
        let runs: Vec<_> = batches.iter().map(|b| self.launch(b, posted)).collect();
        let mut src = picked.held;
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
            let out = self.answer(&b, ran);
            if let Some(j) = book.as_mut() {
                record_outcomes(j, &b, &out)?;
            }
            src.push_str(&out);
        }
        let n = src.lines().count();
        self.load_delta(&src, None).map_err(|d| format!("an adapter's answer was refused: {}", d.join("; ")))?;
        Ok(n)
    }

    /// Picks the wants a send sends: each `reads` want not yet settled (and, through a journal, each permitted `does`
    /// want), with the outcomes the journal already holds and the reasons a want cannot be sent held as rows.
    fn pick(&mut self, book: &AdapterBook, journal: &mut Option<Journal>, settled: &HashSet<Term>, permitted: &HashSet<Term>, wants: Vec<Vec<Term>>) -> Result<Picked, String> {
        let trust = crate::brk!("does_journal_ignored" => false; true);
        let mut picked = Picked::default();
        for w in wants {
            let (key, cap) = (w[0], name(self, w[1]));
            let Some((adapter, class)) = book.caps.get(&cap) else { continue };
            let wanted = if journal.is_none() {
                class == "reads" || crate::brk!("mcp_does_sent" => class == "does"; false)
            } else {
                class == "does" && (permitted.contains(&key) || crate::brk!("does_unpermitted_sent" => true; false))
            };
            if settled.contains(&key) || !wanted {
                continue;
            }
            let text = self.src(key);
            if let Some(j) = journal.as_mut() {
                let idem = idem_key(&text, &self.book_version(adapter, &cap));
                if journal_settles(j, &idem, &text, trust, &mut picked.held)? {
                    continue;
                }
                picked.idems.insert(key, idem);
            }
            let kind = book.adapters.get(adapter).map(|a| a.0.as_str());
            if matches!(kind, Some("openapi" | "mcp")) && !picked.creds.contains_key(&cap) {
                let got = credentials(book, adapter, &cap, kind);
                picked.creds.insert(cap.clone(), got);
            }
            match kind {
                Some("openapi" | "mcp") if picked.creds[&cap].is_err() => {
                    let why = picked.creds[&cap].clone().unwrap_err();
                    want_held(&mut picked.held, &text, &why);
                }
                Some("sql") if !cfg!(feature = "sql") => want_held(&mut picked.held, &text, "this build has no sql adapter (cargo feature `sql`)"),
                Some("openapi") if !cfg!(feature = "net") => want_held(&mut picked.held, &text, "this build has no http (cargo feature `net`)"),
                Some("exec" | "sql" | "mcp" | "rofl" | "openapi") => {
                    let limit = book.limits.get(&cap).copied().unwrap_or(MAX_WANTS);
                    let sent = self.sent.0.entry(cap.clone()).or_default();
                    if *sent >= limit && crate::brk!("max_wants_ignored" => false; true) {
                        want_held(&mut picked.held, &text, &format!("over the limit of {limit} wants of {cap} an evaluation: raise it in the adapter's book, max_wants({cap}, N)"));
                        self.sent.1 = true;
                        continue;
                    }
                    *sent += 1;
                    if let (Some(j), Some(idem)) = (journal.as_mut(), picked.idems.get(&key)) {
                        j.write(serde_json::json!({"sent": idem, "want": text}))?;
                    }
                    picked.by_cap.entry(cap).or_default().push(key)
                }
                kind => {
                    let why = kind.map_or(format!("no adapter '{adapter}' is declared (`adapter({adapter}, Kind, Address)`)"), |k| format!("an adapter of kind {k} is not built yet"));
                    want_held(&mut picked.held, &text, &why);
                }
            }
        }
        Ok(picked)
    }

    /// The batch of one capability: its wants by their text, the program's input that carries them, and what it answers.
    fn batch(&mut self, book: &AdapterBook, picked: &Picked, cap: String, mut keys: Vec<Term>) -> Batch {
        keys.sort_by_key(|k| self.src(*k));
        let adapter = book.caps[&cap].0.clone();
        let (kind, cmd) = book.adapters[&adapter].clone();
        let wants: Vec<(String, Term)> = keys.iter().map(|k| (self.src(*k), *k)).collect();
        let idem: Vec<Option<String>> = keys.iter().map(|k| picked.idems.get(k).cloned()).collect();
        let (mut params, mut named, mut json_wants) = (Vec::new(), Vec::new(), Vec::new());
        for ((text, k), idem) in wants.iter().zip(&idem) {
            let (p, n, j) = self.want_json(book, &cap, *k, text, idem.as_ref());
            params.push(p);
            named.push(n);
            json_wants.push(j);
        }
        let version = self.book_version(&adapter, &cap);
        let input = serde_json::json!({"capability": cap, "book_version": version, "wants": json_wants}).to_string();
        let mut f = book.fields.get(&cap).cloned().unwrap_or_default();
        f.sort();
        let auth = picked.creds.get(&cap).and_then(|c| c.clone().ok()).unwrap_or_default();
        let op = book.ops.get(&cap).map(|(method, path)| {
            let mut p = book.places.get(&cap).cloned().unwrap_or_default();
            p.sort();
            crate::openapi::Op { method: method.clone(), path: path.clone(), places: p.into_iter().map(|(_, at, n)| (at, n)).collect(), auth: auth.clone() }
        });
        Batch {
            answers: book.answers.get(&cap).cloned().unwrap_or_default(),
            event: book.events.get(&cap).copied(),
            template: book.templates.get(&cap).cloned(),
            tool: book.tools.get(&cap).cloned(),
            op,
            fields: f.into_iter().map(|x| x.1).collect(),
            auth,
            cap,
            adapter,
            kind,
            cmd,
            input,
            params,
            named,
            idem,
            wants,
        }
    }

    /// One want as its program reads it: its parameters in order, its named arguments as they go on the wire, and the
    /// want itself.
    fn want_json(&self, book: &AdapterBook, cap: &str, key: Term, text: &str, idem: Option<&String>) -> (Vec<serde_json::Value>, serde_json::Value, serde_json::Value) {
        let mut a = book.args.get(&key).cloned().unwrap_or_default();
        a.sort_by_key(|x| x.0);
        let params = a.iter().map(|(_, v)| self.json(*v)).collect();
        let arg = |i: i64| book.arg_names.get(&(cap.to_string(), i)).cloned().unwrap_or_else(|| (i.to_string(), String::new()));
        let on_wire = |i: i64| book.wire.get(&(cap.to_string(), i)).cloned().unwrap_or_else(|| arg(i).0);
        let named = a.iter().map(|(i, v)| (on_wire(*i), typed(self.json(*v), &arg(*i).1))).collect();
        let by_name: serde_json::Map<String, serde_json::Value> = a.iter().map(|(i, v)| (arg(*i).0, self.json(*v))).collect();
        let want = match idem {
            Some(i) => serde_json::json!({"key": text, "args": by_name, "idempotency_key": i}),
            None => serde_json::json!({"key": text, "args": by_name}),
        };
        (params, named, want)
    }

    /// Starts a batch's program: on a thread, or, for a post, on one that sends its answer to the post's channel.
    fn launch(&mut self, b: &Batch, posted: bool) -> Option<Result<std::thread::JoinHandle<Result<String, String>>, u64>> {
        let run = runner(b)?;
        Some(match self.post.as_mut().filter(|_| posted) {
            Some(p) => {
                let (id, tx) = (p.next, p.tx.clone());
                p.next += 1;
                std::thread::spawn(move || {
                    let _ = tx.send((id, run()));
                });
                Err(id)
            }
            None => Ok(std::thread::spawn(run)),
        })
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
                    let mut head = c.head.clone();
                    if let Some(col) = b.event.filter(|col| *col <= n && crate::brk!("event_time_raw" => false; true)) {
                        let at = head.args[col - 1];
                        let instant = match at.kind() { TermK::Str(x) => utc(self.eval.h.name(x)), _ => None };
                        match instant {
                            Some((t, ms)) => {
                                head.args[col - 1] = self.eval.h.string(&t);
                                said.push_str(&format!("instant({}, {ms}).\n", quote(&t)));
                            }
                            None => {
                                said.push_str(&format!("failed({}, {}).\n", self.src(k), quote(&format!("{} answered {} in column {col} of {rel}, which its book says is when it happened: not a time (ISO 8601 with a zone, or a date)", b.adapter, self.src(at)))));
                                continue;
                            }
                        }
                    }
                    let lit = rofl_parse::lit_src(&self.eval.h, &head);
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

    /// A `rofl` batch (scenario 5): the adapter is another world. Its address is that world's files, evaluated once a
    /// process while they are unchanged, or a command that serves it, `rofl serve FILE...` here or `ssh HOST rofl serve
    /// FILE...` on another machine, started once a process and asked its session 1 each round: a served world that
    /// changed answers as it now stands. A want of a capability answering in `Rel/N` asks that world `Rel` with the
    /// want's arguments as its first columns, and each row comes back as `Rel(K, Columns...)` in the adapter's book:
    /// the why of an answer stops at that boundary.
    fn run_rofl(&mut self, b: &Batch) -> Result<String, String> {
        thread_local! {
            static WORLDS: std::cell::RefCell<HashMap<String, Session>> = Default::default();
            static SERVED: std::cell::RefCell<HashMap<String, Served>> = Default::default();
        }
        let (rel, arity) = b.sole_answer("rofl")?;
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
        let mut out = String::new();
        let mut put = |key: &str, given: &[String], q: &str, rows: Vec<Vec<String>>, partial: bool| {
            if partial {
                out.push_str(&format!("failed({key}, {}).\n", quote(&format!("the world of {} answers {q} only in part", b.adapter))));
                return;
            }
            for row in &rows {
                out.push_str(&format!("{rel}({key}, {}).\n", given.iter().chain(row).cloned().collect::<Vec<_>>().join(", ")));
            }
            if rows.is_empty() {
                out.push_str(&format!("answered({key}).\n"));
            }
        };
        if !b.cmd.split_whitespace().all(|f| f.ends_with(".rofl") || f.ends_with(".rofl.md")) {
            SERVED.with(|w| -> Result<(), String> {
                let mut w = w.borrow_mut();
                if !w.contains_key(&b.cmd) {
                    w.insert(b.cmd.clone(), Served::start(&b.cmd)?);
                }
                let s = w.get_mut(&b.cmd).expect("just kept");
                for (key, given, q) in &queries {
                    match s.ask(q) {
                        Ok((rows, partial)) => put(key, given, q, rows, partial),
                        Err(e) => {
                            w.remove(&b.cmd);
                            return Err(format!("the world {} serves: {e}", b.adapter));
                        }
                    }
                }
                Ok(())
            })?;
            return Ok(out);
        }
        let mut text = String::new();
        for f in b.cmd.split_whitespace() {
            text.push_str(&std::fs::read_to_string(f).map_err(|e| format!("{f}: {e}"))?);
            text.push('\n');
        }
        let stamp = format!("{}\n{:016x}", b.cmd, text.bytes().fold(0xcbf29ce484222325u64, |h, c| (h ^ c as u64).wrapping_mul(0x100000001b3)));
        WORLDS.with(|w| {
            let mut w = w.borrow_mut();
            if !w.contains_key(&stamp) {
                let mut s = Session::fresh(self.eval.budget);
                s.load(&text, None).map_err(|d| format!("the world of {}: {}", b.adapter, d.join("; ")))?;
                s.evaluate().map_err(|e| format!("the world of {}: {}", b.adapter, crate::describe(&e)))?;
                w.insert(stamp.clone(), s);
            }
            let s = w.get_mut(&stamp).expect("just kept");
            for (key, given, q) in &queries {
                let a = s.ask(q)?;
                put(key, given, q, a.rows, a.partial);
            }
            Ok::<(), String>(())
        })?;
        Ok(out)
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
    let (rel, arity) = b.sole_answer("sql")?;
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

/// A world another process serves (`rofl serve FILE...`), spoken to in its protocol: one JSON line out, one in.
struct Served {
    _child: std::process::Child,
    to: std::process::ChildStdin,
    from: std::io::BufReader<std::process::ChildStdout>,
}

impl Served {
    fn start(cmd: &str) -> Result<Served, String> {
        let mut argv = cmd.split_whitespace();
        let prog = argv.next().ok_or("an empty command")?;
        let mut child = std::process::Command::new(prog).args(argv).stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null()).spawn().map_err(|e| format!("{prog}: {e}"))?;
        let to = child.stdin.take().expect("piped");
        let from = std::io::BufReader::new(child.stdout.take().expect("piped"));
        Ok(Served { _child: child, to, from })
    }

    /// The rows of `q` in the served world's session 1, and whether they are partial.
    fn ask(&mut self, q: &str) -> Result<(Vec<Vec<String>>, bool), String> {
        use std::io::BufRead;
        writeln!(self.to, "{}", serde_json::json!({"op": "ask", "session": crate::brk!("served_other_session" => 2; 1), "query": q})).map_err(|e| e.to_string())?;
        let mut line = String::new();
        if self.from.read_line(&mut line).map_err(|e| e.to_string())? == 0 {
            return Err("it ended without an answer".into());
        }
        let a: serde_json::Value = serde_json::from_str(&line).map_err(|e| format!("not an answer of rofl serve: {e}"))?;
        if a["ok"] != serde_json::Value::Bool(true) {
            return Err(a["error"].as_str().unwrap_or("refused").to_string());
        }
        let rows = a["rows"].as_array().into_iter().flatten()
            .map(|r| r.as_array().into_iter().flatten().map(|c| c.as_str().unwrap_or_default().to_string()).collect()).collect();
        Ok((rows, a["partial"].as_bool().unwrap_or(false)))
    }
}

/// An ISO 8601 time as one instant: its text in UTC, `YYYY-MM-DDTHH:MM:SS.sssZ`, the same for every source, and its
/// milliseconds since 1970, which rules order with `<`. A date is its midnight in UTC; a time of day needs its zone
/// (`Z` or `+HH:MM`), since without one it is no instant.
fn utc(s: &str) -> Option<(String, i64)> {
    let num = |t: &str| -> Option<i64> { (!t.is_empty() && t.bytes().all(|b| b.is_ascii_digit())).then(|| t.parse().ok()).flatten() };
    let (date, rest) = (s.get(..10)?, &s[10.min(s.len())..]);
    let (y, m, d) = (num(date.get(0..4)?)?, num(date.get(5..7)?)?, num(date.get(8..10)?)?);
    if date.as_bytes()[4] != b'-' || date.as_bytes()[7] != b'-' || !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let (mut secs, mut ms) = (0i64, 0i64);
    if !rest.is_empty() {
        let rest = rest.strip_prefix(['T', 't', ' '])?;
        let z = rest.find(['Z', 'z', '+', '-'])?;
        let (clock, zone) = rest.split_at(z);
        let (hms, frac) = clock.split_once('.').unwrap_or((clock, ""));
        let p: Vec<&str> = hms.split(':').collect();
        let (h, mi, sec) = match p[..] {
            [h, mi] => (num(h)?, num(mi)?, 0),
            [h, mi, sec] => (num(h)?, num(mi)?, num(sec)?),
            _ => return None,
        };
        if h > 23 || mi > 59 || sec > 60 || (!frac.is_empty() && num(frac).is_none()) {
            return None;
        }
        ms = format!("{frac:0<3}")[..3].parse().ok()?;
        let off = match zone {
            "Z" | "z" => 0,
            _ => {
                let (sign, hhmm) = zone.split_at(1);
                let hhmm = hhmm.replace(':', "");
                let (oh, om) = (num(hhmm.get(0..2)?)?, num(hhmm.get(2..4)?)?);
                if hhmm.len() != 4 { return None; }
                (oh * 60 + om) * if sign == "-" { -1 } else { 1 }
            }
        };
        secs = h * 3600 + mi * 60 + sec - off * 60;
    }
    // days from 1970-01-01 (Howard Hinnant's civil calendar), and back
    let (yy, mm) = if m <= 2 { (y - 1, m + 9) } else { (y, m - 3) };
    let era = yy.div_euclid(400);
    let yoe = yy - era * 400;
    let days = era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + (153 * mm + 2) / 5 + d - 1 - 719468;
    let t = days * 86400 + secs;
    let (days, sod) = (t.div_euclid(86400), t.rem_euclid(86400));
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    Some((format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{ms:03}Z", sod / 3600, sod % 3600 / 60, sod % 60), t * 1000 + ms))
}

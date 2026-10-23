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
//! The kinds: `exec` above, `sql` (`run_sql`), `mcp` (src/mcp.rs). Only `reads` wants are sent here; `does` waits for
//! the dispatcher (phase 6).

use std::collections::{BTreeMap, HashMap, HashSet};

use crate::rofl_parse;
use crate::session::Session;
use crate::term::{Term, TermK};

/// One batch: the capability, its adapter, the program, the wants by key text.
struct Batch {
    cap: String,
    adapter: String,
    kind: String,
    cmd: String,
    input: String,
    params: Vec<Vec<serde_json::Value>>,
    template: Option<String>,
    tool: Option<String>,
    fields: Vec<String>,
    named: Vec<serde_json::Value>,
    wants: Vec<(String, Term)>,
    answers: HashSet<(String, usize)>,
}

impl Session {
    /// The `reads` wants not yet sent, sent: a batch per capability, all at once, the answers loaded by delta. How many
    /// rows it loaded: none means the world wants nothing more.
    pub fn adapter_wants(&mut self) -> Result<usize, String> {
        let main = self.eval.v.main;
        let rows = |s: &mut Self, rel: &str, n: usize| -> Vec<Vec<Term>> {
            let r = s.eval.h.intern(rel);
            s.eval.store.rel_persp(&s.eval.h, r, main).into_iter().map(|f| s.eval.store.args(f).to_vec()).filter(|a| a.len() == n).collect()
        };
        let wants = rows(self, "want_of", 2);
        if wants.is_empty() {
            return Ok(0);
        }
        let settled: HashSet<Term> = [("answered", 1), ("failed", 2), ("outcome_unknown", 1), ("want_held", 2)]
            .into_iter().flat_map(|(r, n)| rows(self, r, n)).map(|a| a[0]).collect();
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
        let mut fields: HashMap<String, Vec<(i64, String)>> = HashMap::new();
        for f in rows(self, "mcp_field", 3) {
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
            if settled.contains(&key) || (class != "reads" && !crate::brk!("mcp_does_sent" => class == "does"; false)) {
                continue;
            }
            match adapters.get(adapter).map(|a| a.0.as_str()) {
                Some("exec" | "sql" | "mcp") => by_cap.entry(cap).or_default().push(key),
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
            let json_wants: Vec<serde_json::Value> = wants.iter().map(|(text, k)| {
                let mut a = args.get(k).cloned().unwrap_or_default();
                a.sort_by_key(|x| x.0);
                params.push(a.iter().map(|(_, v)| self.json(*v)).collect());
                let arg = |i: i64| arg_names.get(&(cap.clone(), i)).cloned().unwrap_or_else(|| (i.to_string(), String::new()));
                named.push(a.iter().map(|(i, v)| (arg(*i).0, typed(self.json(*v), &arg(*i).1))).collect());
                let by_name: serde_json::Map<String, serde_json::Value> = a.iter().map(|(i, v)| (arg(*i).0, self.json(*v))).collect();
                serde_json::json!({"key": text, "args": by_name})
            }).collect();
            let version = self.book_version(&adapter, &cap);
            let input = serde_json::json!({"capability": cap, "book_version": version, "wants": json_wants}).to_string();
            let mut f = fields.get(&cap).cloned().unwrap_or_default();
            f.sort();
            Batch {
                answers: answers.get(&cap).cloned().unwrap_or_default(), template: templates.get(&cap).cloned(), tool: tools.get(&cap).cloned(),
                fields: f.into_iter().map(|x| x.1).collect(), cap, adapter, kind, cmd, input, params, named, wants,
            }
        }).collect();
        if batches.is_empty() && held.is_empty() {
            return Ok(0);
        }
        let runs: Vec<_> = batches.iter().map(|b| {
            let (cmd, input) = (b.cmd.clone(), b.input.clone());
            match b.kind.as_str() {
                "exec" => Some(std::thread::spawn(move || crate::session::run_program(&cmd, None, Some(&input), false))),
                "mcp" => {
                    let tool = b.tool.clone().unwrap_or_else(|| b.cap.clone());
                    let text = b.answers.contains(&("mcp_text".to_string(), 2));
                    let rel = b.answers.iter().map(|a| a.0.clone()).find(|r| r != "mcp_text").unwrap_or_else(|| "mcp_text".into());
                    let (fields, wants): (Vec<String>, Vec<(String, serde_json::Value)>) = (b.fields.clone(), b.wants.iter().map(|w| w.0.clone()).zip(b.named.clone()).collect());
                    Some(std::thread::spawn(move || crate::mcp::call(&cmd, &tool, &rel, &fields, text, &wants)))
                }
                _ => None,
            }
        }).collect();
        let mut src = held;
        for (b, run) in batches.iter().zip(runs) {
            let ran = match run {
                Some(t) => t.join().unwrap_or_else(|_| Err("the adapter's thread failed".into())),
                None => run_sql(b),
            };
            src.push_str(&self.answer(b, ran));
        }
        let n = src.lines().count();
        self.load_delta(&src, None).map_err(|d| format!("an adapter's answer was refused: {}", d.join("; ")))?;
        Ok(n)
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
        for (rel, n, of) in [("adapter", 3, adapter), ("capability", 3, cap), ("arg", 4, cap), ("answers", 3, cap), ("idempotent", 2, cap)] {
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

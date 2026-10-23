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

use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::Write;

use crate::rofl_parse;
use crate::session::Session;
use crate::term::{Term, TermK};

/// One batch: the capability, its adapter, the program, the wants by key text.
struct Batch {
    cap: String,
    adapter: String,
    cmd: String,
    input: String,
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
        let mut arg_names: HashMap<(String, i64), String> = HashMap::new();
        for a in rows(self, "arg", 4) {
            if let Some(p) = a[1].as_int() {
                arg_names.insert((name(self, a[0]), p), name(self, a[2]));
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
        let mut held = String::new();
        let mut by_cap: BTreeMap<String, Vec<Term>> = BTreeMap::new();
        for w in wants {
            let (key, cap) = (w[0], name(self, w[1]));
            let Some((adapter, class)) = caps.get(&cap) else { continue };
            if settled.contains(&key) || class != "reads" {
                continue;
            }
            match adapters.get(adapter).map(|a| a.0.as_str()) {
                Some("exec") => by_cap.entry(cap).or_default().push(key),
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
            let cmd = adapters[&adapter].1.clone();
            let wants: Vec<(String, Term)> = keys.iter().map(|k| (self.src(*k), *k)).collect();
            let json_wants: Vec<serde_json::Value> = wants.iter().map(|(text, k)| {
                let mut a = args.get(k).cloned().unwrap_or_default();
                a.sort_by_key(|x| x.0);
                let named: serde_json::Map<String, serde_json::Value> = a.iter().map(|(i, v)| {
                    (arg_names.get(&(cap.clone(), *i)).cloned().unwrap_or_else(|| i.to_string()), self.json(*v))
                }).collect();
                serde_json::json!({"key": text, "args": named})
            }).collect();
            let version = self.book_version(&adapter, &cap);
            let input = serde_json::json!({"capability": cap, "book_version": version, "wants": json_wants}).to_string();
            Batch { answers: answers.get(&cap).cloned().unwrap_or_default(), cap, adapter, cmd, input, wants }
        }).collect();
        if batches.is_empty() && held.is_empty() {
            return Ok(0);
        }
        let runs: Vec<_> = batches.iter().map(|b| {
            let (cmd, input) = (b.cmd.clone(), b.input.clone());
            std::thread::spawn(move || run_exec(&cmd, &input))
        }).collect();
        let mut src = held;
        for (b, run) in batches.iter().zip(runs) {
            let ran = run.join().unwrap_or_else(|_| Err("the adapter's thread failed".into()));
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
                (Some(k), true) if (rel == "answered" && n == 1) || (rel == "failed" && n == 2) => {
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

/// The program run with the batch on its standard input: what it printed, or why it gave nothing to read.
fn run_exec(cmd: &str, input: &str) -> Result<String, String> {
    use std::process::{Command, Stdio};
    let mut argv = cmd.split_whitespace();
    let prog = argv.next().ok_or("an empty command")?;
    let mut child = Command::new(prog).args(argv).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| format!("{prog}: {e}"))?;
    let mut stdin = child.stdin.take().ok_or("no standard input")?;
    let input = input.to_string();
    let feed = std::thread::spawn(move || {
        let _ = stdin.write_all(input.as_bytes());
    });
    let o = child.wait_with_output().map_err(|e| format!("{prog}: {e}"))?;
    let _ = feed.join();
    if !o.status.success() {
        let err = String::from_utf8_lossy(&o.stderr);
        let how = o.status.code().map_or_else(|| "was killed".to_string(), |c| format!("exited {c}"));
        return Err(format!("{cmd} {how}{}", err.lines().last().map_or(String::new(), |l| format!(": {l}"))));
    }
    String::from_utf8(o.stdout).map_err(|_| "the adapter printed bytes that are not UTF-8".to_string())
}

fn quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

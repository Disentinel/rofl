//! The recorded store boundary, parsed. Written by `scanners/store_trace.ts`.
//!
//! One run of the JS reference engine, every `FactStore` call in order, with
//! its arguments interned and its ANSWER. The answer is what makes a replay an
//! oracle rather than a stopwatch: a backend that returns a different `add`
//! verdict has changed the fixpoint, and a timing taken over a different
//! fixpoint is not a comparison.

use std::fs;
use std::path::Path;

#[derive(Clone, Copy, Debug)]
pub struct Span {
    pub at: u32,
    pub len: u32,
}

impl Span {
    pub fn get<'a>(&self, pool: &'a [u32]) -> &'a [u32] {
        &pool[self.at as usize..(self.at + self.len) as usize]
    }
}

#[derive(Clone, Copy, Debug)]
pub enum Op {
    /// `add(rel, persp, args, {scope, base, frozen})` -> was it new
    Add {
        rel: u32,
        persp: u32,
        base: bool,
        frozen: bool,
        is_new: bool,
        args: Span,
    },
    /// `get(key)` -> found. The key is decomposed; a numeric store need never
    /// spell one.
    Get { rel: u32, persp: u32, args: Span },
    /// `relPersp(rel, persp)` -> row count, canonical key order
    RelPersp { rel: u32, persp: u32, rows: u32 },
    /// `relAll(rel)` -> row count across perspectives, canonical key order
    RelAll { rel: u32, rows: u32 },
    /// `indexed(rel, persp?)` -> is an argument index standing or worth it
    Indexed {
        rel: u32,
        persp: Option<u32>,
        ans: bool,
    },
    /// `argMatches(rel, persp?, arity, pos, vals)` -> candidate count, or -1
    /// for "the store declines and the caller must scan"
    ArgMatches {
        rel: u32,
        persp: Option<u32>,
        arity: u32,
        rows: i64,
        pos: Span,
        vals: Span,
    },
    /// `support(key, sig, witness)` -> was this firing signature new
    Support {
        rel: u32,
        persp: u32,
        sig: u32,
        nprems: u32,
        is_new: bool,
        args: Span,
    },
    /// `clearDerived()` — the whole derived layer at once
    ClearDerived,
    /// `relCount(rel)`
    RelCount { rel: u32, ans: u32 },
    /// The following ops are on a DIFFERENT `Store` instance. A run touches
    /// more than the world's own store: a scratch store per kernel program
    /// (`policyStore`, src/engine.ts:232) and a rollback clone per `load`
    /// (src/api.ts:282). Measured 7 instances on sensors, 8 on spat.
    Store(u32),
}

pub struct Trace {
    pub name: String,
    /// Which instance is the world's own — the one whose facts are `live`.
    pub main: u32,
    pub nstores: u32,
    pub syms: Vec<String>,
    pub pool: Vec<u32>,
    pub ops: Vec<Op>,
    /// Live fact keys at the end of the run, sorted. The conformance gate.
    pub live: Vec<String>,
}

fn unescape(s: &str) -> String {
    if !s.contains('\\') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut it = s.chars();
    while let Some(c) = it.next() {
        if c == '\\' {
            match it.next() {
                Some('n') => out.push('\n'),
                Some(o) => out.push(o),
                None => {}
            }
        } else {
            out.push(c);
        }
    }
    out
}

impl Trace {
    pub fn load(p: &Path) -> Trace {
        let text = fs::read_to_string(p).unwrap_or_else(|e| panic!("{}: {e}", p.display()));
        let mut lines = text.lines();
        let hdr: Vec<&str> = lines.next().expect("empty trace").split(' ').collect();
        assert_eq!(hdr[0], "ROFLTRACE");
        assert_eq!(hdr[1], "2");
        let name = hdr[2].to_string();
        let main: u32 = hdr[3].parse().unwrap();
        let nstores: u32 = hdr[4].parse().unwrap();

        let n: usize = lines.next().unwrap()[2..].parse().unwrap();
        let mut syms = Vec::with_capacity(n);
        for _ in 0..n {
            syms.push(unescape(lines.next().unwrap()));
        }

        let m: usize = lines.next().unwrap()[2..].parse().unwrap();
        let mut ops = Vec::with_capacity(m);
        let mut pool: Vec<u32> = Vec::with_capacity(m * 2);
        let mut f: Vec<u32> = Vec::with_capacity(16);
        for _ in 0..m {
            let line = lines.next().unwrap();
            let (tag, rest) = line.split_at(1);
            f.clear();
            let mut neg_persp = false;
            let mut neg_rows = false;
            for (i, t) in rest.split_ascii_whitespace().enumerate() {
                if let Some(stripped) = t.strip_prefix('-') {
                    let v: i64 = stripped.parse().unwrap();
                    debug_assert_eq!(v, 1);
                    // -1 means "open perspective" in field 1 and "declined" in
                    // the row-count field of `argMatches`.
                    if tag == "m" && i == 3 {
                        neg_rows = true;
                    } else {
                        neg_persp = true;
                    }
                    f.push(u32::MAX);
                } else {
                    f.push(t.parse().unwrap());
                }
            }
            let push = |pool: &mut Vec<u32>, xs: &[u32]| -> Span {
                let at = pool.len() as u32;
                pool.extend_from_slice(xs);
                Span {
                    at,
                    len: xs.len() as u32,
                }
            };
            let op = match tag {
                // a rel persp base frozen tick isnew nargs args...
                "a" => {
                    let na = f[6] as usize;
                    let args = push(&mut pool, &f[7..7 + na]);
                    Op::Add {
                        rel: f[0],
                        persp: f[1],
                        base: f[2] == 1,
                        frozen: f[3] == 1,
                        is_new: f[5] == 1,
                        args,
                    }
                }
                // g rel persp hit nargs args...   (a miss was never recorded:
                // every `get` the evaluator makes hits, see the spec)
                "g" | "h" => {
                    let na = f[3] as usize;
                    let args = push(&mut pool, &f[4..4 + na]);
                    Op::Get {
                        rel: f[0],
                        persp: f[1],
                        args,
                    }
                }
                "p" => Op::RelPersp {
                    rel: f[0],
                    persp: f[1],
                    rows: f[2],
                },
                "l" => Op::RelAll {
                    rel: f[0],
                    rows: f[1],
                },
                "i" => Op::Indexed {
                    rel: f[0],
                    persp: if neg_persp { None } else { Some(f[1]) },
                    ans: f[2] == 1,
                },
                // m rel persp arity rows npos pos... vals...
                "m" => {
                    let np = f[4] as usize;
                    let pos = push(&mut pool, &f[5..5 + np]);
                    let vals = push(&mut pool, &f[5 + np..5 + 2 * np]);
                    Op::ArgMatches {
                        rel: f[0],
                        persp: if neg_persp { None } else { Some(f[1]) },
                        arity: f[2],
                        rows: if neg_rows { -1 } else { f[3] as i64 },
                        pos,
                        vals,
                    }
                }
                // s rel persp sig rule nprems isnew nargs args...
                "s" => {
                    let na = f[6] as usize;
                    let args = push(&mut pool, &f[7..7 + na]);
                    Op::Support {
                        rel: f[0],
                        persp: f[1],
                        sig: f[2],
                        nprems: f[4],
                        is_new: f[5] == 1,
                        args,
                    }
                }
                "c" => Op::ClearDerived,
                "x" => Op::Store(f[0]),
                "o" => Op::RelCount {
                    rel: f[0],
                    ans: f[1],
                },
                "n" | "w" | "v" | "r" => continue,
                _ => panic!("unknown op tag {tag:?}"),
            };
            ops.push(op);
        }

        let nl: usize = lines.next().unwrap()[2..].parse().unwrap();
        let mut live = Vec::with_capacity(nl);
        for _ in 0..nl {
            live.push(unescape(lines.next().unwrap()));
        }
        Trace {
            name,
            main,
            nstores,
            syms,
            pool,
            ops,
            live,
        }
    }
}

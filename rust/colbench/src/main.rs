//! colbench — WHAT ONE SEMI-NAIVE ROUND COSTS IN A COLUMNAR ENGINE.
//!
//! Shape B of the storage question: move the boundary from "give me the
//! candidate facts" to "evaluate this join over your data". `argMatches` at
//! 1.4 rows per call is a point lookup per accumulated solution and cannot
//! cross a process; a ROUND can (`scanners/round_bytes.ts` measures 39 rounds
//! and 14 KB per round on spat). So the question a benchmark has to answer is
//! not "can a columnar engine do this" but "what does it cost at the size this
//! system actually runs at".
//!
//! THE WARNING BEING PRICED is already in this repository
//! (docs/performance-invariants.md §2): differential dataflow measures 37 s and
//! 5.5 GB where Soufflé does 0.19 s and 20 MB, because general-purpose engines
//! carry brutal constant factors at small scale. This system's hot path is a
//! 14 ms parse and a 0.33 ms question to a warm world, and spat's MEDIAN
//! semi-naive front is 111 tuples. A backend that makes a billion facts
//! possible and a warm question a hundred times slower has not obviously won,
//! so the small case is measured first and the large one second.
//!
//! THE ROUND. One recursive rule, the shape every Datalog engine's inner loop
//! has: `next(x, y) :- edge(x, z), delta(z, y)`. `edge` is resident and
//! indexed before the clock starts, exactly as it would be in a store that
//! owns the data; `delta` is the round's front and is new every round, so
//! handing it over is inside the measurement. That is the most favourable
//! division of labour for the columnar engines and the least favourable for
//! the hand-written join.
//!
//! usage: cargo run --release -- [--sizes small,medium,large] [--repeat N]

// The arrow re-exported BY DataFusion, not the standalone crate: two arrow
// versions in one graph are two different `RecordBatch` types, and the
// mismatch is a compile error rather than a conversion.
use datafusion::arrow::array::{ArrayRef, RecordBatch, UInt32Array};
use datafusion::arrow::datatypes::{DataType, Field, Schema};
use std::sync::Arc;
use std::time::{Duration, Instant};

fn loadavg() -> f64 {
    let mut l = [0f64; 3];
    unsafe {
        getloadavg(l.as_mut_ptr(), 3);
    }
    l[0]
}
extern "C" {
    fn getloadavg(loadavg: *mut f64, nelem: i32) -> i32;
}

/// A deterministic pseudo-random generator: the same data for every arm, in
/// the same order, with no dependency on a crate.
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: u32) -> u32 {
        (self.next() % n as u64) as u32
    }
}

pub struct Round {
    /// `edge(x, z)` — resident, indexed, not re-shipped.
    ex: Vec<u32>,
    ez: Vec<u32>,
    /// `delta(z, y)` — the front, new every round.
    dz: Vec<u32>,
    dy: Vec<u32>,
}

fn make(edges: usize, front: usize, nodes: u32, seed: u64) -> Round {
    let mut r = Rng(seed);
    let mut ex = Vec::with_capacity(edges);
    let mut ez = Vec::with_capacity(edges);
    for _ in 0..edges {
        ex.push(r.below(nodes));
        ez.push(r.below(nodes));
    }
    let mut dz = Vec::with_capacity(front);
    let mut dy = Vec::with_capacity(front);
    for _ in 0..front {
        dz.push(r.below(nodes));
        dy.push(r.below(nodes));
    }
    Round { ex, ez, dz, dy }
}

fn schema2(a: &str, b: &str) -> Arc<Schema> {
    Arc::new(Schema::new(vec![
        Field::new(a, DataType::UInt32, false),
        Field::new(b, DataType::UInt32, false),
    ]))
}

fn batch(s: &Arc<Schema>, a: &[u32], b: &[u32]) -> RecordBatch {
    RecordBatch::try_new(
        s.clone(),
        vec![
            Arc::new(UInt32Array::from(a.to_vec())) as ArrayRef,
            Arc::new(UInt32Array::from(b.to_vec())) as ArrayRef,
        ],
    )
    .unwrap()
}

// ---------------------------------------------------------------- hand-built

/// What the engine does today, written straight: a hash index over the
/// resident relation, probed once per front tuple. The floor.
struct HandJoin {
    idx: std::collections::HashMap<u32, Vec<u32>>,
}
impl HandJoin {
    fn build(r: &Round) -> HandJoin {
        let mut idx: std::collections::HashMap<u32, Vec<u32>> = Default::default();
        for i in 0..r.ez.len() {
            idx.entry(r.ez[i]).or_default().push(r.ex[i]);
        }
        HandJoin { idx }
    }
    fn round(&self, r: &Round) -> usize {
        let mut n = 0usize;
        for i in 0..r.dz.len() {
            if let Some(xs) = self.idx.get(&r.dz[i]) {
                n += xs.len();
            }
        }
        n
    }
}

// ----------------------------------------------------------------- DataFusion

async fn datafusion_setup(r: &Round) -> datafusion::prelude::SessionContext {
    use datafusion::datasource::MemTable;
    use datafusion::prelude::SessionContext;
    let ctx = SessionContext::new();
    let se = schema2("x", "z");
    let t = MemTable::try_new(se.clone(), vec![vec![batch(&se, &r.ex, &r.ez)]]).unwrap();
    ctx.register_table("edge", Arc::new(t)).unwrap();
    ctx
}

async fn datafusion_round(ctx: &datafusion::prelude::SessionContext, r: &Round) -> usize {
    use datafusion::datasource::MemTable;
    let sd = schema2("z", "y");
    let t = MemTable::try_new(sd.clone(), vec![vec![batch(&sd, &r.dz, &r.dy)]]).unwrap();
    ctx.deregister_table("delta").unwrap();
    ctx.register_table("delta", Arc::new(t)).unwrap();
    let df = ctx
        .sql("SELECT count(*) FROM edge JOIN delta ON edge.z = delta.z")
        .await
        .unwrap();
    let b = df.collect().await.unwrap();
    let c = b[0]
        .column(0)
        .as_any()
        .downcast_ref::<datafusion::arrow::array::Int64Array>()
        .unwrap();
    c.value(0) as usize
}

// --------------------------------------------------------------------- DuckDB

fn duckdb_setup(r: &Round) -> duckdb::Connection {
    let c = duckdb::Connection::open_in_memory().unwrap();
    c.execute_batch(
        "CREATE TABLE edge(x UINTEGER, z UINTEGER); CREATE TABLE delta(z UINTEGER, y UINTEGER);",
    )
    .unwrap();
    {
        let mut app = c.appender("edge").unwrap();
        for i in 0..r.ex.len() {
            app.append_row(duckdb::params![r.ex[i], r.ez[i]]).unwrap();
        }
    }
    c
}

fn duckdb_round(c: &duckdb::Connection, r: &Round) -> usize {
    c.execute_batch("DELETE FROM delta").unwrap();
    {
        let mut app = c.appender("delta").unwrap();
        for i in 0..r.dz.len() {
            app.append_row(duckdb::params![r.dz[i], r.dy[i]]).unwrap();
        }
    }
    let mut s = c
        .prepare("SELECT count(*) FROM edge JOIN delta ON edge.z = delta.z")
        .unwrap();
    let n: i64 = s.query_row([], |r| r.get(0)).unwrap();
    n as usize
}

// --------------------------------------------------------------------- Polars

fn polars_setup(r: &Round) -> polars::prelude::DataFrame {
    use polars::prelude::*;
    df!("x" => r.ex.clone(), "z" => r.ez.clone()).unwrap()
}

fn polars_round(edge: &polars::prelude::DataFrame, r: &Round) -> usize {
    use polars::prelude::*;
    let delta = df!("z" => r.dz.clone(), "y" => r.dy.clone()).unwrap();
    let out = edge
        .clone()
        .lazy()
        .join(
            delta.lazy(),
            [col("z")],
            [col("z")],
            JoinArgs::new(JoinType::Inner),
        )
        .collect()
        .unwrap();
    out.height()
}

// ----------------------------------------------------------------------- main

fn ms(d: Duration) -> f64 {
    d.as_secs_f64() * 1e3
}

struct Arm {
    name: &'static str,
    setup: Duration,
    rounds: Vec<f64>,
    rows: usize,
}

fn stat(v: &mut [f64]) -> (f64, f64) {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    (v[0], v[v.len() / 2])
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let mut repeat = 7usize;
    let mut which = "small,medium,large".to_string();
    let mut i = 0;
    while i < argv.len() {
        match argv[i].as_str() {
            "--repeat" => {
                i += 1;
                repeat = argv[i].parse().unwrap();
            }
            "--sizes" => {
                i += 1;
                which = argv[i].clone();
            }
            _ => {}
        }
        i += 1;
    }
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap();

    // SMALL is the size this system actually runs at: spat's median semi-naive
    // front is 111 tuples over 11591 facts (scanners/round_bytes.ts).
    let sizes: Vec<(&str, usize, usize, u32)> = vec![
        ("small", 2_000, 111, 500),
        ("medium", 200_000, 10_000, 50_000),
        ("large", 10_000_000, 500_000, 2_000_000),
    ];

    println!("load at start {:.2}", loadavg());
    for (name, edges, front, nodes) in sizes {
        if !which.split(',').any(|s| s == name) {
            continue;
        }
        let r = make(edges, front, nodes, 0x2545F4914F6CDD1D);
        println!(
            "\n=== {name}: edge {} rows, front {} rows, {} nodes   load {:.2}",
            edges,
            front,
            nodes,
            loadavg()
        );
        let mut arms: Vec<Arm> = vec![
            Arm {
                name: "hand-hash",
                setup: Duration::ZERO,
                rounds: vec![],
                rows: 0,
            },
            Arm {
                name: "datafusion",
                setup: Duration::ZERO,
                rounds: vec![],
                rows: 0,
            },
            Arm {
                name: "duckdb",
                setup: Duration::ZERO,
                rounds: vec![],
                rows: 0,
            },
            Arm {
                name: "polars",
                setup: Duration::ZERO,
                rounds: vec![],
                rows: 0,
            },
        ];
        let t0 = Instant::now();
        let hand = HandJoin::build(&r);
        arms[0].setup = t0.elapsed();
        let t0 = Instant::now();
        let dfctx = rt.block_on(datafusion_setup(&r));
        arms[1].setup = t0.elapsed();
        let t0 = Instant::now();
        let duck = duckdb_setup(&r);
        arms[2].setup = t0.elapsed();
        let t0 = Instant::now();
        let pol = polars_setup(&r);
        arms[3].setup = t0.elapsed();

        // Interleaved: one round of every arm per pass.
        for _ in 0..repeat {
            let t = Instant::now();
            let n = hand.round(&r);
            arms[0].rounds.push(ms(t.elapsed()));
            arms[0].rows = n;
            let t = Instant::now();
            let n = rt.block_on(datafusion_round(&dfctx, &r));
            arms[1].rounds.push(ms(t.elapsed()));
            arms[1].rows = n;
            let t = Instant::now();
            let n = duckdb_round(&duck, &r);
            arms[2].rounds.push(ms(t.elapsed()));
            arms[2].rows = n;
            let t = Instant::now();
            let n = polars_round(&pol, &r);
            arms[3].rounds.push(ms(t.elapsed()));
            arms[3].rows = n;
        }
        println!(
            "{:<12} {:>10} {:>10} {:>12} {:>12}  rows",
            "engine", "best ms", "med ms", "setup ms", "x hand"
        );
        let hb = {
            let mut v = arms[0].rounds.clone();
            stat(&mut v).0
        };
        for a in arms.iter_mut() {
            let mut v = a.rounds.clone();
            let (b, m) = stat(&mut v);
            println!(
                "{:<12} {:>10.3} {:>10.3} {:>12.1} {:>12.1}  {}",
                a.name,
                b,
                m,
                ms(a.setup),
                b / hb,
                a.rows
            );
        }
    }
    println!("\nload at end {:.2}", loadavg());
}

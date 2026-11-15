// oxc_scan — JS/TS source through oxc, its tree as facts in the [ast_oxc] perspective, without judgement.
//
//   oxc_scan DIR [FILE...] [--out OUT] [--no-start]  every JS/TS file under DIR (or the FILEs alone, paths from DIR), facts on stdout, the same bytes
//                                      for the same tree; a file oxc refuses is named on stderr and the exit code is 2
//
// The tree is oxc_ast's own (the Rust structs, not oxc's ESTree output), read through the Debug that oxc derives on
// every node, so nothing is chosen by hand: a struct with a span is a node, its struct name the kind, its field names
// the fields; an enum wrapper names the variant when it is not the struct's own name.
//
//   node[ast_oxc](Id, Kind, File)                one per oxc node
//   line[ast_oxc](Id, Line)                      the line it starts on
//   start[ast_oxc](Id, Offset)                   where it starts, in UTF-16 code units as a JS parser counts (left out by --no-start:
//                                                every edit above a node moves it, and only the parity check reads it)
//   child[ast_oxc](Parent, Field, Index, Child)  the tree; Index over the raw Vec, a None keeps its place
//   attr[ast_oxc](Id, Key, Value)                every scalar (--no-start: only the READ ones); a struct without span flattened as key_member
//   file[ast_oxc](RootId, File)                  one per parsed file
//   parse_error[ast_oxc](File, Message)          instead of all of the above when oxc reports an error
//
// Ids as scanners/js_ast.ts makes them: the file's prefix and a hash of the parent's id and the child's step (its
// name when it has one, its shallow shape in a list, its field when single), so a node keeps its id when code is
// added above it; the program itself is `<prefix>root`. Semantic slots (node_id, scope_id, symbol_id, reference_id) and the source text are left out.
use oxc_scan::{q, scan, set_no_start, P};
use std::collections::BTreeMap;
use std::io::Write as _;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};

fn walk(root: &Path, dir: &str, files: &mut Vec<String>, dirs: &mut Vec<String>) {
    dirs.push(dir.to_string());
    let mut es: Vec<_> = std::fs::read_dir(root.join(dir)).unwrap().filter_map(|e| e.ok()).collect();
    es.sort_by_key(|e| e.file_name());
    for e in es {
        let name = e.file_name().to_string_lossy().to_string();
        let rel = if dir.is_empty() { name.clone() } else { format!("{dir}/{name}") };
        if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            if name != "node_modules" && !name.starts_with('.') {
                walk(root, &rel, files, dirs);
            }
        } else if [".js", ".ts", ".tsx", ".mjs", ".cjs", ".jsx", ".mts", ".cts"].iter().any(|x| name.ends_with(x))
            && ![".d.ts", ".d.mts", ".d.cts", ".min.js"].iter().any(|x| name.ends_with(x))
        {
            files.push(rel);
        }
    }
}

fn main() {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(i) = args.iter().position(|a| a == "--no-start") {
        args.remove(i);
        set_no_start();
    }
    let out = args.iter().position(|a| a == "--out").map(|i| {
        args.remove(i);
        args.remove(i)
    });
    if args.is_empty() {
        eprintln!("usage: oxc_scan DIR [FILE...] [--out OUT]");
        std::process::exit(1);
    }
    let root = Path::new(&args[0]);
    let (mut files, mut dirs) = (Vec::new(), Vec::new());
    walk(root, "", &mut files, &mut dirs);
    let parsed: Vec<String> = if args.len() > 1 { args[1..].to_vec() } else { files };
    let mut w: Box<dyn std::io::Write> = match &out {
        Some(o) => Box::new(std::io::BufWriter::new(std::fs::File::create(o).unwrap())),
        None => Box::new(std::io::BufWriter::new(std::io::stdout().lock())),
    };
    let abs = std::fs::canonicalize(root).unwrap();
    for f in parsed.iter().chain(dirs.iter()) {
        writeln!(w, "-- reads: {}", abs.join(f).display()).unwrap();
    }

    let next = AtomicUsize::new(0);
    let workers = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
    let (tx, rx) = std::sync::mpsc::sync_channel::<(usize, Result<String, String>)>(workers * 4);
    let (mut facts, mut refused) = (0usize, Vec::new());
    std::thread::scope(|sc| {
        for _ in 0..workers {
            let tx = tx.clone();
            let (next, parsed) = (&next, &parsed);
            sc.spawn(move || loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                let Some(f) = parsed.get(i) else { break };
                let r = match std::fs::read_to_string(root.join(f)) {
                    Ok(src) => scan(&src, f),
                    Err(e) => Err(format!("parse_error[{P}]({}, {}).\n", q(f), q(&e.to_string()))),
                };
                if tx.send((i, r)).is_err() {
                    break;
                }
            });
        }
        drop(tx);
        // in the order of the files, whatever order the workers finish in
        let mut pending = BTreeMap::new();
        let mut at = 0;
        for (i, r) in rx {
            pending.insert(i, r);
            while let Some(r) = pending.remove(&at) {
                let text = match r {
                    Ok(t) => t,
                    Err(t) => {
                        refused.push(parsed[at].clone());
                        t
                    }
                };
                facts += text.bytes().filter(|&b| b == b'\n').count();
                w.write_all(text.as_bytes()).unwrap();
                at += 1;
            }
        }
    });
    w.flush().unwrap();
    for f in &refused {
        eprintln!("{f}: refused by oxc");
    }
    eprintln!("{} files, {facts} facts{}", parsed.len(), out.map(|o| format!(" -> {o}")).unwrap_or_default());
    if !refused.is_empty() {
        std::process::exit(2);
    }
}


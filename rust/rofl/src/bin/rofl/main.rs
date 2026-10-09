//! `rofl`: the engine's one binary.
//!
//!   rofl load [flags] boot.rofl file.rofl...   build a world from text, print the state or answer questions
//!   rofl load --seed SEED.json [flags]          evaluate a snapshot; `--bytes` measures it
//!   rofl serve                                  one JSON request per line in, one answer out
//!   rofl render [--out DIR] FILE...             the sentence form of the files
mod load;
mod render;
mod seed;
mod serve;

const USAGE: &str = "usage: rofl load [--seed SEED.json] ... | rofl serve | rofl render ...";

fn main() {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    let cmd = if args.is_empty() { String::new() } else { args.remove(0) };
    match cmd.as_str() {
        "load" => match args.iter().position(|a| a == "--seed") {
            Some(i) => {
                args.remove(i);
                if i >= args.len() {
                    eprintln!("--seed needs a value");
                    std::process::exit(64);
                }
                let path = args.remove(i);
                args.push(path);
                seed::main(args)
            }
            None => load::main(args),
        },
        "serve" => serve::main(),
        "render" => render::main(args),
        _ => {
            eprintln!("{USAGE}");
            std::process::exit(2);
        }
    }
}

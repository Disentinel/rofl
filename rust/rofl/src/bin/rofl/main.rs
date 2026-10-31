//! `rofl`: the engine's one binary (docs/cli.md).
//!
//!   rofl load [flags] boot.rofl file.rofl...   build a world from text, print the state or answer questions
//!   rofl load --seed SEED.json [flags]          evaluate a snapshot; `--bytes` measures it
//!   rofl ask L [flags] FILE...                  the rows of L, one per line
//!   rofl why [--all] L [flags] FILE...          what proves L
//!   rofl whynot [--all] L [flags] FILE...       what stops L: the nearest failure, or every one
//!   rofl excise F [flags] FILE...               what taking the base fact F out changes
//!   rofl serve [FILE...]                        one JSON request per line in, one answer out; the files are session 1
//!   rofl render [--out DIR] FILE...             the sentence form of the files
//!   rofl nb FILE.rofl.md [--cell N] [--all]     a notebook run, printed as `npm run nb` prints it
//!   rofl adapter mcp COMMAND... | URL [KEY...]  the adapter book of the MCP server COMMAND runs, or the one at a URL (docs/intents.md)
//!   rofl adapter openapi SPEC [KEY...]          the adapter book of an OpenAPI document, a JSON or YAML file or URL;
//!                                               a KEY is HOW[:NAME]=ENV, read from the environment, or login:ISSUER
//!   rofl adapter login ISSUER [CLIENT_ID]       a person signs in at a browser; a book's `login` key then sends that token
//!
//! A question verb is `rofl load` with that one question; `--json` prints each answer as `rofl serve` does.
//! `--kept F [--anew]` keeps the world evaluated at F, and later runs answer from F until it is stale (kept.rs).
//! `@LIST` stands for the files LIST names, one a line, each from LIST's directory (`@rules/js.files`, the JS model);
//! a LIST that is no file from the current directory is read from the tree the command came with (md::installed_tree).
//! `roflenox://HOST/IDENTITY/BOOK` stands for the book BOOK as IDENTITY signed it on that node, checked (src/roflenox.rs).
mod delta;
mod kept;
mod load;
mod memory;
mod nb;
mod render;
mod seed;
mod serve;

const USAGE: &str = "usage: rofl load|ask|why|whynot|excise ... FILE... | rofl serve [FILE...] | rofl render ... | rofl nb FILE.rofl.md | rofl adapter mcp COMMAND...|URL [KEY...] | rofl adapter openapi SPEC [KEY...] | rofl adapter login ISSUER [CLIENT_ID]";

/// `@LIST` replaced by the files it names.
fn listed(args: Vec<String>) -> Vec<String> {
    args.into_iter().flat_map(|a| match a.strip_prefix('@') {
        None if a.starts_with("roflenox://") => match rofl::roflenox::fetch(&a) {
            Ok((file, note)) => {
                note.into_iter().for_each(|n| eprintln!("{n}"));
                vec![file.to_string_lossy().into_owned()]
            }
            Err(e) => { eprintln!("{e}"); std::process::exit(load::FILE_REFUSED) }
        },
        None => vec![a],
        Some(list) => {
            // a list that is no file from here is the installed tree's: `@rules/js.files` from any directory
            let here = std::path::PathBuf::from(list);
            let list = match rofl::md::installed_tree().map(|t| t.join(list)) {
                Some(t) if !here.is_file() && t.is_file() => t,
                _ => here,
            };
            let text = std::fs::read_to_string(&list).unwrap_or_else(|e| { eprintln!("{}: {e}", list.display()); std::process::exit(load::USAGE) });
            let dir = list.parent().unwrap_or(std::path::Path::new("")).to_path_buf();
            text.lines().map(str::trim).filter(|l| !l.is_empty()).map(|l| dir.join(l).to_string_lossy().into_owned()).collect()
        }
    }).collect()
}

fn run(args: Vec<String>) {
    let mut args = listed(args);
    let cmd = if args.is_empty() { String::new() } else { args.remove(0) };
    match cmd.as_str() {
        "load" => match args.iter().position(|a| a == "--seed") {
            Some(i) => {
                args.remove(i);
                if i >= args.len() {
                    eprintln!("--seed needs a value");
                    std::process::exit(load::USAGE);
                }
                let path = args.remove(i);
                args.push(path);
                seed::main(args)
            }
            None => load::main(args),
        },
        "ask" | "why" | "whynot" | "excise" => {
            let all = matches!(cmd.as_str(), "why" | "whynot") && args.first().is_some_and(|a| a == "--all");
            if all { args.remove(0); }
            if args.is_empty() {
                eprintln!("rofl {cmd} needs the question first, then the files");
                std::process::exit(load::USAGE);
            }
            let flag = if all { format!("--{cmd}-all") } else { format!("--{cmd}") };
            args.insert(0, flag);
            load::verb(args)
        }
        "serve" => serve::main(args),
        "render" => render::main(args),
        "nb" => nb::main(args),
        #[cfg(feature = "net")]
        "adapter" if (2..=3).contains(&args.len()) && args[0] == "login" => match rofl::login::login(&args[1], args.get(2).map(String::as_str)) {
            Ok(said) => eprintln!("{said}"),
            Err(e) => {
                eprintln!("rofl adapter login: {e}");
                std::process::exit(load::FILE_REFUSED);
            }
        },
        "adapter" if args.len() > 1 && matches!(args[0].as_str(), "mcp" | "openapi") => {
            let url = args[1].starts_with("http://") || args[1].starts_with("https://");
            let (target, keys) = if args[0] == "openapi" || url { (args[1].clone(), &args[2..]) } else { (args[1..].join(" "), &args[args.len()..]) };
            let made = keys.iter().map(|k| rofl::net::declared(k)).collect::<Result<Vec<_>, _>>()
                .and_then(|keys| if args[0] == "mcp" { rofl::mcp::book(&target, &keys) } else { rofl::openapi::book(&target, &keys) });
            match made {
                Ok(book) => print!("{book}"),
                Err(e) => {
                    eprintln!("rofl adapter {}: {e}", args[0]);
                    std::process::exit(load::FILE_REFUSED);
                }
            }
        }
        _ => {
            eprintln!("{USAGE}");
            std::process::exit(load::USAGE);
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    memory::watch();
    // a panic is the engine's own fault, never a refusal
    if std::panic::catch_unwind(|| run(args)).is_err() {
        std::process::exit(load::DEFECT);
    }
}

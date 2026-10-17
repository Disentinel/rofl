//! `rofl nb FILE.rofl.md [--cell N] [--all]`: a notebook run natively, printed as `npm run nb -- FILE` prints it (docs/cli.md).
use rofl::md::nb;

pub fn main(args: Vec<String>) {
    let (mut file, mut only, mut all) = (None, None, false);
    let mut it = args.into_iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--all" => all = true,
            "--cell" => only = it.next().and_then(|n| n.parse::<usize>().ok()),
            _ => file = Some(a),
        }
    }
    let Some(file) = file.filter(|f| f.ends_with(".rofl.md")) else {
        eprintln!("usage: rofl nb FILE.rofl.md [--cell N] [--all]");
        std::process::exit(super::load::USAGE);
    };
    match nb::run(std::path::Path::new(&file), all) {
        Ok(r) => {
            println!("{}", nb::print(&file, &r, only, all));
            std::process::exit(nb::exit_of(&r));
        }
        Err(e) => {
            eprintln!("{file}: {e}");
            println!("{file}: nothing asked — not everything was read (exit 2; see npm run nb -- --help)");
            std::process::exit(2);
        }
    }
}

fn probe(name: &str) {
    println!("{name}");
}

fn may_fail(x: usize) -> Result<usize, String> {
    if x > 3 {
        return Err("big".to_string());
    }
    Ok(x)
}

fn tried(x: usize) -> Result<usize, String> {
    probe("before_try");
    let y = may_fail(x)?;
    probe("after_try");
    Ok(y)
}

fn never() -> ! {
    panic!("never")
}

fn else_branch(n: usize) {
    let Some(_v) = (if n > 2 { Some(1) } else { None }) else {
        probe("let_else");
        return;
    };
    probe("after_let_else");
}

#[allow(unreachable_code)]
fn dead() {
    probe("live");
    return;
    probe("dead");
}

#[allow(dead_code)]
fn unused() {
    probe("unused");
}

fn main() {
    let n = std::env::args().count();
    probe("start");
    if n > 1 {
        probe("then");
    } else {
        probe("else");
    }
    match n {
        1 => probe("one"),
        _ => probe("many"),
    }
    let _a = n > 1 && {
        probe("and_rhs");
        true
    };
    let _o = n > 1 || {
        probe("or_rhs");
        false
    };
    for _ in 1..n {
        probe("loop_body");
    }
    while n > 5 {
        probe("while_body");
        break;
    }
    let f = || probe("closure_body");
    if n > 3 {
        f();
    }
    if let Some(_) = (if n > 1 { Some(n) } else { None }) {
        probe("if_let");
    }
    else_branch(n);
    dead();
    let _ = tried(n);
    for i in 0..3 {
        if i == 1 {
            continue;
        }
        probe("after_continue");
    }
    probe("middle");
    if n > 6 {
        never();
    }
    probe("after_never");
    if n > 4 {
        return;
    }
    probe("end");
}

//! JavaScript regular expressions, as the TypeScript reader writes them, on the `regex` crate: `\w`, `\d` and `\b` are
//! ASCII as in JavaScript, a `[` inside a class is a literal. Compiled once per pattern for the whole process.
use regex::{Captures, Regex};
use std::cell::RefCell;
use std::collections::HashMap;

thread_local! { static CACHE: RefCell<HashMap<String, &'static Regex>> = RefCell::new(HashMap::new()); }

fn translate(js: &str) -> String {
    let mut out = String::with_capacity(js.len() + 16);
    let mut class = false;
    let mut cs = js.chars().peekable();
    while let Some(c) = cs.next() {
        match c {
            '\\' => {
                let Some(d) = cs.next() else { out.push_str("\\\\"); break };
                match (d, class) {
                    ('w', false) => out.push_str("[0-9A-Za-z_]"),
                    ('w', true) => out.push_str("0-9A-Za-z_"),
                    ('W', false) => out.push_str("[^0-9A-Za-z_]"),
                    ('d', false) => out.push_str("[0-9]"),
                    ('d', true) => out.push_str("0-9"),
                    ('b', false) => out.push_str("(?-u:\\b)"),
                    ('s' | 'S' | 'n' | 't' | 'r', _) => { out.push('\\'); out.push(d); }
                    _ if d.is_ascii_alphanumeric() => { out.push('\\'); out.push(d); }
                    _ => out.push_str(&regex::escape(&d.to_string())),
                }
            }
            '[' if class => out.push_str("\\["),
            '[' => {
                class = true;
                out.push('[');
                if cs.peek() == Some(&'^') { out.push('^'); cs.next(); }
            }
            ']' if class => { class = false; out.push(']'); }
            '&' | '~' if class => { out.push('\\'); out.push(c); }
            _ => out.push(c),
        }
    }
    out
}

/// The pattern, written as in JavaScript; flags inline (`(?i)`, `(?m)`, `(?s)`).
pub fn re(js: &str) -> &'static Regex {
    if let Some(r) = CACHE.with(|c| c.borrow().get(js).copied()) { return r; }
    let r: &'static Regex = Box::leak(Box::new(Regex::new(&translate(js)).unwrap_or_else(|e| panic!("md reader regex {js}: {e}"))));
    CACHE.with(|c| c.borrow_mut().insert(js.to_string(), r));
    r
}

pub fn test(js: &str, s: &str) -> bool { re(js).is_match(s) }

/// The groups of the first match, `None` for a group that did not take part.
pub fn exec(js: &str, s: &str) -> Option<Vec<Option<String>>> {
    re(js).captures(s).map(|c| groups(&c))
}

pub fn groups(c: &Captures) -> Vec<Option<String>> {
    c.iter().map(|m| m.map(|m| m.as_str().to_string())).collect()
}

/// Group `i` of a match, `""` when it did not take part.
pub fn g(m: &[Option<String>], i: usize) -> &str { m.get(i).and_then(|x| x.as_deref()).unwrap_or("") }
pub fn has(m: &[Option<String>], i: usize) -> bool { m.get(i).is_some_and(|x| x.is_some()) }

/// `s.replace(re, f)`: every match when `all` (a `g` regex), else the first.
pub fn replace(js: &str, s: &str, all: bool, mut f: impl FnMut(&Captures) -> String) -> String {
    let r = re(js);
    let mut out = String::with_capacity(s.len());
    let mut last = 0;
    for c in r.captures_iter(s) {
        let m = c.get(0).unwrap();
        out.push_str(&s[last..m.start()]);
        out.push_str(&f(&c));
        last = m.end();
        if !all { break; }
    }
    out.push_str(&s[last..]);
    out
}

/// `s.replace(re, lit)` with a literal replacement.
pub fn sub(js: &str, s: &str, all: bool, with: &str) -> String { replace(js, s, all, |_| with.to_string()) }

/// `s.split(re)`, without captures.
pub fn split(js: &str, s: &str) -> Vec<String> { re(js).split(s).map(str::to_string).collect() }

/// `s.match(re /g/) ?? []`.
pub fn all(js: &str, s: &str) -> Vec<String> { re(js).find_iter(s).map(|m| m.as_str().to_string()).collect() }

/// `s.matchAll(re)`, each match's groups.
pub fn each(js: &str, s: &str) -> Vec<Vec<Option<String>>> { re(js).captures_iter(s).map(|c| groups(&c)).collect() }

/// Every regex special character escaped, as the reader's `esc` does.
pub fn esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if ".*+?^${}()|[]\\".contains(c) { out.push('\\'); }
        out.push(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn javascript_classes() {
        assert!(test(r"^\w+$", "ab_9"));
        assert!(!test(r"^\w+$", "é"));
        assert!(test(r"\bis\b", "x is y"));
        assert_eq!(sub(r"\[([^\][\n]+)\]\([^)\n]*\)", "a [b](c) d", true, "B"), "a B d");
        assert!(test(r"^\`x\`$", "`x`"));
    }
}

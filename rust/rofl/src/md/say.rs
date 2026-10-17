//! The templates of a vocabulary: the port of src/say.ts `parsePhrase`, `parseSig` and `phraseOf`.
use std::rc::Rc;

#[derive(Clone, Debug, PartialEq)]
pub enum Fix { Zero, Wild, Atom(String) }

#[derive(Clone, Debug)]
pub enum Part { Text(String), Hole(usize, String), Fix(usize, Fix) }

#[derive(Debug)]
pub struct Tpl { pub id: usize, pub rel: String, pub parts: Vec<Part>, pub arity: usize, pub src: String, pub words: Vec<String> }

pub type T = Rc<Tpl>;

thread_local! { static NEXT: std::cell::Cell<usize> = const { std::cell::Cell::new(0) }; }

pub fn tpl(rel: &str, parts: Vec<Part>, arity: usize, src: &str) -> T {
    let id = NEXT.with(|n| { let v = n.get(); n.set(v + 1); v });
    let words = parts.iter().flat_map(|p| if let Part::Text(s) = p { s.split(' ').map(str::to_string).collect() } else { vec![] }).collect();
    Rc::new(Tpl { id, rel: rel.to_string(), parts, arity, src: src.to_string(), words })
}

/// JavaScript's `Number(s)` of a hole's index, as an index.
fn index(s: &str) -> usize { s.trim().parse().unwrap_or(0) }

/// `<node> is of kind <kind>`, `<0:node> is in file <2:file> <1=_> <3=_>`
pub fn parse_phrase(rel: &str, t: &str) -> T {
    let mut parts = Vec::new();
    let (mut k, mut buf) = (0usize, String::new());
    let flush = |buf: &mut String, parts: &mut Vec<Part>| { if !buf.trim().is_empty() { parts.push(Part::Text(buf.trim().to_string())); } buf.clear(); };
    let mut i = 0;
    while i < t.len() {
        let c = t[i..].chars().next().unwrap();
        if c == '<' {
            flush(&mut buf, &mut parts);
            let j = t[i..].find('>').map(|x| x + i).unwrap_or(t.len());
            let inner = &t[i + 1..j];
            if inner.contains('=') {
                let mut it = inner.split('=');
                let (a, v) = (it.next().unwrap_or(""), it.next().unwrap_or(""));
                let fix = match v { "0" => Fix::Zero, "_" => Fix::Wild, v => Fix::Atom(v.to_string()) };
                parts.push(Part::Fix(index(a), fix));
            } else if inner.contains(':') {
                let mut it = inner.split(':');
                let (a, n) = (it.next().unwrap_or(""), it.next().unwrap_or(""));
                parts.push(Part::Hole(index(a), n.trim().to_string()));
            } else {
                parts.push(Part::Hole(k, inner.trim().to_string()));
                k += 1;
            }
            i = j + 1;
            continue;
        } else if c != '[' && c != ']' {
            buf.push(c);
        }
        i += c.len_utf8();
    }
    flush(&mut buf, &mut parts);
    let arity = parts.iter().filter(|p| !matches!(p, Part::Text(_))).count();
    tpl(rel, parts, arity, t)
}

struct Arg { marker: String, noun: String, pos: usize }

/// `has_the_field(class CD, key Key, at node P, holding node V)`: the name is the phrase, each argument `[marker] noun Var[:i]`.
pub fn parse_sig<'a>(rel: &str, text: &str, nouns: impl Iterator<Item = &'a String> + Clone) -> T {
    let open = text.find('(').unwrap_or(text.len());
    let name = text[..open].trim();
    let inner_raw = if open < text.len() { &text[open + 1..] } else { "" };
    let inner = super::rx::sub(r"\)\s*$", inner_raw, false, "");
    let args: Vec<Arg> = inner.split(',').map(str::trim).filter(|a| !a.is_empty()).enumerate().map(|(k, raw)| {
        let mut toks: Vec<&str> = super::rx::re(r"\s+").split(raw).collect();
        let last = toks.pop().unwrap_or("");
        let pos = last.split(':').nth(1).map(index).unwrap_or(k);
        let mut noun_len = 1;
        for n in nouns.clone() {
            if n.contains(' ') {
                let w: Vec<&str> = n.split(' ').collect();
                if toks.len() >= w.len() && toks[toks.len() - w.len()..].join(" ") == *n { noun_len = noun_len.max(w.len()); }
            }
        }
        let cut = toks.len().saturating_sub(noun_len);
        Arg { marker: toks[..cut].join(" "), noun: toks[cut..].join(" "), pos }
    }).collect();
    let words = name.split('_').filter(|w| !w.is_empty()).collect::<Vec<_>>().join(" ");
    let mut parts = Vec::new();
    let run = |group: Vec<&Arg>, parts: &mut Vec<Part>| {
        for (n, a) in group.iter().enumerate() {
            if n > 0 && group[n - 1].marker == a.marker { parts.push(Part::Text("and".into())); }
            else if !a.marker.is_empty() { parts.push(Part::Text(a.marker.clone())); }
            parts.push(Part::Hole(a.pos, a.noun.clone()));
        }
    };
    if words == "the" || words.starts_with("the ") {
        parts.push(Part::Text(words.clone()));
        run(args.iter().filter(|a| a.marker.is_empty()).collect(), &mut parts);
        run(args.iter().filter(|a| a.marker == "of").collect(), &mut parts);
        run(args.iter().filter(|a| !a.marker.is_empty() && a.marker != "of").collect(), &mut parts);
    } else {
        if let Some(a) = args.first() { parts.push(Part::Hole(a.pos, a.noun.clone())); }
        parts.push(Part::Text(words.clone()));
        run(args.iter().skip(1).collect(), &mut parts);
    }
    tpl(rel, parts, args.len(), text)
}

/// A template written back as the phrase fact it came from, every hole indexed.
pub fn phrase_of(t: &Tpl) -> String {
    t.parts.iter().map(|p| match p {
        Part::Text(s) => s.clone(),
        Part::Hole(i, n) => format!("<{i}:{n}>"),
        Part::Fix(i, f) => format!("<{i}={}>", match f { Fix::Zero => "0".to_string(), Fix::Wild => "_".to_string(), Fix::Atom(v) => v.clone() }),
    }).collect::<Vec<_>>().join(" ")
}

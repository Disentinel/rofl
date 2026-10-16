//! The blocks of a Markdown file: the port of scripts/md_blocks.ts. `at`, `end`: the block's lines, [at, end) from 0.
use super::rx;

#[derive(Clone, Debug, Default)]
pub struct Item { pub text: String, pub sub: Vec<String> }

#[derive(Clone, Debug, PartialEq, Eq, Copy, Default)]
pub enum Ty { #[default] P, Front, H, Q, Code, Ul, Ol, Table }

#[derive(Clone, Debug, Default)]
pub struct Block {
    pub ty: Ty,
    pub text: String,
    pub lines: Option<Vec<String>>,
    pub items: Vec<Item>,
    pub head: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub at: Option<usize>,
    pub end: Option<usize>,
}

pub fn parse_md(md: &str) -> Vec<Block> {
    let off = md.len() - md.trim_start_matches('\n').len();
    let lines: Vec<&str> = md[off..].split('\n').collect();
    let mut blocks: Vec<Block> = Vec::new();
    let mut i = 0usize;
    let mut para: Vec<String> = Vec::new();
    let push = |blocks: &mut Vec<Block>, at: usize, end: usize, b: Block| blocks.push(Block { at: Some(at + off), end: Some(end + off), ..b });
    let flush = |blocks: &mut Vec<Block>, para: &mut Vec<String>, i: usize| {
        if !para.is_empty() {
            let p = std::mem::take(para);
            push(blocks, i - p.len(), i, Block { ty: Ty::P, text: p.join(" "), lines: Some(p), ..Default::default() });
        }
    };
    if lines[0] == "---" {
        i = 1;
        while i < lines.len() && lines[i] != "---" { i += 1; }
        i += 1;
        blocks.push(Block { ty: Ty::Front, ..Default::default() });
    }
    while i < lines.len() {
        let l = lines[i];
        if l.trim().is_empty() { flush(&mut blocks, &mut para, i); i += 1; continue; }
        if let Some(m) = rx::exec(r"^(#+) (.*)$", l) {
            flush(&mut blocks, &mut para, i);
            blocks.push(Block { ty: Ty::H, text: rx::g(&m, 2).to_string(), ..Default::default() });
            i += 1; continue;
        }
        if l.starts_with('>') {
            flush(&mut blocks, &mut para, i);
            let mut q = Vec::new();
            while i < lines.len() && lines[i].starts_with('>') { q.push(rx::sub(r"^> ?", lines[i], false, "")); i += 1; }
            blocks.push(Block { ty: Ty::Q, text: q.join("\n"), ..Default::default() });
            continue;
        }
        if l.starts_with("```") {
            flush(&mut blocks, &mut para, i);
            let mut c = Vec::new();
            i += 1;
            while i < lines.len() && !lines[i].starts_with("```") { c.push(lines[i]); i += 1; }
            blocks.push(Block { ty: Ty::Code, text: c.join("\n"), ..Default::default() });
            i += 1; continue;
        }
        if l.starts_with('|') {
            flush(&mut blocks, &mut para, i);
            let at = i;
            let mut rows: Vec<Vec<String>> = Vec::new();
            while i < lines.len() && lines[i].starts_with('|') {
                let c: Vec<String> = rx::sub(r"^\||\|$", lines[i], true, "").split('|').map(|s| s.trim().to_string()).collect();
                if !c.iter().all(|x| rx::test(r"^:?-+:?$", x)) { rows.push(c); }
                i += 1;
            }
            let head = if rows.is_empty() { Vec::new() } else { rows.remove(0) };
            push(&mut blocks, at, i, Block { ty: Ty::Table, head, rows, ..Default::default() });
            continue;
        }
        if let Some(m) = rx::exec(r"^( {0,3})(-|\d+\.) (.*)$", l) {
            flush(&mut blocks, &mut para, i);
            let base = rx::g(&m, 1).len();
            let ul = rx::g(&m, 2) == "-";
            let at = i;
            let mut items: Vec<Item> = Vec::new();
            while i < lines.len() {
                let Some(mm) = rx::exec(r"^( *)(-|\d+\.) (.*)$", lines[i]) else { break };
                if rx::g(&mm, 1).len() <= base {
                    if (rx::g(&mm, 2) == "-") != ul { break; }
                    items.push(Item { text: rx::g(&mm, 3).to_string(), sub: Vec::new() });
                } else if let Some(last) = items.last_mut() {
                    last.sub.push(rx::g(&mm, 3).to_string());
                } else { break; }
                i += 1;
            }
            push(&mut blocks, at, i, Block { ty: if ul { Ty::Ul } else { Ty::Ol }, items, ..Default::default() });
            continue;
        }
        para.push(l.trim().to_string());
        i += 1;
    }
    flush(&mut blocks, &mut para, i);
    blocks
}

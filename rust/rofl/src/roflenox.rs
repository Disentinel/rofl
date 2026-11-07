//! AN ADAPTER'S BOOK ON ROFLENOX (docs/intents.md, open question 4; guide/ADAPTERS.md): `roflenox://HOST/IDENTITY/BOOK`
//! in place of a file is the book BOOK as IDENTITY signed it on the Roflenox node HOST. Each clause of the book is one
//! fact of the identity's own book there, `{source: BOOK, relation: "rofl:book", target: CLAUSE}`; the last assertion
//! of a clause decides it, and one at confidence 0 takes it out.
//!
//! Nothing the node says is taken on its word. The identity's documents are checked from the first, which is signed
//! by its own key and pinned at first contact; every batch of its chain is checked against them: the signature over
//! the manifest, the key valid when the batch says it was signed, the link to the batch before, the content against
//! the signed digest. One that fails refuses the book. A batch the node withholds from this reader is a link of the
//! chain without content: it is counted and said, never guessed.
//!
//! What was checked is kept under `$XDG_CACHE_HOME/rofl/roflenox` (else `~/.cache/rofl/roflenox`): the next load
//! asks only for the batches after the head it checked, and a node out of reach answers from there, said on stderr.
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::path::PathBuf;

const BATCH_CONTEXT: &str = "roflenox-batch-v1\n";
const IDENTITY_CONTEXT: &str = "roflenox-identity-v1\n";
const RELATION: &str = "rofl:book";

/// What a reader has checked of one identity's chain.
#[derive(Default)]
pub struct Checked {
    /// The hash of the identity's first document, pinned at first contact.
    pub first: String,
    /// The last batch checked, and how many there are.
    pub head: Option<String>,
    pub batches: usize,
    pub withheld: usize,
    /// Every `rofl:book` fact by its book and clause: the batch it was last asserted in and its confidence.
    pub clauses: BTreeMap<String, BTreeMap<String, (usize, f64)>>,
}

impl Checked {
    fn to_json(&self) -> Value {
        let clauses: Map<String, Value> = self.clauses.iter().map(|(b, cs)| {
            (b.clone(), cs.iter().map(|(t, (n, c))| serde_json::json!([t, n, c])).collect())
        }).collect();
        serde_json::json!({"first": self.first, "head": self.head, "batches": self.batches, "withheld": self.withheld, "clauses": clauses})
    }

    fn of_json(v: &Value) -> Checked {
        let n = |k: &str| v[k].as_u64().unwrap_or(0) as usize;
        let clauses = v["clauses"].as_object().into_iter().flatten().map(|(b, cs)| {
            (b.clone(), cs.as_array().into_iter().flatten().map(|c| (c[0].as_str().unwrap_or("").to_string(), (c[1].as_u64().unwrap_or(0) as usize, c[2].as_f64().unwrap_or(0.0)))).collect())
        }).collect();
        Checked { first: text(v, "first").into(), head: v["head"].as_str().map(str::to_string), batches: n("batches"), withheld: n("withheld"), clauses }
    }
}

/// RFC 8785: members by their names' UTF-16 code units, strings and numbers as ECMAScript writes them.
pub fn canonical(v: &Value) -> String {
    match v {
        Value::Object(o) => {
            let mut keys: Vec<&String> = o.keys().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            let members: Vec<String> = keys.iter().map(|k| format!("{}:{}", Value::String((*k).clone()), canonical(&o[*k]))).collect();
            format!("{{{}}}", members.join(","))
        }
        Value::Array(a) => format!("[{}]", a.iter().map(canonical).collect::<Vec<_>>().join(",")),
        Value::Number(n) => match n.as_f64() {
            Some(f) if f.fract() == 0.0 && f.abs() < 1e21 => format!("{}", f as i64),
            _ => n.to_string(),
        },
        _ => v.to_string(),
    }
}

fn b64url(s: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let (mut acc, mut bits) = (0u32, 0);
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'-' => 62,
            b'_' => 63,
            _ => return Err(format!("{s:?} is not base64url")),
        };
        acc = (acc << 6) | v as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    Ok(out)
}

#[cfg(feature = "net")]
fn sha256(parts: &[&[u8]]) -> String {
    let mut c = ring::digest::Context::new(&ring::digest::SHA256);
    parts.iter().for_each(|p| c.update(p));
    c.finish().as_ref().iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(feature = "net")]
fn signed(context: &str, body: &Value, sig: &str, public_key: &str) -> bool {
    let msg = format!("{context}{}", canonical(body));
    match (b64url(public_key), b64url(sig)) {
        (Ok(k), Ok(s)) => crate::brk!("roflenox_unsigned" => true; ring::signature::UnparsedPublicKey::new(&ring::signature::ED25519, k).verify(msg.as_bytes(), &s).is_ok()),
        _ => false,
    }
}

#[cfg(not(feature = "net"))]
fn sha256(_: &[&[u8]]) -> String {
    String::new()
}

#[cfg(not(feature = "net"))]
fn signed(_: &str, _: &Value, _: &str, _: &str) -> bool {
    false
}

fn text<'a>(o: &'a Value, k: &str) -> &'a str {
    o.get(k).and_then(Value::as_str).unwrap_or("")
}

fn without(o: &Value, k: &str) -> Value {
    let mut m: Map<String, Value> = o.as_object().cloned().unwrap_or_default();
    m.remove(k);
    Value::Object(m)
}

/// The keys of an identity's document chain, each as its latest document lists it, once every document is checked:
/// the first signed by a key it lists, each next one by a key of its own or its predecessor's, or by the recovery
/// key, and linked to its predecessor by seq and hash.
fn keys_of(identity: &str, docs: &[Value]) -> Result<(String, BTreeMap<String, Value>), String> {
    let bad = |m: String| format!("{identity}'s identity documents: {m}");
    let mut keys: BTreeMap<String, Value> = BTreeMap::new();
    let mut prev: Option<&Value> = None;
    for (i, d) in docs.iter().enumerate() {
        let doc = &d["doc"];
        if text(doc, "identity") != identity {
            return Err(bad(format!("document {i} is of {:?}", text(doc, "identity"))));
        }
        if doc["seq"].as_u64() != Some(i as u64) {
            return Err(bad(format!("document {i} has seq {}", doc["seq"])));
        }
        let own: Vec<&Value> = doc["keys"].as_array().map(|a| a.iter().collect()).unwrap_or_default();
        let mut may: Vec<&Value> = own.clone();
        match prev {
            None if !doc["prev"].is_null() => return Err(bad("the first document names a predecessor".into())),
            Some(p) => {
                if text(doc, "prev") != sha256(&[canonical(p).as_bytes()]) {
                    return Err(bad(format!("document {i} does not follow document {}", i - 1)));
                }
                may.extend(p["doc"]["keys"].as_array().into_iter().flatten());
                may.push(&p["doc"]["recovery"]);
            }
            None => {}
        }
        let signer = may.iter().find(|k| text(k, "key_id") == text(d, "key_id"));
        if !signer.is_some_and(|k| signed(IDENTITY_CONTEXT, doc, text(d, "sig"), text(k, "public_key"))) {
            return Err(bad(format!("document {i} does not verify under the key it names")));
        }
        for k in own {
            keys.insert(text(k, "key_id").to_string(), k.clone());
        }
        prev = Some(d);
    }
    let first = docs.first().ok_or_else(|| bad("there are none".into()))?;
    Ok((sha256(&[canonical(first).as_bytes()]), keys))
}

/// Check `batches`, the feed after `seen.head`, against `docs`, and take what they say into `seen`.
pub fn check(identity: &str, docs: &[Value], batches: &[Value], seen: &mut Checked) -> Result<(), String> {
    let (first, keys) = keys_of(identity, docs)?;
    if !seen.first.is_empty() && seen.first != first {
        return Err(format!("{identity}'s first identity document is not the one met at first contact: a different identity under the same name"));
    }
    seen.first = first;
    let digests: Vec<&str> = batches.iter().map(|b| text(&b["manifest"], "digest")).collect();
    for (i, b) in batches.iter().enumerate() {
        let m = &b["manifest"];
        let n = seen.batches;
        let bad = |what: &str| format!("{identity}'s batch {n} ({}): {what}", text(m, "digest"));
        let fields: Vec<&String> = m.as_object().map(|o| o.keys().filter(|k| *k != "knew").collect()).unwrap_or_default();
        if fields.len() != 7 || text(m, "identity") != identity {
            return Err(bad("not a manifest of this identity"));
        }
        if m["prev"].as_str() != seen.head.as_deref() {
            return Err(bad("does not follow the batch before it"));
        }
        let key = keys.get(text(m, "key_id")).ok_or_else(|| bad("signed by a key the identity does not list"))?;
        if !signed(BATCH_CONTEXT, &without(m, "sig"), text(m, "sig"), text(key, "public_key")) {
            return Err(bad("the signature does not verify"));
        }
        let at = text(m, "claimed_at");
        let until = [text(key, "valid_until"), text(key, "revoked_at")].into_iter().filter(|t| !t.is_empty()).min();
        if at < text(key, "valid_from") || until.is_some_and(|u| at >= u) {
            return Err(bad(&format!("the key was not valid at the claimed time {at}")));
        }
        if !text(key, "revoked_at").is_empty() && !digests[i..].contains(&text(key, "last_good")) {
            return Err(bad("signed by a revoked key, and not before the last batch its owner vouched for"));
        }
        if b["withheld"].as_bool() == Some(true) {
            seen.withheld += 1;
        } else {
            let jsonl = text(b, "jsonl");
            if sha256(&[&b64url(text(b, "salt"))?, jsonl.as_bytes()]) != text(m, "digest") {
                return Err(bad("the content does not hash to the signed digest"));
            }
            let lines: Vec<&str> = jsonl.strip_suffix('\n').unwrap_or("").split('\n').collect();
            if m["count"].as_u64() != Some(lines.len() as u64) {
                return Err(bad("the signed count is not the number of facts"));
            }
            for l in lines {
                let f: Value = serde_json::from_str(l).map_err(|e| bad(&format!("a fact is not JSON: {e}")))?;
                if canonical(&f) != l {
                    return Err(bad("a fact is not in canonical form"));
                }
                if text(&f, "relation") == RELATION {
                    let c = f["confidence"].as_f64().unwrap_or(0.0);
                    seen.clauses.entry(text(&f, "source").into()).or_default().insert(text(&f, "target").into(), (n, c));
                }
            }
        }
        seen.head = Some(text(m, "digest").to_string());
        seen.batches += 1;
    }
    Ok(())
}

/// The text of `book` as `seen` holds it: a header naming who signed it, then its clauses.
pub fn book_text(addr: &str, book: &str, seen: &Checked) -> String {
    let clauses: Vec<&String> = seen.clauses.get(book).map(|c| c.iter().filter(|(_, (_, c))| *c > 0.0).map(|(t, _)| t).collect()).unwrap_or_default();
    let withheld = match seen.withheld {
        0 => String::new(),
        w => format!("; {w} of them withheld from this reader, and what they say is not known here"),
    };
    let mut out = format!("-- {addr}: {} clauses, every batch checked to {} ({} batches{withheld})\n", clauses.len(), seen.head.as_deref().unwrap_or("none"), seen.batches);
    for c in clauses {
        out.push_str(c);
        out.push('\n');
    }
    out
}

fn kept_dir() -> Option<PathBuf> {
    let home = std::env::var_os("XDG_CACHE_HOME").map(PathBuf::from).or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".cache")))?;
    Some(home.join("rofl/roflenox"))
}

fn get(url: &str) -> Result<Value, String> {
    let r = crate::net::send("GET", url, &[], None)?;
    let v: Value = serde_json::from_str(&r.body).map_err(|e| format!("{url}: {e}"))?;
    if r.status != 200 {
        return Err(format!("{url}: {} {}", r.status, text(&v, "message")));
    }
    Ok(v)
}

/// `roflenox://HOST/IDENTITY/BOOK` as a file of the book, checked; and what to say on stderr.
pub fn fetch(addr: &str) -> Result<(PathBuf, Option<String>), String> {
    let parts: Vec<&str> = addr.strip_prefix("roflenox://").unwrap_or("").split('/').collect();
    let [host, identity, book] = parts[..] else {
        return Err(format!("{addr}: a book on Roflenox is roflenox://HOST/IDENTITY/BOOK"));
    };
    let dir = kept_dir().ok_or("no HOME to keep what was checked in")?.join(host).join(identity);
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let state = dir.join("checked.json");
    let mut seen = std::fs::read_to_string(&state).ok().and_then(|t| serde_json::from_str(&t).ok()).map(|v| Checked::of_json(&v)).unwrap_or_default();
    let after = seen.head.as_ref().map(|h| format!("?after={h}")).unwrap_or_default();
    let fetched = get(&format!("https://{host}/feeds/{identity}{after}"));
    let note = match fetched {
        Ok(feed) => {
            let docs = feed["identity"].as_array().cloned().unwrap_or_default();
            let batches = feed["batches"].as_array().cloned().unwrap_or_default();
            check(identity, &docs, &batches, &mut seen).map_err(|e| format!("{addr}: refused: {e}"))?;
            std::fs::write(&state, seen.to_json().to_string()).map_err(|e| format!("{}: {e}", state.display()))?;
            None
        }
        Err(e) if seen.head.is_some() => Some(format!("{addr}: {e}; the book as last checked")),
        Err(e) if e.contains(" 404 ") => return Err(format!("{addr}: {e}; a node shows an identity's feed to a reader without a key only once the identity publishes its books: {{source: \"{RELATION}\", relation: \"roflenox:export\", target: \"public\"}}")),
        Err(e) => return Err(format!("{addr}: {e}")),
    };
    let file = dir.join(format!("{book}.rofl"));
    let text = book_text(addr, book, &seen);
    if std::fs::read_to_string(&file).ok().as_deref() != Some(&text) {
        std::fs::write(&file, text).map_err(|e| format!("{}: {e}", file.display()))?;
    }
    Ok((file, note))
}

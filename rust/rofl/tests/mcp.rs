//! THE MCP ADAPTER (docs/intents.md, phase 5): a node script stands in for an MCP server over stdio. Its tools/list
//! comes in two pages and in a different order between versions; version b (a file it reads) changed one tool, `search`.
//! Planted: `mcp_book_digest` prints a digest of the whole list in the book, and the regenerated book differs outside
//! the changed tool; `mcp_does_sent` sends a `does` want during evaluation, and the server is called.
use rofl::session::Session;
use std::path::PathBuf;

const SERVER: &str = r#"
const fs = require('fs');
const [log, at] = process.argv.slice(2);
const version = fs.readFileSync(at, 'utf8').trim();
const say = m => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
const tools = [
  { name: 'get-user', description: 'A user by id', inputSchema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    outputSchema: { type: 'object', properties: { name: { type: 'string' }, admin: { type: 'boolean' } } } },
  { name: 'search', description: version === 'b' ? 'Search issues and pull requests' : 'Search issues',
    inputSchema: { type: 'object', properties: version === 'b' ? { q: { type: 'string' }, limit: { type: 'integer' } } : { q: { type: 'string' } } } },
  { name: 'close_issue', description: 'Close an issue', inputSchema: { type: 'object', properties: { key: { type: 'string' } } }, annotations: { readOnlyHint: true } },
  { name: 'stats', description: 'Counts', inputSchema: { type: 'object', properties: { of: { type: 'string' }, filter: { type: 'object' } } } },
];
if (version === 'b') tools.reverse();
fs.appendFileSync(log, 'start\n');
let buf = '';
process.stdin.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const m = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (m.method === 'initialize') say({ id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'Test Tracker', version: '1' } } });
    else if (m.method === 'tools/list') say({ id: m.id, result: m.params.cursor ? { tools: tools.slice(2) } : { tools: tools.slice(0, 2), nextCursor: 'two' } });
    else if (m.method === 'tools/call') {
      const { name, arguments: a } = m.params;
      fs.appendFileSync(log, `${name} ${JSON.stringify(a)}\n`);
      if (name === 'get-user' && a.id === 1) say({ id: m.id, result: { content: [{ type: 'text', text: 'Ann' }], structuredContent: { name: 'Ann', admin: true } } });
      else if (name === 'get-user') say({ id: m.id, result: { content: [{ type: 'text', text: `no user ${a.id}` }], isError: true } });
      else say({ id: m.id, result: { content: [{ type: 'text', text: `found ${a.q || a.key || JSON.stringify(a.filter)}` }] } });
    }
  }
});
process.stdin.on('end', () => process.exit(0));
"#;

fn dir(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("rofl-mcp-{name}-{}", std::process::id()));
    std::fs::create_dir_all(&d).unwrap();
    std::fs::write(d.join("server.js"), SERVER).unwrap();
    d
}

/// The server's command; `version` is what it will be when next started.
fn server(d: &PathBuf, version: &str) -> String {
    std::fs::write(d.join("version"), version).unwrap();
    format!("node {} {} {}", d.join("server.js").display(), d.join("log").display(), d.join("version").display())
}

fn log(d: &PathBuf) -> Vec<String> {
    std::fs::read_to_string(d.join("log")).unwrap_or_default().lines().map(str::to_string).collect()
}

fn evaluated(src: &str) -> Session {
    let mut s = Session::fresh(1_000_000);
    s.load(src, None).expect("load");
    s.evaluate().expect("evaluate");
    s
}

/// The blocks of a book, by the tool each describes.
fn block_of(book: &str, line: &str) -> String {
    book.split("\n\n").find(|b| b.lines().any(|l| l == line)).and_then(|b| b.lines().next()).unwrap_or("").to_string()
}

#[test]
fn a_regenerated_book_differs_by_exactly_the_changed_tool() {
    let d = dir("book");
    let (a, b) = (rofl::mcp::book(&server(&d, "a")).unwrap(), rofl::mcp::book(&server(&d, "a")).unwrap());
    assert_eq!(a, b, "the same server, the same book");
    let b = rofl::mcp::book(&server(&d, "b")).unwrap();
    assert!(a.contains("capability(test_tracker_get_user, test_tracker, does).\nmcp_tool(test_tracker_get_user, \"get-user\")."), "{a}");
    assert!(a.contains("capability(test_tracker_close_issue, test_tracker, does)."), "readOnlyHint is the server's word: {a}");
    assert!(a.contains("answers(test_tracker_get_user, get_user, 3).\nmcp_field(test_tracker_get_user, 2, \"admin\").\nmcp_field(test_tracker_get_user, 3, \"name\")."), "{a}");
    let (la, lb): (Vec<&str>, Vec<&str>) = (a.lines().collect(), b.lines().collect());
    let moved: Vec<String> = la.iter().filter(|l| !lb.contains(l)).map(|l| block_of(&a, l))
        .chain(lb.iter().filter(|l| !la.contains(l)).map(|l| block_of(&b, l))).collect();
    assert!(!moved.is_empty(), "version b changed a tool");
    assert!(moved.iter().all(|t| t.starts_with("-- tool search:")), "only the search tool moved: {moved:?}\n{a}\n{b}");
    std::fs::remove_dir_all(&d).ok();
}

#[test]
fn a_reads_tool_is_called_once_per_want_and_answered_by_its_output_schema() {
    let d = dir("reads");
    let book = rofl::mcp::book(&server(&d, "a")).unwrap()
        .replace("capability(test_tracker_get_user, test_tracker, does).", "capability(test_tracker_get_user, test_tracker, reads).")
        .replace("capability(test_tracker_search, test_tracker, does).", "capability(test_tracker_search, test_tracker, reads).")
        .replace("capability(test_tracker_stats, test_tracker, does).", "capability(test_tracker_stats, test_tracker, reads).");
    std::fs::write(d.join("log"), "").unwrap();
    let src = format!(
        "{book}
user(1). user(2).
want test_tracker_get_user(U) :- user(U).
name_of(U, N) :- want_arg(W, 1, U), get_user[test_tracker](W, _, N).
admin(U) :- want_arg(W, 1, U), get_user[test_tracker](W, true, _).
want test_tracker_search(\"bugs\") :- user(1).
found(T) :- mcp_text[test_tracker](_, T).
want test_tracker_stats(\"{{\\\"label\\\": \\\"bug\\\"}}\", \"open\") :- user(1).
"
    );
    let mut s = evaluated(&src);
    assert!(s.holds("name_of(1, \"Ann\")").unwrap() && s.holds("admin(1)").unwrap());
    assert!(s.holds("failed($want(test_tracker_get_user, 2), \"no user 2\")").unwrap());
    assert!(s.holds("found(\"found bugs\")").unwrap(), "a tool without an output schema answers its text");
    assert!(s.holds("found(\"found {\\\"label\\\":\\\"bug\\\"}\")").unwrap(), "a json argument is sent as json: {:?}", log(&d));
    let calls = log(&d);
    assert_eq!(calls.iter().filter(|l| l.starts_with("get-user")).count(), 2, "{calls:?}");
    assert_eq!(calls.iter().filter(|l| *l == "start").count(), 3, "a server per batch: {calls:?}");
    assert_eq!(s.adapter_wants().unwrap(), 0);
    assert_eq!(log(&d).len(), calls.len(), "a settled want is not sent again");
    std::fs::remove_dir_all(&d).ok();
}

#[test]
fn a_does_tool_is_not_sent_by_evaluation() {
    let d = dir("does");
    let book = rofl::mcp::book(&server(&d, "a")).unwrap();
    std::fs::write(d.join("log"), "").unwrap();
    let mut s = evaluated(&format!("{book}\nissue(\"K-1\").\nwant test_tracker_close_issue(K) :- issue(K).\n"));
    assert!(s.holds("want_key($want(test_tracker_close_issue, \"K-1\"))").unwrap());
    assert!(!log(&d).iter().any(|l| l.starts_with("close_issue")), "a does want waits for the dispatcher: {:?}", log(&d));
    std::fs::remove_dir_all(&d).ok();
}

#[test]
fn a_server_that_is_not_there_is_said() {
    let e = rofl::mcp::book("/nonexistent/server").unwrap_err();
    assert!(e.contains("/nonexistent/server"), "{e}");
}

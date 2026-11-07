//! WHEN THE THING HAPPENED (guide/ADAPTERS.md): an answer column the book names with `event_time(Cap, Column)` is
//! one instant whatever zone the source wrote it in: its text in UTC, and `instant(Text, Ms)` for rules to order it.
//! A value that is no instant fails its want. A node script stands in for a tracker that closes tickets.
//! Planted: `event_time_raw` leaves the column as the source wrote it, and two sources' times do not compare.
use rofl::session::Session;

const TRACKER: &str = r#"
const fs = require('fs');
const batch = JSON.parse(fs.readFileSync(0, 'utf8'));
const at = { t1: '2026-10-24T14:00:00+03:00', t2: '2026-10-24T11:30:00.5Z', t3: '2026-10-24', t4: 'yesterday', t5: '2026-10-24T09:00:00' };
for (const w of batch.wants) console.log(`closed(${w.key}, ${w.args.ticket}, ${JSON.stringify(at[w.args.ticket])}).`);
"#;

#[test]
fn an_event_time_is_one_instant_whatever_zone_it_came_in() {
    let d = std::env::temp_dir().join(format!("rofl-event-time-{}", std::process::id()));
    std::fs::create_dir_all(&d).unwrap();
    std::fs::write(d.join("tracker.cjs"), TRACKER).unwrap();
    let world = format!("adapter(tr, exec, \"node {}\").
capability(ticket_closed, tr, reads).
arg(ticket_closed, 1, ticket, atom).
answers(ticket_closed, closed, 3).
event_time(ticket_closed, 3).
t(t1). t(t2). t(t3). t(t4). t(t5).
want ticket_closed(T) :- t(T).
when(T, At) :- closed[tr](_, T, At).
first(A, B) :- closed[tr](_, A, X), closed[tr](_, B, Y), instant(X, MX), instant(Y, MY), MX < MY.
", d.join("tracker.cjs").display());
    let mut s = Session::fresh(1_000_000);
    s.load(&world, None).unwrap();
    s.evaluate().unwrap();
    let mut when = s.ask("when(T, At)").unwrap().rows;
    when.sort();
    assert_eq!(when, [["t1", "\"2026-10-24T11:00:00.000Z\""], ["t2", "\"2026-10-24T11:30:00.500Z\""], ["t3", "\"2026-10-24T00:00:00.000Z\""]], "the times in UTC");
    assert!(s.holds("first(t1, t2)").unwrap() && !s.holds("first(t2, t1)").unwrap(), "11:00 at +03:00 is before 11:30 in UTC: two sources' times do not compare");
    assert!(s.holds("instant(\"2026-10-24T11:00:00.000Z\", 1792839600000)").unwrap());
    let failed = s.ask("failed(W, Why)").unwrap().rows;
    assert_eq!(failed.len(), 2, "{failed:?}");
    assert!(failed.iter().any(|r| r[1].contains("\\\"yesterday\\\" in column 3 of closed")), "{failed:?}");
    assert!(failed.iter().any(|r| r[1].contains("2026-10-24T09:00:00")), "a time of day without its zone is no instant: {failed:?}");
}

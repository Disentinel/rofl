// wiring.test.ts — the dataflow-break demo, run to the house mutation
// standard: a standing green fixture (Node + Go + opaque Rust binary,
// wired through k8s, nginx and a DNS zone) is manually broken several
// distinct ways, and each break must surface as its specific derived
// relation. No break may exist in the green state.

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { zoneFacts, nginxFacts, k8sFacts, nodeFacts, goFacts } from '../scanners/infra.ts';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'examples', 'wiring');
const read = (...p: string[]): string => fs.readFileSync(path.join(DIR, ...p), 'utf8');

function build(): Rofl {
  const facts = [
    ...zoneFacts(read('dns', 'internal.zone')),
    ...nginxFacts(read('nginx', 'nginx.conf')),
    ...k8sFacts(read('k8s', 'orders.yaml')),
    ...k8sFacts(read('k8s', 'billing.yaml')),
    ...k8sFacts(read('k8s', 'reports.yaml')),
    ...nodeFacts(read('services', 'orders-node', 'index.js'), 'orders'),
    ...goFacts(read('services', 'billing-go', 'main.go'), 'billing'),
  ].join('\n');
  const r = new Rofl();
  let res = r.load(read('services', 'reports-rust', 'CONTRACT.rofl'));
  assert.ok(res.ok, 'declared contract loads: ' + res.diagnostics.join('; '));
  res = r.load(facts);
  assert.ok(res.ok, 'extracted facts load: ' + res.diagnostics.join('; '));
  res = r.load(read('wiring.rofl'));
  assert.ok(res.ok, 'wiring rules load: ' + res.diagnostics.join('; '));
  return r;
}

const BREAKS = ['broken_call(S, H, G)', 'unresolved_host(H)', 'unrouted_call(S, G)',
  'dead_route(G)', 'port_mismatch(S)', 'missing_deployment(S)',
  'type_break(E, F)', 'missing_field(E, F)'];

function allBreaks(r: Rofl): string[] {
  return BREAKS.flatMap((q) =>
    r.query(q).rows.map((row) => `${q.split('(')[0]}(${Object.values(row.bindings).join(', ')})`));
}

test('the standing fixture is green: three calls resolve end to end, zero breaks', () => {
  const r = build();
  assert.deepEqual(allBreaks(r), [], 'no break relation may fire on the green fixture');
  // both call paths exist: env-derived (node) and declared+args (rust)
  assert.ok(r.holds('call_ok("orders", "api.internal", "/billing")'));
  assert.ok(r.holds('call_ok("reports", "api.internal", "/orders")'));
  // the rust call is corroborated by two independent evidence paths
  assert.equal(r.query('call_url("reports", H, G)').rows.length, 1, 'args and contract agree on one call');
});

test('mutation: deployment port drift kills the route and the call', () => {
  const r = build();
  assert.ok(r.retract('k8s_deployment("billing", "billing", "8081")').ok);
  r.assert('k8s_deployment("billing", "billing", "9999").');
  assert.ok(r.holds('port_mismatch("billing-svc")'));
  assert.ok(r.holds('dead_route("/billing")'));
  assert.ok(r.holds('broken_call("orders", "api.internal", "/billing")'));
});

test('mutation: a deleted A record strands every caller of the host', () => {
  const r = build();
  assert.ok(r.retract('dns_a("api.internal", "10.0.0.10")').ok);
  assert.ok(r.holds('unresolved_host("api.internal")'));
  assert.equal(r.query('broken_call(S, H, G)').rows.length, 2, 'both callers break');
});

test('mutation: a removed nginx location leaves the call unrouted', () => {
  const r = build();
  assert.ok(r.retract('nginx_route("/billing", "billing_up")').ok);
  assert.ok(r.holds('unrouted_call("orders", "/billing")'));
  assert.ok(r.holds('broken_call("orders", "api.internal", "/billing")'));
});

test('mutation: an upstream pointed at a ghost service is a dead route', () => {
  const r = build();
  assert.ok(r.retract('nginx_upstream("reports_up", "reports-svc", "9000")').ok);
  r.assert('nginx_upstream("reports_up", "ghost-svc", "9000").');
  assert.ok(r.holds('dead_route("/reports")'));
  assert.ok(!r.holds('broken_call("orders", "api.internal", "/billing")'), 'unrelated call stays green');
});

test('mutation: a producer type flip is a wire typecheck failure', () => {
  const r = build();
  assert.ok(r.retract('producer_field("orders", "/charge", "order_id", "string")').ok);
  r.assert('producer_field("orders", "/charge", "order_id", "number").');
  assert.ok(r.holds('type_break("/charge", "order_id")'));
});

test('mutation: a consumer field nobody produces is missing on the wire', () => {
  const r = build();
  r.assert('consumer_field("billing", "/charge", "currency", "string").');
  assert.ok(r.holds('missing_field("/charge", "currency")'));
  assert.ok(!r.holds('missing_field("/charge", "order_id")'), 'produced fields stay green');
});

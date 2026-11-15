class Box { constructor(v) { this.value = v; } }
function init(port) { const app = {}; app.port = port; app.env = 'prod'; return app; }
function start(p) { return init(p); }
function boot(p) { return start(p); }
function retry(p, again) { return again ? retry('5000', false) : init(p); }
function mk(v) { return new Box(v); }

const api = boot('3000');
const admin = boot('4000');
const r1 = retry('7001', true);
const r2 = retry('7002', false);
const k1 = mk('one');
const k2 = mk('two');

const apiPort = api.port;
const adminPort = admin.port;
const apiEnv = api.env;
const r1Port = r1.port;
const r2Port = r2.port;
const k1Value = k1.value;
const k2Value = k2.value;

function mark(node) { node.slow = true; }
function fresh() { return { slow: false, stale: true }; }
const n1 = fresh();
const n2 = fresh();
mark(n1);
n2.stale = false;
const n1Slow = n1.slow;
const n2Slow = n2.slow;
const n1Stale = n1.stale;

let kept;
function keep(b) { kept = b; }
function current() { return kept; }
keep(mk('held'));
const cur = current();
const curValue = cur.value;

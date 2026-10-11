const assign = Object.assign;
const E = assign(exports, { start() { return 'started'; }, port: 4000 });
exports.late = function late() { return 'late'; };

function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }

E.start();
E.late();
use('E.port', E.port);

const merged = Object.assign({}, { port: 80 }, { host: 'localhost' });
use('merged.port', merged.port);
use('merged.host', merged.host);

const target = { port: 1 };
const same = Object.assign(target, { port: 2 });
use('target.port', target.port);
use('same.port', same.port);

const other = { assign() {} };
const bystander = {};
other.assign(bystander, { leak: 1 });
use('bystander.leak', bystander.leak);

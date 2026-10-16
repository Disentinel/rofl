const { Registry } = require('./registry.js');

function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }

const reg = new Registry('ops');
use('reg.owner', reg.owner);
reg.byName.set('api', 8080);
reg.byName.set('web', 3000);
use('reg.api', reg.byName.get('api'));

const ports = new Map();
ports.set('db', 5432);
ports.set('cache', 6379);
const which = 'db';
use('ports.which', ports.get(which));
for (const [name, port] of ports) { use('walk.name', name); use('walk.port', port); }
ports.forEach((port, name) => { use('each.port', port); use('each.name', name); });

const plain = { set() {}, get() { return 1; } };
plain.set('api', 9999);
use('plain.api', plain.get('api'));

const seen = new Set();
seen.add('x');

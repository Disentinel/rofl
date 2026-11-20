const c = require('./c.cjs');
const d = require('./d.cjs');
function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }
use('cjsMember', c.cv);
use('cjsMethod', c.cf());
use('cjsExports', d.only);

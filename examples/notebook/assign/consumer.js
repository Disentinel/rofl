const lib = require('./lib');

function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }

lib.start();
use('lib.port', lib.port);

const co = require('co');
const etask = require('@acme/etask/lib');
const fs = require('node:fs');
const left = require('./left-out.js');

function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }

const started = co(function* () {
  const port = yield 8080;
  use('co.yield', port);
  return 'done';
});
use('co.ret', started);

class Queue { send(msg) { return msg; } }
const Wrapped = etask._class(Queue);
use('etask.class', new Wrapped().send('hello'));
const job = etask(function* () { const got = yield 'ready'; use('etask.yield', got); return 'ok'; });
use('etask.ret', job);

use('left.x', left.x);
fs.readFileSync('a');

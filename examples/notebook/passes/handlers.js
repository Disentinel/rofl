function etask(gen) { return gen; }
function named() {}
const bus = { onMsg() {} };

export function wire() {
  etask(function* () { yield 1; });
  etask(() => 2);
  etask(named);
  etask(bus.onMsg);
}

function fa() { return 1; }
function fb() { return 2; }
const table = { a: fa, b: fb };
export function pick(k) {
  return table[k]();
}

const handlers = {};
const db = { on(name, handler) { handlers[name] = handler; handler(name); } };
function onUser(u) { return u; }
function onOrder(o) { return o; }
db.on('users', onUser);
db.on('orders', onOrder);
export function fireUsers() { handlers['users'](); }

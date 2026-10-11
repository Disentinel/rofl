function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }

function listen(port) { use('listen.port', port); }

function main() { listen(9999); }

function helper() { listen(7777); }

function alsoCli() { listen(6666); }

listen(8080);
if (!module.parent) main();
if (require.main === module) { alsoCli(); listen(5555); } else { helper(); }
if (module.parent) { listen(4444); } else { listen(3333); }
module.exports = { listen, helper };

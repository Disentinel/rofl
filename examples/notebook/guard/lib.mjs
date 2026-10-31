function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }

function note(n) { use('note.n', n); }

export function start() { note(1212); }

if (require.main === module) { start(); }

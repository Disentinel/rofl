function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }

function report(n) { use('report.n', n); }

if (require.main === module) { report(2222); }

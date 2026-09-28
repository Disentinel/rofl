// Inside a VS Code that has the built VSIX installed (vscode/test/dist.ts): the extension is the installed one, and a run of each notebook gives
// every cell an output and the result the packaged command line gave. Plain CommonJS, so a VS Code that neither strips types nor loads ES module tests runs it.
const vscode = require('vscode');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');

const strip = (r) => JSON.stringify({ status: r.status, errors: r.errors, cells: r.cells });
const until = async (get, ms, what) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((f) => setTimeout(f, 100))) { const v = get(); if (v) return v; }
  throw new Error(`waited ${ms} ms for ${what}`);
};

exports.run = async () => {
  const { ROFL_DIST_EXTENSIONS: dir, ROFL_DIST_ID: id, ROFL_DIST_CASES: cases, ROFL_DIST_REPORT: report, ROFL_DIST_SHOT: shot } = process.env, bad = [];
  const ext = vscode.extensions.getExtension(id);
  if (!ext?.extensionPath.startsWith(dir)) bad.push(`the extension is ${ext ? `at ${ext.extensionPath}` : 'not there'}, not installed under ${dir}`);
  const api = ext && await ext.activate();
  for (const c of api ? JSON.parse(cases) : []) {
    const nb = await vscode.workspace.openNotebookDocument(vscode.Uri.file(c.file));
    await vscode.window.showNotebookDocument(nb);
    await vscode.commands.executeCommand('notebook.selectKernel', { id: 'rofl-kernel', extension: id });
    await vscode.commands.executeCommand('notebook.execute');
    const r = await until(() => api.result(nb.uri), 110_000, `a result for ${c.file}`).catch((e) => void bad.push(e.message));
    if (!r) continue;
    const runs = nb.getCells().filter((x) => ['rofl', 'datalog'].includes(x.document.languageId));
    await until(() => runs.every((x) => x.executionSummary?.success !== undefined) || undefined, 5_000, 'every cell to end').catch((e) => bad.push(e.message));
    if (strip(r) !== strip(JSON.parse(readFileSync(c.cli, 'utf8')))) bad.push(`${c.file}: the result is not the packaged command line's --json`);
    for (const x of runs) if (!x.outputs.length) bad.push(`${c.file}: cell ${x.index} has no output`);
    console.log(`${c.file}: ${r.status}, ${runs.length} cells, ${runs.filter((x) => x.outputs.length).length} with output, load ${r.ms.load} ms, run ${r.ms.run} ms`);
  }
  if (shot) { writeFileSync(`${shot}.ready`, ''); await until(() => existsSync(`${shot}.done`), 30_000, 'the screenshot').catch(() => {}); }
  writeFileSync(report, bad.join('\n'));
  if (bad.length) throw new Error(bad.join('\n'));
};

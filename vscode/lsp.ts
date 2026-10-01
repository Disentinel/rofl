// The language server (lsp/server.ts) for `.rofl` files and for a `.rofl.md` opened as text: started with the first such file, spoken to over its stdin and stdout.
import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../lsp/server.ts', import.meta.url));
const SELECTOR: vscode.DocumentFilter[] = [{ scheme: 'file', language: 'rofl' }, { scheme: 'file', pattern: '**/*.rofl.md' }];
const ours = (d: vscode.TextDocument) => vscode.languages.match(SELECTOR, d) > 0;

export function lsp(channel: vscode.OutputChannel): vscode.Disposable[] {
  let child: ChildProcess | undefined, seq = 0, buf = Buffer.alloc(0);
  const waiting = new Map<number, (r: any) => void>(), diags = vscode.languages.createDiagnosticCollection('rofl-lsp');
  const send = (m: object) => { const b = JSON.stringify({ jsonrpc: '2.0', ...m }); child?.stdin?.write(`Content-Length: ${Buffer.byteLength(b)}\r\n\r\n${b}`); };
  const folders = () => (vscode.workspace.workspaceFolders ?? []).map((f) => ({ uri: f.uri.toString(), name: f.name }));
  const opened = (d: vscode.TextDocument) => send({ method: 'textDocument/didOpen', params: { textDocument: { uri: d.uri.toString(), languageId: d.languageId, version: d.version, text: d.getText() } } });

  function start() {
    if (child) return;
    const c = child = spawn(process.execPath, [...(SERVER.endsWith('.ts') ? ['--experimental-strip-types'] : []), SERVER, '--stdio'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    c.stdout!.on('data', (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      for (let h; (h = buf.indexOf('\r\n\r\n')) >= 0;) {
        const n = Number(/Content-Length: *(\d+)/i.exec(buf.subarray(0, h).toString())?.[1]);
        if (buf.length < h + 4 + n) return;
        const m = JSON.parse(buf.subarray(h + 4, h + 4 + n).toString('utf8'));
        buf = buf.subarray(h + 4 + n);
        if (m.id !== undefined) { waiting.get(m.id)?.(m.result ?? null); waiting.delete(m.id); }
        else if (m.method === 'textDocument/publishDiagnostics') diags.set(vscode.Uri.parse(m.params.uri), m.params.diagnostics.map((x: any) => Object.assign(new vscode.Diagnostic(range(x.range), x.message, x.severity - 1), { source: 'rofl' })));
      }
    });
    c.stderr!.on('data', (d) => channel.append(`rofl-lsp: ${d}`));
    c.on('exit', (code) => { if (child === c) child = undefined; buf = Buffer.alloc(0); for (const f of waiting.values()) f(null); waiting.clear(); diags.clear(); channel.appendLine(`rofl-lsp ended (${code})`); });
    send({ id: ++seq, method: 'initialize', params: { processId: process.pid, rootUri: null, workspaceFolders: folders(), capabilities: {} } });
    send({ method: 'initialized', params: {} });
    vscode.workspace.textDocuments.filter(ours).forEach(opened);
  }
  const ask = <T>(method: string, params: object) => new Promise<T | null>((ok) => { start(); const id = ++seq; waiting.set(id, ok); send({ id, method, params }); });
  const at = (d: vscode.TextDocument, p: vscode.Position) => ({ textDocument: { uri: d.uri.toString() }, position: { line: p.line, character: p.character } });
  const range = (r: any) => new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
  const loc = (l: any) => new vscode.Location(vscode.Uri.parse(l.uri), range(l.range));

  if (vscode.workspace.textDocuments.some(ours)) start();
  return [diags, { dispose: () => { child?.kill(); child = undefined; } },
    vscode.workspace.onDidOpenTextDocument((d) => { if (ours(d)) child ? opened(d) : start(); }),
    vscode.workspace.onDidChangeTextDocument((e) => { if (child && ours(e.document)) send({ method: 'textDocument/didChange', params: { textDocument: { uri: e.document.uri.toString(), version: e.document.version }, contentChanges: [{ text: e.document.getText() }] } }); }),
    vscode.workspace.onDidCloseTextDocument((d) => { if (child && ours(d)) send({ method: 'textDocument/didClose', params: { textDocument: { uri: d.uri.toString() } } }); }),
    vscode.workspace.onDidChangeWorkspaceFolders((e) => send({ method: 'workspace/didChangeWorkspaceFolders', params: { event: { added: e.added.map((f) => ({ uri: f.uri.toString(), name: f.name })), removed: e.removed.map((f) => ({ uri: f.uri.toString(), name: f.name })) } } })),
    vscode.languages.registerHoverProvider(SELECTOR, { provideHover: async (d, p) => { const r = await ask<any>('textDocument/hover', at(d, p)); return r ? new vscode.Hover(new vscode.MarkdownString(r.contents.value)) : undefined; } }),
    vscode.languages.registerDefinitionProvider(SELECTOR, { provideDefinition: async (d, p) => ((await ask<any[]>('textDocument/definition', at(d, p))) ?? []).map(loc) }),
    vscode.languages.registerReferenceProvider(SELECTOR, { provideReferences: async (d, p, c) => ((await ask<any[]>('textDocument/references', { ...at(d, p), context: c })) ?? []).map(loc) }),
    vscode.languages.registerDocumentSymbolProvider(SELECTOR, { provideDocumentSymbols: async (d) => ((await ask<any[]>('textDocument/documentSymbol', { textDocument: { uri: d.uri.toString() } })) ?? [])
      .map((s) => new vscode.DocumentSymbol(s.name, s.detail, vscode.SymbolKind.Function, range(s.range), range(s.selectionRange))) }),
    vscode.languages.registerCompletionItemProvider(SELECTOR, { provideCompletionItems: async (d, p) => ((await ask<any[]>('textDocument/completion', at(d, p))) ?? [])
      .map((i) => Object.assign(new vscode.CompletionItem(i.label, i.kind === 3 ? vscode.CompletionItemKind.Function : vscode.CompletionItemKind.Text), { detail: i.detail })) }),
  ];
}

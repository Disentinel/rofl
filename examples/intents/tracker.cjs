// The MCP server of scenario 2, over stdio: one tool, `transition`, which only says what it was asked.
const say = m => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
let buf = '';
process.stdin.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const m = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (m.method === 'initialize') say({ id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'tracker', version: '1' } } });
    else if (m.method === 'tools/list') say({ id: m.id, result: { tools: [{ name: 'transition', description: 'Move an issue', inputSchema: { type: 'object', properties: { issue: { type: 'string' }, to: { type: 'string' } } } }] } });
    else if (m.method === 'tools/call') say({ id: m.id, result: { content: [{ type: 'text', text: `${m.params.arguments.issue} moved to ${m.params.arguments.to}` }] } });
  }
});
process.stdin.on('end', () => process.exit(0));

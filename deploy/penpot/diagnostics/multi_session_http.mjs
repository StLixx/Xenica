// 在已构建的官方 mcp/packages/server 目录运行；只使用测试令牌和本机端口。
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(process.argv[2]);
const require = createRequire(resolve(root, 'package.json'));
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { WebSocket } = require('ws');
const child = spawn(process.execPath, [resolve(root, 'dist/index.js'), '--multi-user'], {
  cwd: resolve(root, 'dist'),
  env: { ...process.env, PENPOT_MCP_SERVER_HOST: '127.0.0.1', PENPOT_MCP_SERVER_PORT: '24401',
    PENPOT_MCP_WEBSOCKET_PORT: '24402', PENPOT_MCP_REPL_ENABLE: 'false', PENPOT_MCP_LOG_LEVEL: 'silent' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (data) => { stderr += data; });
const sockets = [];
const client = new Client({ name: 'selfhost-routing-test', version: '1' });
async function connect(sessionId, token, fileName) {
  const socket = new WebSocket(`ws://127.0.0.1:24402?userToken=${token}`);
  sockets.push(socket);
  await once(socket, 'open', { signal: AbortSignal.timeout(3000) });
  const ready = once(socket, 'message', { signal: AbortSignal.timeout(3000) });
  socket.send(JSON.stringify({ type: 'initialize', session: { sessionId, fileId: sessionId, fileName } }));
  assert.equal(JSON.parse((await ready)[0].toString()).type, 'initialized');
  socket.on('message', (raw) => {
    const request = JSON.parse(raw.toString());
    socket.send(JSON.stringify({ id: request.id, success: true, data: sessionId }));
  });
  return socket;
}
const call = async (sessionId) => JSON.stringify(await client.callTool({ name: 'execute_code',
  arguments: { code: 'return penpot.currentFile.id;', ...(sessionId ? { sessionId } : {}) } }));
try {
  for (let attempt = 0; ; attempt++) {
    try { await fetch('http://127.0.0.1:24401/'); break; }
    catch { if (attempt === 30 || child.exitCode !== null) throw new Error(stderr || 'MCP startup failed'); await delay(100); }
  }
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:24401/mcp?userToken=fixture-alice')));
  const first = await connect('fixture-first', 'fixture-alice', 'First design');
  await connect('fixture-second', 'fixture-alice', 'Second design');
  await connect('fixture-bob', 'fixture-bob-token', 'Other user');
  const tools = await client.listTools();
  assert.ok(tools.tools.find((tool) => tool.name === 'execute_code').inputSchema.properties.sessionId);
  const choice = await call();
  assert.match(choice, /First design/); assert.match(choice, /Second design/);
  assert.doesNotMatch(choice, /Other user/);
  assert.equal(JSON.parse(await call('fixture-first')).content[0].text, '"fixture-first"');
  assert.equal(JSON.parse(await call('fixture-second')).content[0].text, '"fixture-second"');
  assert.match(await call('fixture-bob'), /not connected/);
  const closed = once(first, 'close'); first.close(); await closed;
  assert.equal(JSON.parse(await call()).content[0].text, '"fixture-second"');
  assert.match(await call('fixture-first'), /not connected/);
  console.log(JSON.stringify({ ok: true, checks: ['published-schema', 'explicit-target', 'multiple-file-choice',
    'token-isolation', 'closed-session-rejected', 'single-session-fallback'] }));
} finally {
  sockets.forEach((socket) => socket.terminate());
  await client.close();
  child.kill();
}

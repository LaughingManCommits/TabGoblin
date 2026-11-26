import assert from 'node:assert/strict';
import test from 'node:test';
import { McpClient } from './mcp-client.mjs';

test('child exit settles every outstanding request and rejects subsequent requests', async () => {
  const client = new McpClient(process.execPath, ['-e', "process.stdin.once('data', () => process.exit(7))"]);
  const exited = /MCP process .* exited with code 7/;
  const checks = ['first', 'second'].map((method) => assert.rejects(client.request(method, {}, 3000), exited));
  await Promise.all(checks);
  assert.equal(await client.exited, 7);
  assert.equal(client.pending.size, 0);
  await assert.rejects(client.request('after exit', {}, 3000), exited);
});

test('a final response is delivered before unanswered requests are rejected', async () => {
  const child = `
    process.stdin.once('data', () => {
      const line = JSON.stringify({ id: 1, result: 'done' }) + '\\n';
      process.stdout.write(line, () => process.exit(0));
    });
  `;
  const client = new McpClient(process.execPath, ['-e', child]);
  const final = client.request('answered', {}, 3000);
  const unanswered = assert.rejects(client.request('unanswered', {}, 3000), /exited with code 0/);
  assert.equal(await final, 'done');
  await unanswered;
});

test('a spawn failure rejects requests and close completes', async () => {
  const client = new McpClient('tabgoblin-test-no-such-executable', []);
  await assert.rejects(client.request('initialize', {}, 3000), { code: 'ENOENT' });
  assert.equal(await client.close(), null);
});

test('a long final response written just before the exit is delivered whole', async () => {
  const child = `
    process.stdin.once('data', () => {
      const line = JSON.stringify({ id: 1, result: 'x'.repeat(4_000_000) }) + '\\n';
      process.stdout.write(line, () => process.exit(0));
    });
  `;
  const client = new McpClient(process.execPath, ['-e', child]);
  const result = await client.request('answered', {}, 10000);
  assert.equal(result.length, 4_000_000);
  assert.equal(await client.exited, 0);
});

test('a call nobody waits for yet fails where it is awaited, not as an unhandled rejection', async () => {
  const unhandled = [];
  const note = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', note);
  try {
    const client = new McpClient(process.execPath, ['-e', "process.stdin.once('data', () => process.exit(3))"]);
    const request = client.request('first', {}, 3000);
    const tool = client.tool('browser_status');
    assert.equal(await client.exited, 3);
    await new Promise((resolve) => setTimeout(resolve, 200)); // the step is busy elsewhere
    await assert.rejects(request, /exited with code 3/);
    await assert.rejects(tool, /exited with code 3/);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', note);
  }
});

test('an error of a process that runs does not end the client', async () => {
  const child = `
    process.stdin.on('data', (chunk) => {
      for (const line of String(chunk).split('\\n').filter(Boolean)) {
        process.stdout.write(JSON.stringify({ id: JSON.parse(line).id, result: 'still here' }) + '\\n');
      }
    });
  `;
  const client = new McpClient(process.execPath, ['-e', child]);
  assert.equal(await client.request('before', {}, 3000), 'still here');
  // What Node reports when, say, a signal could not be sent: the process itself goes on.
  client.proc.emit('error', new Error('kill EPERM'));
  assert.equal(await client.request('after', {}, 3000), 'still here');
  assert.equal(await client.close(), 0);
});

test('a failed write leaves the reason to the end of the process', async () => {
  // The child closes its input and ends a moment later: writes fail before the exit is known.
  const child = "process.stdin.destroy(); setTimeout(() => process.exit(5), 300)";
  const client = new McpClient(process.execPath, ['-e', child]);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const requests = Array.from({ length: 50 }, (_, n) => client.request('r' + n, { pad: 'x'.repeat(65536) }, 5000));
  for (const request of requests) await assert.rejects(request, /exited with code 5/);
});

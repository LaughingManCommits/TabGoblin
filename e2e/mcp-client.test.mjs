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

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROTOCOL_VERSION, parseServerMessage } from '../src/protocol.ts';

test('well-formed protocol messages are typed', () => {
  assert.deepEqual(parseServerMessage({ type: 'challenge', nonce: 'abc', versions: [1, 2] }),
    { type: 'challenge', nonce: 'abc', versions: [1, 2] });
  assert.deepEqual(parseServerMessage({ type: 'auth_ok', proof: 'p', version: PROTOCOL_VERSION, clientId: 'c-1', clientName: 'IDE' }),
    { type: 'auth_ok', proof: 'p', version: PROTOCOL_VERSION, clientId: 'c-1', clientName: 'IDE' });
  assert.deepEqual(parseServerMessage({ type: 'cancel', id: '17' }), { type: 'cancel', id: '17' });
  assert.deepEqual(parseServerMessage({ type: 'client', name: 'x'.repeat(200) }), { type: 'client', name: 'x'.repeat(60) });
  assert.deepEqual(parseServerMessage({ id: '17', action: 'click', session: 's2', params: { ref: 4 }, deadline: 99 }), {
    type: 'command',
    command: { id: '17', action: 'click', session: 's2', params: { ref: 4 }, deadline: 99 },
  });
  // No session and no params: the only-session default, with empty params.
  assert.deepEqual(parseServerMessage({ id: '1', action: 'status', deadline: 5 }),
    { type: 'command', command: { id: '1', action: 'status', params: {}, deadline: 5 } });
});

test('a pre-versioning server offers no versions', () => {
  assert.deepEqual(parseServerMessage({ type: 'challenge', nonce: 'abc' }), { type: 'challenge', nonce: 'abc', versions: [] });
});

test('malformed or forged messages are rejected', () => {
  const bad: unknown[] = [
    null, 'text', 42, [], {},
    { type: 'challenge' },
    { type: 'auth_ok', proof: 'p', clientId: 'c-1' },                         // no version
    { type: 'auth_ok', proof: 'p', version: 2 },                              // no identity
    { type: 'cancel' },
    { type: 'evaluate', script: 'document.cookie' },                          // unknown type
    { action: 'click', deadline: 1 },                                         // no id
    { id: '1', deadline: 1 },                                                 // no action
    { id: '1', action: 'click' },                                             // no deadline
    { id: '1', action: 'click', deadline: 'soon' },
    { id: '1', action: 'click', deadline: Infinity },
    { id: 1, action: 'click', deadline: 1 },
    { id: 'x'.repeat(65), action: 'click', deadline: 1 },
    { id: '1', action: 'click', deadline: 1, session: 'tab-4' },
    { id: '1', action: 'click', deadline: 1, session: 's1; s2' },
    { id: '1', action: 'click', deadline: 1, session: 7 },
    { id: '1', action: 'click', deadline: 1, params: 'ref=4' },
    { id: '1', action: 'click', deadline: 1, params: [4] },
  ];
  for (const message of bad) {
    assert.equal(parseServerMessage(message), null, JSON.stringify(message));
  }
});

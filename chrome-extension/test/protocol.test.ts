import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROTOCOL_VERSION, commandTiming, parseServerMessage } from '../src/protocol.ts';

test('well-formed protocol messages are typed', () => {
  assert.deepEqual(parseServerMessage({ type: 'challenge', nonce: 'abc', version: 1 }), { type: 'challenge', nonce: 'abc', version: 1 });
  // The server names its agents in its proven answer, and again whenever they change.
  assert.deepEqual(parseServerMessage({ type: 'auth_ok', proof: 'p', version: PROTOCOL_VERSION, agents: [{ id: 'c-1', name: 'IDE' }] }),
    { type: 'auth_ok', proof: 'p', version: PROTOCOL_VERSION, agents: [{ id: 'c-1', name: 'IDE' }] });
  assert.deepEqual(parseServerMessage({ type: 'auth_ok', proof: 'p', version: PROTOCOL_VERSION }),
    { type: 'auth_ok', proof: 'p', version: PROTOCOL_VERSION, agents: [] }, 'a server without an agent yet');
  assert.deepEqual(parseServerMessage({ type: 'agents', agents: [{ id: 'c-1', name: 'x'.repeat(200) }, { id: 'a-2' }] }),
    { type: 'agents', agents: [{ id: 'c-1', name: 'x'.repeat(60) }, { id: 'a-2', name: '' }] });
  assert.deepEqual(parseServerMessage({ type: 'cancel', id: '17' }), { type: 'cancel', id: '17' });
  assert.deepEqual(parseServerMessage({ id: '17', agent: 'c-1', action: 'click', session: 's2', params: { ref: 4 }, deadline: 99 }), {
    type: 'command',
    command: { id: '17', agent: 'c-1', action: 'click', session: 's2', params: { ref: 4 }, deadline: 99 },
  });
  // No session and no params: the only-session default, with empty params.
  assert.deepEqual(parseServerMessage({ id: '1', agent: 'c-1', action: 'status', deadline: 5 }),
    { type: 'command', command: { id: '1', agent: 'c-1', action: 'status', params: {}, deadline: 5 } });
});

test('a server from before there was a version says none, which is version 0', () => {
  assert.deepEqual(parseServerMessage({ type: 'challenge', nonce: 'abc' }), { type: 'challenge', nonce: 'abc', version: 0 });
  assert.deepEqual(parseServerMessage({ type: 'challenge', nonce: 'abc', versions: [3] }), { type: 'challenge', nonce: 'abc', version: 0 },
    'the list of versions of the releases before is none either');
});

test('malformed or forged messages are rejected', () => {
  const bad: unknown[] = [
    null, 'text', 42, [], {},
    { type: 'challenge' },
    { type: 'auth_ok', proof: 'p', agents: [] },                               // no version
    { type: 'auth_ok', proof: 'p', version: 1, agents: [{ name: 'no id' }] },  // an agent without an id is no agent
    { type: 'auth_ok', proof: 'p', version: 1, agents: 'c-1' },                // not a list
    { type: 'agents' },
    { type: 'agents', agents: [{ id: 7 }] },
    { type: 'cancel' },
    { type: 'client', name: 'x' },                                             // of the releases before: an agent's name comes with the agents
    { type: 'evaluate', script: 'document.cookie' },                           // unknown type
    { action: 'click', agent: 'c-1', deadline: 1 },                            // no id
    { id: '1', action: 'click', deadline: 1 },                                 // no agent
    { id: '1', agent: 'c-1', deadline: 1 },                                    // no action
    { id: '1', agent: 'c-1', action: 'click' },                                // no deadline
    { id: '1', agent: 'c-1', action: 'click', deadline: 'soon' },
    { id: '1', agent: 'c-1', action: 'click', session: 'tab-1', deadline: 1 }, // a session id is s<number>
    { id: '1', agent: 'c-1', action: 'click', params: 'ref=1', deadline: 1 },
    { id: 'x'.repeat(65), agent: 'c-1', action: 'click', deadline: 1 },
  ];
  for (const message of bad) assert.equal(parseServerMessage(message), null, JSON.stringify(message));
});

test('the timing of a round trip is whole milliseconds, never negative, and the user\'s part never more than the running', () => {
  assert.deepEqual(commandTiming(1000, 1040, 1300, 100), { ran: 260, queued: 40, asked: 100 });
  assert.deepEqual(commandTiming(1000, 1000, 1000, 0), { ran: 0, queued: 0, asked: 0 });
  assert.deepEqual(commandTiming(1000, 900, 950, 500), { ran: 50, queued: 0, asked: 50 });
  assert.deepEqual(commandTiming(1000, 1000.6, 1002.4, Number.NaN), { ran: 2, queued: 1, asked: 0 });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROTOCOL_VERSION, commandTiming, parseServerMessage } from '../src/protocol.ts';

test('well-formed protocol messages are typed', () => {
  assert.deepEqual(parseServerMessage({ type: 'challenge', nonce: 'abc', versions: [1, 2], clientId: 'c-1' }),
    { type: 'challenge', nonce: 'abc', versions: [1, 2], clientId: 'c-1' });
  // A server from before it said who it is in its first message, or one that says it wrongly: nobody.
  assert.deepEqual(parseServerMessage({ type: 'challenge', nonce: 'abc', versions: [2] }),
    { type: 'challenge', nonce: 'abc', versions: [2], clientId: '' });
  for (const noId of [7, '', 'x'.repeat(65), null, ['c-1']]) {
    assert.deepEqual(parseServerMessage({ type: 'challenge', nonce: 'abc', versions: [2], clientId: noId }),
      { type: 'challenge', nonce: 'abc', versions: [2], clientId: '' });
  }
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
  assert.deepEqual(parseServerMessage({ type: 'challenge', nonce: 'abc' }), { type: 'challenge', nonce: 'abc', versions: [], clientId: '' });
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

test('an answer says how long the command ran, waited for its turn, and waited for the user', () => {
  // Arrived at 1000, had its turn at 1040, ended at 3040; the user took 1500 of that to answer.
  assert.deepEqual(commandTiming(1000, 1040, 3040, 1500), { ran: 2000, queued: 40, asked: 1500 });
  // Numbers only, whole and never negative; the user cannot have taken longer than the command ran.
  assert.deepEqual(commandTiming(1000, 1000, 1010.6, 0), { ran: 11, queued: 0, asked: 0 });
  assert.deepEqual(commandTiming(1000, 990, 995, 50), { ran: 5, queued: 0, asked: 5 });
  assert.deepEqual(commandTiming(1000, 1000, Number.NaN, Number.NaN), { ran: 0, queued: 0, asked: 0 });
  assert.deepEqual(Object.keys(commandTiming(1, 2, 3, 0)).sort(), ['asked', 'queued', 'ran']);
});

test('the list of blocked sites is taken whole or not at all', () => {
  assert.deepEqual(parseServerMessage({ type: 'policy', blocked: ['example.org', 'xn--bcher-kva.example', '127.0.0.1', '[::1]'], unreadable: false }),
    { type: 'policy', blocked: ['example.org', 'xn--bcher-kva.example', '127.0.0.1', '[::1]'], unreadable: false });
  assert.deepEqual(parseServerMessage({ type: 'policy', blocked: [], unreadable: true }), { type: 'policy', blocked: [], unreadable: true });
  // Only a plain yes is a yes.
  assert.deepEqual(parseServerMessage({ type: 'policy', blocked: [], unreadable: 'yes' }), { type: 'policy', blocked: [], unreadable: false });
  // A list with an entry that is no host is no list: a part of it would leave a site open without a word.
  for (const blocked of [undefined, 'example.org', [7], ['example.org', null], ['Example.org'], ['exa mple.org'], ['https://example.org'],
    ['x'.repeat(254)], Array.from({ length: 5001 }, () => 'example.org')]) {
    assert.equal(parseServerMessage({ type: 'policy', blocked, unreadable: false }), null, JSON.stringify(blocked)?.slice(0, 60));
  }
});

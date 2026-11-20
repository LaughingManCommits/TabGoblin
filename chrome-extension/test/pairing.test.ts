import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientProof, randomNonce, safeEqual, serverProof } from '../src/pairing.ts';

// The same vector is asserted in java-server PairingTest, so both ends agree on the handshake.
const TOKEN = 'test-token-0123456789abcdef0123456789abcdef';
const SERVER_NONCE = 'a'.repeat(32);
const CLIENT_NONCE = 'b'.repeat(32);

test('client and server proofs match the Java implementation', async () => {
  assert.equal(await clientProof(TOKEN, SERVER_NONCE, CLIENT_NONCE),
    '1b283b3c3fd92227a87cc559a6d5f81c7cabc594184c68852e6e5400e36b34c1');
  assert.equal(await serverProof(TOKEN, SERVER_NONCE, CLIENT_NONCE),
    '978cb739f5d247e07e34d81c745996bb325a7a3fdd05e739ea357706a4e5b094');
});

test('proofs depend on the token, both nonces and the direction', async () => {
  const base = await clientProof(TOKEN, SERVER_NONCE, CLIENT_NONCE);
  assert.notEqual(await clientProof(TOKEN + 'x', SERVER_NONCE, CLIENT_NONCE), base);
  assert.notEqual(await clientProof(TOKEN, 'c'.repeat(32), CLIENT_NONCE), base);
  assert.notEqual(await clientProof(TOKEN, SERVER_NONCE, 'c'.repeat(32)), base);
  // A captured client proof cannot be replayed as the server's answer.
  assert.notEqual(await serverProof(TOKEN, SERVER_NONCE, CLIENT_NONCE), base);
});

test('nonces are random and comparison is exact', () => {
  assert.match(randomNonce(), /^[0-9a-f]{32}$/);
  assert.notEqual(randomNonce(), randomNonce());
  assert.ok(safeEqual('abc123', 'abc123'));
  assert.ok(!safeEqual('abc123', 'abc124'));
  assert.ok(!safeEqual('abc123', 'abc12'));
  assert.ok(!safeEqual('', 'a'));
});

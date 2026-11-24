import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REDACTED, redactText, redactUrl } from '../src/redact.ts';

test('an address loses the values of parameters that carry credentials, and nothing else', () => {
  assert.equal(redactUrl('https://ci.example/job/7?token=abc123&page=2#x'), `https://ci.example/job/7?token=${REDACTED}&page=2#x`);
  assert.equal(redactUrl('https://app.example/cb?code=4%2FP7q&state=xyz'), `https://app.example/cb?code=${REDACTED}&state=xyz`);
  assert.equal(redactUrl('https://app.example/#access_token=eyJabc.def&expires_in=3600'), `https://app.example/#access_token=${REDACTED}&expires_in=3600`);
  for (const name of ['api_key', 'apikey', 'API-KEY', 'password', 'client_secret', 'X-Amz-Signature', 'sig', 'session_id', 'jwt', 'key', 'auth']) {
    assert.equal(redactUrl(`/path?a=1&${name}=S3cr3tValue&b=2`), `/path?a=1&${name}=${REDACTED}&b=2`, name);
  }
  // A user and a password in front of the host.
  assert.equal(redactUrl('https://deploy:hunter2@git.example/repo.git'), `https://${REDACTED}@git.example/repo.git`);
  // What only resembles such a name is left: an address is what the agent navigates by.
  for (const plain of ['https://app.example/issues?id=7&sort=key_asc', '/search?q=token+bucket', '/docs?keyword=auth&monkey=1', '/tokens/list?page=3', '']) {
    assert.equal(redactUrl(plain), plain);
  }
  assert.equal(redactUrl(undefined), undefined);
});

test('text loses what looks like a credential, and keeps its lines', () => {
  const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA7\nabcDEF123\n-----END RSA PRIVATE KEY-----';
  assert.equal(redactText(`before\n${key}\nafter`), `before\n${REDACTED} (a private key)\nafter`);
  // A key that is cut off by the end of the text is taken out to the end.
  assert.equal(redactText('x -----BEGIN PRIVATE KEY-----\nMIIabc'), `x ${REDACTED} (a private key)`);

  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  assert.equal(redactText(`token is ${jwt} today`), `token is ${REDACTED} today`);
  assert.equal(redactText('Authorization: Bearer abcdefghijklmnop1234'), `Authorization: Bearer ${REDACTED}`);
  assert.equal(redactText('curl -H "Authorization: Basic dXNlcjpwYXNzd29yZDEyMw=="'), `curl -H "Authorization: Basic ${REDACTED}"`);

  // A name of a credential with a value that looks like one, as a log or a settings page shows it.
  assert.equal(redactText('DB_PASSWORD=hunter2hunter2'), `DB_PASSWORD=${REDACTED}`);
  assert.equal(redactText('  api_key: "sk9f8e7d6c5b4a3"'), `  api_key: "${REDACTED}"`);
  assert.equal(redactText('client-secret = A1b2C3d4E5f6 and more'), `client-secret = ${REDACTED} and more`);
  assert.equal(redactText('export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI7K7MDENG'), `export AWS_SECRET_ACCESS_KEY=${REDACTED}`);
  // An address in the text.
  assert.equal(redactText('[13] Link: Log -> /job/7/log?token=abc123&tail=1'), `[13] Link: Log -> /job/7/log?token=${REDACTED}&tail=1`);
  assert.equal(redactText('clone https://ci:t0ps3cret@git.example/x.git'), `clone https://${REDACTED}@git.example/x.git`);
});

test('what a page says about passwords and tokens in plain words stays readable', () => {
  // The lines a snapshot has for a password field, and sentences: none of them holds a secret.
  for (const plain of [
    '[31] Password: Password (value hidden)',
    '[10] Textbox: API token name = "deploy"',
    'Password: required',
    'Your token expires in 30 minutes.',
    'secret: none',
    'Heading (h2): Access tokens',
    'Status: authorization pending',
    'The signature of the release was verified.',
    'Bearer tokens are sent in a header.',
    'error: password authentication failed for user "ci"',
    'commit 4f2a9c1e7b3d5a6f8091a2b3c4d5e6f708192a3b',
    'build 512 passed in 3m 12s',
  ]) {
    assert.equal(redactText(plain), plain);
  }
  assert.equal(redactText(''), '');
});

test('long text is gone over in a time that does not grow out of hand', () => {
  // A log of a megabyte, with lines that begin like a match and are none: no pattern may crawl.
  const line = 'token '.repeat(20) + 'eyJ'.repeat(30) + ' password password password = \n';
  const big = line.repeat(Math.ceil(1_000_000 / line.length));
  const started = Date.now();
  redactText(big);
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
});

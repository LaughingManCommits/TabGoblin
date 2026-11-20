import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CommandError, activityLabel, checkClick, checkGate, failureNote, looksLikeSubmission, originOf,
  resolveNavigation, type Authorization, type ClickTarget,
} from '../src/policy.ts';

const ORIGIN = 'https://app.example';
const auth = (access: 'read' | 'write' = 'read'): Authorization => ({ tabId: 7, origin: ORIGIN, access });
const HERE = 'https://app.example/issues/12?tab=all';

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CommandError, `expected CommandError, got ${String(e)}`);
    return e.code;
  }
  return 'ok';
}

test('origin is scheme + hostname + port; only http(s) pages have one', () => {
  assert.equal(originOf('https://app.example/a/b?c#d'), 'https://app.example');
  assert.equal(originOf('http://app.example:8080/'), 'http://app.example:8080');
  assert.equal(originOf('https://app.example:443/'), 'https://app.example');
  for (const url of ['chrome://extensions', 'file:///C:/x.html', 'about:blank', 'javascript:alert(1)', 'not a url', '', undefined, null]) {
    assert.equal(originOf(url), null, String(url));
  }
});

test('every command is refused until the user authorizes an origin', () => {
  for (const action of ['snapshot', 'extract', 'click', 'fill', 'scroll', 'navigate', 'screenshot', 'wait_for']) {
    assert.equal(code(() => checkGate({ auth: null, paused: false }, action, HERE)), 'NOT_AUTHORIZED', action);
  }
  assert.equal(code(() => checkGate({ auth: null, paused: false }, 'status', undefined)), 'ok');
});

test('the authorized origin allows reading; other origins do not', () => {
  const state = { auth: auth(), paused: false };
  assert.equal(code(() => checkGate(state, 'snapshot', HERE)), 'ok');
  assert.equal(code(() => checkGate(state, 'navigate', 'https://app.example/other')), 'ok');
  const elsewhere = [
    'https://evil.example/issues/12',
    'https://sub.app.example/',        // subdomains are not included
    'https://example/',                // nor parent domains
    'http://app.example/',             // other scheme
    'https://app.example:8443/',       // other port
    'https://app.example.evil.test/',
    'chrome://settings',
    'about:blank',
  ];
  for (const url of elsewhere) {
    assert.equal(code(() => checkGate(state, 'snapshot', url)), 'ORIGIN_MISMATCH', url);
  }
});

test('an unknown tab URL fails closed', () => {
  assert.equal(code(() => checkGate({ auth: auth('write'), paused: false }, 'click', undefined)), 'ORIGIN_MISMATCH');
});

test('pause blocks everything except status', () => {
  const state = { auth: auth('write'), paused: true };
  for (const action of ['snapshot', 'extract', 'click', 'fill', 'scroll', 'navigate', 'screenshot', 'wait_for']) {
    assert.equal(code(() => checkGate(state, action, HERE)), 'PAUSED', action);
  }
  assert.equal(code(() => checkGate(state, 'status', HERE)), 'ok');
});

test('entering text needs write access', () => {
  assert.equal(code(() => checkGate({ auth: auth('read'), paused: false }, 'fill', HERE)), 'WRITE_NOT_AUTHORIZED');
  assert.equal(code(() => checkGate({ auth: auth('write'), paused: false }, 'fill', HERE)), 'ok');
});

test('there are no actions for scripts, cookies, storage or raw requests', () => {
  const state = { auth: auth('write'), paused: false };
  for (const action of ['evaluate', 'eval', 'cookies', 'storage', 'headers', 'request', 'fetch', 'debugger', '']) {
    assert.equal(code(() => checkGate(state, action, HERE)), 'UNSUPPORTED_ACTION', action);
  }
});

test('navigation resolves relative URLs and stays inside the origin', () => {
  assert.equal(resolveNavigation('/settings', HERE, ORIGIN), 'https://app.example/settings');
  assert.equal(resolveNavigation('13', HERE, ORIGIN), 'https://app.example/issues/13');
  assert.equal(resolveNavigation('?tab=open', HERE, ORIGIN), 'https://app.example/issues/12?tab=open');
  assert.equal(resolveNavigation('https://app.example/x#y', HERE, ORIGIN), 'https://app.example/x#y');
  assert.equal(resolveNavigation('HTTPS://APP.EXAMPLE:443/x', HERE, ORIGIN), 'https://app.example/x');
});

test('navigation outside the origin is rejected', () => {
  const blocked = [
    'https://evil.example/',
    '//evil.example/path',               // scheme-relative
    'https://sub.app.example/',
    'http://app.example/',
    'https://app.example:8443/',
    'https://app.example@evil.example/', // userinfo trick
    'https://user:pw@app.example/',      // embedded credentials
    'javascript:alert(1)',
    'data:text/html,<h1>x</h1>',
    'file:///etc/passwd',
    'chrome://settings',
    'view-source:https://app.example/',
    '\\\\evil.example\\share',
  ];
  for (const url of blocked) {
    assert.equal(code(() => resolveNavigation(url, HERE, ORIGIN)), 'NAVIGATION_BLOCKED', url);
  }
  assert.equal(code(() => resolveNavigation('https://', HERE, ORIGIN)), 'INVALID_URL');
});

const target = (over: Partial<ClickTarget> = {}): ClickTarget =>
  ({ readSafe: false, externalLink: false, submit: null, label: 'Thing', ...over });

test('read access may only click same-origin links and disclosure toggles', () => {
  assert.equal(checkClick('read', 'interact', target({ readSafe: true })), 'interact');
  assert.equal(code(() => checkClick('read', 'interact', target())), 'WRITE_NOT_AUTHORIZED');
  assert.equal(code(() => checkClick('read', 'interact', target({ submit: 'form' }))), 'WRITE_NOT_AUTHORIZED');
  assert.equal(code(() => checkClick('read', 'submit', target({ submit: 'form' }))), 'WRITE_NOT_AUTHORIZED');
  assert.equal(code(() => checkClick('read', 'submit', target({ readSafe: true }))), 'WRITE_NOT_AUTHORIZED');
});

test('write access clicks ordinary controls but submissions need explicit intent', () => {
  assert.equal(checkClick('write', 'interact', target()), 'interact');
  assert.equal(code(() => checkClick('write', 'interact', target({ submit: 'form' }))), 'SUBMIT_INTENT_REQUIRED');
  assert.equal(code(() => checkClick('write', 'interact', target({ submit: 'likely' }))), 'SUBMIT_INTENT_REQUIRED');
  assert.equal(checkClick('write', 'submit', target({ submit: 'form' })), 'submit');
  assert.equal(checkClick('write', 'submit', target({ submit: 'likely' })), 'submit');
  // Declaring a submission is always treated as one, so it can be put in front of the user.
  assert.equal(checkClick('write', 'submit', target()), 'submit');
});

test('links that leave the origin are never clicked', () => {
  for (const access of ['read', 'write'] as const) {
    for (const intent of ['interact', 'submit'] as const) {
      assert.equal(code(() => checkClick(access, intent, target({ externalLink: true }))), 'NAVIGATION_BLOCKED');
    }
  }
});

test('submission wording is recognised, ordinary UI wording is not', () => {
  for (const label of ['Submit', 'Save changes', 'Post comment', 'Delete draft', 'Send', 'Place order', 'Sign up', 'Log out', 'Merge pull request']) {
    assert.ok(looksLikeSubmission(label), label);
  }
  for (const label of ['Show statistics', 'Next page', 'Open menu', 'Load updates', 'Expand all', 'Postpone view', 'Savings', '']) {
    assert.ok(!looksLikeSubmission(label), label);
  }
});

test('activity wording is fixed text that cannot carry page content', () => {
  assert.deepEqual(activityLabel('fill'), { running: 'Entering text', done: 'Entered text' });
  assert.deepEqual(activityLabel('click'), { running: 'Clicking element', done: 'Clicked element' });
  assert.deepEqual(activityLabel('click', 'submit'), { running: 'Submitting', done: 'Submitted' });
  assert.deepEqual(activityLabel('<img src=x onerror=alert(1)>'), { running: 'Working', done: 'Done' });
  assert.equal(failureNote('WRITE_NOT_AUTHORIZED'), 'needs Write access');
  assert.equal(failureNote('whatever the page says'), 'failed');
});

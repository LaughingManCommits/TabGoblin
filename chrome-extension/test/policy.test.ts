import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CommandError, RateLimiter, RecentIds, activityLabel, checkClick, checkGate, checkKey, failureNote, inScope, isHighImpact,
  judgeSubmission, looksLikeSearch, looksLikeSubmission, originOf, parseKey, resolveNavigation, resolveSession,
  type ClickTarget, type KeyTarget, type Mode, type SessionAuth, type SubmitSignals,
} from '../src/policy.ts';

const ORIGIN = 'https://app.example';
const HERE = 'https://app.example/issues/12?tab=all';
const READ_ACTIONS = ['snapshot', 'extract', 'scroll', 'screenshot', 'wait_for'];
const EXPLORE_ACTIONS = ['navigate', 'click', 'press_key'];
const WRITE_ACTIONS = ['fill', 'submit'];
const ALL_ACTIONS = [...READ_ACTIONS, ...EXPLORE_ACTIONS, ...WRITE_ACTIONS];

function session(over: Partial<SessionAuth> = {}): SessionAuth {
  return {
    id: 's1', authorizationId: 'a1', tabId: 7, origin: ORIGIN, origins: [ORIGIN], mode: 'read', paused: false,
    suspended: false, clientId: 'c-me', clientName: 'IDE', expiresAt: null, ...over,
  };
}

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

test('every command is refused until the user authorizes a tab', () => {
  for (const action of ALL_ACTIONS) {
    assert.equal(code(() => checkGate(null, action, HERE)), 'NOT_AUTHORIZED', action);
  }
  assert.equal(code(() => checkGate(null, 'status', undefined)), 'ok');
});

test('Read looks, Explore also navigates, Write also operates', () => {
  const allowed: Record<Mode, string[]> = {
    read: READ_ACTIONS,
    explore: [...READ_ACTIONS, ...EXPLORE_ACTIONS],
    write: ALL_ACTIONS,
  };
  for (const mode of ['read', 'explore', 'write'] as const) {
    for (const action of ALL_ACTIONS) {
      const expected = allowed[mode].includes(action) ? 'ok'
        : WRITE_ACTIONS.includes(action) ? 'WRITE_NOT_AUTHORIZED' : 'EXPLORE_NOT_AUTHORIZED';
      assert.equal(code(() => checkGate(session({ mode }), action, HERE)), expected, `${mode} ${action}`);
    }
  }
});

test('other origins, subdomains, schemes and ports are outside the authorization', () => {
  const elsewhere = [
    'https://evil.example/issues/12',
    'https://sub.app.example/',
    'https://example/',
    'http://app.example/',
    'https://app.example:8443/',
    'https://app.example.evil.test/',
    'chrome://settings',
    'about:blank',
  ];
  for (const url of elsewhere) {
    assert.equal(code(() => checkGate(session({ mode: 'write' }), 'snapshot', url)), 'ORIGIN_MISMATCH', url);
  }
  assert.equal(code(() => checkGate(session({ mode: 'write' }), 'click', undefined)), 'ORIGIN_MISMATCH', 'unknown URL fails closed');
});

test('pause and expiry block everything except status', () => {
  for (const action of ALL_ACTIONS) {
    assert.equal(code(() => checkGate(session({ mode: 'write', paused: true }), action, HERE)), 'PAUSED', action);
    assert.equal(code(() => checkGate(session({ mode: 'write', expiresAt: 1000 }), action, HERE, 1000)), 'AUTHORIZATION_EXPIRED', action);
  }
  assert.equal(code(() => checkGate(session({ mode: 'write', expiresAt: 1000 }), 'snapshot', HERE, 999)), 'ok');
  assert.equal(code(() => checkGate(session({ paused: true }), 'status', HERE)), 'ok');
});

test('a session may span the sites the user added to it, and nothing else', () => {
  const sso = session({ mode: 'write', origins: [ORIGIN, 'https://login.example'] });
  assert.equal(code(() => checkGate(sso, 'snapshot', 'https://login.example/signin')), 'ok');
  assert.equal(code(() => checkGate(sso, 'snapshot', HERE)), 'ok');
  assert.equal(code(() => checkGate(sso, 'snapshot', 'https://evil.example/')), 'ORIGIN_MISMATCH');
  assert.equal(code(() => checkGate(sso, 'snapshot', 'https://sub.login.example/')), 'ORIGIN_MISMATCH');
  assert.equal(inScope(sso.origins, 'https://login.example/x'), true);
  assert.equal(inScope(sso.origins, undefined), false);
  assert.equal(inScope([], HERE), false);
  assert.equal(resolveNavigation('https://login.example/signin', HERE, sso.origins), 'https://login.example/signin');
  assert.equal(code(() => resolveNavigation('https://other.example/', HERE, sso.origins)), 'NAVIGATION_BLOCKED');
});

test('a suspended session exposes nothing, even on a page it is authorized for', () => {
  const suspended = session({ mode: 'write', suspended: true });
  for (const action of ALL_ACTIONS) {
    assert.equal(code(() => checkGate(suspended, action, HERE)), 'SESSION_SUSPENDED', action);
  }
  assert.equal(code(() => checkGate(suspended, 'status', HERE)), 'ok');
});

test('there are no actions for scripts, cookies, storage or raw requests', () => {
  for (const action of ['evaluate', 'eval', 'cookies', 'storage', 'headers', 'request', 'fetch', 'debugger', '']) {
    assert.equal(code(() => checkGate(session({ mode: 'write' }), action, HERE)), 'UNSUPPORTED_ACTION', action);
  }
});

test('an agent reaches only its own sessions, and must name one when it has several', () => {
  const mine = session({ id: 's1', clientId: 'c-me' });
  const theirs = session({ id: 's2', clientId: 'c-other', clientName: 'Other', origin: 'https://docs.example' });
  const me = { id: 'c-me', name: 'IDE' };
  const connected = new Set(['c-me', 'c-other']);

  assert.deepEqual(resolveSession([mine, theirs], me, undefined, connected), { session: mine, claim: false });
  assert.deepEqual(resolveSession([mine, theirs], me, 's1', connected), { session: mine, claim: false });
  assert.equal(code(() => resolveSession([mine, theirs], me, 's2', connected)), 'SESSION_NOT_OWNED');
  assert.equal(code(() => resolveSession([mine, theirs], me, 's9', connected)), 'UNKNOWN_SESSION');
  assert.equal(code(() => resolveSession([theirs], me, undefined, connected)), 'NOT_AUTHORIZED');

  const second = session({ id: 's3', clientId: 'c-me', origin: 'https://wiki.example' });
  assert.equal(code(() => resolveSession([mine, second], me, undefined, connected)), 'SESSION_REQUIRED');
  assert.deepEqual(resolveSession([mine, second], me, 's3', connected), { session: second, claim: false });
});

test('an unclaimed session goes to the first agent that uses it', () => {
  const open = session({ clientId: null, clientName: null });
  const resolved = resolveSession([open], { id: 'c-me', name: 'IDE' }, undefined, new Set(['c-me']));
  assert.equal(resolved.session, open);
  assert.equal(resolved.claim, true);
});

test('a restarted agent takes its sessions back, but never those of an agent that is still there', () => {
  const left = session({ clientId: 'c-old', clientName: 'IDE' });
  const reborn = { id: 'c-new', name: 'IDE' };
  // The old server process is gone: the same-named agent continues.
  assert.deepEqual(resolveSession([left], reborn, 's1', new Set(['c-new'])), { session: left, claim: true });
  // The owner is still connected: no takeover, even with the same name.
  assert.equal(code(() => resolveSession([left], reborn, 's1', new Set(['c-new', 'c-old']))), 'SESSION_NOT_OWNED');
  // A different agent never inherits, and a nameless one matches nobody.
  assert.equal(code(() => resolveSession([left], { id: 'c-x', name: 'Other' }, 's1', new Set(['c-x']))), 'SESSION_NOT_OWNED');
  assert.equal(code(() => resolveSession([session({ clientId: 'c-old', clientName: null })], { id: 'c-x', name: '' }, 's1', new Set(['c-x']))), 'SESSION_NOT_OWNED');
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
    '//evil.example/path',
    'https://sub.app.example/',
    'http://app.example/',
    'https://app.example:8443/',
    'https://app.example@evil.example/',
    'https://user:pw@app.example/',
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
  ({ readSafe: false, disclosure: false, externalLink: false, submit: null, label: 'Thing', ...over });

test('Read cannot click; Explore clicks links and expanders only', () => {
  assert.equal(code(() => checkClick('read', 'interact', target({ readSafe: true }))), 'EXPLORE_NOT_AUTHORIZED');
  assert.equal(checkClick('explore', 'interact', target({ readSafe: true })), 'interact');
  assert.equal(checkClick('explore', 'interact', target({ disclosure: true })), 'interact');
  assert.equal(code(() => checkClick('explore', 'interact', target())), 'WRITE_NOT_AUTHORIZED');
  assert.equal(code(() => checkClick('explore', 'interact', target({ submit: 'form' }))), 'WRITE_NOT_AUTHORIZED');
  assert.equal(code(() => checkClick('explore', 'interact', target({ disclosure: true, submit: 'likely' }))), 'WRITE_NOT_AUTHORIZED');
  assert.equal(code(() => checkClick('explore', 'submit', target({ readSafe: true }))), 'WRITE_NOT_AUTHORIZED');
});

test('Write clicks ordinary controls but submissions need explicit intent', () => {
  assert.equal(checkClick('write', 'interact', target()), 'interact');
  assert.equal(code(() => checkClick('write', 'interact', target({ submit: 'form' }))), 'SUBMIT_INTENT_REQUIRED');
  assert.equal(code(() => checkClick('write', 'interact', target({ submit: 'likely' }))), 'SUBMIT_INTENT_REQUIRED');
  assert.equal(checkClick('write', 'submit', target({ submit: 'form' })), 'submit');
  assert.equal(checkClick('write', 'submit', target()), 'submit');
});

test('links that leave the origin are never clicked', () => {
  for (const mode of ['read', 'explore', 'write'] as const) {
    for (const intent of ['interact', 'submit'] as const) {
      assert.equal(code(() => checkClick(mode, intent, target({ externalLink: true }))), 'NAVIGATION_BLOCKED');
    }
  }
});

test('submission and high-impact wording is recognised, ordinary UI wording is not', () => {
  for (const label of ['Submit', 'Save changes', 'Post comment', 'Delete draft', 'Send', 'Place order', 'Sign up', 'Log out', 'Merge pull request']) {
    assert.ok(looksLikeSubmission(label), label);
  }
  for (const label of ['Show statistics', 'Next page', 'Open menu', 'Load updates', 'Expand all', 'Postpone view', 'Savings', '']) {
    assert.ok(!looksLikeSubmission(label), label);
  }
  for (const label of ['Delete account', 'Pay now', 'Buy', 'Transfer funds', 'Publish release', 'Remove member']) {
    assert.ok(isHighImpact(label), label);
  }
  for (const label of ['Save draft', 'Post comment', 'Search', 'Update profile', 'Payment history']) {
    assert.ok(!isHighImpact(label), label);
  }
});

test('keys are normalised; moving around needs Explore, typing and Enter need Write', () => {
  assert.deepEqual(parseKey('enter'), { key: 'Enter', mode: 'write' });
  assert.deepEqual(parseKey('Esc'), { key: 'Escape', mode: 'explore' });
  assert.deepEqual(parseKey('shift+tab'), { key: 'Shift+Tab', mode: 'explore' });
  assert.deepEqual(parseKey('ArrowDown'), { key: 'ArrowDown', mode: 'explore' });
  assert.deepEqual(parseKey('Space'), { key: ' ', mode: 'write' });
  assert.deepEqual(parseKey('a'), { key: 'a', mode: 'write' });
  assert.deepEqual(parseKey('é'), { key: 'é', mode: 'write' });
  for (const bad of ['Control+A', 'F5', 'ab', 'Meta', '']) {
    assert.equal(code(() => parseKey(bad)), 'INVALID_ARGUMENT', bad);
  }
});

const key = (over: Partial<KeyTarget> = {}): KeyTarget => ({ submit: null, click: null, label: 'Message', ...over });

test('Enter in a text box is a submission: it needs intent, and is then put to the user', () => {
  // A key that submits nothing and activates nothing is simply pressed.
  assert.equal(checkKey('write', 'interact', key()), 'press');
  assert.equal(checkKey('explore', 'interact', key()), 'press');

  for (const submit of ['form', 'text'] as const) {
    assert.equal(code(() => checkKey('write', 'interact', key({ submit }))), 'SUBMIT_INTENT_REQUIRED', submit);
    assert.equal(checkKey('write', 'submit', key({ submit })), 'ask', submit);
    assert.equal(code(() => checkKey('explore', 'submit', key({ submit }))), 'WRITE_NOT_AUTHORIZED', submit);
  }
  // The refusal says how a line break is entered instead, so that an agent does not reach for intent.
  try {
    checkKey('write', 'interact', key({ submit: 'text' }));
    assert.fail('expected a refusal');
  } catch (e) {
    assert.match((e as Error).message, /line break.*browser_fill/);
  }
});

test('a key that activates a control is a click on it, with the rules of a click', () => {
  const click = (over: Partial<ClickTarget> = {}): KeyTarget => key({ click: target(over) });
  assert.equal(checkKey('write', 'interact', click()), 'press');
  assert.equal(code(() => checkKey('write', 'interact', click({ submit: 'form' }))), 'SUBMIT_INTENT_REQUIRED');
  assert.equal(code(() => checkKey('write', 'interact', click({ submit: 'likely' }))), 'SUBMIT_INTENT_REQUIRED');
  assert.equal(checkKey('write', 'submit', click({ submit: 'form' })), 'click', 'declared: run as a submission of that control');
  assert.equal(code(() => checkKey('write', 'interact', click({ externalLink: true }))), 'NAVIGATION_BLOCKED');
  assert.equal(code(() => checkKey('write', 'submit', click({ externalLink: true }))), 'NAVIGATION_BLOCKED');
});

test('search wording is recognised, so that Enter in a search box is not held up', () => {
  for (const label of ['Search', 'Search issues…', 'Filter by name', 'Find in page', 'Go to file']) assert.ok(looksLikeSearch(label), label);
  for (const label of ['Message', 'Write a comment', 'New note', 'Reply', 'Research notes', '']) assert.ok(!looksLikeSearch(label), label);
});

const signals = (over: Partial<SubmitSignals> = {}): SubmitSignals => ({
  expectSeen: false, submittedSeen: false, newAlerts: [], invalidFields: [], newStatuses: [], formGone: false, fieldsCleared: false,
  urlChanged: false, documentChanged: false, ...over,
});

test('a dispatched click alone is never a confirmed submission', () => {
  const silent = judgeSubmission(signals(), false);
  assert.equal(silent.state, 'UNCERTAIN');
  assert.equal(silent.verified, null);
  assert.match(silent.evidence[0], /no visible reaction/);
});

test('submissions are confirmed by content or by the page reacting, and failed by error signals', () => {
  const seen = judgeSubmission(signals({ expectSeen: true, fieldsCleared: true }), true);
  assert.deepEqual([seen.state, seen.verified], ['CONFIRMED', 'content']);

  // Expected text was named but never showed up: not confirmed, however the page reacted.
  const missing = judgeSubmission(signals({ fieldsCleared: true, newStatuses: ['Saved'] }), true);
  assert.equal(missing.state, 'UNCERTAIN');
  assert.ok(missing.evidence.includes('the expected text did not appear'));

  for (const reaction of [{ fieldsCleared: true }, { formGone: true }, { documentChanged: true }, { urlChanged: true }, { newStatuses: ['Saved'] }]) {
    const verdict = judgeSubmission(signals(reaction), false);
    assert.deepEqual([verdict.state, verdict.verified], ['CONFIRMED', 'reaction'], JSON.stringify(reaction));
  }

  // Nothing was named, but the submitted text showed up on the page: that is content, not just a reaction.
  const recognised = judgeSubmission(signals({ submittedSeen: true, fieldsCleared: true }), false);
  assert.deepEqual([recognised.state, recognised.verified], ['CONFIRMED', 'content']);
  assert.equal(recognised.evidence[0], 'the submitted text is now visible on the page');
  // A named expectation is stricter: it has to be that text.
  assert.equal(judgeSubmission(signals({ submittedSeen: true }), true).state, 'UNCERTAIN');

  // An error wins over everything else, including the expected text.
  const failed = judgeSubmission(signals({ expectSeen: true, newAlerts: ['Title is required'], invalidFields: ['Title'] }), true);
  assert.equal(failed.state, 'FAILED');
  assert.match(failed.evidence.join(' | '), /Title is required/);
  assert.equal(judgeSubmission(signals({ invalidFields: ['Email'] }), false).state, 'FAILED');
});

test('the rate limiter allows a burst and then the steady rate', () => {
  const limiter = new RateLimiter(10, 3, 0);
  assert.deepEqual([limiter.tryTake(0), limiter.tryTake(0), limiter.tryTake(0), limiter.tryTake(0)], [true, true, true, false]);
  assert.equal(limiter.tryTake(100), true, 'one token back after 100ms at 10/s');
  assert.equal(limiter.tryTake(100), false);
  assert.equal(limiter.tryTake(10_000), true);
});

test('replayed command ids are recognised', () => {
  const seen = new RecentIds(3);
  assert.equal(seen.add('1'), true);
  assert.equal(seen.add('1'), false);
  seen.add('2');
  seen.add('3');
  seen.add('4');
  assert.equal(seen.add('4'), false);
  assert.equal(seen.add('1'), true, 'the oldest id has aged out of the bounded memory');
});

test('activity wording is fixed text that cannot carry page content', () => {
  assert.deepEqual(activityLabel('fill'), { running: 'Entering text', done: 'Entered text' });
  assert.deepEqual(activityLabel('click', 'submit'), { running: 'Submitting', done: 'Submitted' });
  assert.deepEqual(activityLabel('submit'), { running: 'Submitting', done: 'Submitted' });
  assert.deepEqual(activityLabel('press_key'), { running: 'Pressing key', done: 'Pressed key' });
  assert.deepEqual(activityLabel('<img src=x onerror=alert(1)>'), { running: 'Working', done: 'Done' });
  assert.equal(failureNote('WRITE_NOT_AUTHORIZED'), 'needs Write access');
  assert.equal(failureNote('SESSION_NOT_OWNED'), 'another agent\'s session');
  assert.equal(failureNote('whatever the page says'), 'failed');
});

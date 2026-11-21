import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PANELS, agentsSummary, foldedOf, sessionsSummary, settingsSummary, withFolded } from '../src/panels.ts';

test('only the four panels fold; the prompt and the pairing form do not', () => {
  assert.deepEqual([...PANELS], ['sessions', 'activity', 'agents', 'settings']);
  // What was stored is read with suspicion: known names only, each once, in the popup's order.
  assert.deepEqual(foldedOf(['settings', 'confirm', 'activity', 'activity', 7]), ['activity', 'settings']);
  assert.deepEqual(foldedOf('activity'), []);
  assert.deepEqual(foldedOf(undefined), []);

  assert.deepEqual(withFolded([], 'agents', true), ['agents']);
  assert.deepEqual(withFolded(['agents'], 'sessions', true), ['sessions', 'agents']);
  assert.deepEqual(withFolded(['sessions', 'agents'], 'agents', false), ['sessions']);
  assert.deepEqual(withFolded(['sessions'], 'sessions', true), ['sessions'], 'folding twice is folding once');
  // A question that waits for the user cannot be folded away, whatever is asked for.
  assert.deepEqual(withFolded(['sessions'], 'confirm', true), ['sessions']);
  assert.deepEqual(withFolded(['sessions'], 'pairing', true), ['sessions']);
  assert.deepEqual(withFolded(['sessions'], undefined, true), ['sessions']);
});

test('a folded Sessions panel says how many tabs, whether this is one, and what needs the user', () => {
  const session = (id: string, tabId: number, more: object = {}) => ({ id, tabId, suspended: false, paused: false, ...more });
  assert.deepEqual(sessionsSummary([], 5, true), { text: 'No tab is authorized', state: null });
  assert.deepEqual(sessionsSummary([session('s1', 5)], 5, false), { text: '1 tab · this tab: s1', state: null });
  assert.deepEqual(sessionsSummary([session('s1', 5), session('s2', 6)], 7, true), { text: '2 tabs · not this tab', state: null });
  // A page that cannot be authorized, a browser page for one, is not said to be missing.
  assert.deepEqual(sessionsSummary([session('s1', 5)], 7, false), { text: '1 tab', state: null });
  // What needs the user is said apart, and a suspended session before a paused one.
  assert.deepEqual(sessionsSummary([session('s1', 5, { suspended: true }), session('s2', 6, { paused: true })], 5, false),
    { text: '2 tabs · this tab: s1', state: '1 suspended' });
  assert.deepEqual(sessionsSummary([session('s1', 5, { paused: true }), session('s2', 6, { paused: true })], 9, false),
    { text: '2 tabs', state: '2 paused' });
});

test('folded Agents and Settings panels say what is inside in one line', () => {
  assert.equal(agentsSummary(['IntelliJ IDEA', 'claude-code'], 0), 'IntelliJ IDEA, claude-code');
  assert.equal(agentsSummary(['claude-code'], 1), 'claude-code · 1 disconnected by you');
  assert.equal(agentsSummary([], 2), '2 disconnected by you');
  assert.equal(agentsSummary([], 0), 'None connected');
  assert.equal(settingsSummary('Ask every time', true), 'Ask every time · indicator on');
  assert.equal(settingsSummary('Do not ask', false), 'Do not ask · indicator off');
});

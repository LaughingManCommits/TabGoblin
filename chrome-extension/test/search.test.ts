import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PATTERN, MAX_TESTED, PatternError, compilePattern, literalTest, searchLines } from '../src/search.ts';

test('a pattern finds the lines the engine\'s own expression finds, ignoring case', () => {
  const cases: [string, string, boolean][] = [
    ['error', 'An ERROR here', true],
    ['^\\s*at ', '   at foo', true],
    ['^at', 'x at', false],
    ['\\d+ms', 'took 35ms', true],
    ['\\d+\\.\\d+\\.\\d+', 'v1.22.3', true],
    ['ERROR|FATAL', 'fatal: x', true],
    ['(?:err|warn)ing\\b', 'a warning', true],
    ['(?<level>warn|info) ', 'INFO done', true],
    ['\\bcat\\b', 'concat', false],
    ['\\Bcat', 'concat', true],
    ['[A-F0-9]{4}', 'xx 0aBc', true],
    ['[^a-z ]', 'abc def', false],
    ['[\\]x-]', 'a]', true],
    ['[\\d.]+$', 'v 1.5', true],
    ['a{2,3}$', 'baa', true],
    ['a{2,3}$', 'ba', false],
    ['a{2}', 'a', false],
    ['colou?r', 'COLOR', true],
    ['x.*y.*z', 'x1y2z', true],
    ['x.*y.*z', 'x1z2y', false],
    ['.+?x', 'abx', true],
    ['\\[\\d+:\\d+\\]', 'at [12:30]', true],
    ['a|', 'zzz', true],
    ['(a?)*b', 'aab', true],
    ['\\.$', 'end.', true],
    ['\\-\\/\\:', 'a-/:', true],
    ['a{,2}', 'a{,2}', true],
    ['\\x41\\u0042', 'ab', true],
    ['é', 'CAFÉ', true],
    ['^$', '', true],
    ['^$', ' ', false],
  ];
  for (const [pattern, line, expected] of cases) {
    assert.equal(compilePattern(pattern)(line), expected, `${pattern} on ${JSON.stringify(line)}`);
    assert.equal(new RegExp(pattern, 'i').test(line), expected, `the engine disagrees about ${pattern}`);
  }
});

test('a pattern that could take long, or cannot be run without backtracking, is refused with the reason', () => {
  const refused: [string, RegExp][] = [
    ['(a+)+', /Nested repetition/],
    ['(a*)*', /Nested repetition/],
    ['(a|b+)+', /Nested repetition/],
    ['((a+)b)*', /Nested repetition/],
    ['(a{2,3}){2}', /Nested repetition/],
    ['(?:x(\\d+))*', /Nested repetition/],
    ['(a)\\1', /Backreferences/],
    ['(?<n>a)\\k<n>', /Backreferences/],
    ['(?=a)b', /Lookahead and lookbehind/],
    ['(?<!a)b', /Lookahead and lookbehind/],
    ['a**', /repetition directly after a repetition/],
    ['a+{2}', /repetition directly after a repetition/],
    ['*a', /Nothing to repeat/],
    ['^*', /cannot be repeated/],
    ['(a', /not closed/],
    ['a)', /no group to close/],
    ['[a', /not closed/],
    ['[z-a]', /out of order/],
    ['a{3,2}', /out of order/],
    ['\\p{L}', /not supported/],
    ['a\\', /ends with a backslash/],
    ['a{1,3000}', /too large/],
    ['', /1-200 characters/],
    ['x'.repeat(MAX_PATTERN + 1), /1-200 characters/],
  ];
  for (const [pattern, reason] of refused) {
    assert.throws(() => compilePattern(pattern), (e: unknown) => e instanceof PatternError && reason.test(e.message), pattern);
  }
  // A repetition in a group that is not itself repeated, and one in an optional group, are fine.
  for (const pattern of ['(a+)b', '(\\d+\\.)?\\d+', '(a?){3}', 'x'.repeat(MAX_PATTERN)]) compilePattern(pattern);
});

test('patterns that make a backtracking engine take minutes are answered at once', () => {
  const line = 'a'.repeat(MAX_TESTED);
  const started = Date.now();
  for (const pattern of ['.*.*.*x', '(a?){60}a{60}x', '(a|a)+b', '.*a.*a.*a.*a.*b', '[a-z]*[a-z]*[a-z]*\\d']) {
    assert.equal(compilePattern(pattern)(line), false, pattern);
  }
  assert.ok(Date.now() - started < 2000, `took ${Date.now() - started} ms`);
});

test('only the start of a very long line is tested against a pattern', () => {
  const line = `${'a'.repeat(MAX_TESTED)}needle`;
  assert.equal(compilePattern('needle')(line), false);
  assert.equal(compilePattern('a$')(line), true);
  assert.equal(literalTest('NEEDLE')(line), true);
});

test('a search counts every match, keeps the first ones, and stops when its time is used up', () => {
  const lines = ['one', 'two error', 'three', 'Error four', 'five error', 'six'];
  const now = () => 0;
  const all = searchLines(lines, literalTest('error'), { from: 0, keep: 2, budgetMs: 250, now });
  assert.deepEqual(all, { lines: [1, 3], total: 3, searched: 6, stoppedAt: null });
  assert.deepEqual(searchLines(lines, literalTest('error'), { from: 2, keep: 5, budgetMs: 250, now }).lines, [3, 4]);
  assert.deepEqual(searchLines(lines, literalTest('error'), { from: 0, keep: 5, budgetMs: 250, now, within: (i) => i < 3 }),
    { lines: [1], total: 1, searched: 3, stoppedAt: null });

  // A clock that moves 100 ms with every look at it: the third line is not reached in time.
  let clock = 0;
  const slow = searchLines(lines, literalTest('error'), { from: 0, keep: 5, budgetMs: 250, now: () => (clock += 100) });
  assert.deepEqual(slow, { lines: [1], total: 1, searched: 2, stoppedAt: 2 });
});

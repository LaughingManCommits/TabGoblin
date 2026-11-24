import assert from 'node:assert/strict';
import { test } from 'node:test';
import { afterPage, afterScroll, withContext } from '../src/collect.ts';

const lines = (from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `row ${from + i}`);

test('after a scroll only what was not read before is new, whether the page grew or its window moved', () => {
  // A page that loads on scroll: what was there, and more.
  assert.deepEqual(afterScroll(lines(1, 20), lines(1, 30)), lines(21, 30));
  // A list that draws only what is in view: the window moved by five rows.
  assert.deepEqual(afterScroll(lines(1, 10), lines(6, 15)), lines(11, 15));
  // Nothing moved: nothing is new.
  assert.deepEqual(afterScroll(lines(1, 10), lines(1, 10)), []);
  // The window jumped past its end: all of it is new, and nothing is guessed about the gap.
  assert.deepEqual(afterScroll(lines(1, 10), lines(30, 35)), lines(30, 35));
  assert.deepEqual(afterScroll([], lines(1, 3)), lines(1, 3));
  assert.deepEqual(afterScroll(lines(1, 3), []), []);
});

test('a line that is repeated is kept as often as the page has it', () => {
  // A log says "ok" many times. Taken by what a line says, all but one would be lost.
  const before = ['start', 'ok', 'ok', 'ok'];
  const now = ['start', 'ok', 'ok', 'ok', 'ok', 'ok', 'done'];
  assert.deepEqual(afterScroll(before, now), ['ok', 'ok', 'done']);
  // A window over such a log: the longest end that fits is taken for what was read.
  assert.deepEqual(afterScroll(['a', 'ok', 'ok'], ['ok', 'ok', 'ok', 'b']), ['ok', 'b']);
});

test('of a further page only its own lines are new: not the header and footer every page has', () => {
  const page = (rows: string[]): string[] => ['Results', 'Sorted by date', ...rows, 'Previous', 'Next', 'Imprint'];
  assert.deepEqual(afterPage(page(lines(1, 5)), page(lines(6, 10))), lines(6, 10));
  // The last page is shorter, and has no "Next".
  assert.deepEqual(afterPage(page(lines(6, 10)), ['Results', 'Sorted by date', 'row 11', 'Previous', 'Imprint']), ['row 11', 'Previous']);
  // The same page again: nothing of its own.
  assert.deepEqual(afterPage(page(lines(1, 5)), page(lines(1, 5))), []);
  // A row that happens to equal one of the page before, in another place, is kept.
  assert.deepEqual(afterPage(['H', 'x', 'y', 'F'], ['H', 'y', 'x', 'F']), ['y', 'x']);
  assert.deepEqual(afterPage([], ['a']), ['a']);
});

test('lines that match are returned with the lines around them, and a mark where others were left out', () => {
  const log = ['build', 'compile', 'ERROR one', '  at a', '  at b', 'test', 'test', 'test', 'ERROR two', '  at c', 'end'];
  const found = withContext(log, (line) => line.includes('ERROR'), 1);
  assert.equal(found.matched, 2);
  assert.deepEqual(found.lines, ['compile', 'ERROR one', '  at a', '---', 'test', 'ERROR two', '  at c']);
  // Contexts that touch are one run.
  assert.deepEqual(withContext(log, (line) => line.includes('ERROR'), 3).lines, log.slice(0, 11));
  assert.deepEqual(withContext(log, (line) => line.includes('ERROR'), 0).lines, ['ERROR one', '---', 'ERROR two']);
  assert.deepEqual(withContext(log, () => false, 5), { lines: [], matched: 0 });
});

// Searching the lines of a rendered text: a literal, or a bounded regular expression. Pure string
// code (no DOM, no chrome.*).
//
// The page's text and the pattern both come from outside, so a search must not be able to hang
// the page. The regular expressions here are therefore not the engine's own: a pattern is
// compiled to a small automaton that is run without backtracking, which takes a time
// proportional to the line's length times the pattern's size, whatever the two contain. What
// that cannot express (backreferences, lookaround) is refused, as is a repetition inside a
// repeated group.

/** A pattern that is refused, with the reason in words an agent can act on. */
export class PatternError extends Error {}

export const MAX_PATTERN = 200;
/** Characters of a line that a regular expression is tested against. */
export const MAX_TESTED = 2000;
const MAX_STATES = 2000;

type Test = (code: number) => boolean;

type Node =
  | { type: 'char'; test: Test }
  | { type: 'assert'; kind: 'start' | 'end' | 'word' | 'notword' }
  | { type: 'alt'; branches: Node[][] }
  | { type: 'repeat'; body: Node; min: number; max: number };

const isDigit: Test = (c) => c >= 48 && c <= 57;
const isWord: Test = (c) => isDigit(c) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const isSpace: Test = (c) => c === 32 || (c >= 9 && c <= 13) || c === 0xa0 || c === 0xfeff || c === 0x2028 || c === 0x2029
  || (c >= 0x2000 && c <= 0x200a) || c === 0x1680 || c === 0x202f || c === 0x205f || c === 0x3000;
const not = (test: Test): Test => (c) => !test(c);

const lower = (c: number): number => String.fromCharCode(c).toLowerCase().charCodeAt(0);
/** Lines are tested in lower case; a class of characters is asked about the capital letter as well. */
const upper = (c: number): number => (c >= 97 && c <= 122 ? c - 32 : c < 128 ? c : String.fromCharCode(c).toUpperCase().charCodeAt(0));
const anyCase = (test: Test): Test => (c) => test(c) || test(upper(c));
const literal = (code: number): Test => {
  const low = lower(code);
  return (c) => c === low;
};

const CLASSES: Record<string, Test> = {
  d: isDigit, D: not(isDigit), w: isWord, W: not(isWord), s: isSpace, S: not(isSpace),
};
const CONTROLS: Record<string, number> = { t: 9, n: 10, v: 11, f: 12, r: 13, 0: 0 };

/** Whether a repetition that can run more than once lies anywhere in the node. */
function repeats(node: Node): boolean {
  if (node.type === 'repeat') return node.max > 1 || repeats(node.body);
  if (node.type === 'alt') return node.branches.some((branch) => branch.some(repeats));
  return false;
}

/** Reads a pattern into its parts, or throws a PatternError that says what is not accepted. */
function parse(pattern: string): Node {
  let at = 0;
  const peek = (): string => pattern[at] ?? '';
  const fail = (message: string): never => {
    throw new PatternError(message);
  };

  /** What follows a backslash: one character or a class of them. `inSet`: inside [...]. */
  const escape = (inSet: boolean): { code?: number; test?: Test; assert?: 'word' | 'notword' } => {
    const ch = pattern[at++];
    if (ch === undefined) return fail('The pattern ends with a backslash.');
    if (CLASSES[ch]) return { test: CLASSES[ch] };
    if (ch >= '1' && ch <= '9') return fail(`Backreferences (\\${ch}) are not supported.`);
    if (ch === 'k') return fail('Backreferences (\\k<name>) are not supported.');
    if (ch === 'b') return inSet ? { code: 8 } : { assert: 'word' };
    if (ch === 'B' && !inSet) return { assert: 'notword' };
    if (ch in CONTROLS) return { code: CONTROLS[ch] };
    if (ch === 'x' || ch === 'u') {
      const digits = ch === 'x' ? 2 : 4;
      const hex = pattern.slice(at, at + digits);
      if (!new RegExp(`^[0-9a-fA-F]{${digits}}$`).test(hex)) return fail(`\\${ch} must be followed by ${digits} hexadecimal digits.`);
      at += digits;
      return { code: parseInt(hex, 16) };
    }
    if (/[A-Za-z]/.test(ch)) return fail(`The escape \\${ch} is not supported.`);
    return { code: ch.charCodeAt(0) };
  };

  const set = (): Node => {
    const negated = peek() === '^';
    if (negated) at++;
    const tests: Test[] = [];
    let first = true;
    for (;;) {
      if (at >= pattern.length) return fail('A character class [ is not closed.');
      let ch = pattern[at++];
      if (ch === ']' && !first) break;
      first = false;
      let code: number;
      if (ch === '\\') {
        const e = escape(true);
        if (e.test) {
          tests.push(e.test);
          continue;
        }
        code = e.code as number;
      } else {
        code = ch.charCodeAt(0);
      }
      if (peek() === '-' && pattern[at + 1] !== undefined && pattern[at + 1] !== ']') {
        at++;
        ch = pattern[at++];
        let to: number;
        if (ch === '\\') {
          const e = escape(true);
          if (e.code === undefined) return fail('A range in a character class cannot end with a class such as \\d.');
          to = e.code;
        } else {
          to = ch.charCodeAt(0);
        }
        if (to < code) return fail('A range in a character class is out of order.');
        const from = code;
        tests.push((c) => c >= from && c <= to);
      } else {
        const one = code;
        tests.push((c) => c === one);
      }
    }
    const inSet = anyCase((c) => tests.some((test) => test(c)));
    return { type: 'char', test: negated ? not(inSet) : inSet };
  };

  /** `{n}`, `{n,}` or `{n,m}` at the cursor, or null when the brace is an ordinary character. */
  const braces = (): { min: number; max: number } | null => {
    const m = /^\{(\d{1,4})(?:(,)(\d{1,4})?)?\}/.exec(pattern.slice(at));
    if (!m) return null;
    at += m[0].length;
    const min = Number(m[1]);
    const max = m[2] ? (m[3] !== undefined ? Number(m[3]) : Infinity) : min;
    if (max < min) return fail('A repetition {n,m} is out of order.');
    return { min, max };
  };

  const alternatives = (inGroup: boolean): Node => {
    const branches: Node[][] = [[]];
    for (;;) {
      if (at >= pattern.length) {
        if (inGroup) return fail('A group ( is not closed.');
        break;
      }
      const ch = pattern[at++];
      const branch = branches[branches.length - 1];
      if (ch === ')') {
        if (!inGroup) return fail('A ) has no group to close.');
        break;
      }
      if (ch === '|') {
        branches.push([]);
        continue;
      }
      let atom: Node;
      if (ch === '(') {
        if (peek() === '?') {
          const head = pattern.slice(at, at + 3);
          if (head.startsWith('?:')) {
            at += 2;
          } else if (/^\?<[A-Za-z_$]/.test(head)) {
            const close = pattern.indexOf('>', at);
            if (close < 0) return fail('A group name is not closed.');
            at = close + 1;
          } else {
            return fail('Lookahead and lookbehind groups are not supported.');
          }
        }
        atom = alternatives(true);
      } else if (ch === '[') {
        atom = set();
      } else if (ch === '.') {
        atom = { type: 'char', test: (c) => c !== 10 && c !== 13 };
      } else if (ch === '^') {
        atom = { type: 'assert', kind: 'start' };
      } else if (ch === '$') {
        atom = { type: 'assert', kind: 'end' };
      } else if (ch === '\\') {
        const e = escape(false);
        atom = e.assert ? { type: 'assert', kind: e.assert }
          : e.test ? { type: 'char', test: e.test }
            : { type: 'char', test: literal(e.code as number) };
      } else if (ch === '*' || ch === '+' || ch === '?') {
        return fail(`Nothing to repeat before ${ch}.`);
      } else {
        atom = { type: 'char', test: literal(ch.charCodeAt(0)) };
      }

      const next = peek();
      let count: { min: number; max: number } | null = null;
      if (next === '*' || next === '+' || next === '?') {
        at++;
        count = next === '*' ? { min: 0, max: Infinity } : next === '+' ? { min: 1, max: Infinity } : { min: 0, max: 1 };
      } else if (next === '{') {
        count = braces();
      }
      if (count) {
        // A lazy repetition finds the same lines as a greedy one.
        if (peek() === '?') at++;
        if (peek() === '*' || peek() === '+' || (peek() === '{' && /^\{\d+(,\d*)?\}/.test(pattern.slice(at)))) {
          return fail('A repetition directly after a repetition is not supported.');
        }
        if (atom.type === 'assert') return fail('An anchor (^, $, \\b) cannot be repeated.');
        if (count.max > 1 && repeats(atom)) {
          return fail('Nested repetition, such as (a+)+ or (a|b*)*, is not supported: a repeated group may not contain * or + or {n,m}.');
        }
        atom = { type: 'repeat', body: atom, min: count.min, max: count.max };
      }
      branch.push(atom);
    }
    return { type: 'alt', branches };
  };

  return alternatives(false);
}

type State =
  | { type: 'char'; test: Test; out: number }
  | { type: 'split'; out: number; other: number }
  | { type: 'assert'; kind: 'start' | 'end' | 'word' | 'notword'; out: number }
  | { type: 'match' };

interface Program {
  states: State[];
  start: number;
}

function build(root: Node): Program {
  const states: State[] = [{ type: 'match' }];
  const add = (state: State): number => {
    if (states.length >= MAX_STATES) {
      throw new PatternError('The pattern is too large once its repetition counts are written out: use smaller counts.');
    }
    states.push(state);
    return states.length - 1;
  };
  /** The state at which `node` starts, given the state that follows it. */
  const compile = (node: Node, next: number): number => {
    switch (node.type) {
      case 'char': return add({ type: 'char', test: node.test, out: next });
      case 'assert': return add({ type: 'assert', kind: node.kind, out: next });
      case 'alt': {
        const starts = node.branches.map((branch) => branch.reduceRight((after, part) => compile(part, after), next));
        return starts.reduceRight((other, out) => add({ type: 'split', out, other }));
      }
      case 'repeat': {
        let after = next;
        if (node.max === Infinity) {
          const loop = add({ type: 'split', out: next, other: next });
          (states[loop] as { out: number }).out = compile(node.body, loop);
          after = loop;
        } else {
          for (let i = node.min; i < node.max; i++) after = add({ type: 'split', out: compile(node.body, after), other: next });
        }
        for (let i = 0; i < node.min; i++) after = compile(node.body, after);
        return after;
      }
    }
  };
  return { states, start: compile(root, 0) };
}

/** Whether the program matches anywhere in the line, which is in lower case. Every state is entered at most once per character. */
function run(program: Program, line: string): boolean {
  const { states, start } = program;
  const length = line.length;
  const seen = new Int32Array(states.length).fill(-1);
  let current: number[] = [];
  let next: number[] = [];
  const stack: number[] = [];
  const wordAt = (i: number): boolean => i >= 0 && i < length && isWord(line.charCodeAt(i));

  /** Adds a state, and what follows it without reading a character, to the states held at `pos`. */
  const enter = (first: number, pos: number, into: number[]): boolean => {
    stack.push(first);
    let matched = false;
    while (stack.length) {
      const index = stack.pop() as number;
      if (seen[index] === pos) continue;
      seen[index] = pos;
      const state = states[index];
      if (state.type === 'match') {
        matched = true;
      } else if (state.type === 'char') {
        into.push(index);
      } else if (state.type === 'split') {
        stack.push(state.out, state.other);
      } else {
        const boundary = wordAt(pos - 1) !== wordAt(pos);
        const holds = state.kind === 'start' ? pos === 0 : state.kind === 'end' ? pos === length
          : state.kind === 'word' ? boundary : !boundary;
        if (holds) stack.push(state.out);
      }
    }
    return matched;
  };

  for (let pos = 0; pos <= length; pos++) {
    // A match may start at every position.
    if (enter(start, pos, current)) return true;
    if (pos === length) break;
    const code = line.charCodeAt(pos);
    next = [];
    let matched = false;
    for (const index of current) {
      const state = states[index] as { test: Test; out: number };
      if (state.test(code) && enter(state.out, pos + 1, next)) matched = true;
    }
    if (matched) return true;
    current = next;
  }
  return false;
}

/**
 * Checks a regular expression and returns the test for one line. Throws a PatternError for a
 * pattern that is too long, malformed, or uses what is not supported.
 */
export function compilePattern(pattern: string): (line: string) => boolean {
  if (pattern.length === 0 || pattern.length > MAX_PATTERN) {
    throw new PatternError(`The pattern must be 1-${MAX_PATTERN} characters.`);
  }
  const program = build(parse(pattern));
  return (line) => run(program, (line.length > MAX_TESTED ? line.slice(0, MAX_TESTED) : line).toLowerCase());
}

/** The test for a literal text, ignoring case. */
export function literalTest(text: string): (line: string) => boolean {
  const needle = text.toLowerCase();
  return (line) => line.toLowerCase().includes(needle);
}

export interface LineSearch {
  /** Indexes of the matching lines, the first `keep` of them. */
  lines: number[];
  /** How many lines matched among those searched. */
  total: number;
  /** How many lines were searched. */
  searched: number;
  /** The line at which the time ran out, if it did: it and the lines after it were not searched. */
  stoppedAt: number | null;
}

/**
 * Tests the lines from `from` on, one at a time, and stops when the time is used up. `within`
 * leaves lines out of the search.
 */
export function searchLines(
  lines: readonly string[],
  test: (line: string) => boolean,
  options: { from: number; keep: number; budgetMs: number; now: () => number; within?: (index: number) => boolean },
): LineSearch {
  const result: LineSearch = { lines: [], total: 0, searched: 0, stoppedAt: null };
  const deadline = options.now() + options.budgetMs;
  for (let i = Math.max(0, options.from); i < lines.length; i++) {
    if (options.within && !options.within(i)) continue;
    if (options.now() > deadline) {
      result.stoppedAt = i;
      break;
    }
    result.searched++;
    if (test(lines[i])) {
      result.total++;
      if (result.lines.length < options.keep) result.lines.push(i);
    }
  }
  return result;
}

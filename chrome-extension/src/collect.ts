// Putting together what a page shows in several steps: scrolled further each time, or page after
// page. Pure functions on lines of text: no chrome.* and no DOM.
//
// A page that loads on scroll shows what it showed before, and more. A list that draws only the
// rows in view shows a window that moves. Pages of a paginated list repeat their header and
// their footer. In each case the part that was read already is left out, by where it stands and
// not by what it says: a line that a log repeats a hundred times is kept a hundred times.

export const MAX_STEPS = 20;
export const MAX_MS = 30_000;
export const MAX_CHARS = 100_000;
/** Lines of one reading that are looked at. A page that shows more at once is read in parts with browser_extract. */
export const MAX_LINES_PER_READ = 5000;

/**
 * What of a new reading is new, after a scroll: the reading without the lines at its beginning
 * that the end of the one before had already. A page that grew starts with all of the reading
 * before; a window that moved starts with its end. Where nothing fits, all of it is new.
 */
export function afterScroll(before: readonly string[], now: readonly string[]): string[] {
  const most = Math.min(before.length, now.length);
  for (let overlap = most; overlap > 0; overlap--) {
    let same = true;
    for (let i = 0; i < overlap && same; i++) {
      same = before[before.length - overlap + i] === now[i];
    }
    if (same) return now.slice(overlap);
  }
  return [...now];
}

/**
 * What of a new page is its own: the page without the lines at its beginning and at its end
 * that the page before had in the same places. Those are what every page of a list repeats.
 */
export function afterPage(before: readonly string[], now: readonly string[]): string[] {
  const most = Math.min(before.length, now.length);
  let head = 0;
  while (head < most && before[head] === now[head]) head++;
  let tail = 0;
  while (tail < most - head && before[before.length - 1 - tail] === now[now.length - 1 - tail]) tail++;
  return now.slice(head, now.length - tail);
}

/**
 * The lines that a test holds for, each with the lines around it, and a line of three dashes
 * where lines in between were left out. `context` lines before and after; runs that touch are one.
 */
export function withContext(lines: readonly string[], matches: (line: string) => boolean, context: number): { lines: string[]; matched: number } {
  const keep = new Array<boolean>(lines.length).fill(false);
  let matched = 0;
  lines.forEach((line, i) => {
    if (!matches(line)) return;
    matched++;
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) keep[j] = true;
  });
  const out: string[] = [];
  let last = -1;
  lines.forEach((line, i) => {
    if (!keep[i]) return;
    if (last >= 0 && i > last + 1) out.push('---');
    out.push(line);
    last = i;
  });
  return { lines: out, matched };
}

/** Why a collection ended, in the words the result has. */
export type Stopped = 'end' | 'steps' | 'time' | 'size' | 'no-next' | 'nothing-new' | 'left';

export function stoppedWords(stopped: Stopped, next: string | undefined): string {
  switch (stopped) {
    case 'end': return 'the end was reached: scrolling further showed nothing more';
    case 'steps': return 'the limit of steps was reached: there may be more. Call again to go on from here';
    case 'time': return 'the time limit was reached: there may be more. Call again to go on from here';
    case 'size': return 'the size limit was reached: there is more. Call again to go on from here';
    case 'no-next': return `there is no further page: no link named "${next ?? ''}" that can be followed`;
    case 'nothing-new': return 'the last step showed nothing new';
    default: return 'the tab left the session\'s sites';
  }
}

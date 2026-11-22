// The notice in the page: in the bottom corner of an authorized tab, a bar that says what the
// agent does there now, and above it a pill for each thing it just did. Two parts. The timeline is
// pure: which lines show at a given moment, and when that changes next. The drawing takes a
// document and runs under jsdom.
//
// What reaches the page is a state, the generic wording of what runs, and generic lines for what
// ended: the words of the activity list. Nothing of the page's content, and no entered text.

/** How long a line of what ended is shown, and how long it then takes to fade. */
export const LINE_STAYS_MS = 4000;
export const LINE_FADES_MS = 1000;
/** How many lines of what ended are shown at most; an older one makes room. */
export const MAX_LINES = 3;
/** The element that holds the notice. Snapshots and extracts leave it out by this name. */
export const NOTICE_TAG = 'bcmcp-indicator';
/**
 * How many frames a page has to begin before what was taken out of it is out of the picture too.
 * A frame's callback runs before that frame is drawn: at the second, the first has been drawn,
 * and at the third it has also reached the screen, which is where a capture takes it from.
 */
export const FRAMES_UNTIL_DRAWN = 3;
/** How long a page is given to draw. One that is busy takes its time; one that hangs must not hold a command. */
export const DRAWN_WITHIN_MS = 1500;

/** What the agent is at in this tab. Only the first two keep the box in the page by themselves. */
export type NoticeState = 'working' | 'asking' | 'paused' | 'idle';
export type NoticeMark = 'ok' | 'error' | 'info';

/** What the worker tells the page. `off` takes the notice away at once, with all its lines. */
export interface NoticeUpdate {
  state: NoticeState | 'off';
  /** With `working`: what runs, as the activity list words it ("Reading page"). */
  text?: string;
  /** Something that ended, to be added as a line. */
  ended?: { text: string; mark: NoticeMark };
}

export interface NoticeLine {
  id: number;
  text: string;
  mark: NoticeMark;
  /** When it ended, by this page's clock. */
  at: number;
}

export interface Notice {
  state: NoticeState;
  text: string;
  /** Oldest first. */
  lines: NoticeLine[];
  nextId: number;
}

export interface NoticeView {
  /** The row with the dot and Pause: what runs now, or that nothing does. */
  status: string;
  tone: NoticeState;
  /** Pause is offered unless the session is paused already. */
  pause: boolean;
  /** What ended, oldest first, so that the newest is next to the status row. */
  lines: { id: number; text: string; mark: NoticeMark; fading: boolean }[];
  /** Nothing runs and the last line is fading: the box goes with it. */
  fading: boolean;
  /** Milliseconds until this view changes by itself, or null if it does not. */
  next: number | null;
}

const STATES: readonly string[] = ['working', 'asking', 'paused', 'idle', 'off'];
const MARKS: readonly string[] = ['ok', 'error', 'info'];
const MAX_TEXT = 80;

/** What of a window the wait for a drawn page needs. */
export interface DrawingWindow {
  requestAnimationFrame(callback: (time: number) => void): number;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(id: never): void;
  document: { visibilityState: string };
}

/**
 * Resolves when the page has drawn itself as it is now, so that a picture taken then shows it so.
 * Taking something out of the page does not take it out of the picture: the browser draws the
 * page again a moment later, and later still while the page is busy, as one is that has just
 * loaded. A capture takes what was drawn last.
 *
 * 'drawn': it has. 'hidden': the page is not shown (its window is minimized or covered), so it
 * draws nothing and waiting would only hold the command. 'late': it did not draw in time.
 */
export function whenDrawn(win: DrawingWindow): Promise<'drawn' | 'hidden' | 'late'> {
  if (win.document.visibilityState !== 'visible') return Promise.resolve('hidden');
  return new Promise((resolve) => {
    let left = FRAMES_UNTIL_DRAWN;
    const limit = win.setTimeout(() => resolve('late'), DRAWN_WITHIN_MS);
    const frame = (): void => {
      left -= 1;
      if (left > 0) {
        win.requestAnimationFrame(frame);
        return;
      }
      win.clearTimeout(limit as never);
      resolve('drawn');
    };
    win.requestAnimationFrame(frame);
  });
}

/** Reads what arrived as an update. Anything that is not one takes the notice away. */
export function noticeUpdateOf(msg: Record<string, unknown>): NoticeUpdate {
  if (typeof msg.state !== 'string' || !STATES.includes(msg.state)) return { state: 'off' };
  const update: NoticeUpdate = { state: msg.state as NoticeUpdate['state'] };
  if (typeof msg.text === 'string') update.text = msg.text.slice(0, MAX_TEXT);
  const ended = msg.ended as { text?: unknown; mark?: unknown } | null | undefined;
  if (ended && typeof ended.text === 'string' && ended.text && typeof ended.mark === 'string' && MARKS.includes(ended.mark)) {
    update.ended = { text: ended.text.slice(0, MAX_TEXT), mark: ended.mark as NoticeMark };
  }
  return update;
}

const alive = (line: NoticeLine, now: number): boolean => now - line.at < LINE_STAYS_MS + LINE_FADES_MS;

/** The notice after an update. Null when it was taken away. */
export function applyUpdate(notice: Notice | null, update: NoticeUpdate, now: number): Notice | null {
  if (update.state === 'off') return null;
  const lines = (notice?.lines ?? []).filter((line) => alive(line, now));
  let nextId = notice?.nextId ?? 1;
  if (update.ended) lines.push({ id: nextId++, text: update.ended.text, mark: update.ended.mark, at: now });
  return { state: update.state, text: update.state === 'working' ? update.text ?? '' : '', lines: lines.slice(-MAX_LINES), nextId };
}

function statusText(notice: Notice): string {
  switch (notice.state) {
    case 'working': return `Agent: ${notice.text || 'Working'}`;
    // Short enough for one line beside the goblin and Pause: who waits is the one pictured.
    case 'asking': return 'Answer needed in the popup';
    case 'paused': return 'Agent paused';
    default: return 'Agent idle';
  }
}

/**
 * What the notice shows at `now`, or null when there is nothing to show. The box is in the page
 * while something runs or the user is asked, and for as long as a line of what ended is left: a
 * tab that is only authorized, or only paused, has no box.
 */
export function noticeView(notice: Notice | null, now: number): NoticeView | null {
  if (!notice) return null;
  const lines = notice.lines.filter((line) => alive(line, now));
  const active = notice.state === 'working' || notice.state === 'asking';
  if (!active && !lines.length) return null;
  const goes = (line: NoticeLine): boolean => now - line.at >= LINE_STAYS_MS;
  const fading = !active && lines.every(goes);
  const newest = lines[lines.length - 1];
  return {
    status: statusText(notice),
    tone: notice.state,
    pause: notice.state !== 'paused',
    // The line that goes with the box fades with it, not twice.
    lines: lines.map((line) => ({ id: line.id, text: line.text, mark: line.mark, fading: goes(line) && !(fading && line === newest) })),
    fading,
    next: lines.length
      ? Math.min(...lines.map((line) => (goes(line) ? LINE_STAYS_MS + LINE_FADES_MS : LINE_STAYS_MS) - (now - line.at)))
      : null,
  };
}

// ---------------------------------------------------------------- drawing

export interface NoticeMount {
  host: HTMLElement;
  box: HTMLElement;
  lines: HTMLElement;
  label: HTMLElement;
  pause: HTMLButtonElement;
}

const MARK_TEXT: Record<NoticeMark, string> = { ok: '✓', error: '✗', info: '•' };

// The look is the popup's: its cave colours, its round marks, and the goblin of its header, here
// as the one who speaks. Nothing but Pause takes the pointer: a click anywhere else reaches the
// page under it.
//
// Two panes, in the corner. The bar, at the bottom, says what the agent is at: the goblin, the
// words, Pause. It is always one row high, and it is where it is: what comes and goes does so
// above it. The pills of what ended float over the bar, each on its own and as wide as its
// words, with their right edges in line with the bar's. So what stays is small, and what passes
// covers no more of the page than its own text. Nothing is drawn around the two: `.box` only
// holds them together, and fades them together when the last pill goes.
//
// The bar is no narrower than 200px, so that its left edge does not jump with every change of
// what it says. The faint light ring sets bar and pills off on a dark page, where a shadow does
// nothing.
//
// The goblin shows the state: its outline glows and fades, and now and then it blinks, while the
// agent works; an amber glow and a look up to the toolbar when the user is asked; closed eyes
// when paused. It has no tile and no edge of its own, and takes no click. Where the system asks
// for less motion, nothing here moves.
const GREEN = '99,214,143';
const AMBER = '243,194,92';
const STYLE = ':host{all:initial;position:fixed;right:12px;bottom:12px;z-index:2147483647;pointer-events:none}'
  + '.box{display:flex;flex-direction:column;align-items:flex-end;gap:6px;max-width:min(340px,calc(100vw - 24px));color:#e6f0e9;'
  + `font:600 12px/1.3 system-ui,"Segoe UI",sans-serif;opacity:1;transition:opacity ${LINE_FADES_MS}ms linear}`
  + '.bar{display:flex;align-items:center;gap:8px;box-sizing:border-box;min-width:min(200px,calc(100vw - 24px));max-width:100%;'
  + `min-height:42px;padding:6px 6px 6px 10px;border-radius:18px;background:linear-gradient(180deg,#1b2a22,#0f1612);border:1px solid rgba(${GREEN},.3);`
  + 'box-shadow:0 10px 28px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.06);animation:rise 240ms cubic-bezier(.2,.9,.3,1.15)}'
  + '@keyframes rise{from{opacity:0;transform:translateY(8px) scale(.96)}}'
  // The goblin, bare: no tile under it and no edge around it. It stands on the bar itself, and
  // what lights up is its own outline.
  + '.goblin{flex:none;width:34px;height:22px}'
  + '.goblin svg{display:block;width:100%;height:100%;overflow:visible}'
  + '.eye,.pupil,.ears{transform-box:fill-box;transform-origin:center;transition:transform 160ms ease-out,opacity 160ms ease-out}'
  + '.working .goblin svg{animation:glow 1.6s ease-in-out infinite}'
  + `@keyframes glow{0%,100%{filter:drop-shadow(0 0 0 rgba(${GREEN},0))}50%{filter:drop-shadow(0 0 4px rgba(${GREEN},.8))}}`
  + '.working .eye{animation:blink 3.8s infinite}'
  + '@keyframes blink{0%,92%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}'
  + '.working .pupil{animation:wink 3.8s infinite}'
  + '@keyframes wink{0%,92%,100%{opacity:1}96%{opacity:0}}'
  + '.working .ears{animation:twitch 3.8s ease-in-out infinite}'
  + '@keyframes twitch{0%,40%,60%,100%{transform:rotate(0)}50%{transform:rotate(-5deg)}}'
  + '.asking .goblin svg{animation:ask 1.6s ease-in-out infinite}'
  + `@keyframes ask{0%,100%{filter:drop-shadow(0 0 1px rgba(${AMBER},.5))}50%{filter:drop-shadow(0 0 5px rgba(${AMBER},.95))}}`
  + '.asking .pupil{transform:translate(4px,-5px)}'
  + '.paused .eye{transform:scaleY(.12)}'
  + '.paused .pupil{opacity:0}'
  + '.paused .goblin svg{opacity:.7}'
  + '.lines{display:flex;flex-direction:column;align-items:flex-end;gap:5px;max-width:100%}'
  + '.lines:empty{display:none}'
  // A pill of what ended, with the round mark the popup's activity list gives it. It lies on the
  // page itself, so it brings its own ground, edge and shadow. It grows out of the corner it sits in.
  + '.line{display:flex;align-items:center;gap:6px;box-sizing:border-box;max-width:100%;padding:3px 11px 3px 4px;border-radius:13px;'
  + `background:#16221b;border:1px solid rgba(${GREEN},.22);box-shadow:0 4px 12px rgba(0,0,0,.32),0 0 0 1px rgba(255,255,255,.05);`
  + 'color:#d6e2da;font-weight:500;opacity:1;transform-origin:right bottom;'
  + `transition:opacity ${LINE_FADES_MS}ms linear;animation:pop 200ms cubic-bezier(.2,.9,.3,1.3)}`
  + '@keyframes pop{from{opacity:0;transform:scale(.85)}}'
  + '.mark{flex:none;display:grid;place-items:center;width:16px;height:16px;border-radius:50%;font:700 10px/1 system-ui,"Segoe UI",sans-serif}'
  + '.ok .mark{background:#1d3327;color:#63d68f}.error .mark{background:#3a1f1b;color:#ff8573}.info .mark{background:#2a3a31;color:#b7c6bd}'
  + '.label{flex:1;min-width:0}'
  + '.asking .label{color:#f3c25c}'
  + '.paused .label,.idle .label{color:#b7c6bd}'
  // Pause, with the two bars before the word.
  + 'button{pointer-events:auto;flex:none;display:inline-flex;align-items:center;gap:6px;font:inherit;color:#e6f0e9;background:#1e2a23;'
  + 'border:1px solid #33483c;border-radius:999px;padding:4px 11px 4px 10px;cursor:pointer;'
  + 'transition:background 120ms,border-color 120ms,color 120ms}'
  + 'button::before{content:"";box-sizing:border-box;width:7px;height:9px;border:solid currentColor;border-width:0 2.5px}'
  + `button:hover{background:#1d3327;border-color:rgb(${GREEN});color:#c9f5da}`
  + `button:focus-visible{outline:2px solid rgb(${GREEN});outline-offset:2px}`
  + 'button[hidden]{display:none}'
  + '.fading{opacity:0}'
  // Where the system asks for less motion nothing moves, pulses or fades: a line is there, and then it is not.
  + '@media (prefers-reduced-motion:reduce){*,*::before{animation:none!important;transition:none!important}.fading{opacity:1}}';

const SVG = 'http://www.w3.org/2000/svg';
/** The goblin's face, the shapes of chrome-extension/icons/goblin.svg, with a name on each part that moves. */
const GOBLIN: readonly [string, string, Record<string, string>][] = [
  ['path', 'ears', { d: 'M32 64 6 38l36 6zM96 64l26-26-36 6z', fill: '#4fc27b' }],
  ['path', 'skin', { d: 'M64 28c-22 0-38 15-38 36 0 22 16 38 38 38s38-16 38-38c0-21-16-36-38-36z', fill: '#63d68f' }],
  ['ellipse', 'eye', { cx: '50', cy: '62', rx: '9', ry: '10', fill: '#12201a' }],
  ['ellipse', 'eye', { cx: '78', cy: '62', rx: '9', ry: '10', fill: '#12201a' }],
  ['circle', 'pupil', { cx: '53', cy: '59', r: '3', fill: '#f4fff8' }],
  ['circle', 'pupil', { cx: '81', cy: '59', r: '3', fill: '#f4fff8' }],
  ['path', 'mouth', { d: 'M48 82c5 6 27 6 32 0', stroke: '#12201a', 'stroke-width': '5', fill: 'none', 'stroke-linecap': 'round' }],
  ['path', 'tooth', { d: 'm58 85 3 7 3-6z', fill: '#f4fff8' }],
];

function goblin(doc: Document): HTMLElement {
  const tile = doc.createElement('div');
  tile.className = 'goblin';
  const svg = doc.createElementNS(SVG, 'svg');
  // The face alone, from ear to ear: the drawing's own square has room around it for the tile it stands on elsewhere.
  svg.setAttribute('viewBox', '4 26 120 78');
  // A picture and nothing to read: what it shows is said in words in the row beside it.
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, name, attributes] of GOBLIN) {
    const part = doc.createElementNS(SVG, tag);
    part.setAttribute('class', name);
    for (const [key, value] of Object.entries(attributes)) part.setAttribute(key, value);
    svg.append(part);
  }
  tile.append(svg);
  return tile;
}

/**
 * Puts the empty notice into the document. Its inside is in a closed shadow root: a page script
 * can see that the element is there and can remove it, and can neither read nor restyle what it
 * says. `onPause` gets the click on Pause; whether it was the user's is for the caller to check.
 */
export function mountNotice(doc: Document, onPause: (event: Event) => void): NoticeMount {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] => {
    const el = doc.createElement(tag);
    el.className = className;
    return el;
  };
  const host = doc.createElement(NOTICE_TAG);
  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const box = make('div', 'box');
  const lines = make('div', 'lines');
  const bar = make('div', 'bar');
  const label = make('span', 'label');
  const pause = make('button', '');
  pause.textContent = 'Pause';
  // A page may have a Pause of its own, a video's for one: this one says whose it is.
  pause.title = 'Pause the agent in this tab';
  pause.setAttribute('aria-label', 'Pause the agent in this tab');
  pause.addEventListener('click', onPause);
  bar.append(goblin(doc), label, pause);
  // The pills first and the bar last: the pills pile up above it, and the bar stays in the corner.
  box.append(lines, bar);
  root.append(style, box);
  doc.documentElement.append(host);
  return { host, box, lines, label, pause };
}

/** Brings a mounted notice up to a view. A line that is already there is left in its place, so that its fading is not started anew. */
export function paintNotice(mount: NoticeMount, view: NoticeView): void {
  mount.box.className = `box ${view.tone}${view.fading ? ' fading' : ''}`;
  mount.label.textContent = view.status;
  mount.pause.hidden = !view.pause;
  const shown = new Map([...mount.lines.children].map((el) => [(el as HTMLElement).dataset.line, el as HTMLElement]));
  for (const line of view.lines) {
    let el = shown.get(String(line.id));
    shown.delete(String(line.id));
    if (!el) {
      const doc = mount.host.ownerDocument;
      el = doc.createElement('div');
      el.dataset.line = String(line.id);
      const mark = doc.createElement('span');
      mark.className = 'mark';
      mark.textContent = MARK_TEXT[line.mark];
      const text = doc.createElement('span');
      text.textContent = line.text;
      el.append(mark, text);
      // New lines are the newest: at the end, next to the bar.
      mount.lines.append(el);
    }
    el.className = `line ${line.mark}${line.fading ? ' fading' : ''}`;
  }
  for (const gone of shown.values()) gone.remove();
}

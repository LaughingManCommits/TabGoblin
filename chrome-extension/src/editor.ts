// Text entry into rich-text and code editors.
//
// Such editors keep their own model of the document and update it only from the input they expect
// from a user. A page script cannot produce real keystrokes, so this module gives each editor the
// same sequence a keystroke produces, and checks afterwards that the editor reacted:
//
//   edit     a `beforeinput` event, then - unless the editor cancels it, which means it applied
//            the change itself - the browser's own editing command, which changes the DOM and fires
//            `input`. Editors that run on `beforeinput` and editors that watch the DOM for changes
//            both get what they wait for.
//   paste    a `paste` event carrying only the given text. Nearly every editor handles it, and it
//            is how multi-line text and code get in unchanged, without auto-indent or bracket
//            completion rewriting them.
//
// Editors that draw their text themselves take the keyboard through an element of their own: a
// hidden textarea or an EditContext. Those get the editor's own shortcuts for selecting, then a
// paste.
//
// A second way is tried only when the first demonstrably did nothing: the editor neither claimed
// the event nor changed what it shows. Text is never entered twice to be on the safe side.
//
// Nothing here is specific to a library or a website: an editor is recognised by what it is in the
// DOM (an editing host, an EditContext, a keyboard input without a visible box), never by name.
// The real clipboard is never read or written.

import { editorSurface, isEditingHost } from './snapshot.ts';

export interface FillResult {
  filled: true;
  /** Whether the field now holds exactly the requested content (masks and formatters may alter it). */
  valueMatches: boolean;
  note?: string;
}

type View = Window & typeof globalThis;
const viewOf = (el: Element): View => el.ownerDocument.defaultView as View;

export interface KeyModifiers {
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

const KEY_CODES: Record<string, [code: string, keyCode: number]> = {
  Enter: ['Enter', 13], Escape: ['Escape', 27], Tab: ['Tab', 9], ' ': ['Space', 32],
  Backspace: ['Backspace', 8], Delete: ['Delete', 46],
  ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39],
  Home: ['Home', 36], End: ['End', 35], PageUp: ['PageUp', 33], PageDown: ['PageDown', 34],
};

/** Dispatches one keyboard event; returns false if a handler cancelled it. */
export function fireKey(el: Element, type: 'keydown' | 'keypress' | 'keyup', key: string, mods: KeyModifiers = {}): boolean {
  const view = viewOf(el);
  const known = KEY_CODES[key];
  const code = known ? known[0] : /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : '';
  const keyCode = known ? known[1] : key.toUpperCase().charCodeAt(0);
  // keyCode/which are legacy, but many sites still read them.
  const init = {
    key, code, keyCode, which: keyCode, shiftKey: mods.shift === true, ctrlKey: mods.ctrl === true, metaKey: mods.meta === true,
    bubbles: true, cancelable: true, composed: true, view,
  };
  return el.dispatchEvent(new view.KeyboardEvent(type, init as KeyboardEventInit));
}

type Kind = 'host' | 'input';

/**
 * How an element takes text, if it is an editor:
 * - `host`: a contenteditable region; the text is in the element itself.
 * - `input`: an element that only receives the keyboard for an editor drawn elsewhere (a hidden
 *   textarea, an EditContext); the text is shown in the surface around it.
 */
export function editorKind(el: Element): Kind | null {
  if (editorSurface(el)) return 'input';
  return isEditingHost(el) ? 'host' : null;
}

const hasEditContext = (el: Element): boolean => !!(el as unknown as { editContext?: unknown }).editContext;

/** A tab in the background is not drawn: editors that redraw per frame show nothing new there. */
const isHidden = (el: Element): boolean => el.ownerDocument.visibilityState === 'hidden';

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** Lets the page's pending work run. Unlike a timer, this is not slowed down in a background tab. */
function tick(el: Element): Promise<void> {
  const Channel = viewOf(el).MessageChannel ?? globalThis.MessageChannel;
  if (typeof Channel !== 'function') return pause(0);
  return new Promise((done) => {
    const channel = new Channel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      done();
    };
    channel.port2.postMessage(0);
  });
}

function once(target: EventTarget, type: string, maxMs: number): Promise<void> {
  return new Promise((done) => {
    const finish = (): void => {
      target.removeEventListener(type, finish);
      done();
    };
    target.addEventListener(type, finish);
    setTimeout(finish, maxMs);
  });
}

/** Text compared the way a reader would: invisible characters and spacing differences do not count. */
const squash = (text: string): string =>
  text.replace(/[​﻿]/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

function shownText(el: Element): string {
  // innerText follows what is rendered, line breaks included; jsdom does not implement it.
  const inner = (el as HTMLElement).innerText;
  return typeof inner === 'string' ? inner : el.textContent ?? '';
}

/** Lines with the width of their indentation, for texts where that matters. */
function indentation(text: string): string {
  return text.replace(/\u00a0/g, ' ').split('\n').filter((line) => line.trim() !== '')
    .map((line) => `${/^ */.exec(line)?.[0].length ?? 0}:${squash(line)}`).join('\n');
}

/** Reads the text the editor currently shows. */
function reader(el: Element): () => string {
  const shown = editorSurface(el) ?? el;
  return () => squash(shownText(shown));
}

const REGION_DEPTH = 3;

/**
 * Reads the text around the editor too. A block editor answers some input by adding blocks next
 * to the one that was addressed; that is a reaction, even though the addressed block is unchanged.
 */
function regionReader(el: Element): () => string {
  let region = editorSurface(el) ?? el;
  for (let depth = 0; depth < REGION_DEPTH; depth++) {
    const parent = region.parentElement;
    if (!parent || parent.localName === 'body' || parent.localName === 'html') break;
    region = parent;
  }
  return () => squash(shownText(region));
}

/** Waits until the text differs from `was`, or gives up. */
async function changedFrom(el: Element, read: () => string, was: string, patient = true): Promise<boolean> {
  await tick(el);
  if (read() !== was) return true;
  for (const wait of patient ? [20, 60, 240] : [20, 40]) {
    await pause(wait);
    if (read() !== was) return true;
  }
  return false;
}

/**
 * One way of entering something. Returns true when it is known to have arrived: the editor
 * claimed the event by cancelling it, or the browser carried out the edit.
 */
type Attempt = (el: Element, text: string) => boolean;

function announce(el: Element, inputType: string, text: string): boolean {
  const view = viewOf(el);
  if (typeof view.InputEvent !== 'function') return false;
  return !el.dispatchEvent(new view.InputEvent('beforeinput', {
    inputType, data: text === '' ? null : text, bubbles: true, cancelable: true, composed: true,
  }));
}

/**
 * Runs one of the browser's editing commands. Returns whether the browser carried it out, which
 * it announces with an `input` event: the element then holds the change, whatever is drawn.
 */
function run(el: Element, commandName: string, text: string): boolean {
  const doc = el.ownerDocument;
  if (typeof doc.execCommand !== 'function') return false;
  let happened = false;
  const note = (): void => { happened = true; };
  el.addEventListener('input', note, true);
  try {
    doc.execCommand(commandName, false, text);
  } finally {
    el.removeEventListener('input', note, true);
  }
  return happened;
}

/**
 * What one edit by the user amounts to: `beforeinput`, which an editor may cancel to apply the
 * change itself, and otherwise the browser's own edit, which fires `input`.
 */
const edit = (inputType: string, commandName: string): Attempt => (el, text) =>
  announce(el, inputType, text) || run(el, commandName, text);

/**
 * Only the announcement of an edit. An editor that runs on `beforeinput` applies it; any other
 * ignores it, and nothing has happened.
 */
const offer = (inputType: string): Attempt => (el, text) => announce(el, inputType, text);

/** The browser's editing command alone: all a textarea needs. */
const command = (name: string): Attempt => (el, text) => run(el, name, text);

/** A paste that carries just this text. The user's clipboard is not involved. */
const paste: Attempt = (el, text) => {
  const view = viewOf(el);
  if (typeof view.DataTransfer !== 'function' || typeof view.ClipboardEvent !== 'function') return false;
  const data = new view.DataTransfer();
  data.setData('text/plain', text);
  return !el.dispatchEvent(new view.ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true }));
};

interface EditContextLike extends EventTarget {
  selectionStart: number;
  selectionEnd: number;
  updateText(start: number, end: number, text: string): void;
  updateSelection(start: number, end: number): void;
}

/** What the browser tells an EditContext when the user types. */
const textUpdate: Attempt = (el, text) => {
  const context = (el as unknown as { editContext?: EditContextLike }).editContext;
  const Update = (viewOf(el) as unknown as { TextUpdateEvent?: new (type: string, init: object) => Event }).TextUpdateEvent;
  if (!context || typeof Update !== 'function') return false;
  const start = Math.min(context.selectionStart, context.selectionEnd);
  const end = Math.max(context.selectionStart, context.selectionEnd);
  const caret = start + text.length;
  context.updateText(start, end, text);
  context.updateSelection(caret, caret);
  context.dispatchEvent(new Update('textupdate', {
    text, updateRangeStart: start, updateRangeEnd: end, selectionStart: caret, selectionEnd: caret,
  }));
  // An editor built on an EditContext has no other source of typed text: it took this.
  return true;
};

const INSERT = edit('insertText', 'insertText');
const DELETE_BACK = edit('deleteContentBackward', 'delete');
const DELETE_FORWARD = edit('deleteContentForward', 'forwardDelete');
const NEW_PARAGRAPH = edit('insertParagraph', 'insertParagraph');
const OFFER_INSERT = offer('insertText');
const OFFER_PARAGRAPH = offer('insertParagraph');
const COMMAND_INSERT = command('insertText');
const COMMAND_DELETE = command('delete');
const COMMAND_DELETE_FORWARD = command('forwardDelete');
const LINE_BREAK: Attempt = (el) => COMMAND_INSERT(el, '\n');

const LONE_LINK = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;

/** Ways to insert `text` at the selection, in the order to try them. */
function insertions(el: Element, kind: Kind, text: string, typed: boolean, overBlocks = false): Attempt[] {
  if (kind === 'input') {
    // Typed characters go the way typing does; whole texts are pasted, so that an editor's
    // auto-indent and bracket completion do not rewrite them.
    if (hasEditContext(el)) return typed ? [textUpdate, paste] : [paste, textUpdate];
    return typed ? [COMMAND_INSERT, paste] : [paste, COMMAND_INSERT];
  }
  if (typed) return [INSERT, paste];
  // Replacing several paragraphs at once: the editor does that itself for a paste, while the
  // browser's own edit across blocks leaves some editors with a page that no longer matches their
  // model. A lone link is the exception: pasted over a selection, many editors turn the selection
  // into that link instead of replacing it.
  if (!text.includes('\n')) return overBlocks && !LONE_LINK.test(text.trim()) ? [paste, INSERT] : [INSERT, paste];
  // Several lines at once: first to editors that take the text as it is, then as a paste, which
  // editors turn into their own paragraphs. The browser's own edit comes last; it suits a plain
  // editable region and little else. In a hidden tab the first step is left out: whether an
  // editor took it without saying so cannot be seen there.
  return isHidden(el) ? [paste, INSERT] : [OFFER_INSERT, paste, INSERT];
}

function deletions(el: Element, kind: Kind, forward = false): Attempt[] {
  if (kind === 'input') return hasEditContext(el) ? [] : [forward ? COMMAND_DELETE_FORWARD : COMMAND_DELETE];
  return [forward ? DELETE_FORWARD : DELETE_BACK];
}

/** What Enter does when the editor leaves the key to the browser. */
function paragraphs(el: Element, kind: Kind): Attempt[] {
  if (kind === 'host') return [NEW_PARAGRAPH];
  return hasEditContext(el) ? [OFFER_PARAGRAPH] : [LINE_BREAK];
}

function isMac(el: Element): boolean {
  return /mac|iphone|ipad/i.test(viewOf(el).navigator?.platform ?? '');
}

function caretInside(el: Element): boolean {
  const selection = el.ownerDocument.getSelection?.();
  return !!selection && selection.rangeCount > 0 && el.contains(selection.anchorNode);
}

/**
 * The editor's own shortcut for "select everything" or "go to the end". Editors keep a selection
 * of their own; the shortcut sets it where there is no page selection to follow (an editor that
 * draws its own text) or where it is not followed (a window that is not in front).
 * Returns whether the editor handled the key.
 */
function shortcut(el: Element, all: boolean): boolean {
  const mods: KeyModifiers = isMac(el) ? { meta: true } : { ctrl: true };
  const key = all ? 'a' : isMac(el) ? 'ArrowDown' : 'End';
  const handled = !fireKey(el, 'keydown', key, mods);
  fireKey(el, 'keyup', key, mods);
  return handled;
}

/** Selects everything in the editor, or puts the caret at its end, and waits for the editor to notice. */
async function select(el: Element, kind: Kind, all: boolean): Promise<void> {
  if (kind === 'input') {
    const handled = shortcut(el, all);
    // The content is not in the page's selection; a textarea nobody listens on gets the native one.
    if (!handled && el.localName === 'textarea') {
      const area = el as HTMLTextAreaElement;
      if (all) area.select();
      else area.setSelectionRange(area.value.length, area.value.length);
    }
    await tick(el);
    return;
  }
  const doc = el.ownerDocument;
  // An editable region follows the page's selection, which says exactly what is meant. In a
  // window that is not in front editors stop following it; there the shortcut is the way. (It is
  // not used otherwise: to some editors "select all" first means the current block only.)
  const unfocused = typeof doc.hasFocus === 'function' && !doc.hasFocus();
  if (unfocused && shortcut(el, all)) {
    await tick(el);
    return;
  }
  const selection = doc.getSelection?.();
  if (!selection) return;
  const range = doc.createRange();
  range.selectNodeContents(el);
  if (!all) range.collapse(false);
  const current = selection.rangeCount === 1 ? selection.getRangeAt(0) : null;
  const same = current !== null && current.startContainer === range.startContainer && current.startOffset === range.startOffset
    && current.endContainer === range.endContainer && current.endOffset === range.endOffset;
  if (same) {
    await tick(el);
    return;
  }
  selection.removeAllRanges();
  selection.addRange(range);
  // Editors follow the selection through an event that the browser delivers a moment later.
  await once(doc, 'selectionchange', 150);
  await tick(el);
}

/** Gives the editor the keyboard, and tells it so where the browser would not. */
async function focus(el: Element): Promise<void> {
  const html = el as HTMLElement;
  const doc = el.ownerDocument;
  const moved = doc.activeElement !== el;
  if (moved && typeof html.focus === 'function') html.focus({ preventScroll: true });
  // A window that is not in front gets no focus events, so an editor there believes it is not
  // focused and ignores input. The element does have the keyboard; say so.
  const unfocused = typeof doc.hasFocus === 'function' && !doc.hasFocus();
  if (unfocused && doc.activeElement === el) {
    const view = viewOf(el);
    el.dispatchEvent(new view.FocusEvent('focus', { composed: true }));
    el.dispatchEvent(new view.FocusEvent('focusin', { bubbles: true, composed: true }));
  }
  if (moved || unfocused) await tick(el);
}

interface Outcome {
  /** The attempt the editor took, if any. */
  worked: Attempt | null;
  /** Whether the editor showed a change, as opposed to only claiming the event. */
  seen: boolean;
}

/**
 * Runs attempts in order and stops at the first the editor takes: it claimed the event, or what
 * it shows changed. Selects again before each attempt, so that a repeat replaces instead of adding.
 */
async function firstThatWorks(
  el: Element, attempts: Attempt[], text: string, watch: () => string,
  place: (() => Promise<void>) | null, patient = true,
): Promise<Outcome> {
  for (const attempt of attempts) {
    if (place) await place();
    const was = watch();
    const claimed = attempt(el, text);
    if (claimed) {
      await tick(el);
      return { worked: attempt, seen: watch() !== was };
    }
    if (await changedFrom(el, watch, was, patient)) return { worked: attempt, seen: true };
  }
  return { worked: null, seen: false };
}

/** Lines of `expected` that the editor's surface shows, for editors that draw only what is on screen. */
function compareShown(shown: string, expected: string): 'all' | 'start' | 'no' {
  const lines = expected.split('\n').map(squash).filter(Boolean);
  const missing = lines.findIndex((line) => !shown.includes(line));
  if (missing < 0) return 'all';
  return lines.length > 8 && missing >= 5 ? 'start' : 'no';
}

const NO_REACTION = 'This editor did not take the text: nothing changed. It may accept input only from a real keyboard.';
const DIFFERENT = 'The editor changed, but it does not show exactly the requested text. Take a snapshot to check before continuing.';
const PARTLY_SHOWN = 'The editor draws only part of its content at a time; the part it shows matches the requested text.';
const PARTIAL_PROBE = 200;
const REINDENTED = 'The text is in, but the editor changed the indentation of some lines. Take a snapshot to check.';
const UNSEEN = 'The editor accepted the text, but its tab is in the background, where it does not redraw, so the result could not be checked. '
  + 'Do not enter it again; take a snapshot once the tab is visible.';

/**
 * Puts `text` into an editor, replacing its content or appending to it, and reports whether the
 * editor shows it afterwards.
 */
export async function fillEditor(el: Element, text: string, append: boolean, method: 'set' | 'type' = 'set'): Promise<FillResult> {
  const kind = editorKind(el);
  if (!kind) throw new Error('not an editor');
  const read = reader(el);
  const before = read();
  const wanted = squash(text);

  if (kind === 'host' && !append && before === wanted) {
    return wanted
      ? { filled: true, valueMatches: true, note: 'It already held that text; nothing was changed.' }
      : { filled: true, valueMatches: true };
  }
  if (append && text === '') return { filled: true, valueMatches: true };

  await focus(el);
  const watch = regionReader(el);
  const around = watch();
  const place = (): Promise<void> => select(el, kind, !append);
  let claimed = false;

  if (text === '') {
    await place();
    if (kind === 'input') {
      // An editor behind a keyboard input deletes on the key, not through the DOM.
      claimed = !fireKey(el, 'keydown', 'Backspace');
      fireKey(el, 'keyup', 'Backspace');
      if (!claimed && !(await changedFrom(el, watch, around))) {
        claimed = (await firstThatWorks(el, deletions(el, kind), '', watch, place)).worked !== null;
      }
    } else {
      claimed = (await firstThatWorks(el, deletions(el, kind), '', watch, place)).worked !== null;
    }
  } else if (method === 'type') {
    claimed = await typeText(el, kind, text, watch, place);
  } else {
    // Several lines shown means several blocks to replace.
    const overBlocks = !append && shownText(editorSurface(el) ?? el).trim().includes('\n');
    claimed = (await firstThatWorks(el, insertions(el, kind, text, false, overBlocks), text, watch, place)).worked !== null;
  }

  // An editor that rejects a change puts its own content back a moment later: look after that.
  await pause(120);
  const after = read();
  const unchanged = after === before && watch() === around;
  if (unchanged) return { filled: true, valueMatches: false, note: claimed && isHidden(el) ? UNSEEN : NO_REACTION };

  if (kind === 'host') {
    const spaced = append ? squash(`${before} ${text}`) : wanted;
    const joined = append ? squash(before + text) : wanted;
    if (after !== spaced && after !== joined) {
      // A code editor draws only the part of a long text that is on screen: the start, the end
      // near the cursor, or both with a gap between them.
      const within = (whole: string): boolean =>
        whole.includes(after.slice(0, PARTIAL_PROBE)) && whole.includes(after.slice(-PARTIAL_PROBE));
      const partial = after.length >= PARTIAL_PROBE && after.length < spaced.length && (within(spaced) || within(joined));
      return partial ? { filled: true, valueMatches: true, note: PARTLY_SHOWN } : { filled: true, valueMatches: false, note: DIFFERENT };
    }
    if (!append && /\n +\S/.test(text) && indentation(shownText(el)) !== indentation(text)) {
      return { filled: true, valueMatches: false, note: REINDENTED };
    }
    return { filled: true, valueMatches: true };
  }
  // The surface shows more than the text (line numbers) and maybe not all of it (only what is on screen).
  const shown = compareShown(after, text);
  if (shown === 'no') return { filled: true, valueMatches: false, note: isHidden(el) && claimed ? UNSEEN : DIFFERENT };
  return shown === 'all' ? { filled: true, valueMatches: true } : { filled: true, valueMatches: true, note: PARTLY_SHOWN };
}

/** Enters text character by character, with the key events around each one. Returns whether the editor took it. */
async function typeText(
  el: Element, kind: Kind, text: string, watch: () => string, place: () => Promise<void>,
): Promise<boolean> {
  let technique: Attempt | null = null;
  let took = false;
  let first = true;
  for (const char of text) {
    const enter = char === '\n';
    const key = enter ? 'Enter' : char;
    if (first) await place();
    if (fireKey(el, 'keydown', key)) {
      fireKey(el, 'keypress', key);
      if (enter) {
        for (const attempt of paragraphs(el, kind)) attempt(el, '');
      } else if (technique) {
        technique(el, char);
      } else {
        // The first character shows which way this editor takes typing; the rest follow it.
        technique = (await firstThatWorks(el, insertions(el, kind, char, true), char, watch, null)).worked;
        took = took || technique !== null;
      }
    } else {
      took = true;
    }
    fireKey(el, 'keyup', key);
    await tick(el);
    first = false;
  }
  return took;
}

/**
 * Presses one key in an editor and carries out what the key would do if the page left it to the
 * browser. Returns a description of the effect.
 */
export async function pressEditorKey(el: Element, key: string, shift: boolean): Promise<string> {
  const kind = editorKind(el);
  if (!kind) throw new Error('not an editor');
  await focus(el);
  const watch = regionReader(el);
  const printable = [...key].length === 1;
  let effect: string;

  if (!fireKey(el, 'keydown', key, { shift })) {
    effect = 'the page handled the key itself';
  } else {
    if (printable || key === 'Enter') fireKey(el, 'keypress', key, { shift });
    const attempts = printable ? insertions(el, kind, key, true)
      : key === 'Enter' ? paragraphs(el, kind)
        : key === 'Backspace' ? deletions(el, kind)
          : key === 'Delete' ? deletions(el, kind, true) : [];
    if (attempts.length === 0) {
      effect = 'none beyond the page\'s own key handlers';
    } else {
      // Type where the caret is; if it is somewhere else on the page, at the end of the editor.
      const place = kind === 'host' && !caretInside(el) ? (): Promise<void> => select(el, kind, false) : null;
      const { worked } = await firstThatWorks(el, attempts, printable ? key : '', watch, place);
      effect = !worked ? 'the editor did not react to the key'
        : printable ? 'typed the character'
          : key === 'Enter' ? 'inserted a new paragraph' : 'deleted a character';
    }
  }
  fireKey(el, 'keyup', key, { shift });
  await tick(el);
  return effect;
}

// Generic page interactions: click, fill, type, keys, scroll, wait. Pure DOM code (no chrome.*).
// Nothing here knows about any particular website, and nothing evaluates agent-supplied code.

import { visibleText } from './extract.ts';
import { looksLikeSubmission, type ClickTarget } from './policy.ts';
import {
  DomError, accessibleName, checkedState, isDisabled, isEditingHost, isScrollable, isSensitiveField, isVisible,
  mainScroller, norm, roleOf, type PageState, type RefRegistry,
} from './snapshot.ts';

function viewOf(el: Element): Window & typeof globalThis {
  return el.ownerDocument.defaultView as Window & typeof globalThis;
}

function inputType(el: Element): string {
  return (el.getAttribute('type') || '').toLowerCase();
}

/** A GET form that is explicitly a search box: submitting it only reads. */
function isSearchForm(form: HTMLFormElement): boolean {
  if ((form.getAttribute('method') || 'get').toLowerCase() !== 'get') return false;
  return !!form.closest('[role="search"], search') || !!form.querySelector('input[type="search"]');
}

/** Describes what clicking an element would mean, so the policy can decide before anything happens. */
export function describeClickTarget(el: Element): ClickTarget {
  const tag = el.localName;
  const type = inputType(el);
  const label = accessibleName(el).slice(0, 60);
  const role = roleOf(el);
  let readSafe = false;
  let externalLink = false;
  let submit: ClickTarget['submit'] = null;

  if (tag === 'a' && el.hasAttribute('href')) {
    const a = el as HTMLAnchorElement;
    const web = a.protocol === 'http:' || a.protocol === 'https:';
    externalLink = web && a.origin !== el.ownerDocument.location.origin;
    readSafe = web && !externalLink && (el.getAttribute('role') || '') === '';
  } else if (tag === 'summary') {
    readSafe = true;
  }
  const disclosure = tag === 'summary' || el.hasAttribute('aria-expanded') || role === 'Tab';

  const form = (el as HTMLButtonElement).form ?? null;
  const submitsForm = (tag === 'button' && (type === 'submit' || type === '') && !!form)
    || (tag === 'input' && (type === 'submit' || type === 'image') && !!form);
  if (submitsForm && form) {
    submit = isSearchForm(form) ? null : 'form';
  } else {
    // Outside a form only the label hints at a submission. Apply that guess to button-like
    // controls only: tabs, links, checkboxes and options with such words are navigation or state.
    const buttonLike = role === 'Button' || role === 'Menuitem' || role === null;
    if (buttonLike && !readSafe && looksLikeSubmission(label)) submit = 'likely';
  }
  return { readSafe, disclosure, externalLink, submit, label };
}

export interface ClickResult {
  dispatched: true;
  note?: string;
}

/** Dispatches a full pointer/mouse click sequence at the element's centre. Cannot be undone. */
export function clickElement(el: Element): ClickResult {
  if (isDisabled(el)) {
    throw new DomError('ELEMENT_DISABLED', 'The element is disabled, so it was not clicked.');
  }
  const view = viewOf(el);
  const html = el as HTMLElement;
  if (typeof html.scrollIntoView === 'function') {
    html.scrollIntoView({ block: 'center', inline: 'center' });
  }
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  let note: string | undefined;
  const top = typeof el.ownerDocument.elementFromPoint === 'function' ? el.ownerDocument.elementFromPoint(x, y) : null;
  if (top && top !== el && !el.contains(top) && !top.contains(el)) {
    note = 'Another element appears to cover this one; the click may not have had its usual effect.';
  }

  const init: MouseEventInit = {
    bubbles: true, cancelable: true, composed: true, view, clientX: x, clientY: y, button: 0, buttons: 1,
  };
  const Pointer = view.PointerEvent ?? view.MouseEvent;
  el.dispatchEvent(new Pointer('pointerdown', init));
  el.dispatchEvent(new view.MouseEvent('mousedown', init));
  if (typeof html.focus === 'function') html.focus({ preventScroll: true });
  el.dispatchEvent(new Pointer('pointerup', { ...init, buttons: 0 }));
  el.dispatchEvent(new view.MouseEvent('mouseup', { ...init, buttons: 0 }));
  if (typeof html.click === 'function') {
    html.click();
  } else {
    el.dispatchEvent(new view.MouseEvent('click', { ...init, buttons: 0 }));
  }
  return note ? { dispatched: true, note } : { dispatched: true };
}

export interface FillResult {
  filled: true;
  /** Whether the field now holds exactly the requested content (masks and formatters may alter it). */
  valueMatches: boolean;
  note?: string;
}

const SETTABLE_INPUT_TYPES = new Set([
  '', 'text', 'search', 'email', 'url', 'tel', 'number',
  'date', 'time', 'datetime-local', 'month', 'week', 'color', 'range',
]);
/** Types where text can be typed key by key (date pickers and the like take a whole value). */
const TYPEABLE_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'number']);

function fireInput(el: Element, text: string, inputType = 'insertText'): void {
  const view = viewOf(el);
  const InputEv = view.InputEvent ?? view.Event;
  el.dispatchEvent(new InputEv('input', { bubbles: true, composed: true, inputType, data: text } as InputEventInit));
}

function fireChange(el: Element): void {
  el.dispatchEvent(new (viewOf(el).Event)('change', { bubbles: true, composed: true }));
}

/** Sets .value through the native setter so framework-controlled inputs notice the change. */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const view = viewOf(el);
  const proto = el.localName === 'textarea' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

const KEY_CODES: Record<string, [code: string, keyCode: number]> = {
  Enter: ['Enter', 13], Escape: ['Escape', 27], Tab: ['Tab', 9], ' ': ['Space', 32],
  Backspace: ['Backspace', 8], Delete: ['Delete', 46],
  ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39],
  Home: ['Home', 36], End: ['End', 35], PageUp: ['PageUp', 33], PageDown: ['PageDown', 34],
};

/** Dispatches one keyboard event; returns false if a handler cancelled it. */
function fireKey(el: Element, type: 'keydown' | 'keypress' | 'keyup', key: string, shift = false): boolean {
  const view = viewOf(el);
  const known = KEY_CODES[key];
  const code = known ? known[0] : /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : '';
  const keyCode = known ? known[1] : key.toUpperCase().charCodeAt(0);
  // keyCode/which are legacy, but many sites still read them.
  const init = { key, code, keyCode, which: keyCode, shiftKey: shift, bubbles: true, cancelable: true, composed: true, view };
  return el.dispatchEvent(new view.KeyboardEvent(type, init as KeyboardEventInit));
}

function placeCaret(el: Element, selectAll: boolean): boolean {
  const doc = el.ownerDocument;
  const selection = doc.getSelection?.();
  if (!selection) return false;
  const range = doc.createRange();
  range.selectNodeContents(el);
  if (!selectAll) range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

/** Inserts text into an editing host through the browser's editing pipeline, with a plain fallback. */
function insertIntoEditable(el: Element, text: string): void {
  const doc = el.ownerDocument;
  const inserted = typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, text);
  if (!inserted) {
    el.textContent = (el.textContent ?? '') + text;
    fireInput(el, text);
  }
}

function assertWritable(el: Element): void {
  if (isSensitiveField(el)) {
    throw new DomError('SENSITIVE_FIELD', 'Password and other credential fields cannot be filled by the agent. The user must type into them.');
  }
  if (isDisabled(el) || (el as HTMLInputElement).readOnly === true) {
    throw new DomError('ELEMENT_DISABLED', 'The field is disabled or read-only.');
  }
}

/** Sets a checkbox, radio button or switch to the wanted state; does nothing if it is already there. */
function setChecked(el: Element, wanted: boolean): FillResult {
  const current = checkedState(el);
  if (current === wanted) return { filled: true, valueMatches: true, note: 'It already had that state; nothing was clicked.' };
  if (!wanted && roleOf(el) === 'Radio') {
    throw new DomError('UNSUPPORTED_ELEMENT', 'A radio button cannot be unchecked; choose another option of its group instead.');
  }
  clickElement(el);
  return checkedState(el) === wanted
    ? { filled: true, valueMatches: true }
    : { filled: true, valueMatches: false, note: 'The control did not change state after the click. Take a snapshot to check.' };
}

/**
 * Enters content into a form control: text into inputs, textareas and contenteditable regions, an
 * option into a select, true/false into a checkbox, radio button or switch.
 */
export function fillElement(el: Element, text: string, append: boolean, method: 'set' | 'type' = 'set'): FillResult {
  const tag = el.localName;
  const html = el as HTMLElement;
  assertWritable(el);

  if (checkedState(el) !== null) {
    const wanted = /^(true|on|yes|checked|1)$/i.test(text.trim()) ? true
      : /^(false|off|no|unchecked|0)$/i.test(text.trim()) ? false : null;
    if (wanted === null) {
      throw new DomError('UNSUPPORTED_ELEMENT', 'This is a checkbox, radio button or switch: fill it with "true" or "false", or toggle it with browser_click.');
    }
    return setChecked(el, wanted);
  }

  if (tag === 'select') {
    const select = el as HTMLSelectElement;
    const wanted = norm(text).toLowerCase();
    const option = Array.from(select.options).find(
      (o) => norm(o.textContent).toLowerCase() === wanted || o.value.toLowerCase() === wanted);
    if (!option) {
      throw new DomError('OPTION_NOT_FOUND', 'No option with that label or value. Take a snapshot to see the available options.');
    }
    if (option.disabled) throw new DomError('ELEMENT_DISABLED', 'That option is disabled.');
    html.focus?.({ preventScroll: true });
    select.value = option.value;
    fireInput(el, option.value);
    fireChange(el);
    return { filled: true, valueMatches: select.value === option.value };
  }

  if (tag === 'input' || tag === 'textarea') {
    const type = tag === 'input' ? inputType(el) : '';
    if (tag === 'input' && !SETTABLE_INPUT_TYPES.has(type)) {
      throw new DomError('UNSUPPORTED_ELEMENT', `Input type "${type}" cannot be filled with text.`);
    }
    const field = el as HTMLInputElement | HTMLTextAreaElement;
    const value = append ? field.value + text : text;
    html.focus?.({ preventScroll: true });
    if (method === 'type' && (tag === 'textarea' || TYPEABLE_INPUT_TYPES.has(type))) {
      if (!append && field.value) {
        setNativeValue(field, '');
        fireInput(el, '', 'deleteContentBackward');
      }
      for (const char of text) {
        if (fireKey(el, 'keydown', char)) {
          fireKey(el, 'keypress', char);
          setNativeValue(field, field.value + char);
          fireInput(el, char);
        }
        fireKey(el, 'keyup', char);
      }
    } else {
      setNativeValue(field, value);
      fireInput(el, text);
    }
    fireChange(el);
    const matches = field.value === value;
    return matches
      ? { filled: true, valueMatches: true }
      : { filled: true, valueMatches: false, note: 'The field did not keep the exact text (it may format, limit or reject input). Take a snapshot to check.' };
  }

  if (isEditingHost(el)) {
    const before = el.textContent ?? '';
    html.focus?.({ preventScroll: true });
    const selected = placeCaret(el, !append);
    if (!append && !selected) el.textContent = '';
    if (method === 'type') {
      if (!append && selected && before) {
        const doc = el.ownerDocument;
        if (!(typeof doc.execCommand === 'function' && doc.execCommand('delete'))) el.textContent = '';
      }
      for (const char of text) {
        if (fireKey(el, 'keydown', char)) {
          fireKey(el, 'keypress', char);
          insertIntoEditable(el, char);
        }
        fireKey(el, 'keyup', char);
      }
    } else if (!text) {
      // Clearing: remove the selected content.
      const doc = el.ownerDocument;
      if (!(selected && typeof doc.execCommand === 'function' && doc.execCommand('delete'))) {
        el.textContent = append ? before : '';
        fireInput(el, '', 'deleteContentBackward');
      }
    } else {
      // Goes through the browser's editing pipeline, which rich-text editors listen to.
      const doc = el.ownerDocument;
      const inserted = selected && typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, text);
      if (!inserted) {
        el.textContent = append ? before + text : text;
        fireInput(el, text);
      }
    }
    const expected = norm(append ? before + text : text);
    const matches = norm(el.textContent) === expected;
    return matches
      ? { filled: true, valueMatches: true }
      : { filled: true, valueMatches: false, note: 'This editor did not take the text as typed; it may be a custom editor that cannot be controlled generically. Take a snapshot to check.' };
  }

  throw new DomError('UNSUPPORTED_ELEMENT',
    'This element is not a standard text field, select or editable region. Custom editors and widgets cannot be filled generically.');
}

/** What pressing Enter here would mean, so the policy can treat a form submission as one. */
export function describeKeyTarget(el: Element, key: string): { submit: 'form' | null; label: string } {
  const label = accessibleName(el).slice(0, 60);
  if (key !== 'Enter' || el.localName !== 'input') return { submit: null, label };
  const form = (el as HTMLInputElement).form;
  if (!form || !SETTABLE_INPUT_TYPES.has(inputType(el)) || isSearchForm(form)) return { submit: null, label };
  return { submit: 'form', label };
}

function tabbables(doc: Document): HTMLElement[] {
  const selector = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]';
  return (Array.from(doc.querySelectorAll(selector)) as HTMLElement[]).filter((el) =>
    el.tabIndex >= 0 && !isDisabled(el) && inputType(el) !== 'hidden' && isVisible(el));
}

export interface KeyResult {
  dispatched: true;
  /** What the key did beyond the page's own handlers, if anything. */
  effect: string;
}

/**
 * Presses one key on an element (or the focused one). Synthetic key events do not trigger the
 * browser's built-in behaviour, so the common defaults are carried out here: activation, form
 * submission, focus movement, text entry.
 */
export function pressKey(doc: Document, target: Element | null, key: string): KeyResult {
  const shift = key === 'Shift+Tab';
  const name = shift ? 'Tab' : key;
  const el = target ?? doc.activeElement ?? doc.body;
  const html = el as HTMLElement;
  if (target && typeof html.focus === 'function') html.focus({ preventScroll: true });
  const tag = el.localName;
  const type = inputType(el);
  const textField = (tag === 'input' && TYPEABLE_INPUT_TYPES.has(type)) || tag === 'textarea';
  const printable = [...name].length === 1;
  // Keys that would change a field's content are subject to the same rules as filling it.
  if ((printable || name === 'Backspace') && (tag === 'input' || tag === 'textarea' || isEditingHost(el))) assertWritable(el);

  const allowed = fireKey(el, 'keydown', name, shift);
  let effect = allowed ? 'none beyond the page\'s own key handlers' : 'the page handled the key itself';
  if (allowed) {
    if (printable || name === 'Enter') fireKey(el, 'keypress', name, shift);
    const role = roleOf(el);
    const activatable = role === 'Button' || role === 'Link' || role === 'Toggle' || role === 'Tab' || role === 'Menuitem';
    if (name === 'Enter' && tag === 'input' && (el as HTMLInputElement).form && SETTABLE_INPUT_TYPES.has(type)) {
      const form = (el as HTMLInputElement).form as HTMLFormElement;
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.dispatchEvent(new (viewOf(el).Event)('submit', { bubbles: true, cancelable: true }));
      effect = 'submitted the form';
    } else if ((name === 'Enter' && activatable) || (name === ' ' && (activatable || checkedState(el) !== null))) {
      if (isDisabled(el)) throw new DomError('ELEMENT_DISABLED', 'The element is disabled.');
      html.click?.();
      effect = 'activated the element';
    } else if (name === 'Enter' && tag === 'textarea') {
      const field = el as HTMLTextAreaElement;
      setNativeValue(field, field.value + '\n');
      fireInput(el, '\n', 'insertLineBreak');
      effect = 'inserted a line break';
    } else if (name === 'Enter' && isEditingHost(el)) {
      const ok = typeof doc.execCommand === 'function' && doc.execCommand('insertParagraph');
      effect = ok ? 'inserted a new paragraph' : effect;
    } else if (name === 'Tab') {
      const order = tabbables(el.ownerDocument);
      const index = order.indexOf(html);
      const next = order.length ? order[(index + (shift ? -1 : 1) + order.length) % order.length] : null;
      if (next) {
        next.focus({ preventScroll: false });
        effect = `moved focus to ${roleOf(next) ?? 'the next element'}: ${accessibleName(next).slice(0, 60) || '(unnamed)'}`;
      }
    } else if (printable && textField) {
      const field = el as HTMLInputElement;
      setNativeValue(field, field.value + name);
      fireInput(el, name);
      effect = 'typed the character';
    } else if (printable && isEditingHost(el)) {
      placeCaret(el, false);
      insertIntoEditable(el, name);
      effect = 'typed the character';
    } else if (name === 'Backspace' && textField) {
      const field = el as HTMLInputElement;
      setNativeValue(field, field.value.slice(0, -1));
      fireInput(el, '', 'deleteContentBackward');
      effect = 'deleted the last character';
    } else if ((name === 'ArrowDown' || name === 'ArrowUp') && tag === 'select') {
      const select = el as HTMLSelectElement;
      const index = Math.min(Math.max(select.selectedIndex + (name === 'ArrowDown' ? 1 : -1), 0), select.options.length - 1);
      if (index !== select.selectedIndex) {
        select.selectedIndex = index;
        fireInput(el, select.value);
        fireChange(el);
      }
      effect = 'moved the selection';
    }
  }
  fireKey(el, 'keyup', name, shift);
  return { dispatched: true, effect };
}

export interface ScrollResult {
  x: number;
  y: number;
  maxY: number;
  atTop: boolean;
  atBottom: boolean;
  moved: boolean;
  target: 'page' | 'element' | 'element-into-view';
  /** Set when the scrolled area grew after scrolling, i.e. the site loaded more content. */
  loadedMore?: true;
  note?: string;
}

/** How long to let a page react to a scroll before judging whether it loaded more content. */
const SCROLL_SETTLE_MS = 350;

/** Scrolls the page, or the given element (into view if it is not itself scrollable). */
export async function scrollPage(
  doc: Document, direction: string, amount: number | undefined, target: Element | null, state?: PageState,
): Promise<ScrollResult> {
  const view = doc.defaultView as Window;
  const root = doc.scrollingElement ?? doc.documentElement;
  let scroller: Element = root;
  let kind: ScrollResult['target'] = 'page';

  if (target && !isScrollable(target)) {
    kind = 'element-into-view';
  } else if (target) {
    scroller = target;
    kind = 'element';
  } else if (root.scrollHeight <= view.innerHeight + 4) {
    const inner = mainScroller(doc);
    if (inner) {
      scroller = inner;
      kind = 'element';
    }
  }

  const page = scroller === root;
  const viewportH = page ? view.innerHeight : scroller.clientHeight;
  const viewportW = page ? view.innerWidth : scroller.clientWidth;
  const beforeX = scroller.scrollLeft;
  const beforeY = scroller.scrollTop;
  const heightBefore = scroller.scrollHeight;

  if (kind === 'element-into-view') {
    (target as HTMLElement).scrollIntoView?.({ block: 'center', inline: 'nearest' });
  } else {
    const stepY = amount ?? Math.round(viewportH * 0.8);
    const stepX = amount ?? Math.round(viewportW * 0.8);
    switch (direction) {
      case 'up': scroller.scrollTop = beforeY - stepY; break;
      case 'down': scroller.scrollTop = beforeY + stepY; break;
      case 'left': scroller.scrollLeft = beforeX - stepX; break;
      case 'right': scroller.scrollLeft = beforeX + stepX; break;
      case 'top': scroller.scrollTop = 0; break;
      case 'bottom': scroller.scrollTop = scroller.scrollHeight; break;
      default: throw new DomError('INVALID_ARGUMENT', `Unknown scroll direction "${direction}".`);
    }
  }

  // Feeds and long lists add content when scrolled. Give the page a moment, then report it, so
  // the agent knows the page is longer than it was and reads again.
  await new Promise((resolve) => setTimeout(resolve, SCROLL_SETTLE_MS));
  const maxY = Math.max(0, scroller.scrollHeight - viewportH);
  const result: ScrollResult = {
    x: Math.round(scroller.scrollLeft),
    y: Math.round(scroller.scrollTop),
    maxY: Math.round(maxY),
    atTop: scroller.scrollTop <= 1,
    atBottom: scroller.scrollTop >= maxY - 1,
    moved: kind === 'element-into-view' || scroller.scrollLeft !== beforeX || scroller.scrollTop !== beforeY,
    target: kind,
  };
  if (scroller.scrollHeight > heightBefore + 40) {
    result.loadedMore = true;
    result.note = 'The page loaded more content after this scroll. Read again (browser_extract or browser_snapshot) and keep scrolling until nothing new loads.';
    if (state) state.reachedEnd = false;
  } else if (state && kind !== 'element-into-view' && result.atBottom) {
    state.reachedEnd = true;
  }
  return result;
}

/**
 * A sentence telling the agent how much of the page a viewport screenshot covers, so it knows
 * whether there is more to scroll to.
 */
export function viewportCoverage(doc: Document): string {
  const view = doc.defaultView as Window;
  const root = doc.scrollingElement ?? doc.documentElement;
  const inner = root.scrollHeight <= view.innerHeight + 4 ? mainScroller(doc) : null;
  const scroller = inner ?? root;
  const viewport = inner ? inner.clientHeight : view.innerHeight;
  const total = scroller.scrollHeight;
  const top = Math.round(scroller.scrollTop);
  const below = Math.max(0, Math.round(total - top - viewport));
  if (total <= viewport + 4) {
    return 'This image shows the full height of the page; nothing is scrolled out of view.';
  }
  const percent = Math.max(1, Math.round((viewport / total) * 100));
  return `This image shows only the visible viewport: ${top}-${top + Math.round(viewport)}px of a ${Math.round(total)}px tall ${inner ? 'scrolling area' : 'page'} (about ${percent}%). `
    + `Not in the image: ${top}px above and ${below}px below. Use browser_scroll and capture again to see more, or browser_extract to read all of the text at once.`;
}

export type WaitCondition = 'visible' | 'gone' | 'enabled' | 'disabled';

export interface WaitParams {
  text?: string;
  ref?: number;
  condition: WaitCondition;
  timeoutMs: number;
  /** Set `cancelled` to stop waiting early. */
  signal?: { cancelled: boolean };
}

/** Bounded wait for a UI condition: visible text, or an element becoming visible, gone, enabled or disabled. */
export async function waitFor(doc: Document, registry: RefRegistry, params: WaitParams): Promise<{ satisfied: true; elapsedMs: number }> {
  const needle = params.text ? norm(params.text).toLowerCase() : null;
  const timeoutMs = Math.min(Math.max(params.timeoutMs, 0), 30000);
  const started = Date.now();
  const element = (): Element | null => registry.peek(params.ref as number);
  const met = (): boolean => {
    if (needle !== null) {
      const present = !!doc.body && norm(visibleText(doc.body)).toLowerCase().includes(needle);
      return params.condition === 'gone' ? !present : present;
    }
    const el = element();
    const visible = !!el && isVisible(el);
    switch (params.condition) {
      case 'gone': return !visible;
      case 'enabled': return visible && !isDisabled(el as Element);
      case 'disabled': return visible && isDisabled(el as Element);
      default: return visible;
    }
  };
  if (needle === null && params.condition !== 'gone' && element() === null) {
    throw new DomError('STALE_REF', `Ref [${params.ref}] is not known in this document. Call browser_snapshot first.`);
  }
  for (;;) {
    if (params.signal?.cancelled) throw new DomError('CANCELLED', 'The wait was cancelled.');
    if (met()) return { satisfied: true, elapsedMs: Date.now() - started };
    if (Date.now() - started >= timeoutMs) {
      const what = needle !== null ? 'The text' : `Ref [${params.ref}]`;
      const wanted = params.condition === 'gone' ? 'was still visible' : `did not become ${params.condition}`;
      throw new DomError('WAIT_TIMEOUT', `${what} ${wanted} within ${timeoutMs}ms.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

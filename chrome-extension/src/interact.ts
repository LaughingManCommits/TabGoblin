// Generic page interactions: click, fill, type, keys, scroll, wait. Pure DOM code (no chrome.*).
// Nothing here knows about any particular website, and nothing evaluates agent-supplied code.

import { editorKind, fillEditor, fireKey, pressEditorKey, type FillResult } from './editor.ts';
import { scrollerOf, visibleText } from './extract.ts';
import { looksLikeSearch, looksLikeSubmission, type ClickTarget, type KeyTarget } from './policy.ts';
import {
  DomError, accessibleName, checkedState, frameDocument, inViewport, isDisabled, isEditingHost, isScrollable, isSensitiveField, isVisible,
  mainScroller, norm, roleOf, type PageState, type RefRegistry,
} from './snapshot.ts';

export type { FillResult };

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

/** An element's name, short enough for a prompt or a message: cut at a word where it can be, and marked as cut. */
function shortName(el: Element, max = 60): string {
  const name = accessibleName(el);
  if (name.length <= max) return name;
  const cut = name.slice(0, max - 1);
  const word = cut.lastIndexOf(' ');
  return `${(word > max / 2 ? cut.slice(0, word) : cut).trimEnd()}…`;
}

/** Describes what clicking an element would mean, so the policy can decide before anything happens. */
export function describeClickTarget(el: Element): ClickTarget {
  const tag = el.localName;
  const type = inputType(el);
  const label = shortName(el);
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
 * Enters content into a native form control: text into inputs and textareas, an option into a
 * select, true/false into a checkbox, radio button or switch. Editors go through `fill`.
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
        // A line break is content. No key goes with it: a fill never presses Enter, which a page
        // may take as "send".
        if (char === '\n' || char === '\r') {
          setNativeValue(field, field.value + char);
          fireInput(el, char, 'insertLineBreak');
          continue;
        }
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

  throw new DomError('UNSUPPORTED_ELEMENT',
    'This element is not a standard text field, select or editable region. Custom editors and widgets cannot be filled generically.');
}

const ACTIVATED_BY_KEY = new Set(['Button', 'Link', 'Toggle', 'Tab', 'Menuitem']);

/** Whether this key does to the element what a click does: Enter or Space on a button, Space on a checkbox. */
function activates(el: Element, key: string): boolean {
  const role = roleOf(el);
  const activatable = role !== null && ACTIVATED_BY_KEY.has(role);
  return (key === 'Enter' && activatable) || (key === ' ' && (activatable || checkedState(el) !== null));
}

/** A field of a form that Enter submits. */
function fieldOfForm(el: Element): HTMLFormElement | null {
  if (el.localName !== 'input' || !SETTABLE_INPUT_TYPES.has(inputType(el))) return null;
  return (el as HTMLInputElement).form;
}

/**
 * A text box that searches or filters: Enter there changes nothing. What the page says about the
 * box counts first: its type, its role, a search landmark around it. Its wording counts only for
 * a one-line field. A text area or an editor named "Search the archive or write a message" is
 * still where a message is written.
 */
function isSearchBox(el: Element, label: string): boolean {
  if (inputType(el) === 'search' || el.getAttribute('role') === 'searchbox') return true;
  if (el.closest('[role="search"], search')) return true;
  return el.localName === 'input' && looksLikeSearch(`${label} ${el.getAttribute('placeholder') ?? ''}`);
}

const OPTION_LISTS = new Set(['listbox', 'menu', 'tree', 'grid']);

/**
 * A list of options is open on the element, so Enter takes the highlighted one. The element has
 * to point to that list, and the list has to be there to see: `aria-expanded` alone is carried
 * by text boxes for other reasons, an expanded composer for one.
 */
function choosesAnOption(el: Element): boolean {
  const doc = el.ownerDocument;
  const pointedAt = (attribute: string): Element[] => (el.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean)
    .map((id) => doc.getElementById(id)).filter((found): found is HTMLElement => found !== null);
  const isOpenList = (list: Element | null): boolean =>
    list !== null && OPTION_LISTS.has(list.getAttribute('role') ?? '') && isVisible(list);
  if ([...pointedAt('aria-controls'), ...pointedAt('aria-owns')].some(isOpenList)) return true;
  // The highlighted option itself, inside such a list.
  return pointedAt('aria-activedescendant').some((option) =>
    isVisible(option) && isOpenList(option.closest('[role="listbox"], [role="menu"], [role="tree"], [role="grid"]')));
}

/** Whether text is written into the element: a field, a text area, an editor. */
export function takesText(el: Element): boolean {
  return (el.localName === 'input' && SETTABLE_INPUT_TYPES.has(inputType(el))) || el.localName === 'textarea'
    || (checkedState(el) === null && editorKind(el) !== null);
}

/**
 * What pressing a key on an element would mean, so that the rules are applied before it is
 * pressed: a click by keyboard, the submission of a form, or Enter in a text box, which may send
 * what is written there.
 */
export function describeKeyTarget(el: Element, key: string): KeyTarget {
  const label = shortName(el);
  const none: KeyTarget = { submit: null, click: null, label };
  // In the order in which `pressKey` decides what the key does.
  const form = key === 'Enter' ? fieldOfForm(el) : null;
  if (form) return isSearchForm(form) ? none : { ...none, submit: 'form' };
  if (activates(el, key)) return { ...none, click: describeClickTarget(el) };
  const text = takesText(el);
  // A control of the page's own making, put in keyboard reach: its key handler decides what Enter
  // and Space do, and to the rules that is a click on it.
  const reachable = el.hasAttribute('tabindex') && (el as HTMLElement).tabIndex >= 0;
  if ((key === 'Enter' || key === ' ') && !text && reachable) return { ...none, click: describeClickTarget(el) };
  if (key !== 'Enter' || !text || choosesAnOption(el) || isSearchBox(el, label)) return none;
  return { ...none, submit: 'text' };
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
  /** In an editor: why the effect could not be confirmed, or may not hold for what is entered next. */
  note?: string;
}

/**
 * Presses one key on an element (or the focused one). Synthetic key events do not trigger the
 * browser's built-in behaviour, so the common defaults are carried out here: activation, form
 * submission, focus movement, text entry.
 */
export function pressKey(doc: Document, target: Element | null, key: string): KeyResult {
  const shift = key === 'Shift+Tab';
  const name = shift ? 'Tab' : key;
  const el = keyElement(doc, target);
  const html = el as HTMLElement;
  if (target && typeof html.focus === 'function') html.focus({ preventScroll: true });
  const tag = el.localName;
  const type = inputType(el);
  const textField = (tag === 'input' && TYPEABLE_INPUT_TYPES.has(type)) || tag === 'textarea';
  const printable = [...name].length === 1;
  // Keys that would change a field's content are subject to the same rules as filling it.
  if ((printable || name === 'Backspace') && (tag === 'input' || tag === 'textarea')) assertWritable(el);

  const allowed = fireKey(el, 'keydown', name, { shift });
  let effect = allowed ? 'none beyond the page\'s own key handlers' : 'the page handled the key itself';
  if (allowed) {
    if (printable || name === 'Enter') fireKey(el, 'keypress', name, { shift });
    const form = name === 'Enter' ? fieldOfForm(el) : null;
    if (form) {
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.dispatchEvent(new (viewOf(el).Event)('submit', { bubbles: true, cancelable: true }));
      effect = 'submitted the form';
    } else if (activates(el, name)) {
      if (isDisabled(el)) throw new DomError('ELEMENT_DISABLED', 'The element is disabled.');
      html.click?.();
      effect = 'activated the element';
    } else if (name === 'Enter' && tag === 'textarea') {
      const field = el as HTMLTextAreaElement;
      setNativeValue(field, field.value + '\n');
      fireInput(el, '\n', 'insertLineBreak');
      effect = 'inserted a line break';
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
  fireKey(el, 'keyup', name, { shift });
  return { dispatched: true, effect };
}

/** Enters content into any fillable element: a native form control or an editor. */
export async function fill(el: Element, text: string, append: boolean, method: 'set' | 'type' = 'set'): Promise<FillResult> {
  if (checkedState(el) === null && editorKind(el)) {
    assertWritable(el);
    return fillEditor(el, text, append, method);
  }
  return fillElement(el, text, append, method);
}

const EDITING_KEYS = new Set(['Enter', 'Backspace', 'Delete']);

/** The element that has the keyboard, looking into shadow roots and frames of the same origin. */
function focusedElement(doc: Document): Element {
  let el: Element = doc.activeElement ?? doc.body;
  for (;;) {
    const frame = el.localName === 'iframe' || el.localName === 'frame' ? frameDocument(el) : null;
    const inner: Element | null | undefined = el.shadowRoot?.activeElement ?? frame?.activeElement;
    if (!inner || inner === el) return caretRegion(el) ?? el;
    el = inner;
  }
}

/**
 * Typing goes where the caret is. A page moves the caret from one editable region into another by
 * setting the selection, and the browser moves the keyboard along with it, except in a window
 * that is not in front. There the region that holds the caret is the one that is meant.
 */
function caretRegion(focused: Element): Element | null {
  if (!isEditingHost(focused)) return null;
  let node: Node | null = focused.ownerDocument.getSelection?.()?.anchorNode ?? null;
  while (node && !(node.nodeType === 1 && isEditingHost(node as Element))) node = node.parentNode;
  const region = node as Element | null;
  return region && region !== focused && !focused.contains(region) && !region.contains(focused) ? region : null;
}

/** The element a key press goes to: the one that was named, or whatever has the keyboard. */
export function keyElement(doc: Document, target: Element | null): Element {
  return target ?? focusedElement(doc);
}

/** Presses one key on an element (or the focused one), in a form control or an editor. */
export async function press(doc: Document, target: Element | null, key: string): Promise<KeyResult> {
  const el = keyElement(doc, target);
  const editing = [...key].length === 1 || EDITING_KEYS.has(key);
  if (editing && editorKind(el)) {
    assertWritable(el);
    return { dispatched: true, ...(await pressEditorKey(el, key, false)) };
  }
  return pressKey(doc, target, key);
}

/**
 * Waits until the page has stopped changing: no element added, removed or rewritten for `quietMs`.
 * A site that swaps its content without loading a new document changes the address first and the
 * page a moment later; reading in between returns the old page under the new address.
 */
export function waitForQuiet(doc: Document, quietMs: number, maxMs: number): Promise<{ quiet: boolean; waitedMs: number }> {
  const view = viewOf(doc.documentElement);
  const started = Date.now();
  return new Promise((resolve) => {
    if (typeof view.MutationObserver !== 'function' || !doc.body) {
      resolve({ quiet: true, waitedMs: 0 });
      return;
    }
    let idle: ReturnType<typeof setTimeout>;
    const finish = (quiet: boolean): void => {
      observer.disconnect();
      clearTimeout(idle);
      clearTimeout(limit);
      resolve({ quiet, waitedMs: Date.now() - started });
    };
    const observer = new view.MutationObserver(() => {
      clearTimeout(idle);
      idle = setTimeout(() => finish(true), quietMs);
    });
    observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
    idle = setTimeout(() => finish(true), quietMs);
    const limit = setTimeout(() => finish(false), maxMs);
  });
}

/**
 * How many fields hold text the user or the agent entered and the page has not sent: what a
 * navigation would throw away. Counted, never read.
 */
export function unsavedFields(doc: Document): number {
  let count = 0;
  for (const el of Array.from(doc.querySelectorAll('input, textarea')).slice(0, 500)) {
    const field = el as HTMLInputElement | HTMLTextAreaElement;
    if (el.localName === 'input' && !['', 'text', 'email', 'url', 'tel', 'number'].includes(inputType(el))) continue;
    if (field.disabled || field.readOnly || !isVisible(el)) continue;
    if (field.value.trim() !== '' && field.value !== field.defaultValue) count++;
  }
  return count;
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

  // An editor scrolls in a box around its text: the ref of the editor means that box.
  const editorBox = target && !isScrollable(target) && editorKind(target) ? scrollerOf(target) : null;
  if (editorBox) {
    scroller = editorBox;
    kind = 'element';
  } else if (target && !isScrollable(target)) {
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

/**
 * Moves the pointer over an element, as far as a script can: the events a page listens for to
 * open a menu or a tooltip. The browser's own hover state is not set by it: what a page shows
 * by a style rule for hovering alone does not appear. Nothing is pressed.
 */
export function hoverElement(el: Element): { dispatched: true; note: string } {
  const view = viewOf(el);
  const html = el as HTMLElement;
  if (typeof html.scrollIntoView === 'function') html.scrollIntoView({ block: 'center', inline: 'center' });
  const rect = el.getBoundingClientRect();
  const init: MouseEventInit = {
    bubbles: true, cancelable: true, composed: true, view, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0, buttons: 0,
  };
  const Pointer = view.PointerEvent ?? view.MouseEvent;
  el.dispatchEvent(new Pointer('pointerover', init));
  el.dispatchEvent(new Pointer('pointerenter', { ...init, bubbles: false }));
  el.dispatchEvent(new view.MouseEvent('mouseover', init));
  el.dispatchEvent(new view.MouseEvent('mouseenter', { ...init, bubbles: false }));
  el.dispatchEvent(new Pointer('pointermove', init));
  el.dispatchEvent(new view.MouseEvent('mousemove', init));
  return {
    dispatched: true,
    note: 'The pointer events were sent. Take a snapshot (diff=true) to see what appeared. What a page shows by a hover style alone does not appear this way.',
  };
}

/**
 * The control that leads to the next page of a list: a link or a button that is visible, not
 * disabled, and has exactly this name. Null when there is none, which is how a last page is known.
 */
export function controlNamed(doc: Document, name: string): Element | null {
  const wanted = norm(name).toLowerCase();
  if (!wanted) return null;
  for (const el of Array.from(doc.querySelectorAll('a[href], button, [role="link"], [role="button"]'))) {
    if (!isVisible(el) || isDisabled(el) || el.getAttribute('aria-disabled') === 'true') continue;
    if (norm(accessibleName(el)).toLowerCase() === wanted) return el;
  }
  return null;
}

/** The smallest side of a frame that counts as showing something: below it there is nothing to read in a picture. */
const FRAME_SHOWS_FROM_PX = 8;
const EMBEDDING = 'iframe, frame, object, embed, fencedframe, portal';

/**
 * How many frames of another site are in view. A picture of the tab would show what is in them,
 * and that is not the session's to read: their text is never read either. A frame counts when
 * its document cannot be reached from this one, which is how the browser tells a frame of
 * another site, and when an embedded file names another site as its address. Frames inside a
 * frame of this site are looked at as well.
 */
export function foreignFramesInView(doc: Document, depth = 0): number {
  const view = doc.defaultView;
  if (!view || depth > 3) return 0;
  let count = 0;
  for (const el of Array.from(doc.querySelectorAll(EMBEDDING))) {
    const rect = el.getBoundingClientRect();
    if (rect.width < FRAME_SHOWS_FROM_PX || rect.height < FRAME_SHOWS_FROM_PX) continue;
    if (!isVisible(el) || !inViewport(rect, view)) continue;
    const tag = el.localName;
    if (tag === 'object' || tag === 'embed') {
      // An embedded file: of another site when its address says so. Without an address it shows nothing of one.
      const address = el.getAttribute(tag === 'object' ? 'data' : 'src');
      if (!address) continue;
      let origin: string | null = null;
      try {
        origin = new URL(address, doc.baseURI).origin;
      } catch {
        origin = null;
      }
      if (origin !== doc.location?.origin) count++;
      continue;
    }
    const inner = frameDocument(el);
    if (!inner) count++;
    else count += foreignFramesInView(inner, depth + 1);
  }
  return count;
}

export type WaitCondition = 'visible' | 'gone' | 'enabled' | 'disabled' | 'changed';

export interface WaitParams {
  text?: string;
  ref?: number;
  condition: WaitCondition;
  timeoutMs: number;
  /** Set `cancelled` to stop waiting early. */
  signal?: { cancelled: boolean };
}

/**
 * What an element shows and is, as one text: for telling that it changed. Its visible text, its
 * value if it is a field that may be read, and the states a snapshot gives. Nothing of it leaves the page.
 */
function shownState(el: Element): string {
  const field = el as HTMLInputElement;
  const value = !isSensitiveField(el) && typeof field.value === 'string' ? field.value : '';
  const states = ['aria-busy', 'aria-expanded', 'aria-selected', 'aria-pressed', 'aria-current', 'aria-invalid', 'aria-valuenow', 'aria-valuetext']
    .map((name) => el.getAttribute(name) ?? '').join('|');
  return [norm(visibleText(el)), value, String(isDisabled(el)), String(checkedState(el)), states].join('\u0000');
}

/** Bounded wait for a UI condition: visible text, or an element becoming visible, gone, enabled, disabled or other than it was. */
export async function waitFor(doc: Document, registry: RefRegistry, params: WaitParams): Promise<{ satisfied: true; elapsedMs: number }> {
  const needle = params.text ? norm(params.text).toLowerCase() : null;
  const timeoutMs = Math.min(Math.max(params.timeoutMs, 0), 30000);
  const started = Date.now();
  const element = (): Element | null => registry.peek(params.ref as number);
  // For `changed`: what the element showed when the wait began.
  const first = element();
  const was = params.condition === 'changed' && first && isVisible(first) ? shownState(first) : null;
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
      // Other than it was: its text, its value or one of its states; or it is gone.
      case 'changed': return !visible || shownState(el as Element) !== was;
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
      const wanted = params.condition === 'gone' ? 'was still visible'
        : params.condition === 'changed' ? 'did not change' : `did not become ${params.condition}`;
      throw new DomError('WAIT_TIMEOUT', `${what} ${wanted} within ${timeoutMs}ms.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

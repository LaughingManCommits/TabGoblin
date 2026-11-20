// Generic page interactions: click, fill, scroll, wait. Pure DOM code (no chrome.*).
// Nothing here knows about any particular website, and nothing evaluates agent-supplied code.

import { looksLikeSubmission, type ClickTarget } from './policy.ts';
import {
  DomError, accessibleName, isDisabled, isScrollable, isSensitiveField, isVisible, mainScroller, norm, roleOf,
  visibleText, type RefRegistry,
} from './snapshot.ts';

function viewOf(el: Element): Window & typeof globalThis {
  return el.ownerDocument.defaultView as Window & typeof globalThis;
}

function inputType(el: Element): string {
  return (el.getAttribute('type') || '').toLowerCase();
}

function isEditingHost(el: Element): boolean {
  const v = el.getAttribute('contenteditable');
  return v !== null && v.toLowerCase() !== 'false';
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

  const form = (el as HTMLButtonElement).form ?? null;
  const submitsForm = (tag === 'button' && (type === 'submit' || type === '') && !!form)
    || (tag === 'input' && (type === 'submit' || type === 'image') && !!form);
  if (submitsForm && form) {
    submit = isSearchForm(form) ? null : 'form';
  } else {
    // Outside a form only the label hints at a submission. Apply that guess to button-like
    // controls only: tabs, links, checkboxes and options with such words are navigation or state.
    const role = roleOf(el);
    const buttonLike = role === 'Button' || role === 'Menuitem' || role === null;
    if (buttonLike && !readSafe && looksLikeSubmission(label)) submit = 'likely';
  }
  return { readSafe, externalLink, submit, label };
}

export interface ClickResult {
  dispatched: true;
  note?: string;
}

/** Dispatches a full pointer/mouse click sequence at the element's centre. */
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
  /** Whether the field now holds exactly the requested text (masks and formatters may alter it). */
  valueMatches: boolean;
  note?: string;
}

const SETTABLE_INPUT_TYPES = new Set([
  '', 'text', 'search', 'email', 'url', 'tel', 'number',
  'date', 'time', 'datetime-local', 'month', 'week', 'color', 'range',
]);

function fireInput(el: Element, text: string): void {
  const view = viewOf(el);
  const InputEv = view.InputEvent ?? view.Event;
  el.dispatchEvent(new InputEv('input', { bubbles: true, composed: true, inputType: 'insertText', data: text } as InputEventInit));
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

/** Enters text into an input, textarea, select or basic contenteditable element. */
export function fillElement(el: Element, text: string, append: boolean): FillResult {
  const tag = el.localName;
  const html = el as HTMLElement;
  if (isSensitiveField(el)) {
    throw new DomError('SENSITIVE_FIELD', 'Password and other credential fields cannot be filled by the agent. The user must type into them.');
  }
  if (isDisabled(el) || (el as HTMLInputElement).readOnly === true) {
    throw new DomError('ELEMENT_DISABLED', 'The field is disabled or read-only.');
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
      const hint = type === 'checkbox' || type === 'radio' ? ' Use browser_click to toggle it.' : '';
      throw new DomError('UNSUPPORTED_ELEMENT', `Input type "${type}" cannot be filled with text.${hint}`);
    }
    const field = el as HTMLInputElement | HTMLTextAreaElement;
    const value = append ? field.value + text : text;
    html.focus?.({ preventScroll: true });
    setNativeValue(field, value);
    fireInput(el, text);
    fireChange(el);
    const matches = field.value === value;
    return matches
      ? { filled: true, valueMatches: true }
      : { filled: true, valueMatches: false, note: 'The field did not keep the exact text (it may format, limit or reject input). Take a snapshot to check.' };
  }

  if (isEditingHost(el)) {
    const doc = el.ownerDocument;
    const before = el.textContent ?? '';
    html.focus?.({ preventScroll: true });
    let inserted = false;
    const selection = doc.getSelection?.();
    if (selection && typeof doc.execCommand === 'function') {
      const range = doc.createRange();
      range.selectNodeContents(el);
      if (append) range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      // Goes through the browser's editing pipeline, which rich-text editors listen to.
      inserted = doc.execCommand('insertText', false, text);
    }
    if (!inserted) {
      el.textContent = append ? before + text : text;
      fireInput(el, text);
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
export async function scrollPage(doc: Document, direction: string, amount: number | undefined, target: Element | null): Promise<ScrollResult> {
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

export interface WaitParams {
  text?: string;
  ref?: number;
  gone?: boolean;
  timeoutMs: number;
}

/** Bounded wait for visible text, or for a referenced element to be visible (or gone). */
export async function waitFor(doc: Document, registry: RefRegistry, params: WaitParams): Promise<{ satisfied: true; elapsedMs: number }> {
  const needle = params.text ? norm(params.text).toLowerCase() : null;
  const timeoutMs = Math.min(Math.max(params.timeoutMs, 0), 30000);
  const started = Date.now();
  const present = (): boolean => {
    if (needle !== null) {
      return !!doc.body && norm(visibleText(doc.body)).toLowerCase().includes(needle);
    }
    const el = registry.peek(params.ref as number);
    return !!el && isVisible(el);
  };
  if (needle === null && !params.gone && registry.peek(params.ref as number) === null) {
    throw new DomError('STALE_REF', `Ref [${params.ref}] is not known in this document. Call browser_snapshot first.`);
  }
  for (;;) {
    if (present() !== !!params.gone) return { satisfied: true, elapsedMs: Date.now() - started };
    if (Date.now() - started >= timeoutMs) {
      const what = needle !== null ? 'The text' : `Ref [${params.ref}]`;
      throw new DomError('WAIT_TIMEOUT',
        `${what} ${params.gone ? 'was still visible' : 'did not become visible'} within ${timeoutMs}ms.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

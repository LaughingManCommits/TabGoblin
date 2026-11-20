// DOM -> compact text snapshot with numbered element refs, plus visible-text extraction.
// Pure DOM code (no chrome.*), so it runs under jsdom in tests.
//
// Only allowlisted information leaves the page: role, accessible name, a few states, visible
// text. Never raw HTML, scripts, hidden inputs, password values or arbitrary attributes.

export class DomError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const SKIP_TAGS = new Set([
  'script', 'style', 'noscript', 'template', 'head', 'meta', 'link', 'title', 'base',
  'iframe', 'frame', 'frameset', 'object', 'embed', 'canvas', 'svg', 'math', 'audio', 'video',
  'source', 'track', 'datalist', 'option', 'optgroup',
]);

const ARIA_ROLES: Record<string, string> = {
  button: 'Button', link: 'Link', checkbox: 'Checkbox', radio: 'Radio', switch: 'Switch',
  tab: 'Tab', menuitem: 'Menuitem', menuitemcheckbox: 'Menuitem', menuitemradio: 'Menuitem',
  option: 'Option', combobox: 'Combobox', textbox: 'Textbox', searchbox: 'Textbox',
  slider: 'Slider', heading: 'Heading', treeitem: 'Treeitem',
};

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'number']);
const BUTTON_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'image']);

const MAX_NAME = 120;
const MAX_VALUE = 80;
const MAX_TEXT_LINE = 300;
const MAX_LINES = 400;
const MAX_ELEMENTS_VISITED = 20000;

const SENSITIVE_AUTOCOMPLETE = /(^|\s)(current-password|new-password|one-time-code|cc-number|cc-csc|cc-exp|cc-exp-month|cc-exp-year)(\s|$)/;
const SENSITIVE_NAME = /pass(word|wd)?|pwd|secret|token|otp|cvv|cvc|ssn/i;

function styleOf(el: Element): CSSStyleDeclaration {
  return (el.ownerDocument.defaultView as Window).getComputedStyle(el);
}

export function norm(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function inputType(el: Element): string {
  return (el.getAttribute('type') || '').toLowerCase();
}

/** Password-like fields: their value is never read and they cannot be filled. */
export function isSensitiveField(el: Element): boolean {
  if (el.localName === 'input' && inputType(el) === 'password') return true;
  if (el.localName !== 'input' && el.localName !== 'textarea') return false;
  if (SENSITIVE_AUTOCOMPLETE.test((el.getAttribute('autocomplete') || '').toLowerCase())) return true;
  return SENSITIVE_NAME.test(`${el.getAttribute('name') || ''} ${el.getAttribute('id') || ''}`);
}

function isCheckable(el: Element): boolean {
  return el.localName === 'input' && (inputType(el) === 'checkbox' || inputType(el) === 'radio');
}

function isEditingHost(el: Element): boolean {
  const v = el.getAttribute('contenteditable');
  return v !== null && v.toLowerCase() !== 'false';
}

function isClipping(overflow: string): boolean {
  return overflow === 'hidden' || overflow === 'clip' || overflow === 'scroll' || overflow === 'auto';
}

/** True when nothing inside the element can be seen. */
function hiddenSubtree(el: Element, cs: CSSStyleDeclaration): boolean {
  if (cs.display === 'none') return true;
  if (cs.opacity === '0') return true;
  if (isClipping(cs.overflowX) || isClipping(cs.overflowY)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return true;
  }
  return false;
}

/** True when the element itself occupies visible space. */
function boxVisible(el: Element, cs: CSSStyleDeclaration): boolean {
  if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
  if (el.getClientRects().length === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0;
}

/** Visible right now: rendered, not hidden by any ancestor. Used when resolving refs. */
export function isVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  if (!boxVisible(el, styleOf(el))) return false;
  for (let node: Element | null = el; node; node = parentOf(node)) {
    if (hiddenSubtree(node, styleOf(node))) return false;
    if (node.localName === 'details' && node !== el && !(node as HTMLDetailsElement).open) {
      const summary = firstSummary(node);
      if (!summary || !summary.contains(el)) return false;
    }
  }
  return true;
}

function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof (el.ownerDocument.defaultView as Window & typeof globalThis).ShadowRoot ? root.host : null;
}

function firstSummary(details: Element): Element | null {
  for (const child of Array.from(details.children)) {
    if (child.localName === 'summary') return child;
  }
  return null;
}

function labelControl(label: Element): Element | null {
  const control = (label as HTMLLabelElement).control;
  if (control) return control;
  const forId = label.getAttribute('for');
  if (forId) return label.ownerDocument.getElementById(forId);
  return label.querySelector('input, select, textarea');
}

/** A label standing in for a checkbox/radio the page has visually hidden (custom-styled controls). */
function hiddenCheckableOf(label: Element): HTMLInputElement | null {
  const control = labelControl(label);
  if (!control || !isCheckable(control) || !control.isConnected) return null;
  const cs = styleOf(control);
  if (cs.display !== 'none' && cs.opacity !== '0' && boxVisible(control, cs)) return null;
  return control as HTMLInputElement;
}

/** The snapshot role of an element, or null when it is not listed on its own. */
export function roleOf(el: Element): string | null {
  const tag = el.localName;
  const aria = (el.getAttribute('role') || '').trim().toLowerCase();
  switch (tag) {
    case 'a':
      if (el.hasAttribute('href')) return aria === 'button' ? 'Button' : aria === 'tab' ? 'Tab' : 'Link';
      break;
    case 'button':
      return ARIA_ROLES[aria] ?? 'Button';
    case 'summary':
      return 'Toggle';
    case 'select':
      return 'Combobox';
    case 'textarea':
      return 'Textbox';
    case 'input': {
      const type = inputType(el);
      if (type === 'hidden') return null;
      if (type === 'password') return 'Password';
      if (BUTTON_INPUT_TYPES.has(type)) return 'Button';
      if (type === 'checkbox') return aria === 'switch' ? 'Switch' : 'Checkbox';
      if (type === 'radio') return 'Radio';
      if (type === 'range') return 'Slider';
      if (type === 'file') return 'File';
      return TEXT_INPUT_TYPES.has(type) ? 'Textbox' : 'Input';
    }
    case 'label': {
      const hidden = hiddenCheckableOf(el);
      if (hidden) return inputType(hidden) === 'radio' ? 'Radio' : 'Checkbox';
      break;
    }
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      return 'Heading';
  }
  if (ARIA_ROLES[aria]) return ARIA_ROLES[aria];
  if (isEditingHost(el)) return 'Editable';
  return null;
}

/** Text of an element, leaving out form-control internals and script/style. */
function ownText(el: Element): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) {
      out += node.nodeValue;
    } else if (node.nodeType === 1) {
      const child = node as Element;
      const tag = child.localName;
      if (SKIP_TAGS.has(tag) || tag === 'select' || tag === 'textarea' || tag === 'input') continue;
      out += ' ' + ownText(child) + ' ';
    }
  }
  return out;
}

function renderedText(el: Element): string {
  // innerText honours CSS visibility; jsdom does not implement it, hence the fallback.
  const inner = (el as HTMLElement).innerText;
  return norm(typeof inner === 'string' && el.localName !== 'label' ? inner : ownText(el));
}

/** A short human label for an element. Not a full accessible-name computation. */
export function accessibleName(el: Element): string {
  const doc = el.ownerDocument;
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = norm(labelledBy.split(/\s+/).map((id) => {
      const ref = doc.getElementById(id);
      return ref ? ownText(ref) : '';
    }).join(' '));
    if (text) return clip(text, MAX_NAME);
  }
  const ariaLabel = norm(el.getAttribute('aria-label'));
  if (ariaLabel) return clip(ariaLabel, MAX_NAME);

  const tag = el.localName;
  if (tag === 'input' || tag === 'select' || tag === 'textarea') {
    const type = inputType(el);
    if (tag === 'input' && BUTTON_INPUT_TYPES.has(type)) {
      if (type === 'image') return clip(norm(el.getAttribute('alt')) || 'Submit', MAX_NAME);
      const value = norm((el as HTMLInputElement).value);
      return clip(value || (type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : ''), MAX_NAME);
    }
    const labels = Array.from((el as HTMLInputElement).labels ?? []);
    const labelText = norm(labels.map((l) => ownText(l)).join(' '));
    if (labelText) return clip(labelText, MAX_NAME);
    return clip(
      norm(el.getAttribute('placeholder')) || norm(el.getAttribute('title')) || norm(el.getAttribute('name')),
      MAX_NAME);
  }
  if (isEditingHost(el)) {
    return clip(norm(el.getAttribute('aria-placeholder')) || norm(el.getAttribute('data-placeholder'))
      || norm(el.getAttribute('title')), MAX_NAME);
  }
  const text = renderedText(el);
  if (text) return clip(text, MAX_NAME);
  // Icon-only controls: fall back to whatever labels the icon inside.
  const title = norm(el.getAttribute('title'));
  if (title) return clip(title, MAX_NAME);
  for (const [selector, attribute] of [['img[alt]', 'alt'], ['[aria-label]', 'aria-label'], ['[title]', 'title']]) {
    for (const inner of Array.from(el.querySelectorAll(selector))) {
      const label = norm(inner.getAttribute(attribute));
      if (label) return clip(label, MAX_NAME);
    }
  }
  return clip(norm(el.querySelector('svg title')?.textContent), MAX_NAME);
}

/** Identity of an element as the agent saw it: if this changes, its ref is stale. */
function signatureOf(el: Element, role: string | null): string {
  return `${role ?? 'Clickable'}|${accessibleName(el)}`;
}

/**
 * Element refs for one document. A ref always denotes the same element; numbers are never reused,
 * and continue from `base` so refs handed out for earlier documents in this session cannot collide.
 */
export class RefRegistry {
  private ids = new WeakMap<Element, number>();
  private entries = new Map<number, { el: Element; signature: string }>();
  private next = 1;

  startAfter(base: number): void {
    if (base >= this.next) this.next = base + 1;
  }

  get highest(): number {
    return this.next - 1;
  }

  assign(el: Element, signature: string): number {
    let id = this.ids.get(el);
    if (id === undefined) {
      id = this.next++;
      this.ids.set(el, id);
    }
    this.entries.set(id, { el, signature });
    return id;
  }

  /** Drops refs whose elements left the document. */
  prune(): void {
    for (const [id, entry] of this.entries) {
      if (!entry.el.isConnected) this.entries.delete(id);
    }
  }

  /** The live element for a ref, or a STALE_REF error telling the agent to snapshot again. */
  resolve(ref: number): Element {
    const entry = this.entries.get(ref);
    if (!entry) {
      throw new DomError('STALE_REF',
        `Ref [${ref}] is not known in this document (the page was reloaded or navigated, or no snapshot was taken). Call browser_snapshot and use the new refs.`);
    }
    if (!isVisible(entry.el)) {
      throw new DomError('STALE_REF',
        `Ref [${ref}] is no longer visible on the page. Call browser_snapshot and use the new refs.`);
    }
    if (signatureOf(entry.el, roleOf(entry.el)) !== entry.signature) {
      throw new DomError('STALE_REF',
        `The element behind ref [${ref}] changed since the snapshot. Call browser_snapshot and use the new refs.`);
    }
    return entry.el;
  }

  /** Like resolve, but for polling: null instead of throwing. */
  peek(ref: number): Element | null {
    return this.entries.get(ref)?.el ?? null;
  }
}

interface Visitor {
  /** Called for each rendered element. 'skip' prunes it, 'no-text' descends but drops its text. */
  element(el: Element, cs: CSSStyleDeclaration): 'descend' | 'skip' | 'no-text';
  text(text: string, node: Node): void;
  /** Layout boundary: a block starts/ends, or a table cell starts. */
  boundary(kind: 'block' | 'cell'): void;
  done(): boolean;
}

function childNodesOf(el: Element): Node[] {
  if (el.localName === 'details' && !(el as HTMLDetailsElement).open) {
    const summary = firstSummary(el);
    return summary ? [summary] : [];
  }
  if (el.shadowRoot) return Array.from(el.shadowRoot.childNodes);
  if (el.localName === 'slot') {
    const assigned = (el as HTMLSlotElement).assignedNodes?.({ flatten: true }) ?? [];
    if (assigned.length) return assigned;
  }
  return Array.from(el.childNodes);
}

/** Depth-first walk over what is actually rendered, in document order. */
function walkVisible(el: Element, cs: CSSStyleDeclaration, v: Visitor, dropText: boolean): void {
  const textOk = !dropText && cs.visibility !== 'hidden' && cs.visibility !== 'collapse';
  for (const node of childNodesOf(el)) {
    if (v.done()) return;
    if (node.nodeType === 3) {
      if (textOk && node.nodeValue) v.text(node.nodeValue, node);
      continue;
    }
    if (node.nodeType !== 1) continue;
    const child = node as Element;
    const tag = child.localName;
    if (tag === 'br') {
      if (textOk) v.text(' ', child);
      continue;
    }
    if (SKIP_TAGS.has(tag)) continue;
    const childStyle = styleOf(child);
    if (hiddenSubtree(child, childStyle)) continue;
    const display = childStyle.display;
    const cell = display === 'table-cell';
    const block = !cell && display !== '' && display !== 'contents' && !display.startsWith('inline');
    if (cell) v.boundary('cell');
    if (block) v.boundary('block');
    const action = v.element(child, childStyle);
    if (action !== 'skip') walkVisible(child, childStyle, v, dropText || action === 'no-text');
    if (block) v.boundary('block');
  }
}

export function isScrollable(el: Element): boolean {
  const cs = styleOf(el);
  const scrollsY = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4;
  const scrollsX = (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 4;
  return scrollsY || scrollsX;
}

/** The biggest scrollable region, for app layouts where the document itself does not scroll. */
export function mainScroller(doc: Document): Element | null {
  let best: Element | null = null;
  let bestArea = 0;
  for (const el of Array.from(doc.querySelectorAll('body *')).slice(0, 5000)) {
    if (el.clientHeight < 100 || !isScrollable(el)) continue;
    const area = el.clientWidth * el.clientHeight;
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best;
}

/**
 * Header line with the scroll position of the page, or of its main inner scrolling area when the
 * document itself does not scroll. Says so when more lies below, because content that a site
 * loads on scroll is not in the page yet.
 */
export function scrollLine(doc: Document, viewportOnly = false): string {
  const view = doc.defaultView as Window;
  const root = doc.scrollingElement ?? doc.documentElement;
  const inner = root.scrollHeight <= view.innerHeight + 4 ? mainScroller(doc) : null;
  const scroller = inner ?? root;
  const viewport = inner ? inner.clientHeight : view.innerHeight;
  const max = Math.max(0, Math.round(scroller.scrollHeight - viewport));
  const top = Math.round(scroller.scrollTop);
  let line = `Scroll: ${top} of ${max}px`;
  if (inner) line += ' in an inner scrolling area';
  if (viewportOnly) line += ' (viewport only)';
  if (max - top > 1) line += '. More below: anything the site loads on scroll appears only after browser_scroll.';
  return line;
}

/**
 * One closing line naming what a snapshot or extract could not include, so the agent knows there
 * is more to reach and how. Empty when nothing is being left out.
 */
export function notShown(doc: Document): string {
  const visibleCount = (selector: string): number =>
    Array.from(doc.querySelectorAll(selector)).slice(0, 300).filter((el) => isVisible(el)).length;
  const collapsed = visibleCount('[aria-expanded="false"], details:not([open]) > summary');
  const frames = visibleCount('iframe');
  const parts: string[] = [];
  if (collapsed) {
    parts.push(`${collapsed} collapsed control${collapsed === 1 ? '' : 's'} (menus or sections: click one to expand it, then read again)`);
  }
  if (frames) parts.push(`${frames} embedded frame${frames === 1 ? '' : 's'} (cannot be read)`);
  return parts.length ? `Not shown: ${parts.join('; ')}.` : '';
}

function inViewport(rect: DOMRect, view: Window): boolean {
  return rect.bottom > 0 && rect.right > 0 && rect.top < view.innerHeight && rect.left < view.innerWidth;
}

function textInViewport(node: Node, view: Window): boolean {
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
  const range = node.ownerDocument?.createRange();
  if (node.nodeType === 3 && range && typeof range.getBoundingClientRect === 'function') {
    range.selectNodeContents(node);
    return inViewport(range.getBoundingClientRect(), view);
  }
  return el ? inViewport(el.getBoundingClientRect(), view) : true;
}

function headingLevel(el: Element): number {
  const m = /^h([1-6])$/.exec(el.localName);
  return m ? Number(m[1]) : Number(el.getAttribute('aria-level')) || 2;
}

function checkedState(el: Element): boolean | null {
  const hidden = el.localName === 'label' ? hiddenCheckableOf(el) : null;
  if (hidden) return hidden.checked;
  if (isCheckable(el)) return (el as HTMLInputElement).checked;
  const aria = el.getAttribute('aria-checked');
  return aria === null ? null : aria === 'true';
}

export function isDisabled(el: Element): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true'
    || !!el.closest('fieldset[disabled]');
}

/** One snapshot line for a listed element, e.g. `[12] Button: Save (disabled)`. */
function describe(el: Element, role: string, name: string, ref: number): string {
  let line = `[${ref}] ${role}`;
  const tag = el.localName;
  const type = inputType(el);
  if (role === 'Heading') line += ` (h${headingLevel(el)})`;
  if (tag === 'textarea') line += ' (multiline)';
  if (tag === 'input' && (role === 'Input' || (role === 'Textbox' && type && type !== 'text'))) line += ` (${type})`;
  line += `: ${name || '(unnamed)'}`;

  if (role === 'Link' && tag === 'a') {
    const a = el as HTMLAnchorElement;
    if ((a.protocol === 'http:' || a.protocol === 'https:') && a.origin !== el.ownerDocument.location.origin) {
      line += ` (external: ${a.host})`;
    } else if (a.protocol === 'http:' || a.protocol === 'https:') {
      line += ` -> ${clip(a.pathname + a.search + a.hash, 80)}`;
    }
  }
  if (isSensitiveField(el)) {
    line += ' (value hidden)';
  } else if (tag === 'select') {
    const select = el as HTMLSelectElement;
    const selected = norm(select.selectedOptions?.[0]?.textContent ?? '');
    line += ` = "${clip(selected, MAX_VALUE)}"`;
    const options = Array.from(select.options).slice(0, 12).map((o) => clip(norm(o.textContent), 40));
    line += ` (options: ${options.join(' | ')}${select.options.length > 12 ? ' | …' : ''})`;
  } else if ((tag === 'input' && !BUTTON_INPUT_TYPES.has(type) && !isCheckable(el) && type !== 'file') || tag === 'textarea') {
    const value = (el as HTMLInputElement).value ?? '';
    if (value) line += ` = "${clip(norm(value), MAX_VALUE)}"`;
  } else if (role === 'Editable' || (role === 'Textbox' && isEditingHost(el))) {
    const value = norm(ownText(el));
    if (value) line += ` = "${clip(value, MAX_VALUE)}"`;
  }

  const flags: string[] = [];
  const checked = checkedState(el);
  if (checked !== null) flags.push(checked ? 'checked' : 'unchecked');
  const expanded = tag === 'summary'
    ? String((el.parentElement as HTMLDetailsElement | null)?.open === true)
    : el.getAttribute('aria-expanded');
  if (expanded !== null) flags.push(expanded === 'true' ? 'expanded' : 'collapsed');
  if (el.getAttribute('aria-selected') === 'true') flags.push('selected');
  if (tag === 'button' && (type === 'submit' || (!type && (el as HTMLButtonElement).form))) flags.push('submits form');
  if (tag === 'input' && (type === 'submit' || type === 'image')) flags.push('submits form');
  if ((el as HTMLInputElement).readOnly === true) flags.push('read-only');
  if (isDisabled(el)) flags.push('disabled');
  return flags.length ? `${line} (${flags.join(', ')})` : line;
}

export interface SnapshotOptions {
  interactiveOnly?: boolean;
  viewportOnly?: boolean;
}

export interface Snapshot {
  text: string;
  title: string;
  url: string;
  elements: number;
  truncated: boolean;
}

/** Builds the snapshot text and (re)registers a ref for every listed element. */
export function takeSnapshot(doc: Document, registry: RefRegistry, options: SnapshotOptions = {}): Snapshot {
  const view = doc.defaultView as Window;
  const lines: string[] = [];
  let buffer = '';
  let elements = 0;
  let visited = 0;
  let truncated = false;

  const flush = (): void => {
    const text = norm(buffer.replace(/(\s*\|\s*)+$/, '').replace(/^(\s*\|\s*)+/, ''));
    buffer = '';
    if (text && !options.interactiveOnly) lines.push(`Text: ${clip(text, MAX_TEXT_LINE)}`);
  };

  registry.prune();
  const visitor: Visitor = {
    done: () => truncated,
    boundary(kind) {
      if (kind === 'cell') {
        if (norm(buffer)) buffer += ' | ';
      } else {
        flush();
      }
    },
    text(text, node) {
      if (options.viewportOnly && norm(text) && !textInViewport(node, view)) return;
      buffer += text;
    },
    element(el, cs) {
      if (++visited > MAX_ELEMENTS_VISITED || lines.length >= MAX_LINES) {
        truncated = true;
        return 'skip';
      }
      let role = roleOf(el);
      const tag = el.localName;
      if (!role && cs.cursor === 'pointer' && el.parentElement && styleOf(el.parentElement).cursor !== 'pointer'
          && tag !== 'label' && tag !== 'body' && tag !== 'html') {
        role = 'Clickable';
      }
      if (!role) {
        if (tag === 'img') {
          const alt = norm(el.getAttribute('alt'));
          if (alt) buffer += ` [image: ${clip(alt, 80)}] `;
          return 'skip';
        }
        // A label's text is already the name of its control; do not repeat it.
        if (tag === 'label' && labelControl(el)) return 'no-text';
        return 'descend';
      }
      const container = role === 'Heading' || role === 'Clickable';
      const shown = boxVisible(el, cs) && (!options.viewportOnly || inViewport(el.getBoundingClientRect(), view));
      if (!shown) return container ? 'descend' : 'skip';

      flush();
      const name = accessibleName(el);
      if (role === 'Clickable' && !name) return 'descend';
      const ref = registry.assign(el, signatureOf(el, role === 'Clickable' ? null : role));
      lines.push(describe(el, role, name, ref));
      elements++;
      // Headings and clickable containers may wrap links or buttons: list those, not the text again.
      return container ? 'no-text' : 'skip';
    },
  };

  const body = doc.body;
  if (body) {
    walkVisible(body, styleOf(body), visitor, false);
    flush();
  }

  const scrollMax = Math.max(0, doc.documentElement.scrollHeight - view.innerHeight);
  const header = [
    `Page: ${clip(norm(doc.title), 200) || '(untitled)'}`,
    `URL: ${doc.location.href}`,
    scrollLine(doc, options.viewportOnly === true),
    '',
  ];
  if (!lines.length) lines.push('(no visible content found)');
  if (truncated) {
    lines.push(`… snapshot truncated at ${MAX_LINES} lines. Use viewport_only=true with browser_scroll, or interactive_only=true, to see the rest.`);
  }
  if (options.viewportOnly) {
    const above = Math.round(view.scrollY);
    const below = Math.max(0, Math.round(scrollMax - view.scrollY));
    if (above > 0 || below > 0) {
      lines.push(`Outside this viewport: ${above}px above, ${below}px below (browser_scroll to reach it).`);
    }
  }
  const leftOut = notShown(doc);
  if (leftOut) lines.push(leftOut);
  return {
    text: header.concat(lines).join('\n'),
    title: doc.title,
    url: doc.location.href,
    elements,
    truncated,
  };
}

/** Visible text of the page (or a subtree) with headings marked, one block per line. */
export function visibleText(root: Element): string {
  const blocks: string[] = [];
  let buffer = '';
  let visited = 0;
  const flush = (): void => {
    const text = norm(buffer.replace(/(\s*\|\s*)+$/, ''));
    buffer = '';
    if (text) blocks.push(text);
  };
  const visitor: Visitor = {
    done: () => visited > MAX_ELEMENTS_VISITED * 2,
    boundary(kind) {
      if (kind === 'cell') {
        if (norm(buffer)) buffer += ' | ';
      } else {
        flush();
      }
    },
    text(text) {
      buffer += text;
    },
    element(el, cs) {
      visited++;
      const tag = el.localName;
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return 'skip';
      if (tag === 'img') {
        const alt = norm(el.getAttribute('alt'));
        if (alt) buffer += ` [image: ${clip(alt, 80)}] `;
        return 'skip';
      }
      if (roleOf(el) === 'Heading' && boxVisible(el, cs)) {
        flush();
        buffer += '#'.repeat(headingLevel(el)) + ' ';
      }
      return 'descend';
    },
  };
  walkVisible(root, styleOf(root), visitor, false);
  flush();
  return blocks.join('\n');
}

export interface Extract {
  text: string;
  totalChars: number;
  offset: number;
  truncated: boolean;
}

/** A window of the page's visible text, for reading long pages in pieces. */
export function extractPage(doc: Document, maxChars: number, offset: number): Extract {
  const full = doc.body ? visibleText(doc.body) : '';
  const start = Math.min(Math.max(0, offset), full.length);
  const end = Math.min(full.length, start + maxChars);
  const truncated = end < full.length;
  const header = [
    `Page: ${clip(norm(doc.title), 200) || '(untitled)'}`,
    `URL: ${doc.location.href}`,
    `Text: characters ${start}-${end} of ${full.length}${truncated ? ` (continue with offset=${end})` : ''}`,
    scrollLine(doc),
    '',
  ];
  return {
    text: header.join('\n') + '\n' + full.slice(start, end) + (notShown(doc) ? `\n\n${notShown(doc)}` : ''),
    totalChars: full.length,
    offset: start,
    truncated,
  };
}

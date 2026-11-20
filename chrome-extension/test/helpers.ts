import { JSDOM } from 'jsdom';

/**
 * jsdom has no layout engine. Give every element that is not under display:none a 100x20 box at
 * the top left; `data-zero` marks an element as zero-sized. Applies to one window (frames have
 * their own).
 */
export function layout(win: Window): void {
  const w = win as Window & typeof globalThis;
  const rendered = (el: Element): boolean => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      if (w.getComputedStyle(node).display === 'none') return false;
    }
    return true;
  };
  const box = (el: Element): DOMRect => {
    const size = rendered(el) && !el.hasAttribute('data-zero') ? { width: 100, height: 20 } : { width: 0, height: 0 };
    return { x: 0, y: 0, top: 0, left: 0, right: size.width, bottom: size.height, ...size, toJSON: () => ({}) };
  };
  w.Element.prototype.getBoundingClientRect = function (this: Element) { return box(this); };
  w.Element.prototype.getClientRects = function (this: Element) {
    return (rendered(this) ? [box(this)] : []) as unknown as DOMRectList;
  };
}

/** A jsdom document for DOM tests. */
export function page(body: string, url = 'https://app.example/start'): { doc: Document; win: Window } {
  const dom = new JSDOM(`<!doctype html><html><head><title>Test Page</title></head><body>${body}</body></html>`,
    { url, pretendToBeVisual: true });
  const win = dom.window as unknown as Window;
  layout(win);
  return { doc: dom.window.document, win };
}

/** The ref of the first snapshot line containing `fragment`. */
export function refOf(snapshot: string, fragment: string): number {
  const line = snapshot.split('\n').find((l) => l.includes(fragment));
  const match = line ? /^\s*\[(\d+)\]/.exec(line) : null;
  if (!match) throw new Error(`no ref line containing "${fragment}" in:\n${snapshot}`);
  return Number(match[1]);
}

/** The content of a snapshot or extract: everything after the header's blank line. */
export function content(text: string): string {
  return text.slice(text.indexOf('\n\n') + 2);
}

/** The ref an extract put after a link or control, e.g. `Profile{12}`. */
export function tokenRef(text: string, label: string): number {
  const match = new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]?(?:\\([^)]*\\))?\\{(\\d+)\\}`).exec(text);
  if (!match) throw new Error(`no {ref} after "${label}" in:\n${text}`);
  return Number(match[1]);
}

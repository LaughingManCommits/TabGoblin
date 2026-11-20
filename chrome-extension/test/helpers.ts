import { JSDOM } from 'jsdom';

/**
 * A jsdom document for DOM tests. jsdom has no layout engine, so every element that is not under
 * display:none gets a 100x20 box at the top left; `data-zero` marks an element as zero-sized.
 */
export function page(body: string, url = 'https://app.example/start'): { doc: Document; win: Window } {
  const dom = new JSDOM(`<!doctype html><html><head><title>Test Page</title></head><body>${body}</body></html>`,
    { url, pretendToBeVisual: true });
  const win = dom.window as unknown as Window;
  const rendered = (el: Element): boolean => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      if (win.getComputedStyle(node).display === 'none') return false;
    }
    return true;
  };
  const box = (el: Element): DOMRect => {
    const size = rendered(el) && !el.hasAttribute('data-zero') ? { width: 100, height: 20 } : { width: 0, height: 0 };
    return { x: 0, y: 0, top: 0, left: 0, right: size.width, bottom: size.height, ...size, toJSON: () => ({}) };
  };
  const proto = dom.window.Element.prototype;
  proto.getBoundingClientRect = function (this: Element) { return box(this); };
  proto.getClientRects = function (this: Element) {
    return (rendered(this) ? [box(this)] : []) as unknown as DOMRectList;
  };
  return { doc: dom.window.document, win };
}

/** The ref of the first snapshot line containing `fragment`. */
export function refOf(snapshot: string, fragment: string): number {
  const line = snapshot.split('\n').find((l) => l.includes(fragment));
  const match = line ? /^\[(\d+)\]/.exec(line) : null;
  if (!match) throw new Error(`no ref line containing "${fragment}" in:\n${snapshot}`);
  return Number(match[1]);
}

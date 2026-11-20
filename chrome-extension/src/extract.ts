// Visible page content as structured text: headings, paragraphs, lists, tables, quotes and nested
// articles keep their shape, without transmitting HTML. Generic: it knows document structure,
// not what any site's content means. Pure DOM code (no chrome.*).

import {
  UNTRUSTED_NOTE, accessibleName, assess, boxVisible, clip, containerOf, headingLevel, holdsLongText, isScrollable,
  isWithin, labelControl, norm, preLines, roleOf, scrollLine, sectionScope, styleOf, walkFrom, walkVisible,
  type Completeness, type PageState, type RefRegistry, type Visitor,
} from './snapshot.ts';

/** The box an editor scrolls in, if its content is taller than what it shows. */
export function scrollerOf(el: Element): Element | null {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
    if (node.localName === 'body' || node.localName === 'html') return null;
    if (isScrollable(node)) return node;
  }
  return null;
}

export type LinkStyle = 'none' | 'ref' | 'url';

interface HeadingMark {
  level: number;
  text: string;
  ref: number | null;
  /** Index of the heading's line in the rendered lines. */
  line: number;
  el: Element;
}

interface Rendered {
  lines: string[];
  headings: HeadingMark[];
}

interface RenderOptions {
  links: LinkStyle;
  /** Assigns refs to links and controls so the agent can act on what it reads. Omit for plain text. */
  registry?: RefRegistry;
  /** Collapse repeated identical blocks. Off when the text is used for matching and counting. */
  collapse?: boolean;
}

const MAX_BLOCK = 2000;
const MAX_ELEMENTS = 60000;
/** Between short pieces of one list entry that the page shows as separate boxes. */
const JOIN = ' · ';
const TRAILING_JOINS = /(\s*·\s*)+$/;
const MAX_JOINED_PIECE = 60;
const MAX_JOINED_LINE = 240;

/** Renders an element's visible content to lines. */
function render(root: Element, options: RenderOptions, includeRoot: boolean): Rendered {
  const lines: string[] = [];
  const headings: HeadingMark[] = [];
  const registry = options.registry;
  const withRefs = !!registry && options.links !== 'none';
  let buffer = '';
  /** null: nothing buffered; true: only preformatted text so far; false: ordinary text too. */
  let bufferPre: boolean | null = null;
  let row: string[] | null = null;
  let rowIsHeader = true;
  let marker = '';
  let visited = 0;
  /** Open structural elements, innermost last. */
  const open: { el: Element; kind: 'list' | 'item' | 'quote' | 'article' | 'status'; ordered?: boolean; index?: number }[] = [];

  const depthOf = (): number => {
    const items = open.filter((o) => o.kind === 'item').length;
    const articles = open.filter((o) => o.kind === 'article').length;
    return Math.max(0, items - 1) + Math.max(0, articles - 1);
  };
  const prefix = (): string => '  '.repeat(Math.min(depthOf(), 8)) + '> '.repeat(open.filter((o) => o.kind === 'quote').length);

  /** A run of lines holding consecutive numbers (a line-number column): where it starts, and its range. */
  let run: { at: number; first: number; last: number } | null = null;

  /**
   * Line numbers, one per line, are kept as their range instead of a line each. Returns whether
   * `text` was such a number and has been dealt with.
   */
  const emitNumber = (text: string, line: string): boolean => {
    if (!options.collapse || !/^\s*\d{1,7}$/.test(text)) {
      run = null;
      return false;
    }
    const n = Number(text);
    const last = lines.length - 1;
    const held = run ? Math.min(run.last - run.first + 1, 4) : 0;
    if (run && n === run.last + 1 && last === run.at + (held < 4 ? held - 1 : 0)) {
      run.last = n;
      if (held < 3) {
        lines.push(line);
      } else {
        // From the fourth number on, the run is one line.
        lines.splice(run.at, lines.length - run.at, `${prefix()}${run.first}–${n} (consecutive numbers, one per line)`);
      }
      return true;
    }
    run = { at: lines.length, first: n, last: n };
    lines.push(line);
    return true;
  };

  const emit = (text: string): void => {
    const line = prefix() + marker + text;
    marker = '';
    const last = lines.length - 1;
    if (emitNumber(text, line)) return;
    // Repeated identical blocks (banners, separators) are collapsed instead of sent again.
    const repeat = options.collapse && last >= 0 ?/^(.*?)(?: \(×(\d+)\))?$/.exec(lines[last]) : null;
    if (repeat && repeat[1] === line) {
      lines[last] = `${line} (×${Number(repeat[2] ?? 1) + 1})`;
      return;
    }
    lines.push(line);
  };

  /** Code and other preformatted text: line by line as shown, never merged or collapsed. */
  const emitPre = (text: string): void => {
    const indent = prefix();
    for (const line of preLines(text)) {
      const full = line ? indent + marker + clip(line, MAX_BLOCK) : '';
      marker = '';
      // The line-number column of a code view is preformatted too.
      if (!emitNumber(line, full)) lines.push(full);
    }
  };

  const flush = (): void => {
    const raw = buffer.replace(TRAILING_JOINS, '');
    const pre = bufferPre === true;
    buffer = '';
    bufferPre = null;
    const text = norm(raw);
    if (!text) return;
    if (row) {
      row.push(text);
      return;
    }
    if (pre && !open.some((o) => o.kind === 'status')) {
      emitPre(raw);
      return;
    }
    const status = open.some((o) => o.kind === 'status') ? '(status) ' : '';
    emit(status + clip(text, MAX_BLOCK));
  };

  /**
   * Inside a list item, short pieces that the page lays out as separate boxes (an author, a date,
   * a badge) are one entry to a reader: they go on one line instead of a line each.
   */
  const joinInItem = (): boolean => {
    if (!options.collapse || bufferPre === true || open[open.length - 1]?.kind !== 'item') return false;
    const text = norm(buffer);
    if (!text) return true;
    const piece = text.slice(text.lastIndexOf(JOIN.trim()) + 1);
    if (norm(piece).length > MAX_JOINED_PIECE || text.length > MAX_JOINED_LINE) return false;
    if (!TRAILING_JOINS.test(buffer)) buffer += JOIN;
    return true;
  };

  const endRow = (): void => {
    flush();
    if (!row) return;
    if (row.length) {
      emit(`| ${row.join(' | ')} |`);
      if (rowIsHeader) emit(`|${' --- |'.repeat(row.length)}`);
    }
    row = null;
  };

  const token = (el: Element, role: string): string => {
    const name = accessibleName(el);
    if (!name) return '';
    const ref = withRefs && registry ? `{${registry.assign(el)}}` : '';
    if (role === 'Link') {
      if (options.links !== 'url' || el.localName !== 'a') return `${name}${ref}`;
      const a = el as HTMLAnchorElement;
      const dest = a.origin === el.ownerDocument.location.origin ? a.pathname + a.search + a.hash : a.href;
      return `[${name}](${clip(dest, 200)})${ref}`;
    }
    // Without refs this is plain reading: a button is just its label.
    return registry ? `[${role}: ${name}]${ref}` : name;
  };

  const visitor: Visitor = {
    done: () => visited > MAX_ELEMENTS,
    boundary(kind) {
      if (kind === 'cell') {
        if (row) flush();
      } else if (!row && !joinInItem()) {
        flush();
      }
    },
    text(text, _node, pre) {
      if (norm(text)) bufferPre = bufferPre === null ? pre : bufferPre && pre;
      buffer += text;
    },
    leave(el) {
      const top = open[open.length - 1];
      if (top?.el === el) {
        flush();
        open.pop();
      }
      if (el.localName === 'tr' || el.getAttribute('role') === 'row') endRow();
    },
    element(el, cs) {
      visited++;
      const tag = el.localName;
      const aria = (el.getAttribute('role') || '').toLowerCase();
      const role = roleOf(el);

      if (role === 'Heading') {
        if (!boxVisible(el, cs)) return 'descend';
        endRow();
        flush();
        const level = headingLevel(el);
        const text = accessibleName(el);
        if (!text) return 'skip';
        headings.push({ level, text, ref: registry ? registry.assign(el) : null, line: lines.length, el });
        emit(`${'#'.repeat(level)} ${text}`);
        return 'skip';
      }
      if (role) {
        // Inputs hold values, not content: they belong to the snapshot. Plain reading skips them.
        const field = tag === 'input' || tag === 'select' || tag === 'textarea' || role === 'Editable'
          || (role === 'Textbox' && tag !== 'a');
        if (field && !registry) return 'skip';
        // Links sit inside sentences: no padding. Other controls are separate things: keep them apart.
        if (boxVisible(el, cs)) {
          buffer += role === 'Link' ? token(el, role) : ` ${token(el, role)} `;
          bufferPre = false;
          // A document or code file in an editable region is content: it is read, under its label.
          if (holdsLongText(el)) {
            flush();
            const scroller = scrollerOf(el);
            if (scroller) emit('(this editor scrolls and may draw only the lines in view: scroll it by its ref to read the others)');
            return 'descend';
          }
          // A tree item that is open holds the items under it.
          if (role === 'Treeitem' && el.querySelector('[role="treeitem"]')) {
            flush();
            return 'no-text';
          }
        }
        return 'skip';
      }
      if (tag === 'img') {
        const alt = norm(el.getAttribute('alt'));
        if (alt) {
          buffer += ` [image: ${clip(alt, 80)}] `;
          bufferPre = false;
        }
        return 'skip';
      }
      if (tag === 'label' && labelControl(el)) return registry ? 'no-text' : 'descend';
      if (tag === 'iframe' || tag === 'frame') {
        if (containerOf(el)) return 'descend';
        flush();
        if (boxVisible(el, cs)) emit('[embedded frame from another origin: not readable]');
        return 'skip';
      }

      if (tag === 'tr' || aria === 'row') {
        endRow();
        row = [];
        rowIsHeader = Array.from(el.children).every((c) => c.localName === 'th' || c.getAttribute('role') === 'columnheader');
        return 'descend';
      }
      if (tag === 'ul' || tag === 'ol' || aria === 'list') {
        flush();
        open.push({ el, kind: 'list', ordered: tag === 'ol', index: 0 });
        return 'descend';
      }
      if (tag === 'li' || aria === 'listitem') {
        flush();
        const list = [...open].reverse().find((o) => o.kind === 'list');
        open.push({ el, kind: 'item' });
        if (list?.ordered) {
          list.index = (list.index ?? 0) + 1;
          marker = `${list.index}. `;
        } else {
          marker = '- ';
        }
        return 'descend';
      }
      if (tag === 'blockquote') {
        flush();
        open.push({ el, kind: 'quote' });
        return 'descend';
      }
      if (tag === 'article' || aria === 'article' || aria === 'comment') {
        flush();
        open.push({ el, kind: 'article' });
        return 'descend';
      }
      if (aria === 'status' || aria === 'alert' || tag === 'output') {
        flush();
        open.push({ el, kind: 'status' });
        return 'descend';
      }
      return 'descend';
    },
  };

  if (includeRoot) walkFrom(root, visitor);
  else walkVisible(root, styleOf(root), visitor, false);
  endRow();
  flush();
  return { lines, headings };
}

/** Visible text of an element, structure kept, nothing interactive marked. Used for matching text. */
export function visibleText(root: Element): string {
  return render(root, { links: 'none' }, false).lines.join('\n');
}

/** The lines of one heading's section: from the heading to the next heading of the same or a higher level. */
function sectionLines(rendered: Rendered, heading: HeadingMark): string[] {
  // A section also ends where the part of the page its heading belongs to ends: the headings of
  // a sidebar are not subsections of the article next to it.
  const scope = sectionScope(heading.el);
  const next = rendered.headings.find((h) => h.line > heading.line
    && (h.level <= heading.level || (scope !== null && !isWithin(scope, h.el))));
  return rendered.lines.slice(heading.line, next ? next.line : rendered.lines.length);
}

export interface ExtractOptions {
  maxChars: number;
  offset: number;
  links: LinkStyle;
  /** Return the section outline instead of content. */
  outline?: boolean;
  /** Read only this element: a heading's section, or a container's subtree. */
  root?: Element;
  /** Leave out navigation, banners and footers when the page marks its main content. */
  mainOnly?: boolean;
}

export interface Extract {
  text: string;
  totalChars: number;
  offset: number;
  truncated: boolean;
  completeness: Completeness;
}

function pageRoot(doc: Document, mainOnly: boolean): { root: Element | null; main: boolean } {
  if (mainOnly) {
    const main = Array.from(doc.querySelectorAll('main, [role="main"]')).find((el) => boxVisible(el, styleOf(el)));
    if (main) return { root: main, main: true };
  }
  return { root: doc.body, main: false };
}

/** A bounded window of the page's content, the outline of its sections, or one section. */
export function extractPage(doc: Document, state: PageState, options: ExtractOptions): Extract {
  const registry = state.registry;
  registry.prune();
  const { root, main } = pageRoot(doc, options.mainOnly === true);
  const rendered: Rendered = root ? render(root, { links: options.links, registry, collapse: true }, false) : { lines: [], headings: [] };
  const head = [
    `Page: ${clip(norm(doc.title), 200) || '(untitled)'}`,
    `URL: ${doc.location.href}`,
  ];

  if (options.outline) {
    const all = rendered.lines.join('\n');
    const rows = rendered.headings.map((h) => {
      const size = sectionLines(rendered, h).join('\n').length;
      return `${'  '.repeat(Math.max(0, h.level - 1))}[${h.ref}] ${'#'.repeat(h.level)} ${h.text} (${size} characters)`;
    });
    const completeness = assess(doc, state, { truncated: false, scoped: 'outline only: read a section with ref' });
    return {
      text: [
        ...head,
        `Outline: ${rendered.headings.length} section${rendered.headings.length === 1 ? '' : 's'}, ${all.length} characters in total${main ? ' (main content only)' : ''}`,
        scrollLine(doc),
        completeness.line,
        UNTRUSTED_NOTE,
        '',
        ...(rows.length ? rows : ['(the page has no headings; read it with offset instead)']),
      ].join('\n'),
      totalChars: all.length,
      offset: 0,
      truncated: false,
      completeness: completeness.status,
    };
  }

  let lines = rendered.lines;
  let scope: string | undefined;
  let scopeLine = '';
  if (options.root) {
    const heading = rendered.headings.find((h) => h.el === options.root);
    if (heading) {
      lines = sectionLines(rendered, heading);
      scope = 'one section only';
      scopeLine = `Section: ${'#'.repeat(heading.level)} ${heading.text}`;
    } else {
      lines = render(options.root, { links: options.links, registry, collapse: true }, true).lines;
      const container = containerOf(options.root);
      scope = 'one section only';
      scopeLine = `Section: ${container ? `${container.role}${container.name ? ` ${container.name}` : ''}` : roleOf(options.root) ?? 'element'}`;
    }
  } else if (main) {
    scope = 'main content only';
  }

  const full = lines.join('\n');
  const start = Math.min(Math.max(0, options.offset), full.length);
  const end = Math.min(full.length, start + options.maxChars);
  const truncated = end < full.length;
  if (scopeLine) head.push(scopeLine);
  head.push(`Text: characters ${start}-${end} of ${full.length}${truncated ? ` (continue with offset=${end})` : ''}`);
  if (start > 0 && !options.root) {
    // Where in the document this window starts, as a trail of the headings above it.
    const upTo = full.slice(0, start).split('\n').length - 1;
    const trail: HeadingMark[] = [];
    for (const h of rendered.headings) {
      if (h.line > upTo) break;
      while (trail.length && trail[trail.length - 1].level >= h.level) trail.pop();
      trail.push(h);
    }
    if (trail.length) head.push(`Starts under: ${trail.map((h) => h.text).join(' > ')}`);
  }
  const completeness = assess(doc, state, { truncated, scoped: scope });
  head.push(scrollLine(doc), completeness.line, UNTRUSTED_NOTE, '');
  return {
    text: head.join('\n') + '\n' + full.slice(start, end),
    totalChars: full.length,
    offset: start,
    truncated,
    completeness: completeness.status,
  };
}

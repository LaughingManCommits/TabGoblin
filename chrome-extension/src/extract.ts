// Visible page content as structured text: headings, paragraphs, lists, tables, quotes and nested
// articles keep their shape, without transmitting HTML. Generic: it knows document structure,
// not what any site's content means. Pure DOM code (no chrome.*).

import { PatternError, compilePattern, literalTest, searchLines } from './search.ts';
import {
  DomError, UNTRUSTED_NOTE, accessibleName, assess, boxVisible, clip, containerOf, headingLevel, holdsLongText,
  isScrollable, isWithin, keepsWhitespace, labelControl, norm, preLines, roleOf, scrollLine, sectionScope, styleOf,
  walkFrom, walkVisible,
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

/** The kinds of region that can be read on their own. */
export type RegionKind = 'tables' | 'code' | 'articles';
export const REGION_KINDS: readonly RegionKind[] = ['tables', 'code', 'articles'];

/** A table, a block of preformatted text or an article: the rendered lines it produced. */
interface Region {
  kind: RegionKind;
  /** Index of its first line, and of the line after its last. */
  start: number;
  end: number;
}

interface Rendered {
  lines: string[];
  headings: HeadingMark[];
  regions: Region[];
}

/** Which kinds of region an element starts. Nothing here knows a site: only elements, roles and styles. */
function regionKinds(el: Element, cs: CSSStyleDeclaration): RegionKind[] {
  const tag = el.localName;
  const aria = (el.getAttribute('role') || '').trim().toLowerCase();
  const kinds: RegionKind[] = [];
  if (aria === 'table' || aria === 'grid' || aria === 'treegrid' || (tag === 'table' && aria !== 'presentation' && aria !== 'none')) {
    kinds.push('tables');
  }
  // Text shown with its line breaks, in a box of its own: code inside a sentence is not a block.
  const display = cs.display;
  const block = display !== '' && display !== 'contents' && !display.startsWith('inline');
  if (tag === 'pre' || (block && keepsWhitespace(el, cs, false))) kinds.push('code');
  if (tag === 'article' || aria === 'article' || aria === 'comment'
      || (el.parentElement?.getAttribute('role') || '').trim().toLowerCase() === 'feed') {
    kinds.push('articles');
  }
  return kinds;
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
  const regions: Region[] = [];
  /** The outermost region of each kind that is being walked: one inside it is part of it. */
  const inRegion = new Map<RegionKind, { el: Element; start: number }>();
  /** Regions whose element has been left, until the text still held back for a line is written. */
  let closing: { kind: RegionKind; start: number }[] = [];
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

  /** Ends the regions that were left, once nothing of them is still waiting to become a line. */
  const settle = (): void => {
    if (!closing.length || row || norm(buffer)) return;
    for (const region of closing) {
      const start = Math.min(region.start, lines.length);
      if (lines.length > start) regions.push({ kind: region.kind, start, end: lines.length });
    }
    closing = [];
  };

  const write = (): void => {
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

  const flush = (): void => {
    write();
    settle();
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
    settle();
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
      for (const [kind, region] of inRegion) {
        if (region.el !== el) continue;
        inRegion.delete(kind);
        closing.push({ kind, start: region.start });
      }
      settle();
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
  const visit = visitor.element;
  visitor.element = (el, cs) => {
    const action = visit(el, cs);
    // What is walked is a region from its first line on; what is skipped has no lines of its own.
    if (action !== 'skip') {
      for (const kind of regionKinds(el, cs)) {
        if (!inRegion.has(kind)) inRegion.set(kind, { el, start: lines.length });
      }
    }
    return action;
  };

  if (includeRoot) walkFrom(root, visitor);
  else walkVisible(root, styleOf(root), visitor, false);
  endRow();
  flush();
  regions.sort((a, b) => a.start - b.start || b.end - a.end);
  return { lines, headings, regions };
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
  /** Read several elements in one result, each as `root` would be. One that could not be resolved carries the reason. */
  roots?: ({ ref: number; el: Element } | { ref: number; error: string })[];
  /** Return only the lines that contain this text, with the lines around them. */
  find?: string;
  /** `find` is a regular expression (search.ts says what is accepted). */
  regex?: boolean;
  /** Lines shown before and after a matching line. */
  contextLines?: number;
  /** Matching lines shown. */
  maxMatches?: number;
  /** Return only the regions of this kind. */
  kind?: RegionKind;
  /** The clock, for tests of the time limit. */
  now?: () => number;
}

export const MAX_FIND = 200;
export const MAX_ROOTS = 10;
const DEFAULT_CONTEXT = 2;
const DEFAULT_MATCHES = 20;
/** Time a search may take before it stops and says where. */
const SEARCH_MS = 250;
/** A line of a search result is shown up to this length; its offset leads to the whole of it. */
const MAX_FOUND_LINE = 500;
/** A piece of a region smaller than this is not worth showing when the size limit is reached. */
const MIN_PIECE = 200;

/** Combinations of arguments that have no meaning are refused, not guessed at. */
function checkOptions(options: ExtractOptions): void {
  const refuse = (message: string): never => {
    throw new DomError('INVALID_ARGUMENT', message);
  };
  const parts = options.find !== undefined || options.kind !== undefined || options.roots !== undefined;
  if (options.outline && parts) refuse('outline cannot be combined with find, kind or refs.');
  if (options.root && options.roots) refuse('Provide ref or refs, not both.');
  if (options.roots && (options.roots.length < 1 || options.roots.length > MAX_ROOTS)) refuse(`refs must hold 1-${MAX_ROOTS} refs.`);
  if (options.roots && options.offset > 0) refuse('offset cannot be combined with refs: continue one region with ref and offset.');
  if (options.find !== undefined && (options.find.length < 1 || options.find.length > MAX_FIND)) refuse(`find must be 1-${MAX_FIND} characters.`);
  if (options.kind !== undefined && !REGION_KINDS.includes(options.kind)) refuse(`kind must be one of ${REGION_KINDS.join(', ')}.`);
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
  checkOptions(options);
  const registry = state.registry;
  registry.prune();
  const { root, main } = pageRoot(doc, options.mainOnly === true);
  const rendered: Rendered = root ? render(root, { links: options.links, registry, collapse: true }, false) : { lines: [], headings: [], regions: [] };
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

  if (options.find !== undefined || options.kind !== undefined || options.roots !== undefined) {
    return extractParts(doc, state, options, rendered, main, head);
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

/** One part of the page that is read: the whole of it, a heading's section, or a container. */
interface Scope {
  /** The ref it was asked for by, or null for the page. */
  ref: number | null;
  /** How the header names it, e.g. `Section: ## Installation`. */
  label: string;
  lines: string[];
  /** Headings in it, by the index of their line in `lines`. */
  headings: { line: number; level: number; text: string; ref: number | null }[];
  regions: Region[];
  /** Why it could not be read. */
  error?: string;
}

const NOUNS: Record<RegionKind, [string, string]> = {
  tables: ['table', 'tables'],
  code: ['code block', 'code blocks'],
  articles: ['article', 'articles'],
};

const count = (n: number, [one, many]: [string, string]): string => `${n} ${n === 1 ? one : many}`;

/** The character offset at which each line starts in the lines joined by newlines; last, the length of the whole. */
function lineOffsets(lines: string[]): number[] {
  const offsets: number[] = new Array(lines.length + 1);
  let at = 0;
  for (let i = 0; i < lines.length; i++) {
    offsets[i] = at;
    at += lines[i].length + 1;
  }
  offsets[lines.length] = Math.max(0, at - 1);
  return offsets;
}

/** The index of the line that holds a character offset; the number of lines when the offset lies after them. */
function lineAt(offsets: number[], offset: number): number {
  const lines = offsets.length - 1;
  if (offset <= 0) return 0;
  if (lines === 0 || offset > offsets[lines]) return lines;
  let low = 0;
  let high = lines - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (offsets[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** Matching lines with the lines around them, as ranges that do not overlap or touch. */
function contextBlocks(matches: number[], context: number, lines: number): { start: number; end: number }[] {
  const blocks: { start: number; end: number }[] = [];
  for (const line of matches) {
    const start = Math.max(0, line - context);
    const end = Math.min(lines, line + context + 1);
    const last = blocks[blocks.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else blocks.push({ start, end });
  }
  return blocks;
}

/**
 * Matching lines, regions of one kind, or several parts of the page in one result. All of it is
 * cut from the lines the renderer produced: nothing is read from the page a second way.
 */
function extractParts(
  doc: Document, state: PageState, options: ExtractOptions, rendered: Rendered, main: boolean, head: string[],
): Extract {
  const registry = state.registry;
  const renderOptions: RenderOptions = { links: options.links, registry, collapse: true };

  const scopeOf = (el: Element, ref: number): Scope => {
    const heading = rendered.headings.find((h) => h.el === el);
    if (heading) {
      const lines = sectionLines(rendered, heading);
      const base = heading.line;
      const end = base + lines.length;
      return {
        ref,
        label: `Section: ${'#'.repeat(heading.level)} ${heading.text}`,
        lines,
        headings: rendered.headings.filter((h) => h.line >= base && h.line < end).map((h) => ({ ...h, line: h.line - base })),
        regions: rendered.regions.filter((r) => r.start < end && r.end > base)
          .map((r) => ({ kind: r.kind, start: Math.max(r.start, base) - base, end: Math.min(r.end, end) - base })),
      };
    }
    const own = render(el, renderOptions, true);
    const container = containerOf(el);
    return {
      ref,
      label: `Section: ${container ? `${container.role}${container.name ? ` ${container.name}` : ''}` : roleOf(el) ?? 'element'}`,
      ...own,
    };
  };

  const several = options.roots !== undefined;
  const scopes: Scope[] = options.roots
    ? options.roots.map((root) => ('el' in root ? scopeOf(root.el, root.ref)
      : { ref: root.ref, label: '', lines: [], headings: [], regions: [], error: root.error }))
    : [options.root ? scopeOf(options.root, registry.assign(options.root)) : { ref: null, label: '', ...rendered }];
  const kind = options.kind;
  const find = options.find;
  const from = several ? 0 : Math.max(0, options.offset);

  /** The arguments that lead back to a place in a scope's text. */
  const at = (scope: Scope, offset: number): string =>
    `offset=${offset}${scope.ref !== null ? ` ref=${scope.ref}` : main ? ' main_only=true' : ''}`;
  /** The nearest heading at or above a line. */
  const under = (scope: Scope, line: number): string => {
    let found: Scope['headings'][number] | null = null;
    for (const h of scope.headings) {
      if (h.line > line) break;
      found = h;
    }
    return found ? `, under ${found.ref !== null ? `[${found.ref}] ` : ''}${'#'.repeat(found.level)} ${found.text}` : '';
  };
  /** Lines by their numbers, which start at 1: from an index up to, not including, another. */
  const span = (start: number, end: number): string => (end - start === 1 ? `line ${start + 1}` : `lines ${start + 1}-${end}`);
  const opening = (scope: Scope, what: string): string =>
    (scope.error ? `=== [${scope.ref}] not read: ${scope.error} ===` : `=== [${scope.ref}] ${scope.label}: ${what} ===`);

  const body: string[] = [];
  let budget = options.maxChars;
  /** Something was left out by a limit, and the result says how to get it. */
  let cut = false;
  let summary: string;
  const scoped: string[] = [];

  if (find !== undefined) {
    let test: (line: string) => boolean;
    try {
      test = options.regex ? compilePattern(find) : literalTest(find);
    } catch (e) {
      if (e instanceof PatternError) throw new DomError('INVALID_ARGUMENT', `find is not a usable regular expression. ${e.message}`);
      throw e;
    }
    const context = options.contextLines ?? DEFAULT_CONTEXT;
    const now = options.now ?? Date.now;
    const deadline = now() + SEARCH_MS;
    let left = options.maxMatches ?? DEFAULT_MATCHES;
    let total = 0;
    let searched = 0;
    let shown = 0;
    let full = false;

    for (const scope of scopes) {
      if (scope.error) {
        body.push(opening(scope, ''));
        continue;
      }
      const offsets = lineOffsets(scope.lines);
      let within: ((index: number) => boolean) | undefined;
      if (kind) {
        const inside = new Uint8Array(scope.lines.length);
        for (const region of scope.regions) {
          if (region.kind === kind) inside.fill(1, region.start, region.end);
        }
        within = (index) => inside[index] === 1;
      }
      // One more than is shown: the first that is not shown is where to go on.
      const result = searchLines(scope.lines, test, {
        from: lineAt(offsets, from), keep: left + 1, budgetMs: Math.max(0, deadline - now()), now, within,
      });
      total += result.total;
      searched += result.searched;
      if (several) body.push(opening(scope, `${result.total} of ${count(result.searched, ['line matches', 'lines match'])}`));

      const matches = result.lines.slice(0, left);
      const isMatch = new Set(matches);
      let printed = 0;
      for (const block of full ? [] : contextBlocks(matches, context, scope.lines.length)) {
        const rows: string[] = [];
        for (let i = block.start; i < block.end && !full; i++) {
          const row = `${isMatch.has(i) ? '>' : ' '} ${i + 1}: ${clip(scope.lines[i], MAX_FOUND_LINE)}`;
          // The first matching line is shown whatever the limit: a result with nothing in it helps nobody.
          if (row.length > budget && shown > 0) {
            full = true;
            break;
          }
          rows.push(row);
          budget -= row.length + 1;
          if (isMatch.has(i)) {
            shown++;
            printed++;
          }
        }
        if (rows.length) {
          body.push(`--- ${span(block.start, block.start + rows.length)}, ${at(scope, offsets[block.start])}${under(scope, block.start)} ---`, ...rows);
        }
      }
      left -= printed;

      const where = several ? ` in [${scope.ref}]` : '';
      const again = several ? 'call with the same find and' : 'repeat the call with';
      if (printed < result.total) {
        cut = true;
        body.push(`--- ${count(result.total - printed, ['more matching line', 'more matching lines'])}${where} not shown `
          + `(${full ? 'max_chars' : 'max_matches'}): ${again} ${at(scope, offsets[result.lines[printed]])} ---`);
      }
      if (result.stoppedAt !== null) {
        cut = true;
        body.push(`--- the search${where} stopped at line ${result.stoppedAt + 1} of ${scope.lines.length} after ${SEARCH_MS} ms: `
          + `${again} ${at(scope, offsets[result.stoppedAt])} ---`);
      }
    }
    if (!body.length) body.push('(no line matches)');
    summary = `Find: ${JSON.stringify(find)} (${options.regex ? 'regular expression' : 'literal'}, ignoring case)`
      + `${kind ? ` in ${NOUNS[kind][1]}` : ''}: ${total} of ${count(searched, ['line matches', 'lines match'])}`
      + `${from > 0 ? `, searched from offset ${from}` : ''}; ${shown} shown`
      + `${shown ? ` with ${count(context, ['line', 'lines'])} of context` : ''}`;
    scoped.push('only the lines that match find, with their context');
  } else if (kind) {
    const nouns = NOUNS[kind];
    const more = (n: number): string => count(n, [`more ${nouns[0]}`, `more ${nouns[1]}`]);
    let found = 0;
    let chars = 0;
    let shown = 0;
    for (const scope of scopes) {
      if (scope.error) {
        body.push(opening(scope, ''));
        continue;
      }
      const offsets = lineOffsets(scope.lines);
      const all = scope.regions.filter((region) => region.kind === kind);
      const regions = all.filter((region) => offsets[region.start] >= from);
      found += regions.length;
      if (several) body.push(opening(scope, count(regions.length, nouns)));
      for (const [index, region] of regions.entries()) {
        const text = scope.lines.slice(region.start, region.end).join('\n');
        chars += text.length;
        if (cut) continue;
        const rest = regions.length - index - 1;
        if (text.length > budget && shown > 0 && budget < MIN_PIECE) {
          cut = true;
          body.push(`--- ${more(rest + 1)} not shown (max_chars): kind=${kind} ${at(scope, offsets[region.start])} ---`);
          continue;
        }
        const piece = text.slice(0, budget);
        budget -= piece.length;
        shown++;
        body.push(`--- ${nouns[0]} ${all.indexOf(region) + 1} of ${all.length}: ${span(region.start, region.end)}, `
          + `${at(scope, offsets[region.start])}${under(scope, region.start)} ---`, piece);
        if (piece.length < text.length) {
          cut = true;
          body.push(`--- cut by max_chars: the rest of this ${nouns[0]} without kind, at ${at(scope, offsets[region.start] + piece.length)}`
            + `${rest > 0 ? `; ${more(rest)}: kind=${kind} ${at(scope, offsets[regions[index + 1].start])}` : ''} ---`);
        }
      }
    }
    if (!body.length) body.push(`(no ${nouns[1]} here)`);
    summary = `Regions: ${count(found, nouns)}, ${chars} characters in total${from > 0 ? `, from offset ${from}` : ''}; ${shown} shown`;
    scoped.push(`only ${nouns[1]}`);
  } else {
    // Several parts, whole: each gets an equal share of the size limit, and what one leaves goes to the next.
    let chars = 0;
    let waiting = scopes.filter((scope) => !scope.error).length;
    for (const scope of scopes) {
      if (scope.error) {
        body.push(opening(scope, ''));
        continue;
      }
      const text = scope.lines.join('\n');
      const piece = text.slice(0, Math.floor(budget / waiting));
      waiting--;
      budget -= piece.length;
      chars += text.length;
      const more = piece.length < text.length;
      if (more) cut = true;
      body.push(opening(scope, `characters 0-${piece.length} of ${text.length}${more ? ` (continue with ${at(scope, piece.length)})` : ''}`), piece);
    }
    const unread = scopes.filter((scope) => scope.error).length;
    summary = `Regions: ${count(scopes.length, ['ref', 'refs'])}${unread ? `, ${unread} not read` : ''}, ${chars} characters in total`;
  }

  if (several) scoped.push(`${count(scopes.length, ['region', 'regions'])} only`);
  else if (options.root) scoped.push('one section only');
  else if (main) scoped.push('main content only');
  if (!several && scopes[0].label) head.push(scopes[0].label);
  const completeness = assess(doc, state, { truncated: cut, scoped: scoped.join(', ') });
  // Here the way on is not in the header: it stands where something was left out.
  const line = completeness.line.replace('cut at the size limit: continue as shown above',
    'cut at a limit: the lines that start with --- or === say how to continue');
  head.push(summary, scrollLine(doc), line, UNTRUSTED_NOTE, '');
  return {
    text: head.join('\n') + '\n' + body.join('\n'),
    totalChars: scopes.reduce((sum, scope) => sum + scope.lines.join('\n').length, 0),
    offset: from,
    truncated: cut,
    completeness: completeness.status,
  };
}

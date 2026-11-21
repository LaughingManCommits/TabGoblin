import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editorKind } from '../src/editor.ts';
import { fill, press } from '../src/interact.ts';
import { PageState, editorSurface, takeSnapshot } from '../src/snapshot.ts';
import { content, page, refOf } from './helpers.ts';

// jsdom implements neither the browser's editing commands nor clipboard events. These stand-ins do
// what Chrome does, as far as the code under test can tell.

/** The browser's own editing: changes the focused element and announces it with `input`. */
function installEditing(doc: Document, win: Window, calls: string[] = []): string[] {
  const view = win as Window & typeof globalThis;
  (doc as unknown as { execCommand: unknown }).execCommand = (name: string, _ui: boolean, value: string): boolean => {
    calls.push(name);
    const active = doc.activeElement as HTMLElement | null;
    if (!active) return false;
    const announce = (): boolean => active.dispatchEvent(new view.Event('input', { bubbles: true }));
    if (active.localName === 'textarea') {
      const area = active as HTMLTextAreaElement;
      if (name !== 'insertText') return false;
      area.value = area.value.slice(0, area.selectionStart) + value + area.value.slice(area.selectionEnd);
      announce();
      return true;
    }
    // `data-inert`: an editor whose DOM the browser cannot usefully edit (it draws from its model).
    if (active.getAttribute('contenteditable') !== 'true' || active.hasAttribute('data-inert')) return false;
    const selection = doc.getSelection()!;
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const selected = range !== null && !range.collapsed;
    const text = active.textContent ?? '';
    // A caret at the very start types there; anywhere else in these tests means the end.
    const atStart = range !== null && range.collapsed && range.startOffset === 0
      && (range.startContainer === active || range.startContainer === active.firstChild);
    if (name === 'insertText') active.textContent = selected ? value : atStart ? value + text : text + value;
    else if (name === 'delete') active.textContent = selected ? '' : text.slice(0, -1);
    else if (name === 'insertParagraph') active.textContent = `${text}\n`;
    else return false;
    const caret = doc.createRange();
    caret.selectNodeContents(active);
    caret.collapse(false);
    selection.removeAllRanges();
    selection.addRange(caret);
    announce();
    return true;
  };
  return calls;
}

function installClipboard(win: Window): void {
  const view = win as unknown as Record<string, unknown> & { Event: typeof Event };
  class Transfer {
    private data = new Map<string, string>();
    setData(type: string, value: string): void { this.data.set(type, value); }
    getData(type: string): string { return this.data.get(type) ?? ''; }
  }
  class Clipboard extends view.Event {
    clipboardData: Transfer;
    constructor(type: string, init: EventInit & { clipboardData: Transfer }) {
      super(type, init);
      this.clipboardData = init.clipboardData;
    }
  }
  view.DataTransfer = Transfer;
  view.ClipboardEvent = Clipboard;
}

const pastedText = (e: Event): string => (e as unknown as { clipboardData: { getData(t: string): string } }).clipboardData.getData('text/plain');
const wholeSelected = (doc: Document): boolean => {
  const selection = doc.getSelection();
  return !!selection && selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed;
};

test('a plain editable region is edited through the browser, which announces every change', async () => {
  const { doc, win } = page('<div id="e" contenteditable="true" tabindex="0">draft</div>');
  installEditing(doc, win);
  const editor = doc.getElementById('e')!;
  let inputs = 0;
  editor.addEventListener('input', () => inputs++);

  assert.deepEqual(await fill(editor, 'final text', false), { filled: true, valueMatches: true });
  assert.equal(editor.textContent, 'final text');
  await fill(editor, '!', true);
  assert.equal(editor.textContent, 'final text!');
  await fill(editor, '', false);
  assert.equal(editor.textContent, '');
  assert.equal(inputs, 3, 'one announced change per fill');

  assert.match((await fill(editor, '', false)).note ?? 'none', /none/, 'clearing an empty editor is a no-op');
  await fill(editor, 'same', false);
  assert.match((await fill(editor, 'same', false)).note ?? '', /already held that text/);
});

test('an editor that runs on beforeinput applies the text itself, and the browser is not asked to', async () => {
  const { doc, win } = page('<div id="e" contenteditable="true" tabindex="0">Initial</div>');
  const commands = installEditing(doc, win);
  const editor = doc.getElementById('e')!;
  const model: string[] = [];
  editor.addEventListener('beforeinput', (e) => {
    const event = e as InputEvent;
    if (event.inputType !== 'insertText') return;
    event.preventDefault();
    model.push(event.data ?? '');
    editor.textContent = wholeSelected(doc) ? event.data : (editor.textContent ?? '') + event.data;
  });

  assert.equal((await fill(editor, 'Hello', false)).valueMatches, true);
  assert.deepEqual(model, ['Hello'], 'entered exactly once');
  assert.deepEqual(commands, [], 'the editor claimed the event, so the browser did not edit as well');
});

test('an editor that only takes a paste gets one, with the text and nothing from the clipboard', async () => {
  const { doc, win } = page('<div id="e" contenteditable="true" tabindex="0" data-inert>Initial</div>');
  installEditing(doc, win);
  installClipboard(win);
  const editor = doc.getElementById('e')!;
  const pastes: string[] = [];
  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    pastes.push(pastedText(e));
    editor.textContent = pastedText(e);
  });

  assert.equal((await fill(editor, 'Hello', false)).valueMatches, true);
  assert.deepEqual(pastes, ['Hello']);
  // Several lines go in as a paste too, so that the editor forms its own paragraphs.
  assert.equal((await fill(editor, 'one\ntwo', false)).valueMatches, true);
  assert.deepEqual(pastes, ['Hello', 'one\ntwo']);
});

test('text is never entered a second time when the first way was taken but not shown', async () => {
  const { doc, win } = page('<div id="e" contenteditable="true" tabindex="0" data-inert>Initial</div>');
  installEditing(doc, win);
  installClipboard(win);
  const editor = doc.getElementById('e')!;
  // Takes both kinds of input into its model, and draws nothing (as an editor in a hidden tab does).
  const model: string[] = [];
  editor.addEventListener('beforeinput', (e) => {
    e.preventDefault();
    model.push(`typed:${(e as InputEvent).data}`);
  });
  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    model.push(`pasted:${pastedText(e)}`);
  });

  const result = await fill(editor, 'Hello', false);
  assert.deepEqual(model, ['typed:Hello'], 'the claimed event ended it');
  assert.equal(result.valueMatches, false, 'and what cannot be seen is not reported as confirmed');
});

test('an editor that takes nothing is reported as such, and left as it was', async () => {
  const { doc, win } = page('<div id="e" contenteditable="true" tabindex="0" data-inert>Initial</div>');
  installEditing(doc, win);
  installClipboard(win);
  const editor = doc.getElementById('e')!;
  const result = await fill(editor, 'Hello', false);
  assert.equal(result.valueMatches, false);
  assert.match(result.note ?? '', /did not take the text/);
  assert.equal(editor.textContent, 'Initial');
});

test('a changed result that is not the requested text is reported, including lost indentation', async () => {
  const { doc, win } = page('<div id="e" contenteditable="true" tabindex="0" data-inert>Initial</div>');
  installEditing(doc, win);
  installClipboard(win);
  const editor = doc.getElementById('e')!;
  let reindent = false;
  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    editor.textContent = reindent ? pastedText(e).replace(/\n +/g, '\n') : pastedText(e).toUpperCase();
  });

  const upper = await fill(editor, 'one\ntwo', false);
  assert.equal(upper.valueMatches, false);
  assert.match(upper.note ?? '', /does not show exactly the requested text/);

  reindent = true;
  const flat = await fill(editor, 'if x:\n    return 1', false);
  assert.equal(flat.valueMatches, false);
  assert.match(flat.note ?? '', /indentation/);
});

test('keys in an editor: characters, Backspace and Enter do what the browser would', async () => {
  const { doc, win } = page('<div id="e" contenteditable="true" tabindex="0">ab</div>');
  const commands = installEditing(doc, win);
  const editor = doc.getElementById('e')!;

  assert.equal((await press(doc, editor, 'c')).effect, 'typed the character');
  assert.equal(editor.textContent, 'abc');
  assert.equal((await press(doc, editor, 'Backspace')).effect, 'deleted a character');
  assert.equal(editor.textContent, 'ab');
  assert.equal((await press(doc, editor, 'Enter')).effect, 'inserted a new paragraph');
  assert.ok(commands.includes('insertParagraph'));

  // An editor that handles a key itself is left to it.
  editor.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'x') e.preventDefault(); });
  assert.equal((await press(doc, editor, 'x')).effect, 'the page handled the key itself');
  assert.ok(!(doc.getElementById('e')!.textContent ?? '').includes('x'));
});

function caretInto(doc: Document, el: Element): void {
  const caret = doc.createRange();
  caret.selectNodeContents(el);
  caret.collapse(false);
  const selection = doc.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(caret);
}

const inBackground = (doc: Document): void => {
  Object.defineProperty(doc, 'visibilityState', { value: 'hidden', configurable: true });
};

test('a key pressed in an editor that does not hold the caret goes to its end', async () => {
  const { doc, win } = page('<p id="p">Other text</p><div id="e" contenteditable="true" tabindex="0">ab</div>');
  installEditing(doc, win);
  const editor = doc.getElementById('e')!;
  caretInto(doc, doc.getElementById('p')!);

  // Getting the keyboard puts the caret at the start of an editable region, in Chrome and in jsdom.
  assert.equal((await press(doc, editor, 'c')).effect, 'typed the character');
  assert.equal(editor.textContent, 'abc', 'at the end, not where focusing put the caret');
  // With the caret in it, the key goes where the caret is.
  assert.equal((await press(doc, editor, 'd')).effect, 'typed the character');
  assert.equal(editor.textContent, 'abcd');
});

test('without a target, typing goes to the editable region that holds the caret', async () => {
  const { doc, win } = page(`
    <div id="one" contenteditable="true" tabindex="0">first</div>
    <div id="two" contenteditable="true" tabindex="0"></div>
    <button id="b">Other</button>`);
  installEditing(doc, win);
  const one = doc.getElementById('one') as HTMLElement;
  const two = doc.getElementById('two')!;

  // A block editor answers Enter by moving the caret into a new block. In a window that is not in
  // front the browser does not move the keyboard along: it stays on the old block.
  one.focus();
  caretInto(doc, two);
  assert.equal(doc.activeElement, one);
  assert.equal((await press(doc, null, 'x')).effect, 'typed the character');
  assert.equal(two.textContent, 'x');
  assert.equal(one.textContent, 'first');

  // A caret left behind in an editor does not take keys from a control that has the keyboard.
  doc.getElementById('b')!.focus();
  caretInto(doc, one);
  await press(doc, null, 'y');
  assert.equal(one.textContent, 'first');
  assert.equal(two.textContent, 'x');
});

test('a key the editor takes without changing anything is not reported as done', async () => {
  const { doc, win } = page('<div id="e" contenteditable="true" tabindex="0">locked</div>');
  const commands = installEditing(doc, win);
  const editor = doc.getElementById('e')!;
  // Read-only in its own way: claims every edit and applies none.
  editor.addEventListener('beforeinput', (e) => e.preventDefault());

  for (const key of ['x', 'Backspace', 'Enter']) {
    const result = await press(doc, editor, key);
    assert.equal(result.effect, 'the editor took the key, but nothing on the page changed', key);
    assert.equal(result.note, undefined);
  }
  assert.equal(editor.textContent, 'locked');
  assert.deepEqual(commands, [], 'and the browser was not asked to edit behind its back');
});

test('in a tab that is not drawn, a key whose effect cannot be seen is reported as unchecked', async () => {
  const { doc, win } = page('<div id="e" contenteditable="true" tabindex="0" data-inert>Initial</div>');
  installEditing(doc, win);
  const editor = doc.getElementById('e')!;
  inBackground(doc);

  // Nobody claimed the key and nothing shows: the editor may still have taken it.
  const unknown = await press(doc, editor, 'x');
  assert.equal(unknown.effect, 'the editor gave no sign of taking the key');
  assert.match(unknown.note ?? '', /Do not press the key again/);

  // Claimed into a model that is drawn only when the tab is.
  const model: string[] = [];
  editor.addEventListener('beforeinput', (e) => {
    e.preventDefault();
    model.push((e as InputEvent).inputType);
  });
  const unseen = await press(doc, editor, 'x');
  assert.equal(unseen.effect, 'the editor accepted the key');
  assert.match(unseen.note ?? '', /could not be checked/);
  assert.deepEqual(model, ['insertText'], 'entered once');
});

test('in a tab that is not drawn, a new paragraph made by the browser comes with a warning about what follows', async () => {
  const { doc, win } = page('<div id="e" contenteditable="true" tabindex="0">one</div>');
  installEditing(doc, win);
  const editor = doc.getElementById('e')!;

  const front = await press(doc, editor, 'Enter');
  assert.deepEqual(front, { dispatched: true, effect: 'inserted a new paragraph' }, 'no warning while the tab is drawn');

  inBackground(doc);
  const back = await press(doc, editor, 'Enter');
  assert.equal(back.effect, 'inserted a new paragraph');
  assert.match(back.note ?? '', /what is entered next may land in the wrong place/);
  // A character is checked against the page as usual.
  assert.deepEqual(await press(doc, editor, 'x'), { dispatched: true, effect: 'typed the character' });

  // An editor that makes its own paragraphs is not in doubt.
  editor.addEventListener('beforeinput', (e) => {
    if ((e as InputEvent).inputType !== 'insertParagraph') return;
    e.preventDefault();
    editor.textContent = `${editor.textContent}\n`;
  });
  assert.deepEqual(await press(doc, editor, 'Enter'), { dispatched: true, effect: 'inserted a new paragraph' });
});

test('a fill never presses Enter: typed text with line breaks goes in in one piece', async () => {
  const { doc, win } = page('<div id="e" contenteditable="true" tabindex="0" data-inert></div>');
  installEditing(doc, win);
  installClipboard(win);
  const editor = doc.getElementById('e')!;
  // A message box: Enter sends what is there.
  const sent: string[] = [];
  const keys: string[] = [];
  editor.addEventListener('keydown', (e) => {
    const key = (e as KeyboardEvent).key;
    keys.push(key);
    if (key !== 'Enter') return;
    e.preventDefault();
    sent.push(editor.textContent ?? '');
    editor.textContent = '';
  });
  editor.addEventListener('beforeinput', (e) => {
    const event = e as InputEvent;
    e.preventDefault();
    if (event.inputType === 'insertText') editor.textContent = wholeSelected(doc) ? event.data : (editor.textContent ?? '') + event.data;
  });
  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    editor.textContent = pastedText(e);
  });

  const result = await fill(editor, 'first line\nsecond line', false, 'type');
  assert.deepEqual(sent, [], 'nothing was sent');
  assert.ok(!keys.includes('Enter'), 'because Enter was not pressed');
  assert.equal(editor.textContent, 'first line\nsecond line');
  assert.equal(result.valueMatches, true);
  assert.match(result.note ?? '', /in one piece/);

  // One line is typed key by key, as asked.
  keys.length = 0;
  const line = await fill(editor, 'hi', false, 'type');
  assert.deepEqual(keys.filter((key) => key.length === 1), ['h', 'i']);
  assert.equal(editor.textContent, 'hi');
  assert.deepEqual(line, { filled: true, valueMatches: true });

  // Pressing Enter stays possible, as the deliberate act it is.
  await press(doc, editor, 'Enter');
  assert.deepEqual(sent, ['hi']);
});

const CODE_EDITOR = `
  <div id="editor">
    <div id="lines">Initial content</div>
    <textarea id="in" data-zero autocorrect="off" spellcheck="false"></textarea>
  </div>`;

/** A code editor in miniature: draws its model into #lines, takes the keyboard through a hidden textarea. */
function codeEditor(doc: Document): { model: () => string } {
  const input = doc.getElementById('in') as HTMLTextAreaElement;
  const lines = doc.getElementById('lines')!;
  let model = lines.textContent ?? '';
  let all = false;
  const draw = (): void => { lines.textContent = model; };
  input.addEventListener('keydown', (e) => {
    const event = e as KeyboardEvent;
    if (event.key === 'a' && (event.ctrlKey || event.metaKey)) {
      all = true;
      e.preventDefault();
    } else if (event.key === 'End' && event.ctrlKey) {
      all = false;
      e.preventDefault();
    } else if (event.key === 'Backspace') {
      model = all ? '' : model.slice(0, -1);
      all = false;
      draw();
      e.preventDefault();
    }
  });
  input.addEventListener('paste', (e) => {
    e.preventDefault();
    model = all ? pastedText(e) : model + pastedText(e);
    all = false;
    draw();
  });
  input.addEventListener('input', () => {
    model += input.value;
    input.value = '';
    draw();
  });
  return { model: () => model };
}

test('a code editor with a hidden keyboard input is listed as an editor and can be filled', async () => {
  const { doc, win } = page(`<h1>Playground</h1>${CODE_EDITOR}`);
  installEditing(doc, win);
  installClipboard(win);
  const editor = codeEditor(doc);
  const input = doc.getElementById('in')!;

  assert.equal(editorSurface(input), doc.getElementById('editor'));
  assert.equal(editorKind(input), 'input');

  const state = new PageState('d1');
  const snapshot = content(takeSnapshot(doc, state).text);
  assert.match(snapshot, /\[\d+\] Editor: \(unnamed\)$/m, 'listed, without the value of the hidden input');
  assert.match(snapshot, /Text: Initial content/, 'its content is read where it is shown');
  const ref = refOf(snapshot, 'Editor');
  assert.equal(state.registry.resolve(ref), input, 'the ref resolves although the input itself has no box');

  assert.equal((await fill(input, 'let a = 1;\nlet b = 2;', false)).valueMatches, true);
  assert.equal(editor.model(), 'let a = 1;\nlet b = 2;', 'replaced through the editor\'s own select-all, then a paste');
  await fill(input, ' // end', true);
  assert.equal(editor.model(), 'let a = 1;\nlet b = 2; // end');
  assert.equal((await press(doc, input, '!')).effect, 'typed the character');
  assert.equal(editor.model(), 'let a = 1;\nlet b = 2; // end!', 'typed once, through the input');
  await fill(input, '', false);
  assert.equal(editor.model(), '');
  assert.equal(state.registry.resolve(ref), input, 'and the ref is still good after all that');
});

test('appending to an editor that draws only the lines in view is confirmed by what it ends with', async () => {
  const lines = (from: number, to: number): string =>
    Array.from({ length: to - from + 1 }, (_, i) => `line ${from + i} of the document`).join('\n');
  // Shows the top of a long file; after an edit at its end it shows the end instead.
  const { doc, win } = page(`<div id="e" contenteditable="true" tabindex="0" data-inert>${lines(1, 40)}</div>`);
  installEditing(doc, win);
  const editor = doc.getElementById('e')!;
  editor.addEventListener('beforeinput', (e) => {
    e.preventDefault();
    editor.textContent = `${lines(30, 60)}${(e as InputEvent).data}`;
  });

  const result = await fill(editor, '\n\n<!-- appended -->\n    indented', true);
  assert.equal(result.valueMatches, true);
  assert.match(result.note ?? '', /only part of its content/);
});

test('an append that the editor turned into something else is still reported', async () => {
  const { doc, win } = page('<div id="e" contenteditable="true" tabindex="0" data-inert>some text that is there</div>');
  installEditing(doc, win);
  const editor = doc.getElementById('e')!;
  editor.addEventListener('beforeinput', (e) => {
    e.preventDefault();
    editor.textContent = 'some text that is there, plus SOMETHING ELSE';
  });
  assert.equal((await fill(editor, ' plus this', true)).valueMatches, false);
});

test('hidden fields that are not an editor\'s keyboard input are not offered', () => {
  const hidden = (attributes: string): string => `<div class="box"><p>Visible text</p><textarea data-zero ${attributes}></textarea></div>`;
  const listed = (html: string): string => content(takeSnapshot(page(html).doc, new PageState('d1')).text);

  // A field the form submits: a trap for bots, not something to type into.
  assert.doesNotMatch(listed(hidden('name="website"')), /Editor|Textbox/);
  // Taken out of keyboard and accessibility reach: the page's own plumbing.
  assert.doesNotMatch(listed(hidden('aria-hidden="true"')), /Editor|Textbox/);
  assert.doesNotMatch(listed(hidden('tabindex="-1"')), /Editor|Textbox/);
  assert.doesNotMatch(listed(hidden('readonly')), /Editor|Textbox/);
  assert.doesNotMatch(listed(hidden('disabled')), /Editor|Textbox/);
  // Directly in a form or the page body: there is no editor around it.
  assert.doesNotMatch(listed('<form><textarea data-zero></textarea><button>Send</button></form>'), /Editor|Textbox/);
  assert.doesNotMatch(listed('<p>Text</p><textarea data-zero></textarea>'), /Editor|Textbox/);
  // A visible field that is merely marked hidden for assistive technology and unreachable by Tab.
  assert.doesNotMatch(listed('<textarea aria-hidden="true" tabindex="-1" readonly>shadow copy</textarea>'), /Textbox|shadow copy/);
  // The plain case still is a text field.
  assert.match(listed('<textarea aria-label="Comment"></textarea>'), /Textbox \(multiline\): Comment/);
});

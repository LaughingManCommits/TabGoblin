// What an agent reads of code, editors, trees, dense lists and dialogs: as it is shown, and
// without the parts that only cost characters.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractPage, visibleText, type ExtractOptions } from '../src/extract.ts';
import { PageState, takeSnapshot } from '../src/snapshot.ts';
import { content, page } from './helpers.ts';

const defaults: ExtractOptions = { maxChars: 100000, offset: 0, links: 'ref' };
const plain: ExtractOptions = { ...defaults, links: 'none' };

test('preformatted text keeps its lines and indentation, and repeated lines are not merged', () => {
  const { doc } = page('<p>Run:</p><pre>if (a) {\n    if (b) {\n        go();\n    }\n    }\n\n\ndone</pre>'
    + '<p>Use <code style="white-space: pre">x  y</code> inline.</p>');
  assert.equal(content(extractPage(doc, new PageState(), plain).text), [
    'Run:',
    'if (a) {',
    '    if (b) {',
    '        go();',
    '    }',
    '    }',
    '',
    'done',
    'Use x y inline.',
  ].join('\n'));
});

test('a column of line numbers is given as its range', () => {
  const numbers = Array.from({ length: 30 }, (_, i) => `<div>${i + 1}</div>`).join('');
  const { doc } = page(`<div>${numbers}</div><p>first line of code</p><div>7</div><div>8</div>`);
  assert.equal(content(extractPage(doc, new PageState(), plain).text),
    ['1–30 (consecutive numbers, one per line)', 'first line of code', '7', '8'].join('\n'));

  // Code views draw the column as preformatted text, like the code next to it.
  const gutter = page(`<div style="white-space: pre">${numbers}</div><pre>a\n  b</pre>`).doc;
  assert.equal(content(extractPage(gutter, new PageState(), plain).text),
    ['1–30 (consecutive numbers, one per line)', 'a', '  b'].join('\n'));
  assert.equal(content(takeSnapshot(gutter, new PageState()).text),
    ['Text: 1–30 (consecutive numbers, one per line)', 'Text: a', 'Text:   b'].join('\n'));
});

test('short pieces of one list entry share a line; longer text keeps its own', () => {
  const long = 'A paragraph that is clearly a sentence of its own and not a small label next to others.';
  const { doc } = page('<ul>'
    + '<li><div>Fix the build</div><div>alice</div><div>on Jan 15</div><div><button type="button">Copy</button></div></li>'
    + `<li><p>${long}</p><p>${long}</p></li>`
    + '</ul>');
  assert.equal(content(extractPage(doc, new PageState(), plain).text), [
    '- Fix the build · alice · on Jan 15 · [Button: Copy]',
    `- ${long}`,
    long,
  ].join('\n'));
  // Text used for matching is not rearranged.
  assert.doesNotMatch(visibleText(doc.body), /·/);
});

test('a document in an editable region is read in full, line by line', () => {
  const lines = Array.from({ length: 12 }, (_, i) => `<div>${i % 2 ? '    ' : ''}content line ${i + 1}</div>`).join('');
  const { doc } = page(
    `<div role="textbox" aria-label="File contents" contenteditable="true" style="white-space: pre">${lines}</div>`
    + '<div contenteditable="true" title="Comment">short</div>');
  const state = new PageState();
  const text = content(extractPage(doc, state, defaults).text);
  assert.match(text, /\[Textbox: File contents\]\{\d+\}\ncontent line 1\n {4}content line 2\n/);
  assert.match(text, /content line 11\n {4}content line 12/);
  assert.match(text, /\[Editable: Comment\]\{\d+\}$/);

  const snapshot = content(takeSnapshot(doc, state).text);
  assert.match(snapshot, /Textbox: File contents \(its content follows\)\n {2}Text: content line 1\n {2}Text: {5}content line 2\n/);
  assert.match(snapshot, /Editable: Comment = "short"$/);
});

const TREE = '<ul role="tree" aria-label="Files">'
  + '<li role="treeitem" aria-expanded="true" aria-label="src"><span style="cursor: pointer">src</span>'
  + '<ul role="group" aria-label="src"><li role="treeitem" aria-label="main">main</li></ul></li>'
  + '<li role="treeitem" aria-label="pom.xml">pom.xml</li></ul>';

test('an open tree item is followed by the items under it', () => {
  const { doc } = page(TREE);
  assert.deepEqual(content(extractPage(doc, new PageState(), plain).text).match(/Treeitem: [\w.]+/g),
    ['Treeitem: src', 'Treeitem: main', 'Treeitem: pom.xml']);
  assert.equal(content(takeSnapshot(doc, new PageState()).text), [
    '[1] Tree: Files',
    '  [2] Treeitem: src (expanded)',
    '    [3] Treeitem: main',
    '  [4] Treeitem: pom.xml',
  ].join('\n'));
});

test('a section ends where the part of the page it heads ends', () => {
  const { doc } = page('<main><article><h1>Readme</h1><p>About the project.</p><h3>Install</h3><p>Run it.</p></article>'
    + '<aside><h2>Releases</h2><p>None yet.</p></aside></main>');
  const state = new PageState();
  const outline = extractPage(doc, state, { ...defaults, outline: true }).text;
  const ref = Number(/\[(\d+)\] # Readme/.exec(outline)![1]);
  const heading = state.registry.resolve(ref);
  assert.equal(content(extractPage(doc, state, { ...plain, root: heading }).text),
    ['# Readme', 'About the project.', '### Install', 'Run it.'].join('\n'));
  assert.doesNotMatch(takeSnapshot(doc, state, { root: heading }).text, /Releases/);
});

test('a diff works after a snapshot of only part of the page', () => {
  const { doc } = page('<main><h1>Title</h1><button type="button" id="b">Open</button><p>Body</p></main>');
  const state = new PageState();
  takeSnapshot(doc, state, { interactiveOnly: true, viewportOnly: true });
  doc.getElementById('b')!.insertAdjacentHTML('afterend', '<a href="/new">New link</a>');
  assert.match(content(takeSnapshot(doc, state, { diff: true }).text),
    /^Changes since the previous snapshot: 1 added, 0 removed\.\n\+ \[\d+\] Link: New link -> \/new$/);
});

test('names read as words; a group named after its one item is left out; long targets keep both ends', () => {
  const path = `/files/${'deep/'.repeat(20)}Report.java`;
  const { doc } = page('<div role="listbox">'
    + `<div role="group" aria-labelledby="n1"><a id="n1" href="${path}">src/<mark>t</mark>e<mark>s</mark>t/Report.java</a></div>`
    + '</div>');
  assert.match(content(takeSnapshot(doc, new PageState()).text),
    /^\[\d+\] Listbox\n {2}\[\d+\] Link: src\/test\/Report\.java -> \/files\/deep\/.*….*\/Report\.java$/);
});

test('an open dialog is announced before the page it covers', () => {
  const { doc } = page('<main><p>Page</p></main>'
    + '<div role="dialog" aria-label="Pick a branch"><button type="button">main</button></div>');
  const snapshot = takeSnapshot(doc, new PageState()).text;
  assert.match(snapshot.slice(0, snapshot.indexOf('\n\n')), /Dialog open: \[\d+\] Dialog: Pick a branch/);
});

test('in a snapshot, code keeps one line per line and a line-number column is given as its range', () => {
  const numbers = Array.from({ length: 12 }, (_, i) => `<div>${i + 1}</div>`).join('');
  const { doc } = page(`<div>${numbers}</div><pre>mvn clean install\nmvn spring-boot:run</pre>`);
  assert.equal(content(takeSnapshot(doc, new PageState()).text), [
    'Text: 1–12 (consecutive numbers, one per line)',
    'Text: mvn clean install',
    'Text: mvn spring-boot:run',
  ].join('\n'));
});

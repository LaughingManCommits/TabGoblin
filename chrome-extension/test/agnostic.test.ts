import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// The extension works on any website because it knows none. Editors and widgets are recognised by
// what they are in the DOM, never by who made them. The names below are of libraries the test lab
// (e2e/editors) runs against; they belong there and in the documentation, not in the product.

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const NAMES = /\b(monaco|codemirror|ace[- ]?editor|prosemirror|tiptap|lexical|slate(js)?|quill|draft[-.]?js|tinymce|ckeditor|trix|editor\.?js)\b/i;
// Marks a library leaves in the page: its class names and attributes.
const MARKS = /\b(cm-|ck-|ql-|ace_|mce-|ProseMirror|DraftEditor|data-slate|data-lexical|trix-)/;

test('the product source names no editor library and matches none of their marks', () => {
  for (const file of readdirSync(SRC).filter((name) => name.endsWith('.ts'))) {
    readFileSync(join(SRC, file), 'utf8').split('\n').forEach((line, index) => {
      assert.doesNotMatch(line, NAMES, `${file}:${index + 1} names a library`);
      assert.doesNotMatch(line, MARKS, `${file}:${index + 1} refers to a library's markup`);
    });
  }
});

test('editors are not told apart by class name, id or address', () => {
  const editor = readFileSync(join(SRC, 'editor.ts'), 'utf8');
  assert.doesNotMatch(editor, /className|classList|querySelector|getElementById|\.closest\(|hostname|location\./);
});

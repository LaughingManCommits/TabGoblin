import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { INITIAL, host, ready } from './lab.js';

const editor = new Editor({ element: host, extensions: [StarterKit], content: `<p>${INITIAL}</p>` });
ready(() => editor.getText({ blockSeparator: '\n' }));

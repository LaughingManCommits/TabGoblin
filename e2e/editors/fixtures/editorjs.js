import EditorJS from '@editorjs/editorjs';
import { INITIAL, host, ready } from './lab.js';

const editor = new EditorJS({ holder: host, data: { blocks: [{ type: 'paragraph', data: { text: INITIAL } }] } });
const plain = (html) => Object.assign(document.createElement('div'), { innerHTML: html }).textContent;
editor.isReady.then(() => ready(async () => (await editor.save()).blocks.map((b) => plain(b.data.text ?? '')).join('\n')));

import 'trix';
import 'trix/dist/trix.css';
import { INITIAL, host, ready } from './lab.js';

const element = document.createElement('trix-editor');
host.append(element);
element.addEventListener('trix-initialize', () => {
  element.editor.insertString(INITIAL);
  ready(() => element.editor.getDocument().toString());
});

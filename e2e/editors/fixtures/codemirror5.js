import CodeMirror from 'codemirror5';
import 'codemirror5/lib/codemirror.css';
import 'codemirror5/mode/javascript/javascript';
import 'codemirror5/addon/edit/closebrackets';
import { INITIAL, host, ready } from './lab.js';

const cm = CodeMirror(host, { value: INITIAL, mode: 'javascript', lineNumbers: true, autoCloseBrackets: true });
ready(() => cm.getValue());

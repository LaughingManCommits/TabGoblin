import ace from 'ace-builds';
import 'ace-builds/src-noconflict/mode-javascript';
import { INITIAL, host, ready } from './lab.js';

const editor = ace.edit(host, { mode: 'ace/mode/javascript', value: INITIAL, useWorker: false });
ready(() => editor.getValue());

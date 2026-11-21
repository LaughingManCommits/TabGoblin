import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { INITIAL, host, ready } from './lab.js';

const view = new EditorView({ doc: INITIAL, extensions: [basicSetup, javascript()], parent: host });
ready(() => view.state.doc.toString());

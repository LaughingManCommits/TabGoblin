import * as monaco from 'monaco-editor/editor/editor.main';
import { INITIAL, host, ready } from './lab.js';

self.MonacoEnvironment = { getWorker: () => new Worker('/build/monaco-worker.js', { type: 'module' }) };
const editor = monaco.editor.create(host, { value: INITIAL, language: 'java', automaticLayout: true, minimap: { enabled: false } });
ready(() => editor.getValue());

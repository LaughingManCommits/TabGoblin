import React from 'react';
import { createRoot } from 'react-dom/client';
import { Editor, EditorState, ContentState } from 'draft-js';
import 'draft-js/dist/Draft.css';
import { INITIAL, host, ready } from './lab.js';

let latest = EditorState.createWithContent(ContentState.createFromText(INITIAL));
function App() {
  const [state, setState] = React.useState(latest);
  return React.createElement(Editor, { editorState: state, onChange: (next) => { latest = next; setState(next); } });
}
createRoot(host).render(React.createElement(App));
ready(() => latest.getCurrentContent().getPlainText('\n'));

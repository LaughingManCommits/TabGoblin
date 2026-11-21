import React from 'react';
import { createRoot } from 'react-dom/client';
import { createEditor, Node } from 'slate';
import { Slate, Editable, withReact } from 'slate-react';
import { withHistory } from 'slate-history';
import { INITIAL, host, ready } from './lab.js';

const editor = withHistory(withReact(createEditor()));
const initialValue = [{ type: 'paragraph', children: [{ text: INITIAL }] }];
createRoot(host).render(
  React.createElement(Slate, { editor, initialValue },
    React.createElement(Editable, { style: { minHeight: '200px', padding: '8px' } })));
ready(() => editor.children.map((node) => Node.string(node)).join('\n'));

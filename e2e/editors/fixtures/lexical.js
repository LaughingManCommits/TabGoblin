import { createEditor, $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import { registerRichText } from '@lexical/rich-text';
import { registerHistory, createEmptyHistoryState } from '@lexical/history';
import { INITIAL, host, ready } from './lab.js';

host.contentEditable = 'true';
host.setAttribute('role', 'textbox');
const editor = createEditor({ namespace: 'lab', onError: (e) => console.error(e) });
editor.setRootElement(host);
registerRichText(editor);
registerHistory(editor, createEmptyHistoryState(), 300);
editor.update(() => {
  const paragraph = $createParagraphNode();
  paragraph.append($createTextNode(INITIAL));
  $getRoot().append(paragraph);
});
ready(() => editor.getEditorState().read(() => $getRoot().getTextContent()));

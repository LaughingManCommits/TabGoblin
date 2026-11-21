import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { INITIAL, host, ready } from './lab.js';

const quill = new Quill(host, { theme: 'snow' });
quill.setText(INITIAL);
ready(() => quill.getText());

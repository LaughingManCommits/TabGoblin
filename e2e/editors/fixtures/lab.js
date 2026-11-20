// Shared by every fixture: where the editor goes, what it starts with, and how the test reads
// the editor's own idea of its content (its model, not what the page happens to display).
export const INITIAL = 'Initial content';
export const host = document.getElementById('host');
export function ready(get) {
  window.__lab = { get };
}

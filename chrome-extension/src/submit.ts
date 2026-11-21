// Observing a submission: what the page looked like before, and which signals it shows after.
// Generic DOM and ARIA semantics only; the verdict itself is decided in policy.ts.
// Pure DOM code (no chrome.*).

import { visibleText } from './extract.ts';
import type { SubmitSignals } from './policy.ts';
import { accessibleName, clip, editorSurface, isSensitiveField, isVisible, norm, ownText } from './snapshot.ts';

/** State captured just before the submit control is clicked. Small and serialisable: it has to
 *  survive a navigation, when the document that took it no longer exists. */
export interface SubmitBaseline {
  docId: string;
  url: string;
  /** Occurrences of the expected text outside the fields it was typed into. */
  expectCount: number;
  /** The same count for each submitted text, in the order they were given. */
  submittedCounts: number[];
  alerts: string[];
  statuses: string[];
  /** Values of the submitted fields, in order (null when a field is not a value control). */
  fieldValues: (string | null)[];
}

const ALERT_SELECTOR = '[role="alert"], [aria-live="assertive"]';
const STATUS_SELECTOR = '[role="status"], [aria-live="polite"], output';

function texts(doc: Document, selector: string): string[] {
  const found: string[] = [];
  for (const el of Array.from(doc.querySelectorAll(selector)).slice(0, 50)) {
    if (!isVisible(el)) continue;
    const text = clip(norm(ownText(el)), 160);
    if (text) found.push(text);
  }
  return found;
}

function count(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** Occurrences of the expected text on the page, not counting the fields it was entered into. */
function expectCount(doc: Document, fields: Element[], expectText: string | undefined): number {
  if (!expectText || !doc.body) return 0;
  const needle = norm(expectText).toLowerCase();
  let total = count(norm(visibleText(doc.body)).toLowerCase(), needle);
  for (const field of fields) {
    if (field.isConnected) total -= count(norm(ownText(field)).toLowerCase(), needle);
  }
  return Math.max(0, total);
}

function valueOf(el: Element): string | null {
  // An editor that takes the keyboard through an element of its own shows its text elsewhere.
  // That text is what it holds; the element itself is emptied after every key.
  const surface = editorSurface(el);
  if (surface) return norm((surface as HTMLElement).innerText ?? surface.textContent);
  const tag = el.localName;
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return (el as HTMLInputElement).value ?? '';
  if (el.getAttribute('contenteditable') !== null) return norm(el.textContent);
  return null;
}

/** Problems the browser's own form validation reports for the control's form, by field label. */
export function validationProblems(control: Element): string[] {
  const form = (control as HTMLButtonElement).form;
  if (!form || form.noValidate || typeof form.checkValidity !== 'function' || form.checkValidity()) return [];
  const problems: string[] = [];
  for (const el of Array.from(form.elements)) {
    const field = el as HTMLInputElement;
    if (typeof field.checkValidity !== 'function' || field.checkValidity()) continue;
    problems.push(`${accessibleName(field) || field.localName}: ${field.validationMessage || 'invalid'}`);
  }
  return problems.slice(0, 8);
}

/**
 * A fingerprint of what is about to be submitted (the control plus the values of its form and of
 * the given fields), for recognising an identical repeat. Only the hash leaves the page. Null
 * when there is no content to fingerprint.
 */
export function contentDigest(control: Element, fields: Element[], intended: (string | undefined)[] = []): string | null {
  const values: string[] = [];
  // `intended` is what a field is about to be filled with: the fingerprint is taken before
  // anything is typed, so an identical repeat is recognised without touching the page.
  const add = (el: Element, override?: string): void => {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'password' || type === 'hidden' || type === 'submit' || type === 'button') return;
    if (override !== undefined) {
      values.push((type === 'checkbox' || type === 'radio') ? String(/^(true|on|yes|checked|1)$/i.test(override.trim())) : override);
      return;
    }
    const value = (type === 'checkbox' || type === 'radio') ? String((el as HTMLInputElement).checked) : valueOf(el);
    if (value !== null) values.push(value);
  };
  fields.forEach((field, i) => add(field, intended[i]));
  const form = (control as HTMLButtonElement).form;
  if (form) Array.from(form.elements).filter((el) => !fields.includes(el)).forEach((el) => add(el));
  if (!values.some((v) => v && v !== 'false')) return null;
  const text = `${accessibleName(control)}\u0000${values.join('\u0000')}`;
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${hash.toString(16)}-${text.length}`;
}

/** What one field of a submission would send, cut short. */
export interface SentPreview {
  /** The field, as the page names it. */
  field: string;
  /** The beginning of its text. */
  text: string;
}

/**
 * The beginning of what a submission would send, field by field, for the user to read before
 * they allow it. Never a password or another credential, and never more than a few lines: this
 * goes to the extension's own prompt and nowhere else.
 */
export function submissionPreview(fields: Element[], intended: (string | undefined)[] = []): SentPreview[] {
  const preview: SentPreview[] = [];
  fields.forEach((field, i) => {
    const type = (field.getAttribute('type') || '').toLowerCase();
    if (isSensitiveField(field) || type === 'password' || type === 'hidden') return;
    const text = norm(intended[i] !== undefined ? intended[i] : valueOf(field));
    if (text) preview.push({ field: clip(accessibleName(field), 40), text: clip(text, 120) });
  });
  return preview.slice(0, 3);
}

/** Text values about to be submitted that are long enough to be recognised on the page afterwards. */
export function submittedTexts(control: Element, fields: Element[]): string[] {
  const texts = new Set<string>();
  const add = (el: Element): void => {
    const tag = el.localName;
    const type = (el.getAttribute('type') || '').toLowerCase();
    const textual = tag === 'textarea' || el.getAttribute('contenteditable') !== null
      || (tag === 'input' && ['', 'text', 'search', 'email', 'url', 'tel'].includes(type));
    if (!textual || isSensitiveField(el)) return;
    const value = norm(valueOf(el));
    if (value.length >= 4) texts.add(value);
  };
  fields.forEach(add);
  const form = (control as HTMLButtonElement).form;
  if (form) Array.from(form.elements).forEach(add);
  return [...texts].slice(0, 10);
}

export function captureBaseline(
  doc: Document, docId: string, fields: Element[], expectText: string | undefined, submitted: string[] = [],
): SubmitBaseline {
  return {
    docId,
    url: doc.location.href,
    expectCount: expectCount(doc, fields, expectText),
    submittedCounts: submitted.map((text) => expectCount(doc, fields, text)),
    alerts: texts(doc, ALERT_SELECTOR),
    statuses: texts(doc, STATUS_SELECTOR),
    fieldValues: fields.map(valueOf),
  };
}

/**
 * Compares the page with the baseline. `control` and `fields` are the original elements when this
 * is still the same document, and absent after a navigation.
 */
export function observeSubmission(
  doc: Document, docId: string, baseline: SubmitBaseline, expectText: string | undefined,
  control: Element | null, fields: Element[], submitted: string[] = [],
): SubmitSignals {
  const sameDocument = docId === baseline.docId;
  const before = new Set(baseline.alerts);
  const statusesBefore = new Set(baseline.statuses);
  const invalid: string[] = [];
  for (const el of Array.from(doc.querySelectorAll('[aria-invalid="true"]')).slice(0, 20)) {
    if (isVisible(el)) invalid.push(accessibleName(el) || el.localName);
  }
  const hadValues = baseline.fieldValues.some((v) => !!v);
  const nowValues = fields.map((f) => (f.isConnected ? valueOf(f) : ''));
  return {
    expectSeen: !!expectText && expectCount(doc, fields, expectText) > (sameDocument ? baseline.expectCount : 0),
    submittedSeen: submitted.some((text, i) =>
      expectCount(doc, fields, text) > (sameDocument ? baseline.submittedCounts?.[i] ?? 0 : 0)),
    newAlerts: texts(doc, ALERT_SELECTOR).filter((t) => !sameDocument || !before.has(t)),
    invalidFields: invalid,
    newStatuses: texts(doc, STATUS_SELECTOR).filter((t) => !sameDocument || !statusesBefore.has(t)),
    formGone: sameDocument && !!control && (!control.isConnected || !isVisible(control)),
    fieldsCleared: sameDocument && hadValues && fields.length > 0 && nowValues.every((v) => !v),
    urlChanged: doc.location.href !== baseline.url,
    documentChanged: !sameDocument,
  };
}

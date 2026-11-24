// Content script: injected on demand into the top frame of an authorized tab only.
// It answers a fixed set of operations from the background worker. There is no eval, no access to
// cookies or storage, and nothing here is reachable from page scripts (isolated world).

import { MAX_ROOTS, extractPage, type ExtractOptions, type LinkStyle, type RegionKind } from './extract.ts';
import {
  clickElement, describeClickTarget, describeKeyTarget, fill, foreignFramesInView, keyElement, press, scrollPage, takesText, unsavedFields, viewportCoverage,
  waitFor, waitForQuiet, type WaitCondition,
} from './interact.ts';
import { applyUpdate, mountNotice, noticeUpdateOf, noticeView, paintNotice, whenDrawn, type Notice, type NoticeMount } from './notice.ts';
import { redactText } from './redact.ts';
import { DomError, PageState, takeSnapshot } from './snapshot.ts';
import {
  captureBaseline, contentDigest, observeSubmission, submissionPreview, submittedTexts, validationProblems, type SubmitBaseline,
} from './submit.ts';

interface Request {
  bcmcp: 1;
  op: string;
  /** The origins the user authorized for the session; this document must be on one of them. */
  origins: string[];
  refBase?: number;
  /** Id of the running operation, so it can be cancelled. */
  opId?: string;
  [key: string]: unknown;
}

const LOADED = '__browserContextMcpLoaded';
const scope = globalThis as unknown as Record<string, unknown>;

/** Operations that can be told to stop waiting. */
const signals = new Map<string, { cancelled: boolean }>();
/** Elements and texts of submissions in flight, for observing the outcome while this document lives. */
/**
 * Submissions in progress. `by` says how the control submits: a click on it, or Enter in it when it
 * is a text box. `named` is false when the control is whatever had the keyboard, not a ref.
 */
const submissions = new Map<string, {
  control: Element; fields: Element[]; intended: (string | undefined)[]; submitted: string[]; by: 'click' | 'enter'; named: boolean;
}>();

function optionalRef(msg: Request, state: PageState): Element | undefined {
  return msg.ref === undefined || msg.ref === null ? undefined : state.registry.resolve(Number(msg.ref));
}

/** Several refs for one reading: a ref that is stale is reported in its place and does not fail the others. */
function optionalRefs(msg: Request, state: PageState): ExtractOptions['roots'] {
  if (!Array.isArray(msg.refs)) return undefined;
  // One more than is allowed, so that too many are refused and not silently dropped.
  return msg.refs.slice(0, MAX_ROOTS + 1).map((value) => {
    const ref = Number(value);
    try {
      return { ref, el: state.registry.resolve(ref) };
    } catch (e) {
      if (e instanceof DomError) return { ref, error: `${e.code}: ${e.message}` };
      throw e;
    }
  });
}

interface NavigationApi {
  currentEntry?: { index: number };
  entries(): { key: string }[];
  traverseTo(key: string): unknown;
}

/**
 * Moves one step through the tab's history, to an entry of this origin only.
 *
 * The Navigation API lists just this origin's contiguous entries, so the target is known to be
 * inside the authorized origin before anything moves; with no such entry the move is refused.
 * (The browser's own back button would not do: it skips entries that were opened without a user
 * gesture, which is every page an agent opened, and so can jump straight out of the origin.)
 */
function historyGo(direction: 'back' | 'forward'): { started: true } {
  const nav = (window as unknown as { navigation?: NavigationApi }).navigation;
  const index = nav?.currentEntry?.index;
  if (!nav || typeof index !== 'number') {
    // No Navigation API: the move cannot be checked first, only afterwards by the origin gate.
    if (direction === 'back') history.back();
    else history.forward();
    return { started: true };
  }
  const target = nav.entries()[index + (direction === 'back' ? -1 : 1)];
  if (!target) {
    throw new DomError('NAVIGATION_BLOCKED',
      `Going ${direction} would leave the authorized origin, or there is no ${direction === 'back' ? 'earlier' : 'later'} page in this tab.`);
  }
  void Promise.resolve(nav.traverseTo(target.key)).catch(() => undefined);
  return { started: true };
}

/** The notice in this page: what it holds, where it is drawn, and when it changes next by itself. */
let notice: Notice | null = null;
let noticeMount: NoticeMount | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Draws the notice as it is at this moment, and comes back when a line starts to fade or is gone.
 * The page keeps the time: the worker says what runs and what ended, and may be asleep by the
 * time a line has to go.
 */
function showNotice(): void {
  clearTimeout(noticeTimer);
  const view = noticeView(notice, Date.now());
  if (!view) {
    noticeMount?.host.remove();
    noticeMount = null;
    notice = null;
    return;
  }
  if (!noticeMount || !noticeMount.host.isConnected) {
    noticeMount = mountNotice(document, (event) => {
      // Only a real user click counts; a page cannot produce a trusted event.
      if (event.isTrusted) void chrome.runtime.sendMessage({ bcmcp: 'indicator-pause' });
    });
  }
  paintNotice(noticeMount, view);
  // A little late rather than early: a timer that fires before the moment would find nothing changed.
  if (view.next !== null) noticeTimer = setTimeout(showNotice, view.next + 20);
}

/** The element and key that the rules were last applied to, until that key is pressed. */
let keyChecked: { el: Element; key: string } | null = null;

async function handle(msg: Request, state: PageState): Promise<unknown> {
  if (!Array.isArray(msg.origins) || !msg.origins.includes(location.origin)) {
    throw new DomError('ORIGIN_MISMATCH', 'This document is not on an authorized origin.');
  }
  const registry = state.registry;
  if (typeof msg.refBase === 'number') registry.startAfter(msg.refBase);
  const ref = Number(msg.ref);
  switch (msg.op) {
    case 'ping':
      return {};
    case 'snapshot':
      return takeSnapshot(document, state, {
        interactiveOnly: msg.interactiveOnly === true,
        viewportOnly: msg.viewportOnly === true,
        diff: msg.diff === true,
        root: optionalRef(msg, state),
        maxLines: Number(msg.maxLines) || 250,
        startLine: Number(msg.startLine) || 0,
      });
    case 'extract':
      return extractPage(document, state, {
        maxChars: Number(msg.maxChars) || 12000,
        offset: Number(msg.offset) || 0,
        links: (['none', 'ref', 'url'].includes(String(msg.links)) ? msg.links : 'ref') as LinkStyle,
        outline: msg.outline === true,
        mainOnly: msg.mainOnly === true,
        root: optionalRef(msg, state),
        roots: optionalRefs(msg, state),
        find: typeof msg.find === 'string' ? msg.find : undefined,
        regex: msg.regex === true,
        contextLines: typeof msg.contextLines === 'number' ? Math.min(20, Math.max(0, Math.floor(msg.contextLines))) : undefined,
        maxMatches: typeof msg.maxMatches === 'number' ? Math.min(200, Math.max(1, Math.floor(msg.maxMatches))) : undefined,
        // One that is not known is refused there.
        kind: typeof msg.kind === 'string' ? msg.kind as RegionKind : undefined,
      });
    case 'describe':
      return describeClickTarget(registry.resolve(ref));
    case 'click':
      return clickElement(registry.resolve(ref));
    case 'fill':
      return await fill(registry.resolve(ref), String(msg.text ?? ''), msg.append === true, msg.method === 'type' ? 'type' : 'set');
    case 'key_describe': {
      const el = keyElement(document, optionalRef(msg, state) ?? null);
      keyChecked = { el, key: String(msg.key) };
      return describeKeyTarget(el, String(msg.key));
    }
    case 'press_key': {
      const target = optionalRef(msg, state) ?? null;
      const key = String(msg.key);
      // The rules were applied to one element, and the user may have been asked about it. If the
      // keyboard is somewhere else by now, they were not applied to the element the key would reach.
      const checked = keyChecked;
      keyChecked = null;
      if (!checked || checked.key !== key || checked.el !== keyElement(document, target)) {
        throw new DomError('STALE_REF',
          'The element that has the keyboard changed while the key press was being checked. Nothing was pressed. Take a new snapshot.');
      }
      return await press(document, target, key);
    }
    case 'scroll':
      return scrollPage(
        document,
        String(msg.direction ?? 'down'),
        typeof msg.amount === 'number' ? msg.amount : undefined,
        optionalRef(msg, state) ?? null,
        state);
    case 'coverage':
      return { text: viewportCoverage(document) };
    case 'frames':
      // For a screenshot: whether a picture of the tab would show a frame of another site.
      return { foreign: foreignFramesInView(document) };
    case 'quiet':
      return { ...(await waitForQuiet(document, 300, Math.min(Number(msg.maxMs) || 3000, 5000))), title: document.title };
    case 'unsaved':
      return { fields: unsavedFields(document) };
    case 'history_go':
      return historyGo(msg.direction === 'forward' ? 'forward' : 'back');
    case 'wait': {
      const signal = { cancelled: false };
      const opId = String(msg.opId ?? '');
      if (opId) signals.set(opId, signal);
      try {
        return await waitFor(document, registry, {
          text: typeof msg.text === 'string' ? msg.text : undefined,
          ref: msg.ref === undefined || msg.ref === null ? undefined : ref,
          condition: (['visible', 'gone', 'enabled', 'disabled', 'changed'].includes(String(msg.condition)) ? msg.condition : 'visible') as WaitCondition,
          timeoutMs: Number(msg.timeoutMs) || 5000,
          signal,
        });
      } finally {
        signals.delete(opId);
      }
    }
    case 'cancel': {
      const signal = signals.get(String(msg.opId ?? ''));
      if (signal) signal.cancelled = true;
      return { cancelled: !!signal };
    }
    case 'submit_prepare': {
      // Everything is resolved before anything is touched: a stale ref stops the whole submission.
      const named = msg.ref !== undefined && msg.ref !== null;
      const control = named ? registry.resolve(ref) : keyElement(document, null);
      const given = (Array.isArray(msg.fields) ? msg.fields : []) as { ref: unknown; text?: unknown }[];
      const fields = given.map((f) => registry.resolve(Number(f.ref)));
      const intended = given.map((f) => (typeof f.text === 'string' ? f.text : undefined));
      // A text box is submitted by Enter in it, anything else by a click on it.
      const by = msg.by === 'enter' || takesText(control) ? 'enter' : 'click';
      // What Enter sends is what the box holds: it belongs to the content, also when it is not filled here.
      if (by === 'enter' && !fields.includes(control)) {
        fields.push(control);
        intended.push(undefined);
      }
      submissions.set(String(msg.submissionId), { control, fields, intended, submitted: [], by, named });
      const key = describeKeyTarget(control, 'Enter');
      return {
        target: describeClickTarget(control),
        by,
        // For the question to the user: a field of a form, which Enter submits, or another text box.
        how: by === 'click' ? 'click' : key.submit === 'form' ? 'form' : 'enter',
        label: key.label,
        // Fingerprint of what would be submitted, taken before any field is touched.
        digest: contentDigest(control, fields, intended),
        // The beginning of it, for the question to the user.
        preview: submissionPreview(fields, intended),
      };
    }
    case 'submit_recheck': {
      // What the user was asked about is what is sent. The fingerprint was taken before they were
      // asked; if the content is another now (the page changed it, or someone typed), nothing is
      // sent. It is looked at before the agent's own texts are filled in: filling one field can
      // change another, as one choice of a group unchecks the others.
      const entry = submissions.get(String(msg.submissionId));
      if (!entry) throw new DomError('STALE_REF', 'The page changed while the submission was being prepared. Take a new snapshot.');
      if (typeof msg.digest === 'string' && contentDigest(entry.control, entry.fields, entry.intended) !== msg.digest) {
        submissions.delete(String(msg.submissionId));
        throw new DomError('APPROVAL_STALE',
          'What would be submitted changed after it was checked and the user was asked. Nothing was sent. Take a new snapshot and submit again; the user is asked again.');
      }
      return {};
    }
    case 'submit_baseline': {
      const entry = submissions.get(String(msg.submissionId));
      if (!entry) throw new DomError('STALE_REF', 'The page changed while the submission was being prepared. Take a new snapshot.');
      const problems = validationProblems(entry.control);
      const expectText = typeof msg.expectText === 'string' ? msg.expectText : undefined;
      // What is about to be sent stays in the page; only how often it already shows is kept.
      entry.submitted = submittedTexts(entry.control, entry.fields);
      return { problems, baseline: captureBaseline(document, state.docId, entry.fields, expectText, entry.submitted) };
    }
    case 'submit_fire': {
      const entry = submissions.get(String(msg.submissionId));
      if (!entry) throw new DomError('STALE_REF', 'The page changed while the submission was being prepared. Take a new snapshot.');
      if (entry.by === 'enter') {
        // The rules were applied to one element, and the user was asked about it. If the keyboard
        // is somewhere else by now, the key would reach an element they were not applied to.
        if (!entry.named && keyElement(document, null) !== entry.control) {
          throw new DomError('STALE_REF',
            'The element that has the keyboard changed while the key press was being checked. Nothing was pressed. Take a new snapshot.');
        }
        return await press(document, entry.named ? entry.control : null, 'Enter');
      }
      return clickElement(registry.resolve(ref));
    }
    case 'submit_observe': {
      const entry = submissions.get(String(msg.submissionId));
      return observeSubmission(
        document, state.docId, msg.baseline as SubmitBaseline,
        typeof msg.expectText === 'string' ? msg.expectText : undefined,
        entry?.control ?? null, entry?.fields ?? [],
        // After a navigation the page no longer knows what was typed; the agent's own texts still do.
        entry?.submitted ?? (Array.isArray(msg.submitted) ? msg.submitted.map(String) : []));
    }
    case 'submit_done':
      submissions.delete(String(msg.submissionId));
      return {};
    case 'indicator': {
      const shown = noticeMount !== null;
      notice = applyUpdate(notice, noticeUpdateOf(msg), Date.now());
      showNotice();
      // `off` answers when the notice is out of the picture, and not only out of the page: a
      // screenshot waits for exactly this answer, and captures what the browser drew last.
      if (shown && noticeMount === null) await whenDrawn(window as never);
      return {};
    }
    default:
      throw new DomError('UNSUPPORTED_ACTION', `Unsupported page operation "${msg.op}".`);
  }
}

/** A result with its text freed of what looks like a credential. */
function withoutSecrets(result: unknown): unknown {
  if (typeof result !== 'object' || result === null) return result;
  const text = (result as { text?: unknown }).text;
  return typeof text === 'string' ? { ...result, text: redactText(text) } : result;
}

if (!scope[LOADED]) {
  scope[LOADED] = true;
  const state = new PageState();
  chrome.runtime.onMessage.addListener((msg: Request, sender, sendResponse) => {
    if (!msg || msg.bcmcp !== 1 || sender.id !== chrome.runtime.id) return false;
    const reply = (body: object): void => sendResponse({
      ...body, highestRef: state.registry.highest, docId: state.docId, generation: state.generation, url: location.href,
    });
    handle(msg, state).then(
      // What a snapshot or an extract says goes to the agent: what looks like a credential is taken out here, before it leaves the page.
      (result) => reply({ ok: true, result: msg.op === 'snapshot' || msg.op === 'extract' ? withoutSecrets(result) : result }),
      (err: unknown) => reply(err instanceof DomError
        ? { ok: false, code: err.code, message: err.message }
        : { ok: false, code: 'PAGE_ERROR', message: `The page operation failed: ${err instanceof Error ? err.message : String(err)}` }),
    );
    return true;
  });
}

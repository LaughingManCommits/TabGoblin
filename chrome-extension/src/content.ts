// Content script: injected on demand into the top frame of an authorized tab only.
// It answers a fixed set of operations from the background worker. There is no eval, no access to
// cookies or storage, and nothing here is reachable from page scripts (isolated world).

import { extractPage, type LinkStyle } from './extract.ts';
import {
  clickElement, describeClickTarget, describeKeyTarget, fill, press, scrollPage, viewportCoverage, waitFor,
  type WaitCondition,
} from './interact.ts';
import { DomError, PageState, takeSnapshot } from './snapshot.ts';
import {
  captureBaseline, contentDigest, observeSubmission, submittedTexts, validationProblems, type SubmitBaseline,
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
const INDICATOR_TAG = 'bcmcp-indicator';
const scope = globalThis as unknown as Record<string, unknown>;

/** Operations that can be told to stop waiting. */
const signals = new Map<string, { cancelled: boolean }>();
/** Elements and texts of submissions in flight, for observing the outcome while this document lives. */
const submissions = new Map<string, { control: Element; fields: Element[]; submitted: string[] }>();

function optionalRef(msg: Request, state: PageState): Element | undefined {
  return msg.ref === undefined || msg.ref === null ? undefined : state.registry.resolve(Number(msg.ref));
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

let indicator: { host: HTMLElement; label: HTMLElement } | null = null;

/** Small, non-interactive-by-default marker that an agent is operating this tab. */
function showIndicator(text: string | null): void {
  if (!text) {
    indicator?.host.remove();
    indicator = null;
    return;
  }
  if (!indicator || !indicator.host.isConnected) {
    const host = document.createElement(INDICATOR_TAG);
    // Closed shadow root: page scripts cannot read or restyle what is inside.
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = ':host{all:initial;position:fixed;right:12px;bottom:12px;z-index:2147483647;pointer-events:none}'
      // TabGoblin theme: dark cave pill, goblin-green dot.
      + '.pill{display:flex;align-items:center;gap:8px;padding:5px 6px 5px 11px;border-radius:999px;background:#12201a;'
      + 'color:#e6f0e9;border:1px solid #2a3a31;font:600 12px/1.3 system-ui,"Segoe UI",sans-serif;'
      + 'box-shadow:0 4px 14px rgba(0,0,0,.35)}'
      + '.dot{width:8px;height:8px;border-radius:50%;background:#63d68f;box-shadow:0 0 0 3px rgba(99,214,143,.22)}'
      + 'button{pointer-events:auto;font:inherit;color:#e6f0e9;background:#1e2a23;border:1px solid #2a3a31;'
      + 'border-radius:999px;padding:2px 10px;cursor:pointer}'
      + 'button:hover{background:#273830}';
    const pill = document.createElement('div');
    pill.className = 'pill';
    const dot = document.createElement('span');
    dot.className = 'dot';
    const label = document.createElement('span');
    const pause = document.createElement('button');
    pause.textContent = 'Pause';
    pause.addEventListener('click', (event) => {
      // Only a real user click counts; a page cannot produce a trusted event.
      if (event.isTrusted) void chrome.runtime.sendMessage({ bcmcp: 'indicator-pause' });
    });
    pill.append(dot, label, pause);
    root.append(style, pill);
    document.documentElement.append(host);
    indicator = { host, label };
  }
  indicator.label.textContent = text;
}

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
      });
    case 'describe':
      return describeClickTarget(registry.resolve(ref));
    case 'click':
      return clickElement(registry.resolve(ref));
    case 'fill':
      return await fill(registry.resolve(ref), String(msg.text ?? ''), msg.append === true, msg.method === 'type' ? 'type' : 'set');
    case 'key_describe':
      return describeKeyTarget(optionalRef(msg, state) ?? document.activeElement ?? document.body, String(msg.key));
    case 'press_key':
      return await press(document, optionalRef(msg, state) ?? null, String(msg.key));
    case 'scroll':
      return scrollPage(
        document,
        String(msg.direction ?? 'down'),
        typeof msg.amount === 'number' ? msg.amount : undefined,
        optionalRef(msg, state) ?? null,
        state);
    case 'coverage':
      return { text: viewportCoverage(document) };
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
          condition: (['visible', 'gone', 'enabled', 'disabled'].includes(String(msg.condition)) ? msg.condition : 'visible') as WaitCondition,
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
      const control = registry.resolve(ref);
      const given = (Array.isArray(msg.fields) ? msg.fields : []) as { ref: unknown; text?: unknown }[];
      const fields = given.map((f) => registry.resolve(Number(f.ref)));
      submissions.set(String(msg.submissionId), { control, fields, submitted: [] });
      return {
        target: describeClickTarget(control),
        // Fingerprint of what would be submitted, taken before any field is touched.
        digest: contentDigest(control, fields, given.map((f) => (typeof f.text === 'string' ? f.text : undefined))),
      };
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
    case 'indicator':
      showIndicator(typeof msg.text === 'string' ? msg.text : null);
      return {};
    default:
      throw new DomError('UNSUPPORTED_ACTION', `Unsupported page operation "${msg.op}".`);
  }
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
      (result) => reply({ ok: true, result }),
      (err: unknown) => reply(err instanceof DomError
        ? { ok: false, code: err.code, message: err.message }
        : { ok: false, code: 'PAGE_ERROR', message: `The page operation failed: ${err instanceof Error ? err.message : String(err)}` }),
    );
    return true;
  });
}

// Content script: injected on demand into the top frame of the authorized tab only.
// It answers a fixed set of operations from the background worker. There is no eval, no access to
// cookies or storage, and nothing here is reachable from page scripts (isolated world).

import { clickElement, describeClickTarget, fillElement, scrollPage, viewportCoverage, waitFor } from './interact.ts';
import { DomError, RefRegistry, extractPage, takeSnapshot } from './snapshot.ts';

interface Request {
  bcmcp: 1;
  op: string;
  /** The origin the user authorized; this document must match it exactly. */
  origin: string;
  refBase?: number;
  [key: string]: unknown;
}

const LOADED = '__browserContextMcpLoaded';
const scope = globalThis as unknown as Record<string, unknown>;

async function handle(msg: Request, registry: RefRegistry): Promise<unknown> {
  if (location.origin !== msg.origin) {
    throw new DomError('ORIGIN_MISMATCH', 'This document is not on the authorized origin.');
  }
  if (typeof msg.refBase === 'number') registry.startAfter(msg.refBase);
  const ref = Number(msg.ref);
  switch (msg.op) {
    case 'ping':
      return {};
    case 'snapshot':
      return takeSnapshot(document, registry, {
        interactiveOnly: msg.interactiveOnly === true,
        viewportOnly: msg.viewportOnly === true,
      });
    case 'extract':
      return extractPage(document, Number(msg.maxChars) || 20000, Number(msg.offset) || 0);
    case 'describe':
      return describeClickTarget(registry.resolve(ref));
    case 'click':
      return clickElement(registry.resolve(ref));
    case 'fill':
      return fillElement(registry.resolve(ref), String(msg.text ?? ''), msg.append === true);
    case 'scroll':
      return scrollPage(
        document,
        String(msg.direction ?? 'down'),
        typeof msg.amount === 'number' ? msg.amount : undefined,
        msg.ref === undefined || msg.ref === null ? null : registry.resolve(ref));
    case 'coverage':
      return { text: viewportCoverage(document) };
    case 'wait':
      return waitFor(document, registry, {
        text: typeof msg.text === 'string' ? msg.text : undefined,
        ref: msg.ref === undefined || msg.ref === null ? undefined : ref,
        gone: msg.gone === true,
        timeoutMs: Number(msg.timeoutMs) || 5000,
      });
    default:
      throw new DomError('UNSUPPORTED_ACTION', `Unsupported page operation "${msg.op}".`);
  }
}

if (!scope[LOADED]) {
  scope[LOADED] = true;
  const registry = new RefRegistry();
  chrome.runtime.onMessage.addListener((msg: Request, sender, sendResponse) => {
    if (!msg || msg.bcmcp !== 1 || sender.id !== chrome.runtime.id) return false;
    handle(msg, registry).then(
      (result) => sendResponse({ ok: true, result, highestRef: registry.highest }),
      (err: unknown) => sendResponse(err instanceof DomError
        ? { ok: false, code: err.code, message: err.message }
        : { ok: false, code: 'PAGE_ERROR', message: `The page operation failed: ${err instanceof Error ? err.message : String(err)}` }),
    );
    return true;
  });
}

// Must be imported first, before React / @testing-library/react / any app
// module — it installs the DOM globals and the fetch indirection shim that
// everything else in a runtime test depends on.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://app.test/",
});

// Test-harness globals — deliberately loose typing (`as any`), this file
// never ships to the app bundle.
globalThis.window = dom.window as never;
globalThis.document = dom.window.document as never;
// Real browsers alias `self` to `window` — `next/link`'s viewport-prefetch
// logic (`use-intersection.tsx`) reads `self.requestIdleCallback` directly,
// which throws under plain Node without this.
globalThis.self = dom.window as never;
// Node 21+ ships its own read-only `navigator` global — redefine it instead of assigning.
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
globalThis.localStorage = dom.window.localStorage as never;
globalThis.sessionStorage = dom.window.sessionStorage as never;
globalThis.HTMLElement = dom.window.HTMLElement as never;
globalThis.Node = dom.window.Node as never;
globalThis.Element = dom.window.Element as never;
// Radix components (`FocusScope`, `Switch`, …) do `instanceof
// HTMLInputElement`/`HTMLFormElement` checks against real elements from
// this same jsdom — those only pass if these globals point at jsdom's
// classes rather than being left undefined.
globalThis.HTMLInputElement = dom.window.HTMLInputElement as never;
globalThis.HTMLSelectElement = dom.window.HTMLSelectElement as never;
globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement as never;
globalThis.HTMLButtonElement = dom.window.HTMLButtonElement as never;
globalThis.HTMLAnchorElement = dom.window.HTMLAnchorElement as never;
globalThis.HTMLFormElement = dom.window.HTMLFormElement as never;
// Radix's Dialog focus trap (`FocusScope`) watches DOM mutations directly.
globalThis.MutationObserver = dom.window.MutationObserver as never;
// Radix's `useSize` (used by `Checkbox`/`Switch` to track their bubble
// input's box) calls `new ResizeObserver(...)` on mount — jsdom has no
// native implementation, so without this stub any component using those
// primitives throws `ResizeObserver is not defined` during the layout
// effect. This no-op stub is enough: runtime tests never assert on layout
// dimensions, only on rendered text/roles/attributes.
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = NoopResizeObserver as never;
// Radix's DismissableLayer/FocusScope build a `CustomEvent` and dispatch it
// on a jsdom node. Node has its own native `Event`/`CustomEvent` globals
// distinct from jsdom's — without redirecting them to jsdom's classes,
// `element.dispatchEvent(new CustomEvent(...))` throws "parameter 1 is not
// of type 'Event'" because jsdom's `dispatchEvent` only accepts instances
// of its own `Event`.
globalThis.Event = dom.window.Event as never;
globalThis.CustomEvent = dom.window.CustomEvent as never;
// `FocusScope` walks tabbable candidates with a `TreeWalker` filtered by
// `NodeFilter.SHOW_ELEMENT`/`FILTER_ACCEPT` constants.
globalThis.NodeFilter = dom.window.NodeFilter as never;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(
  dom.window,
) as never;
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
  setTimeout(cb, 0)) as never;
globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as never;
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

process.env.NEXT_PUBLIC_KERNEL_API_URL ??= "https://kernel.test/api/kernel/v1";

export type FetchHandler = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

// openapi-fetch (via http-client.ts) resolves `globalThis.fetch` once, at
// `createClient()` time — install this indirection *before* any app module
// is imported, so every runtime test can swap the handler afterward.
let handler: FetchHandler = async () => {
  throw new Error("no fetch handler installed for this runtime test");
};
globalThis.fetch = ((...args: Parameters<FetchHandler>) =>
  handler(...args)) as typeof fetch;

/** Replace the fetch handler used by every Kernel/BFF call for the rest of this test. */
export function setFetchHandler(fn: FetchHandler): void {
  handler = fn;
}

/** Reads the raw URL from either a string or a Request, without constructing
 * a `Request` from a relative path (which throws under Node without a
 * document base). */
export function rawUrl(input: string | Request): string {
  return typeof input === "string" ? input : input.url;
}

export async function asRequest(
  input: string | Request,
  init?: RequestInit,
): Promise<Request> {
  return input instanceof Request ? input : new Request(input, init);
}

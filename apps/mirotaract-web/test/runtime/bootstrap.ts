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
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window) as never;
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
  setTimeout(cb, 0)) as never;
globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as never;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

process.env.NEXT_PUBLIC_KERNEL_API_URL ??= "https://kernel.test/api/kernel/v1";

export type FetchHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

// openapi-fetch (via http-client.ts) resolves `globalThis.fetch` once, at
// `createClient()` time — install this indirection *before* any app module
// is imported, so every runtime test can swap the handler afterward.
let handler: FetchHandler = async () => {
  throw new Error("no fetch handler installed for this runtime test");
};
globalThis.fetch = ((...args: Parameters<FetchHandler>) => handler(...args)) as typeof fetch;

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

export async function asRequest(input: string | Request, init?: RequestInit): Promise<Request> {
  return input instanceof Request ? input : new Request(input, init);
}

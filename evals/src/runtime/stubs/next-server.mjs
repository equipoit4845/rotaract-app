// Minimal stand-in for `next/server` so route handlers run under plain Node.
export class NextResponse extends Response {
  static json(body, init) {
    return Response.json(body, init);
  }
  static redirect(url, status = 307) {
    return Response.redirect(url, status);
  }
}
export const NextRequest = Request;
export function after(fn) {
  queueMicrotask(() => Promise.resolve().then(fn).catch(() => {}));
}

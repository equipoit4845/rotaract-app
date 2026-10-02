/**
 * Incremental Server-Sent Events parser (WHATWG HTML §9.2.6): feed it text
 * chunks, it calls `onEvent({ event, data, id, retry })` per dispatched
 * event. Comments (`: ping`) are ignored.
 */
export class SseParser {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.buffer = "";
    this.reset();
    this.lastEventId = undefined;
  }

  reset() {
    this.event = "";
    this.data = [];
    this.id = undefined;
    this.retry = undefined;
  }

  push(chunk) {
    this.buffer += chunk;
    let index;
    while ((index = this.buffer.search(/\r\n|\r|\n/)) >= 0) {
      const line = this.buffer.slice(0, index);
      const newline = this.buffer.startsWith("\r\n", index) ? 2 : 1;
      // A lone \r at the very end might be the first half of \r\n.
      if (this.buffer[index] === "\r" && index + 1 === this.buffer.length)
        break;
      this.buffer = this.buffer.slice(index + newline);
      this.line(line);
    }
  }

  line(line) {
    if (line === "") {
      this.dispatch();
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (field) {
      case "event":
        this.event = value;
        break;
      case "data":
        this.data.push(value);
        break;
      case "id":
        if (!value.includes("\0")) this.id = value;
        break;
      case "retry":
        if (/^\d+$/.test(value)) this.retry = Number(value);
        break;
      default:
        break;
    }
  }

  dispatch() {
    if (this.id !== undefined) this.lastEventId = this.id;
    const hasData = this.data.length > 0;
    const event = {
      event: this.event || "message",
      data: this.data.join("\n"),
      id: this.lastEventId,
      retry: this.retry,
    };
    this.reset();
    if (hasData || event.retry !== undefined) this.onEvent(event);
  }
}

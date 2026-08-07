import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const [spec, events] = await Promise.all([
  readFile(new URL("kernel-spec.md", root), "utf8"),
  readFile(new URL("kernel-events-contract.md", root), "utf8"),
]);
const eventPattern = /kernel\.[a-z0-9-]+(?:\.[a-z0-9-]+)+\.v\d+/g;
const required = new Set(spec.match(eventPattern) ?? []);
const documented = new Set(events.match(eventPattern) ?? []);
const missing = [...required].filter((event) => !documented.has(event));
if (missing.length)
  throw new Error(`Undocumented kernel events: ${missing.join(", ")}`);
const sourceRoot = new URL("../apps/institutional-kernel-api/src/", import.meta.url).pathname;
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
}
const source = await Promise.all((await files(sourceRoot)).filter(file => file.endsWith(".ts")).map(file => readFile(file, "utf8")));
const emitted = new Set(source.flatMap(value => value.match(eventPattern) ?? []));
const unknown = [...emitted].filter(event => !documented.has(event));
if (unknown.length) throw new Error(`Kernel source emits undocumented events: ${unknown.join(", ")}`);
console.log(`Event contract is compatible (${required.size} event types; ${emitted.size} emitted by source)`);

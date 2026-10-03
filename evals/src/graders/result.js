export const pass = (...details) => ({
  status: "pass",
  details: details.flat().filter(Boolean),
});
export const fail = (...details) => ({
  status: "fail",
  details: details.flat().filter(Boolean),
});
export const skip = (reason) => ({ status: "skip", details: [reason] });

/** `path:line` of an offset (1-based line). */
export function at(file, index) {
  return `${file.path}:${file.content.slice(0, Math.max(0, index)).split("\n").length}`;
}

export function lineOf(file, node, sf) {
  return `${file.path}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
}

export const TOKENISH =
  /token|jwt|id_?token|access|refresh|session|credential|bearer|auth/i;

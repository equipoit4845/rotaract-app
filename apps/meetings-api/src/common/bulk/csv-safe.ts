const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export function neutralizeCsvFormula(value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return value;
  if (FORMULA_PREFIXES.some((p) => value.startsWith(p))) {
    return `'${value}`;
  }
  return value;
}

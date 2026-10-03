/** TypeScript/JavaScript AST helpers for the graders. */
import ts from "typescript";

const cache = new Map();

export function parse(file) {
  const key = `${file.path}\u0000${file.content}`;
  if (!cache.has(key))
    cache.set(
      key,
      ts.createSourceFile(
        file.path,
        file.content,
        ts.ScriptTarget.Latest,
        true,
        file.path.endsWith("x")
          ? ts.ScriptKind.TSX
          : file.lang === "js"
            ? ts.ScriptKind.JS
            : ts.ScriptKind.TS,
      ),
    );
  return cache.get(key);
}

export function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/** Dotted text of a callee: `console.log`, `localStorage.setItem`, `jwtVerify`. */
export function calleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    const left = calleeName(expr.expression);
    return left ? `${left}.${expr.name.text}` : expr.name.text;
  }
  if (
    ts.isElementAccessExpression(expr) &&
    ts.isStringLiteralLike(expr.argumentExpression)
  ) {
    const left = calleeName(expr.expression);
    return left
      ? `${left}.${expr.argumentExpression.text}`
      : expr.argumentExpression.text;
  }
  if (ts.isCallExpression(expr)) return calleeName(expr.expression);
  if (expr.kind === ts.SyntaxKind.ThisKeyword) return "this";
  if (
    ts.isParenthesizedExpression(expr) ||
    ts.isNonNullExpression?.(expr) ||
    ts.isAsExpression?.(expr)
  )
    return calleeName(expr.expression);
  return null;
}

/** Every call: { name, node, args: [text], sf }. */
export function calls(file) {
  const sf = parse(file);
  const out = [];
  walk(sf, (node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const name = node.expression ? calleeName(node.expression) : null;
      out.push({
        name,
        node,
        args: (node.arguments ?? []).map((a) => a.getText(sf)),
        sf,
      });
    }
  });
  return out;
}

/** Module specifiers imported (static and dynamic) with the imported names. */
export function imports(file) {
  const sf = parse(file);
  const out = [];
  walk(sf, (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const names = [];
      const clause = node.importClause;
      if (clause?.name) names.push(clause.name.text);
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings))
        for (const el of clause.namedBindings.elements)
          names.push(el.name.text);
      out.push({ from: node.moduleSpecifier.text, names });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      out.push({ from: node.arguments[0].text, names: ["*"] });
    }
  });
  return out;
}

/** Properties of an object literal argument: { key: initializerText }. */
export function objectProps(node, sf) {
  if (!node || !ts.isObjectLiteralExpression(node)) return null;
  const props = {};
  for (const p of node.properties) {
    if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
      const key =
        p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name))
          ? p.name.text
          : p.name?.getText(sf);
      props[key] = ts.isPropertyAssignment(p) ? p.initializer.getText(sf) : key;
    }
  }
  return props;
}

export { ts };

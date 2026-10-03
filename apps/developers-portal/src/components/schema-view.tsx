import type { SchemaNode } from "@/lib/openapi";

function NodeRow({ node }: { node: SchemaNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-1.5">
      {node.name ? (
        <code className="font-mono text-[13px] font-semibold text-foreground">
          {node.name}
        </code>
      ) : null}
      <span className="font-mono text-xs text-primary">{node.type}</span>
      {node.required ? (
        <span className="text-[10px] font-semibold uppercase text-destructive">
          obligatorio
        </span>
      ) : null}
      {node.nullable ? (
        <span className="text-[10px] uppercase text-muted-foreground">
          null
        </span>
      ) : null}
      {node.description ? (
        <span className="basis-full text-xs text-muted-foreground">
          {node.description}
        </span>
      ) : null}
      {node.enumValues ? (
        <span className="basis-full text-xs text-muted-foreground">
          Valores:{" "}
          {node.enumValues.map((value, index) => (
            <span key={value}>
              {index > 0 ? ", " : ""}
              <code className="rounded bg-muted px-1 font-mono">{value}</code>
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** A JSON Schema as a nested, collapsible field list. */
export function SchemaView({
  node,
  depth = 0,
}: {
  node: SchemaNode;
  depth?: number;
}) {
  if (!node.children?.length)
    return depth === 0 ? (
      <div className="rounded-lg border border-border px-3">
        <NodeRow node={node} />
      </div>
    ) : (
      <NodeRow node={node} />
    );
  const list = (
    <div className={depth === 0 ? "" : "ml-3 border-l border-border pl-3"}>
      {node.children.map((child, index) => (
        <SchemaView
          key={`${child.name}-${index}`}
          node={child}
          depth={depth + 1}
        />
      ))}
    </div>
  );
  if (depth === 0)
    return (
      <div className="rounded-lg border border-border px-3 py-1">
        {node.ref ? (
          <p className="pt-1 font-mono text-xs text-muted-foreground">
            {node.ref}
          </p>
        ) : null}
        {list}
      </div>
    );
  return (
    <details open={depth < 2}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <NodeRow node={node} />
      </summary>
      {list}
    </details>
  );
}

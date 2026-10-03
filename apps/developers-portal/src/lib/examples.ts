import { PRODUCTION_API } from "./site";
import { exampleFor, type Operation } from "./openapi";

export type Example = {
  id: "curl" | "ts" | "python";
  label: string;
  code: string;
  note?: string;
};

const snake = (name: string) =>
  name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const upperSnake = (name: string) => snake(name).toUpperCase();

function bodyExample(operation: Operation): unknown {
  return operation.requestBody?.schema
    ? exampleFor(operation.requestBody.schema)
    : undefined;
}

function isForm(operation: Operation): boolean {
  return (
    operation.requestBody?.contentType === "application/x-www-form-urlencoded"
  );
}

function requiredHeader(operation: Operation, name: string): boolean {
  return operation.parameters.some(
    (parameter) =>
      parameter.in === "header" &&
      parameter.name.toLowerCase() === name.toLowerCase() &&
      parameter.required,
  );
}

function requiredQuery(operation: Operation) {
  return operation.parameters.filter(
    (parameter) => parameter.in === "query" && parameter.required,
  );
}

function pathWith(
  operation: Operation,
  style: "shell" | "ts" | "python",
): string {
  return operation.path.replace(/\{([^}]+)\}/g, (_match, name: string) =>
    style === "shell"
      ? `$${upperSnake(name)}`
      : style === "ts"
        ? `\${${name}}`
        : `{${snake(name)}}`,
  );
}

function pretty(value: unknown, indent = 2): string {
  return JSON.stringify(value, null, indent);
}

// --- curl -------------------------------------------------------------------

function curl(operation: Operation): string {
  const lines = [
    `curl -sS -X ${operation.method} "$API${pathWith(operation, "shell")}`,
  ];
  const query = requiredQuery(operation);
  if (query.length)
    lines[0] += `?${query.map((parameter) => `${parameter.name}=$${upperSnake(parameter.name)}`).join("&")}`;
  lines[0] += '"';
  const auth = operation.auth;
  if (auth.includes("client"))
    lines.push('  -u "$MIROTARACT_CLIENT_ID:$MIROTARACT_CLIENT_SECRET"');
  else if (auth.includes("service"))
    lines.push('  -H "Authorization: Bearer $SERVICE_TOKEN"');
  else if (auth.includes("oidc"))
    lines.push('  -H "Authorization: Bearer $ACCESS_TOKEN"');
  else if (auth.includes("user"))
    lines.push('  -H "Authorization: Bearer $SESSION_TOKEN"');
  if (requiredHeader(operation, "Idempotency-Key"))
    lines.push('  -H "Idempotency-Key: $(uuidgen)"');
  lines.push('  -H "X-Correlation-Id: mi-app-$(date +%s)"');
  const body = bodyExample(operation);
  if (body !== undefined) {
    if (isForm(operation)) {
      for (const [key, value] of Object.entries(
        (body as Record<string, unknown>) ?? {},
      ))
        if (key !== "client_id" && key !== "client_secret")
          lines.push(`  -d ${key}=${String(value)}`);
    } else {
      lines.push('  -H "Content-Type: application/json"');
      lines.push(`  -d '${JSON.stringify(body)}'`);
    }
  }
  return [`API=${PRODUCTION_API}`, lines.join(" \\\n")].join("\n");
}

// --- SDK mappings --------------------------------------------------------------

type SdkCall = { ts: string; python: string };

const SERVICE_CALLS: Record<string, SdkCall> = {
  serviceListOrganizations: {
    ts: `for await (const club of client.clubs.list({ type: "CLUB", limit: 100 })) {\n  console.log(club.name);\n}`,
    python: `for club in client.clubs.list(type="CLUB", limit=100):\n    print(club["name"])`,
  },
  serviceGetOrganization: {
    ts: "const club = await client.clubs.get(organizationId);",
    python: "club = client.clubs.get(organization_id)",
  },
  serviceListMembers: {
    ts: `for await (const member of client.members.list(organizationId, { status: "ACTIVE" })) {\n  console.log(member.person.displayName);\n}`,
    python: `for member in client.members.list(organization_id, status="ACTIVE"):\n    print(member["person"]["displayName"])`,
  },
  serviceListAuthorities: {
    ts: "const authorities = await client.authorities.list(organizationId, { includeDescendants: true });",
    python:
      "authorities = client.authorities.list(organization_id, include_descendants=True)",
  },
  serviceListPeriods: {
    ts: "const periods = await client.periods.list(organizationId);",
    python: "periods = client.periods.list(organization_id)",
  },
  serviceBatchPersons: {
    ts: "const persons = await client.persons.batch([personId]);",
    python: "persons = client.persons.batch([person_id])",
  },
  servicePersonMemberships: {
    ts: "const memberships = await client.persons.memberships(personId);",
    python: "memberships = client.persons.memberships(person_id)",
  },
  serviceGetPerson: {
    ts: "const person = await client.persons.get(personId);",
    python: "person = client.persons.get(person_id)",
  },
  serviceCheckAuthorization: {
    ts: `const decision = await client.permissions.check({\n  personId,\n  permission: "kernel.membership.read",\n  organizationId,\n});`,
    python: `decision = client.permissions.check(\n    person_id=person_id,\n    permission="kernel.membership.read",\n    organization_id=organization_id,\n)`,
  },
  serviceBatchCheckAuthorization: {
    ts: `const decisions = await client.permissions.checkMany([\n  { personId, permission: "kernel.membership.read", organizationId },\n]);`,
    python: `decisions = client.permissions.check_many([\n    {"personId": person_id, "permission": "kernel.membership.read", "organizationId": organization_id},\n])`,
  },
};

const TS_CLIENT = `import { MiRotaract } from "@mirotaract/sdk";

const client = new MiRotaract({
  baseUrl: "${PRODUCTION_API}",
  clientId: process.env.MIROTARACT_CLIENT_ID!,
  clientSecret: process.env.MIROTARACT_CLIENT_SECRET!, // solo en el servidor
});`;

const PY_CLIENT = `import os
from mirotaract import MiRotaract

client = MiRotaract(
    "${PRODUCTION_API}",
    os.environ["MIROTARACT_CLIENT_ID"],
    os.environ["MIROTARACT_CLIENT_SECRET"],  # solo en el servidor
)`;

const TS_AUTH = `import { MiRotaractAuth } from "@mirotaract/sdk";

const auth = new MiRotaractAuth({
  issuer: "${PRODUCTION_API}",
  clientId: process.env.MIROTARACT_CLIENT_ID!,
  clientSecret: process.env.MIROTARACT_CLIENT_SECRET, // omitilo en apps PUBLIC
  redirectUri: "https://mi-app.example.org/auth/callback",
});`;

const PY_AUTH = `import os
from mirotaract import MiRotaractAuth

auth = MiRotaractAuth(
    "${PRODUCTION_API}",
    os.environ["MIROTARACT_CLIENT_ID"],
    "https://mi-app.example.org/auth/callback",
    client_secret=os.environ.get("MIROTARACT_CLIENT_SECRET"),  # omitilo en apps PUBLIC
)`;

function pathVariables(operation: Operation, style: "ts" | "python"): string {
  const names = [...operation.path.matchAll(/\{([^}]+)\}/g)].map(
    (match) => match[1],
  );
  if (!names.length) return "";
  return (
    names
      .map((name) =>
        style === "ts" ? `const ${name} = "…";` : `${snake(name)} = "…"`,
      )
      .join("\n") + "\n"
  );
}

function genericService(operation: Operation): SdkCall {
  const body = bodyExample(operation);
  const query = requiredQuery(operation);
  const tsArgs = [
    `method: "${operation.method}"`,
    `path: \`${pathWith(operation, "ts")}\``,
    query.length
      ? `query: { ${query.map((p) => `${p.name}: "…"`).join(", ")} }`
      : "",
    body !== undefined ? `json: ${pretty(body).replace(/\n/g, "\n  ")}` : "",
  ].filter(Boolean);
  const pyArgs = [
    `"${operation.method}"`,
    `f"${pathWith(operation, "python")}"`,
    query.length
      ? `params={${query.map((p) => `"${p.name}": "…"`).join(", ")}}`
      : "",
    body !== undefined
      ? `json=${pretty(body, 4).replace(/\n/g, "\n    ")}`
      : "",
  ].filter(Boolean);
  return {
    ts: `const response = await client.request({\n  ${tsArgs.join(",\n  ")},\n});\nconsole.log(response.data);`,
    python: `response = client.request(${pyArgs.join(", ")})\nprint(response.data)`,
  };
}

const OAUTH_CALLS: Record<string, SdkCall & { client?: boolean }> = {
  issueOAuthToken: {
    client: true,
    ts: `// client_credentials: el SDK pide, cachea y renueva el token solo.\nconst token = await client.getAccessToken();\n\n// authorization_code (login): usá MiRotaractAuth.exchangeCode, ver la guía.`,
    python: `# client_credentials: el SDK pide, cachea y renueva el token solo.\ntoken = client.get_access_token()\n\n# authorization_code (login): usá MiRotaractAuth.exchange_code, ver la guía.`,
  },
  getOAuthUserInfo: {
    ts: "const user = await auth.userInfo(accessToken);",
    python: "user = auth.user_info(access_token)",
  },
  revokeOAuthToken: {
    ts: "await auth.revoke(refreshToken);",
    python: "auth.revoke(refresh_token)",
  },
};

function fetchExample(operation: Operation): SdkCall & { note: string } {
  const body = bodyExample(operation);
  const isPublic = operation.auth.includes("none");
  const tokenNote = isPublic
    ? "Operación pública: no necesita token."
    : "Esta operación no la llama una app con su token de servicio: necesita el token de una sesión de Mi Rotaract (la usa la consola web). Los SDKs no la envuelven.";
  const headers = [
    isPublic ? "" : "Authorization: `Bearer ${sessionToken}`",
    requiredHeader(operation, "Idempotency-Key")
      ? '"Idempotency-Key": crypto.randomUUID()'
      : "",
    body !== undefined ? '"Content-Type": "application/json"' : "",
  ].filter(Boolean);
  const pyHeaders = [
    isPublic ? "" : '"Authorization": f"Bearer {session_token}"',
    requiredHeader(operation, "Idempotency-Key")
      ? '"Idempotency-Key": str(uuid.uuid4())'
      : "",
  ].filter(Boolean);
  const ts = [
    `const response = await fetch(\`${PRODUCTION_API}${pathWith(operation, "ts")}\`, {`,
    `  method: "${operation.method}",`,
    headers.length ? `  headers: { ${headers.join(", ")} },` : "",
    body !== undefined
      ? `  body: JSON.stringify(${pretty(body).replace(/\n/g, "\n  ")}),`
      : "",
    "});",
    "const data = await response.json();",
  ]
    .filter(Boolean)
    .join("\n");
  const python = [
    requiredHeader(operation, "Idempotency-Key") ? "import uuid\n" : "",
    "import httpx\n",
    `response = httpx.request(`,
    `    "${operation.method}",`,
    `    f"${PRODUCTION_API}${pathWith(operation, "python")}",`,
    pyHeaders.length ? `    headers={${pyHeaders.join(", ")}},` : "",
    body !== undefined
      ? `    json=${pretty(body, 4).replace(/\n/g, "\n    ")},`
      : "",
    ")",
    "data = response.json()",
  ]
    .filter(Boolean)
    .join("\n");
  return { ts, python, note: tokenNote };
}

export function examplesFor(operation: Operation): Example[] {
  const examples: Example[] = [
    { id: "curl", label: "curl", code: curl(operation) },
  ];
  const service = operation.auth.includes("service");
  const known = SERVICE_CALLS[operation.operationId];
  const oauth = OAUTH_CALLS[operation.operationId];
  if (service) {
    const call = known ?? genericService(operation);
    examples.push(
      {
        id: "ts",
        label: "TypeScript",
        code: `${TS_CLIENT}\n\n${pathVariables(operation, "ts")}${call.ts}`,
      },
      {
        id: "python",
        label: "Python",
        code: `${PY_CLIENT}\n\n${pathVariables(operation, "python")}${call.python}`,
      },
    );
  } else if (oauth) {
    examples.push(
      {
        id: "ts",
        label: "TypeScript",
        code: `${oauth.client ? TS_CLIENT : TS_AUTH}\n\n${oauth.ts}`,
      },
      {
        id: "python",
        label: "Python",
        code: `${oauth.client ? PY_CLIENT : PY_AUTH}\n\n${oauth.python}`,
      },
    );
  } else {
    const plain = fetchExample(operation);
    examples.push(
      { id: "ts", label: "TypeScript", code: plain.ts, note: plain.note },
      { id: "python", label: "Python", code: plain.python, note: plain.note },
    );
  }
  return examples;
}

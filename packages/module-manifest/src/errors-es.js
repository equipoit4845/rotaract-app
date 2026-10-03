/**
 * Ajv errors → short Spanish sentences a club president (or a committee
 * developer) can act on. Field names come from the schema's `title` when it
 * has one, so a configuration form shows "Falta «Cantidad de votos»" instead
 * of "must have required property 'votes'".
 *
 * Keep in sync with apps/institutional-kernel-api/src/application/modules/errors-es.ts
 * (the kernel cannot import workspace packages; a kernel unit test compares
 * both on the same fixtures).
 */

const TYPE_NAMES = {
  string: "un texto",
  number: "un número",
  integer: "un número entero",
  boolean: "sí o no",
  object: "un objeto",
  array: "una lista",
  null: "vacío",
};

const FORMAT_NAMES = {
  email: "un email válido",
  uri: "una dirección web válida (https://...)",
  url: "una dirección web válida (https://...)",
  "uri-reference": "una dirección válida",
  date: "una fecha válida (AAAA-MM-DD)",
  "date-time": "una fecha y hora válidas",
  time: "una hora válida (HH:MM)",
  uuid: "un identificador válido",
  hostname: "un nombre de dominio válido",
  ipv4: "una dirección IPv4 válida",
  ipv6: "una dirección IPv6 válida",
  regex: "una expresión regular válida",
};

function decodePointer(segment) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** "/permissions/0/code" → "permissions[0].code"; "" → "". */
export function pointerToPath(pointer) {
  if (!pointer) return "";
  return pointer
    .split("/")
    .slice(1)
    .map(decodePointer)
    .reduce(
      (path, segment) =>
        /^\d+$/.test(segment)
          ? `${path}[${Number(segment)}]`
          : path
            ? `${path}.${segment}`
            : segment,
      "",
    );
}

function plural(count, one, many) {
  return count === 1 ? `${count} ${one}` : `${count} ${many}`;
}

function quote(label) {
  return `«${label}»`;
}

/**
 * Label of the field an error is about: the `title` of its schema when
 * present, otherwise its path, otherwise `rootLabel`.
 */
function fieldLabel(error, rootLabel) {
  const title =
    error.parentSchema && typeof error.parentSchema.title === "string"
      ? error.parentSchema.title
      : undefined;
  if (title && error.instancePath) return quote(title);
  const path = pointerToPath(error.instancePath);
  return path ? quote(path) : rootLabel;
}

function childLabel(error, property) {
  const schema =
    error.parentSchema &&
    error.parentSchema.properties &&
    error.parentSchema.properties[property];
  const title = schema && typeof schema.title === "string" ? schema.title : "";
  if (title) return quote(title);
  const base = pointerToPath(error.instancePath);
  return quote(base ? `${base}.${property}` : property);
}

/**
 * One Ajv error (compiled with `verbose: true` so `parentSchema` is there)
 * → `{ path, message, keyword }`.
 */
export function describeAjvError(error, rootLabel = "El valor") {
  const field = fieldLabel(error, rootLabel);
  const params = error.params || {};
  const path = pointerToPath(error.instancePath);
  const out = (message, extraPath) => ({
    path: extraPath ?? path,
    message,
    keyword: error.keyword,
  });
  switch (error.keyword) {
    case "required": {
      const property = params.missingProperty;
      const childPath = path ? `${path}.${property}` : property;
      return out(`Falta completar ${childLabel(error, property)}.`, childPath);
    }
    case "additionalProperties": {
      const property = params.additionalProperty;
      const childPath = path ? `${path}.${property}` : property;
      return out(
        `${quote(childPath)} no es un campo conocido. Revisá si está bien escrito.`,
        childPath,
      );
    }
    case "type": {
      const types = String(params.type || "")
        .split(",")
        .map((type) => TYPE_NAMES[type] || type);
      return out(`${field} tiene que ser ${types.join(" o ")}.`);
    }
    case "enum": {
      const allowed = (params.allowedValues || []).map((value) =>
        JSON.stringify(value),
      );
      return out(`${field} tiene que ser uno de estos valores: ${allowed.join(", ")}.`);
    }
    case "const":
      return out(`${field} tiene que ser ${JSON.stringify(params.allowedValue)}.`);
    case "minLength":
      return params.limit === 1
        ? out(`${field} no puede quedar vacío.`)
        : out(`${field} tiene que tener al menos ${plural(params.limit, "carácter", "caracteres")}.`);
    case "maxLength":
      return out(`${field} puede tener como máximo ${plural(params.limit, "carácter", "caracteres")}.`);
    case "minimum":
      return out(`${field} tiene que ser ${params.limit} o más.`);
    case "maximum":
      return out(`${field} tiene que ser ${params.limit} o menos.`);
    case "exclusiveMinimum":
      return out(`${field} tiene que ser mayor que ${params.limit}.`);
    case "exclusiveMaximum":
      return out(`${field} tiene que ser menor que ${params.limit}.`);
    case "multipleOf":
      return out(`${field} tiene que ser múltiplo de ${params.multipleOf}.`);
    case "minItems":
      return out(`${field} tiene que tener al menos ${plural(params.limit, "elemento", "elementos")}.`);
    case "maxItems":
      return out(`${field} puede tener como máximo ${plural(params.limit, "elemento", "elementos")}.`);
    case "uniqueItems":
      return out(`${field} tiene elementos repetidos.`);
    case "minProperties":
      return out(`${field} tiene que tener al menos ${plural(params.limit, "campo", "campos")}.`);
    case "maxProperties":
      return out(`${field} puede tener como máximo ${plural(params.limit, "campo", "campos")}.`);
    case "pattern":
      return out(`${field} no tiene el formato esperado.`);
    case "format":
      return out(`${field} tiene que ser ${FORMAT_NAMES[params.format] || `un valor con formato ${params.format}`}.`);
    case "not":
      return out(`${field} tiene un valor que no está permitido.`);
    case "oneOf":
    case "anyOf":
      return out(`${field} no coincide con ninguna de las opciones posibles.`);
    case "if":
      return out(`${field} no cumple una condición del esquema.`);
    case "dependencies":
    case "dependentRequired":
      return out(`Si completás ${field}, también tenés que completar ${quote(params.missingProperty)}.`);
    case "propertyNames":
      return out(`${field} tiene un nombre de campo inválido.`);
    case "contains":
      return out(`${field} no tiene ningún elemento válido.`);
    case "false schema":
      return out(`${field} no está permitido.`);
    default:
      return out(`${field} no es válido.`);
  }
}

/**
 * Ajv errors → Spanish errors, without the noise Ajv adds around composite
 * keywords (an `anyOf` failure also reports every branch).
 */
export function describeAjvErrors(errors, rootLabel) {
  const list = Array.isArray(errors) ? errors : [];
  const composite = new Set(
    list
      .filter((error) => error.keyword === "anyOf" || error.keyword === "oneOf")
      .map((error) => error.instancePath),
  );
  const seen = new Set();
  const out = [];
  for (const error of list) {
    // Branch errors of an anyOf/oneOf at the same location are summarised
    // by the anyOf/oneOf error itself.
    if (
      error.keyword !== "anyOf" &&
      error.keyword !== "oneOf" &&
      composite.has(error.instancePath) &&
      /\/(anyOf|oneOf)\//.test(error.schemaPath || "")
    )
      continue;
    // `if` failures repeat the `then`/`else` error.
    if (error.keyword === "if") continue;
    const described = describeAjvError(error, rootLabel);
    const key = `${described.path}|${described.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(described);
  }
  return out;
}

/** "Falta completar «Nombre». «cupo» tiene que ser 1 o más." */
export function summarizeErrors(errors) {
  return errors.map((error) => error.message).join(" ");
}

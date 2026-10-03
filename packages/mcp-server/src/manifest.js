/**
 * validate_module_manifest adapter.
 *
 * The module manifest contract is owned by E8 (`@mirotaract/module-manifest`,
 * `validateManifest(json) → { ok, errors[] }`, schema
 * packages/module-manifest/schema/module-manifest.v1.json). When that package
 * is installed we use it; otherwise we fall back to a local copy of the
 * minimal shape from the E8/E9/E10 contract.
 *
 * TODO(E8): once @mirotaract/module-manifest is merged, add it as a
 * dependency of @mirotaract/mcp and delete `validateManifestLocal`.
 */

export const OIDC_SCOPES = ["openid", "profile", "email", "memberships", "positions"];
export const SERVICE_SCOPES = [
  "kernel.service.users.read",
  "kernel.service.persons.read",
  "kernel.service.persons.contact.read",
  "kernel.service.organizations.read",
  "kernel.service.memberships.read",
  "kernel.service.authorities.read",
  "kernel.service.periods.read",
  "kernel.service.authorization.check",
  "kernel.service.modules.read",
  "kernel.service.tokens.introspect",
];
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const MODULE_ID = /^[a-z][a-z0-9-]{1,39}$/;
const KNOWN_KEYS = ["$schema", "id", "name", "description", "version", "contractVersion", "permissions", "events", "configurationSchema", "ui", "oauth"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

function isLocalUrl(url) {
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

/**
 * Local copy of the contract's minimal schema. `eventTypes` (subscribable
 * catalog types) and `eventScopes` (type → scope) make the event checks exact.
 */
export function validateManifestLocal(manifest, { eventTypes, eventScopes = {} } = {}) {
  const errors = [];
  const warnings = [];
  const error = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });

  if (!isObject(manifest)) {
    error("", "El manifiesto tiene que ser un objeto JSON.");
    return { ok: false, errors, warnings };
  }
  for (const key of Object.keys(manifest)) if (!KNOWN_KEYS.includes(key)) warn(`/${key}`, "Campo desconocido para el contrato v1 (se ignora).");

  const id = manifest.id;
  if (!nonEmpty(id) || !MODULE_ID.test(id)) error("/id", "Obligatorio: minúsculas, números y guiones, empieza con letra, 2 a 40 caracteres (es el namespace de los permisos).");
  else if (id === "kernel" || id.startsWith("kernel-")) error("/id", "`kernel` está reservado para el kernel.");
  if (!nonEmpty(manifest.name)) error("/name", "Obligatorio.");
  if (manifest.description !== undefined && typeof manifest.description !== "string") error("/description", "Tiene que ser texto.");
  if (!nonEmpty(manifest.description)) warn("/description", "Recomendado: la presidencia lo ve al instalar el módulo.");
  if (typeof manifest.version !== "string" || !SEMVER.test(manifest.version)) error("/version", "Obligatorio, en semver (por ejemplo 1.0.0).");
  if (manifest.contractVersion !== 1) error("/contractVersion", "Tiene que ser 1.");
  if (manifest.$schema !== undefined && typeof manifest.$schema !== "string") error("/$schema", "Tiene que ser una URL o ruta.");

  // permissions
  if (!Array.isArray(manifest.permissions)) error("/permissions", "Obligatorio: lista (puede estar vacía).");
  else {
    const seen = new Set();
    manifest.permissions.forEach((p, i) => {
      const at = `/permissions/${i}`;
      if (!isObject(p)) return error(at, "Cada permiso es un objeto.");
      if (!nonEmpty(p.code)) error(`${at}/code`, "Obligatorio.");
      else {
        if (MODULE_ID.test(id ?? "") && !p.code.startsWith(`${id}.`)) error(`${at}/code`, `Tiene que empezar con "${id}." (el namespace del módulo).`);
        if (p.code.startsWith("kernel.")) error(`${at}/code`, "Los permisos `kernel.*` son del kernel; un módulo define los suyos.");
        if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9_-]*)+$/.test(p.code)) error(`${at}/code`, "Formato <modulo>.<recurso>.<acción>, en minúsculas.");
        if (seen.has(p.code)) error(`${at}/code`, `Repetido: ${p.code}.`);
        seen.add(p.code);
      }
      if (!nonEmpty(p.name)) error(`${at}/name`, "Obligatorio (lo ve el RDR al asignarlo a cargos).");
      if (!["ORGANIZATION", "ORGANIZATION_TREE"].includes(p.scopeType)) error(`${at}/scopeType`, "ORGANIZATION u ORGANIZATION_TREE.");
    });
  }

  // events
  const scopes = Array.isArray(manifest.oauth?.scopes) ? manifest.oauth.scopes : [];
  if (manifest.events !== undefined) {
    if (!isObject(manifest.events)) error("/events", "Objeto { subscribes: [], emits: [] }.");
    else {
      const { subscribes = [], emits = [] } = manifest.events;
      if (!Array.isArray(subscribes)) error("/events/subscribes", "Lista de tipos de evento.");
      else
        subscribes.forEach((type, i) => {
          const at = `/events/subscribes/${i}`;
          if (typeof type !== "string" || !/^[a-z]+(\.[a-z_]+)+\.v\d+$/.test(type)) return error(at, "Tipo con versión, por ejemplo membership.activated.v1.");
          if (type === "ping.v1") return error(at, "ping.v1 llega a todos los endpoints; no se suscribe.");
          if (eventTypes && !eventTypes.includes(type)) return error(at, `No está en el catálogo de eventos: ${type}.`);
          const needs = eventScopes[type];
          if (needs && !scopes.includes(needs)) error(at, `Para recibir ${type} la app necesita el scope ${needs} en oauth.scopes.`);
        });
      if (!Array.isArray(emits)) error("/events/emits", "Lista de tipos de evento propios.");
      else
        emits.forEach((type, i) => {
          if (typeof type !== "string" || !type.startsWith(`${id}.`) || !/\.v\d+$/.test(type)) error(`/events/emits/${i}`, `Los eventos propios son <${id}>.<algo>.v<N>.`);
        });
    }
  }

  // configurationSchema
  if (manifest.configurationSchema !== undefined) {
    const schema = manifest.configurationSchema;
    if (!isObject(schema)) error("/configurationSchema", "Tiene que ser un JSON Schema (objeto).");
    else {
      if (schema.type !== "object") error("/configurationSchema/type", 'La configuración es un objeto: "type": "object".');
      if (schema.properties !== undefined && !isObject(schema.properties)) error("/configurationSchema/properties", "Objeto de propiedades.");
      if (schema.additionalProperties !== false) warn("/configurationSchema/additionalProperties", "Recomendado: false, para que un error de tipeo no pase la validación.");
      for (const [name, prop] of Object.entries(schema.properties ?? {}))
        if (/secret|password|token|clave|contrase/i.test(name)) warn(`/configurationSchema/properties/${name}`, "No pongas secretos en la configuración: la ve quien administra el club. Usá variables de entorno del servidor.");
    }
  }

  // ui
  if (manifest.ui !== undefined) {
    if (!isObject(manifest.ui)) error("/ui", "Objeto { entryUrl, navLabel, icon }.");
    else {
      let url;
      try {
        url = new URL(manifest.ui.entryUrl);
      } catch {
        error("/ui/entryUrl", "URL absoluta obligatoria.");
      }
      if (url && url.protocol !== "https:" && !isLocalUrl(url)) error("/ui/entryUrl", "https:// (o http://localhost en desarrollo).");
      if (!nonEmpty(manifest.ui.navLabel)) error("/ui/navLabel", "Obligatorio (texto del menú).");
      if (manifest.ui.icon !== undefined && typeof manifest.ui.icon !== "string") error("/ui/icon", "Nombre de ícono (texto).");
    }
  }

  // oauth
  if (manifest.oauth !== undefined) {
    if (!isObject(manifest.oauth)) error("/oauth", "Objeto { clientId?, scopes: [] }.");
    else {
      for (const key of Object.keys(manifest.oauth))
        if (/secret|password|token/i.test(key)) error(`/oauth/${key}`, "Nunca pongas secretos en el manifiesto (es público): van en variables de entorno del servidor.");
      if (manifest.oauth.clientId !== undefined &&!/^mra_[0-9a-f]{20}$/.test(manifest.oauth.clientId)) error("/oauth/clientId", "Formato mra_ + 20 hexadecimales (lo entrega el RDR).");
      if (!Array.isArray(manifest.oauth.scopes)) error("/oauth/scopes", "Lista de scopes.");
      else {
        const dup = new Set();
        manifest.oauth.scopes.forEach((scope, i) => {
          if (!OIDC_SCOPES.includes(scope) && !SERVICE_SCOPES.includes(scope)) error(`/oauth/scopes/${i}`, `Scope desconocido: ${scope}.`);
          if (dup.has(scope)) warn(`/oauth/scopes/${i}`, `Repetido: ${scope}.`);
          dup.add(scope);
        });
        if (scopes.includes("kernel.service.persons.contact.read")) warn("/oauth/scopes", "kernel.service.persons.contact.read solo si el módulo contacta personas: documentá para qué (el RDR lo va a preguntar).");
        if (scopes.includes("kernel.service.tokens.introspect") || scopes.includes("kernel.service.users.read")) warn("/oauth/scopes", "Ese scope es de uso interno de la plataforma; un módulo de comité casi nunca lo necesita.");
        const oidc = scopes.filter((s) => OIDC_SCOPES.includes(s));
        if (oidc.length && !oidc.includes("openid")) error("/oauth/scopes", "Si pedís scopes OIDC, incluí openid.");
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

let external;

/** Tries the E8 package first. */
async function loadExternal() {
  if (external !== undefined) return external;
  try {
    const mod = await import("@mirotaract/module-manifest");
    external = typeof mod.validateManifest === "function" ? mod.validateManifest : null;
  } catch {
    external = null;
  }
  return external;
}

/** Accepts the manifest as an object or JSON text. */
export async function validateModuleManifest(input, options = {}) {
  let manifest = input;
  if (typeof input === "string") {
    try {
      manifest = JSON.parse(input);
    } catch (e) {
      return { ok: false, validator: "json", errors: [{ path: "", message: `No es JSON válido: ${e.message}` }], warnings: [] };
    }
  }
  const local = validateManifestLocal(manifest, options);
  const official = options.useExternal === false ? null : await loadExternal();
  if (!official) return { ...local, validator: "local (contrato mínimo E8; TODO: @mirotaract/module-manifest)" };
  const result = await official(manifest);
  const errors = (result.errors ?? []).map((e) => (typeof e === "string" ? { path: "", message: e } : { path: e.path ?? e.instancePath ?? "", message: e.message ?? String(e) }));
  // Keep the catalog/scope cross-checks the schema alone can't express.
  const extra = local.errors.filter((e) => e.path.startsWith("/events/subscribes") && !errors.some((x) => x.path === e.path));
  return { ok: Boolean(result.ok) && extra.length === 0, errors: [...errors, ...extra], warnings: local.warnings, validator: "@mirotaract/module-manifest" };
}

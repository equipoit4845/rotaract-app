/**
 * Field allowlists for every write that persists caller input, taken from
 * the request schemas in kernel-openapi.yaml.
 *
 * Request bodies arrive untyped (`@Body() body: any`) and runtime OpenAPI
 * validation is opt-in, so without this filter a caller could persist any
 * column of the target table — e.g. a club president sending `parentId`,
 * `type` or `status` in `PATCH /organizations/:id` to detach the club from
 * its district and skip the lifecycle commands. Unknown keys are dropped,
 * not rejected, so clients that send extra UI-only fields keep working.
 */
export const INPUT_FIELDS = {
  createPerson: [
    "firstName",
    "lastName",
    "primaryEmail",
    "phone",
    "birthDate",
    "externalReference",
    "metadata",
  ],
  updatePerson: [
    "firstName",
    "lastName",
    "displayName",
    "primaryEmail",
    "phone",
    "birthDate",
    "avatarUrl",
    "metadata",
  ],
  createOrganization: [
    "parentId",
    "type",
    "code",
    "name",
    "slug",
    "countryCode",
    "region",
    "city",
    "timezone",
    "contactEmail",
    "contactPhone",
    "foundedAt",
    "description",
    "attributes",
  ],
  updateOrganization: [
    "name",
    "countryCode",
    "region",
    "city",
    "timezone",
    "contactEmail",
    "contactPhone",
    "logoUrl",
    "description",
    "attributes",
  ],
  createMembership: ["personId", "memberNumber", "metadata"],
  updateMembership: ["memberNumber", "internalNotes", "metadata"],
  createPeriod: ["code", "name", "sequence", "startDate", "endDate"],
  updatePeriod: ["name", "startDate", "endDate"],
  createPosition: [
    "code",
    "name",
    "description",
    "organizationType",
    "ownerOrganizationId",
    "editPermissionCode",
    "defaultRoleCode",
    "isSingletonPerPeriod",
  ],
  updatePosition: [
    "name",
    "description",
    "editPermissionCode",
    "defaultRoleCode",
    "isSingletonPerPeriod",
  ],
  createPermission: [
    "code",
    "namespace",
    "name",
    "description",
    "resourceType",
    "moduleId",
  ],
  createRole: ["code", "name", "description", "moduleId"],
  grantRole: [
    "personId",
    "roleDefinitionId",
    "effect",
    "scopeType",
    "organizationId",
    "periodId",
    "validFrom",
    "validUntil",
    "reason",
  ],
  // E8: a module is registered from its manifest; id, name, version and
  // configurationSchema come from it (docs/15-modules.md).
  registerModule: ["appId", "manifest"],
  createDeveloperApp: [
    "name",
    "description",
    "type",
    "organizationId",
    "grantTypes",
    "scopes",
    "redirectUris",
  ],
  updateDeveloperApp: ["name", "description", "scopes", "redirectUris"],
  createWebhookEndpoint: ["url", "eventTypes", "description"],
  updateWebhookEndpoint: ["url", "eventTypes", "description", "status"],
} as const;

export type InputOperation = keyof typeof INPUT_FIELDS;

export function allowInput<T extends Record<string, unknown>>(
  operation: InputOperation,
  input: T | null | undefined,
): Partial<T> {
  const allowed: readonly string[] = INPUT_FIELDS[operation];
  const result: Record<string, unknown> = {};
  if (!input || typeof input !== "object") return result as Partial<T>;
  for (const key of allowed)
    if (Object.prototype.hasOwnProperty.call(input, key))
      result[key] = input[key];
  return result as Partial<T>;
}

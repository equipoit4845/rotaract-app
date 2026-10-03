import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DeveloperAppStatus,
  DeveloperAppType,
  OrganizationStatus,
  Prisma,
  type DeveloperApp,
  type DeveloperAppSecret,
} from "@prisma/client";

import type { CommandContext } from "../../domain/shared/command-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  GRANT_TYPES,
  isOidcScope,
  isServiceScope,
  type GrantType,
} from "../oauth/scopes";
import { CommandExecutorService } from "../shared/command-executor.service";
import { allowInput } from "../shared/input-allowlist";
// E11 (docs/18-data-governance.md): review checklist data and scope review.
import {
  reviewAfterScopeChange,
  validateGovernanceFields,
} from "../governance/review-policy";
import { hashClientSecret, newClientId, newClientSecret } from "./credentials";

export type DeveloperAppView = DeveloperApp & {
  secrets: Array<
    Pick<
      DeveloperAppSecret,
      "id" | "hint" | "createdAt" | "expiresAt" | "revokedAt" | "lastUsedAt"
    >
  >;
};

/** A rotated-out secret keeps working this long so a rotation never cuts service. */
export const SECRET_ROTATION_GRACE_MS = 7 * 24 * 60 * 60 * 1_000;
/** Never more than this many current (not revoked, not expired) secrets. */
export const MAX_CURRENT_SECRETS = 2;

const secretSummary = {
  id: true,
  hint: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
} satisfies Prisma.DeveloperAppSecretSelect;

const withSecrets = {
  secrets: { select: secretSummary, orderBy: { createdAt: "desc" } },
} satisfies Prisma.DeveloperAppInclude;

type Tx = Prisma.TransactionClient;

export type DeveloperAppSettings = {
  name: unknown;
  description?: unknown;
  type: unknown;
  grantTypes: unknown;
  scopes: unknown;
  redirectUris?: unknown;
};

export type ValidDeveloperAppSettings = {
  name: string;
  description: string | null;
  type: DeveloperAppType;
  grantTypes: GrantType[];
  scopes: string[];
  redirectUris: string[];
};

function bad(message: string): never {
  throw new BadRequestException(message);
}

function stringList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    bad(`${field} debe ser una lista de textos`);
  return [...new Set(value as string[])];
}

/**
 * https, or http only for localhost / 127.0.0.1 (any port); absolute, no
 * fragment. Compared later by exact string equality, so it is stored as
 * given (not normalized).
 */
export function isValidRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (value.includes("#")) return false;
  if (url.protocol === "https:") return !!url.hostname;
  if (url.protocol === "http:")
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return false;
}

/**
 * Every rule of docs/11-developer-platform-auth.md §"Tipos y combinaciones
 * válidas" that doesn't need the database. 400 with a message the district
 * can act on.
 */
export function validateDeveloperAppSettings(
  input: DeveloperAppSettings,
): ValidDeveloperAppSettings {
  if (typeof input.name !== "string") bad("El nombre es obligatorio");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80)
    bad("El nombre debe tener entre 2 y 80 caracteres");

  let description: string | null = null;
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== "string")
      bad("La descripción debe ser un texto");
    if (input.description.length > 500)
      bad("La descripción puede tener hasta 500 caracteres");
    description = input.description.trim() || null;
  }

  if (
    input.type !== DeveloperAppType.CONFIDENTIAL &&
    input.type !== DeveloperAppType.PUBLIC
  )
    bad("El tipo de app debe ser CONFIDENTIAL o PUBLIC");
  const type = input.type as DeveloperAppType;

  const grantTypes = stringList(input.grantTypes, "grantTypes");
  if (grantTypes.length === 0) bad("Elegí al menos un tipo de acceso");
  for (const grant of grantTypes)
    if (!(GRANT_TYPES as readonly string[]).includes(grant))
      bad(`Tipo de acceso desconocido: ${grant}`);

  const scopes = stringList(input.scopes, "scopes");
  if (scopes.length === 0) bad("Elegí al menos un dato que la app pueda leer");
  for (const scope of scopes)
    if (!isOidcScope(scope) && !isServiceScope(scope))
      bad(`Permiso desconocido: ${scope}`);

  const redirectUris = stringList(input.redirectUris, "redirectUris");
  for (const uri of redirectUris)
    if (!isValidRedirectUri(uri))
      bad(
        `La URL de retorno ${uri} no es válida: debe ser absoluta, sin #, con https (o http solo para localhost / 127.0.0.1)`,
      );

  const has = (grant: GrantType) => grantTypes.includes(grant);
  if (scopes.some(isServiceScope) && !has("client_credentials"))
    bad(
      "Los permisos de servicio (kernel.service.*) requieren el acceso client_credentials",
    );
  if (has("client_credentials") && type !== DeveloperAppType.CONFIDENTIAL)
    bad(
      "Solo una app de servidor (CONFIDENTIAL) puede usar client_credentials",
    );
  if (has("authorization_code")) {
    if (!scopes.includes("openid"))
      bad(
        "El inicio de sesión (authorization_code) requiere el permiso openid",
      );
    if (redirectUris.length === 0)
      bad(
        "El inicio de sesión (authorization_code) requiere al menos una URL de retorno",
      );
  }
  if (has("refresh_token") && !has("authorization_code"))
    bad("refresh_token solo se puede usar junto con authorization_code");

  return {
    name,
    description,
    type,
    grantTypes: grantTypes as GrantType[],
    scopes,
    redirectUris,
  };
}

/**
 * E2 — registry of the apps committees build on the Kernel.
 * Contract: kernel-openapi.yaml tag DeveloperApps and
 * docs/11-developer-platform-auth.md §E2.
 */
@Injectable()
export class DeveloperAppsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandExecutorService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string): Promise<DeveloperAppView[]> {
    if (!organizationId) bad("organizationId es obligatorio");
    return this.prisma.developerApp.findMany({
      where: { organizationId },
      include: withSecrets,
      orderBy: { createdAt: "desc" },
    });
  }

  async get(appId: string): Promise<DeveloperAppView> {
    return this.load(this.prisma, appId);
  }

  async create(
    input: unknown,
    context: CommandContext,
  ): Promise<{ app: DeveloperAppView; clientSecret: string | null }> {
    const request = allowInput(
      "createDeveloperApp",
      input as Record<string, unknown>,
    );
    const ownerPersonId = this.actor(context);
    const settings = validateDeveloperAppSettings(
      request as DeveloperAppSettings,
    );
    if (typeof request.organizationId !== "string" || !request.organizationId)
      bad("organizationId es obligatorio");
    const organizationId = request.organizationId;
    const governance = validateGovernanceFields(request);

    // Generated (and hashed) outside the transaction: argon2 is slow and the
    // serializable transaction may be retried. The plaintext never reaches
    // the idempotency record or the audit log — it is attached to the
    // response only when this call actually created the app.
    const secret =
      settings.type === DeveloperAppType.CONFIDENTIAL
        ? newClientSecret()
        : undefined;
    const secretHash = secret ? await hashClientSecret(secret.secret) : "";
    let createdHere: string | undefined;

    const result = await this.commands.execute(
      "createDeveloperApp",
      context,
      request,
      async (tx) => {
        const organization = await tx.organization.findUnique({
          where: { id: organizationId },
          select: { status: true },
        });
        if (!organization) bad("La organización no existe");
        if (organization.status !== OrganizationStatus.ACTIVE)
          bad("La organización no está activa");
        const created = await tx.developerApp.create({
          data: {
            ...settings,
            ...governance,
            clientId: newClientId(),
            organizationId,
            ownerPersonId,
            secrets: secret
              ? { create: { secretHash, hint: secret.hint } }
              : undefined,
            // E11.1: every new app starts in review (the column default).
            reviews: {
              create: {
                kind: "SUBMITTED",
                actorPersonId: ownerPersonId,
                scopes: settings.scopes,
              },
            },
          },
          include: withSecrets,
        });
        await this.record(tx, context, "createDeveloperApp", created);
        createdHere = created.id;
        return { app: created, clientSecret: null as string | null };
      },
    );
    return {
      app: result.app,
      clientSecret:
        secret && createdHere === result.app.id ? secret.secret : null,
    };
  }

  async update(
    appId: string,
    input: unknown,
    context: CommandContext,
  ): Promise<DeveloperAppView> {
    const request = allowInput(
      "updateDeveloperApp",
      input as Record<string, unknown>,
    );
    const actor = this.actor(context);
    const governance = validateGovernanceFields(request);
    return this.commands.execute(
      "updateDeveloperApp",
      context,
      { appId, ...request },
      async (tx) => {
        const app = await this.load(tx, appId);
        if (app.status === DeveloperAppStatus.REVOKED)
          throw new ConflictException("Una app revocada no se puede editar");
        const settings = validateDeveloperAppSettings({
          name: request.name ?? app.name,
          description:
            "description" in request ? request.description : app.description,
          type: app.type,
          grantTypes: app.grantTypes,
          scopes: request.scopes ?? app.scopes,
          redirectUris: request.redirectUris ?? app.redirectUris,
        });
        // E11.1: asking for data the district has not approved reopens
        // the review; approved data the app dropped is no longer approved.
        const review = reviewAfterScopeChange(app, settings.scopes);
        const updated = await tx.developerApp.update({
          where: { id: appId },
          data: {
            name: settings.name,
            description: settings.description,
            scopes: settings.scopes,
            redirectUris: settings.redirectUris,
            ...governance,
            ...(review
              ? {
                  approvedScopes: review.approvedScopes,
                  reviewStatus: review.reviewStatus,
                }
              : {}),
          },
          include: withSecrets,
        });
        if (review?.reopened)
          await tx.developerAppReview.create({
            data: {
              appId,
              kind: "REOPENED",
              actorPersonId: actor,
              scopes: settings.scopes,
            },
          });
        await this.record(tx, context, "updateDeveloperApp", updated);
        return updated;
      },
    );
  }

  /**
   * New secret; the current ones get `expiresAt = now + 7 days` (unless they
   * expire earlier) and, if two were already current, the oldest is revoked
   * on the spot, so there are never more than two.
   */
  async rotateSecret(
    appId: string,
    context: CommandContext,
  ): Promise<{
    secretId: string;
    secret: string;
    hint: string;
    createdAt: Date;
  }> {
    this.actor(context);
    const secret = newClientSecret();
    const secretHash = await hashClientSecret(secret.secret);
    let createdHere: string | undefined;
    const result = await this.commands.execute(
      "rotateDeveloperAppSecret",
      context,
      { appId },
      async (tx) => {
        const app = await this.load(tx, appId);
        if (app.type === DeveloperAppType.PUBLIC)
          throw new ConflictException("Una app PUBLIC no tiene secretos");
        if (app.status === DeveloperAppStatus.REVOKED)
          throw new ConflictException(
            "Una app revocada no puede tener secretos nuevos",
          );
        const now = new Date();
        const graceUntil = new Date(now.getTime() + SECRET_ROTATION_GRACE_MS);
        const current = await tx.developerAppSecret.findMany({
          where: {
            appId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          orderBy: { createdAt: "asc" },
        });
        const overflow = current.length - (MAX_CURRENT_SECRETS - 1);
        const toRevoke = overflow > 0 ? current.slice(0, overflow) : [];
        const toExpire = current.slice(toRevoke.length);
        if (toRevoke.length)
          await tx.developerAppSecret.updateMany({
            where: { id: { in: toRevoke.map((item) => item.id) } },
            data: { revokedAt: now },
          });
        for (const item of toExpire)
          if (!item.expiresAt || item.expiresAt > graceUntil)
            await tx.developerAppSecret.update({
              where: { id: item.id },
              data: { expiresAt: graceUntil },
            });
        const created = await tx.developerAppSecret.create({
          data: { appId, secretHash, hint: secret.hint },
        });
        await this.record(tx, context, "rotateDeveloperAppSecret", app);
        createdHere = created.id;
        return {
          secretId: created.id,
          hint: created.hint,
          createdAt: created.createdAt,
        };
      },
    );
    // A replayed Idempotency-Key must not hand out a secret again (it was
    // never stored in plaintext): the caller has to rotate once more.
    if (createdHere !== result.secretId)
      throw new ConflictException(
        "Ese secreto ya se entregó una vez y no se puede volver a mostrar; creá uno nuevo",
      );
    return { ...result, secret: secret.secret };
  }

  async revokeSecret(
    appId: string,
    secretId: string,
    context: CommandContext,
  ): Promise<void> {
    this.actor(context);
    await this.commands.execute(
      "revokeDeveloperAppSecret",
      context,
      { appId, secretId },
      async (tx) => {
        const app = await this.load(tx, appId);
        const secret = await tx.developerAppSecret.findFirst({
          where: { id: secretId, appId },
        });
        if (!secret) throw new NotFoundException("Secreto no encontrado");
        if (!secret.revokedAt)
          await tx.developerAppSecret.update({
            where: { id: secretId },
            data: { revokedAt: new Date() },
          });
        await this.record(tx, context, "revokeDeveloperAppSecret", app);
        return { id: secretId };
      },
    );
  }

  /** ACTIVE ⇄ SUSPENDED, ACTIVE | SUSPENDED → REVOKED (terminal). */
  async transition(
    appId: string,
    target: "ACTIVE" | "SUSPENDED" | "REVOKED",
    context: CommandContext,
  ): Promise<DeveloperAppView> {
    this.actor(context);
    const operation = {
      ACTIVE: "activateDeveloperApp",
      SUSPENDED: "suspendDeveloperApp",
      REVOKED: "revokeDeveloperApp",
    }[target];
    return this.commands.execute(
      operation,
      context,
      { appId, target },
      async (tx) => {
        const app = await this.load(tx, appId);
        if (!canTransition(app.status, target))
          throw new ConflictException(
            `Una app ${app.status} no puede pasar a ${target}`,
          );
        const now = new Date();
        const data: Prisma.DeveloperAppUpdateInput =
          target === "SUSPENDED"
            ? { status: target, suspendedAt: now }
            : target === "ACTIVE"
              ? { status: target, suspendedAt: null }
              : { status: target, revokedAt: now };
        if (target === "REVOKED") {
          await tx.developerAppSecret.updateMany({
            where: { appId, revokedAt: null },
            data: { revokedAt: now },
          });
          await tx.oAuthRefreshToken.updateMany({
            where: { appId, revokedAt: null },
            data: { revokedAt: now },
          });
          await tx.oAuthConsent.updateMany({
            where: { appId, revokedAt: null },
            data: { revokedAt: now },
          });
        }
        const updated = await tx.developerApp.update({
          where: { id: appId },
          data,
          include: withSecrets,
        });
        await this.record(tx, context, operation, updated);
        // E11.4: a paused or revoked app leaves the members' panel.
        if (target !== "ACTIVE") {
          const unpublished = await tx.developerAppListing.updateMany({
            where: { appId, published: true },
            data: { published: false, publishedAt: null },
          });
          if (unpublished.count > 0)
            await this.record(tx, context, "unpublishDeveloperApp", updated);
        }
        return updated;
      },
    );
  }

  private async load(
    client: Tx | PrismaService,
    appId: string,
  ): Promise<DeveloperAppView> {
    const app = await client.developerApp.findUnique({
      where: { id: appId },
      include: withSecrets,
    });
    if (!app) throw new NotFoundException("App no encontrada");
    return app;
  }

  /** The owner is always the person running the command, never the input. */
  private actor(context: CommandContext): string {
    if (context.actor.type !== "USER" || !context.actor.id)
      bad("Esta operación requiere una persona autenticada");
    return context.actor.id;
  }

  /** Never secrets nor hashes: only which app, by whom, where. */
  private record(
    tx: Tx,
    context: CommandContext,
    action: string,
    app: Pick<DeveloperApp, "id" | "organizationId">,
  ) {
    return this.audit.record(
      tx,
      context,
      action,
      "DeveloperApp",
      app.id,
      app.organizationId,
    );
  }
}

export function canTransition(
  from: DeveloperAppStatus,
  to: DeveloperAppStatus | "ACTIVE" | "SUSPENDED" | "REVOKED",
): boolean {
  if (from === DeveloperAppStatus.ACTIVE)
    return (
      to === DeveloperAppStatus.SUSPENDED || to === DeveloperAppStatus.REVOKED
    );
  if (from === DeveloperAppStatus.SUSPENDED)
    return (
      to === DeveloperAppStatus.ACTIVE || to === DeveloperAppStatus.REVOKED
    );
  return false;
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  DeveloperAppReviewStatus,
  DeveloperAppStatus,
  InstallationStatus,
  MembershipStatus,
  Prisma,
  type DeveloperApp,
  type DeveloperAppListing,
} from "@prisma/client";

import type { CommandContext } from "../../domain/shared/command-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CommandExecutorService } from "../shared/command-executor.service";
import { organizationTree } from "../webhooks/event-mapper";
import {
  AUDIENCES,
  defaultLaunchUrl,
  isValidIcon,
  isValidLaunchUrl,
  matchesAudience,
  type PersonContexts,
} from "./audience";

type Tx = Prisma.TransactionClient;

export type ListingView = {
  published: boolean;
  displayName: string;
  shortDescription: string | null;
  icon: string | null;
  launchUrl: string | null;
  audiences: string[];
  positionCodes: string[];
  displayOrder: number;
  publishedAt: Date | null;
  updatedAt: Date | null;
};

type ModuleUi = {
  moduleId: string;
  entryUrl?: string;
  navLabel?: string;
  icon?: string;
};

function bad(message: string): never {
  throw new BadRequestException(message);
}

function moduleUi(module: {
  id: string;
  manifest: Prisma.JsonValue;
}): ModuleUi {
  const manifest = (module.manifest ?? {}) as Record<string, unknown>;
  const ui = (
    manifest.ui && typeof manifest.ui === "object" ? manifest.ui : {}
  ) as Record<string, unknown>;
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;
  return {
    moduleId: module.id,
    entryUrl: text(ui.entryUrl),
    navLabel: text(ui.navLabel),
    icon: text(ui.icon),
  };
}

/** What the RDR sees before saving anything: pre-filled from the app and its E8 module. */
export function suggestedListing(
  app: Pick<DeveloperApp, "name" | "description" | "redirectUris">,
  module?: ModuleUi,
): ListingView {
  const icon = module?.icon && isValidIcon(module.icon) ? module.icon : null;
  const entry =
    module?.entryUrl && isValidLaunchUrl(module.entryUrl)
      ? module.entryUrl
      : null;
  return {
    published: false,
    displayName: (module?.navLabel ?? app.name).slice(0, 60),
    shortDescription: app.description?.slice(0, 160) ?? null,
    icon,
    launchUrl: entry ?? defaultLaunchUrl(app.redirectUris),
    audiences: [],
    positionCodes: [],
    displayOrder: 100,
    publishedAt: null,
    updatedAt: null,
  };
}

function listingView(listing: DeveloperAppListing): ListingView {
  return {
    published: listing.published,
    displayName: listing.displayName,
    shortDescription: listing.shortDescription,
    icon: listing.icon,
    launchUrl: listing.launchUrl,
    audiences: listing.audiences,
    positionCodes: listing.positionCodes,
    displayOrder: listing.displayOrder,
    publishedAt: listing.publishedAt,
    updatedAt: listing.updatedAt,
  };
}

/**
 * E11.4 — the district's catalog: the RDR publishes approved apps to the
 * members it chooses, and each person gets only the apps meant for them
 * (`GET /me/apps`).
 */
@Injectable()
export class AppCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandExecutorService,
    private readonly audit: AuditService,
  ) {}

  /** Approved, active apps of the organization's tree, with their listing (or a suggestion). */
  async catalog(organizationId: string) {
    if (!organizationId) bad("organizationId es obligatorio");
    const tree = await organizationTree(this.prisma, organizationId);
    const apps = await this.prisma.developerApp.findMany({
      where: {
        organizationId: { in: tree },
        status: DeveloperAppStatus.ACTIVE,
        approvedAt: { not: null },
      },
      include: {
        listing: true,
        organization: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });
    const modules = await this.modulesFor(apps.map((app) => app.id));
    return apps
      .map((app) => {
        const module = modules.get(app.id);
        return {
          appId: app.id,
          appName: app.name,
          organizationId: app.organizationId,
          organizationName: app.organization.name,
          reviewStatus: app.reviewStatus,
          saved: !!app.listing,
          module: module ?? null,
          listing: app.listing
            ? listingView(app.listing)
            : suggestedListing(app, module),
        };
      })
      .sort(
        (a, b) =>
          a.listing.displayOrder - b.listing.displayOrder ||
          a.listing.displayName.localeCompare(b.listing.displayName),
      );
  }

  async updateListing(appId: string, input: unknown, context: CommandContext) {
    if (context.actor.type !== "USER" || !context.actor.id)
      bad("Esta operación requiere una persona autenticada");
    const body = (input ?? {}) as Record<string, unknown>;
    const request = Object.fromEntries(
      [
        "published",
        "displayName",
        "shortDescription",
        "icon",
        "launchUrl",
        "audiences",
        "positionCodes",
        "displayOrder",
      ]
        .filter((key) => key in body)
        .map((key) => [key, body[key]]),
    );
    return this.commands.execute(
      "updateDeveloperAppListing",
      context,
      { appId, ...request },
      async (tx) => {
        const app = await tx.developerApp.findUnique({
          where: { id: appId },
          include: { listing: true },
        });
        if (!app) throw new NotFoundException("App no encontrada");
        const module = (await this.modulesFor([appId], tx)).get(appId);
        const base = app.listing
          ? listingView(app.listing)
          : suggestedListing(app, module);
        const next = await this.validate(tx, base, request);
        if (next.published) {
          if (app.status !== DeveloperAppStatus.ACTIVE)
            throw new ConflictException(
              "Solo una app activa se puede mostrar a los socios",
            );
          if (app.reviewStatus !== DeveloperAppReviewStatus.APPROVED)
            throw new ConflictException(
              "Solo una app aprobada por el distrito se puede mostrar a los socios",
            );
        }
        const now = new Date();
        const becamePublished = next.published && !app.listing?.published;
        const data = {
          published: next.published,
          displayName: next.displayName,
          shortDescription: next.shortDescription,
          icon: next.icon,
          launchUrl: next.launchUrl as string,
          audiences: next.audiences,
          positionCodes: next.positionCodes,
          displayOrder: next.displayOrder,
          publishedAt: becamePublished
            ? now
            : next.published
              ? (app.listing?.publishedAt ?? now)
              : null,
          updatedById: context.actor.id,
        };
        const saved = await tx.developerAppListing.upsert({
          where: { appId },
          create: { appId, ...data },
          update: data,
        });
        const action =
          next.published !== (app.listing?.published ?? false)
            ? next.published
              ? "publishDeveloperApp"
              : "unpublishDeveloperApp"
            : "updateDeveloperAppListing";
        await this.audit.record(
          tx,
          context,
          action,
          "DeveloperApp",
          appId,
          app.organizationId,
        );
        return listingView(saved);
      },
    );
  }

  // Suspending or revoking an app unpublishes it: see
  // DeveloperAppsService.transition (same transaction as the status change).

  /** `GET /me/apps`: only what this person may see, and nothing else. */
  async visibleFor(personId: string) {
    const listings = await this.prisma.developerAppListing.findMany({
      where: {
        published: true,
        app: {
          status: DeveloperAppStatus.ACTIVE,
          approvedAt: { not: null },
        },
      },
      include: {
        app: { select: { id: true, organizationId: true } },
      },
    });
    if (listings.length === 0) return [];

    const [memberships, appointments] = await Promise.all([
      this.prisma.organizationMembership.findMany({
        where: { personId, status: MembershipStatus.ACTIVE },
        select: {
          organizationId: true,
          organization: { select: { type: true } },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          status: AppointmentStatus.ACTIVE,
          membership: { personId },
        },
        select: {
          organizationId: true,
          organization: { select: { type: true } },
          positionDefinition: { select: { code: true } },
        },
      }),
    ]);
    if (memberships.length === 0 && appointments.length === 0) return [];

    const trees = new Map<string, Set<string>>();
    const tree = async (rootId: string) => {
      let ids = trees.get(rootId);
      if (!ids) {
        ids = new Set(await organizationTree(this.prisma, rootId));
        trees.set(rootId, ids);
      }
      return ids;
    };
    const hidden = await this.hiddenOrganizations(
      listings.map((listing) => listing.appId),
    );

    const visible: typeof listings = [];
    for (const listing of listings) {
      const inTree = await tree(listing.app.organizationId);
      const contexts: PersonContexts = {
        memberships: memberships
          .filter((m) => inTree.has(m.organizationId))
          .map((m) => ({
            organizationId: m.organizationId,
            organizationType: m.organization.type,
          })),
        appointments: appointments
          .filter((a) => inTree.has(a.organizationId))
          .map((a) => ({
            organizationId: a.organizationId,
            organizationType: a.organization.type,
            positionCode: a.positionDefinition.code,
          })),
      };
      if (matchesAudience(listing, contexts, hidden.get(listing.appId)))
        visible.push(listing);
    }
    return visible
      .sort(
        (a, b) =>
          a.displayOrder - b.displayOrder ||
          a.displayName.localeCompare(b.displayName),
      )
      .map((listing) => ({
        appId: listing.appId,
        name: listing.displayName,
        description: listing.shortDescription,
        icon: listing.icon,
        launchUrl: listing.launchUrl,
      }));
  }

  /** Clubs where the app's E8 module is installed but not active. */
  private async hiddenOrganizations(
    appIds: string[],
  ): Promise<Map<string, Set<string>>> {
    const modules = await this.prisma.moduleDefinition.findMany({
      where: { developerAppId: { in: appIds } },
      select: {
        developerAppId: true,
        installations: {
          where: { status: { not: InstallationStatus.ACTIVE } },
          select: { organizationId: true },
        },
      },
    });
    const hidden = new Map<string, Set<string>>();
    for (const module of modules) {
      if (!module.developerAppId) continue;
      const set = hidden.get(module.developerAppId) ?? new Set<string>();
      for (const installation of module.installations)
        set.add(installation.organizationId);
      hidden.set(module.developerAppId, set);
    }
    return hidden;
  }

  private async modulesFor(
    appIds: string[],
    client: Tx | PrismaService = this.prisma,
  ): Promise<Map<string, ModuleUi>> {
    if (appIds.length === 0) return new Map();
    const modules = await client.moduleDefinition.findMany({
      where: { developerAppId: { in: appIds } },
      select: { id: true, developerAppId: true, manifest: true },
      orderBy: { registeredAt: "asc" },
    });
    const byApp = new Map<string, ModuleUi>();
    for (const module of modules)
      if (module.developerAppId && !byApp.has(module.developerAppId))
        byApp.set(module.developerAppId, moduleUi(module));
    return byApp;
  }

  private async validate(
    tx: Tx,
    base: ListingView,
    input: Record<string, unknown>,
  ): Promise<ListingView> {
    const next = { ...base };
    if ("published" in input) {
      if (typeof input.published !== "boolean")
        bad("published debe ser verdadero o falso");
      next.published = input.published;
    }
    if ("displayName" in input) {
      const value =
        typeof input.displayName === "string" ? input.displayName.trim() : "";
      if (value.length < 2 || value.length > 60)
        bad("El nombre visible debe tener entre 2 y 60 caracteres");
      next.displayName = value;
    }
    if ("shortDescription" in input) {
      const value = input.shortDescription;
      if (value !== null && typeof value !== "string")
        bad("La descripción debe ser un texto");
      const text = typeof value === "string" ? value.trim() : "";
      if (text.length > 160)
        bad("La descripción corta puede tener hasta 160 caracteres");
      next.shortDescription = text || null;
    }
    if ("icon" in input) {
      const value = input.icon;
      if (value !== null && typeof value !== "string")
        bad("El ícono debe ser un nombre de ícono o una URL https");
      const text = typeof value === "string" ? value.trim() : "";
      if (text && !isValidIcon(text))
        bad(
          'El ícono debe ser un nombre de lucide (por ejemplo "calendar-days") o una URL https de una imagen',
        );
      next.icon = text || null;
    }
    if ("launchUrl" in input) {
      const value =
        typeof input.launchUrl === "string" ? input.launchUrl.trim() : "";
      if (!isValidLaunchUrl(value))
        bad("El enlace para abrir la app debe ser una URL https");
      next.launchUrl = value;
    }
    if ("audiences" in input) {
      const value = input.audiences;
      if (
        !Array.isArray(value) ||
        value.some(
          (item) =>
            typeof item !== "string" ||
            !(AUDIENCES as readonly string[]).includes(item),
        )
      )
        bad(`audiences debe ser una lista con: ${AUDIENCES.join(", ")}`);
      next.audiences = [...new Set(value as string[])];
    }
    if ("positionCodes" in input) {
      const value = input.positionCodes;
      if (
        !Array.isArray(value) ||
        value.some((item) => typeof item !== "string")
      )
        bad("positionCodes debe ser una lista de códigos de cargo");
      const codes = [...new Set(value as string[])];
      if (codes.length > 50) bad("Elegí hasta 50 cargos");
      if (codes.length) {
        const found = await tx.positionDefinition.findMany({
          where: { code: { in: codes } },
          select: { code: true },
        });
        const unknown = codes.filter(
          (code) => !found.some((item) => item.code === code),
        );
        if (unknown.length) bad(`Cargos desconocidos: ${unknown.join(", ")}`);
      }
      next.positionCodes = codes;
    }
    if ("displayOrder" in input) {
      const value = input.displayOrder;
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 1000
      )
        bad("El orden debe ser un número entero entre 0 y 1000");
      next.displayOrder = value;
    }
    if (!next.audiences.includes("POSITIONS")) next.positionCodes = [];
    if (!next.launchUrl)
      bad("Falta el enlace para abrir la app (una URL https)");
    if (next.published && next.audiences.length === 0)
      bad("Elegí a quién mostrarle la app antes de publicarla");
    if (next.audiences.includes("POSITIONS") && next.positionCodes.length === 0)
      bad('Con "Cargos específicos", elegí al menos un cargo');
    return next;
  }
}

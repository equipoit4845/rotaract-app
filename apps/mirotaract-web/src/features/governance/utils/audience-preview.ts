import type { AppCatalogItem, MyApp } from "@/lib/api";

/**
 * Preview of the members' panel (E11.4) for two typical people, with the
 * same union rule the Kernel applies (application/governance/audience.ts):
 * a club president, and a member without a position.
 */
export type PreviewPerson = "president" | "member";

export function seesListing(
  person: PreviewPerson,
  listing: { audiences: string[]; positionCodes: string[] },
): boolean {
  return listing.audiences.some((audience) => {
    if (audience === "DISTRICT_MEMBERS") return true;
    if (person === "member") return false;
    if (audience === "CLUB_PRESIDENTS" || audience === "CLUB_AUTHORITIES")
      return true;
    if (audience === "POSITIONS")
      return listing.positionCodes.includes("CLUB_PRESIDENT");
    return false;
  });
}

export function previewApps(
  items: AppCatalogItem[],
  person: PreviewPerson,
): MyApp[] {
  return items
    .filter(
      (item) =>
        item.listing.published &&
        item.listing.launchUrl &&
        seesListing(person, item.listing),
    )
    .sort(
      (a, b) =>
        a.listing.displayOrder - b.listing.displayOrder ||
        a.listing.displayName.localeCompare(b.listing.displayName),
    )
    .map((item) => ({
      appId: item.appId,
      name: item.listing.displayName,
      description: item.listing.shortDescription ?? null,
      icon: item.listing.icon ?? null,
      launchUrl: item.listing.launchUrl as string,
    }));
}

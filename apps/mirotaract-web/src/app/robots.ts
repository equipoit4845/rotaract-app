import type { MetadataRoute } from "next";

/**
 * `/`, `/login`, `/forgot-password` and `/register` are the only routes
 * meant to be discoverable — everything else is either token-bearing
 * (invite/reset-password/verify-email, product spec §35/§49) or requires an
 * authenticated session (the administrative app), so neither belongs in a
 * search index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/invite/",
        "/reset-password/",
        "/verify-email/",
        "/dashboard",
        "/organizations",
        "/persons",
        "/memberships",
        "/appointments",
        "/positions",
        "/periods",
        "/applications",
        "/transfers",
      ],
    },
  };
}

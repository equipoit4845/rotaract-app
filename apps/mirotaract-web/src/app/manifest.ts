import type { MetadataRoute } from "next";

/**
 * Web app manifest: the Rotary wheel of the Rotaract Distrito 4845 logo as
 * the app icon (packages/design-tokens/scripts/build-brand.mjs writes the
 * PNGs into public/brand).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mi Rotaract — Rotaract Distrito 4845",
    short_name: "Mi Rotaract",
    description:
      "Gestión institucional de los clubes y el Distrito 4845 de Rotaract.",
    lang: "es",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#d41a68",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

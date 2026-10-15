import type { NextConfig } from "next";
import path from "node:path";

/**
 * Correo Distrital (correo-web).
 *
 * In production cloudflared routes `/correo-api/*` straight to correo-api
 * (same origin). The rewrite only exists so that `next dev` / a local
 * `next start` can reach a correo-api on another port. It is resolved at
 * build time for `next build`, at boot for `next dev`.
 */
const correoApi = process.env.CORREO_API_INTERNAL_URL;

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  async rewrites() {
    if (!correoApi) return [];
    const base = correoApi.replace(/\/+$/, "");
    return [
      { source: "/correo-api/:path*", destination: `${base}/correo-api/:path*` },
    ];
  },
};

export default nextConfig;

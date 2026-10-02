import type { NextConfig } from "next";
import path from "node:path";

/**
 * Reuniones distritales (meetings-web).
 *
 * In production cloudflared routes `/meetings-api/*` and `/socket.io/*`
 * straight to meetings-api (same origin). These rewrites only exist so that
 * `next dev` / a local `next start` can reach a meetings-api on another port.
 * They are resolved at build time for `next build`, at boot for `next dev`.
 */
const meetingsApi = process.env.MEETINGS_API_INTERNAL_URL;

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  async rewrites() {
    if (!meetingsApi) return [];
    const base = meetingsApi.replace(/\/+$/, "");
    return [
      {
        source: "/meetings-api/:path*",
        destination: `${base}/meetings-api/:path*`,
      },
      { source: "/socket.io/:path*", destination: `${base}/socket.io/:path*` },
    ];
  },
};

export default nextConfig;

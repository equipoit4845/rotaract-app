import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  // docs/16-developer-portal.md: a self-contained server for the Docker image.
  output: "standalone",
  outputFileTracingRoot: join(here, "../.."),
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        // llms.txt, raw Markdown and the shadcn registry are read by tools.
        source: "/:file(llms.txt|llms-full.txt)",
        headers: [
          { key: "Content-Type", value: "text/plain; charset=utf-8" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
      {
        source: "/docs/:slug.md",
        headers: [
          { key: "Content-Type", value: "text/markdown; charset=utf-8" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
      {
        source: "/r/:item.json",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;

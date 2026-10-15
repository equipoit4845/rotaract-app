# Correo Distrital — apps/correo-web (Next.js standalone, port 3005).
FROM node:24-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/correo-web/package.json apps/correo-web/package.json
COPY packages/sdk-js/package.json packages/sdk-js/package.json
RUN pnpm install --frozen-lockfile=false --filter "@mirotaract/correo-web..."
COPY packages/sdk-js packages/sdk-js
COPY apps/correo-web apps/correo-web
# NEXT_PUBLIC_* are inlined into the browser bundle at build time.
# Empty API URL = same origin (cloudflared routes /correo-api).
ARG NEXT_PUBLIC_CORREO_API_URL=""
ARG NEXT_PUBLIC_MIROTARACT_URL="https://app.rotaract4845.com"
ENV NEXT_PUBLIC_CORREO_API_URL=$NEXT_PUBLIC_CORREO_API_URL \
    NEXT_PUBLIC_MIROTARACT_URL=$NEXT_PUBLIC_MIROTARACT_URL \
    NEXT_TELEMETRY_DISABLED=1
# Builds @mirotaract/sdk first, then the app (topological order).
RUN pnpm --filter "@mirotaract/correo-web..." run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3005 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /workspace/apps/correo-web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/correo-web/.next/static ./apps/correo-web/.next/static
USER node
EXPOSE 3005
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3005/ || exit 1
CMD ["node", "apps/correo-web/server.js"]

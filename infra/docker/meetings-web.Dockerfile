# Reuniones distritales — apps/meetings-web (Next.js standalone, port 3002).
FROM node:24-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/meetings-web/package.json apps/meetings-web/package.json
COPY packages/sdk-js/package.json packages/sdk-js/package.json
RUN pnpm install --frozen-lockfile=false --filter "@mirotaract/meetings-web..."
COPY packages/sdk-js packages/sdk-js
COPY apps/meetings-web apps/meetings-web
# NEXT_PUBLIC_* are inlined into the browser bundle at build time.
# Empty API/socket URLs = same origin (cloudflared routes /meetings-api and /socket.io).
ARG NEXT_PUBLIC_MEETINGS_API_URL=""
ARG NEXT_PUBLIC_MEETINGS_SOCKET_URL=""
ARG NEXT_PUBLIC_MIROTARACT_URL="https://app.rotaract4845.com"
ENV NEXT_PUBLIC_MEETINGS_API_URL=$NEXT_PUBLIC_MEETINGS_API_URL \
    NEXT_PUBLIC_MEETINGS_SOCKET_URL=$NEXT_PUBLIC_MEETINGS_SOCKET_URL \
    NEXT_PUBLIC_MIROTARACT_URL=$NEXT_PUBLIC_MIROTARACT_URL \
    NEXT_TELEMETRY_DISABLED=1
# Builds @mirotaract/sdk first, then the app (topological order).
RUN pnpm --filter "@mirotaract/meetings-web..." run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3002 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /workspace/apps/meetings-web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/meetings-web/.next/static ./apps/meetings-web/.next/static
USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3002/ || exit 1
CMD ["node", "apps/meetings-web/server.js"]

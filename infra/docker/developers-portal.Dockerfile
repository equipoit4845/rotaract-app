# Developer portal (docs/16-developer-portal.md): Next.js standalone on 3004.
FROM node:24-alpine AS build
WORKDIR /workspace
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/developers-portal/package.json apps/developers-portal/package.json
COPY packages/sdk-js/package.json packages/sdk-js/package.json
RUN pnpm install --frozen-lockfile=false --filter @mirotaract/developers-portal... --filter mirotaract-platform
COPY . .
# E8's shadcn registry and E10's llms.txt are optional inputs (contract
# interfaces); scripts/prepare-content.mjs skips them with a notice when
# their packages are not in this checkout.
RUN if [ -f packages/registry/package.json ]; then \
      pnpm install --frozen-lockfile=false --filter "@mirotaract/registry..." && \
      pnpm --filter "@mirotaract/registry" build; \
    fi
ARG NEXT_PUBLIC_SITE_URL=""
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN pnpm --filter @mirotaract/developers-portal build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3004 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /workspace/apps/developers-portal/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/developers-portal/.next/static ./apps/developers-portal/.next/static
COPY --from=build --chown=node:node /workspace/apps/developers-portal/public ./apps/developers-portal/public
USER node
EXPOSE 3004
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3004/ || exit 1
CMD ["node", "apps/developers-portal/server.js"]

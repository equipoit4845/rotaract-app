# Correo Distrital API (apps/correo-api). Same layout as meetings-api.Dockerfile.
FROM node:24-alpine AS base
WORKDIR /workspace
# git: @clickmail/sdk is installed from GitHub and compiled on install.
RUN apk add --no-cache git && corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/correo-api/package.json apps/correo-api/package.json
COPY packages/sdk-js/package.json packages/sdk-js/package.json
COPY packages/module-manifest packages/module-manifest
RUN pnpm install --frozen-lockfile=false --filter "@mirotaract/correo-api..."
COPY packages/sdk-js packages/sdk-js
COPY apps/correo-api apps/correo-api
# Builds @mirotaract/sdk first, then the app (topological order).
RUN pnpm --filter "@mirotaract/correo-api..." run build
EXPOSE 3006
# Migrations are applied on start, like the kernel api.
# pnpm only for the one-off migration; `exec node` so pnpm does not stay
# resident next to the app (~90 MB) and node receives SIGTERM directly.
CMD ["sh", "-c", "pnpm --filter @mirotaract/correo-api prisma:deploy && cd apps/correo-api && exec node dist/main"]

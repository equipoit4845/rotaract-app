# Reuniones distritales API (apps/meetings-api). Same layout as api.Dockerfile.
FROM node:24-alpine AS base
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/meetings-api/package.json apps/meetings-api/package.json
RUN pnpm install --frozen-lockfile=false --filter @mirotaract/meetings-api...
COPY apps/meetings-api apps/meetings-api
RUN pnpm --filter @mirotaract/meetings-api prisma:generate
RUN pnpm --filter @mirotaract/meetings-api build
ENV MEETINGS_UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads
EXPOSE 3003
# Migrations are applied on start, like the kernel api.
CMD ["sh", "-c", "pnpm --filter @mirotaract/meetings-api prisma:deploy && pnpm --filter @mirotaract/meetings-api start"]

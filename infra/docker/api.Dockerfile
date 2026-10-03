FROM node:24-alpine AS base
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/institutional-kernel-api/package.json apps/institutional-kernel-api/package.json
COPY packages/kernel-contracts/package.json packages/kernel-contracts/package.json
COPY packages/kernel-sdk/package.json packages/kernel-sdk/package.json
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm --filter @mirotaract/institutional-kernel-api prisma:generate
RUN pnpm --filter @mirotaract/institutional-kernel-api build
EXPOSE 3001
# pnpm only for the one-off migration; `exec node` so pnpm does not stay
# resident next to the app (~90 MB) and node receives SIGTERM directly.
CMD ["sh", "-c", "pnpm --filter @mirotaract/institutional-kernel-api prisma:deploy && cd apps/institutional-kernel-api && exec node dist/main"]

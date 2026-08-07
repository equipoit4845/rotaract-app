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
CMD ["sh", "-c", "pnpm --filter @mirotaract/institutional-kernel-api prisma:deploy && pnpm --filter @mirotaract/institutional-kernel-api start"]

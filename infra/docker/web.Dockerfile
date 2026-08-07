FROM node:24-alpine AS base
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/mirotaract-web/package.json apps/mirotaract-web/package.json
COPY packages/kernel-sdk/package.json packages/kernel-sdk/package.json
COPY packages/kernel-contracts/package.json packages/kernel-contracts/package.json
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm --filter @mirotaract/mirotaract-web build
EXPOSE 3000
CMD ["pnpm", "--filter", "@mirotaract/mirotaract-web", "start"]

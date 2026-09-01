FROM node:24-alpine AS base
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/mirotaract-web/package.json apps/mirotaract-web/package.json
COPY packages/admin-shell/package.json packages/admin-shell/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
COPY packages/icons/package.json packages/icons/package.json
COPY packages/kernel-sdk/package.json packages/kernel-sdk/package.json
COPY packages/kernel-contracts/package.json packages/kernel-contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile=false
COPY . .
ARG NEXT_PUBLIC_KERNEL_API_URL
ENV NEXT_PUBLIC_KERNEL_API_URL=$NEXT_PUBLIC_KERNEL_API_URL
RUN pnpm turbo run build --filter=@mirotaract/mirotaract-web
EXPOSE 3000
CMD ["pnpm", "--filter", "@mirotaract/mirotaract-web", "start"]

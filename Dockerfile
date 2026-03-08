FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copy dependency manifests and prisma schema (needed for postinstall)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/api/prisma/schema.prisma apps/api/prisma/
COPY packages/shared/package.json packages/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared packages/shared
COPY apps/api apps/api

# Generate Prisma client
RUN cd apps/api && npx prisma generate

EXPOSE 3001
CMD ["pnpm", "--filter", "api", "exec", "tsx", "src/index.ts"]

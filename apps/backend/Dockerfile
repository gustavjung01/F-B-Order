FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
RUN pnpm install --filter @fb-order/backend --frozen-lockfile
COPY apps/backend apps/backend
WORKDIR /app/apps/backend
RUN pnpm build
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["pnpm", "start"]

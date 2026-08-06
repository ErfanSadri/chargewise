FROM node:24-bookworm-slim AS build

ARG PNPM_VERSION=11.18.0

RUN npm install --global "pnpm@${PNPM_VERSION}"

WORKDIR /workspace

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm --filter @chargewise/api --prod deploy --legacy /prod/api

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV WEB_DIST_PATH=/app/web

WORKDIR /app

COPY --from=build --chown=node:node /prod/api/ ./
COPY --from=build --chown=node:node /workspace/apps/web/dist ./web

USER node

EXPOSE 10000

CMD ["sh", "-c", "node dist/deployment/migrate.js && exec node dist/server.js"]

FROM node:22-alpine AS service-build

WORKDIR /app

COPY package*.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @sidesubs/server --include-workspace-root=false

COPY tsconfig.base.json ./
COPY apps/server/tsconfig.json apps/server/tsconfig.json
COPY apps/server/src apps/server/src
RUN npm run build --workspace @sidesubs/server

FROM node:22-alpine AS web-build

WORKDIR /app

COPY package*.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @sidesubs/web --include-workspace-root=false

COPY tsconfig.base.json ./
COPY subtitleLanguages.json subtitleLanguages.json
COPY apps/web apps/web
RUN npm run build --workspace @sidesubs/web

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV SUBTITLE_LANGUAGES_PATH=/app/config/subtitleLanguages.json
ENV WEB_DIST_DIR=/app/web
WORKDIR /app

COPY package*.json ./
COPY apps/server/package.json apps/server/package.json
RUN npm ci --omit=dev --workspace @sidesubs/server --include-workspace-root=false

COPY --from=service-build /app/apps/server/dist ./dist
COPY --from=web-build /app/apps/web/dist ./web
COPY subtitleLanguages.json ./config/subtitleLanguages.json

EXPOSE 3000

CMD ["node", "dist/index.js"]

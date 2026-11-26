FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY apps/web ./apps/web
COPY packages/core ./packages/core
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/dist/web ./dist/web
COPY apps/server ./apps/server
COPY packages/core ./packages/core
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3001
CMD ["node", "apps/server/index.mjs"]

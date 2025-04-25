FROM node:20-slim AS builder

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim

WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/lib ./lib
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/package-lock.json ./

RUN npm ci --production && npm cache clean --force

ENV NODE_ENV="production"

# Run as non-root user
RUN adduser --disabled-password --gecos "" nodeuser && \
    chown -R nodeuser:nodeuser /usr/src/app
USER nodeuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD node healthcheck.js || exit 1

CMD ["npm", "run", "start:prod"]


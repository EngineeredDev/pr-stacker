# Stage 1: Builder
FROM node:20-slim AS builder
WORKDIR /usr/src/app

# Copy package files first to leverage layer caching
COPY package*.json ./
RUN npm ci --include=dev

# Copy remaining source files
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
WORKDIR /usr/src/app

# Copy built assets and production dependencies
COPY --from=builder /usr/src/app/lib ./lib
COPY --from=builder /usr/src/app/package*.json ./

# Install production-only dependencies and clean cache
RUN npm ci --omit=dev && \
    npm cache clean --force

# Use built-in non-root user
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD node healthcheck.js || exit 1
CMD ["npm", "run", "start:prod"]


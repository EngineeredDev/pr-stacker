# Stage 1: Builder
FROM node:20-alpine AS builder
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

# Copy built assets and package files
COPY --from=builder /usr/src/app/lib ./lib
COPY --from=builder /usr/src/app/package*.json ./

# Copy node_modules from builder and prune dev dependencies
COPY --from=builder /usr/src/app/node_modules ./node_modules
RUN npm prune --omit=dev && \
    npm cache clean --force

# Use built-in non-root user
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD node healthcheck.js || exit 1
CMD ["npm", "run", "start:prod"]


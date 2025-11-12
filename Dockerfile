# Multi-Tenant Transactional Email API (MTE-API)
# Dockerfile

# Build stage
FROM node:20-alpine AS base

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && ln -sf python3 /usr/bin/python

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY .eslintrc.js ./
COPY .prettierrc.json ./

# Install ALL dependencies (including dev) for build
RUN npm ci

# Copy source code
COPY src/ src/
COPY db/ db/

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mutte -u 1001

# Set working directory
WORKDIR /app

# Copy built application and node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/db ./db

# Create logs directory
RUN mkdir -p logs && chown -R mutte:nodejs logs

# Switch to non-root user
USER mutte

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); http.get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1));"

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]
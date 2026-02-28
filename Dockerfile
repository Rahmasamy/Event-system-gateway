# ─── Build Stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS base

# Security: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy package files first (layer caching — only reinstalls when deps change)
COPY package*.json ./

RUN npm ci --omit=dev

# Copy source
COPY src/ ./src/

# Set ownership
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

CMD ["node", "src/app.js"]
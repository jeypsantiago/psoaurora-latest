# Stage 1: Build the Vite app
FROM node:20-alpine AS builder
WORKDIR /app
ENV CI=true
ENV NODE_OPTIONS=--max-old-space-size=1024
COPY package*.json ./
# Clean install dependencies
RUN npm ci --no-audit --no-fund
COPY . .
# Build the static files
RUN npm run build

# Stage 2: Serve the app and production API with Node.js
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --omit=dev --no-audit --no-fund
EXPOSE 80
CMD ["node", "scripts/production-server.mjs"]

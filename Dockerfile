# ---- Stage 1: build the React frontend ----
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: install production backend deps ----
FROM node:22-alpine AS backend-deps
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev

# ---- Stage 3: runtime image ----
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=/app/public
WORKDIR /app
COPY --from=backend-deps /app/node_modules ./node_modules
COPY backend/package*.json ./
COPY backend/src ./src
COPY --from=frontend /build/dist ./public

# OpenShift runs containers with an arbitrary non-root UID that is always in group 0.
# Give group 0 the same permissions as the owner so any UID can read the app files.
RUN chgrp -R 0 /app && chmod -R g=u /app

USER 1001
EXPOSE 8080
CMD ["node", "src/server.js"]

# Én container med både API og frontend (SERVE_FRONTEND=true), så siden og API'et
# deler domæne, og login-cookien virker i alle browsere.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app/backend

# Afhængigheder først, så en ren kodeændring ikke kører npm ci igen.
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/src ./src
COPY frontend /app/frontend

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "src/server.js"]

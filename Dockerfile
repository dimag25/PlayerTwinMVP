FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    APP_ENV=preview \
    PORT=8888

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs ./
COPY index.html styles.css app.js ./
COPY platform-console.html platform-console.css platform-console.js ./
COPY assets ./assets

RUN useradd --create-home --shell /usr/sbin/nologin appuser \
  && mkdir -p /app/runtime-data/uploads \
  && chown -R appuser:appuser /app

USER appuser

EXPOSE 8888

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8888) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.mjs"]

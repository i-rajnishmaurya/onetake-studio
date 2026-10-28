# OneTake Studio — single container (API + SPA + render toolchain)
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    ffmpeg \
    build-essential python3-dev \
    # Playwright system deps (for engine/scripts/render.py)
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
COPY web/package.json web/
RUN npm install --no-audit --no-fund \
 && npm --prefix web install --no-audit --no-fund

COPY . .
RUN npm run web:build

# Playwright browsers for the Python renderer (optional; install at runtime if needed)
# RUN python3 -m pip install --break-system-packages playwright numpy pillow scipy \
#  && python3 -m playwright install chromium

ENV NODE_ENV=production
ENV PORT=10000
ENV DATA_DIR=/var/data
ENV PYTHON_BIN=python3
ENV FFMPEG_BIN=ffmpeg

RUN mkdir -p /var/data/videos /var/data/tmp /var/data/media

EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||10000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]

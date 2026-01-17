FROM node:20-slim

# Instala dependencias do Playwright
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia package.json e instala dependencias (incluindo devDependencies para build)
COPY package*.json ./
RUN npm ci

# Copia codigo fonte
COPY . .

# Gera cliente Prisma
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Instala browsers do Playwright
RUN npx playwright install chromium

# Expoe porta
EXPOSE 3000

# Comando padrao (API)
CMD ["node", "dist/index.js"]

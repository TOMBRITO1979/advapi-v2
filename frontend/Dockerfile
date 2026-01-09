FROM node:20-alpine AS builder

WORKDIR /app

# Copia package.json e instala dependencias
COPY package*.json ./
RUN npm ci

# Copia codigo fonte
COPY . .

# Build
RUN npm run build

# Imagem de producao com nginx
FROM nginx:alpine

# Copia arquivos do build
COPY --from=builder /app/dist /usr/share/nginx/html

# Configuracao do nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

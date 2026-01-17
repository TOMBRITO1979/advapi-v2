#!/bin/bash

# Script de deploy do ADVAPI v2

set -e

echo "==================================="
echo "ADVAPI v2 - Deploy Script"
echo "==================================="

# Diretorio do projeto
PROJECT_DIR="/root/projects/advwell/advapi-v2"
cd "$PROJECT_DIR"

# Build das imagens
echo ""
echo "[1/4] Building Docker images..."
docker build -t advapi-backend:latest ./backend
docker build -t advapi-frontend:latest ./frontend

# Roda migrations
echo ""
echo "[2/4] Running database migrations..."
docker run --rm \
  --network advapi_advapi_internal \
  -e DATABASE_URL=postgresql://advapi:advapi123@postgres:5432/advapi \
  advapi-backend:latest \
  npx prisma migrate deploy

# Deploy no Swarm
echo ""
echo "[3/4] Deploying to Docker Swarm..."
docker stack deploy -c docker-stack.yml advapi

# Aguarda services
echo ""
echo "[4/4] Waiting for services..."
sleep 10

# Verifica status
echo ""
echo "==================================="
echo "Deploy completed!"
echo "==================================="
echo ""
echo "Services status:"
docker service ls | grep advapi

echo ""
echo "URLs:"
echo "  - Dashboard: https://dash.advwell.com.br"
echo "  - API: https://api.advwell.com.br"
echo ""

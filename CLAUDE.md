# ADVAPI v2 - Instruções Claude

## Visao Geral
Sistema auxiliar para advwell.pro que faz raspagem de publicacoes juridicas no CNJ (HComunica).

## Arquitetura
- **Backend**: Node.js/Express + TypeScript + Prisma + PostgreSQL
- **Frontend**: React + Vite + Tailwind CSS
- **Filas**: Redis + BullMQ
- **Scraping**: Playwright
- **Deploy**: Docker Swarm com Traefik

## Estrutura Principal
```
backend/
  src/
    routes/           # Endpoints da API
    services/         # Logica de negocio (scraper.service.ts)
    workers/          # Workers BullMQ (scraper.worker.ts)
    middlewares/      # Auth, logging, API key
  prisma/             # Schema e migrations
frontend/
  src/
    pages/            # Paginas React
    services/api.ts   # Chamadas a API
```

## URLs Producao
- Dashboard: https://app.advtom.com
- API: https://api.advtom.com

## Servicos Docker Swarm
- `advapi_api` - API REST (1 replica)
- `advapi_worker` - Workers de scraping (3 replicas)
- `advapi_frontend` - Dashboard React/Nginx (1 replica)
- `advapi_postgres` - Banco PostgreSQL
- `advapi_redis` - Filas BullMQ

## Comandos Deploy
```bash
# Build (sempre usar --no-cache)
docker build --no-cache -t tomautomations/advapi:api-latest -f backend/Dockerfile ./backend
docker build --no-cache -t tomautomations/advapi:worker-latest -f backend/Dockerfile ./backend
docker build --no-cache -t tomautomations/advapi:frontend-latest -f frontend/Dockerfile ./frontend

# Push
docker push tomautomations/advapi:api-latest
docker push tomautomations/advapi:worker-latest
docker push tomautomations/advapi:frontend-latest

# Deploy
docker service update --image tomautomations/advapi:api-latest --force advapi_api
docker service update --image tomautomations/advapi:worker-latest --force advapi_worker
docker service update --image tomautomations/advapi:frontend-latest --force advapi_frontend

# Sincronizar banco (apos deploy)
docker exec $(docker ps -q -f name=advapi_api) npx prisma db push

# Logs
docker service logs advapi_api -f --tail 50
docker service logs advapi_worker -f --tail 50
```

## Fluxo Principal
1. AdvWell envia dados do advogado via POST /api/consulta
2. Job criado na fila BullMQ com prioridade
3. Worker executa raspagem no HComunica (5 anos, blocos de 1 ano)
4. Publicacoes salvas no banco com deduplicacao
5. Callback enviado para AdvWell com resultados (callbackUrl do advogado)

## Health Check de Proxies
- Executa automaticamente 2x ao dia (8h e 20h, horario Brasilia)
- Testa conectividade e acesso ao CNJ
- Detecta bloqueios especificos do CNJ
- Gera alertas no LogSistema (CRITICO/ERRO/ALERTA)
- Endpoint manual: POST /api/proxies/health-check

## Principais Endpoints
- POST /api/consulta - Criar consulta (usado pelo AdvWell)
- GET /api/consulta/:id/status - Status da consulta
- GET /api/advogados - Listar advogados
- GET /api/publicacoes - Listar publicacoes
- GET /api/proxies - Listar proxies
- GET /api/proxies/alertas - Proxies problematicos
- GET /api/logs - Logs do sistema
- GET /api/dashboard - Metricas

## Banco de Dados
- Advogado: cadastro com callbackUrl para webhook
- Publicacao: publicacoes encontradas no CNJ
- Proxy: proxies para rotacao durante scraping
- Consulta: jobs de raspagem
- LogSistema: logs e alertas
- ApiKey: autenticacao de parceiros
- ApiRequestLog: auditoria de requisicoes

## Variaveis de Ambiente
- DATABASE_URL: conexao PostgreSQL
- REDIS_URL: conexao Redis
- JWT_SECRET: secret para tokens
- NODE_ENV: production/development

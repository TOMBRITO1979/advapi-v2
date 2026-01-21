# ADVAPI v2 - Instruções Claude

## Visão Geral
Sistema auxiliar para advwell.pro que faz raspagem de publicações jurídicas no CNJ (HComunica).

## Arquitetura
- **Backend**: Node.js/Express + TypeScript + Prisma + PostgreSQL
- **Frontend**: React + Vite + Tailwind CSS
- **Filas**: Redis + BullMQ
- **Scraping**: Playwright
- **Proxies**: Webshare (rotação automática)
- **Deploy**: Docker Swarm com Traefik

## Estrutura Principal
```
backend/
  src/
    routes/           # Endpoints da API
    services/         # Lógica de negócio
      scraper.service.ts   # Raspagem CNJ
      webshare.service.ts  # Integração Webshare
      callback.service.ts  # Callbacks AdvWell
    workers/          # Workers BullMQ
    middlewares/      # Auth, logging, API key
  prisma/             # Schema do banco
frontend/
  src/
    pages/            # Páginas React
    services/api.ts   # Chamadas à API
```

## URLs Produção
- Dashboard: https://app.advtom.com
- API: https://api.advtom.com

## Serviços Docker Swarm
- `advapi_api` - API REST (1 réplica)
- `advapi_worker` - Workers de scraping (3 réplicas)
- `advapi_frontend` - Dashboard React/Nginx (1 réplica)
- `advapi_postgres` - Banco PostgreSQL
- `advapi_redis` - Filas BullMQ

## Comandos Deploy
```bash
# Build (sempre usar --no-cache)
cd /root/projects/advwell/advapi-v2/backend
docker build --no-cache -t tomautomations/advapi:api-latest -f Dockerfile .
docker build --no-cache -t tomautomations/advapi:worker-latest -f Dockerfile .
cd /root/projects/advwell/advapi-v2/frontend
docker build --no-cache -t tomautomations/advapi:frontend-latest -f Dockerfile .

# Push
docker push tomautomations/advapi:api-latest
docker push tomautomations/advapi:worker-latest
docker push tomautomations/advapi:frontend-latest

# Deploy
docker service update --image tomautomations/advapi:api-latest --force advapi_api
docker service update --image tomautomations/advapi:worker-latest --force advapi_worker
docker service update --image tomautomations/advapi:frontend-latest --force advapi_frontend

# Sincronizar banco (após deploy)
docker exec $(docker ps -q -f name=advapi_api) npx prisma db push

# Logs
docker service logs advapi_api -f --tail 50
docker service logs advapi_worker -f --tail 50
```

## Fluxo Principal
1. AdvWell envia dados do advogado via POST /api/consulta
2. Job criado na fila BullMQ com prioridade
3. Worker executa raspagem no HComunica (5 anos, blocos de 1 ano)
4. Publicações salvas no banco com deduplicação
5. Callback enviado para AdvWell com resultados

## Integração Webshare (Proxies)
- Sincronização automática de proxies
- Substituição automática quando proxy falha 5+ vezes
- Substituição imediata quando bloqueado pelo CNJ
- Endpoints: `/api/proxies/webshare/*`

## Políticas de Retenção (Automáticas)
- **Publicações**: Máximo 3 andamentos por processo (aplicado após cada raspagem)
- **Logs do Sistema**: Remove >30 dias (resolvidos) - executa 3h da manhã
- **API Request Logs**: Remove >30 dias - executa 3h da manhã
- **Execução Logs**: Remove >30 dias - executa 3h da manhã

## Variáveis de Ambiente (no Swarm)
- `DATABASE_URL` - Conexão PostgreSQL
- `REDIS_URL` - Conexão Redis
- `JWT_SECRET` - Secret para tokens
- `ADVWELL_API_KEY` - Chave para callback AdvWell
- `WEBSHARE_API_KEY` - Chave API Webshare
- `NODE_ENV` - production

## Principais Endpoints

### Consultas
- `POST /api/consulta` - Criar consulta (AdvWell)
- `GET /api/consulta/:id/status` - Status da consulta
- `GET /api/consulta/buffer` - Consulta direta no cache

### Advogados
- `GET /api/advogados` - Listar advogados
- `POST /api/advogados` - Criar advogado

### Publicações
- `GET /api/publicacoes` - Listar publicações

### Proxies
- `GET /api/proxies` - Listar proxies
- `GET /api/proxies/alertas` - Proxies problemáticos
- `POST /api/proxies/health-check` - Health check manual
- `POST /api/proxies/webshare/sincronizar` - Sincronizar Webshare
- `POST /api/proxies/webshare/substituir-falhos` - Substituir proxies com falha

### Sistema
- `GET /api/logs` - Logs do sistema
- `GET /api/dashboard/metricas` - Métricas
- `POST /api/auth/login` - Login dashboard

## Banco de Dados (PostgreSQL)
- `Advogado` - Cadastro com callbackUrl
- `Publicacao` - Publicações do CNJ
- `Proxy` - Proxies com integração Webshare
- `Consulta` - Jobs de raspagem
- `LogSistema` - Logs e alertas
- `ApiKey` - Autenticação de parceiros
- `ApiRequestLog` - Auditoria de requisições
- `Usuario` - Usuários do dashboard
- `Configuracao` - Configurações do sistema
- `ExecucaoLog` - Log de execuções

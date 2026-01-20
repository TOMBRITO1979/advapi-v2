# ADVAPI v2 - Instruções Claude

## Visão Geral
Sistema auxiliar para advwell.pro que faz raspagem de publicações jurídicas no CNJ (HComunica).

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
    routes/         # Endpoints da API
    services/       # Lógica de negócio (scraper.service.ts)
    workers/        # Workers BullMQ (scraper.worker.ts)
    middlewares/    # Auth, logging, API key
  prisma/           # Schema e migrations
frontend/
  src/
    pages/          # Páginas React
    services/api.ts # Chamadas à API
```

## URLs Produção
- Dashboard: https://app.advtom.com
- API: https://api.advtom.com

## Comandos Úteis
```bash
# Deploy
docker service update --image tomautomations/advapi:frontend-latest --force advapi_frontend
docker service update --image tomautomations/advapi:api-latest --force advapi_api
docker service update --image tomautomations/advapi:worker-latest --force advapi_worker

# Logs
docker service logs advapi_api -f
docker service logs advapi_worker -f

# Build e Push
docker build --no-cache -t tomautomations/advapi:api-latest ./backend
docker build --no-cache -t tomautomations/advapi:frontend-latest ./frontend
docker push tomautomations/advapi:api-latest
docker push tomautomations/advapi:frontend-latest
```

## Fluxo Principal
1. Advwell envia dados do advogado via POST /api/consulta
2. Job é criado na fila BullMQ
3. Worker executa raspagem no HComunica (5 anos, blocos de 1 ano)
4. Publicações salvas no banco
5. Webhook enviado para advwell com resultados

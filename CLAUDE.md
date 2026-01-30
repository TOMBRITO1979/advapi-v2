# ADVAPI v2 - Instruções Claude

## Visão Geral
Sistema de raspagem de publicações jurídicas no CNJ (HComunica) para advwell.pro.

## Arquitetura
- **Backend**: Node.js/Express + TypeScript + Prisma + PostgreSQL
- **Frontend**: React + Vite + Tailwind CSS
- **Filas**: Redis + BullMQ
- **Scraping**: Playwright (headless)
- **Proxies**: Webshare (100 proxies, rotação automática)
- **Deploy**: Docker Swarm + Traefik

## URLs Produção
- Dashboard: https://app.advtom.com
- API: https://api.advtom.com

## Estrutura
```
backend/src/
  routes/           # Endpoints REST
  services/         # Lógica de negócio
    scraper.service.ts   # Raspagem CNJ (200 páginas max)
    webshare.service.ts  # Integração Webshare
    callback.service.ts  # Callbacks AdvWell
  workers/          # Workers BullMQ (3 réplicas)
  middlewares/      # Auth, logging
  prisma/           # Schema PostgreSQL
frontend/src/
  pages/            # Dashboard React
  services/api.ts   # Chamadas API
```

## Deploy
```bash
# Build (sempre --no-cache)
cd /root/projects/advwell/advapi-v2/backend
docker build --no-cache -t tomautomations/advapi:api-latest -f Dockerfile .
docker build --no-cache -t tomautomations/advapi:worker-latest -f Dockerfile .
cd /root/projects/advwell/advapi-v2/frontend
docker build --no-cache -t tomautomations/advapi:frontend-latest -f Dockerfile .

# Push e Deploy
docker push tomautomations/advapi:api-latest
docker push tomautomations/advapi:worker-latest
docker push tomautomations/advapi:frontend-latest
docker service update --image tomautomations/advapi:api-latest --force advapi_api
docker service update --image tomautomations/advapi:worker-latest --force advapi_worker
docker service update --image tomautomations/advapi:frontend-latest --force advapi_frontend

# Logs
docker service logs advapi_worker -f --tail 100
```

## Configuração Scraper (Otimizado)
- Limite páginas: 200 (10.000 resultados)
- Delay consultas: 8-15 segundos
- Rate limit: 15/minuto
- Horário: 5h-23h, 7 dias/semana
- Retry: 2 tentativas por bloco/página
- Blocos: 1 ano cada (5 anos = 5 blocos)

## Fluxo
1. AdvWell → POST /api/consulta (advogadoId, nome, datas)
2. Job criado na fila BullMQ
3. Worker raspa HComunica (blocos de 1 ano)
4. Publicações salvas (deduplicação por processo)
5. Callback para AdvWell com resultados

## Endpoints Principais
- `POST /api/consulta` - Nova consulta
- `GET /api/advogados` - Listar advogados
- `GET /api/publicacoes` - Listar publicações
- `GET /api/proxies` - Listar proxies
- `GET /api/dashboard/metricas` - Métricas
- `POST /api/auth/login` - Login dashboard

## Banco de Dados
- `Advogado` - Cadastro + callbackUrl
- `Publicacao` - Publicações CNJ (72 por advogado típico)
- `Consulta` - Jobs com detalhes raspagem
- `Proxy` - 100 proxies Webshare
- `LogSistema` - Alertas e logs
- `ApiKey` - Autenticação parceiros
- `Usuario` - Usuários dashboard

## Variáveis Ambiente (Swarm)
- `DATABASE_URL` - PostgreSQL
- `REDIS_URL` - Redis
- `JWT_SECRET` - Tokens
- `WEBSHARE_API_KEY` - Proxies

## Limpeza Automática
- Logs >30 dias: 3h da manhã
- Health check proxies: 8h e 20h
- Reset contadores proxy: a cada hora

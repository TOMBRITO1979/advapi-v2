# ADVAPI v2 - Sistema de Monitoramento de Publicações Jurídicas

Sistema para monitoramento automático de publicações no Diário da Justiça Eletrônico (DJe) através do HComunica CNJ.

## Funcionalidades

- Monitoramento automático de publicações por advogado
- Suporte a múltiplos tribunais
- Sistema de proxies brasileiros para acesso ao HComunica
- Dashboard administrativo
- API RESTful
- Integração com AdvWell via webhooks

## Requisitos

- Docker e Docker Compose
- Node.js 20+ (para desenvolvimento)
- PostgreSQL 15+
- Redis 7+

## Instalação

### Desenvolvimento

1. Clone o repositório
2. Copie os arquivos de ambiente:
   ```bash
   cp .env.example .env
   cp backend/.env.example backend/.env
   ```

3. Configure as variáveis de ambiente no `.env`

4. Inicie os serviços:
   ```bash
   docker compose up -d
   ```

5. Execute as migrações:
   ```bash
   docker compose exec api npx prisma db push
   ```

### Produção (Docker Swarm)

1. Configure as variáveis de ambiente:
   ```bash
   export POSTGRES_PASSWORD="sua-senha-segura"
   export JWT_SECRET="seu-jwt-secret"
   export API_KEY="sua-api-key"
   export ADVWELL_API_KEY="sua-advwell-key"
   ```

2. Deploy do stack:
   ```bash
   docker stack deploy -c docker-stack.yml advapi
   ```

## Estrutura

```
advapi-v2/
├── backend/           # API Node.js + Express
│   ├── src/
│   │   ├── routes/    # Rotas da API
│   │   ├── services/  # Serviços (scraper, etc)
│   │   ├── workers/   # Workers de background
│   │   └── utils/     # Utilitários
│   └── prisma/        # Schema do banco
├── frontend/          # Dashboard React + Vite
└── docker-compose.yml # Configuração Docker
```

## API Endpoints

- `POST /api/auth/login` - Autenticação
- `GET /api/dashboard` - Dados do dashboard
- `GET /api/advogados` - Listar advogados
- `POST /api/advogados/:id/consultar` - Disparar consulta
- `GET /api/publicacoes` - Listar publicações
- `GET /api/proxies` - Listar proxies

## Licença

Privado - Todos os direitos reservados

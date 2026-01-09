# ADVAPI - Documentacao da API

**Base URL:** `https://api.advtom.com/api`

**Autenticacao:** Header `X-API-Key`
```
X-API-Key: advwell-integration-key
```

---

## 1. Cadastrar Advogado e Solicitar Busca

```http
POST /api/consulta
Content-Type: application/json
X-API-Key: advwell-integration-key
```

**Body:**
```json
{
  "companyId": "empresa-123",
  "advogadoNome": "JOAO DA SILVA",
  "advogadoOab": "123456",
  "ufOab": "RJ",
  "clientId": "cliente-456",
  "callbackUrl": "https://advwell.com/api/webhook/publicacoes",
  "tribunais": ["TJRJ", "TJSP"],
  "dataInicio": "2024-01-01",
  "dataFim": "2024-12-31"
}
```

| Campo | Obrigatorio | Descricao |
|-------|-------------|-----------|
| companyId | Sim | ID da empresa no AdvWell |
| advogadoNome | Sim | Nome completo do advogado (MAIUSCULAS) |
| advogadoOab | Nao | Numero da OAB |
| ufOab | Nao | UF da OAB |
| clientId | Nao | ID do cliente no AdvWell |
| callbackUrl | Nao | URL para receber novas publicacoes |
| tribunais | Nao | Lista de tribunais (ex: ["TJRJ"]) |
| dataInicio | Nao | Data inicio (se omitido: 12 meses atras) |
| dataFim | Nao | Data fim (se omitido: hoje) |

**Resposta:**
```json
{
  "message": "Consulta adicionada na fila",
  "consultaId": "abc123",
  "jobId": "job-456",
  "advogadoId": "adv-789",
  "status": "PENDENTE",
  "estimativa": "1-5 minutos"
}
```

---

## 2. Consultar Buffer (Instantaneo)

Retorna publicacoes ja salvas no banco, sem aguardar scraping.

```http
GET /api/consulta/buffer?companyId=empresa-123&advogadoNome=JOAO%20DA%20SILVA&limite=50
X-API-Key: advwell-integration-key
```

**Resposta:**
```json
{
  "encontrado": true,
  "advogado": {
    "id": "adv-789",
    "nome": "JOAO DA SILVA",
    "oab": "123456",
    "totalAndamentos": 45,
    "ultimaSincronizacao": "2024-01-09T10:00:00Z",
    "sincronizacaoAtiva": true
  },
  "totalPublicacoes": 45,
  "publicacoes": [
    {
      "id": "pub-001",
      "numeroProcesso": "0001234-56.2024.8.19.0001",
      "siglaTribunal": "TJRJ",
      "dataPublicacao": "2024-01-08",
      "tipoComunicacao": "Intimacao",
      "textoComunicacao": "Texto da publicacao...",
      "status": "NOVA"
    }
  ]
}
```

---

## 3. Consultar Processo Especifico

```http
GET /api/consulta/buffer/processo/0001234-56.2024.8.19.0001?companyId=empresa-123
X-API-Key: advwell-integration-key
```

**Resposta:**
```json
{
  "numeroProcesso": "0001234-56.2024.8.19.0001",
  "totalAndamentos": 3,
  "andamentos": [
    {
      "dataPublicacao": "2024-01-08",
      "tipoComunicacao": "Intimacao",
      "textoComunicacao": "...",
      "siglaTribunal": "TJRJ",
      "advogado": "JOAO DA SILVA"
    }
  ]
}
```

---

## 4. Verificar Status da Consulta

```http
GET /api/consulta/{consultaId}/status
X-API-Key: advwell-integration-key
```

**Resposta:**
```json
{
  "id": "abc123",
  "status": "CONCLUIDA",
  "advogado": "JOAO DA SILVA",
  "publicacoesEncontradas": 15,
  "erro": null,
  "iniciadoEm": "2024-01-09T10:00:00Z",
  "finalizadoEm": "2024-01-09T10:02:30Z"
}
```

---

## 5. Webhook - AdvWell envia para ADVAPI

```http
POST /api/webhook/advwell
X-API-Key: advwell-integration-key
```

**Eventos suportados:**
```json
// Desativar advogado
{
  "evento": "advogado.desativar",
  "dados": {
    "companyId": "empresa-123",
    "advogadoNome": "JOAO DA SILVA"
  }
}

// Ativar advogado
{
  "evento": "advogado.ativar",
  "dados": {
    "companyId": "empresa-123",
    "advogadoNome": "JOAO DA SILVA"
  }
}

// Desativar empresa inteira
{
  "evento": "empresa.desativar",
  "dados": {
    "companyId": "empresa-123"
  }
}
```

---

## 6. Callback - ADVAPI envia para AdvWell

Quando novas publicacoes sao encontradas, ADVAPI envia para a `callbackUrl` configurada:

```http
POST {callbackUrl}
Content-Type: application/json
X-API-Key: advwell-integration-key
```

**Body:**
```json
{
  "tipo": "nova_publicacao",
  "advogadoId": "cliente-456",
  "companyId": "empresa-123",
  "advogadoNome": "JOAO DA SILVA",
  "publicacao": {
    "numeroProcesso": "0001234-56.2024.8.19.0001",
    "siglaTribunal": "TJRJ",
    "dataPublicacao": "2024-01-08T00:00:00Z",
    "tipoComunicacao": "Intimacao",
    "textoComunicacao": "Texto completo da publicacao..."
  }
}
```

---

## Fluxo Recomendado

```
1. AdvWell cadastra advogado via POST /api/consulta
   -> ADVAPI busca historico (12 meses) e salva no banco
   -> Envia publicacoes para callbackUrl

2. A cada nova consulta do AdvWell:
   -> GET /api/consulta/buffer (instantaneo)
   -> Retorna dados do cache

3. ADVAPI sincroniza automaticamente:
   -> Segunda a Sabado, 7h-21h
   -> Busca novas publicacoes a cada 2h
   -> Envia para callbackUrl quando encontra novidades
```

---

## Configuracoes do Sistema

- **Horario de funcionamento:** 7h - 21h (Brasilia)
- **Dias:** Segunda a Sabado
- **Intervalo entre consultas:** 30s a 2min (aleatorio)
- **Sincronizacao automatica:** A cada 2h para advogados ativos
- **Dashboard:** https://advtom.com
- **API:** https://api.advtom.com

---

## Credenciais

- **API Key:** `advwell-integration-key`
- **Dashboard Admin:** admin@advapi.com

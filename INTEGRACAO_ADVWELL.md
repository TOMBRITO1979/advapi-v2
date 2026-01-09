# Integracao AdvWell com ADVAPI

## Visao Geral

A ADVAPI monitora publicacoes do Diario de Justica Eletronico (DJE) via CNJ e disponibiliza os dados via API REST.

---

## Autenticacao

Todas as requisicoes devem incluir o header `x-api-key`:

```
x-api-key: advapi_sk_sua_chave_aqui
```

**Importante:** A API key deve ser mantida em segredo. Nunca exponha no frontend ou em repositorios publicos.

---

## Base URL

```
https://api.advtom.com/api
```

---

## Endpoints Disponiveis

### 1. Consultar Publicacoes (Buffer)

Retorna publicacoes ja armazenadas no banco de dados. **Resposta instantanea**, nao inicia raspagem.

```
GET /api/consulta/buffer
```

**Parametros Query:**

| Parametro | Tipo | Obrigatorio | Descricao |
|-----------|------|-------------|-----------|
| companyId | string | Sim | ID da empresa no AdvWell |
| advogadoNome | string | Sim | Nome completo do advogado (exato como cadastrado) |
| dataInicio | string | Nao | Data inicial (formato: YYYY-MM-DD) |
| dataFim | string | Nao | Data final (formato: YYYY-MM-DD) |

**Exemplo de Requisicao:**

```bash
curl -X GET "https://api.advtom.com/api/consulta/buffer?companyId=123&advogadoNome=JOAO%20DA%20SILVA" \
  -H "x-api-key: advapi_sk_sua_chave_aqui"
```

**Resposta de Sucesso (advogado cadastrado):**

```json
{
  "encontrado": true,
  "advogado": {
    "id": "uuid-do-advogado",
    "nome": "JOAO DA SILVA",
    "oab": "RJ123456",
    "uf": "RJ"
  },
  "publicacoes": [
    {
      "id": "uuid-da-publicacao",
      "numeroProcesso": "0001234-56.2024.8.19.0001",
      "dataDisponibilizacao": "2024-01-15T00:00:00.000Z",
      "dataPublicacao": "2024-01-16T00:00:00.000Z",
      "tribunal": "TJRJ",
      "orgaoJulgador": "1a Vara Civel",
      "texto": "Texto completo da publicacao...",
      "parteAutor": "MARIA DOS SANTOS",
      "parteReu": "BANCO XYZ S/A",
      "comarca": "Capital",
      "classeProcessual": "PROCEDIMENTO COMUM CIVEL",
      "textoLimpo": "Texto sem HTML e formatado..."
    }
  ],
  "total": 1,
  "ultimaAtualizacao": "2024-01-15T10:30:00.000Z"
}
```

**Resposta quando advogado NAO esta cadastrado:**

```json
{
  "encontrado": false,
  "message": "Advogado nao cadastrado. Use POST /api/consulta para cadastrar e iniciar monitoramento.",
  "publicacoes": []
}
```

---

### 2. Cadastrar Advogado para Monitoramento

Cadastra um novo advogado e inicia o monitoramento de publicacoes.

```
POST /api/consulta
```

**Body (JSON):**

| Campo | Tipo | Obrigatorio | Descricao |
|-------|------|-------------|-----------|
| companyId | string | Sim | ID da empresa no AdvWell |
| advogadoNome | string | Sim | Nome completo do advogado |
| advogadoOab | string | Nao | Numero da OAB |
| ufOab | string | Nao | UF da OAB (RJ, SP, etc) |
| clientId | string | Nao | ID do cliente no AdvWell |
| callbackUrl | string | Nao | URL para webhook de notificacao |

```json
{
  "companyId": "123",
  "advogadoNome": "JOAO DA SILVA",
  "advogadoOab": "123456",
  "ufOab": "RJ"
}
```

**Exemplo de Requisicao:**

```bash
curl -X POST "https://api.advtom.com/api/consulta" \
  -H "x-api-key: advapi_sk_sua_chave_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "123",
    "advogadoNome": "JOAO DA SILVA",
    "advogadoOab": "123456",
    "ufOab": "RJ"
  }'
```

**Resposta:**

```json
{
  "message": "Consulta adicionada na fila",
  "consultaId": "uuid-da-consulta",
  "jobId": "123",
  "advogadoId": "uuid-do-advogado",
  "status": "PENDENTE",
  "estimativa": "1-5 minutos"
}
```

**Importante:**
- O cadastro adiciona o advogado a fila de processamento
- A raspagem ocorre automaticamente entre **7h-21h, segunda a sabado**
- Apos cadastrado, use o endpoint `/buffer` para consultar as publicacoes
- Se o advogado ja existe, apenas atualiza os dados e adiciona nova consulta

---

### 3. Listar Advogados Cadastrados

```
GET /api/advogados
```

**Parametros Query:**

| Parametro | Tipo | Obrigatorio | Descricao |
|-----------|------|-------------|-----------|
| companyId | string | Sim | ID da empresa |

**Exemplo:**

```bash
curl -X GET "https://api.advtom.com/api/advogados?companyId=123" \
  -H "x-api-key: advapi_sk_sua_chave_aqui"
```

---

## Campos das Publicacoes

| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | string | UUID unico da publicacao |
| numeroProcesso | string | Numero do processo (formato CNJ) |
| dataDisponibilizacao | string | Data de disponibilizacao no DJE (ISO 8601) |
| dataPublicacao | string | Data de publicacao (ISO 8601) |
| tribunal | string | Sigla do tribunal (TJRJ, TJSP, etc) |
| orgaoJulgador | string | Vara/Camara responsavel |
| texto | string | Texto original da publicacao |
| parteAutor | string | Nome(s) do(s) autor(es) - pode ser null |
| parteReu | string | Nome(s) do(s) reu(s) - pode ser null |
| comarca | string | Comarca do processo - pode ser null |
| classeProcessual | string | Tipo do processo - pode ser null |
| textoLimpo | string | Texto sem HTML/tags - pode ser null |

---

## Codigos de Erro

| Codigo | Descricao |
|--------|-----------|
| 401 | API Key nao fornecida ou invalida |
| 400 | Parametros obrigatorios ausentes |
| 404 | Recurso nao encontrado |
| 500 | Erro interno do servidor |

**Exemplo de erro:**

```json
{
  "error": "API Key invalida"
}
```

---

## Fluxo Recomendado de Integracao

```
1. Cadastrar advogado (POST /api/consulta)
         |
         v
2. Aguardar processamento (raspagem ocorre 7h-21h)
         |
         v
3. Consultar publicacoes (GET /api/consulta/buffer)
         |
         v
4. Repetir consulta periodicamente (ex: a cada hora)
```

---

## Exemplo Completo em JavaScript/Node.js

```javascript
const axios = require('axios');

const API_BASE = 'https://api.advtom.com/api';
const API_KEY = 'advapi_sk_sua_chave_aqui';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'x-api-key': API_KEY,
    'Content-Type': 'application/json'
  }
});

// Cadastrar advogado
async function cadastrarAdvogado(companyId, advogadoNome, advogadoOab, ufOab) {
  const response = await api.post('/consulta', {
    companyId,
    advogadoNome,
    advogadoOab,
    ufOab
  });
  return response.data;
}

// Consultar publicacoes
async function consultarPublicacoes(companyId, advogadoNome, dataInicio, dataFim) {
  const params = { companyId, advogadoNome };
  if (dataInicio) params.dataInicio = dataInicio;
  if (dataFim) params.dataFim = dataFim;

  const response = await api.get('/consulta/buffer', { params });
  return response.data;
}

// Uso
async function main() {
  const companyId = '123';
  const advogadoNome = 'JOAO DA SILVA';
  const advogadoOab = '123456';
  const ufOab = 'RJ';

  // Primeiro, verifica se ja tem publicacoes
  let resultado = await consultarPublicacoes(companyId, advogadoNome);

  if (!resultado.encontrado) {
    // Cadastra o advogado para monitoramento
    const cadastro = await cadastrarAdvogado(companyId, advogadoNome, advogadoOab, ufOab);
    console.log('Advogado cadastrado:', cadastro);
    console.log('Aguarde o processamento (1-5 min dentro do horario 7h-21h)');
  } else {
    console.log(`Encontradas ${resultado.total} publicacoes`);
    resultado.publicacoes.forEach(pub => {
      console.log(`- ${pub.numeroProcesso}: ${pub.classeProcessual}`);
    });
  }
}

main().catch(console.error);
```

---

## Exemplo em Python

```python
import requests

API_BASE = 'https://api.advtom.com/api'
API_KEY = 'advapi_sk_sua_chave_aqui'

headers = {
    'x-api-key': API_KEY,
    'Content-Type': 'application/json'
}

def cadastrar_advogado(company_id, advogado_nome, advogado_oab, uf_oab):
    response = requests.post(
        f'{API_BASE}/consulta',
        headers=headers,
        json={
            'companyId': company_id,
            'advogadoNome': advogado_nome,
            'advogadoOab': advogado_oab,
            'ufOab': uf_oab
        }
    )
    return response.json()

def consultar_publicacoes(company_id, advogado_nome, data_inicio=None, data_fim=None):
    params = {
        'companyId': company_id,
        'advogadoNome': advogado_nome
    }
    if data_inicio:
        params['dataInicio'] = data_inicio
    if data_fim:
        params['dataFim'] = data_fim

    response = requests.get(
        f'{API_BASE}/consulta/buffer',
        headers=headers,
        params=params
    )
    return response.json()

# Uso
resultado = consultar_publicacoes('123', 'JOAO DA SILVA')
if resultado['encontrado']:
    for pub in resultado['publicacoes']:
        print(f"Processo: {pub['numeroProcesso']}")
        print(f"Autor: {pub.get('parteAutor', 'N/A')}")
        print(f"Reu: {pub.get('parteReu', 'N/A')}")
        print('---')
```

---

## Observacoes Importantes

1. **Horario de Raspagem:** O worker processa entre 7h-21h (Brasilia), segunda a sabado
2. **Intervalo de Atualizacao:** Cada advogado e atualizado a cada 24 horas
3. **API Disponivel 24/7:** A API responde a qualquer momento, retornando dados do banco
4. **Nome do Advogado:** Use o nome EXATO como cadastrado (case sensitive)
5. **Rate Limit:** Nao ha limite definido, mas evite mais de 60 req/min

---

## Suporte

Em caso de duvidas ou problemas, entre em contato com a equipe ADVAPI.

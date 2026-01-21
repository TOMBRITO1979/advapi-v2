import { prisma } from '../utils/prisma.js';

const WEBSHARE_API_URL = 'https://proxy.webshare.io/api/v2';
const WEBSHARE_API_V3_URL = 'https://proxy.webshare.io/api/v3';

interface WebshareProxy {
  id: string;
  username: string;
  password: string;
  proxy_address: string;
  port: number;
  valid: boolean;
  last_verification: string;
  country_code: string;
  city_name: string;
  asn_name?: string;
  asn_number?: number;
  high_country_confidence?: boolean;
  created_at: string;
}

interface WebshareListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: WebshareProxy[];
}

interface WebshareReplacementResponse {
  id: number;
  to_replace: any;
  replace_with: any;
  dry_run: boolean;
  state: 'validating' | 'validated' | 'processing' | 'completed' | 'failed';
  proxies_removed: number | null;
  proxies_added: number | null;
  reason: string;
  error: string | null;
  error_code: string | null;
  created_at: string;
  dry_run_completed_at: string | null;
  completed_at: string | null;
}

export class WebshareService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.WEBSHARE_API_KEY || '';
  }

  /**
   * Verifica se a API Key está configurada
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Faz requisição para a API da Webshare
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.apiKey) {
      throw new Error('WEBSHARE_API_KEY não configurada');
    }

    const url = endpoint.startsWith('http') ? endpoint : `${WEBSHARE_API_URL}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webshare API error ${response.status}: ${errorText}`);
    }

    // Se for 204 No Content, retorna null
    if (response.status === 204) {
      return null as unknown as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * Lista todos os proxies da Webshare
   */
  async listarProxies(page: number = 1, pageSize: number = 100): Promise<WebshareListResponse> {
    return this.request<WebshareListResponse>(
      `/proxy/list/?mode=direct&page=${page}&page_size=${pageSize}`
    );
  }

  /**
   * Busca todos os proxies da Webshare (todas as páginas)
   */
  async buscarTodosProxies(): Promise<WebshareProxy[]> {
    const todosProxies: WebshareProxy[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.listarProxies(page, 100);
      todosProxies.push(...response.results);
      hasMore = response.next !== null;
      page++;
    }

    return todosProxies;
  }

  /**
   * Sincroniza proxies da Webshare com o banco local
   * - Adiciona novos proxies
   * - Atualiza credenciais de proxies existentes
   * - Remove proxies que não existem mais na Webshare
   */
  async sincronizarProxies(): Promise<{
    adicionados: number;
    atualizados: number;
    removidos: number;
    total: number;
  }> {
    console.log('[Webshare] Iniciando sincronização de proxies...');

    const proxiesWebshare = await this.buscarTodosProxies();
    console.log(`[Webshare] ${proxiesWebshare.length} proxies encontrados na Webshare`);

    const resultado = {
      adicionados: 0,
      atualizados: 0,
      removidos: 0,
      total: proxiesWebshare.length,
    };

    // Mapeia proxies da Webshare por IP:porta
    const webshareMap = new Map<string, WebshareProxy>();
    for (const proxy of proxiesWebshare) {
      const key = `${proxy.proxy_address}:${proxy.port}`;
      webshareMap.set(key, proxy);
    }

    // Busca todos os proxies locais
    const proxiesLocais = await prisma.proxy.findMany();
    const locaisMap = new Map<string, typeof proxiesLocais[0]>();
    for (const proxy of proxiesLocais) {
      const key = `${proxy.host}:${proxy.porta}`;
      locaisMap.set(key, proxy);
    }

    // Adiciona/atualiza proxies da Webshare
    for (const [key, wsProxy] of webshareMap) {
      const local = locaisMap.get(key);

      if (!local) {
        // Novo proxy - adiciona
        await prisma.proxy.create({
          data: {
            host: wsProxy.proxy_address,
            porta: wsProxy.port,
            usuario: wsProxy.username,
            senha: wsProxy.password,
            protocolo: 'http',
            ativo: true,
            funcionando: wsProxy.valid,
            webshareId: wsProxy.id,
          },
        });
        resultado.adicionados++;
        console.log(`[Webshare] Proxy adicionado: ${wsProxy.proxy_address}:${wsProxy.port}`);
      } else {
        // Proxy existente - atualiza credenciais se necessário
        const precisaAtualizar =
          local.usuario !== wsProxy.username ||
          local.senha !== wsProxy.password ||
          local.webshareId !== wsProxy.id;

        if (precisaAtualizar) {
          await prisma.proxy.update({
            where: { id: local.id },
            data: {
              usuario: wsProxy.username,
              senha: wsProxy.password,
              webshareId: wsProxy.id,
            },
          });
          resultado.atualizados++;
        }
      }
    }

    // Remove proxies que não existem mais na Webshare
    for (const [key, local] of locaisMap) {
      if (!webshareMap.has(key)) {
        await prisma.proxy.delete({
          where: { id: local.id },
        });
        resultado.removidos++;
        console.log(`[Webshare] Proxy removido: ${local.host}:${local.porta}`);
      }
    }

    console.log(`[Webshare] Sincronização concluída: ${resultado.adicionados} adicionados, ${resultado.atualizados} atualizados, ${resultado.removidos} removidos`);

    // Registra log do sistema
    await prisma.logSistema.create({
      data: {
        tipo: 'INFO',
        categoria: 'PROXY',
        titulo: 'Sincronização Webshare concluída',
        mensagem: `Proxies sincronizados com Webshare:\n- Adicionados: ${resultado.adicionados}\n- Atualizados: ${resultado.atualizados}\n- Removidos: ${resultado.removidos}\n- Total na Webshare: ${resultado.total}`,
      },
    });

    return resultado;
  }

  /**
   * Substitui um proxy específico por um novo da Webshare
   */
  async substituirProxy(ipAddress: string): Promise<WebshareReplacementResponse> {
    console.log(`[Webshare] Solicitando substituição do proxy: ${ipAddress}`);

    const response = await this.request<WebshareReplacementResponse>(
      `${WEBSHARE_API_V3_URL}/proxy/replace/`,
      {
        method: 'POST',
        body: JSON.stringify({
          to_replace: {
            type: 'ip_address',
            ip_addresses: [ipAddress],
          },
          replace_with: [
            {
              type: 'any',
              count: 1,
            },
          ],
          dry_run: false,
        }),
      }
    );

    console.log(`[Webshare] Substituição iniciada, ID: ${response.id}, estado: ${response.state}`);
    return response;
  }

  /**
   * Substitui múltiplos proxies de uma vez
   */
  async substituirProxies(ipAddresses: string[]): Promise<WebshareReplacementResponse> {
    console.log(`[Webshare] Solicitando substituição de ${ipAddresses.length} proxies`);

    const response = await this.request<WebshareReplacementResponse>(
      `${WEBSHARE_API_V3_URL}/proxy/replace/`,
      {
        method: 'POST',
        body: JSON.stringify({
          to_replace: {
            type: 'ip_address',
            ip_addresses: ipAddresses,
          },
          replace_with: [
            {
              type: 'any',
              count: ipAddresses.length,
            },
          ],
          dry_run: false,
        }),
      }
    );

    console.log(`[Webshare] Substituição iniciada, ID: ${response.id}`);
    return response;
  }

  /**
   * Verifica status de uma substituição
   */
  async verificarSubstituicao(replacementId: number): Promise<WebshareReplacementResponse> {
    return this.request<WebshareReplacementResponse>(
      `${WEBSHARE_API_V3_URL}/proxy/replace/${replacementId}/`
    );
  }

  /**
   * Aguarda uma substituição ser concluída
   */
  async aguardarSubstituicao(replacementId: number, maxTentativas: number = 30): Promise<WebshareReplacementResponse> {
    for (let i = 0; i < maxTentativas; i++) {
      const status = await this.verificarSubstituicao(replacementId);

      if (status.state === 'completed') {
        console.log(`[Webshare] Substituição ${replacementId} concluída: ${status.proxies_removed} removidos, ${status.proxies_added} adicionados`);
        return status;
      }

      if (status.state === 'failed') {
        throw new Error(`Substituição falhou: ${status.error_code} - ${status.error}`);
      }

      // Aguarda 2 segundos antes de verificar novamente
      await new Promise(r => setTimeout(r, 2000));
    }

    throw new Error('Timeout aguardando substituição ser concluída');
  }

  /**
   * Substitui proxy que falhou e sincroniza com banco local
   */
  async substituirProxyComFalha(proxyId: string): Promise<{
    sucesso: boolean;
    mensagem: string;
    novoProxy?: { host: string; porta: number };
  }> {
    const proxy = await prisma.proxy.findUnique({
      where: { id: proxyId },
    });

    if (!proxy) {
      return { sucesso: false, mensagem: 'Proxy não encontrado' };
    }

    try {
      // Solicita substituição na Webshare
      const replacement = await this.substituirProxy(proxy.host);

      // Aguarda conclusão
      const resultado = await this.aguardarSubstituicao(replacement.id);

      // Remove o proxy antigo do banco local
      await prisma.proxy.delete({
        where: { id: proxyId },
      });

      // Sincroniza para obter o novo proxy
      await this.sincronizarProxies();

      // Registra log
      await prisma.logSistema.create({
        data: {
          tipo: 'INFO',
          categoria: 'PROXY',
          titulo: `Proxy substituído via Webshare`,
          mensagem: `O proxy ${proxy.host}:${proxy.porta} foi substituído automaticamente pela Webshare.\nMotivo: ${resultado.reason || 'Falhas consecutivas'}`,
        },
      });

      return {
        sucesso: true,
        mensagem: `Proxy ${proxy.host}:${proxy.porta} substituído com sucesso`,
      };
    } catch (error: any) {
      console.error(`[Webshare] Erro ao substituir proxy: ${error.message}`);

      await prisma.logSistema.create({
        data: {
          tipo: 'ERRO',
          categoria: 'PROXY',
          titulo: 'Erro ao substituir proxy via Webshare',
          mensagem: `Não foi possível substituir o proxy ${proxy.host}:${proxy.porta}: ${error.message}`,
          proxyId: proxyId,
        },
      });

      return {
        sucesso: false,
        mensagem: error.message,
      };
    }
  }

  /**
   * Substitui todos os proxies com falhas
   */
  async substituirProxiesComFalha(): Promise<{
    total: number;
    substituidos: number;
    erros: number;
  }> {
    // Busca proxies que precisam ser substituídos
    const proxiesComFalha = await prisma.proxy.findMany({
      where: {
        OR: [
          { funcionando: false },
          { bloqueadoCnj: true },
          { necessitaSubstituicao: true },
          { falhasConsecutivas: { gte: 3 } },
        ],
      },
    });

    if (proxiesComFalha.length === 0) {
      return { total: 0, substituidos: 0, erros: 0 };
    }

    console.log(`[Webshare] ${proxiesComFalha.length} proxies precisam ser substituídos`);

    const resultado = {
      total: proxiesComFalha.length,
      substituidos: 0,
      erros: 0,
    };

    // Agrupa IPs para substituir de uma vez (mais eficiente)
    const ips = proxiesComFalha.map(p => p.host);

    try {
      // Substitui todos de uma vez
      const replacement = await this.substituirProxies(ips);
      const status = await this.aguardarSubstituicao(replacement.id);

      if (status.state === 'completed') {
        // Remove proxies antigos do banco
        await prisma.proxy.deleteMany({
          where: {
            id: { in: proxiesComFalha.map(p => p.id) },
          },
        });

        // Sincroniza para obter novos proxies
        await this.sincronizarProxies();

        resultado.substituidos = status.proxies_added || 0;

        // Registra log
        await prisma.logSistema.create({
          data: {
            tipo: 'INFO',
            categoria: 'PROXY',
            titulo: `${resultado.substituidos} proxies substituídos via Webshare`,
            mensagem: `Substituição em lote concluída:\n- Removidos: ${status.proxies_removed}\n- Adicionados: ${status.proxies_added}`,
          },
        });
      }
    } catch (error: any) {
      console.error(`[Webshare] Erro na substituição em lote: ${error.message}`);
      resultado.erros = proxiesComFalha.length;

      await prisma.logSistema.create({
        data: {
          tipo: 'ERRO',
          categoria: 'PROXY',
          titulo: 'Erro na substituição em lote via Webshare',
          mensagem: `Não foi possível substituir ${proxiesComFalha.length} proxies: ${error.message}`,
        },
      });
    }

    return resultado;
  }
}

// Instância singleton
export const webshareService = new WebshareService();

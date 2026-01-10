import { chromium, Browser, Page, Response } from 'playwright';
import { prisma } from '../utils/prisma.js';
import { normalizarNumeroProcesso } from '../utils/processo.js';

// URL correta do HComunica CNJ
const HCOMUNICA_URL = 'https://hcomunica.cnj.jus.br';

interface AdvogadoProcesso {
  nome: string;
  oab?: string | null;
}

interface ProcessoEncontrado {
  numeroProcesso: string;
  siglaTribunal: string;
  dataPublicacao: string | null;
  tipoComunicacao: string | null;
  textoComunicacao: string | null;
  // Campos extraidos
  textoLimpo: string | null;
  parteAutor: string | null;
  parteReu: string | null;
  comarca: string | null;
  classeProcessual: string | null;
  advogadosProcesso: AdvogadoProcesso[] | null;
  nomeOrgao: string | null;
}

interface DadosExtraidos {
  parteAutor: string | null;
  parteReu: string | null;
  comarca: string | null;
  classeProcessual: string | null;
  textoLimpo: string;
}

interface ProxyConfig {
  host: string;
  porta: number;
  usuario?: string | null;
  senha?: string | null;
  protocolo: string;
}

// Interface para resposta da API do HComunica
interface HComunicaResponse {
  content?: Array<{
    id?: number;
    numeroProcesso?: string;
    siglaTribunal?: string;
    dataDisponibilizacao?: string;
    tipoComunicacao?: string;
    nomeOrgao?: string;
    texto?: string;
    textoCategoria?: string;
    advogados?: Array<{ nome: string; numeroOab?: string }>;
  }>;
  totalElements?: number;
  totalPages?: number;
  number?: number;
  size?: number;
}

export class ScraperService {
  private browser: Browser | null = null;

  async iniciar(): Promise<void> {
    if (this.browser) return;

    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--ignore-certificate-errors',
      ],
    });
  }

  async finalizar(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private async obterProxy(): Promise<ProxyConfig | null> {
    const proxy = await prisma.proxy.findFirst({
      where: {
        ativo: true,
        funcionando: true,
      },
      orderBy: [
        { consultasHoraAtual: 'asc' },
        { ultimoUso: 'asc' },
      ],
    });

    if (proxy) {
      await prisma.proxy.update({
        where: { id: proxy.id },
        data: {
          consultasHoraAtual: { increment: 1 },
          ultimoUso: new Date(),
        },
      });

      return {
        host: proxy.host,
        porta: proxy.porta,
        usuario: proxy.usuario,
        senha: proxy.senha,
        protocolo: proxy.protocolo,
      };
    }

    return null;
  }

  private async registrarFalhaProxy(proxy: ProxyConfig, erro?: string): Promise<void> {
    // Atualiza status do proxy
    const proxyDb = await prisma.proxy.findFirst({
      where: { host: proxy.host, porta: proxy.porta },
    });

    if (proxyDb) {
      await prisma.proxy.update({
        where: { id: proxyDb.id },
        data: {
          consultasFalha: { increment: 1 },
          funcionando: false,
          ultimoErro: erro || 'Falha na conexao',
        },
      });

      // Registra log do sistema
      await prisma.logSistema.create({
        data: {
          tipo: 'ERRO',
          categoria: 'PROXY',
          titulo: `Proxy falhou: ${proxy.host}:${proxy.porta}`,
          mensagem: erro || 'O proxy parou de funcionar e foi desativado automaticamente.',
          proxyId: proxyDb.id,
        },
      });
    }
  }

  private async registrarErroScraper(titulo: string, mensagem: string, advogadoId?: string, consultaId?: string): Promise<void> {
    await prisma.logSistema.create({
      data: {
        tipo: 'ERRO',
        categoria: 'SCRAPER',
        titulo,
        mensagem,
        advogadoId,
        consultaId,
      },
    });
  }

  async buscarPublicacoes(
    nomeAdvogado: string,
    dataInicio: string,
    dataFim: string,
    tribunal?: string
  ): Promise<ProcessoEncontrado[]> {
    await this.iniciar();

    const proxy = await this.obterProxy();
    let context;

    try {
      const contextOptions: any = {
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ignoreHTTPSErrors: true,
      };

      if (proxy) {
        contextOptions.proxy = {
          server: `http://${proxy.host}:${proxy.porta}`,
          username: proxy.usuario || undefined,
          password: proxy.senha || undefined,
        };
      }

      context = await this.browser!.newContext(contextOptions);
      const page = await context.newPage();

      // Desabilita o Service Worker para capturar as chamadas reais da API
      await page.addInitScript(`
        // Bloqueia registro de Service Workers
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register = () => Promise.reject('SW disabled');
          // Desregistra SWs existentes
          navigator.serviceWorker.getRegistrations().then(registrations => {
            registrations.forEach(r => r.unregister());
          });
        }
        // Desabilita cache
        if ('caches' in window) {
          caches.keys().then(names => {
            names.forEach(name => caches.delete(name));
          });
        }
      `);

      // Armazena todas as respostas da API capturadas
      const apiResponses: HComunicaResponse[] = [];

      // Intercepta respostas da API real do HComunica (hcomunicaapi.cnj.jus.br)
      page.on('response', async (response: Response) => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';

        // Captura respostas da API real
        if (url.includes('hcomunicaapi.cnj.jus.br/api/v1/comunicacao') && contentType.includes('application/json')) {
          try {
            const json = await response.json();
            console.log(`[Scraper] *** API REAL INTERCEPTADA: ${url.substring(0, 120)}...`);

            // A API retorna os dados diretamente ou em content/data
            if (json) {
              const totalItems = json.totalElements || json.total || json.totalRegistros ||
                                (json.content ? json.content.length : 0) ||
                                (Array.isArray(json) ? json.length : 0);
              console.log(`[Scraper] Total elementos na pagina: ${totalItems}`);
              apiResponses.push(json);
            }
          } catch (e) {
            console.log(`[Scraper] Erro ao parsear API: ${e}`);
          }
        }
      });

      // Delay aleatorio para simular comportamento humano
      const delay = 2000 + Math.random() * 3000;
      await new Promise((r) => setTimeout(r, delay));

      // Monta URL com parametros
      const params = new URLSearchParams({
        nomeAdvogado: nomeAdvogado.trim(),
        dataDisponibilizacaoInicio: dataInicio,
        dataDisponibilizacaoFim: dataFim,
      });
      if (tribunal) {
        params.set('siglaTribunal', tribunal.toUpperCase());
      }

      const url = `${HCOMUNICA_URL}/consulta?${params.toString()}`;

      console.log(`[Scraper] Buscando publicacoes para: ${nomeAdvogado}`);
      console.log(`[Scraper] Periodo: ${dataInicio} a ${dataFim}`);
      console.log(`[Scraper] URL: ${url}`);
      if (proxy) console.log(`[Scraper] Usando proxy: ${proxy.host}:${proxy.porta}`);

      // Acessa a pagina
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

      // Aguarda a SPA carregar e fazer as chamadas XHR
      await page.waitForTimeout(10000);

      // Se capturou respostas da API, extrai os processos
      let processos: ProcessoEncontrado[] = [];

      if (apiResponses.length > 0) {
        console.log(`[Scraper] ${apiResponses.length} respostas de API capturadas`);
        processos = this.extrairProcessosDaApi(apiResponses);

        // Se a API tem paginacao, navega pelas paginas
        const primeiraResposta = apiResponses[0];
        if (primeiraResposta.totalPages && primeiraResposta.totalPages > 1) {
          console.log(`[Scraper] API tem ${primeiraResposta.totalPages} paginas, navegando...`);
          const maisProcessos = await this.navegarPaginasApi(page, primeiraResposta.totalPages);
          processos.push(...maisProcessos);
        }
      }

      // Fallback: extrai do HTML se API nao foi capturada
      if (processos.length === 0) {
        console.log(`[Scraper] API nao capturada, extraindo do HTML...`);
        processos = await this.extrairTodosProcessos(page);
      }

      // Remove duplicados
      const processosUnicos = this.removerDuplicados(processos);

      console.log(`[Scraper] Total encontrados: ${processosUnicos.length} processos`);

      await context.close();
      return processosUnicos;
    } catch (error: any) {
      console.error(`[Scraper] Erro: ${error.message}`);

      // Detecta tipo de erro
      const mensagemErro = error.message || 'Erro desconhecido';
      const isBloqueio = mensagemErro.includes('blocked') ||
                         mensagemErro.includes('403') ||
                         mensagemErro.includes('captcha') ||
                         mensagemErro.includes('rate limit');

      if (proxy) {
        await this.registrarFalhaProxy(proxy, mensagemErro);
      }

      // Registra erro do scraper
      await this.registrarErroScraper(
        isBloqueio ? 'Possivel bloqueio detectado' : 'Erro ao buscar publicacoes',
        `Erro durante scraping para ${nomeAdvogado}: ${mensagemErro}`,
      );

      if (context) {
        await context.close();
      }

      throw error;
    }
  }

  /**
   * Extrai processos das respostas capturadas da API
   */
  private extrairProcessosDaApi(responses: HComunicaResponse[]): ProcessoEncontrado[] {
    const processos: ProcessoEncontrado[] = [];

    for (const response of responses) {
      const items = response.content || (response as any).data || [];

      if (!Array.isArray(items)) continue;

      for (const item of items) {
        if (!item.numeroProcesso) continue;

        const textoBruto = item.texto ? item.texto.substring(0, 5000) : null;
        const dadosExtraidos = this.extrairDadosEstruturados(textoBruto);

        // Extrai advogados do processo
        const advogadosProcesso: AdvogadoProcesso[] | null = item.advogados && item.advogados.length > 0
          ? item.advogados.map((adv: { nome: string; numeroOab?: string }) => ({ nome: adv.nome, oab: adv.numeroOab || null }))
          : null;

        // Usa nomeOrgao da API se disponivel, senao extrai do texto
        const nomeOrgao = item.nomeOrgao || dadosExtraidos.nomeOrgao || null;

        processos.push({
          numeroProcesso: normalizarNumeroProcesso(item.numeroProcesso),
          siglaTribunal: item.siglaTribunal || this.extrairTribunalDoNumero(item.numeroProcesso),
          dataPublicacao: item.dataDisponibilizacao ? item.dataDisponibilizacao.split('T')[0] : null,
          tipoComunicacao: item.tipoComunicacao || item.textoCategoria || null,
          textoComunicacao: textoBruto,
          textoLimpo: dadosExtraidos.textoLimpo || null,
          parteAutor: dadosExtraidos.parteAutor,
          parteReu: dadosExtraidos.parteReu,
          comarca: dadosExtraidos.comarca,
          classeProcessual: dadosExtraidos.classeProcessual,
          advogadosProcesso,
          nomeOrgao,
        });
      }
    }

    return processos;
  }

  /**
   * Navega pelas paginas da API clicando no botao de proxima pagina
   */
  private async navegarPaginasApi(page: Page, totalPages: number): Promise<ProcessoEncontrado[]> {
    const todosProcessos: ProcessoEncontrado[] = [];
    const maxPaginas = Math.min(totalPages, 50); // Limite de seguranca

    for (let pagina = 2; pagina <= maxPaginas; pagina++) {
      console.log(`[Scraper] Navegando para pagina ${pagina}/${totalPages}...`);

      // Armazena respostas desta pagina
      const paginaResponses: HComunicaResponse[] = [];

      const responseHandler = async (response: Response) => {
        const url = response.url();
        if (url.includes('/comunicacoes') || url.includes('/api/')) {
          try {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('application/json')) {
              const json = await response.json();
              if (json && json.content) {
                paginaResponses.push(json);
              }
            }
          } catch (e) {}
        }
      };

      page.on('response', responseHandler);

      // Tenta clicar no botao de proxima pagina
      const clicou = await this.irParaProximaPagina(page);
      if (!clicou) {
        console.log(`[Scraper] Nao conseguiu ir para pagina ${pagina}`);
        break;
      }

      // Aguarda carregar
      await page.waitForTimeout(3000);

      // Remove o handler para nao duplicar
      page.removeListener('response', responseHandler);

      // Extrai processos desta pagina
      if (paginaResponses.length > 0) {
        const processosPagina = this.extrairProcessosDaApi(paginaResponses);
        console.log(`[Scraper] Pagina ${pagina}: ${processosPagina.length} processos`);
        todosProcessos.push(...processosPagina);
      }
    }

    return todosProcessos;
  }

  /**
   * Remove processos duplicados (compara numeros normalizados)
   */
  private removerDuplicados(processos: ProcessoEncontrado[]): ProcessoEncontrado[] {
    const vistos = new Set<string>();
    return processos.filter(p => {
      const numNormalizado = normalizarNumeroProcesso(p.numeroProcesso);
      if (vistos.has(numNormalizado)) return false;
      vistos.add(numNormalizado);
      return true;
    });
  }

  /**
   * Extrai processos de TODAS as paginas navegando pela paginacao (fallback HTML)
   */
  private async extrairTodosProcessos(page: Page): Promise<ProcessoEncontrado[]> {
    const todosProcessos: ProcessoEncontrado[] = [];
    const processosVistos = new Set<string>();
    let paginaAtual = 1;
    const maxPaginas = 100;

    while (paginaAtual <= maxPaginas) {
      console.log(`[Scraper] Extraindo pagina ${paginaAtual} (HTML)...`);

      const processosPagina = await this.extrairProcessosDoHtml(page);

      let novos = 0;
      for (const proc of processosPagina) {
        if (!processosVistos.has(proc.numeroProcesso)) {
          processosVistos.add(proc.numeroProcesso);
          todosProcessos.push(proc);
          novos++;
        }
      }

      console.log(`[Scraper] Pagina ${paginaAtual}: ${processosPagina.length} encontrados, ${novos} novos`);

      if (novos === 0 && paginaAtual > 1) {
        console.log(`[Scraper] Nenhum processo novo, finalizando`);
        break;
      }

      const temProxima = await this.irParaProximaPagina(page);
      if (!temProxima) {
        console.log(`[Scraper] Ultima pagina alcancada`);
        break;
      }

      paginaAtual++;
      await page.waitForTimeout(3000);
    }

    return todosProcessos;
  }

  /**
   * Tenta navegar para a proxima pagina de resultados
   */
  private async irParaProximaPagina(page: Page): Promise<boolean> {
    try {
      const seletores = [
        'button:has-text("Próximo")',
        'button:has-text("Proximo")',
        'button:has-text("próximo")',
        'a:has-text("Próximo")',
        'a:has-text(">")',
        '[aria-label="Next page"]',
        '[aria-label="Próxima página"]',
        '.mat-paginator-navigation-next:not([disabled])',
        'button.mat-paginator-navigation-next:not([disabled])',
        '.pagination-next:not(.disabled)',
        'li.next:not(.disabled) a',
        '[class*="next"]:not([disabled])',
        'button[mat-icon-button]:has(mat-icon:has-text("chevron_right"))',
      ];

      for (const seletor of seletores) {
        const botao = await page.$(seletor);
        if (botao) {
          const isDisabled = await botao.evaluate((el: any) => {
            return el.disabled ||
              el.classList.contains('disabled') ||
              el.getAttribute('aria-disabled') === 'true';
          });

          if (!isDisabled) {
            await botao.click();
            await page.waitForTimeout(2000);
            return true;
          }
        }
      }

      // Fallback: scroll infinito
      const alturaAntes = await page.evaluate('document.body.scrollHeight') as number;
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await page.waitForTimeout(2000);
      const alturaDepois = await page.evaluate('document.body.scrollHeight') as number;

      if (alturaDepois > alturaAntes) {
        return true;
      }

      return false;
    } catch (error) {
      console.log(`[Scraper] Erro ao navegar: ${error}`);
      return false;
    }
  }

  /**
   * Extrai processos do HTML renderizado (fallback)
   */
  private async extrairProcessosDoHtml(page: Page): Promise<ProcessoEncontrado[]> {
    const html = await page.content();

    // Regex para numeros de processo CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO
    const regexCNJ = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g;
    const matches = html.match(regexCNJ) || [];

    // Remove duplicados e placeholders
    const processosUnicos = [...new Set(matches)].filter(p => !p.startsWith('0000000'));

    console.log(`[Scraper] Processos encontrados no HTML: ${processosUnicos.length}`);

    const processos: ProcessoEncontrado[] = [];

    for (const numero of processosUnicos) {
      const pub: ProcessoEncontrado = {
        numeroProcesso: normalizarNumeroProcesso(numero),
        siglaTribunal: this.extrairTribunalDoNumero(numero),
        dataPublicacao: null,
        tipoComunicacao: null,
        textoComunicacao: null,
        textoLimpo: null,
        parteAutor: null,
        parteReu: null,
        comarca: null,
        classeProcessual: null,
        advogadosProcesso: null,
        nomeOrgao: null,
      };

      const idx = html.indexOf(numero);
      if (idx > 0) {
        const contexto = html.substring(Math.max(0, idx - 1500), idx + 1500);

        const matchData = contexto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (matchData) {
          pub.dataPublicacao = `${matchData[3]}-${matchData[2]}-${matchData[1]}`;
        }

        const tipoMatch = contexto.match(/(intimação|citação|despacho|sentença|acórdão|decisão|edital)/i);
        if (tipoMatch) {
          pub.tipoComunicacao = tipoMatch[1].toUpperCase();
        }

        // Guarda texto bruto
        pub.textoComunicacao = contexto.substring(0, 5000);

        // Extrai dados estruturados
        const dadosExtraidos = this.extrairDadosEstruturados(contexto);
        pub.textoLimpo = dadosExtraidos.textoLimpo || null;
        pub.parteAutor = dadosExtraidos.parteAutor;
        pub.parteReu = dadosExtraidos.parteReu;
        pub.comarca = dadosExtraidos.comarca;
        pub.classeProcessual = dadosExtraidos.classeProcessual;
        pub.nomeOrgao = dadosExtraidos.nomeOrgao || null;
      }

      processos.push(pub);
    }

    return processos;
  }

  private limparHtml(html: string): string {
    let texto = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<\/?[a-z][^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/_ngcontent[^=]*="[^"]*"/gi, ' ')
      .replace(/_ngcontent[^\s>]*/gi, ' ')
      .replace(/\b(ng|mat|cdk|aria|tabindex|class|id|role|style|href|src)\w*="[^"]*"/gi, ' ')
      .replace(/\b(ng|mat|cdk|aria)[a-z-]*(?=\s|>|$)/gi, ' ')
      .replace(/mattablabelwrapper/gi, ' ')
      .replace(/mat-ripple/gi, ' ')
      .replace(/cdkmonitorelementfocus/gi, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, ' ')
      .replace(/[{}[\]|\\<>]/g, ' ')
      .replace(/\b(div|span|button|input|label|form|table|tr|td|th|ul|li|ol|img|a|p|h[1-6]|br|hr)\b(?!\s+[A-Z])/gi, ' ')
      .replace(/\biv\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (texto.match(/^[^A-Z0-9]{0,20}/i)) {
      texto = texto.replace(/^[^A-Za-z0-9]+/, '');
    }

    return texto;
  }

  private extrairTribunalDoNumero(numeroProcesso: string): string {
    const partes = numeroProcesso.split('.');
    if (partes.length >= 4) {
      const justica = partes[2];
      const tribunal = partes[3];

      const mapaJustica: Record<string, string> = {
        '8': 'TJ',
        '4': 'TRF',
        '5': 'TRT',
        '1': 'STF',
        '2': 'CNJ',
        '6': 'TSE',
        '7': 'TRE',
        '9': 'STM',
      };

      const siglaJustica = mapaJustica[justica] || 'TJ';
      return `${siglaJustica}${tribunal}`;
    }

    return 'DJEN';
  }

  /**
   * Extrai dados estruturados do texto da publicacao
   */
  extrairDadosEstruturados(texto: string | null): DadosExtraidos & { nomeOrgao?: string | null } {
    if (!texto) {
      return {
        parteAutor: null,
        parteReu: null,
        comarca: null,
        classeProcessual: null,
        textoLimpo: '',
        nomeOrgao: null,
      };
    }

    // Primeiro limpa o texto
    const textoLimpo = this.limparTextoCompleto(texto);

    // Extrai AUTOR - busca entre "AUTOR:" e "REU:" ou "RÉU:"
    let parteAutor: string | null = null;
    const autorPatterns = [
      /AUTOR[ES]?:\s*([^]*?)(?=R[ÉE]U|REQUERIDO|EXECUTADO|APELADO|ADVOGADO|OAB|$)/i,
      /REQUERENTE[S]?:\s*([^]*?)(?=REQUERIDO|R[ÉE]U|ADVOGADO|OAB|$)/i,
      /EXEQUENTE[S]?:\s*([^]*?)(?=EXECUTADO|R[ÉE]U|ADVOGADO|OAB|$)/i,
      /RECLAMANTE[S]?:\s*([^]*?)(?=RECLAMAD[OA]|R[ÉE]U|ADVOGADO|OAB|$)/i,
      /APELANTE[S]?:\s*([^]*?)(?=APELAD[OA]|R[ÉE]U|ADVOGADO|OAB|$)/i,
      /AGRAVANTE[S]?:\s*([^]*?)(?=AGRAVAD[OA]|R[ÉE]U|ADVOGADO|OAB|$)/i,
    ];
    for (const pattern of autorPatterns) {
      const match = texto.match(pattern);
      if (match && match[1]) {
        parteAutor = this.limparNomeParte(match[1]);
        if (parteAutor) break;
      }
    }

    // Extrai REU - busca entre "REU:" e proxima secao
    let parteReu: string | null = null;
    const reuPatterns = [
      /(?:R[ÉE]US?|REQUERIDOS?|EXECUTADOS?|APELADOS?):\s*([^]*?)(?=SENTEN[CÇ]|DECIS[AÃ]O|DESPACHO|INTIMA[CÇ][AÃ]O|CITA[CÇ][AÃ]O|Vistos|Ante|Diante|Trata-se|ADVOGADO|OAB|$)/i,
      /RECLAMAD[OA][S]?:\s*([^]*?)(?=SENTEN[CÇ]|DECIS[AÃ]O|DESPACHO|ADVOGADO|OAB|$)/i,
      /AGRAVAD[OA][S]?:\s*([^]*?)(?=SENTEN[CÇ]|DECIS[AÃ]O|DESPACHO|ADVOGADO|OAB|$)/i,
    ];
    for (const pattern of reuPatterns) {
      const match = texto.match(pattern);
      if (match && match[1]) {
        parteReu = this.limparNomeParte(match[1]);
        if (parteReu) break;
      }
    }

    // Extrai COMARCA
    let comarca: string | null = null;
    const comarcaPatterns = [
      /Comarca\s+(?:da\s+|de\s+)?([^\n,<]+?)(?:\s+Pal[aá]cio|\s+Rua|\s+Avenida|\s+Travessa|\s+CEP|\n|,|<)/i,
      /(?:Foro|Vara)\s+(?:da\s+|de\s+|do\s+)?Comarca\s+(?:da\s+|de\s+)?([^\n,<]+)/i,
    ];
    for (const pattern of comarcaPatterns) {
      const match = texto.match(pattern);
      if (match && match[1]) {
        comarca = match[1].trim().replace(/\s+/g, ' ');
        comarca = comarca.replace(/^Regional\s+(?:da\s+|de\s+)?/i, 'Regional ');
        if (comarca && comarca.length > 3) break;
      }
    }

    // Extrai CLASSE PROCESSUAL
    let classeProcessual: string | null = null;
    const classePatterns = [
      /Classe[:\s]+([^\n(<]+?)(?:\s*\(|\n|<|$)/i,
      /Classe\s+Processual[:\s]+([^\n(<]+?)(?:\s*\(|\n|<|$)/i,
      /(?:Ação|Acao|Procedimento)[:\s]+([^\n(<]+?)(?:\s*\(|\n|<|$)/i,
    ];
    for (const pattern of classePatterns) {
      const match = texto.match(pattern);
      if (match && match[1]) {
        classeProcessual = match[1].trim().toUpperCase();
        if (classeProcessual && classeProcessual.length > 3) break;
      }
    }

    // Extrai ORGAO JULGADOR do texto
    let nomeOrgao: string | null = null;
    const orgaoPatterns = [
      /[ÓO]rg[ãa]o[:\s]+([^\n<]+?)(?:\s+Data|\s+Processo|\n|<|$)/i,
      /[ÓO]rg[ãa]o\s+Julgador[:\s]+([^\n<]+?)(?:\s+Data|\s+Processo|\n|<|$)/i,
      /Vara[:\s]+(\d+[ªºa]\s+Vara[^\n<]+?)(?:\s+Data|\s+Processo|\n|<|$)/i,
      /distribu[ií]do\s+para\s+([^\n<]+?)(?:\s+na\s+data|\n|<|$)/i,
      /Gabinete[:\s]+(\d+[^\n<]+?)(?:\s+Data|\n|<|$)/i,
    ];
    for (const pattern of orgaoPatterns) {
      const match = texto.match(pattern);
      if (match && match[1]) {
        nomeOrgao = match[1].trim().replace(/\s+/g, ' ');
        if (nomeOrgao && nomeOrgao.length > 3) break;
      }
    }

    return {
      parteAutor,
      parteReu,
      comarca,
      classeProcessual,
      textoLimpo,
      nomeOrgao,
    };
  }

  /**
   * Limpa nome da parte (autor/reu)
   */
  private limparNomeParte(texto: string): string | null {
    let limpo = texto
      .replace(/<[^>]+>/g, ' ')
      .replace(/_ngcontent[^=]*="[^"]*"/gi, ' ')
      .replace(/\b(ng|mat|cdk|aria)[a-z-]*(?:="[^"]*")?/gi, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

    // Remove textos que nao sao nomes (textos de decisoes judiciais)
    limpo = limpo
      .replace(/Processo.*$/i, '')
      .replace(/OAB.*$/i, '')
      .replace(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g, '')
      // Remove textos de decisoes que aparecem apos o nome da parte
      .replace(/\s+(Considerando|HOMOLOGO|JULGO|Defiro|Indefiro|Cite-se|Intime-se|Vistos|Ante o exposto|Diante do exposto|Trata-se|Tratando-se|Em face|Por todo|Tendo em vista|Conforme|Nos termos|À vista|Em razão|1\.|2\.|3\.|1-|2-|3-).*$/i, '')
      // Remove textos que comecam com numeros seguidos de ponto (ex: "1. Ao Autor")
      .replace(/\s+\d+\.\s+[A-Z].*$/i, '')
      .trim();

    // Se ficou muito curto ou e apenas numeros/pontuacao, retorna null
    if (!limpo || limpo.length < 3 || !/[a-zA-ZÀ-ú]/.test(limpo)) {
      return null;
    }

    return limpo.substring(0, 500); // Limita tamanho
  }

  /**
   * Limpa texto completo removendo HTML e tags Angular
   */
  private limparTextoCompleto(texto: string): string {
    return texto
      // Remove scripts e styles
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      // Remove tags HTML
      .replace(/<\/?[a-z][^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      // Remove atributos HTML com valores
      .replace(/\w+="[^"]*"/g, ' ')
      .replace(/="[^"]*"/g, ' ')
      .replace(/="\w*/g, ' ')
      // Remove classes CSS (col-md-1, etc)
      .replace(/\b[a-z]+-[a-z]+-\d+\b/gi, ' ')
      .replace(/\bcol-\w+/gi, ' ')
      // Remove fragmentos Angular/data attributes
      .replace(/_ng[\w-]*/gi, ' ')
      .replace(/content-[\w-]+/gi, ' ')
      .replace(/\bdata-[\w-]*/gi, ' ')
      .replace(/\bt-icon\b/gi, ' ')
      .replace(/\b_[a-z]\b/gi, ' ')
      // Remove palavras Angular/Material
      .replace(/\b(ng|mat|cdk|aria|tyx)[\w-]*/gi, ' ')
      .replace(/\b(tabindex|class|id|role|style|href|src)\b/gi, ' ')
      .replace(/mattablabelwrapper/gi, ' ')
      .replace(/cdkmonitorelementfocus/gi, ' ')
      // Remove entidades HTML
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&[a-z]+;/gi, ' ')
      // Remove caracteres especiais
      .replace(/[<>{}[\]|\\="]/g, ' ')
      // Remove tags HTML soltas
      .replace(/\b(div|span|button|input|label|form|table|tr|td|th|ul|li|ol|img|br|hr|iv)\b/gi, ' ')
      // Remove palavras de interface
      .replace(/\b(Imprimir|Copiar sem formatação|Copiar)\b/gi, ' ')
      // Remove SIGLA numero antes de Processo
      .replace(/([A-Z]{2,5}\d*)\s+\d+\s+(Processo)/gi, '$1 $2')
      // Normaliza espacos
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Instancia singleton
export const scraperService = new ScraperService();

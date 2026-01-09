import { chromium, Browser, Page } from 'playwright';
import { prisma } from '../utils/prisma.js';

// URL correta do HComunica CNJ (descoberto pelo scraper Python v1)
const HCOMUNICA_URL = 'https://hcomunica.cnj.jus.br';

interface ProcessoEncontrado {
  numeroProcesso: string;
  siglaTribunal: string;
  dataPublicacao: string | null;
  tipoComunicacao: string | null;
  textoComunicacao: string | null;
}

interface ProxyConfig {
  host: string;
  porta: number;
  usuario?: string | null;
  senha?: string | null;
  protocolo: string;
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

  private async registrarFalhaProxy(proxy: ProxyConfig): Promise<void> {
    await prisma.proxy.updateMany({
      where: { host: proxy.host, porta: proxy.porta },
      data: {
        consultasFalha: { increment: 1 },
        funcionando: false,
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

      // Delay aleatorio para simular comportamento humano
      const delay = 3000 + Math.random() * 5000;
      await new Promise((r) => setTimeout(r, delay));

      // Monta URL com parametros (como o scraper Python v1)
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

      // Acessa a pagina com parametros na URL (SPA carrega automaticamente)
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

      // Aguarda a SPA renderizar os resultados (8 segundos como Python v1)
      await page.waitForTimeout(8000);

      // Extrai processos do HTML renderizado
      const processos = await this.extrairProcessosDoHtml(page);

      console.log(`[Scraper] Encontrados ${processos.length} processos`);

      await context.close();
      return processos;
    } catch (error: any) {
      console.error(`[Scraper] Erro: ${error.message}`);

      if (proxy) {
        await this.registrarFalhaProxy(proxy);
      }

      if (context) {
        await context.close();
      }

      throw error;
    }
  }

  /**
   * Extrai processos do HTML renderizado (baseado no scraper Python v1)
   */
  private async extrairProcessosDoHtml(page: Page): Promise<ProcessoEncontrado[]> {
    const html = await page.content();

    // Regex para numeros de processo CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO
    const regexCNJ = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g;
    const matches = html.match(regexCNJ) || [];

    // Remove duplicados e placeholders (0000000-...)
    const processosUnicos = [...new Set(matches)].filter(p => !p.startsWith('0000000'));

    console.log(`[Scraper] Processos encontrados no HTML: ${processosUnicos.length}`);

    const processos: ProcessoEncontrado[] = [];

    for (const numero of processosUnicos) {
      const pub: ProcessoEncontrado = {
        numeroProcesso: numero,
        siglaTribunal: this.extrairTribunalDoNumero(numero),
        dataPublicacao: null,
        tipoComunicacao: null,
        textoComunicacao: null,
      };

      // Encontra contexto do processo no HTML (3000 chars ao redor)
      const idx = html.indexOf(numero);
      if (idx > 0) {
        const contexto = html.substring(Math.max(0, idx - 1500), idx + 1500);

        // Extrai data (formato DD/MM/YYYY)
        const matchData = contexto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (matchData) {
          // Converte para ISO: YYYY-MM-DD
          pub.dataPublicacao = `${matchData[3]}-${matchData[2]}-${matchData[1]}`;
        }

        // Extrai tipo de comunicacao
        const tipoMatch = contexto.match(/(intimação|citação|despacho|sentença|acórdão|decisão|edital)/i);
        if (tipoMatch) {
          pub.tipoComunicacao = tipoMatch[1].toUpperCase();
        }

        // Extrai texto limpo (remove HTML tags)
        const textoLimpo = contexto
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (textoLimpo.length > 100) {
          pub.textoComunicacao = textoLimpo.substring(0, 2000);
        }
      }

      processos.push(pub);
    }

    return processos;
  }

  private extrairTribunalDoNumero(numeroProcesso: string): string {
    // Numero CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO
    // J = Justica (8 = Estadual, 4 = Federal, 5 = Trabalho)
    // TR = Tribunal Regional
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
}

// Instancia singleton
export const scraperService = new ScraperService();

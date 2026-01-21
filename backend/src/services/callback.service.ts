import { prisma } from '../utils/prisma.js';

interface PublicacaoCallback {
  numeroProcesso: string;
  siglaTribunal: string | null;
  orgaoJulgador: string | null;
  dataDisponibilizacao: Date | null;
  dataPublicacao: Date | null;
  tipoComunicacao: string | null;
  textoComunicacao: string | null;
  textoLimpo: string | null;
  linkIntegra: string | null;
  parteAutor: string | null;
  parteReu: string | null;
  comarca: string | null;
  classeProcessual: string | null;
  advogadosProcesso: any;
  nomeOrgao: string | null;
}

export class CallbackService {
  async enviarParaAdvwell(
    advogadoId: string,
    publicacoes: PublicacaoCallback[]
  ): Promise<{ sucesso: number; falhas: number }> {
    const advogado = await prisma.advogado.findUnique({
      where: { id: advogadoId },
    });

    if (!advogado || !advogado.callbackUrl) {
      console.log('[Callback] Advogado sem URL de callback configurada');
      return { sucesso: 0, falhas: 0 };
    }

    const resultados = { sucesso: 0, falhas: 0 };
    const errosDetalhados: any[] = [];

    for (const publicacao of publicacoes) {
      try {
        const response = await fetch(advogado.callbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.ADVWELL_API_KEY || '',
          },
          body: JSON.stringify({
            tipo: 'nova_publicacao',
            advogadoId: advogado.advwellClientId,
            companyId: advogado.advwellCompanyId,
            advogadoNome: advogado.nome,
            publicacao: {
              numeroProcesso: publicacao.numeroProcesso,
              siglaTribunal: publicacao.siglaTribunal,
              orgaoJulgador: publicacao.orgaoJulgador,
              dataDisponibilizacao: publicacao.dataDisponibilizacao,
              dataPublicacao: publicacao.dataPublicacao,
              tipoComunicacao: publicacao.tipoComunicacao,
              textoComunicacao: publicacao.textoComunicacao,
              textoLimpo: publicacao.textoLimpo,
              linkIntegra: publicacao.linkIntegra,
              parteAutor: publicacao.parteAutor,
              parteReu: publicacao.parteReu,
              comarca: publicacao.comarca,
              classeProcessual: publicacao.classeProcessual,
              advogadosProcesso: publicacao.advogadosProcesso,
              nomeOrgao: publicacao.nomeOrgao,
            },
          }),
        });

        if (response.ok) {
          resultados.sucesso++;

          // Atualiza publicacao como enviada
          await prisma.publicacao.updateMany({
            where: {
              advogadoId,
              numeroProcesso: publicacao.numeroProcesso,
            },
            data: {
              enviadoAdvwell: true,
              enviadoEm: new Date(),
              status: 'ENVIADA',
            },
          });
        } else {
          resultados.falhas++;
          const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
          console.error(`[Callback] Erro HTTP: ${response.status}`);
          errosDetalhados.push({
            processo: publicacao.numeroProcesso,
            erro: errorMsg,
          });

          // Marca publicacao com erro
          await prisma.publicacao.updateMany({
            where: {
              advogadoId,
              numeroProcesso: publicacao.numeroProcesso,
            },
            data: {
              status: 'ERRO',
            },
          });
        }
      } catch (error: any) {
        resultados.falhas++;
        console.error(`[Callback] Erro ao enviar: ${error.message}`);
        errosDetalhados.push({
          processo: publicacao.numeroProcesso,
          erro: error.message,
        });

        // Marca publicacao com erro
        await prisma.publicacao.updateMany({
          where: {
            advogadoId,
            numeroProcesso: publicacao.numeroProcesso,
          },
          data: {
            status: 'ERRO',
          },
        });
      }

      // Pequeno delay entre envios
      await new Promise((r) => setTimeout(r, 100));
    }

    // Registra log de execucao
    await prisma.execucaoLog.create({
      data: {
        tipo: 'ENVIO',
        descricao: `Callback para ${advogado.nome}`,
        detalhes: {
          advogadoId,
          advogadoNome: advogado.nome,
          callbackUrl: advogado.callbackUrl,
          totalEnviadas: publicacoes.length,
          sucesso: resultados.sucesso,
          falhas: resultados.falhas,
          erros: errosDetalhados,
        },
        publicacoesEncontradas: publicacoes.length,
        publicacoesNovas: resultados.sucesso,
        erros: resultados.falhas,
      },
    });

    console.log(`[Callback] Enviadas ${resultados.sucesso} publicacoes, ${resultados.falhas} falhas`);
    return resultados;
  }

  async reenviarPendentes(): Promise<void> {
    // Busca publicacoes nao enviadas
    const pendentes = await prisma.publicacao.findMany({
      where: {
        enviadoAdvwell: false,
        advogado: {
          callbackUrl: { not: null },
        },
      },
      include: {
        advogado: true,
      },
      take: 100,
    });

    console.log(`[Callback] Reenviando ${pendentes.length} publicacoes pendentes`);

    // Agrupa por advogado
    const porAdvogado = pendentes.reduce((acc, pub) => {
      if (!acc[pub.advogadoId]) {
        acc[pub.advogadoId] = [];
      }
      acc[pub.advogadoId].push(pub);
      return acc;
    }, {} as Record<string, typeof pendentes>);

    for (const [advogadoId, pubs] of Object.entries(porAdvogado)) {
      await this.enviarParaAdvwell(
        advogadoId,
        pubs.map((p) => ({
          numeroProcesso: p.numeroProcesso,
          siglaTribunal: p.siglaTribunal,
          orgaoJulgador: p.orgaoJulgador,
          dataDisponibilizacao: p.dataDisponibilizacao,
          dataPublicacao: p.dataPublicacao,
          tipoComunicacao: p.tipoComunicacao,
          textoComunicacao: p.textoComunicacao,
          textoLimpo: p.textoLimpo,
          linkIntegra: p.linkIntegra,
          parteAutor: p.parteAutor,
          parteReu: p.parteReu,
          comarca: p.comarca,
          classeProcessual: p.classeProcessual,
          advogadosProcesso: p.advogadosProcesso,
          nomeOrgao: p.nomeOrgao,
        }))
      );
    }
  }
}

export const callbackService = new CallbackService();

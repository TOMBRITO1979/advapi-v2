import { prisma } from '../utils/prisma.js';

interface PublicacaoCallback {
  numeroProcesso: string;
  siglaTribunal: string | null;
  dataPublicacao: Date | null;
  tipoComunicacao: string | null;
  textoComunicacao: string | null;
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
              dataPublicacao: publicacao.dataPublicacao,
              tipoComunicacao: publicacao.tipoComunicacao,
              textoComunicacao: publicacao.textoComunicacao,
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
            },
          });
        } else {
          resultados.falhas++;
          console.error(`[Callback] Erro HTTP: ${response.status}`);
        }
      } catch (error: any) {
        resultados.falhas++;
        console.error(`[Callback] Erro ao enviar: ${error.message}`);
      }

      // Pequeno delay entre envios
      await new Promise((r) => setTimeout(r, 100));
    }

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
          dataPublicacao: p.dataPublicacao,
          tipoComunicacao: p.tipoComunicacao,
          textoComunicacao: p.textoComunicacao,
        }))
      );
    }
  }
}

export const callbackService = new CallbackService();

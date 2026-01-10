/**
 * Politica de retencao de dados
 * Mantem apenas os ultimos N andamentos por processo
 */

import { prisma } from './prisma.js';

const MAX_ANDAMENTOS_POR_PROCESSO = 3;

/**
 * Aplica politica de retencao para um processo especifico
 * Remove andamentos antigos, mantendo apenas os N mais recentes
 */
export async function aplicarRetencaoProcesso(numeroProcesso: string): Promise<number> {
  // Busca todas publicacoes deste processo ordenadas por data (mais recente primeiro)
  const publicacoes = await prisma.publicacao.findMany({
    where: { numeroProcesso },
    orderBy: [
      { dataPublicacao: 'desc' },
      { createdAt: 'desc' },
    ],
    select: { id: true },
  });

  // Se tem mais que o limite, remove os excedentes
  if (publicacoes.length > MAX_ANDAMENTOS_POR_PROCESSO) {
    const idsParaRemover = publicacoes
      .slice(MAX_ANDAMENTOS_POR_PROCESSO)
      .map(p => p.id);

    await prisma.publicacao.deleteMany({
      where: { id: { in: idsParaRemover } },
    });

    return idsParaRemover.length;
  }

  return 0;
}

/**
 * Aplica politica de retencao para todos os processos de um advogado
 */
export async function aplicarRetencaoAdvogado(advogadoId: string): Promise<{ processosVerificados: number; removidos: number }> {
  // Busca todos numeros de processo unicos deste advogado
  const processos = await prisma.publicacao.findMany({
    where: { advogadoId },
    distinct: ['numeroProcesso'],
    select: { numeroProcesso: true },
  });

  let totalRemovidos = 0;

  for (const { numeroProcesso } of processos) {
    const removidos = await aplicarRetencaoProcesso(numeroProcesso);
    totalRemovidos += removidos;
  }

  return {
    processosVerificados: processos.length,
    removidos: totalRemovidos,
  };
}

/**
 * Aplica politica de retencao em todo o banco de dados
 */
export async function aplicarRetencaoGlobal(): Promise<{ processosVerificados: number; removidos: number }> {
  console.log('[Retencao] Iniciando limpeza global...');

  // Busca todos numeros de processo unicos
  const processos = await prisma.publicacao.findMany({
    distinct: ['numeroProcesso'],
    select: { numeroProcesso: true },
  });

  console.log(`[Retencao] ${processos.length} processos para verificar`);

  let totalRemovidos = 0;

  for (let i = 0; i < processos.length; i++) {
    const { numeroProcesso } = processos[i];
    const removidos = await aplicarRetencaoProcesso(numeroProcesso);
    totalRemovidos += removidos;

    if ((i + 1) % 100 === 0) {
      console.log(`[Retencao] Progresso: ${i + 1}/${processos.length} (${totalRemovidos} removidos)`);
    }
  }

  console.log(`[Retencao] Concluido: ${totalRemovidos} publicacoes removidas`);

  return {
    processosVerificados: processos.length,
    removidos: totalRemovidos,
  };
}

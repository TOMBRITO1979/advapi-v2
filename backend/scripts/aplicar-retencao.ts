/**
 * Script para aplicar politica de retencao em dados existentes
 * Mantem apenas os 3 ultimos andamentos por processo
 *
 * Execucao: npx tsx scripts/aplicar-retencao.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MAX_ANDAMENTOS_POR_PROCESSO = 3;

async function main() {
  console.log('=== Aplicando Politica de Retencao ===');
  console.log(`Limite: ${MAX_ANDAMENTOS_POR_PROCESSO} andamentos por processo\n`);

  // Estatisticas antes
  const totalAntes = await prisma.publicacao.count();
  console.log(`Total de publicacoes antes: ${totalAntes}`);

  // Busca todos numeros de processo unicos
  const processos = await prisma.publicacao.findMany({
    distinct: ['numeroProcesso'],
    select: { numeroProcesso: true },
  });

  console.log(`Processos unicos: ${processos.length}\n`);

  let totalRemovidos = 0;
  let processosComExcesso = 0;

  for (let i = 0; i < processos.length; i++) {
    const { numeroProcesso } = processos[i];

    // Busca publicacoes deste processo ordenadas por data
    const publicacoes = await prisma.publicacao.findMany({
      where: { numeroProcesso },
      orderBy: [
        { dataPublicacao: 'desc' },
        { createdAt: 'desc' },
      ],
      select: { id: true, dataPublicacao: true },
    });

    // Se tem mais que o limite, remove os excedentes
    if (publicacoes.length > MAX_ANDAMENTOS_POR_PROCESSO) {
      const idsParaRemover = publicacoes
        .slice(MAX_ANDAMENTOS_POR_PROCESSO)
        .map(p => p.id);

      await prisma.publicacao.deleteMany({
        where: { id: { in: idsParaRemover } },
      });

      totalRemovidos += idsParaRemover.length;
      processosComExcesso++;

      console.log(`[${i + 1}/${processos.length}] ${numeroProcesso}: ${publicacoes.length} -> ${MAX_ANDAMENTOS_POR_PROCESSO} (removidos: ${idsParaRemover.length})`);
    }

    // Progress log a cada 100 processos
    if ((i + 1) % 100 === 0 && publicacoes.length <= MAX_ANDAMENTOS_POR_PROCESSO) {
      console.log(`Progresso: ${i + 1}/${processos.length}`);
    }
  }

  // Estatisticas depois
  const totalDepois = await prisma.publicacao.count();

  console.log('\n=== Resultado ===');
  console.log(`Processos verificados: ${processos.length}`);
  console.log(`Processos com excesso: ${processosComExcesso}`);
  console.log(`Publicacoes removidas: ${totalRemovidos}`);
  console.log(`Total antes: ${totalAntes}`);
  console.log(`Total depois: ${totalDepois}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

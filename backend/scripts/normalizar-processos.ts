/**
 * Script para normalizar numeros de processo existentes
 * Remove pontos e tracos de todos os numeroProcesso no banco
 *
 * Execucao: npx tsx scripts/normalizar-processos.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalizarNumeroProcesso(numero: string | null | undefined): string {
  if (!numero) return '';
  return numero.replace(/[.\-]/g, '');
}

async function main() {
  console.log('=== Normalizando numeros de processo ===\n');

  // Busca todas publicacoes que tem . ou - no numero
  const publicacoes = await prisma.publicacao.findMany({
    where: {
      OR: [
        { numeroProcesso: { contains: '.' } },
        { numeroProcesso: { contains: '-' } },
      ],
    },
    select: {
      id: true,
      numeroProcesso: true,
    },
  });

  console.log(`Encontradas ${publicacoes.length} publicacoes para normalizar\n`);

  let atualizadas = 0;
  let duplicadas = 0;

  for (const pub of publicacoes) {
    const numeroNormalizado = normalizarNumeroProcesso(pub.numeroProcesso);

    // Verifica se ja existe uma publicacao com o numero normalizado (para evitar duplicatas)
    const existente = await prisma.publicacao.findFirst({
      where: {
        numeroProcesso: numeroNormalizado,
        id: { not: pub.id },
      },
    });

    if (existente) {
      // Se ja existe, marca como duplicata (podemos deletar ou manter)
      console.log(`[DUPLICADA] ${pub.numeroProcesso} -> ${numeroNormalizado} (ja existe ID: ${existente.id})`);
      duplicadas++;

      // Deleta a duplicata
      await prisma.publicacao.delete({
        where: { id: pub.id },
      });
    } else {
      // Atualiza o numero
      await prisma.publicacao.update({
        where: { id: pub.id },
        data: { numeroProcesso: numeroNormalizado },
      });
      atualizadas++;

      if (atualizadas % 100 === 0) {
        console.log(`Atualizadas: ${atualizadas}/${publicacoes.length}`);
      }
    }
  }

  console.log('\n=== Resultado ===');
  console.log(`Publicacoes atualizadas: ${atualizadas}`);
  console.log(`Publicacoes duplicadas removidas: ${duplicadas}`);
  console.log(`Total processadas: ${publicacoes.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

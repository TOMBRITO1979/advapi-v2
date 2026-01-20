import 'dotenv/config';
import { callbackService } from '../src/services/callback.service.js';
import { prisma } from '../src/utils/prisma.js';

async function main() {
  console.log('Buscando publicacoes pendentes...');
  
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
  });
  
  console.log(`Encontradas ${pendentes.length} publicacoes pendentes`);
  
  if (pendentes.length === 0) {
    console.log('Nenhuma publicacao pendente para reenviar');
    return;
  }
  
  // Agrupa por advogado
  const porAdvogado = pendentes.reduce((acc, pub) => {
    if (!acc[pub.advogadoId]) {
      acc[pub.advogadoId] = { advogado: pub.advogado, pubs: [] };
    }
    acc[pub.advogadoId].pubs.push(pub);
    return acc;
  }, {} as Record<string, any>);
  
  for (const [advogadoId, data] of Object.entries(porAdvogado)) {
    console.log(`\nReenviando ${data.pubs.length} publicacoes de ${data.advogado.nome}...`);
    
    const result = await callbackService.enviarParaAdvwell(
      advogadoId,
      data.pubs.map((p: any) => ({
        numeroProcesso: p.numeroProcesso,
        siglaTribunal: p.siglaTribunal,
        dataPublicacao: p.dataPublicacao,
        tipoComunicacao: p.tipoComunicacao,
        textoComunicacao: p.textoComunicacao,
      }))
    );
    
    console.log(`Resultado: ${result.sucesso} sucesso, ${result.falhas} falhas`);
  }
  
  console.log('\nReenvio concluido!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

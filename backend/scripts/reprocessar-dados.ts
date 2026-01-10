/**
 * Script para reprocessar publicacoes existentes e extrair dados estruturados
 * do campo textoComunicacao para preencher nomeOrgao, parteAutor, parteReu, etc.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface DadosExtraidos {
  parteAutor: string | null;
  parteReu: string | null;
  comarca: string | null;
  classeProcessual: string | null;
  textoLimpo: string;
  nomeOrgao: string | null;
}

function limparNomeParte(texto: string): string | null {
  let limpo = texto
    .replace(/<[^>]+>/g, ' ')
    .replace(/_ngcontent[^=]*="[^"]*"/gi, ' ')
    .replace(/\b(ng|mat|cdk|aria)[a-z-]*(?:="[^"]*")?/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  limpo = limpo
    .replace(/Processo.*$/i, '')
    .replace(/OAB.*$/i, '')
    .replace(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g, '')
    .replace(/\s+(Considerando|HOMOLOGO|JULGO|Defiro|Indefiro|Cite-se|Intime-se|Vistos|Ante o exposto|Diante do exposto|Trata-se|Tratando-se|Em face|Por todo|Tendo em vista|Conforme|Nos termos|À vista|Em razão|1\.|2\.|3\.|1-|2-|3-).*$/i, '')
    .replace(/\s+\d+\.\s+[A-Z].*$/i, '')
    .trim();

  if (!limpo || limpo.length < 3 || !/[a-zA-ZÀ-ú]/.test(limpo)) {
    return null;
  }

  return limpo.substring(0, 500);
}

function limparTextoCompleto(texto: string): string {
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

function extrairDadosEstruturados(texto: string | null): DadosExtraidos {
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

  const textoLimpo = limparTextoCompleto(texto);

  // Extrai AUTOR
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
      parteAutor = limparNomeParte(match[1]);
      if (parteAutor) break;
    }
  }

  // Extrai REU
  let parteReu: string | null = null;
  const reuPatterns = [
    /(?:R[ÉE]US?|REQUERIDOS?|EXECUTADOS?|APELADOS?):\s*([^]*?)(?=SENTEN[CÇ]|DECIS[AÃ]O|DESPACHO|INTIMA[CÇ][AÃ]O|CITA[CÇ][AÃ]O|Vistos|Ante|Diante|Trata-se|ADVOGADO|OAB|$)/i,
    /RECLAMAD[OA][S]?:\s*([^]*?)(?=SENTEN[CÇ]|DECIS[AÃ]O|DESPACHO|ADVOGADO|OAB|$)/i,
    /AGRAVAD[OA][S]?:\s*([^]*?)(?=SENTEN[CÇ]|DECIS[AÃ]O|DESPACHO|ADVOGADO|OAB|$)/i,
  ];
  for (const pattern of reuPatterns) {
    const match = texto.match(pattern);
    if (match && match[1]) {
      parteReu = limparNomeParte(match[1]);
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

  // Extrai ORGAO JULGADOR
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

async function main() {
  console.log('Iniciando reprocessamento de publicacoes...');

  // Busca publicacoes que tem textoComunicacao mas nao tem nomeOrgao
  const publicacoes = await prisma.publicacao.findMany({
    where: {
      textoComunicacao: { not: null },
      OR: [
        { nomeOrgao: null },
        { textoLimpo: null },
      ],
    },
    select: {
      id: true,
      textoComunicacao: true,
      nomeOrgao: true,
      textoLimpo: true,
      parteAutor: true,
      parteReu: true,
      comarca: true,
      classeProcessual: true,
    },
  });

  console.log(`Encontradas ${publicacoes.length} publicacoes para reprocessar`);

  let atualizadas = 0;
  let comNomeOrgao = 0;
  let comAutor = 0;
  let comReu = 0;

  for (const pub of publicacoes) {
    const dados = extrairDadosEstruturados(pub.textoComunicacao);

    const updateData: any = {};

    // Atualiza apenas campos que estao vazios
    if (!pub.nomeOrgao && dados.nomeOrgao) {
      updateData.nomeOrgao = dados.nomeOrgao;
      comNomeOrgao++;
    }
    if (!pub.textoLimpo && dados.textoLimpo) {
      updateData.textoLimpo = dados.textoLimpo;
    }
    if (!pub.parteAutor && dados.parteAutor) {
      updateData.parteAutor = dados.parteAutor;
      comAutor++;
    }
    if (!pub.parteReu && dados.parteReu) {
      updateData.parteReu = dados.parteReu;
      comReu++;
    }
    if (!pub.comarca && dados.comarca) {
      updateData.comarca = dados.comarca;
    }
    if (!pub.classeProcessual && dados.classeProcessual) {
      updateData.classeProcessual = dados.classeProcessual;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.publicacao.update({
        where: { id: pub.id },
        data: updateData,
      });
      atualizadas++;
    }
  }

  console.log(`\nReprocessamento concluido!`);
  console.log(`- Total reprocessadas: ${atualizadas}`);
  console.log(`- Com nomeOrgao extraido: ${comNomeOrgao}`);
  console.log(`- Com parteAutor extraido: ${comAutor}`);
  console.log(`- Com parteReu extraido: ${comReu}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Erro:', e);
  prisma.$disconnect();
  process.exit(1);
});

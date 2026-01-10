/**
 * Utilitários para manipulação de números de processo
 */

/**
 * Normaliza número de processo removendo pontos e traços
 * Entrada: "0100768-69.2025.5.01.0206"
 * Saída: "01007686920255010206"
 */
export function normalizarNumeroProcesso(numero: string | null | undefined): string {
  if (!numero) return '';
  return numero.replace(/[.\-]/g, '');
}

/**
 * Formata número de processo para exibição (formato CNJ)
 * Entrada: "01007686920255010206"
 * Saída: "0100768-69.2025.5.01.0206"
 */
export function formatarNumeroProcesso(numero: string | null | undefined): string {
  if (!numero) return '';

  // Remove formatação existente
  const limpo = numero.replace(/[.\-]/g, '');

  // Formato CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO (20 dígitos)
  if (limpo.length === 20) {
    return `${limpo.slice(0, 7)}-${limpo.slice(7, 9)}.${limpo.slice(9, 13)}.${limpo.slice(13, 14)}.${limpo.slice(14, 16)}.${limpo.slice(16, 20)}`;
  }

  // Se não tem 20 dígitos, retorna como está
  return numero;
}

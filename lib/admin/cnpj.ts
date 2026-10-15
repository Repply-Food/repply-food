/**
 * CNPJ (D-60): opcional; quando preenchido, é conferido e não repete. Aceita o
 * formato numérico e o alfanumérico da Receita (julho de 2026: letras nas 12
 * primeiras posições; os 2 dígitos verificadores são calculados com o código
 * ASCII − 48 de cada caractere). A mesma regra está em `cnpj_valido`, no banco.
 */
const PESOS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Sem pontuação nem espaço, em maiúsculas: é assim que o banco grava. */
export function limparCnpj(texto: string): string {
  return texto.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function digito(base: string, pesos: readonly number[]): number {
  let soma = 0;
  pesos.forEach((peso, i) => {
    soma += (base.charCodeAt(i) - 48) * peso;
  });
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Recebe o CNPJ já limpo (`limparCnpj`). */
export function cnpjValido(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) {
    return false;
  }
  return (
    cnpj.charAt(12) === String(digito(cnpj, PESOS_1)) &&
    cnpj.charAt(13) === String(digito(cnpj, PESOS_2))
  );
}

export function formatarCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

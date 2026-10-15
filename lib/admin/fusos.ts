/**
 * Os fusos IANA do Brasil. A mesma lista está na restrição
 * `restaurantes_fuso_do_brasil` (migration 20261015120000), e
 * `tests/admin/espelho-do-banco.test.ts` compara as duas.
 */
export const FUSO_PADRAO = "America/Fortaleza";

export const FUSOS_DO_BRASIL: readonly { valor: string; rotulo: string }[] = [
  { valor: "America/Noronha", rotulo: "Fernando de Noronha (UTC−2)" },
  { valor: "America/Belem", rotulo: "Belém · PA leste e AP (UTC−3)" },
  {
    valor: "America/Fortaleza",
    rotulo: "Fortaleza · CE, RN, PB, PI e MA (UTC−3)",
  },
  { valor: "America/Recife", rotulo: "Recife · PE (UTC−3)" },
  { valor: "America/Araguaina", rotulo: "Araguaína · TO (UTC−3)" },
  { valor: "America/Maceio", rotulo: "Maceió · AL e SE (UTC−3)" },
  { valor: "America/Bahia", rotulo: "Salvador · BA (UTC−3)" },
  {
    valor: "America/Sao_Paulo",
    rotulo: "São Paulo · Sul, Sudeste, GO e DF (UTC−3)",
  },
  { valor: "America/Santarem", rotulo: "Santarém · PA oeste (UTC−3)" },
  { valor: "America/Campo_Grande", rotulo: "Campo Grande · MS (UTC−4)" },
  { valor: "America/Cuiaba", rotulo: "Cuiabá · MT (UTC−4)" },
  { valor: "America/Porto_Velho", rotulo: "Porto Velho · RO (UTC−4)" },
  { valor: "America/Boa_Vista", rotulo: "Boa Vista · RR (UTC−4)" },
  { valor: "America/Manaus", rotulo: "Manaus · AM leste (UTC−4)" },
  { valor: "America/Eirunepe", rotulo: "Eirunepé · AM oeste (UTC−5)" },
  { valor: "America/Rio_Branco", rotulo: "Rio Branco · AC (UTC−5)" },
];

export function ehFusoDoBrasil(valor: string): boolean {
  return FUSOS_DO_BRASIL.some((fuso) => fuso.valor === valor);
}

export function rotuloDoFuso(valor: string): string {
  return FUSOS_DO_BRASIL.find((fuso) => fuso.valor === valor)?.rotulo ?? valor;
}

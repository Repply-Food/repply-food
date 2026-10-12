const codigosErro = [
  "erro_interno",
  "falha_autenticacao",
  "falha_inesperada",
] as const;
const codigosInfo = ["envio_processado", "envio_rejeitado"] as const;
const contextos = ["receber-envio"] as const;

type CodigoErro = (typeof codigosErro)[number];
type CodigoInfo = (typeof codigosInfo)[number];
type ContextoSeguro = (typeof contextos)[number];

function incluir<T extends readonly string[]>(
  valores: T,
  valor: unknown
): valor is T[number] {
  return typeof valor === "string" && valores.includes(valor);
}

export function logError(
  codigo: CodigoErro | unknown,
  contexto?: ContextoSeguro | unknown
): void {
  console.error(
    "[repply-food]",
    incluir(codigosErro, codigo) ? codigo : "erro_interno",
    incluir(contextos, contexto) ? contexto : undefined
  );
}

export function logInfo(
  codigo: CodigoInfo | unknown,
  contexto?: ContextoSeguro | unknown
): void {
  console.info(
    "[repply-food]",
    incluir(codigosInfo, codigo) ? codigo : "envio_rejeitado",
    incluir(contextos, contexto) ? contexto : undefined
  );
}

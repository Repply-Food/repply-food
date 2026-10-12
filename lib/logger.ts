export function logError(codigo: string, contexto?: string): void {
  console.error("[repply-food]", codigo.slice(0, 80), contexto?.slice(0, 120));
}

export function logInfo(message: string, context?: string): void {
  if (context) {
    console.info("[repply-food]", context, message);
  } else {
    console.info("[repply-food]", message);
  }
}

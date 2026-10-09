export function logError(error: unknown, context?: string): void {
  const message = error instanceof Error ? error.message : String(error);
  if (context) {
    console.error("[repply-food]", context, message);
  } else {
    console.error("[repply-food]", message);
  }
}

export function logInfo(message: string, context?: string): void {
  if (context) {
    console.info("[repply-food]", context, message);
  } else {
    console.info("[repply-food]", message);
  }
}

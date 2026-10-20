type EventoInstalar = Event & { prompt: () => Promise<void> };

let evento: EventoInstalar | null = null;
const inscritos = new Set<() => void>();
let ligado = false;

function avisar() {
  for (const fn of inscritos) fn();
}

/** Liga a captura uma vez (idempotente). Chamar cedo no cliente (ver RegistrarSW). */
export function iniciarCapturaInstalar(): void {
  if (ligado || typeof window === "undefined") return;
  ligado = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    evento = e as EventoInstalar;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    evento = null;
    avisar();
  });
}

export function temEventoInstalar(): boolean {
  return evento !== null;
}

export function inscreverInstalar(fn: () => void): () => void {
  inscritos.add(fn);
  return () => {
    inscritos.delete(fn);
  };
}

/** Dispara o prompt do Android. Um prompt só vale uma vez. */
export async function dispararInstalar(): Promise<void> {
  if (!evento) return;
  try {
    await evento.prompt();
  } catch {
    // já usado / recusado
  }
  evento = null;
  avisar();
}

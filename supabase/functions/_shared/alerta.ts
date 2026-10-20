export type TipoAlerta = "parado" | "voltou";

export type AlertaParaEmail = {
  id: string;
  tipo: TipoAlerta;
  nomeRestaurante: string;
  ultimoEnvioEm: string | null;
  fuso: string;
  urlAdmin: string;
};

type EmailAlerta = {
  subject: string;
  text: string;
  html: string;
};

function escaparHtml(valor: string): string {
  return valor.replace(/[&<>'"]/g, (caractere) => {
    const entidades: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entidades[caractere] ?? caractere;
  });
}

function textoSeguro(valor: string): string {
  return valor.replace(/[\r\n]+/g, " ").trim();
}

function formatarMomento(iso: string | null, fuso: string): string {
  if (!iso) return "não informado";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: fuso,
    }).format(new Date(iso));
  } catch {
    return "não informado";
  }
}

export function chaveIdempotenciaAlerta(id: string): string {
  return `rf-alerta-${id}`;
}

export function codigoSeguro(_erro: unknown): string {
  return "erro_provedor";
}

export function montarEmailAlerta(alerta: AlertaParaEmail): EmailAlerta {
  const nome = textoSeguro(alerta.nomeRestaurante);
  const momento = formatarMomento(alerta.ultimoEnvioEm, alerta.fuso);
  const voltou = alerta.tipo === "voltou";
  const titulo = voltou ? "SCC voltou a enviar" : "SCC parado";
  const resumo = voltou
    ? "O SCC voltou a enviar dados válidos."
    : "O SCC está sem enviar dados durante o horário de funcionamento.";
  const assunto = `${titulo} · ${nome}`;
  const texto = `${titulo}\n\nCasa: ${nome}\nÚltimo envio válido: ${momento}\n\n${resumo}\n\nVer no admin: ${alerta.urlAdmin}`;

  return {
    subject: assunto,
    text: texto,
    html: `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f5f5f5;color:#0a0a0a;font-family:Arial,sans-serif">
    <main style="max-width:560px;margin:24px auto;background:#ffffff;padding:32px">
      <p style="margin:0 0 16px;color:#ff5a1f;font-weight:700">repply food.</p>
      <h1 style="margin:0 0 16px;font-size:24px">${escaparHtml(titulo)}</h1>
      <p style="margin:0 0 16px">${escaparHtml(resumo)}</p>
      <p style="margin:0 0 8px"><strong>Casa:</strong> ${escaparHtml(nome)}</p>
      <p style="margin:0 0 24px"><strong>Último envio válido:</strong> ${escaparHtml(momento)}</p>
      <a href="${escaparHtml(alerta.urlAdmin)}" style="display:inline-block;background:#ff5a1f;color:#0a0a0a;padding:12px 16px;text-decoration:none;font-weight:700">Ver no admin</a>
    </main>
  </body>
</html>`,
  };
}

import { plural } from "./texto";

export function enderecoDaRecepcao(urlDoSupabase: string): string {
  return `${urlDoSupabase.replace(/\/+$/, "")}/functions/v1/receber-envio`;
}

/** O texto da "Mensagem modelo para a SCC" (docs/operacao/cadastrar-restaurante.md). */
export function instrucoesParaScc(e: {
  nome: string;
  endereco: string;
  token: string;
  intervaloSegundos: number;
}): string {
  return [
    `Olá! Seguem os dados do repply food. para o restaurante ${e.nome}:`,
    "",
    `Endereço: ${e.endereco}`,
    `Token: ${e.token}          (guardar só no arquivo de configuração do SCC)`,
    `Intervalo: ${e.intervaloSegundos} segundos`,
    "",
    "Por favor, façam a carga inicial do histórico (contrato de dados, §8) e",
    "nos avisem quando o restaurante estiver enviando. Qualquer erro aparece",
    "para nós no painel de administração.",
  ].join("\n");
}

/** Mensagem para o WhatsApp do dono, com a senha provisória (D-55). */
export function mensagemDoLogin(e: {
  endereco: string;
  email: string;
  senha: string;
}): string {
  return [
    "Olá! Seu acesso ao repply food. está pronto.",
    "",
    `Endereço: ${e.endereco}`,
    `E-mail: ${e.email}`,
    `Senha provisória: ${e.senha}`,
    "",
    "No primeiro acesso, o painel pede para você criar a sua própria senha. Depois disso, a senha provisória deixa de valer.",
  ].join("\n");
}

export function mensagemDaEdicao(
  r: { recalculou: boolean; mudouFuso: boolean } | undefined
): string {
  if (!r?.recalculou) return "Dados salvos.";
  const base =
    "Dados salvos. Recalculamos o dia de operação das contas desta casa.";
  return r.mudouFuso
    ? `${base} Como o fuso mudou, peça um reenvio para corrigir as horas das contas que já chegaram.`
    : base;
}

/** Dono com duas casas (D-10): "Criar login" ligou a casa à conta que já existia. */
export function avisoDeLoginLigado(outrasCasas: number): string {
  const total = outrasCasas + 1;
  return total === 2
    ? "Este e-mail já tinha acesso; agora vê as duas casas."
    : `Este e-mail já tinha acesso; agora vê ${total} casas.`;
}

/** Aviso de "Redefinir senha" e "Trocar e-mail" quando o login abre mais de uma casa. */
export function avisoDeOutrasCasas(
  outrasCasas: number,
  oQueMuda: "senha" | "email"
): string {
  if (outrasCasas <= 0) return "";
  const quais =
    outrasCasas === 1
      ? "outra casa"
      : `outras ${plural(outrasCasas, "casa", "casas")}`;
  const vale =
    oQueMuda === "senha" ? "a senha nova vale para" : "o e-mail novo vale para";
  return `Este login também abre ${quais}: ${vale} ${outrasCasas === 1 ? "as duas" : "todas"}.`;
}

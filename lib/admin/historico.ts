import { dataEHoraNaCasa } from "./datas";

/** A mesma lista da restrição `registro_admin_acao_valida` (migration 20261015120000). */
export const ACOES_ADMIN = [
  "cadastrou",
  "editou_dados",
  "gerou_token",
  "revogou_token",
  "criou_login",
  "ligou_login",
  "redefiniu_senha",
  "trocou_email",
  "pediu_reenvio",
  "suspendeu",
  "reativou",
  "abriu_painel",
] as const;
export type AcaoAdmin = (typeof ACOES_ADMIN)[number];

const ROTULOS: Record<AcaoAdmin, string> = {
  cadastrou: "cadastrou o restaurante",
  editou_dados: "editou os dados",
  gerou_token: "gerou um token novo",
  revogou_token: "revogou o token",
  criou_login: "criou o login do cliente",
  ligou_login: "ligou um login que já existia",
  redefiniu_senha: "redefiniu a senha do cliente",
  trocou_email: "trocou o e-mail do cliente",
  pediu_reenvio: "pediu reenvio",
  suspendeu: "suspendeu o restaurante",
  reativou: "reativou o restaurante",
  abriu_painel: "abriu o painel do cliente",
};

/** `autor` já é o nome mostrado (`nomeDoAutor`). */
export type RegistroDoHistorico = {
  id: number;
  criadoEm: string;
  autor: string;
  acao: AcaoAdmin;
  detalhe: string | null;
};

export function acaoAdmin(valor: string): AcaoAdmin | null {
  return ACOES_ADMIN.find((acao) => acao === valor) ?? null;
}

export function textoDaAcao(acao: AcaoAdmin, detalhe: string | null): string {
  return detalhe ? `${ROTULOS[acao]} (${detalhe})` : ROTULOS[acao];
}

/** O nome do admin (`user_metadata.nome`); sem nome, o começo do e-mail. */
export function nomeDoAutor(
  u: { nome?: unknown; email?: string | null } | null
): string {
  if (!u) return "admin removido";
  if (typeof u.nome === "string" && u.nome.trim()) return u.nome.trim();
  return u.email?.split("@")[0] || "admin";
}

/** "14/10 21:03 · Lucas Ferreira · gerou um token novo (o antigo parou na hora)". */
export function linhaDoHistorico(r: RegistroDoHistorico, fuso: string): string {
  return `${dataEHoraNaCasa(r.criadoEm, fuso)} · ${r.autor} · ${textoDaAcao(r.acao, r.detalhe)}`;
}

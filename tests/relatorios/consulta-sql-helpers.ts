import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { expect } from "vitest";
import { criarFixture } from "../helpers/supabase-local";

export const filtrosDoisDias = {
  inicio: "2026-10-24",
  fim: "2026-10-25",
  fonte: "historico",
};

/** Dados fictícios em transação externa; rollback remove toda a fixture. */
export async function prepararConsulta(banco: Client) {
  await banco.query("begin");
  return criarFixture(banco, { transacaoExterna: true });
}

export async function identidade(banco: Client, usuario: string) {
  await banco.query("set local role authenticated");
  await banco.query("select set_config('request.jwt.claim.sub',$1,true)", [
    usuario,
  ]);
}

export async function publicarFixture(
  banco: Client,
  casa: string,
  {
    relatorio = "produtos",
    dia = "2026-10-24",
    fonte = "historico",
    capturadoEm = "2026-10-25T12:00:00Z",
    natureza = "scc",
    recursos = ["pdv", "grupo"],
    linhas = [],
  }: {
    relatorio?: string;
    dia?: string;
    fonte?: string;
    capturadoEm?: string;
    natureza?: string;
    recursos?: string[];
    linhas?: Record<string, unknown>[];
  } = {}
) {
  const tipos: Record<string, string> = {
    produtos: "itens_vendidos",
    comissao: "comissoes",
    caixa: "movimentos_caixa",
    auditoria: "eventos_auditoria",
    "notas-assinadas": "notas_assinadas",
    financeiro: "financeiro",
  };
  const tipo = tipos[relatorio];
  if (!tipo) throw new Error(`Relatório desconhecido: ${relatorio}`);
  const { rows } = await banco.query<{ sequencia: string }>(
    `select (coalesce(max(sequencia),0)+1)::text as sequencia
       from public.cursores_scc
      where restaurante_id=$1 and tipo_envio=$2 and chave_escopo=$3`,
    [casa, tipo, `${dia}|${fonte}`]
  );
  const dados = linhas.map((linha, indice) =>
    relatorio === "produtos"
      ? { codigo_entrada: "fixture", ordinal: indice + 1, ...linha }
      : linha
  );
  const envelope = {
    versao_formato: 2,
    versao_scc: "fixture",
    enviado_em: capturadoEm,
    id_envio: randomUUID(),
    sequencia: rows[0]?.sequencia ?? "1",
    natureza,
    tipo_envio: tipo,
    modo: "fotografia",
    dia_movimento: dia,
    fonte,
    recursos,
    pagina: { numero: 1, total: 1 },
    total_registros: dados.length,
    dados,
  };
  await banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
    casa,
    JSON.stringify(envelope),
  ]);
}

/** Erro esperado não aborta a transação externa nem mascara erro diferente. */
export async function recusarConsulta(
  banco: Client,
  executar: () => Promise<unknown>,
  mensagem: string
) {
  await banco.query("savepoint consulta_recusada");
  try {
    await expect(executar()).rejects.toMatchObject({ message: mensagem });
  } finally {
    await banco.query("rollback to savepoint consulta_recusada");
    await banco.query("release savepoint consulta_recusada");
  }
}

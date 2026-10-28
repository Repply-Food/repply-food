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
  const carga = randomUUID();
  await banco.query(
    `insert into public.relatorio_cargas
      (restaurante_id,id,relatorio,dia_movimento,fonte,sequencia,capturado_em,
       natureza,recursos,total_paginas,total_linhas,estado)
     values ($1,$2,$3,$4,$5,1,$6,$7,$8,1,$9,'publicada')`,
    [
      casa,
      carga,
      relatorio,
      dia,
      fonte,
      capturadoEm,
      natureza,
      recursos,
      linhas.length,
    ]
  );
  await banco.query(
    `insert into public.relatorio_publicacoes
      (restaurante_id,carga_id,relatorio,dia_movimento,fonte,sequencia,
       capturado_em,natureza,recursos,quantidade)
     values ($1,$2,$3,$4,$5,1,$6,$7,$8,$9)`,
    [
      casa,
      carga,
      relatorio,
      dia,
      fonte,
      capturadoEm,
      natureza,
      recursos,
      linhas.length,
    ]
  );
  for (const [indice, linha] of linhas.entries())
    await banco.query(
      `insert into public.relatorio_linhas
        (restaurante_id,relatorio,dia_movimento,fonte,posicao,dados)
       values ($1,$2,$3,$4,$5,$6::jsonb)`,
      [casa, relatorio, dia, fonte, indice + 1, JSON.stringify(linha)]
    );
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

// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  LinhaProdutos,
  PedidoPagina,
} from "../../supabase/functions/_shared/relatorios/schemas";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
} from "../helpers/supabase-local";
import { linhasRelatorios, paginaProdutos } from "./fixtures";

describe("publicação atômica de relatórios no PostgreSQL local", () => {
  let banco: Client;
  let fixture: Fixture;
  let casa: string;
  const nova = (sequencia = "1"): PedidoPagina<"produtos", LinhaProdutos> => ({
    ...structuredClone(paginaProdutos()),
    linhas: paginaProdutos().linhas.map((linha) => ({ ...linha })),
    manifesto: {
      ...structuredClone(paginaProdutos().manifesto),
      recursos: [...paginaProdutos().manifesto.recursos],
      carga_id: randomUUID(),
      sequencia,
    },
  });
  const receber = (pedido: unknown, restaurante = casa) =>
    banco.query("select public.receber_pagina_relatorio($1,$2::jsonb) r", [
      restaurante,
      JSON.stringify(pedido),
    ]);
  const publicar = async (id: string, restaurante = casa) =>
    (
      await banco.query("select public.publicar_relatorio($1,$2) r", [
        restaurante,
        id,
      ])
    ).rows[0].r;
  // Uma falha SQL não deve abortar a transação que preserva a fixture do teste.
  const recusar = async (
    operacao: () => Promise<unknown>,
    mensagem: string
  ) => {
    await banco.query("savepoint rejeicao");
    try {
      await expect(operacao()).rejects.toMatchObject({ message: mensagem });
    } finally {
      await banco.query("rollback to savepoint rejeicao");
      await banco.query("release savepoint rejeicao");
    }
  };
  const cache = async () =>
    (
      await banco.query(
        "select dados from public.relatorio_linhas where restaurante_id=$1 order by fonte,posicao",
        [casa]
      )
    ).rows.map((r) => r.dados);

  beforeEach(async () => {
    banco = await conectarBanco();
    await banco.query("begin");
    fixture = await criarFixture(banco, { transacaoExterna: true });
    casa = fixture.restauranteA;
  });
  afterEach(async () => {
    if (!banco) return;
    await banco.query("rollback");
    await banco.end();
  });

  it("mantém cache anterior até todas as páginas chegarem e repete a revisão original", async () => {
    const anterior = nova();
    await receber(anterior);
    expect(await publicar(anterior.manifesto.carga_id)).toMatchObject({
      estado: "publicada",
      revisao: "1",
    });
    const proxima = nova("2");
    proxima.manifesto.total_paginas = 2;
    proxima.manifesto.total_linhas = 2;
    proxima.linhas = proxima.linhas.map((linha) => ({
      ...linha,
      codigo_produto: "P2",
    }));
    await receber(proxima);
    await recusar(
      () => publicar(proxima.manifesto.carga_id),
      "carga_incompleta"
    );
    expect((await cache()).map((l) => l.codigo_produto)).toEqual(["P1"]);
    await receber({ ...proxima, numero: 2 });
    const recibo = await publicar(proxima.manifesto.carga_id);
    expect(recibo.revisao).toBe("2");
    expect((await cache()).map((l) => l.codigo_produto)).toEqual(["P2", "P2"]);
    expect(await publicar(proxima.manifesto.carga_id)).toEqual(recibo);
    expect((await publicar(anterior.manifesto.carga_id)).revisao).toBe("1");
    expect((await cache()).map((l) => l.codigo_produto)).toEqual(["P2", "P2"]);
    const repetida = await receber(proxima);
    expect(repetida.rows[0].r).toMatchObject({
      repetida: true,
      estado: "publicada",
    });
    await recusar(
      () =>
        receber({
          ...proxima,
          linhas: [{ ...proxima.linhas[0], vendas: "9" }],
        }),
      "pagina_conflitante"
    );
    const paginas = await banco.query(
      "select dados,quantidade from public.relatorio_paginas where restaurante_id=$1 and carga_id=$2 order by numero",
      [casa, proxima.manifesto.carga_id]
    );
    expect(paginas.rows).toEqual([
      { dados: null, quantidade: 1 },
      { dados: null, quantidade: 1 },
    ]);
  });

  it("não conta retry duas vezes, compara JSON e recusa manifesto alterado", async () => {
    const pedido = nova();
    await receber(pedido);
    const antes = await banco.query(
      "select bytes_recebidos from public.relatorio_cargas where restaurante_id=$1 and id=$2",
      [casa, pedido.manifesto.carga_id]
    );
    expect((await receber(pedido)).rows[0].r.repetida).toBe(true);
    const depois = await banco.query(
      "select bytes_recebidos from public.relatorio_cargas where restaurante_id=$1 and id=$2",
      [casa, pedido.manifesto.carga_id]
    );
    expect(depois.rows).toEqual(antes.rows);
    await recusar(
      () =>
        receber({
          ...pedido,
          manifesto: { ...pedido.manifesto, recursos: [] },
        }),
      "manifesto_divergente"
    );
    await recusar(
      () =>
        receber({ ...pedido, linhas: [{ ...pedido.linhas[0], vendas: "9" }] }),
      "pagina_conflitante"
    );
    // Mesmo hash não autoriza JSON divergente enquanto dados ainda existem.
    await banco.query(
      "update public.relatorio_paginas set dados=jsonb_set(dados,'{0,vendas}', '\"8\"') where restaurante_id=$1",
      [casa]
    );
    await recusar(() => receber(pedido), "pagina_conflitante");
  });

  it("rejeita sequência antiga e ID de outra casa sem revelar recibo", async () => {
    const pedido = nova("2");
    await receber(pedido);
    await publicar(pedido.manifesto.carga_id);
    await recusar(() => receber(nova("1")), "sequencia_obsoleta");
    await recusar(() => receber(nova("2")), "sequencia_obsoleta");
    await recusar(
      () => publicar(pedido.manifesto.carga_id, fixture.restauranteB),
      "carga_nao_encontrada"
    );
    const b = nova();
    await receber(b, fixture.restauranteB);
    expect(
      (await publicar(b.manifesto.carga_id, fixture.restauranteB)).revisao
    ).toBe("1");
  });

  it("recebe páginas fora de ordem e mantém duplicatas legítimas de auditoria", async () => {
    const pedido = {
      ...nova(),
      manifesto: {
        ...nova().manifesto,
        relatorio: "auditoria",
        recursos: [],
        total_paginas: 2,
        total_linhas: 2,
      },
      numero: 2,
      linhas: [linhasRelatorios.auditoria],
    };
    await receber(pedido);
    await receber({ ...pedido, numero: 1 });
    await publicar(pedido.manifesto.carga_id);
    expect(await cache()).toEqual([
      linhasRelatorios.auditoria,
      linhasRelatorios.auditoria,
    ]);
  });

  it("fotografia vazia remove só o escopo e preserva a fonte oposta", async () => {
    const historico = nova();
    const online = {
      ...nova(),
      manifesto: { ...nova().manifesto, fonte: "online" },
    };
    await receber(historico);
    await publicar(historico.manifesto.carga_id);
    await receber(online);
    await publicar(online.manifesto.carga_id);
    const vazia = { ...nova("2"), linhas: [] };
    vazia.manifesto.total_linhas = 0;
    await receber(vazia);
    await publicar(vazia.manifesto.carga_id);
    expect(await cache()).toHaveLength(1);
    const { rows } = await banco.query(
      "select fonte,quantidade from public.relatorio_publicacoes where restaurante_id=$1 order by fonte",
      [casa]
    );
    expect(rows).toEqual([
      { fonte: "historico", quantidade: 0 },
      { fonte: "online", quantidade: 1 },
    ]);
  });

  it("aceita financeiro vazio e recusa mais de uma linha", async () => {
    const pedido = {
      ...nova(),
      manifesto: {
        ...nova().manifesto,
        relatorio: "financeiro",
        recursos: [],
        total_linhas: 0,
      },
      linhas: [],
    };
    await receber(pedido);
    await publicar(pedido.manifesto.carga_id);
    await recusar(
      () =>
        receber({
          ...pedido,
          manifesto: {
            ...pedido.manifesto,
            carga_id: randomUUID(),
            sequencia: "2",
            total_linhas: 2,
          },
          linhas: [linhasRelatorios.financeiro, linhasRelatorios.financeiro],
        }),
      "pedido_relatorio_invalido"
    );
  });

  it("revalida dados adulterados antes de substituir cache", async () => {
    const pedido = nova();
    await receber(pedido);
    await banco.query(
      'update public.relatorio_paginas set dados=\'[{"NomeCliente":"Pessoa fictícia"}]\' where restaurante_id=$1',
      [casa]
    );
    await recusar(
      () => publicar(pedido.manifesto.carga_id),
      "linha_relatorio_invalida"
    );
    expect(await cache()).toEqual([]);
  });

  it("limita dez cargas abertas e valida envelope, manifesto, linha e bytes UTF-8", async () => {
    for (const pedido of [
      { ...nova(), restaurante_id: casa },
      { ...nova(), numero: 2 },
      { ...nova(), manifesto: { ...nova().manifesto, sequencia: 1 } },
      {
        ...nova(),
        manifesto: { ...nova().manifesto, dia_movimento: "2026-02-30" },
      },
      {
        ...nova(),
        manifesto: {
          ...nova().manifesto,
          capturado_em: "0000-02-29T12:00:00Z",
        },
      },
      {
        ...nova(),
        manifesto: {
          ...nova().manifesto,
          capturado_em: "2026-02-14T12:00:00+16:00",
        },
      },
    ])
      await recusar(() => receber(pedido), "pedido_relatorio_invalido");
    await recusar(
      () =>
        receber({
          ...nova(),
          linhas: [
            { ...linhasRelatorios.produtos, NomeCliente: "Pessoa fictícia" },
          ],
        }),
      "linha_relatorio_invalida"
    );
    const pedido = nova();
    await receber(pedido);
    const { rows } = await banco.query(
      "select bytes_recebidos,octet_length(convert_to($2::jsonb::text,'UTF8'))::text esperado from public.relatorio_cargas where restaurante_id=$1",
      [casa, JSON.stringify(pedido)]
    );
    expect(rows[0].bytes_recebidos).toBe(rows[0].esperado);
    for (let sequencia = 2; sequencia <= 10; sequencia++)
      await receber(nova(String(sequencia)));
    await recusar(() => receber(nova("11")), "limite_cargas_abertas");
    expect((await receber(pedido)).rows[0].r.repetida).toBe(true);
  });

  it("expira staging em 24h e remove só recibos antigos sem publicação ativa", async () => {
    const antiga = nova();
    await receber(antiga);
    await publicar(antiga.manifesto.carga_id);
    const ativa = nova("2");
    await receber(ativa);
    await publicar(ativa.manifesto.carga_id);
    const incompleta = nova("3");
    await receber(incompleta);
    await banco.query(
      "update public.relatorio_cargas set criada_em=now()-interval '8 days',publicada_em=case when publicada_em is null then null else now()-interval '8 days' end where restaurante_id=$1",
      [casa]
    );
    await banco.query("select public.limpar_cargas_relatorio()");
    await banco.query("select public.limpar_cargas_relatorio()");
    expect(await cache()).toHaveLength(1);
    const { rows } = await banco.query(
      "select id,estado from public.relatorio_cargas where restaurante_id=$1 order by sequencia",
      [casa]
    );
    expect(rows).toEqual([
      { id: ativa.manifesto.carga_id, estado: "publicada" },
    ]);
  });

  it("expira carga de 25h sem remover o cache nem o recibo ainda recente", async () => {
    const ativa = nova();
    await receber(ativa);
    await publicar(ativa.manifesto.carga_id);
    const incompleta = nova("2");
    await receber(incompleta);
    await banco.query(
      "update public.relatorio_cargas set criada_em=now()-interval '25 hours' where restaurante_id=$1 and id=$2",
      [casa, incompleta.manifesto.carga_id]
    );
    await banco.query("select public.limpar_cargas_relatorio()");
    expect(await cache()).toHaveLength(1);
    const { rows } = await banco.query(
      "select estado,(select count(*)::int from public.relatorio_paginas p where p.restaurante_id=c.restaurante_id and p.carga_id=c.id) paginas from public.relatorio_cargas c where restaurante_id=$1 and id=$2",
      [casa, incompleta.manifesto.carga_id]
    );
    expect(rows).toEqual([{ estado: "expirada", paginas: 0 }]);
    await recusar(
      () => publicar(incompleta.manifesto.carga_id),
      "carga_expirada"
    );
  });

  it("recusa nova página quando o acumulado ultrapassa 32 MiB", async () => {
    const pedido = nova();
    pedido.manifesto.total_paginas = 2;
    pedido.manifesto.total_linhas = 2;
    await receber(pedido);
    await banco.query(
      "update public.relatorio_cargas set bytes_recebidos=33554432 where restaurante_id=$1 and id=$2",
      [casa, pedido.manifesto.carga_id]
    );
    await recusar(
      () => receber({ ...pedido, numero: 2 }),
      "limite_bytes_carga"
    );
    expect((await receber(pedido)).rows[0].r.repetida).toBe(true);
  });

  it("somente service_role executa as RPCs técnicas", async () => {
    for (const assinatura of [
      "receber_pagina_relatorio(uuid,jsonb)",
      "publicar_relatorio(uuid,uuid)",
      "limpar_cargas_relatorio()",
    ]) {
      const { rows } = await banco.query(
        "select r,has_function_privilege(r,$1,'EXECUTE') permitido from unnest(array['anon','authenticated','service_role']) r",
        [`public.${assinatura}`]
      );
      expect(rows).toEqual([
        { r: "anon", permitido: false },
        { r: "authenticated", permitido: false },
        { r: "service_role", permitido: true },
      ]);
    }
    await banco.query("set local role service_role");
    const pedido = nova();
    await receber(pedido);
    expect((await publicar(pedido.manifesto.carga_id)).revisao).toBe("1");
  });
});

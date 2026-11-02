import { randomUUID } from "node:crypto";
import type { Client } from "pg";
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXTRAS_CONHECIDOS } from "../../supabase/functions/_shared/campos-permitidos";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  endpointRecepcao,
  entrada as entradaLegada,
  envelhecerSinal as envelhecerSinalLegado,
  envelope as envelopeLegado,
  enviar,
  hashToken,
  limparFixture,
} from "../helpers/supabase-local";

let sequencia = 0;
function entrada(codigo: number, parcial: Record<string, unknown> = {}) {
  const valor = entradaLegada(codigo, parcial);
  return {
    ...valor,
    Pago: valor.Pago === "Sim" || (valor.Pago as unknown) === true,
    ...Object.fromEntries(
      [
        "ValorItens",
        "ValorDescontos",
        "ValorAcrescimos",
        "TaxaServico",
        "Complemento",
        "ValorConsumido",
      ]
        .filter((chave) => chave in valor)
        .map((chave) => [
          chave,
          String((valor as Record<string, unknown>)[chave]),
        ])
    ),
  };
}
function envelope(dados: unknown[], desde = "2026-10-09", ate = "2026-10-10") {
  return {
    versao_formato: 2,
    tipo_envio: "entradas",
    versao_scc: "teste-1.0",
    enviado_em: "2026-10-10T02:00:00Z",
    id_envio: randomUUID(),
    sequencia: String(++sequencia),
    natureza: "scc",
    modo: "janela",
    janela: { desde, ate },
    pagina: { numero: 1, total: 1 },
    total_registros: dados.length,
    dados,
  };
}
async function envelhecerSinal(banco: Client, restaurante: string) {
  await envelhecerSinalLegado(banco, restaurante);
  await banco.query(
    "update public.cargas_scc set publicada_em = now() - interval '21 seconds' where restaurante_id = $1 and estado = 'publicada'",
    [restaurante]
  );
}

type ResultadoEnvio = {
  gravadas: number;
  inalteradas: number;
  removidas: number;
};

describe("receber-envio no Supabase local", () => {
  let banco: Client = undefined as never;
  let fixture: Fixture = undefined as never;

  beforeEach(async () => {
    banco = undefined as never;
    fixture = undefined as never;
    sequencia = 0;
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
  });

  afterEach(async () => {
    await limpar();
  });

  async function limpar() {
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      if (banco) await banco.end();
      banco = undefined as never;
      fixture = undefined as never;
    }
  }

  async function enviarComPausa(corpo: unknown): Promise<Response> {
    await envelhecerSinal(banco, fixture.restauranteA);
    return enviar(fixture.tokenA, corpo);
  }

  it("grava três entradas novas e não duplica o mesmo envio", async () => {
    const corpo = envelope([entrada(101), entrada(102), entrada(103)]);
    const primeiro = await enviar(fixture.tokenA, corpo);
    expect(primeiro.status).toBe(200);
    expect(await primeiro.json()).toMatchObject({ estado: "publicada" });

    const segundo = await enviarComPausa(corpo);
    expect(segundo.status).toBe(200);
    expect(await segundo.json()).toMatchObject({ estado: "publicada" });
    const contagem = await banco.query<{ total: string }>(
      "select count(*)::text as total from public.entradas where restaurante_id = $1",
      [fixture.restauranteA]
    );
    expect(contagem.rows[0]?.total).toBe("3");
  });

  it("atualiza uma entrada aberta quando ela volta paga", async () => {
    const aberta = entrada(201, {
      DataSaida: null,
      HoraSaida: null,
      Pago: "Não",
    });
    expect((await enviar(fixture.tokenA, envelope([aberta]))).status).toBe(200);

    const paga = entrada(201, { Pago: "Sim" });
    const resposta = await enviarComPausa(envelope([paga]));
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ estado: "publicada" });
    const registro = await banco.query<{
      pago: boolean;
      fechada_em: string | null;
    }>(
      "select pago, fechada_em from public.entradas where restaurante_id = $1 and cod_entrada = 201",
      [fixture.restauranteA]
    );
    expect(registro.rows[0]).toMatchObject({ pago: true });
    expect(registro.rows[0]?.fechada_em).not.toBeNull();
  });

  it("reconcilia entrada ausente e a restaura quando ela reaparece", async () => {
    expect(
      (await enviar(fixture.tokenA, envelope([entrada(301)]))).status
    ).toBe(200);
    const semEntrada = await enviarComPausa(envelope([]));
    expect(await semEntrada.json()).toMatchObject({ estado: "publicada" });
    const removida = await banco.query<{ removida_em: string | null }>(
      "select removida_em from public.entradas where restaurante_id = $1 and cod_entrada = 301",
      [fixture.restauranteA]
    );
    expect(removida.rows[0]?.removida_em).not.toBeNull();

    const retorno = await enviarComPausa(envelope([entrada(301)]));
    expect(await retorno.json()).toMatchObject({ estado: "publicada" });
    const restaurada = await banco.query<{ removida_em: string | null }>(
      "select removida_em from public.entradas where restaurante_id = $1 and cod_entrada = 301",
      [fixture.restauranteA]
    );
    expect(restaurada.rows[0]?.removida_em).toBeNull();
  });

  it("remove conta aberta antiga mesmo fora da janela quando ela deixa de vir", async () => {
    const abertaAntiga = entrada(401, {
      DataEntrada: "2026-09-01",
      HoraEntrada: "23:30:00",
      DataSaida: null,
      HoraSaida: null,
      Pago: false,
    });
    expect(
      (
        await enviar(
          fixture.tokenA,
          envelope([abertaAntiga], "2026-09-01", "2026-09-01")
        )
      ).status
    ).toBe(200);
    const resposta = await enviarComPausa(
      envelope([], "2026-10-09", "2026-10-10")
    );
    expect(await resposta.json()).toMatchObject({ estado: "publicada" });
    const removida = await banco.query(
      "select removida_em from public.entradas where restaurante_id=$1 and cod_entrada=401",
      [fixture.restauranteA]
    );
    expect(removida.rowCount).toBe(1);
    expect(removida.rows[0]?.removida_em).not.toBeNull();
  });

  it("descarta todos os dados pessoais das entradas e do payload", async () => {
    const corpo = envelope([
      entrada(501, {
        NomeCliente: "Pessoa de teste",
        RG: "000.000.000-00",
        FoneCliente: "(85) 99999-9999",
        Sexo: "X",
      }),
    ]);
    expect((await enviar(fixture.tokenA, corpo)).status).toBe(200);
    const dados = await banco.query<{ entrada: unknown; payload: unknown }>(
      `select to_jsonb(e) as entrada, v.payload
         from public.entradas e
         join public.envios v on v.restaurante_id = e.restaurante_id
        where e.restaurante_id = $1 and e.cod_entrada = 501 and v.http_status = 200
        order by v.id desc limit 1`,
      [fixture.restauranteA]
    );
    expect(dados.rowCount).toBe(1);
    const entradaGravada = JSON.stringify(dados.rows[0]?.entrada);
    const payloadGravado = JSON.stringify(dados.rows[0]?.payload);
    for (const campoOuValor of [
      "NomeCliente",
      "Pessoa de teste",
      "RG",
      "000.000.000-00",
      "FoneCliente",
      "(85) 99999-9999",
      "Sexo",
      '"X"',
    ]) {
      expect(entradaGravada).not.toContain(campoOuValor);
      expect(payloadGravado).not.toContain(campoOuValor);
    }
  });

  it("recusa campos desconhecidos sem guardar valores e aceita extra conhecido", async () => {
    const segredo = "valor_privado_ficticio";
    const resposta = await enviar(fixture.tokenA, {
      ...envelope([entrada(511, { CPF: segredo, NomeCliente: segredo })]),
      tenant_name: segredo,
    });
    expect(resposta.status).toBe(422);
    expect(await resposta.text()).not.toContain(segredo);
    for (const tabela of ["entradas", "envios", "cargas_scc", "paginas_scc"]) {
      const linhas = await banco.query(
        `select row_to_json(t)::text as registro from public.${tabela} t where restaurante_id = $1`,
        [fixture.restauranteA]
      );
      expect(JSON.stringify(linhas.rows)).not.toContain(segredo);
      expect(linhas.rowCount).toBe(0);
    }
    expect(
      (await enviar(fixture.tokenA, envelope([entrada(511, { ECF: 123456 })])))
        .status
    ).toBe(200);
    const dados = await banco.query(
      "select extras from public.entradas where restaurante_id = $1 and cod_entrada=511",
      [fixture.restauranteA]
    );
    expect(dados.rows[0]?.extras).toEqual({ ECF: 123456 });
  });

  it("no envio recusado, o campo novo também não fica guardado", async () => {
    const segredo = "111.222.333-44";
    const resposta = await enviar(
      fixture.tokenA,
      envelope([entrada(512, { CPF: segredo })])
    );
    expect(resposta.status).toBe(422);
    expect(await resposta.text()).not.toContain(segredo);
    for (const tabela of ["entradas", "envios", "cargas_scc", "paginas_scc"]) {
      const registro = await banco.query(
        `select row_to_json(t)::text as registro from public.${tabela} t where restaurante_id=$1`,
        [fixture.restauranteA]
      );
      expect(JSON.stringify(registro.rows)).not.toContain(segredo);
      expect(registro.rowCount).toBe(0);
    }
  });

  it("a função do banco barra o campo novo mesmo sem passar pela recepção", async () => {
    const corpo = JSON.stringify({
      ...envelopeLegado([
        entradaLegada(513, {
          CPF: "111.222.333-44",
          Flyer: { indicado_por: "Fulano de Tal" },
          COO: 7,
          TipoOcupacao: { cpf_do_cliente: "999.888.777-66" },
        }),
      ]),
      versao_scc: { nome: "Beltrano de Tal" },
    });
    await banco.query("select public.processar_envio($1, $2::jsonb)", [
      fixture.restauranteA,
      corpo,
    ]);
    const dados = await banco.query(
      `select e.extras, e.tipo_ocupacao, v.payload, v.campos_desconhecidos, v.versao_scc, v.modo
         from public.entradas e
         join public.envios v on v.restaurante_id = e.restaurante_id
        where e.restaurante_id = $1 and e.cod_entrada = 513
        order by v.id desc limit 1`,
      [fixture.restauranteA]
    );
    expect(dados.rows[0]?.extras).toEqual({ COO: 7 });
    expect(dados.rows[0]?.campos_desconhecidos).toEqual(["CPF", "Flyer"]);
    expect(dados.rows[0]?.versao_scc).toBeNull();
    expect(dados.rows[0]?.modo).toBe("janela");
    const gravado = JSON.stringify(dados.rows[0]);
    for (const valor of [
      "111.222.333-44",
      "Fulano de Tal",
      "Beltrano de Tal",
      "999.888.777-66",
    ]) {
      expect(gravado).not.toContain(valor);
    }
  });

  it("a função do banco aceita todos os extras da lista do TypeScript", async () => {
    // Montado a partir da lista em TypeScript: se a lista do SQL ficar
    // diferente dela, um extra some e este teste falha.
    const extras = Object.fromEntries(
      EXTRAS_CONHECIDOS.map((nome, i) => [nome, i < 5 ? null : i])
    );
    await banco.query("select public.processar_envio($1, $2::jsonb)", [
      fixture.restauranteA,
      JSON.stringify(envelopeLegado([entradaLegada(514, extras)])),
    ]);
    const dados = await banco.query(
      `select e.extras, v.campos_desconhecidos
         from public.entradas e
         join public.envios v on v.restaurante_id = e.restaurante_id
        where e.restaurante_id = $1 and e.cod_entrada = 514
        order by v.id desc limit 1`,
      [fixture.restauranteA]
    );
    expect(dados.rows[0]?.extras).toEqual(extras);
    expect(dados.rows[0]?.campos_desconhecidos).toEqual([]);
  });

  it("a função do banco não grava como nome de campo um número vindo de fora", async () => {
    await banco.query(
      "select public.processar_envio($1, $2::jsonb, $3::text[])",
      [
        fixture.restauranteA,
        JSON.stringify(envelopeLegado([entradaLegada(515)])),
        ["11122233344", "CampoNovo"],
      ]
    );
    const dados = await banco.query(
      `select v.*
         from public.envios v
        where v.restaurante_id = $1
        order by v.id desc limit 1`,
      [fixture.restauranteA]
    );
    expect(dados.rows[0]?.campos_desconhecidos).toEqual([
      "(nome fora do padrão)",
      "CampoNovo",
    ]);
    expect(JSON.stringify(dados.rows[0])).not.toContain("11122233344");
  });

  it("rejeita token errado, revogado e expirado", async () => {
    expect((await enviar("rf_invalido", envelope([]))).status).toBe(401);
    await banco.query(
      "update public.tokens_envio set revogado_em = now() where restaurante_id = $1",
      [fixture.restauranteA]
    );
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(401);
    await banco.query(
      "update public.tokens_envio set revogado_em = null, expira_em = now() - interval '1 second' where restaurante_id = $1",
      [fixture.restauranteA]
    );
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(401);
  });

  it("mantém o token antigo na troca por 24h e rejeita só ele depois de expirar", async () => {
    const tokenNovo = `${fixture.tokenA}_novo`;
    await banco.query(
      "update public.tokens_envio set expira_em = now() + interval '24 hours' where hash = $1",
      [hashToken(fixture.tokenA)]
    );
    await banco.query(
      "insert into public.tokens_envio (restaurante_id, hash, prefixo) values ($1, $2, 'teste-novo')",
      [fixture.restauranteA, hashToken(tokenNovo)]
    );
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(200);
    await envelhecerSinal(banco, fixture.restauranteA);
    expect((await enviar(tokenNovo, envelope([]))).status).toBe(200);
    await banco.query(
      "update public.tokens_envio set expira_em = now() - interval '1 second' where hash = $1",
      [hashToken(fixture.tokenA)]
    );
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(401);
    await envelhecerSinal(banco, fixture.restauranteA);
    expect((await enviar(tokenNovo, envelope([]))).status).toBe(200);
  });

  it("responde os limites e erros HTTP do contrato", async () => {
    expect((await fetch(endpointRecepcao)).status).toBe(405);
    expect(
      (
        await fetch(endpointRecepcao, {
          method: "POST",
          headers: { authorization: `Bearer ${fixture.tokenA}` },
          body: "{",
        })
      ).status
    ).toBe(400);
    const formatoInvalido = envelope([]) as { versao_formato: number };
    formatoInvalido.versao_formato = 1;
    const invalido = await enviarComPausa(formatoInvalido);
    expect(invalido.status).toBe(422);
    expect(await invalido.json()).toMatchObject({
      ok: false,
      erro: "formato inválido",
      campos: expect.any(Array),
    });
    const muitas = envelope(
      Array.from({ length: 2001 }, (_, indice) => entrada(6000 + indice))
    );
    expect((await enviarComPausa(muitas)).status).toBe(413);
    const grande = "x".repeat(2 * 1024 * 1024 + 1);
    expect(
      (
        await fetch(endpointRecepcao, {
          method: "POST",
          headers: { authorization: `Bearer ${fixture.tokenA}` },
          body: grande,
        })
      ).status
    ).toBe(413);
    const erroInterno = await enviarComPausa(
      envelope([entrada(9999, { ValorConsumido: 10_000_000_000 })])
    );
    expect(erroInterno.status).toBe(422);
    expect((await erroInterno.json()) as { erro: string }).toEqual({
      ok: false,
      erro: "carga inválida",
    });
  });

  it("rejeita no HTTP campos ausentes, fechamento incompleto e TipoCartao nulo", async () => {
    const { ValorDescontos: _, ...semObrigatorio } = entrada(6101);
    for (const corpo of [
      envelope([semObrigatorio]),
      envelope([entrada(6102, { DataSaida: "2026-10-09", HoraSaida: null })]),
      envelope([entrada(6103, { TipoCartao: null })]),
    ]) {
      const resposta = await enviarComPausa(corpo);
      expect(resposta.status).toBe(422);
      expect(await resposta.json()).toMatchObject({
        ok: false,
        erro: "formato inválido",
        campos: expect.any(Array),
      });
    }
    expect((await enviarComPausa(envelope([entrada(6104)]))).status).toBe(200);
  });

  it("limita o ritmo a uma chamada a cada vinte segundos", async () => {
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(200);
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(429);
  });

  it("um 429 não reinicia a contagem dos vinte segundos", async () => {
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(200);
    await banco.query(
      "update public.cargas_scc set publicada_em = now() - interval '15 seconds' where restaurante_id = $1 and estado = 'publicada'",
      [fixture.restauranteA]
    );
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(429);
    const sinal = await banco.query(
      `select publicada_em < now() - interval '14 seconds' as contagem_preservada
         from public.cargas_scc where restaurante_id = $1 and estado = 'publicada'`,
      [fixture.restauranteA]
    );
    expect(sinal.rows[0]).toEqual({
      contagem_preservada: true,
    });
    await banco.query(
      "update public.cargas_scc set publicada_em = now() - interval '21 seconds' where restaurante_id = $1 and estado = 'publicada'",
      [fixture.restauranteA]
    );
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(200);
  });

  it("aceita envelope vazio como sinal de vida e rejeita JSON inválido sem guardar corpo", async () => {
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(200);
    const sinal = await banco.query<{
      primeiro_envio_em: string | null;
      ultimo_envio_ok_em: string | null;
    }>(
      "select primeiro_envio_em, ultimo_envio_ok_em from public.sinal_de_vida where restaurante_id = $1",
      [fixture.restauranteA]
    );
    expect(sinal.rows[0]?.primeiro_envio_em).not.toBeNull();
    expect(sinal.rows[0]?.ultimo_envio_ok_em).not.toBeNull();
    await envelhecerSinal(banco, fixture.restauranteA);
    const erro = await fetch(endpointRecepcao, {
      method: "POST",
      headers: { authorization: `Bearer ${fixture.tokenA}` },
      body: "{",
    });
    expect(erro.status).toBe(400);
    const registro = await banco.query<{ erro: string; payload: unknown }>(
      `select erro, payload from public.envios
        where restaurante_id = $1 and http_status = 400
        order by id desc limit 1`,
      [fixture.restauranteA]
    );
    expect(registro.rowCount).toBe(0);
    const depois = await banco.query<{
      primeiro_envio_em: string | null;
      ultimo_envio_ok_em: string | null;
    }>(
      "select primeiro_envio_em, ultimo_envio_ok_em from public.sinal_de_vida where restaurante_id = $1",
      [fixture.restauranteA]
    );
    expect(depois.rows[0]).toMatchObject(sinal.rows[0] ?? {});
  });

  it("erro inicial não cria sinal nem bloqueia um envio válido", async () => {
    const primeiro = await fetch(endpointRecepcao, {
      method: "POST",
      headers: { authorization: `Bearer ${fixture.tokenA}` },
      body: "{",
    });
    expect(primeiro.status).toBe(400);
    const sinal = await banco.query(
      "select 1 from public.sinal_de_vida where restaurante_id = $1",
      [fixture.restauranteA]
    );
    expect(sinal.rowCount).toBe(0);
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(200);
  });

  it("calcula o dia de operação da abertura ao atravessar a meia-noite", async () => {
    const resposta = await enviar(
      fixture.tokenA,
      envelope([
        entrada(801, {
          DataEntrada: "2026-10-09",
          HoraEntrada: "23:30:00",
          DataSaida: "2026-10-10",
          HoraSaida: "01:15:00",
        }),
      ])
    );
    expect(resposta.status).toBe(200);
    const conta = await banco.query<{ dia_operacao: string }>(
      "select dia_operacao::text from public.entradas where restaurante_id = $1 and cod_entrada = 801",
      [fixture.restauranteA]
    );
    expect(conta.rows[0]?.dia_operacao).toBe("2026-10-09");
  });

  it("serializa dois processamentos simultâneos em conexões PostgreSQL separadas", async () => {
    const corpo = JSON.stringify(envelopeLegado([entradaLegada(901)]));
    let primeiro: Client | undefined;
    let segundo: Client | undefined;
    try {
      primeiro = await conectarBanco();
      segundo = await conectarBanco();
      const resultados = await Promise.all([
        primeiro.query<{ processar_envio: ResultadoEnvio }>(
          "select public.processar_envio($1, $2::jsonb)",
          [fixture.restauranteA, corpo]
        ),
        segundo.query<{ processar_envio: ResultadoEnvio }>(
          "select public.processar_envio($1, $2::jsonb)",
          [fixture.restauranteA, corpo]
        ),
      ]);
      const contagens = resultados.map(
        (resultado) => resultado.rows[0]?.processar_envio
      );
      expect(contagens).toContainEqual(
        expect.objectContaining({ gravadas: 1 })
      );
      expect(contagens).toContainEqual(
        expect.objectContaining({ inalteradas: 1 })
      );
    } finally {
      await primeiro?.end();
      await segundo?.end();
    }
  });

  it("atribui a gravação ao restaurante do token, não ao corpo", async () => {
    const resposta = await enviar(fixture.tokenB, envelope([entrada(701)]));
    expect(resposta.status).toBe(200);
    const emA = await banco.query(
      "select 1 from public.entradas where restaurante_id = $1 and cod_entrada = 701",
      [fixture.restauranteA]
    );
    const emB = await banco.query(
      "select 1 from public.entradas where restaurante_id = $1 and cod_entrada = 701",
      [fixture.restauranteB]
    );
    expect(emA.rowCount).toBe(0);
    expect(emB.rowCount).toBe(1);
  });
});

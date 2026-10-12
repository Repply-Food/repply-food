import type { Client } from "pg";
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  endpointRecepcao,
  entrada,
  envelhecerSinal,
  envelope,
  enviar,
  hashToken,
  limparFixture,
} from "../helpers/supabase-local";

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
    expect((await primeiro.json()) as ResultadoEnvio).toMatchObject({
      gravadas: 3,
      inalteradas: 0,
    });

    const segundo = await enviarComPausa(corpo);
    expect(segundo.status).toBe(200);
    expect((await segundo.json()) as ResultadoEnvio).toMatchObject({
      gravadas: 0,
      inalteradas: 3,
    });
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
    expect((await resposta.json()) as ResultadoEnvio).toMatchObject({
      gravadas: 1,
    });
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
    expect((await semEntrada.json()) as ResultadoEnvio).toMatchObject({
      removidas: 1,
    });
    const removida = await banco.query<{ removida_em: string | null }>(
      "select removida_em from public.entradas where restaurante_id = $1 and cod_entrada = 301",
      [fixture.restauranteA]
    );
    expect(removida.rows[0]?.removida_em).not.toBeNull();

    const retorno = await enviarComPausa(envelope([entrada(301)]));
    expect((await retorno.json()) as ResultadoEnvio).toMatchObject({
      inalteradas: 1,
    });
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
    expect((await resposta.json()) as ResultadoEnvio).toMatchObject({
      removidas: 1,
    });
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
    formatoInvalido.versao_formato = 2;
    const invalido = await enviarComPausa(formatoInvalido);
    expect(invalido.status).toBe(422);
    expect((await invalido.json()) as { erros: unknown[] }).toHaveProperty(
      "erros"
    );
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
    expect(erroInterno.status).toBe(500);
    expect((await erroInterno.json()) as { erro: string }).toEqual({
      ok: false,
      erro: "erro interno",
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
        erros: [
          expect.objectContaining({
            campo: expect.any(String),
            mensagem: expect.any(String),
          }),
        ],
      });
    }
    expect((await enviarComPausa(envelope([entrada(6104)]))).status).toBe(200);
  });

  it("limita o ritmo a uma chamada a cada vinte segundos", async () => {
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(200);
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(429);
  });

  it("aceita envelope vazio como sinal de vida e registra erro autenticado curto", async () => {
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
    expect(registro.rows[0]?.erro).toBe("json inválido");
    expect(JSON.stringify(registro.rows[0]?.payload)).not.toContain("RG");
    const depois = await banco.query<{
      primeiro_envio_em: string | null;
      ultimo_envio_ok_em: string | null;
    }>(
      "select primeiro_envio_em, ultimo_envio_ok_em from public.sinal_de_vida where restaurante_id = $1",
      [fixture.restauranteA]
    );
    expect(depois.rows[0]).toMatchObject(sinal.rows[0] ?? {});
  });

  it("cria sinal no primeiro erro autenticado e limita a repetição imediata", async () => {
    const primeiro = await fetch(endpointRecepcao, {
      method: "POST",
      headers: { authorization: `Bearer ${fixture.tokenA}` },
      body: "{",
    });
    expect(primeiro.status).toBe(400);
    const sinal = await banco.query<{
      primeiro_envio_em: string | null;
      ultimo_envio_ok_em: string | null;
      ultimo_erro_em: string | null;
    }>(
      `select primeiro_envio_em, ultimo_envio_ok_em, ultimo_erro_em
         from public.sinal_de_vida where restaurante_id = $1`,
      [fixture.restauranteA]
    );
    expect(sinal.rows[0]).toMatchObject({
      primeiro_envio_em: null,
      ultimo_envio_ok_em: null,
    });
    expect(sinal.rows[0]?.ultimo_erro_em).not.toBeNull();
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(429);
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
    const corpo = JSON.stringify(envelope([entrada(901)]));
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

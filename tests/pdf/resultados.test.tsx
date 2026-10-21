import { execFile } from "node:child_process";
// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { FiltrosResultados } from "@/lib/metricas/resultados/filtros";
import type { DadosDeResultados } from "@/lib/metricas/resultados/tipos";
import { DocumentoResultadosPdf } from "@/lib/pdf/resultados";
import { renderToBuffer } from "@react-pdf/renderer";
import { afterEach, describe, expect, it } from "vitest";

const executar = promisify(execFile);
const diretorios: string[] = [];

const filtros: FiltrosResultados = {
  aba: "vendas",
  comparacao: "anterior",
  atalho: "mes",
  inicio: "2026-10-01",
  fim: "2026-10-07",
  quantidadeDias: 7,
  rotuloPeriodo: "1 de outubro a 7 de outubro de 2026",
  query: "aba=vendas&periodo=7d&comparacao=anterior",
};

const dados: DadosDeResultados = {
  resumo: {
    faturamento: "1200.00",
    taxaServico: "120.00",
    contas: 18,
    pessoas: 42,
    ticketConta: "66.67",
    ticketPessoa: "28.57",
    descontosTotal: "35.00",
    percentualDescontos: 0.029,
    referencia: {
      faturamento: "1000.00",
      contas: 15,
      pessoas: 35,
      ticketConta: "66.67",
      ticketPessoa: "28.57",
    },
    variacao: {
      faturamento: 20,
      contas: 20,
      pessoas: 20,
      ticketConta: 0,
      ticketPessoa: 0,
    },
  },
  vendasDiarias: [
    {
      diaOperacao: "2026-10-01",
      faturamento: "1200.00",
      taxaServico: "120.00",
    },
  ],
  ocupacao: [{ tipo: "Mesa", faturamento: "900.00", participacao: 0.75 }],
  horas: [{ hora: 12, faturamento: "600.00" }],
  mapa: [{ diaSemana: 5, hora: 12, mediaContas: 3.5 }],
  turnos: [
    {
      turno: "Almoço",
      faturamento: "600.00",
      contas: 9,
      permanenciaMedia: "01:15:00",
    },
  ],
  equipe: [
    {
      codGarcom: 27,
      faturamento: "1200.00",
      contas: 18,
      pessoas: 42,
      ticketConta: "66.67",
      ticketPessoa: "28.57",
      taxaServico: "120.00",
    },
  ],
  descontos: [{ codOperadorFechamento: 8, descontos: "35.00" }],
  meta: {
    faturamentoMes: "1200.00",
    meta: "2000.00",
    andamento: 0.6,
    projecao: "1800.00",
    projecaoDisponivel: true,
  },
};

const dadosComSentinelas = {
  ...dados,
  nomeCliente: "Cliente Sentinela",
  telefone: "11999998888",
  token: "token-sentinela-secreto",
  payload: "payload-sentinela-secreto",
} as DadosDeResultados & {
  nomeCliente: string;
  telefone: string;
  token: string;
  payload: string;
};

afterEach(async () => {
  await Promise.all(
    diretorios.splice(0).map((diretorio) => rm(diretorio, { recursive: true }))
  );
});

describe("DocumentoResultadosPdf", () => {
  it("exporta valores representativos de todas as análises e não expõe sentinelas", async () => {
    const buffer = await renderToBuffer(
      <DocumentoResultadosPdf
        casa={{ nome: "Casa Exemplo" }}
        filtros={filtros}
        dados={dadosComSentinelas}
        geradoEm={new Date("2026-10-08T15:30:00Z")}
        fuso="America/Sao_Paulo"
      />
    );
    const diretorio = await mkdtemp(join(tmpdir(), "resultados-pdf-"));
    diretorios.push(diretorio);
    const arquivo = join(diretorio, "resultados.pdf");
    await writeFile(arquivo, buffer);

    const texto = await readFile(arquivo);
    expect(texto.subarray(0, 4).toString()).toBe("%PDF");

    // -enc UTF-8: sem isso, o pdftotext de alguns sistemas (ex.: Windows)
    // devolve os acentos truncados e as buscas por texto acentuado falham.
    const { stdout } = await executar("pdftotext", [
      "-enc",
      "UTF-8",
      arquivo,
      "-",
    ]);
    expect(stdout).toContain("Casa Exemplo");
    expect(stdout).toContain("1 de outubro a 7 de outubro de 2026");
    expect(stdout).toContain("Comparação: Período anterior");
    expect(stdout).toContain("Gerado em 08/10/2026, 12:30:00");
    expect(stdout).toContain("Vendas");
    expect(stdout).toContain("Horários");
    expect(stdout).toContain("Equipe");
    expect(stdout).toContain("Descontos");
    expect(stdout).toContain("Taxa de serviço");
    expect(stdout).toContain("R$ 1.200,00");
    expect(stdout).toContain("01/10/2026");
    expect(stdout).toContain("Mesa");
    expect(stdout).toContain("12:00");
    expect(stdout).toContain("Sexta, 12h");
    expect(stdout).toContain("Almoço");
    expect(stdout).toContain("01:15:00");
    expect(stdout).toContain("Garçom 27");
    expect(stdout).toContain("Operador 8");
    expect(stdout).toContain("2,9%");
    expect(stdout).toContain("Meta do mês");
    expect(stdout).not.toContain(dadosComSentinelas.nomeCliente);
    expect(stdout).not.toContain(dadosComSentinelas.telefone);
    expect(stdout).not.toContain(dadosComSentinelas.token);
    expect(stdout).not.toContain(dadosComSentinelas.payload);
  });
});

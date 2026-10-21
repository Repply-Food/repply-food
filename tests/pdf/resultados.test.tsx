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
  atalho: "7d",
  inicio: "2026-10-01",
  fim: "2026-10-07",
  quantidadeDias: 7,
  rotuloPeriodo: "1 de outubro a 7 de outubro de 2026",
  query: new URLSearchParams("aba=vendas&periodo=7d&comparacao=anterior"),
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
    percentualDescontos: 2.9,
    referencia: { faturamento: "1000.00", contas: 15, ticketConta: "66.67" },
    variacao: { faturamento: 20, contas: 20, ticketConta: 0 },
  },
  vendasDiarias: [
    {
      diaOperacao: "2026-10-01",
      faturamento: "1200.00",
      taxaServico: "120.00",
    },
  ],
  ocupacao: [],
  horas: [{ hora: 12, faturamento: "600.00" }],
  mapa: [],
  turnos: [],
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
  meta: null,
};

afterEach(async () => {
  await Promise.all(
    diretorios.splice(0).map((diretorio) => rm(diretorio, { recursive: true }))
  );
});

describe("DocumentoResultadosPdf", () => {
  it("renderiza as quatro seções e não expõe conteúdo pessoal ou segredo", async () => {
    const buffer = await renderToBuffer(
      <DocumentoResultadosPdf
        casa={{ nome: "Casa Exemplo" }}
        filtros={filtros}
        dados={dados}
        geradoEm={new Date("2026-10-08T15:30:00Z")}
      />
    );
    const diretorio = await mkdtemp(join(tmpdir(), "resultados-pdf-"));
    diretorios.push(diretorio);
    const arquivo = join(diretorio, "resultados.pdf");
    await writeFile(arquivo, buffer);

    await executar("pdftotext", [arquivo, "-"]);
    const texto = await readFile(arquivo);
    expect(texto.subarray(0, 4).toString()).toBe("%PDF");

    const { stdout } = await executar("pdftotext", [arquivo, "-"]);
    expect(stdout).toContain("Vendas");
    expect(stdout).toContain("Horários");
    expect(stdout).toContain("Equipe");
    expect(stdout).toContain("Descontos");
    expect(stdout).toContain("Taxa de serviço");
    expect(stdout).not.toContain("cliente@exemplo.com");
    expect(stdout).not.toContain("senha-super-secreta");
  });
});

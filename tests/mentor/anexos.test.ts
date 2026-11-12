// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient as criarCliente } from "@supabase/supabase-js";
import type { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";
import { conectarBanco } from "../helpers/supabase-local";

// Validar, subir e vincular os anexos do mentor (Fase 4) contra o Storage
// local de verdade e a chave de serviço — o mesmo padrão de
// `tests/mentor/memoria-extracao.test.ts`: sem provedor dublê aqui, só o
// cofre real. Os asserts RELEEM o banco e o cofre: zero linhas afetadas
// não é sucesso, e rollback deixa 0 arquivos no cofre E 0 linhas na tabela.

vi.mock("server-only", () => ({}));

import {
  FalhaDoMentor,
  MAXIMO_ANEXOS_POR_PERGUNTA,
  TAMANHO_MAXIMO_ANEXO,
  TIPOS_ANEXO,
  excluirAnexosDaConversa,
  gravarAnexos,
  urlParaBaixar,
  validarArquivos,
  vincularAnexos,
} from "@/lib/mentor/anexos";

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
const sufixo = randomUUID().slice(0, 8);
const servico = criarCliente<Database>(
  URL_LOCAL,
  chaveLocal("service_role"),
  opcoes
);

function arquivo(
  nome: string,
  tipo: string,
  conteudo: string | Uint8Array<ArrayBuffer> = "conteudo"
): File {
  const corpo =
    typeof conteudo === "string"
      ? new TextEncoder().encode(conteudo)
      : conteudo;
  return new File([corpo], nome, { type: tipo });
}

const pdf = (nome: string, conteudo: string) =>
  arquivo(nome, "application/pdf", conteudo);
const png = (nome: string, conteudo: string) =>
  arquivo(nome, "image/png", conteudo);

let banco: Client;
let casaA = "";
let casaB = "";
let conversaA = "";
let conversaB = "";
let conversaDaB = "";

/** Caminhos que subiram ao cofre neste teste (limpeza de melhor esforço). */
const caminhosNoCofre: string[] = [];

function observar(...caminhos: (string | undefined | null)[]): void {
  for (const caminho of caminhos) {
    if (caminho) caminhosNoCofre.push(caminho);
  }
}

async function limparCofre(): Promise<void> {
  if (caminhosNoCofre.length === 0) return;
  const todos = [...new Set(caminhosNoCofre)];
  caminhosNoCofre.length = 0;
  try {
    await servico.storage.from("mentor-anexos").remove(todos);
  } catch {
    // Melhor esforço: o que o rollback já apagou não precisa sair de novo.
  }
}

/** Nomes de arquivo dentro de uma pasta do cofre (ex.: "pendente"). */
async function nomesEm(pasta: string): Promise<string[]> {
  const lista = await servico.storage
    .from("mentor-anexos")
    .list(pasta, { limit: 100 });
  if (lista.error || !lista.data) return [];
  return lista.data.map((item) => item.name);
}

async function contarAnexos(
  casa: string,
  conversa: string | null = null
): Promise<number> {
  const r =
    conversa === null
      ? await banco.query<{ total: number }>(
          "select count(*)::int as total from public.mentor_anexos where restaurante_id = $1",
          [casa]
        )
      : await banco.query<{ total: number }>(
          "select count(*)::int as total from public.mentor_anexos where restaurante_id = $1 and conversa_id = $2",
          [casa, conversa]
        );
  return r.rows[0]?.total ?? -1;
}

async function caminhoNoBanco(id: string): Promise<string | null> {
  const r = await banco.query<{ caminho: string }>(
    "select caminho from public.mentor_anexos where id = $1",
    [id]
  );
  return r.rows[0]?.caminho ?? null;
}

/** Baixa pelo cofre (chave de serviço); nulo quando o arquivo não está lá. */
async function baixar(caminho: string): Promise<string | null> {
  const r = await servico.storage.from("mentor-anexos").download(caminho);
  if (r.error || !r.data) return null;
  return await r.data.text();
}

function errosLogados(): string {
  return erroNoConsole.mock.calls
    .map((chamada) => chamada.map((parte) => String(parte)).join(" "))
    .join("\n");
}

const erroNoConsole = vi
  .spyOn(console, "error")
  .mockImplementation(() => undefined);

beforeAll(async () => {
  vi.stubEnv("SUPABASE_URL", URL_LOCAL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_LOCAL);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", chaveLocal("service_role"));

  banco = await conectarBanco();
  const casas = await banco.query<{ id: string }>(
    `insert into public.restaurantes (slug, nome)
      values ($1, 'Casa A dos arquivos'), ($2, 'Casa B dos arquivos')
      returning id`,
    [`arquivos-a-${sufixo}`, `arquivos-b-${sufixo}`]
  );
  [casaA, casaB] = casas.rows.map((linha) => linha.id) as [string, string];

  const conversas = await banco.query<{ id: string }>(
    `insert into public.mentor_conversas (restaurante_id, titulo)
      values ($1, 'Conversa A1'), ($1, 'Conversa A2'), ($2, 'Conversa B1')
      returning id`,
    [casaA, casaB]
  );
  [conversaA, conversaB, conversaDaB] = conversas.rows.map(
    (linha) => linha.id
  ) as [string, string, string];
});

afterAll(async () => {
  vi.unstubAllEnvs();
  erroNoConsole.mockRestore();
  try {
    if (!banco) return;
    await limparCofre();
    await banco.query("delete from public.restaurantes where slug like $1", [
      `%${sufixo}%`,
    ]);
  } finally {
    await banco?.end();
  }
});

beforeEach(async () => {
  erroNoConsole.mockClear();
  await banco.query(
    "delete from public.mentor_anexos where restaurante_id = any($1::uuid[])",
    [[casaA, casaB]]
  );
});

afterEach(async () => {
  await limparCofre();
});

describe("validarArquivos", () => {
  it("recusa 6 arquivos com frase do produto (e nunca lança)", () => {
    expect(MAXIMO_ANEXOS_POR_PERGUNTA).toBe(5);
    const seis = Array.from({ length: 6 }, (_, i) =>
      png(`foto-${i}.png`, `png-${i}`)
    );

    let saida: ReturnType<typeof validarArquivos> | undefined;
    expect(() => {
      saida = validarArquivos(seis);
    }).not.toThrow();

    expect(saida).toEqual({ ok: false, error: expect.any(String) });
    if (saida && !saida.ok) expect(saida.error).toMatch(/5 arquivos/);
  });

  it("recusa 10 MiB + 1 byte, mas aceita 10 MiB exatos", () => {
    expect(TAMANHO_MAXIMO_ANEXO).toBe(10_485_760);
    const grande = new File(
      [new Uint8Array(TAMANHO_MAXIMO_ANEXO + 1)],
      "grande.pdf",
      { type: "application/pdf" }
    );

    const recusado = validarArquivos([grande]);
    expect(recusado).toEqual({ ok: false, error: expect.any(String) });
    if (!recusado.ok) expect(recusado.error).toMatch(/10 MB/);

    const noLimite = new File(
      [new Uint8Array(TAMANHO_MAXIMO_ANEXO)],
      "limite.pdf",
      { type: "application/pdf" }
    );
    expect(validarArquivos([noLimite]).ok).toBe(true);
  });

  it("recusa .exe e mime que não bate com a extensão", () => {
    const exe = validarArquivos([
      arquivo("virus.exe", "application/x-msdownload", "x"),
    ]);
    expect(exe.ok).toBe(false);
    if (!exe.ok) expect(exe.error).toMatch(/imagem/i);

    const farsa = new File([new TextEncoder().encode("falso")], "foto.png", {
      type: "application/pdf",
    });
    const trocado = validarArquivos([farsa]);
    expect(trocado.ok).toBe(false);
  });

  it("aceita os três tipos e mapeia a extensão certa", () => {
    const lote = validarArquivos([
      png("foto.png", "a"),
      pdf("doc.pdf", "b"),
      arquivo(
        "plan.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "c"
      ),
      arquivo("base.csv", "text/csv", "d"),
    ]);

    expect(lote.ok).toBe(true);
    if (lote.ok) {
      expect(lote.arquivos.map((item) => item.tipo)).toEqual([
        "imagem",
        "pdf",
        "planilha",
        "planilha",
      ]);
      expect(lote.arquivos[0]?.mime).toBe("image/png");
    }
    expect(TIPOS_ANEXO).toMatchObject({
      png: "imagem",
      jpeg: "imagem",
      webp: "imagem",
      pdf: "pdf",
      xlsx: "planilha",
      csv: "planilha",
    });
  });
});

describe("gravarAnexos", () => {
  it("sobe para pendente e grava a ficha com a conversa como veio", async () => {
    const saidas = await gravarAnexos(casaA, null, [
      png(`cardapio-${sufixo}.png`, `bytes-a-${sufixo}`),
    ]);
    observar(saidas[0]?.caminho);

    expect(saidas).toHaveLength(1);
    expect(saidas[0]?.caminho.startsWith("pendente/")).toBe(true);

    const linha = await banco.query<{
      conversa_id: string | null;
      tipo: string;
      tamanho_bytes: number;
    }>(
      "select conversa_id, tipo, tamanho_bytes from public.mentor_anexos where id = $1",
      [saidas[0]?.id]
    );
    expect(linha.rows[0]?.conversa_id).toBeNull();
    expect(linha.rows[0]?.tipo).toBe("imagem");

    expect(await baixar(saidas[0]?.caminho ?? "")).toBe(`bytes-a-${sufixo}`);
    expect(erroNoConsole).not.toHaveBeenCalled();
  });

  it("nome com ../ é higienizado: nunca sai do prefixo da casa", async () => {
    const tag = `travessia-${sufixo}`;
    const malicioso = png(`../../etc/${tag}.png`, `bytes-${tag}`);

    expect(validarArquivos([malicioso]).ok).toBe(true);
    const saidas = await gravarAnexos(casaA, null, [malicioso]);
    observar(saidas[0]?.caminho);

    expect(saidas[0]?.caminho.startsWith("pendente/")).toBe(true);
    expect(saidas[0]?.caminho).not.toContain("..");

    await vincularAnexos(casaA, conversaA, [saidas[0]?.id ?? ""]);
    const final = await caminhoNoBanco(saidas[0]?.id ?? "");
    observar(final ?? undefined);

    expect(final?.startsWith(`${casaA}/${conversaA}/`)).toBe(true);
    expect(final).not.toContain("..");
    expect(await baixar(final ?? "")).toBe(`bytes-${tag}`);
  });

  it("falha no lote desfaz o que subiu: 0 no cofre e 0 na tabela", async () => {
    const tag = `orfao-${sufixo}`;
    const segredo = `segredo-${tag}`;
    const lote = [pdf(`a-${tag}.pdf`, segredo), pdf(`b-${tag}.pdf`, segredo)];
    const conversaInexistente = randomUUID();

    let codigo: unknown;
    try {
      await gravarAnexos(casaA, conversaInexistente, lote);
      expect.unreachable("devia ter lançado a falha do mentor");
    } catch (erro) {
      expect(erro).toBeInstanceOf(FalhaDoMentor);
      codigo = (erro as FalhaDoMentor).codigo;
    }
    expect(codigo).toBe("falha_anexos_mentor");

    expect(await contarAnexos(casaA)).toBe(0);
    const pendentes = (await nomesEm("pendente")).filter((nome) =>
      nome.includes(tag)
    );
    expect(pendentes).toEqual([]);

    // Só o código vai para o log: nunca o nome nem o conteúdo do arquivo.
    expect(errosLogados()).toContain("falha_anexos_mentor");
    expect(errosLogados()).not.toContain(tag);
    expect(errosLogados()).not.toContain(segredo);
  });
});

describe("vincularAnexos", () => {
  it("move pendente para a pasta da conversa e liga a ficha", async () => {
    const tag = `vinculo-${sufixo}`;
    const saidas = await gravarAnexos(casaA, null, [
      pdf(`novo-${tag}.pdf`, `bytes-${tag}`),
    ]);
    const id = saidas[0]?.id ?? "";
    const origem = saidas[0]?.caminho ?? "";
    observar(origem);

    await vincularAnexos(casaA, conversaA, [id]);

    const destino = await caminhoNoBanco(id);
    observar(destino ?? undefined);
    expect(destino?.startsWith(`${casaA}/${conversaA}/`)).toBe(true);
    expect(await contarAnexos(casaA, conversaA)).toBe(1);

    expect(await baixar(origem)).toBeNull();
    expect(await baixar(destino ?? "")).toBe(`bytes-${tag}`);
    expect(erroNoConsole).not.toHaveBeenCalled();
  });

  it("vincular id de outra casa falha sem mover nada", async () => {
    const tag = `grude-${sufixo}`;
    const saidas = await gravarAnexos(casaA, null, [
      pdf(`grude-${tag}.pdf`, `bytes-${tag}`),
    ]);
    const id = saidas[0]?.id ?? "";
    const origem = saidas[0]?.caminho ?? "";
    observar(origem);

    await expect(
      vincularAnexos(casaB, conversaDaB, [id])
    ).rejects.toBeInstanceOf(FalhaDoMentor);

    // Nada moveu: a ficha segue pendente e o arquivo segue no cofre.
    expect(await caminhoNoBanco(id)).toBe(origem);
    expect(await baixar(origem)).toBe(`bytes-${tag}`);
    expect(errosLogados()).toContain("falha_anexos_mentor");
  });
});

describe("excluirAnexosDaConversa", () => {
  it("apaga arquivos+linhas só daquela conversa (outra intacta)", async () => {
    const tag = `faxina-${sufixo}`;
    const [saidaA1, saidaA2] = await gravarAnexos(casaA, null, [
      pdf(`a1-${tag}.pdf`, `bytes-a1-${tag}`),
      pdf(`a2-${tag}.pdf`, `bytes-a2-${tag}`),
    ]);
    const [saidaB] = await gravarAnexos(casaA, null, [
      pdf(`b1-${tag}.pdf`, `bytes-b1-${tag}`),
    ]);
    await vincularAnexos(casaA, conversaA, [
      saidaA1?.id ?? "",
      saidaA2?.id ?? "",
    ]);
    await vincularAnexos(casaA, conversaB, [saidaB?.id ?? ""]);
    const destinoA1 = await caminhoNoBanco(saidaA1?.id ?? "");
    const destinoB = await caminhoNoBanco(saidaB?.id ?? "");
    observar(destinoA1 ?? undefined, destinoB ?? undefined);

    await excluirAnexosDaConversa(casaA, conversaA);

    expect(await contarAnexos(casaA, conversaA)).toBe(0);
    expect(await baixar(destinoA1 ?? "")).toBeNull();
    // A outra conversa da mesma casa mantém arquivo e ficha.
    expect(await contarAnexos(casaA, conversaB)).toBe(1);
    expect(await baixar(destinoB ?? "")).toBe(`bytes-b1-${tag}`);
    expect(erroNoConsole).not.toHaveBeenCalled();
  });

  it("sem anexo resolve sem erro (zero linhas = ok)", async () => {
    await expect(
      excluirAnexosDaConversa(casaA, randomUUID())
    ).resolves.toBeUndefined();
    expect(erroNoConsole).not.toHaveBeenCalled();
  });
});

describe("urlParaBaixar", () => {
  it("devolve a assinada para a casa dona (baixa os mesmos bytes)", async () => {
    const tag = `baixar-${sufixo}`;
    const [saida] = await gravarAnexos(casaA, null, [
      pdf(`menu-${tag}.pdf`, `bytes-${tag}`),
    ]);
    await vincularAnexos(casaA, conversaA, [saida?.id ?? ""]);
    observar(await caminhoNoBanco(saida?.id ?? ""));

    const url = await urlParaBaixar(casaA, saida?.id ?? "");
    expect(typeof url).toBe("string");

    const resposta = await fetch(url ?? "");
    expect(resposta.ok).toBe(true);
    const texto = await resposta.text();
    expect(texto).toBe(`bytes-${tag}`);
    expect(erroNoConsole).not.toHaveBeenCalled();
  });

  it("de outra casa ou id inexistente devolve nulo", async () => {
    const [saida] = await gravarAnexos(casaA, null, [
      pdf(`alheio-${sufixo}.pdf`, "alheio"),
    ]);
    await vincularAnexos(casaA, conversaA, [saida?.id ?? ""]);
    observar(await caminhoNoBanco(saida?.id ?? ""));

    await expect(urlParaBaixar(casaB, saida?.id ?? "")).resolves.toBeNull();
    await expect(urlParaBaixar(casaA, randomUUID())).resolves.toBeNull();
  });
});

describe("endurecimentos do revisor (M-1/M-2/M-3)", () => {
  it("M-1: nome_original envenenado no banco é re-higienizado ao vincular", async () => {
    const tag = `veneno-${sufixo}`;
    const corpo = `bytes-${tag}`;
    const origem = `pendente/${randomUUID()}-${tag}.png`;
    const subida = await servico.storage
      .from("mentor-anexos")
      .upload(origem, new TextEncoder().encode(corpo), {
        contentType: "image/png",
        upsert: false,
      });
    expect(subida.error).toBeNull();
    observar(origem);

    const veneno = `../../etc/${tag}.png`;
    const ficha = await banco.query<{ id: string }>(
      `insert into public.mentor_anexos
         (restaurante_id, conversa_id, nome_original, tipo, tamanho_bytes, caminho)
       values ($1, null, $2, 'imagem', $3, $4)
       returning id`,
      [casaA, veneno, corpo.length, origem]
    );
    const id = ficha.rows[0]?.id ?? "";
    expect(id).not.toBe("");

    await vincularAnexos(casaA, conversaA, [id]);

    const destino = await caminhoNoBanco(id);
    observar(destino ?? undefined);
    expect(destino?.startsWith(`${casaA}/${conversaA}/`)).toBe(true);
    expect(destino).not.toContain("..");
    expect(await baixar(destino ?? "")).toBe(corpo);
  });

  it("M-2: vincularAnexos recusa id malformado antes de tocar banco/cofre", async () => {
    const tag = `guarda-${sufixo}`;
    const [saida] = await gravarAnexos(casaA, null, [
      pdf(`ok-${tag}.pdf`, `bytes-${tag}`),
    ]);
    const origem = saida?.caminho ?? "";
    observar(origem);

    await expect(
      vincularAnexos(casaA, conversaA, [saida?.id ?? "", "nao-eh-uuid"])
    ).rejects.toBeInstanceOf(FalhaDoMentor);

    // Nada moveu: o id válido do lote segue pendente, arquivo intacto.
    expect(await caminhoNoBanco(saida?.id ?? "")).toBe(origem);
    expect(await baixar(origem)).toBe(`bytes-${tag}`);
    expect(errosLogados()).toContain("falha_anexos_mentor");
  });

  it("M-2: vincularAnexos recusa conversaId malformado", async () => {
    await expect(
      vincularAnexos(casaA, "conversa??", [randomUUID()])
    ).rejects.toBeInstanceOf(FalhaDoMentor);
    expect(errosLogados()).toContain("falha_anexos_mentor");
  });

  it("M-2: excluirAnexosDaConversa recusa conversaId malformado sem apagar nada", async () => {
    const tag = `fica-${sufixo}`;
    const [saida] = await gravarAnexos(casaA, null, [
      pdf(`fica-${tag}.pdf`, `bytes-${tag}`),
    ]);
    await vincularAnexos(casaA, conversaA, [saida?.id ?? ""]);
    const destino = await caminhoNoBanco(saida?.id ?? "");
    observar(destino ?? undefined);

    await expect(excluirAnexosDaConversa(casaA, "lixo")).rejects.toBeInstanceOf(
      FalhaDoMentor
    );

    expect(await contarAnexos(casaA, conversaA)).toBe(1);
    expect(await baixar(destino ?? "")).toBe(`bytes-${tag}`);
    expect(errosLogados()).toContain("falha_anexos_mentor");
  });

  it("M-3: grava tamanho_bytes dos bytes reais, não do File.size declarado", async () => {
    const tag = `real-${sufixo}`;
    const reais = new TextEncoder().encode(`bytes-${tag}`);
    const mentiroso = {
      name: `medido-${tag}.pdf`,
      type: "application/pdf",
      size: 999_999,
      arrayBuffer: async () => reais.slice().buffer as ArrayBuffer,
    } as unknown as File;

    expect(validarArquivos([mentiroso]).ok).toBe(true);
    const [saida] = await gravarAnexos(casaA, null, [mentiroso]);
    observar(saida?.caminho);

    const linha = await banco.query<{ tamanho_bytes: number }>(
      "select tamanho_bytes from public.mentor_anexos where id = $1",
      [saida?.id]
    );
    expect(linha.rows[0]?.tamanho_bytes).toBe(reais.length);
    expect(await baixar(saida?.caminho ?? "")).toBe(`bytes-${tag}`);
  });
});

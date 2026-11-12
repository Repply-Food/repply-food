// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient as criarCliente } from "@supabase/supabase-js";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";
import { conectarBanco } from "../helpers/supabase-local";

// Anexos do mentor (Fase 4) no banco: a ficha de cada arquivo que o dono
// mandou (a foto do cardápio, o PDF da planilha), guardada no cofre privado
// `mentor-anexos`. O navegador nunca toca o cofre direto: só lê a ficha da
// casa dele; quem grava e baixa o arquivo é a função do servidor, com a chave
// de serviço (por isso não há política de escrita nem política nenhuma em
// `storage.objects`). A faxina apaga a ficha com mais de 12 meses (D-72);
// apagar a casa (ou a conversa) leva as fichas junto, em cascata.
//
// Leitura barrada pela RLS devolve ZERO linhas (sem erro); escrita barrada
// devolve erro de permissão ou zero linhas afetadas. O teste confere a
// CONTAGEM e relê pelo banco: zero linhas afetadas não é sucesso.

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
const sufixo = randomUUID().slice(0, 8);
const servico = criarCliente<Database>(
  URL_LOCAL,
  chaveLocal("service_role"),
  opcoes
);

function novoCliente() {
  return criarCliente<Database>(URL_LOCAL, chaveLocal("anon"), opcoes);
}
type Cliente = ReturnType<typeof novoCliente>;

/** Cria o login no Auth local e entra com ele (signInWithPassword de verdade). */
async function criarLoginLogado(quem: string) {
  const email = `${quem}-${sufixo}@teste.repply.local`;
  const senha = `senha-${randomUUID()}`;
  const { data, error } = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`não criou o login de teste ${quem}`);
  const cliente = novoCliente();
  const entrada = await cliente.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (entrada.error) throw new Error(`o login de teste ${quem} não entrou`);
  return { id: data.user.id, cliente };
}

let banco: Client;
let casaA = "";
let casaB = "";
let donoA: Cliente;
let donoB: Cliente;
let admin: Cliente;
// Semeados direto no banco, como dono do banco, antes dos testes.
let conversaA = "";
let anexoA = "";
let caminhoA = "";

async function criarConversa(
  restauranteId: string,
  titulo: string
): Promise<string> {
  const r = await banco.query<{ id: string }>(
    `insert into public.mentor_conversas (restaurante_id, titulo)
      values ($1, $2) returning id`,
    [restauranteId, titulo]
  );
  return r.rows[0]?.id ?? "";
}

async function criarAnexo(
  restauranteId: string,
  caminho: string,
  criadaHa = "1 hour",
  conversaId: string | null = null
): Promise<string> {
  const r = await banco.query<{ id: string }>(
    `insert into public.mentor_anexos
       (restaurante_id, conversa_id, nome_original, tipo, tamanho_bytes, caminho, criada_em)
     values ($1, $2, 'cardapio.pdf', 'pdf', 1234, $3, now() - $4::interval)
     returning id`,
    [restauranteId, conversaId, caminho, criadaHa]
  );
  return r.rows[0]?.id ?? "";
}

async function anexoNoBanco(id: string) {
  const r = await banco.query<{
    id: string;
    restaurante_id: string;
    nome_original: string;
  }>(
    `select id, restaurante_id, nome_original
       from public.mentor_anexos where id = $1`,
    [id]
  );
  return r.rows[0];
}

async function existemAnexos(ids: string[]): Promise<string[]> {
  const r = await banco.query<{ id: string }>(
    "select id from public.mentor_anexos where id = any($1::uuid[])",
    [ids]
  );
  return r.rows.map((linha) => linha.id).sort();
}

beforeAll(async () => {
  banco = await conectarBanco();
  const casas = await banco.query<{ id: string }>(
    `insert into public.restaurantes (slug, nome)
      values ($1, 'Casa A dos anexos'), ($2, 'Casa B dos anexos')
      returning id`,
    [`anexos-a-${sufixo}`, `anexos-b-${sufixo}`]
  );
  [casaA, casaB] = casas.rows.map((linha) => linha.id) as [string, string];

  const loginA = await criarLoginLogado("dono-a");
  const loginB = await criarLoginLogado("dono-b");
  const loginAdmin = await criarLoginLogado("admin");
  donoA = loginA.cliente;
  donoB = loginB.cliente;
  admin = loginAdmin.cliente;
  await banco.query(
    "insert into public.acessos (user_id, restaurante_id) values ($1, $2), ($3, $4)",
    [loginA.id, casaA, loginB.id, casaB]
  );
  // O admin não tem acesso a nenhuma das duas casas: lê só pela RLS do admin.
  await banco.query("insert into public.admins_repply (user_id) values ($1)", [
    loginAdmin.id,
  ]);

  conversaA = await criarConversa(casaA, "Conversa com anexos");
  caminhoA = `anexo-a-${sufixo}/cardapio.pdf`;
  anexoA = await criarAnexo(casaA, caminhoA, "1 hour", conversaA);
});

afterAll(async () => {
  try {
    if (!banco) return;
    // As conversas e os anexos saem em cascata junto com as casas.
    await banco.query("delete from public.restaurantes where slug like $1", [
      `%${sufixo}%`,
    ]);
    const contas = await banco.query<{ id: string }>(
      "select id from auth.users where email like $1",
      [`%-${sufixo}@teste.repply.local`]
    );
    for (const { id } of contas.rows) await servico.auth.admin.deleteUser(id);
  } finally {
    await banco?.end();
  }
});

describe("o dono lê só a ficha da casa dele", () => {
  it("o dono de A lê a ficha da casa dele", async () => {
    const leitura = await donoA
      .from("mentor_anexos")
      .select("id")
      .eq("id", anexoA);
    expect(leitura.error).toBeNull();
    expect(leitura.data).toHaveLength(1);
  });

  it("a ficha de A é invisível para o dono de B (zero linhas, sem erro)", async () => {
    const leitura = await donoB
      .from("mentor_anexos")
      .select("id")
      .eq("id", anexoA);
    expect(leitura.error).toBeNull();
    expect(leitura.data).toHaveLength(0);
  });

  it("o admin lê a ficha de qualquer casa, sem acesso a nenhuma", async () => {
    const leitura = await admin
      .from("mentor_anexos")
      .select("id")
      .eq("id", anexoA);
    expect(leitura.error).toBeNull();
    expect(leitura.data).toHaveLength(1);
  });

  it("sem login não vaza linha nenhuma (negado, sem dados)", async () => {
    const anonimo = novoCliente();
    const leitura = await anonimo
      .from("mentor_anexos")
      .select("id")
      .eq("id", anexoA);
    // Sem grant para anon o banco nega (42501) e não devolve dado algum.
    expect(leitura.error?.code).toBe("42501");
    expect(leitura.data ?? []).toHaveLength(0);
  });
});

describe("o navegador não escreve ficha direto (só a função do servidor)", () => {
  it("ninguém insere ficha direto (INSERT recusado para authenticated)", async () => {
    const caminho = `invasao-${sufixo}/nota.pdf`;
    const insere = await donoA
      .from("mentor_anexos")
      .insert({
        restaurante_id: casaA,
        nome_original: "nota.pdf",
        tipo: "pdf",
        tamanho_bytes: 10,
        caminho,
      })
      .select();
    expect(insere.error?.code).toBe("42501");

    // Nada entrou, conferido pelo banco.
    const contagem = await banco.query<{ total: string }>(
      "select count(*) as total from public.mentor_anexos where caminho = $1",
      [caminho]
    );
    expect(contagem.rows[0]?.total).toBe("0");
  });

  it("ninguém altera nem apaga ficha direto (UPDATE e DELETE recusados)", async () => {
    const altera = await donoA
      .from("mentor_anexos")
      .update({ nome_original: "trocado.pdf" })
      .eq("id", anexoA)
      .select();
    // Sem privilégio de escrita a alteração é barrada (42501), igual ao
    // apagar: nos dois casos a ficha continua igual no banco.
    expect(altera.error?.code).toBe("42501");
    expect((await anexoNoBanco(anexoA))?.nome_original).toBe("cardapio.pdf");

    const apaga = await donoA.from("mentor_anexos").delete().eq("id", anexoA);
    expect(apaga.error?.code).toBe("42501");

    // Nada sumiu, conferido pelo banco.
    expect(await existemAnexos([anexoA])).toEqual([anexoA]);
  });

  it("não há política de escrita em mentor_anexos nem privilégio de escrever", async () => {
    const politicas = await banco.query<{ cmd: string }>(
      `select cmd from pg_policies
        where schemaname = 'public' and tablename = 'mentor_anexos'
          and cmd in ('INSERT', 'UPDATE', 'DELETE')`
    );
    expect(politicas.rows).toHaveLength(0);
    for (const privilegio of ["INSERT", "UPDATE", "DELETE"] as const) {
      const r = await banco.query<{ tem: boolean }>(
        `select has_table_privilege('authenticated', 'public.mentor_anexos', $1) as tem`,
        [privilegio]
      );
      expect(r.rows[0]).toEqual({ tem: false });
    }
  });
});

describe("o cofre é privado: o navegador nunca baixa direto", () => {
  it("o cofre mentor-anexos existe e não é público", async () => {
    const r = await banco.query<{ id: string; public: boolean }>(
      "select id, public from storage.buckets where id = 'mentor-anexos'"
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.public).toBe(false);
  });

  it("sem login e com login de dono, baixar direto nega", async () => {
    const caminho = `cofre-${sufixo}/segredo.pdf`;
    const subida = await servico.storage
      .from("mentor-anexos")
      .upload(caminho, new Blob(["segredo"], { type: "application/pdf" }));
    expect(subida.error).toBeNull();
    try {
      const anonimo = novoCliente();
      const semLogin = await anonimo.storage
        .from("mentor-anexos")
        .download(caminho);
      expect(semLogin.error).not.toBeNull();
      expect(semLogin.data).toBeNull();

      const doDono = await donoA.storage
        .from("mentor-anexos")
        .download(caminho);
      expect(doDono.error).not.toBeNull();
      expect(doDono.data).toBeNull();
    } finally {
      await servico.storage.from("mentor-anexos").remove([caminho]);
    }
  });

  it("storage.objects tem RLS ativa e zero policies no total", async () => {
    const rls = await banco.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class
        where relname = 'objects' and relnamespace = 'storage'::regnamespace`
    );
    expect(rls.rows[0]?.relrowsecurity).toBe(true);

    const total = await banco.query<{ total: string }>(
      `select count(*) as total from pg_policies
        where schemaname = 'storage' and tablename = 'objects'`
    );
    expect(total.rows[0]?.total).toBe("0");
  });

  it("nenhuma policy em storage.objects abre o cofre", async () => {
    const r = await banco.query<{ policyname: string }>(
      `select policyname from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and (policyname ilike '%mentor%' or qual ilike '%mentor-anexos%')`
    );
    expect(r.rows).toHaveLength(0);
  });
});

describe("a faxina apaga a ficha velha e poupa a nova", () => {
  it("ficha de 13 meses some; a de ontem fica", async () => {
    // Linha de base: esvazia o que já passou dos 12 meses antes de medir.
    const antes = await servico.rpc("limpar_conversas_mentor");
    expect(antes.error).toBeNull();

    const velha = await criarAnexo(casaA, `velha-${sufixo}/a.pdf`, "13 months");
    const nova = await criarAnexo(casaA, `nova-${sufixo}/b.pdf`, "1 day");

    const limpeza = await servico.rpc("limpar_conversas_mentor");
    expect(limpeza.error).toBeNull();
    // O formato não muda: só {mensagens, conversas}.
    expect(Object.keys(limpeza.data ?? {}).sort()).toEqual([
      "conversas",
      "mensagens",
    ]);
    // A ficha velha entra no contador de mensagens: ele cresce.
    const base = antes.data as { mensagens: number; conversas: number };
    const apagadas = limpeza.data as { mensagens: number; conversas: number };
    expect(apagadas.mensagens).toBeGreaterThan(base.mensagens);

    expect(await existemAnexos([velha])).toEqual([]);
    expect(await existemAnexos([nova])).toEqual([nova]);
    // E a ficha semente (de agora há pouco) também continua lá.
    expect(await existemAnexos([anexoA])).toEqual([anexoA]);
  });
});

describe("apagar leva as fichas junto (cascata)", () => {
  it("apagar a conversa leva as fichas dela", async () => {
    const conversaTemp = await criarConversa(casaA, "Conversa temporária");
    const fichaTemp = await criarAnexo(
      casaA,
      `temp-${sufixo}/c.pdf`,
      "1 hour",
      conversaTemp
    );

    await banco.query("delete from public.mentor_conversas where id = $1", [
      conversaTemp,
    ]);

    expect(await existemAnexos([fichaTemp])).toEqual([]);
    expect(await existemAnexos([anexoA])).toEqual([anexoA]);
  });

  it("apagar a casa leva as fichas dela e só as dela", async () => {
    const casaTemp = (
      await banco.query<{ id: string }>(
        `insert into public.restaurantes (slug, nome)
          values ($1, 'Casa temporária dos anexos') returning id`,
        [`anexos-temp-${sufixo}`]
      )
    ).rows[0]?.id as string;
    const fichaTemp = await criarAnexo(casaTemp, `tempcasa-${sufixo}/d.pdf`);
    const fichaB = await criarAnexo(casaB, `outra-${sufixo}/e.pdf`);

    await banco.query("delete from public.restaurantes where id = $1", [
      casaTemp,
    ]);

    expect(await existemAnexos([fichaTemp])).toEqual([]);
    expect(await existemAnexos([anexoA, fichaB])).toEqual(
      [anexoA, fichaB].sort()
    );
    await banco.query("delete from public.mentor_anexos where id = $1", [
      fichaB,
    ]);
  });
});

describe("o banco recusa ficha fora da regra", () => {
  it("nome com 120 letras passa; com 121 o banco recusa", async () => {
    const caminhoOk = `limite-${sufixo}/ok.pdf`;
    const noLimite = await banco.query<{ id: string }>(
      `insert into public.mentor_anexos
         (restaurante_id, nome_original, tipo, tamanho_bytes, caminho)
       values ($1, $2, 'pdf', 10, $3) returning id`,
      [casaA, `${"x".repeat(116)}.pdf`, caminhoOk]
    );
    expect(noLimite.rows).toHaveLength(1);
    await banco.query("delete from public.mentor_anexos where id = $1", [
      noLimite.rows[0]?.id,
    ]);

    await expect(
      banco.query(
        `insert into public.mentor_anexos
           (restaurante_id, nome_original, tipo, tamanho_bytes, caminho)
         values ($1, $2, 'pdf', 10, $3)`,
        [casaA, `${"x".repeat(117)}.pdf`, `limite-${sufixo}/falha.pdf`]
      )
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("tipo fora de imagem/pdf/planilha o banco recusa", async () => {
    await expect(
      banco.query(
        `insert into public.mentor_anexos
           (restaurante_id, nome_original, tipo, tamanho_bytes, caminho)
         values ($1, 'video.mp4', 'video', 10, $2)`,
        [casaA, `tipo-${sufixo}/v.mp4`]
      )
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("tamanho zerado ou acima de 10 MB o banco recusa", async () => {
    for (const tamanho of [0, 10485761]) {
      await expect(
        banco.query(
          `insert into public.mentor_anexos
             (restaurante_id, nome_original, tipo, tamanho_bytes, caminho)
           values ($1, 'a.pdf', 'pdf', $2, $3)`,
          [casaA, tamanho, `tamanho-${sufixo}/${tamanho}.pdf`]
        )
      ).rejects.toMatchObject({ code: "23514" });
    }
  });

  it("bordas que passam: nome de 1 letra, tamanho 1 e 10485760", async () => {
    const primeira = await banco.query<{ id: string }>(
      `insert into public.mentor_anexos
         (restaurante_id, nome_original, tipo, tamanho_bytes, caminho)
       values ($1, 'a', 'pdf', 1, $2) returning id`,
      [casaA, `borda-${sufixo}/min.pdf`]
    );
    expect(primeira.rows).toHaveLength(1);

    const segunda = await banco.query<{ id: string }>(
      `insert into public.mentor_anexos
         (restaurante_id, nome_original, tipo, tamanho_bytes, caminho)
       values ($1, 'maximo.pdf', 'pdf', 10485760, $2) returning id`,
      [casaA, `borda-${sufixo}/max.pdf`]
    );
    expect(segunda.rows).toHaveLength(1);

    await banco.query(
      "delete from public.mentor_anexos where id = any($1::uuid[])",
      [[primeira.rows[0]?.id, segunda.rows[0]?.id]]
    );
  });

  it("caminho duplicado o banco recusa (23505)", async () => {
    const caminho = `duplicado-${sufixo}/mesmo.pdf`;
    await banco.query(
      `insert into public.mentor_anexos
         (restaurante_id, nome_original, tipo, tamanho_bytes, caminho)
       values ($1, 'mesmo.pdf', 'pdf', 10, $2)`,
      [casaA, caminho]
    );
    try {
      await expect(
        banco.query(
          `insert into public.mentor_anexos
             (restaurante_id, nome_original, tipo, tamanho_bytes, caminho)
           values ($1, 'mesmo.pdf', 'pdf', 10, $2)`,
          [casaA, caminho]
        )
      ).rejects.toMatchObject({ code: "23505" });
    } finally {
      await banco.query("delete from public.mentor_anexos where caminho = $1", [
        caminho,
      ]);
    }
  });
});

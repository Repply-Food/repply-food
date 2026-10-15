// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  hashToken,
  limparFixture,
} from "../helpers/supabase-local";

type Trocado = { resultado: { token_id: string; antigos: number } };

describe("troca e revogação do token de envio (D-38)", () => {
  let banco: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
  });

  afterAll(async () => {
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      await banco?.end();
    }
  });

  /**
   * `preparar` roda como dono do banco (postgres); depois troca para `quem`
   * (id do login, ou null para sem login) e roda `executar`. Desfaz tudo no
   * fim. O admin não escreve direto em `tokens_envio`: o que o teste precisa
   * ter no banco antes é semeado em `preparar`.
   */
  async function desfazendoComo<T>(
    quem: string | null,
    executar: () => Promise<T>,
    preparar?: () => Promise<unknown>
  ): Promise<T> {
    await banco.query("begin");
    try {
      if (preparar) await preparar();
      await banco.query(`set local role ${quem ? "authenticated" : "anon"}`);
      if (quem) {
        await banco.query(
          "select set_config('request.jwt.claim.role', 'authenticated', true)"
        );
        await banco.query(
          "select set_config('request.jwt.claim.sub', $1, true)",
          [quem]
        );
      }
      return await executar();
    } finally {
      await banco.query("rollback");
    }
  }

  function novoToken() {
    const token = `rf_${randomUUID().replaceAll("-", "")}`;
    return { hash: hashToken(token), prefixo: token.slice(0, 7) };
  }

  const trocar = (restaurante: string, antigo: string, t = novoToken()) =>
    banco.query<Trocado>(
      "select public.trocar_token_envio($1, $2, $3, $4) as resultado",
      [restaurante, t.hash, t.prefixo, antigo]
    );

  const validos = (restaurante: string) =>
    banco.query<{
      prefixo: string;
      expira_em: string | null;
      criado_por: string | null;
    }>(
      `select prefixo, expira_em::text, criado_por::text
         from public.tokens_envio
        where restaurante_id = $1 and revogado_em is null
          and (expira_em is null or expira_em > now())
        order by criado_em`,
      [restaurante]
    );

  const registros = (restaurante: string) =>
    banco.query<{ autor: string; acao: string; detalhe: string | null }>(
      "select autor::text, acao, detalhe from public.registro_admin where restaurante_id = $1 order by id",
      [restaurante]
    );

  it("'agora': o antigo para na hora e o novo vale sozinho, com autor e histórico", async () => {
    await desfazendoComo(fixture.admin, async () => {
      const t = novoToken();
      const { rows } = await trocar(fixture.restauranteA, "agora", t);
      expect(rows[0]?.resultado.antigos).toBe(1);
      expect((await validos(fixture.restauranteA)).rows).toEqual([
        { prefixo: t.prefixo, expira_em: null, criado_por: fixture.admin },
      ]);
      expect((await registros(fixture.restauranteA)).rows).toEqual([
        {
          autor: fixture.admin,
          acao: "gerou_token",
          detalhe: "o antigo parou na hora",
        },
      ]);
    });
  });

  it("'24h': o antigo continua valendo por 24 horas, junto com o novo", async () => {
    await desfazendoComo(fixture.admin, async () => {
      await trocar(fixture.restauranteA, "24h");
      const { rows } = await banco.query<{
        total: number;
        com_prazo: number;
        prazo_certo: boolean;
      }>(
        `select count(*)::int as total,
                count(expira_em)::int as com_prazo,
                bool_and(expira_em is null or expira_em = now() + interval '24 hours') as prazo_certo
           from public.tokens_envio
          where restaurante_id = $1 and revogado_em is null
            and (expira_em is null or expira_em > now())`,
        [fixture.restauranteA]
      );
      expect(rows[0]).toEqual({ total: 2, com_prazo: 1, prazo_certo: true });
      expect((await registros(fixture.restauranteA)).rows[0]?.detalhe).toBe(
        "o antigo para em 24 h"
      );
    });
  });

  it("trocar de novo com '24h' nunca estica o prazo de quem já está saindo", async () => {
    await desfazendoComo(
      fixture.admin,
      async () => {
        await trocar(fixture.restauranteA, "24h");
        const { rows } = await banco.query<{ certo: boolean }>(
          `select bool_and(expira_em = now() + interval '1 hour') as certo
             from public.tokens_envio
            where restaurante_id = $1 and expira_em is not null`,
          [fixture.restauranteA]
        );
        expect(rows[0]?.certo).toBe(true);
      },
      () =>
        banco.query(
          "update public.tokens_envio set expira_em = now() + interval '1 hour' where restaurante_id = $1",
          [fixture.restauranteA]
        )
    );
  });

  it("casa sem token: o primeiro token entra e o histórico diz 'primeiro token'", async () => {
    await desfazendoComo(
      fixture.admin,
      async () => {
        const { rows } = await trocar(fixture.restauranteA, "agora");
        expect(rows[0]?.resultado.antigos).toBe(0);
        expect((await registros(fixture.restauranteA)).rows[0]?.detalhe).toBe(
          "primeiro token"
        );
      },
      () =>
        banco.query(
          "update public.tokens_envio set revogado_em = now() where restaurante_id = $1",
          [fixture.restauranteA]
        )
    );
  });

  it("revogar para todos os tokens válidos de uma vez e registra", async () => {
    await desfazendoComo(fixture.admin, async () => {
      await trocar(fixture.restauranteA, "24h");
      const { rows } = await banco.query<{ total: number }>(
        "select public.revogar_tokens_envio($1) as total",
        [fixture.restauranteA]
      );
      expect(rows[0]?.total).toBe(2);
      expect((await validos(fixture.restauranteA)).rows).toEqual([]);
      const historico = (await registros(fixture.restauranteA)).rows;
      expect(historico.at(-1)).toEqual({
        autor: fixture.admin,
        acao: "revogou_token",
        detalhe: "2 tokens",
      });
    });
  });

  it("revogar sem token válido é erro, não sucesso silencioso", async () => {
    await expect(
      desfazendoComo(fixture.admin, async () => {
        await banco.query("select public.revogar_tokens_envio($1)", [
          fixture.restauranteA,
        ]);
        await banco.query("select public.revogar_tokens_envio($1)", [
          fixture.restauranteA,
        ]);
      })
    ).rejects.toMatchObject({ code: "P0001" });
  });

  it("a troca na casa A não mexe no token da casa B", async () => {
    await desfazendoComo(fixture.admin, async () => {
      await trocar(fixture.restauranteA, "agora");
      expect((await validos(fixture.restauranteB)).rows).toHaveLength(1);
    });
  });

  it.each([
    [
      "inserir",
      "insert into public.tokens_envio (restaurante_id, hash, prefixo) values ($1, 'x', 'rf_xxxx')",
    ],
    [
      "alterar",
      "update public.tokens_envio set revogado_em = now() where restaurante_id = $1",
    ],
    ["apagar", "delete from public.tokens_envio where restaurante_id = $1"],
  ])(
    "nem o admin escreve direto em tokens_envio (%s): só as funções trocam e revogam",
    async (_, sql) => {
      await expect(
        desfazendoComo(fixture.admin, () =>
          banco.query(sql, [fixture.restauranteA])
        )
      ).rejects.toMatchObject({ code: "42501" });
    }
  );

  it("o admin continua lendo tokens_envio (a tela do detalhe lê, sem o hash)", async () => {
    await desfazendoComo(fixture.admin, async () => {
      expect((await validos(fixture.restauranteA)).rows).toHaveLength(1);
    });
  });

  it.each(["usuarioA", "usuarioSemAcesso"] as const)(
    "%s (não é admin) não troca nem revoga",
    async (quem) => {
      await expect(
        desfazendoComo(fixture[quem], () =>
          trocar(fixture.restauranteA, "agora")
        )
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        desfazendoComo(fixture[quem], () =>
          banco.query("select public.revogar_tokens_envio($1)", [
            fixture.restauranteA,
          ])
        )
      ).rejects.toMatchObject({ code: "42501" });
    }
  );

  it("sem login, nem chega a executar", async () => {
    await expect(
      desfazendoComo(null, () => trocar(fixture.restauranteA, "agora"))
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      desfazendoComo(null, () =>
        banco.query("select public.revogar_tokens_envio($1)", [
          fixture.restauranteA,
        ])
      )
    ).rejects.toMatchObject({ code: "42501" });
  });

  it.each([
    ["opção desconhecida", () => ({ ...novoToken() }), "depois"],
    [
      "hash que não é SHA-256",
      () => ({ hash: "abc", prefixo: "rf_abcd" }),
      "agora",
    ],
    [
      "prefixo fora do padrão",
      () => ({ ...novoToken(), prefixo: "xx_abcd" }),
      "agora",
    ],
  ] as const)("recusa entrada malformada: %s", async (_, token, antigo) => {
    await expect(
      desfazendoComo(fixture.admin, () =>
        trocar(fixture.restauranteA, antigo, token())
      )
    ).rejects.toMatchObject({ code: "22023" });
  });

  it("restaurante que não existe é erro", async () => {
    await expect(
      desfazendoComo(fixture.admin, () => trocar(randomUUID(), "agora"))
    ).rejects.toMatchObject({ code: "P0002" });
  });
});

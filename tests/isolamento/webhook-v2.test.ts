// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Fixture,
  comoAutenticado,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";

const privadas = [
  "cargas_scc",
  "paginas_scc",
  "cursores_scc",
  "limites_requisicao_scc",
];

const dominio = [
  "fotografias_scc",
  "revisoes_scc",
  "produtos_scc",
  "itens_vendidos_scc",
  "comissoes_scc",
  "movimentos_caixa_scc",
  "eventos_auditoria_scc",
  "notas_assinadas_scc",
  "financeiro_scc",
  "financeiro_meios_scc",
  "financeiro_publico_scc",
];

describe("armazenamento do webhook SCC v2", () => {
  let banco: Client;

  beforeAll(async () => {
    banco = await conectarBanco();
  });

  afterAll(async () => {
    await banco?.end();
  });

  it.each([...privadas, ...dominio])(
    "%s nasce com RLS e apenas os privilégios previstos",
    async (tabela) => {
      const { rows } = await banco.query<{
        rls: boolean;
        force: boolean;
        anon: string[];
        authenticated: string[];
      }>(
        `select c.relrowsecurity as rls, c.relforcerowsecurity as force,
          array(select p from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
                where has_table_privilege('anon', c.oid, p) order by p) as anon,
          array(select p from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
                where has_table_privilege('authenticated', c.oid, p) order by p) as authenticated
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = $1 and c.relkind = 'r'`,
        [tabela]
      );
      expect(rows).toEqual([
        {
          rls: true,
          force: false,
          anon: [],
          authenticated: dominio.includes(tabela) ? ["SELECT"] : [],
        },
      ]);
    }
  );
});

describe("isolamento dos dados SCC v2", () => {
  let banco: Client;
  let fixture: Fixture;
  const idEnvio = randomUUID();
  const tipos = [
    "itens_vendidos",
    "comissoes",
    "movimentos_caixa",
    "eventos_auditoria",
    "notas_assinadas",
    "financeiro",
  ];
  const ids = tipos.map(() => randomUUID());

  beforeAll(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
    for (const casa of fixture.idsRestaurantes) {
      await banco.query(
        `insert into public.cargas_scc (restaurante_id,id_envio,tipo_envio,modo,sequencia,natureza,versao_scc,enviado_em,janela_desde,janela_ate,total_paginas,total_registros)
         values ($1,$2,'entradas','janela',1,'scc','teste',now(),current_date,current_date,1,0)`,
        [casa, idEnvio]
      );
      await banco.query(
        `insert into public.paginas_scc values ($1,$2,1,repeat('a',64),0,2,'[]')`,
        [casa, idEnvio]
      );
      await banco.query(
        `insert into public.cursores_scc values ($1,'entradas','entradas',1,$2)`,
        [casa, idEnvio]
      );
      await banco.query(
        "insert into public.limites_requisicao_scc values ($1,now(),1)",
        [casa]
      );
      await banco.query("insert into public.revisoes_scc values ($1,1)", [
        casa,
      ]);
      await banco.query(
        `insert into public.produtos_scc (restaurante_id,codigo_produto,produto,ativo,alterado_em) values ($1,'p','Produto',true,now())`,
        [casa]
      );
      for (const [indice, tipo] of tipos.entries()) {
        await banco.query(
          `insert into public.cargas_scc (restaurante_id,id_envio,tipo_envio,modo,sequencia,natureza,versao_scc,enviado_em,dia_movimento,fonte,total_paginas,total_registros)
           values ($1,$2,$3,'fotografia',1,'scc','teste',now(),'2026-10-01','online',1,1)`,
          [casa, ids[indice], tipo]
        );
        await banco.query(
          `insert into public.fotografias_scc (restaurante_id,tipo_envio,dia_movimento,fonte,id_envio,sequencia,natureza,recursos,quantidade,capturado_em)
           values ($1,$2,'2026-10-01','online',$3,1,'scc','{}',1,now())`,
          [casa, tipo, ids[indice]]
        );
      }
      for (const sql of [
        `insert into public.itens_vendidos_scc (restaurante_id,dia_movimento,fonte,posicao,codigo_entrada,ordinal,codigo_produto,produto,quantidade,vendas) values ($1,'2026-10-01','online',1,'e',0,'p','Produto',1,2)`,
        `insert into public.comissoes_scc (restaurante_id,dia_movimento,fonte,posicao,codigo_operador,vendas_elegiveis) values ($1,'2026-10-01','online',1,'o',2)`,
        `insert into public.movimentos_caixa_scc (restaurante_id,dia_movimento,fonte,posicao,codigo_lancamento,momento,tipo,codigo_categoria,categoria,valor) values ($1,'2026-10-01','online',1,'l',now(),'credito','c','Categoria',2)`,
        `insert into public.eventos_auditoria_scc (restaurante_id,dia_movimento,fonte,posicao,tipo,momento) values ($1,'2026-10-01','online',1,'perda_cartao',now())`,
        `insert into public.notas_assinadas_scc (restaurante_id,dia_movimento,fonte,posicao,codigo_nota,codigo_entrada,codigo_cliente,valor) values ($1,'2026-10-01','online',1,'n','e','c',2)`,
        `insert into public.financeiro_scc (restaurante_id,dia_movimento,fonte) values ($1,'2026-10-01','online')`,
        `insert into public.financeiro_meios_scc (restaurante_id,dia_movimento,fonte,posicao,codigo,rotulo,classe,valor) values ($1,'2026-10-01','online',1,'m','Meio','pix',2)`,
        `insert into public.financeiro_publico_scc (restaurante_id,dia_movimento,fonte,posicao,sexo,categoria,quantidade) values ($1,'2026-10-01','online',1,'nao_informado','outro',1)`,
      ])
        await banco.query(sql, [casa]);
    }
  });

  afterAll(async () => {
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      await banco?.end();
    }
  });

  async function anonimo<T>(executar: () => Promise<T>): Promise<T> {
    await banco.query("begin");
    try {
      await banco.query("set local role anon");
      return await executar();
    } finally {
      await banco.query("rollback");
    }
  }

  it.each(dominio)(
    "%s: cada dono lê sua casa e admin lê ambas",
    async (tabela) => {
      const ler = () =>
        banco.query<{ restaurante_id: string }>(
          `select distinct restaurante_id from public.${tabela} where restaurante_id = any($1::uuid[]) order by restaurante_id`,
          [fixture.idsRestaurantes]
        );
      for (const [usuario, esperado] of [
        [fixture.usuarioA, [fixture.restauranteA]],
        [fixture.usuarioB, [fixture.restauranteB]],
        [fixture.usuarioSemAcesso, []],
        [fixture.admin, [...fixture.idsRestaurantes].sort()],
      ] as const) {
        const resultado = await comoAutenticado(banco, usuario, ler);
        expect(resultado.rows.map((r) => r.restaurante_id)).toEqual(esperado);
      }
      await expect(anonimo(ler)).rejects.toMatchObject({ code: "42501" });
    }
  );

  it.each(privadas)(
    "%s: nenhuma identidade de navegador consegue ler",
    async (tabela) => {
      const ler = () => banco.query(`select * from public.${tabela}`);
      for (const usuario of [
        fixture.usuarioA,
        fixture.usuarioB,
        fixture.usuarioSemAcesso,
        fixture.admin,
      ]) {
        await expect(
          comoAutenticado(banco, usuario, ler)
        ).rejects.toMatchObject({ code: "42501" });
      }
      await expect(anonimo(ler)).rejects.toMatchObject({ code: "42501" });
    }
  );

  it.each([...privadas, ...dominio])(
    "%s: nenhuma identidade de navegador escreve",
    async (tabela) => {
      for (const sql of [
        `insert into public.${tabela} default values`,
        `update public.${tabela} set restaurante_id = restaurante_id`,
        `delete from public.${tabela}`,
      ]) {
        const executar = () => banco.query(sql);
        for (const usuario of [
          fixture.usuarioA,
          fixture.usuarioB,
          fixture.usuarioSemAcesso,
          fixture.admin,
        ]) {
          await expect(
            comoAutenticado(banco, usuario, executar)
          ).rejects.toMatchObject({ code: "42501" });
        }
        await expect(anonimo(executar)).rejects.toMatchObject({
          code: "42501",
        });
      }
    }
  );

  it("recusa página de outra casa e limites inválidos", async () => {
    for (const [numero, quantidade, bytes, id] of [
      [201, 0, 2, idEnvio],
      [0, 0, 2, idEnvio],
      [2, 501, 2, idEnvio],
      [2, 0, 1048577, idEnvio],
      [2, 0, 2, randomUUID()],
    ] as const) {
      await expect(
        banco.query(
          `insert into public.paginas_scc (restaurante_id,id_envio,numero,hash,quantidade,bytes,dados) values ($1,$2,$3,repeat('a',64),$4,$5,null)`,
          [fixture.restauranteA, id, numero, quantidade, bytes]
        )
      ).rejects.toMatchObject({ code: id === idEnvio ? "23514" : "23503" });
    }
  });

  it("não permite trocar a casa de uma linha", async () => {
    await expect(
      banco.query(
        "update public.produtos_scc set restaurante_id=$2 where restaurante_id=$1",
        [fixture.restauranteA, fixture.restauranteB]
      )
    ).rejects.toThrow();
  });

  it("rejeita chaves de domínio duplicadas no mesmo escopo", async () => {
    for (const sql of [
      "insert into public.itens_vendidos_scc (restaurante_id,dia_movimento,fonte,posicao,codigo_entrada,ordinal,codigo_produto,produto,quantidade,vendas) values ($1,'2026-10-01','online',2,'e',0,'p','Produto',1,2)",
      "insert into public.comissoes_scc (restaurante_id,dia_movimento,fonte,posicao,codigo_operador,vendas_elegiveis) values ($1,'2026-10-01','online',2,'o',2)",
      "insert into public.movimentos_caixa_scc (restaurante_id,dia_movimento,fonte,posicao,codigo_lancamento,momento,tipo,codigo_categoria,categoria,valor) values ($1,'2026-10-01','online',2,'l',now(),'credito','c','Categoria',2)",
      "insert into public.financeiro_publico_scc (restaurante_id,dia_movimento,fonte,posicao,sexo,categoria,quantidade) values ($1,'2026-10-01','online',2,'nao_informado','outro',1)",
    ]) {
      await expect(
        banco.query(sql, [fixture.restauranteA])
      ).rejects.toMatchObject({ code: "23505" });
    }
  });

  it("aceita ocorrências iguais de auditoria em posições diferentes", async () => {
    await banco.query("begin");
    try {
      const resultado = await banco.query(
        `insert into public.eventos_auditoria_scc
         (restaurante_id,dia_movimento,fonte,posicao,tipo,momento)
         select restaurante_id,dia_movimento,fonte,2,tipo,momento
         from public.eventos_auditoria_scc where restaurante_id=$1`,
        [fixture.restauranteA]
      );
      expect(resultado.rowCount).toBe(1);
    } finally {
      await banco.query("rollback");
    }
  });

  it("não associa uma página à carga de outra casa", async () => {
    await banco.query("begin");
    try {
      const id = randomUUID();
      await banco.query(
        `insert into public.cargas_scc (restaurante_id,id_envio,tipo_envio,modo,sequencia,natureza,versao_scc,enviado_em,janela_desde,janela_ate,total_paginas,total_registros)
         values ($1,$2,'entradas','janela',2,'scc','teste',now(),current_date,current_date,1,0)`,
        [fixture.restauranteB, id]
      );
      await expect(
        banco.query(
          `insert into public.paginas_scc values ($1,$2,1,repeat('a',64),0,2,'[]')`,
          [fixture.restauranteA, id]
        )
      ).rejects.toMatchObject({ code: "23503" });
    } finally {
      await banco.query("rollback");
    }
  });

  async function rejeitaAlteracao(
    sql: string,
    parametros: unknown[],
    codigo = /^23/
  ) {
    await banco.query("begin");
    try {
      await expect(banco.query(sql, parametros)).rejects.toMatchObject({
        code: expect.stringMatching(codigo),
      });
    } finally {
      await banco.query("rollback");
    }
  }

  it("exige carga correspondente ao tipo, sequência, dia e fonte da fotografia", async () => {
    for (const alteracao of [
      "tipo_envio='comissoes'",
      "sequencia=2",
      "dia_movimento='2026-10-02'",
      "fonte='historico'",
    ]) {
      await rejeitaAlteracao(
        `update public.fotografias_scc set ${alteracao} where restaurante_id=$1 and tipo_envio='itens_vendidos'`,
        [fixture.restauranteA]
      );
    }
  });

  it("exige carga correspondente ao tipo, sequência e escopo do cursor", async () => {
    for (const [tipo, chave, sequencia, id] of [
      ["cadastro_produtos", "cadastro_produtos", 1, idEnvio],
      ["itens_vendidos", "2026-10-02|online", 1, ids[0]],
      ["itens_vendidos", "2026-10-01|historico", 1, ids[0]],
    ] as const) {
      await rejeitaAlteracao(
        "insert into public.cursores_scc (restaurante_id,tipo_envio,chave_escopo,sequencia,id_envio) values ($1,$2,$3,$4,$5)",
        [fixture.restauranteA, tipo, chave, sequencia, id],
        /^23503$/
      );
    }
    await rejeitaAlteracao(
      "update public.cursores_scc set sequencia=2 where restaurante_id=$1 and tipo_envio='entradas'",
      [fixture.restauranteA],
      /^23503$/
    );
  });

  it("recusa códigos e rótulos fora do contrato", async () => {
    for (const [tabela, coluna, valor] of [
      ["produtos_scc", "codigo_produto", "com espaço"],
      ["produtos_scc", "codigo_grupo", "x".repeat(81)],
      ["produtos_scc", "produto", ""],
      ["produtos_scc", "grupo", "linha\nquebrada"],
      ["itens_vendidos_scc", "codigo_entrada", "!"],
      ["itens_vendidos_scc", "pdv", "x".repeat(121)],
      ["comissoes_scc", "funcao", "x".repeat(81)],
      ["movimentos_caixa_scc", "codigo_categoria", ""],
      ["eventos_auditoria_scc", "cartao_anterior", " inv"],
      ["notas_assinadas_scc", "codigo_cliente", "á"],
      ["financeiro_meios_scc", "rotulo", "\u0085"],
    ]) {
      await rejeitaAlteracao(
        `update public.${tabela} set ${coluna}=$2 where restaurante_id=$1`,
        [fixture.restauranteA, valor]
      );
    }
  });

  it("recusa recursos desconhecidos, repetidos ou nulos", async () => {
    for (const tabela of ["cargas_scc", "fotografias_scc"]) {
      for (const recursos of [["invalido"], ["pdv", "pdv"], [null]]) {
        await rejeitaAlteracao(
          `update public.${tabela} set recursos=$2 where restaurante_id=$1 and tipo_envio='itens_vendidos'`,
          [fixture.restauranteA, recursos]
        );
      }
    }
  });

  it("permite apagar apenas os dados da página para retenção", async () => {
    await banco.query("begin");
    try {
      const resultado = await banco.query(
        "update public.paginas_scc set dados=null where restaurante_id=$1 and id_envio=$2 returning dados, hash",
        [fixture.restauranteA, idEnvio]
      );
      expect(resultado.rows).toEqual([{ dados: null, hash: "a".repeat(64) }]);
    } finally {
      await banco.query("rollback");
    }
  });

  it("aceita cursor fotográfico correto e recursos e rótulos válidos", async () => {
    await banco.query("begin");
    try {
      const cursor = await banco.query(
        "insert into public.cursores_scc (restaurante_id,tipo_envio,chave_escopo,sequencia,id_envio) values ($1,'itens_vendidos','2026-10-01|online',1,$2)",
        [fixture.restauranteA, ids[0]]
      );
      expect(cursor.rowCount).toBe(1);
      const recursos = await banco.query(
        "update public.fotografias_scc set recursos=array['pdv','garcom'] where restaurante_id=$1 and tipo_envio='itens_vendidos'",
        [fixture.restauranteA]
      );
      expect(recursos.rowCount).toBe(1);
      const produto = await banco.query(
        "update public.produtos_scc set codigo_grupo=$2,grupo=$3 where restaurante_id=$1",
        [fixture.restauranteA, "a".repeat(80), "Café São João"]
      );
      expect(produto.rowCount).toBe(1);
    } finally {
      await banco.query("rollback");
    }
  });

  it.todo("recepção v2 recusa dados nulos e número de página acima do total");
});

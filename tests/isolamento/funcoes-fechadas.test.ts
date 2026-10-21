// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conectarBanco } from "../helpers/supabase-local";

/**
 * A lista inteira do que um login (ou alguém sem login) pode executar.
 * Função nova que o painel precise chamar entra aqui DE PROPÓSITO, junto
 * com o grant na migration. Se este teste falhar sem você ter mexido na
 * lista, uma função ficou aberta por engano.
 */
const abertas = [
  { funcao: "atualizar_turnos(uuid, jsonb)", anon: false, authenticated: true },
  // Rodam dentro das restrições de `restaurantes`: o Postgres confere o
  // EXECUTE de quem grava (o admin, pelo login). São puras, sem ler tabela.
  { funcao: "cnpj_valido(text)", anon: false, authenticated: true },
  // Pura (só calcula uma data, não lê tabela). As metrica_* são security
  // invoker e a chamam com o login de quem consulta (etapa 5).
  {
    funcao:
      "dia_operacao_de(timestamp with time zone, text, time without time zone)",
    anon: false,
    authenticated: true,
  },
  { funcao: "eh_admin_repply()", anon: true, authenticated: true },
  {
    funcao: "horario_funcionamento_valido(jsonb)",
    anon: false,
    authenticated: true,
  },
  // Métricas do painel (security invoker: o isolamento é a RLS de entradas).
  {
    funcao: "metrica_comparacao_do_dia(uuid, timestamp with time zone)",
    anon: false,
    authenticated: true,
  },
  {
    funcao:
      "metrica_contas_esquecidas(uuid, timestamp with time zone, interval)",
    anon: false,
    authenticated: true,
  },
  {
    funcao: "metrica_curva_do_dia(uuid, timestamp with time zone)",
    anon: false,
    authenticated: true,
  },
  {
    funcao: "metrica_faturamento_do_dia(uuid, timestamp with time zone)",
    anon: false,
    authenticated: true,
  },
  {
    funcao: "metrica_mesas_abertas(uuid, timestamp with time zone)",
    anon: false,
    authenticated: true,
  },
  {
    funcao: "metrica_meta_do_mes(uuid, timestamp with time zone)",
    anon: false,
    authenticated: true,
  },
  {
    funcao: "metrica_resultados_descontos(uuid, date, date)",
    anon: false,
    authenticated: true,
  },
  {
    funcao: "metrica_resultados_equipe(uuid, date, date)",
    anon: false,
    authenticated: true,
  },
  {
    funcao: "metrica_resultados_horas(uuid, date, date)",
    anon: false,
    authenticated: true,
  },
  {
    funcao: "metrica_resultados_mapa_calor(uuid, date, date)",
    anon: false,
    authenticated: true,
  },
  {
    funcao: "metrica_resultados_ocupacao(uuid, date, date)",
    anon: false,
    authenticated: true,
  },
  {
    funcao: "metrica_resultados_resumo(uuid, date, date, text)",
    anon: false,
    authenticated: true,
  },
  {
    funcao: "metrica_resultados_turnos(uuid, date, date)",
    anon: false,
    authenticated: true,
  },
  {
    funcao: "metrica_resultados_vendas_diarias(uuid, date, date)",
    anon: false,
    authenticated: true,
  },
  // Conferem eh_admin_repply() por dentro (D-38).
  { funcao: "revogar_tokens_envio(uuid)", anon: false, authenticated: true },
  { funcao: "tem_acesso(uuid)", anon: true, authenticated: true },
  {
    funcao: "trocar_token_envio(uuid, text, text, text)",
    anon: false,
    authenticated: true,
  },
  {
    funcao: "validar_intervalo_resultados(date, date)",
    anon: false,
    authenticated: true,
  },
];

describe("funções do banco fechadas por padrão", () => {
  let banco: Client;

  beforeAll(async () => {
    banco = await conectarBanco();
  });

  afterAll(async () => {
    await banco?.end();
  });

  it("só as funções da lista podem ser executadas por anon ou authenticated", async () => {
    const resultado = await banco.query(
      `select p.proname || '(' || oidvectortypes(p.proargtypes) || ')' as funcao,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prorettype <> 'trigger'::regtype
          and not exists (
            select 1 from pg_depend d
             where d.classid = 'pg_proc'::regclass
               and d.objid = p.oid and d.deptype = 'e'
          )
          and (has_function_privilege('anon', p.oid, 'execute')
            or has_function_privilege('authenticated', p.oid, 'execute'))
        order by 1`
    );
    expect(resultado.rows).toEqual(abertas);
  });

  it("função criada daqui em diante nasce fechada para anon e authenticated", async () => {
    await banco.query("begin");
    try {
      await banco.query(
        "create function public.rf_teste_nasce_fechada() returns int language sql as 'select 1'"
      );
      const resultado = await banco.query(
        `select has_function_privilege('anon', 'public.rf_teste_nasce_fechada()', 'execute') as anon,
                has_function_privilege('authenticated', 'public.rf_teste_nasce_fechada()', 'execute') as authenticated,
                has_function_privilege('service_role', 'public.rf_teste_nasce_fechada()', 'execute') as service`
      );
      expect(resultado.rows[0]).toEqual({
        anon: false,
        authenticated: false,
        service: true,
      });
    } finally {
      await banco.query("rollback");
    }
  });
});

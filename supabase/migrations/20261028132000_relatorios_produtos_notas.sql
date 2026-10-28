-- Agregações privadas invoker: a autorização e a RLS valem também em SQL direto.
begin;

create function relatorios_privados.produtos(
  p_casa uuid, p_filtros jsonb, p_pagina int, p_tamanho int
) returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, public, relatorios_privados
as $$
declare resultado jsonb;
begin
  perform relatorios_privados.validar_consulta(p_casa,'produtos',p_filtros,p_pagina,p_tamanho);
  with filtradas as (
    select l.dados from public.relatorio_linhas l
    where l.restaurante_id = p_casa and l.relatorio = 'produtos'
      and l.fonte = p_filtros->>'fonte'
      and l.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
      and (not (p_filtros ? 'pdv') or l.dados->>'codigo_pdv' = p_filtros->>'pdv')
      and (not (p_filtros ? 'grupo') or l.dados->>'codigo_grupo' = p_filtros->>'grupo')
      and (not (p_filtros ? 'garcom') or l.dados->>'codigo_garcom' = p_filtros->>'garcom')
      and (not (p_filtros ? 'mesaDe') or (l.dados->>'mesa')::numeric >= (p_filtros->>'mesaDe')::numeric)
      and (not (p_filtros ? 'mesaAte') or (l.dados->>'mesa')::numeric <= (p_filtros->>'mesaAte')::numeric)
  ), agregadas as materialized (
    -- Códigos preservam identidade; mesa/garçom já filtraram a linha de origem.
    -- A origem já descontou cancelamentos e aplicou sua fórmula de venda.
    select dados->>'codigo_produto' collate "C" codigo_produto,
      dados->>'codigo_pdv' collate "C" codigo_pdv,
      dados->>'codigo_grupo' collate "C" codigo_grupo,
      max((dados->>'produto') collate "C") produto,
      max((dados->>'pdv') collate "C") pdv,
      max((dados->>'grupo') collate "C") grupo,
      sum((dados->>'quantidade')::numeric(20,6)) quantidade,
      round(sum((dados->>'vendas')::numeric(20,6)),2) vendas,
      case when count(*) filter (where dados->>'custos' is null) > 0 then null
        else round(sum((dados->>'custos')::numeric(20,6)),2) end custos
    from filtradas
    group by dados->>'codigo_produto' collate "C", dados->>'codigo_pdv' collate "C",
      dados->>'codigo_grupo' collate "C"
  ), resumo as (
    -- O resumo usa todas as agregadas, inclusive as que ficaram fora da página.
    select coalesce(sum(quantidade)::text,'0') quantidade,
      coalesce(round(sum(vendas),2)::text,'0.00') vendas,
      case when count(*) filter (where custos is null) > 0 then null
        else coalesce(round(sum(custos),2)::text,'0.00') end custos,
      case when count(*) filter (where custos is null) > 0 then null
        else coalesce(round(sum(vendas - custos),2)::text,'0.00') end diferenca,
      count(*) total_linhas
    from agregadas
  ), pagina as (
    select * from agregadas
    order by pdv collate "C" nulls last, grupo collate "C" nulls last,
      produto collate "C" nulls last, codigo_produto nulls last,
      codigo_pdv nulls last, codigo_grupo nulls last
    offset (p_pagina::bigint - 1) * p_tamanho limit p_tamanho
  )
  select jsonb_build_object(
    'linhas',(select coalesce(jsonb_agg(jsonb_build_object(
      'codigoProduto',codigo_produto,'produto',produto,'codigoPdv',codigo_pdv,
      'pdv',pdv,'codigoGrupo',codigo_grupo,'grupo',grupo,
      'quantidade',quantidade::text,'vendas',vendas::text,'custos',custos::text,
      'diferenca',(vendas - custos)::text)
      order by pdv collate "C" nulls last, grupo collate "C" nulls last,
        produto collate "C" nulls last, codigo_produto nulls last,
        codigo_pdv nulls last, codigo_grupo nulls last),'[]'::jsonb) from pagina),
    'resumo',jsonb_build_object('quantidade',quantidade,'vendas',vendas,
      'custos',custos,'diferenca',diferenca),
    'paginacao',jsonb_build_object('pagina',p_pagina,'tamanho',p_tamanho,'totalLinhas',total_linhas)
  ) into resultado from resumo;
  return resultado;
end;
$$;

create function relatorios_privados.notas_assinadas(
  p_casa uuid, p_filtros jsonb, p_pagina int, p_tamanho int
) returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, public, relatorios_privados
as $$
declare resultado jsonb;
begin
  perform relatorios_privados.validar_consulta(p_casa,'notas-assinadas',p_filtros,p_pagina,p_tamanho);
  with filtradas as materialized (
    -- Sem joins: cada ocorrência recebida é uma nota, mesmo que seja idêntica.
    select l.dados, l.dia_movimento, l.posicao from public.relatorio_linhas l
    where l.restaurante_id = p_casa and l.relatorio = 'notas-assinadas'
      and l.fonte = p_filtros->>'fonte'
      and l.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
      and (not (p_filtros ? 'cliente') or l.dados->>'codigo_cliente' = p_filtros->>'cliente')
  ), resumo as (
    select count(*) notas,
      coalesce(round(sum((dados->>'valor')::numeric(20,6)),2)::text,'0.00') valor
    from filtradas
  ), pagina as (
    select * from filtradas
    order by (dados->>'codigo_cliente') collate "C" nulls last, dia_movimento,
      (dados->>'codigo_entrada') collate "C" nulls last,
      (dados->>'codigo_nota') collate "C" nulls last, posicao
    offset (p_pagina::bigint - 1) * p_tamanho limit p_tamanho
  )
  select jsonb_build_object(
    'linhas',(select coalesce(jsonb_agg(jsonb_build_object(
      'codigoNota',dados->>'codigo_nota','codigoEntrada',dados->>'codigo_entrada',
      'diaMovimento',to_char(dia_movimento,'YYYY-MM-DD'),
      'codigoCliente',dados->>'codigo_cliente','valor',dados->>'valor')
      order by (dados->>'codigo_cliente') collate "C" nulls last, dia_movimento,
        (dados->>'codigo_entrada') collate "C" nulls last,
        (dados->>'codigo_nota') collate "C" nulls last, posicao),'[]'::jsonb) from pagina),
    'resumo',jsonb_build_object('notas',notas,'valor',valor),
    'paginacao',jsonb_build_object('pagina',p_pagina,'tamanho',p_tamanho,'totalLinhas',notas)
  ) into resultado from resumo;
  return resultado;
end;
$$;

revoke all on function relatorios_privados.produtos(uuid,jsonb,int,int) from public, anon, authenticated, service_role;
revoke all on function relatorios_privados.notas_assinadas(uuid,jsonb,int,int) from public, anon, authenticated, service_role;
grant execute on function relatorios_privados.produtos(uuid,jsonb,int,int) to authenticated;
grant execute on function relatorios_privados.notas_assinadas(uuid,jsonb,int,int) to authenticated;

commit;

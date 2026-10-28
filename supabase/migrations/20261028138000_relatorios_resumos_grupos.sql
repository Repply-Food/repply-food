-- Saídas de produtos/caixa recebem subtotais completos independentes da página.
begin;

create or replace function relatorios_privados.produtos(
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
  ), grupos as (
    -- Cada subtotal é calculado da agregação integral, antes da paginação.
    select codigo_pdv, codigo_grupo,
      coalesce(sum(quantidade)::text,'0') quantidade,
      coalesce(round(sum(vendas),2)::text,'0.00') vendas,
      case when count(*) filter (where custos is null) > 0 then null
        else coalesce(round(sum(custos),2)::text,'0.00') end custos,
      case when count(*) filter (where custos is null) > 0 then null
        else coalesce(round(sum(vendas - custos),2)::text,'0.00') end diferenca
    from agregadas group by codigo_pdv, codigo_grupo
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
      'custos',custos,'diferenca',diferenca,'grupos',(select coalesce(jsonb_agg(
        jsonb_build_object('codigoPdv',codigo_pdv,'codigoGrupo',codigo_grupo,
          'quantidade',quantidade,'vendas',vendas,'custos',custos,'diferenca',diferenca)
        order by codigo_pdv collate "C" nulls last, codigo_grupo collate "C" nulls last),
        '[]'::jsonb) from grupos)),
    'paginacao',jsonb_build_object('pagina',p_pagina,'tamanho',p_tamanho,'totalLinhas',total_linhas)
  ) into resultado from resumo;
  return resultado;
end;
$$;

create or replace function relatorios_privados.caixa(
  p_casa uuid, p_filtros jsonb, p_pagina int, p_tamanho int
) returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, public, relatorios_privados
as $$
declare resultado jsonb;
begin
  perform relatorios_privados.validar_consulta(p_casa,'caixa',p_filtros,p_pagina,p_tamanho);
  with casa as materialized (
    select fuso from public.restaurantes where id = p_casa
  ), filtradas as materialized (
    select l.dados, l.dia_movimento, l.posicao,
      (l.dados->>'momento')::timestamptz instante,
      ((l.dados->>'momento')::timestamptz at time zone c.fuso)::date dia_civil
    from public.relatorio_linhas l cross join casa c
    where l.restaurante_id = p_casa and l.relatorio = 'caixa'
      and l.fonte = p_filtros->>'fonte'
      and l.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
      and (not (p_filtros ? 'operador') or l.dados->>'codigo_operador' = p_filtros->>'operador')
      and (not (p_filtros ? 'tipo') or l.dados->>'tipo' = p_filtros->>'tipo')
      and (not (p_filtros ? 'categoria') or l.dados->>'tipo' || ':' || (l.dados->>'codigo_categoria') = p_filtros->>'categoria')
  ), grupos as (
    -- Totais completos por operador e dia civil, independentes da página visível.
    select dados->>'codigo_operador' codigo_operador, dia_civil,
      coalesce(round(sum((dados->>'valor')::numeric(20,6))
        filter (where dados->>'tipo' = 'credito'),2)::text,'0.00') creditos,
      coalesce(round(sum((dados->>'valor')::numeric(20,6))
        filter (where dados->>'tipo' = 'debito'),2)::text,'0.00') debitos,
      coalesce(round(sum(case dados->>'tipo'
        when 'credito' then (dados->>'valor')::numeric(20,6)
        else -(dados->>'valor')::numeric(20,6) end),2)::text,'0.00') saldo
    from filtradas group by dados->>'codigo_operador', dia_civil
  ), resumo as (
    select coalesce(round(sum((dados->>'valor')::numeric(20,6)) filter (where dados->>'tipo' = 'credito'),2)::text,'0.00') creditos,
      coalesce(round(sum((dados->>'valor')::numeric(20,6)) filter (where dados->>'tipo' = 'debito'),2)::text,'0.00') debitos,
      coalesce(round(sum(case dados->>'tipo' when 'credito' then (dados->>'valor')::numeric(20,6)
        else -(dados->>'valor')::numeric(20,6) end),2)::text,'0.00') saldo,
      count(*) total_linhas
    from filtradas
  ), pagina as (
    select * from filtradas
    order by (dados->>'codigo_operador') collate "C" nulls last, dia_civil,
      instante, (dados->>'codigo_lancamento') collate "C" nulls last, posicao
    offset (p_pagina::bigint - 1) * p_tamanho limit p_tamanho
  )
  select jsonb_build_object(
    'linhas',(select coalesce(jsonb_agg(jsonb_build_object(
      'codigoLancamento',dados->>'codigo_lancamento',
      'diaMovimento',to_char(dia_movimento,'YYYY-MM-DD'),
      'diaCivil',to_char(dia_civil,'YYYY-MM-DD'),
      'momento',dados->>'momento','codigoOperador',dados->>'codigo_operador',
      'operador',dados->>'operador','tipo',dados->>'tipo',
      'codigoCategoria',dados->>'codigo_categoria','categoria',dados->>'categoria',
      'valor',dados->>'valor') order by
        (dados->>'codigo_operador') collate "C" nulls last, dia_civil,
        instante, (dados->>'codigo_lancamento') collate "C" nulls last, posicao),'[]'::jsonb) from pagina),
    'resumo',jsonb_build_object('creditos',creditos,'debitos',debitos,'saldo',saldo,
      'grupos',(select coalesce(jsonb_agg(jsonb_build_object(
        'codigoOperador',codigo_operador,
        'diaCivil',to_char(dia_civil,'YYYY-MM-DD'),
        'creditos',creditos,'debitos',debitos,'saldo',saldo
        order by codigo_operador collate "C" nulls last,dia_civil),
        '[]'::jsonb) from grupos)),
    'paginacao',jsonb_build_object('pagina',p_pagina,'tamanho',p_tamanho,'totalLinhas',total_linhas)
  ) into resultado from resumo;
  return resultado;
end;
$$;

revoke all on function relatorios_privados.produtos(uuid,jsonb,int,int)
  from public, anon, authenticated, service_role;
revoke all on function relatorios_privados.caixa(uuid,jsonb,int,int)
  from public, anon, authenticated, service_role;
grant execute on function relatorios_privados.produtos(uuid,jsonb,int,int)
  to authenticated;
grant execute on function relatorios_privados.caixa(uuid,jsonb,int,int)
  to authenticated;

commit;

-- Comissão e financeiro preservam valores oficiais e desconhecidos por campo.
begin;

create function relatorios_privados.comissao(
  p_casa uuid, p_filtros jsonb, p_pagina int, p_tamanho int
) returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, public, relatorios_privados
as $$
declare resultado jsonb;
begin
  perform relatorios_privados.validar_consulta(p_casa,'comissao',p_filtros,p_pagina,p_tamanho);
  with filtradas as materialized (
    select l.dados, l.dia_movimento, l.posicao
    from public.relatorio_linhas l
    where l.restaurante_id = p_casa and l.relatorio = 'comissao'
      and l.fonte = p_filtros->>'fonte'
      and l.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
      and (not (p_filtros ? 'operador') or l.dados->>'codigo_operador' = p_filtros->>'operador')
  ), agregadas as materialized (
    select dados->>'codigo_operador' collate "C" codigo_operador,
      min((dados->>'operador') collate "C") operador,
      min((dados->>'funcao') collate "C") funcao,
      round(sum((dados->>'vendas_elegiveis')::numeric(20,6)),2) vendas_elegiveis,
      case when count(*) filter (where dados->>'comissao_oficial' is null) > 0 then null
        else round(sum((dados->>'comissao_oficial')::numeric(20,6)),2) end comissao_oficial
    from filtradas
    group by dados->>'codigo_operador' collate "C"
  ), resumo as (
    select coalesce(round(sum(vendas_elegiveis),2),0.00) vendas_elegiveis,
      case when count(*) filter (where comissao_oficial is null) > 0 then null
        else coalesce(round(sum(comissao_oficial),2),0.00) end comissao_oficial,
      count(*) filter (where comissao_oficial is null) operadores_sem_comissao,
      count(*) total_linhas
    from agregadas
  ), pagina as (
    select * from agregadas
    order by operador collate "C" nulls last, codigo_operador nulls last
    offset (p_pagina::bigint - 1) * p_tamanho limit p_tamanho
  )
  select jsonb_build_object(
    'linhas',(select coalesce(jsonb_agg(jsonb_build_object(
      'codigoOperador',codigo_operador,'operador',operador,'funcao',funcao,
      'vendasElegiveis',vendas_elegiveis::text,'comissaoOficial',comissao_oficial::text)
      order by operador collate "C" nulls last,codigo_operador nulls last),'[]'::jsonb) from pagina),
    'resumo',jsonb_build_object('vendasElegiveis',vendas_elegiveis::text,
      'comissaoOficial',comissao_oficial::text,'operadoresSemComissao',operadores_sem_comissao),
    'paginacao',jsonb_build_object('pagina',p_pagina,'tamanho',p_tamanho,'totalLinhas',total_linhas)
  ) into resultado from resumo;
  return resultado;
end;
$$;

create function relatorios_privados.financeiro(
  p_casa uuid, p_filtros jsonb, p_pagina int, p_tamanho int
) returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, public, relatorios_privados
as $$
declare resultado jsonb;
begin
  perform relatorios_privados.validar_consulta(p_casa,'financeiro',p_filtros,p_pagina,p_tamanho);
  with publicacoes as materialized (
    select p.dia_movimento
    from public.relatorio_publicacoes p
    where p.restaurante_id = p_casa and p.relatorio = 'financeiro'
      and p.fonte = p_filtros->>'fonte'
      and p.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
  ), filtradas as materialized (
    select p.dia_movimento, l.dados, l.posicao
    from publicacoes p
    left join public.relatorio_linhas l on l.restaurante_id = p_casa
      and l.relatorio = 'financeiro' and l.fonte = p_filtros->>'fonte'
      and l.dia_movimento = p.dia_movimento
  ), componentes_resumo as (
    select
      case when count(*) filter (where dados is not null and dados->'componentes'->>'consumo' is null) > 0 then null else coalesce(round(sum((dados->'componentes'->>'consumo')::numeric(20,6)),2),0.00) end consumo,
      case when count(*) filter (where dados is not null and dados->'componentes'->>'servico' is null) > 0 then null else coalesce(round(sum((dados->'componentes'->>'servico')::numeric(20,6)),2),0.00) end servico,
      case when count(*) filter (where dados is not null and dados->'componentes'->>'complemento' is null) > 0 then null else coalesce(round(sum((dados->'componentes'->>'complemento')::numeric(20,6)),2),0.00) end complemento,
      case when count(*) filter (where dados is not null and dados->'componentes'->>'taxas_entrada' is null) > 0 then null else coalesce(round(sum((dados->'componentes'->>'taxas_entrada')::numeric(20,6)),2),0.00) end taxas_entrada,
      case when count(*) filter (where dados is not null and dados->'componentes'->>'produto_embutido' is null) > 0 then null else coalesce(round(sum((dados->'componentes'->>'produto_embutido')::numeric(20,6)),2),0.00) end produto_embutido,
      case when count(*) filter (where dados is not null and dados->'componentes'->>'flyers' is null) > 0 then null else coalesce(round(sum((dados->'componentes'->>'flyers')::numeric(20,6)),2),0.00) end flyers
    from filtradas
  ), totais_resumo as (
    select
      case when count(*) filter (where dados is not null and dados->'totais_oficiais'->>'projetado' is null) > 0 then null else coalesce(round(sum((dados->'totais_oficiais'->>'projetado')::numeric(20,6)),2),0.00) end projetado,
      case when count(*) filter (where dados is not null and dados->'totais_oficiais'->>'recebido' is null) > 0 then null else coalesce(round(sum((dados->'totais_oficiais'->>'recebido')::numeric(20,6)),2),0.00) end recebido,
      case when count(*) filter (where dados is not null and dados->'totais_oficiais'->>'notas_assinadas' is null) > 0 then null else coalesce(round(sum((dados->'totais_oficiais'->>'notas_assinadas')::numeric(20,6)),2),0.00) end notas_assinadas,
      case when count(*) filter (where dados is not null and dados->'totais_oficiais'->>'descontos' is null) > 0 then null else coalesce(round(sum((dados->'totais_oficiais'->>'descontos')::numeric(20,6)),2),0.00) end descontos
    from filtradas
  ), entradas_resumo as (
    select
      case when count(*) filter (where dados is not null and dados->'entradas'->>'habilitados' is null) > 0 then null else coalesce(sum((dados->'entradas'->>'habilitados')::bigint),0) end habilitados,
      case when count(*) filter (where dados is not null and dados->'entradas'->>'reabilitados' is null) > 0 then null else coalesce(sum((dados->'entradas'->>'reabilitados')::bigint),0) end reabilitados,
      case when count(*) filter (where dados is not null and dados->'entradas'->>'encerrados' is null) > 0 then null else coalesce(sum((dados->'entradas'->>'encerrados')::bigint),0) end encerrados,
      case when count(*) filter (where dados is not null and dados->'entradas'->>'abertos' is null) > 0 then null else coalesce(sum((dados->'entradas'->>'abertos')::bigint),0) end abertos
    from filtradas
  ), meios_resumo as (
    select meio->>'codigo' collate "C" codigo, meio->>'classe' classe,
      min((meio->>'rotulo') collate "C") rotulo,
      round(sum((meio->>'valor')::numeric(20,6)),2) valor
    from filtradas f cross join lateral jsonb_array_elements(coalesce(f.dados->'meios','[]'::jsonb)) meio
    group by meio->>'codigo' collate "C", meio->>'classe'
  ), publico_resumo as (
    select celula->>'sexo' sexo, celula->>'categoria' categoria,
      sum((celula->>'quantidade')::bigint) quantidade
    from filtradas f cross join lateral jsonb_array_elements(coalesce(f.dados->'publico','[]'::jsonb)) celula
    group by celula->>'sexo', celula->>'categoria'
  ), pagina as (
    select * from filtradas
    order by dia_movimento, posicao nulls last
    offset (p_pagina::bigint - 1) * p_tamanho limit p_tamanho
  )
  select jsonb_build_object(
    'linhas',(select coalesce(jsonb_agg(jsonb_build_object(
      'diaMovimento',to_char(dia_movimento,'YYYY-MM-DD'),
      'componentes',jsonb_build_object(
        'consumo',case when dados is null then '0.00'::text else dados->'componentes'->>'consumo' end,
        'servico',case when dados is null then '0.00'::text else dados->'componentes'->>'servico' end,
        'complemento',case when dados is null then '0.00'::text else dados->'componentes'->>'complemento' end,
        'taxasEntrada',case when dados is null then '0.00'::text else dados->'componentes'->>'taxas_entrada' end,
        'produtoEmbutido',case when dados is null then '0.00'::text else dados->'componentes'->>'produto_embutido' end,
        'flyers',case when dados is null then '0.00'::text else dados->'componentes'->>'flyers' end),
      'totaisOficiais',jsonb_build_object(
        'projetado',case when dados is null then '0.00'::text else dados->'totais_oficiais'->>'projetado' end,
        'recebido',case when dados is null then '0.00'::text else dados->'totais_oficiais'->>'recebido' end,
        'notasAssinadas',case when dados is null then '0.00'::text else dados->'totais_oficiais'->>'notas_assinadas' end,
        'descontos',case when dados is null then '0.00'::text else dados->'totais_oficiais'->>'descontos' end),
      'entradas',jsonb_build_object(
        'habilitados',case when dados is null then 0 else (dados->'entradas'->>'habilitados')::integer end,
        'reabilitados',case when dados is null then 0 else (dados->'entradas'->>'reabilitados')::integer end,
        'encerrados',case when dados is null then 0 else (dados->'entradas'->>'encerrados')::integer end,
        'abertos',case when dados is null then 0 else (dados->'entradas'->>'abertos')::integer end),
      'meios',case when dados is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
        'codigo',m->>'codigo','rotulo',m->>'rotulo','classe',m->>'classe','valor',m->>'valor')
        order by m->>'rotulo' collate "C",m->>'codigo' collate "C",m->>'classe')
        from jsonb_array_elements(dados->'meios') m),'[]'::jsonb) end,
      'publico',case when dados is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
        'sexo',c->>'sexo','categoria',c->>'categoria','quantidade',(c->>'quantidade')::integer)
        order by c->>'sexo' collate "C",c->>'categoria' collate "C")
        from jsonb_array_elements(dados->'publico') c),'[]'::jsonb) end)
      order by dia_movimento),'[]'::jsonb) from pagina),
    'resumo',jsonb_build_object(
      'componentes',(select jsonb_build_object('consumo',consumo::text,'servico',servico::text,
        'complemento',complemento::text,'taxasEntrada',taxas_entrada::text,
        'produtoEmbutido',produto_embutido::text,'flyers',flyers::text)
        from componentes_resumo),
      'totaisOficiais',(select jsonb_build_object('projetado',projetado::text,'recebido',recebido::text,
        'notasAssinadas',notas_assinadas::text,'descontos',descontos::text)
        from totais_resumo),
      'entradas',(select jsonb_build_object('habilitados',habilitados,'reabilitados',reabilitados,
        'encerrados',encerrados,'abertos',abertos) from entradas_resumo),
      'meios',(select coalesce(jsonb_agg(jsonb_build_object('codigo',codigo,'rotulo',rotulo,
        'classe',classe,'valor',valor::text) order by rotulo collate "C",codigo,classe),'[]'::jsonb) from meios_resumo),
      'publico',(select coalesce(jsonb_agg(jsonb_build_object('sexo',sexo,'categoria',categoria,
        'quantidade',quantidade) order by sexo collate "C",categoria collate "C"),'[]'::jsonb) from publico_resumo)),
    'paginacao',jsonb_build_object('pagina',p_pagina,'tamanho',p_tamanho,
      'totalLinhas',(select count(*) from filtradas))
  ) into resultado;
  return resultado;
end;
$$;

revoke all on function relatorios_privados.comissao(uuid,jsonb,int,int) from public, anon, authenticated, service_role;
revoke all on function relatorios_privados.financeiro(uuid,jsonb,int,int) from public, anon, authenticated, service_role;
grant execute on function relatorios_privados.comissao(uuid,jsonb,int,int) to authenticated;
grant execute on function relatorios_privados.financeiro(uuid,jsonb,int,int) to authenticated;

commit;

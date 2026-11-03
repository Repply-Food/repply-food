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
    select l.* from public.itens_vendidos_scc l
    where l.restaurante_id = p_casa
      and l.fonte = p_filtros->>'fonte'
      and l.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
      and (not (p_filtros ? 'pdv') or l.codigo_pdv = p_filtros->>'pdv')
      and (not (p_filtros ? 'grupo') or l.codigo_grupo = p_filtros->>'grupo')
      and (not (p_filtros ? 'garcom') or l.codigo_garcom = p_filtros->>'garcom')
      and (not (p_filtros ? 'mesaDe') or (l.mesa)::numeric >= (p_filtros->>'mesaDe')::numeric)
      and (not (p_filtros ? 'mesaAte') or (l.mesa)::numeric <= (p_filtros->>'mesaAte')::numeric)
  ), agregadas as materialized (
    -- Códigos preservam identidade; mesa/garçom já filtraram a linha de origem.
    -- A origem já descontou cancelamentos e aplicou sua fórmula de venda.
    select codigo_produto collate "C" codigo_produto,
      codigo_pdv collate "C" codigo_pdv,
      codigo_grupo collate "C" codigo_grupo,
      max((produto) collate "C") produto,
      max((pdv) collate "C") pdv,
      max((grupo) collate "C") grupo,
      sum((quantidade)::numeric(20,6)) quantidade,
      round(sum((vendas)::numeric(20,6)),2) vendas,
      case when count(*) filter (where custos is null) > 0 then null
        else round(sum((custos)::numeric(20,6)),2) end custos
    from filtradas
    group by codigo_produto collate "C", codigo_pdv collate "C",
      codigo_grupo collate "C"
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

create or replace function relatorios_privados.notas_assinadas(
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
    select l.* from public.notas_assinadas_scc l
    where l.restaurante_id = p_casa
      and l.fonte = p_filtros->>'fonte'
      and l.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
      and (not (p_filtros ? 'cliente') or l.codigo_cliente = p_filtros->>'cliente')
  ), resumo as (
    select count(*) notas,
      coalesce(round(sum((valor)::numeric(20,6)),2)::text,'0.00') valor
    from filtradas
  ), pagina as (
    select * from filtradas
    order by (codigo_cliente) collate "C" nulls last, dia_movimento,
      (codigo_entrada) collate "C" nulls last,
      (codigo_nota) collate "C" nulls last, posicao
    offset (p_pagina::bigint - 1) * p_tamanho limit p_tamanho
  )
  select jsonb_build_object(
    'linhas',(select coalesce(jsonb_agg(jsonb_build_object(
      'codigoNota',codigo_nota,'codigoEntrada',codigo_entrada,
      'diaMovimento',to_char(dia_movimento,'YYYY-MM-DD'),
      'codigoCliente',codigo_cliente,'valor',round(valor,greatest(scale(trim_scale(valor)),2))::text)
      order by (codigo_cliente) collate "C" nulls last, dia_movimento,
        (codigo_entrada) collate "C" nulls last,
        (codigo_nota) collate "C" nulls last, posicao),'[]'::jsonb) from pagina),
    'resumo',jsonb_build_object('notas',notas,'valor',round(valor,greatest(scale(trim_scale(valor)),2))::text),
    'paginacao',jsonb_build_object('pagina',p_pagina,'tamanho',p_tamanho,'totalLinhas',notas)
  ) into resultado from resumo;
  return resultado;
end;
$$;

commit;

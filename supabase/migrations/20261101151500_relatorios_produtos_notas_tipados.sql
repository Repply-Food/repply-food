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
      'codigoCliente',codigo_cliente,'valor',valor::text)
      order by (codigo_cliente) collate "C" nulls last, dia_movimento,
        (codigo_entrada) collate "C" nulls last,
        (codigo_nota) collate "C" nulls last, posicao),'[]'::jsonb) from pagina),
    'resumo',jsonb_build_object('notas',notas,'valor',valor::text),
    'paginacao',jsonb_build_object('pagina',p_pagina,'tamanho',p_tamanho,'totalLinhas',notas)
  ) into resultado from resumo;
  return resultado;
end;
$$;

create or replace function public.consultar_relatorio(
  p_restaurante_id uuid, p_relatorio text, p_filtros jsonb,
  p_pagina int, p_tamanho int, p_revisao text default null
) returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, public, relatorios_privados
as $$
declare
  revisao_atual text;
  cobertura_atual jsonb;
  resultado_agregado jsonb;
  situacao_atual text;
begin
  -- Valida casa, parâmetros e filtros antes de observar a versão da casa.
  perform relatorios_privados.validar_consulta(
    p_restaurante_id,p_relatorio,p_filtros,p_pagina,p_tamanho
  );

  -- Uma publicação de qualquer relatório da casa invalida a paginação anterior.
  -- Ambas as leituras usam este mesmo comando STABLE e, portanto, o mesmo snapshot.
  select coalesce(v.revisao,0)::text,
    relatorios_privados.cobertura(p_restaurante_id,p_relatorio,p_filtros)
  into revisao_atual,cobertura_atual
  from (select 1) base
  left join public.revisoes_scc v
    on v.restaurante_id = p_restaurante_id;

  if p_revisao is not null and p_revisao is distinct from revisao_atual then
    raise exception using message = 'dados_alterados';
  end if;

  -- Lista fechada; nenhuma entrada do cliente vira nome de função/SQL.
  case p_relatorio
    when 'produtos' then
      resultado_agregado := relatorios_privados.produtos(
        p_restaurante_id,p_filtros,p_pagina,p_tamanho);
    when 'comissao' then
      resultado_agregado := relatorios_privados.comissao(
        p_restaurante_id,p_filtros,p_pagina,p_tamanho);
    when 'caixa' then
      resultado_agregado := relatorios_privados.caixa(
        p_restaurante_id,p_filtros,p_pagina,p_tamanho);
    when 'auditoria' then
      resultado_agregado := relatorios_privados.auditoria(
        p_restaurante_id,p_filtros,p_pagina,p_tamanho);
    when 'notas-assinadas' then
      resultado_agregado := relatorios_privados.notas_assinadas(
        p_restaurante_id,p_filtros,p_pagina,p_tamanho);
    when 'financeiro' then
      resultado_agregado := relatorios_privados.financeiro(
        p_restaurante_id,p_filtros,p_pagina,p_tamanho);
    else
      raise exception using message = 'consulta_invalida';
  end case;

  situacao_atual := case
    when (cobertura_atual->>'recebidos')::integer = 0 then 'sem_dados'
    when jsonb_array_length(cobertura_atual->'ausentes') > 0 then 'parcial'
    else 'completo'
  end;
  return jsonb_build_object(
    'situacao',situacao_atual,
    'revisao',revisao_atual,
    'cobertura',cobertura_atual,
    'linhas',resultado_agregado->'linhas',
    'resumo',resultado_agregado->'resumo',
    'paginacao',resultado_agregado->'paginacao'
  );
end;
$$;

commit;

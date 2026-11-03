begin;

create or replace function relatorios_privados.auditoria(
  p_casa uuid, p_filtros jsonb, p_pagina int, p_tamanho int
) returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, public, relatorios_privados
as $$
declare resultado jsonb;
begin
  perform relatorios_privados.validar_consulta(p_casa,'auditoria',p_filtros,p_pagina,p_tamanho);
  with filtradas as materialized (
    select to_jsonb(l) || jsonb_build_object('quantidade',round(l.quantidade,greatest(scale(trim_scale(l.quantidade)),2))::text,'valor_unitario',round(l.valor_unitario,greatest(scale(trim_scale(l.valor_unitario)),2))::text,'total',round(l.total,greatest(scale(trim_scale(l.total)),2))::text,'limite_minimo_anterior',round(l.limite_minimo_anterior,greatest(scale(trim_scale(l.limite_minimo_anterior)),2))::text,'limite_minimo_novo',round(l.limite_minimo_novo,greatest(scale(trim_scale(l.limite_minimo_novo)),2))::text,'limite_maximo_anterior',round(l.limite_maximo_anterior,greatest(scale(trim_scale(l.limite_maximo_anterior)),2))::text,'limite_maximo_novo',round(l.limite_maximo_novo,greatest(scale(trim_scale(l.limite_maximo_novo)),2))::text) dados, l.dia_movimento, l.posicao,
      l.momento instante
    from public.eventos_auditoria_scc l
    where l.restaurante_id = p_casa
      and l.fonte = p_filtros->>'fonte'
      and l.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
      and (not (p_filtros ? 'operador') or to_jsonb(l)->>'codigo_operador' = p_filtros->>'operador')
      and (not (p_filtros ? 'tipo') or to_jsonb(l)->>'tipo' = p_filtros->>'tipo')
  ), por_tipo as (
    select dados->>'tipo' tipo, count(*) ocorrencias,
      case when dados->>'tipo' <> 'cancelamento_produto' then null
        when count(*) filter (where dados->>'quantidade' is null) > 0 then null
        else coalesce(sum((dados->>'quantidade')::numeric(20,6)),0) end quantidade,
      case when dados->>'tipo' <> 'cancelamento_produto' then null
        when count(*) filter (where dados->>'total' is null) > 0 then null
        else coalesce(round(sum((dados->>'total')::numeric(20,6)),2),0) end total
    from filtradas group by dados->>'tipo'
  ), resumo as (
    select coalesce(sum(ocorrencias),0) ocorrencias,
      coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'ocorrencias',ocorrencias,
        'quantidade',quantidade::text,'total',total::text) order by tipo collate "C"),'[]'::jsonb) por_tipo
    from por_tipo
  ), pagina as (
    select * from filtradas
    order by (dados->>'tipo') collate "C", instante,
      (dados->>'codigo_operador') collate "C" nulls last, dia_movimento, posicao
    offset (p_pagina::bigint - 1) * p_tamanho limit p_tamanho
  )
  select jsonb_build_object(
    'linhas',(select coalesce(jsonb_agg(jsonb_build_object(
      'tipo',dados->>'tipo','momento',dados->>'momento',
      'codigoOperador',dados->>'codigo_operador','operador',dados->>'operador',
      'cartaoAnterior',dados->>'cartao_anterior','cartaoNovo',dados->>'cartao_novo',
      'codigoProduto',dados->>'codigo_produto','produto',dados->>'produto',
      'quantidade',dados->>'quantidade','valorUnitario',dados->>'valor_unitario',
      'total',dados->>'total','limiteMinimoAnterior',dados->>'limite_minimo_anterior',
      'limiteMinimoNovo',dados->>'limite_minimo_novo',
      'limiteMaximoAnterior',dados->>'limite_maximo_anterior',
      'limiteMaximoNovo',dados->>'limite_maximo_novo',
      'diaMovimento',to_char(dia_movimento,'YYYY-MM-DD')) order by
        (dados->>'tipo') collate "C", instante,
        (dados->>'codigo_operador') collate "C" nulls last, dia_movimento, posicao),'[]'::jsonb) from pagina),
    'resumo',jsonb_build_object('ocorrencias',ocorrencias,'porTipo',por_tipo),
    'paginacao',jsonb_build_object('pagina',p_pagina,'tamanho',p_tamanho,'totalLinhas',ocorrencias)
  ) into resultado from resumo;
  return resultado;
end;
$$;

commit;

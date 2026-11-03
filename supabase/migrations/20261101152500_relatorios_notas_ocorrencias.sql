begin;

alter table public.notas_assinadas_scc drop constraint notas_assinadas_scc_restaurante_id_dia_movimento_fonte_codi_key;

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
    'resumo',jsonb_build_object('notas',notas,'valor',valor),
    'paginacao',jsonb_build_object('pagina',p_pagina,'tamanho',p_tamanho,'totalLinhas',notas)
  ) into resultado from resumo;
  return resultado;
end;
$$;

commit;

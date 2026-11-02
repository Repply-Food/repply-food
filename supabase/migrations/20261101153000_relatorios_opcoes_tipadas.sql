begin;

create or replace function public.opcoes_relatorio(
  p_restaurante_id uuid, p_relatorio text, p_filtros jsonb, p_dimensao text,
  p_busca text default '', p_pagina int default 1
) returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, public, relatorios_privados
as $$
declare
  dimensoes text[];
  resultado jsonb;
begin
  perform relatorios_privados.validar_consulta(p_restaurante_id,p_relatorio,p_filtros,p_pagina,25);
  if p_busca is null or char_length(p_busca) > 80 then
    raise exception using message = 'consulta_invalida';
  end if;
  dimensoes := case p_relatorio
    when 'produtos' then array['pdv','grupo','garcom']
    when 'comissao' then array['operador']
    when 'caixa' then array['operador','tipo','categoria']
    when 'auditoria' then array['operador','tipo']
    when 'notas-assinadas' then array['cliente']
    else array[]::text[] end;
  if p_dimensao is null or not (p_dimensao = any(dimensoes)) then
    raise exception using message = 'filtro_indisponivel';
  end if;
  if not ((relatorios_privados.cobertura(p_restaurante_id,p_relatorio,p_filtros)->'recursos') ? p_dimensao) then
    raise exception using message = 'filtro_indisponivel';
  end if;

  with origem as (
    select to_jsonb(l) dados from public.itens_vendidos_scc l
    where p_relatorio = 'produtos' and l.restaurante_id = p_restaurante_id
      and l.fonte = p_filtros->>'fonte'
      and l.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
    union all
    select to_jsonb(l) dados from public.comissoes_scc l
    where p_relatorio = 'comissao' and l.restaurante_id = p_restaurante_id
      and l.fonte = p_filtros->>'fonte'
      and l.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
    union all
    select to_jsonb(l) dados from public.movimentos_caixa_scc l
    where p_relatorio = 'caixa' and l.restaurante_id = p_restaurante_id
      and l.fonte = p_filtros->>'fonte'
      and l.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
    union all
    select to_jsonb(l) dados from public.eventos_auditoria_scc l
    where p_relatorio = 'auditoria' and l.restaurante_id = p_restaurante_id
      and l.fonte = p_filtros->>'fonte'
      and l.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
    union all
    select to_jsonb(l) dados from public.notas_assinadas_scc l
    where p_relatorio = 'notas-assinadas' and l.restaurante_id = p_restaurante_id
      and l.fonte = p_filtros->>'fonte'
      and l.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
  ), filtradas as (
    select l.dados from origem l
    where (not (p_filtros ? 'pdv') or l.dados->>'codigo_pdv' = p_filtros->>'pdv')
      and (not (p_filtros ? 'grupo') or l.dados->>'codigo_grupo' = p_filtros->>'grupo')
      and (not (p_filtros ? 'garcom') or l.dados->>'codigo_garcom' = p_filtros->>'garcom')
      and (not (p_filtros ? 'mesaDe') or (l.dados->>'mesa')::numeric >= (p_filtros->>'mesaDe')::numeric)
      and (not (p_filtros ? 'mesaAte') or (l.dados->>'mesa')::numeric <= (p_filtros->>'mesaAte')::numeric)
      and (not (p_filtros ? 'operador') or l.dados->>'codigo_operador' = p_filtros->>'operador')
      and (not (p_filtros ? 'tipo') or l.dados->>'tipo' = p_filtros->>'tipo')
      and (not (p_filtros ? 'categoria') or l.dados->>'tipo' || ':' || (l.dados->>'codigo_categoria') = p_filtros->>'categoria')
      and (not (p_filtros ? 'cliente') or l.dados->>'codigo_cliente' = p_filtros->>'cliente')
  ), valores as (
    select case p_dimensao
      when 'pdv' then dados->>'codigo_pdv'
      when 'grupo' then dados->>'codigo_grupo'
      when 'garcom' then dados->>'codigo_garcom'
      when 'operador' then dados->>'codigo_operador'
      when 'tipo' then dados->>'tipo'
      when 'categoria' then dados->>'tipo' || ':' || (dados->>'codigo_categoria')
      when 'cliente' then dados->>'codigo_cliente' end codigo,
    case p_dimensao
      when 'pdv' then coalesce(dados->>'pdv',dados->>'codigo_pdv')
      when 'grupo' then coalesce(dados->>'grupo',dados->>'codigo_grupo')
      when 'garcom' then coalesce(dados->>'garcom',dados->>'codigo_garcom')
      when 'operador' then coalesce(dados->>'operador',dados->>'codigo_operador')
      when 'tipo' then dados->>'tipo'
      when 'categoria' then dados->>'categoria'
      when 'cliente' then 'Cliente ' || (dados->>'codigo_cliente') end rotulo
    from filtradas
  ), pagina as materialized (
    select distinct codigo collate "C" codigo, rotulo collate "C" rotulo
    from valores where codigo is not null and rotulo is not null
      and position(lower(p_busca) in lower(rotulo)) > 0
    order by rotulo, codigo limit 26 offset (p_pagina::bigint - 1) * 25
  ), visiveis as (
    select codigo,rotulo from pagina order by rotulo,codigo limit 25
  )
  select jsonb_build_object(
    'opcoes',(select coalesce(jsonb_agg(jsonb_build_object('codigo',codigo,'rotulo',rotulo)
      order by rotulo,codigo),'[]'::jsonb) from visiveis),
    'mais',(select count(*) > 25 from pagina)
  ) into resultado;
  return resultado;
end;
$$;

commit;

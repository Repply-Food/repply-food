-- RPC única de leitura: cobertura e revisão partilham o snapshot MVCC do SELECT.
begin;

create function public.consultar_relatorio(
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
  left join public.relatorio_versoes v
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

revoke all on function public.consultar_relatorio(uuid,text,jsonb,int,int,text)
  from public, anon, authenticated, service_role;
grant execute on function public.consultar_relatorio(uuid,text,jsonb,int,int,text)
  to authenticated;

commit;

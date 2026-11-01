begin;

alter function public.validar_pagina_scc_v2(jsonb) rename to validar_envelope_comissoes_scc_v2;

create function public.validar_pagina_scc_v2(p_pagina jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tipo text;
  relatorio text;
  linha jsonb;
  quantidade integer;
  total numeric;
  paginas numeric;
begin
  if jsonb_typeof(p_pagina) is distinct from 'object'
     or jsonb_typeof(p_pagina->'dados') is distinct from 'array' then
    raise exception using errcode = 'PR422', message = 'pagina_scc_invalida';
  end if;
  quantidade := jsonb_array_length(p_pagina->'dados');
  if quantidade > 500 or octet_length(convert_to(p_pagina::text, 'UTF8')) > 1048576 then
    raise exception using errcode = 'PR413', message = 'limite_pagina_scc';
  end if;
  tipo := p_pagina->>'tipo_envio';
  relatorio := case tipo
    when 'comissoes' then 'comissao'
    when 'itens_vendidos' then 'produtos'
    when 'movimentos_caixa' then 'caixa'
    when 'eventos_auditoria' then 'auditoria'
    when 'notas_assinadas' then 'notas-assinadas'
    when 'financeiro' then 'financeiro'
    else null end;
  if relatorio is null then
    raise exception using errcode = 'PR422', message = 'pagina_scc_invalida';
  end if;
  perform public.validar_envelope_comissoes_scc_v2(
    jsonb_set(jsonb_set(p_pagina, '{tipo_envio}', '"comissoes"'::jsonb), '{dados}', '[]'::jsonb)
  );
  begin
    total := (p_pagina->>'total_registros')::numeric;
    paginas := (p_pagina->'pagina'->>'total')::numeric;
    if quantidade > total or total > quantidade + (paginas - 1) * 500
       or (paginas = 1 and quantidade <> total)
       or (total = 0 and paginas <> 1)
       or (tipo = 'financeiro' and (paginas <> 1 or total > 1)) then
      raise exception 'invalido';
    end if;
    for linha in select value from jsonb_array_elements(p_pagina->'dados') loop
      if tipo = 'itens_vendidos' then
        if jsonb_typeof(linha) is distinct from 'object'
           or jsonb_typeof(linha->'codigo_entrada') is distinct from 'string'
           or linha->>'codigo_entrada' !~ '^[A-Za-z0-9_.-]{1,80}$'
           or jsonb_typeof(linha->'ordinal') is distinct from 'number'
           or (linha->>'ordinal')::numeric <> trunc((linha->>'ordinal')::numeric)
           or (linha->>'ordinal')::numeric not between 0 and 2147483647 then
          raise exception 'invalido';
        end if;
        perform public.validar_linha_relatorio(relatorio, linha - array['codigo_entrada','ordinal']);
      else
        perform public.validar_linha_relatorio(relatorio, linha);
      end if;
      if tipo in ('movimentos_caixa','eventos_auditoria') then
        if linha->>'momento' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]+)?(Z|[+-](0[0-9]|1[0-5]):[0-5][0-9])$'
           or left(linha->>'momento',4)::integer not between 2 and 9998 then raise exception 'invalido'; end if;
        perform (linha->>'momento')::timestamptz;
      end if;
      if tipo = 'financeiro' and exists (
        select 1 from jsonb_array_elements(linha->'meios') m
        group by m->>'codigo' having count(*) > 1
      ) then raise exception 'invalido'; end if;
    end loop;
  exception when others then
    raise exception using errcode = 'PR422', message = 'pagina_scc_invalida';
  end;
end;
$$;

revoke all on function public.validar_pagina_scc_v2(jsonb) from public, anon, authenticated;
grant execute on function public.validar_pagina_scc_v2(jsonb) to service_role;

commit;

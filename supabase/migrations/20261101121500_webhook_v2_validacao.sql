begin;

create function public.validar_pagina_scc_v2(p_pagina jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  chaves text[] := array['versao_formato','tipo_envio','versao_scc','enviado_em','id_envio','sequencia','natureza','modo','pagina','total_registros','dados','dia_movimento','fonte','recursos'];
  chave text;
  numero numeric;
  total_paginas numeric;
  total_registros numeric;
  linha jsonb;
  recursos text[];
begin
  begin
    if jsonb_typeof(p_pagina) is distinct from 'object'
       or not (p_pagina ?& chaves)
       or p_pagina - chaves <> '{}'::jsonb
       or p_pagina->'versao_formato' is distinct from '2'::jsonb
       or p_pagina->'tipo_envio' is distinct from '"comissoes"'::jsonb
       or p_pagina->'modo' is distinct from '"fotografia"'::jsonb then
      raise exception 'invalido';
    end if;
    foreach chave in array array['versao_scc','enviado_em','id_envio','sequencia','natureza','dia_movimento','fonte'] loop
      if jsonb_typeof(p_pagina->chave) is distinct from 'string' then raise exception 'invalido'; end if;
    end loop;
    if length(p_pagina->>'versao_scc') = 0
       or p_pagina->>'natureza' not in ('scc','simulacao')
       or p_pagina->>'fonte' not in ('online','historico')
       or p_pagina->>'id_envio' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_pagina->>'sequencia' !~ '^[1-9][0-9]{0,18}$'
       or (p_pagina->>'sequencia')::numeric > 9223372036854775807
       or p_pagina->>'dia_movimento' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or left(p_pagina->>'dia_movimento',4) = '0000'
       or to_char((p_pagina->>'dia_movimento')::date,'YYYY-MM-DD') <> p_pagina->>'dia_movimento'
       or p_pagina->>'enviado_em' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]+)?(Z|[+-](0[0-9]|1[0-5]):[0-5][0-9])$'
       or left(p_pagina->>'enviado_em',4) = '0000'
       or to_char(left(p_pagina->>'enviado_em',10)::date,'YYYY-MM-DD') <> left(p_pagina->>'enviado_em',10) then
      raise exception 'invalido';
    end if;
    perform (p_pagina->>'enviado_em')::timestamptz;
    if jsonb_typeof(p_pagina->'pagina') is distinct from 'object'
       or not (p_pagina->'pagina' ?& array['numero','total'])
       or p_pagina->'pagina' - array['numero','total'] <> '{}'::jsonb
       or jsonb_typeof(p_pagina->'dados') is distinct from 'array'
       or jsonb_typeof(p_pagina->'recursos') is distinct from 'array' then
      raise exception 'invalido';
    end if;
    if jsonb_typeof(p_pagina->'pagina'->'numero') is distinct from 'number'
       or jsonb_typeof(p_pagina->'pagina'->'total') is distinct from 'number'
       or jsonb_typeof(p_pagina->'total_registros') is distinct from 'number' then raise exception 'invalido'; end if;
    numero := (p_pagina->'pagina'->>'numero')::numeric;
    total_paginas := (p_pagina->'pagina'->>'total')::numeric;
    total_registros := (p_pagina->>'total_registros')::numeric;
    if numero <> trunc(numero) or total_paginas <> trunc(total_paginas)
       or total_registros <> trunc(total_registros)
       or numero < 1 or total_paginas < 1 or numero > total_paginas
       or total_registros < 0 or total_registros > 100000 then raise exception 'invalido'; end if;
    if exists(select 1 from jsonb_array_elements(p_pagina->'recursos') v where jsonb_typeof(v) <> 'string') then raise exception 'invalido'; end if;
    select coalesce(array_agg(v),array[]::text[]) into recursos from jsonb_array_elements_text(p_pagina->'recursos') v;
    if not recursos <@ array['pdv','grupo','garcom','mesa','operador','tipo','categoria','cliente']::text[]
       or cardinality(recursos) <> (select count(distinct v) from unnest(recursos) v) then raise exception 'invalido'; end if;
    for linha in select value from jsonb_array_elements(p_pagina->'dados') loop
      perform public.validar_linha_relatorio('comissao', linha);
    end loop;
  exception when others then
    raise exception using errcode = 'PR422', message = 'pagina_scc_invalida';
  end;
  if total_paginas > 200 or jsonb_array_length(p_pagina->'dados') > 500
     or octet_length(convert_to(p_pagina::text, 'UTF8')) > 1048576 then
    raise exception using errcode = 'PR413', message = 'limite_pagina_scc';
  end if;
end;
$$;

revoke all on function public.validar_pagina_scc_v2(jsonb) from public, anon, authenticated;
grant execute on function public.validar_pagina_scc_v2(jsonb) to service_role;

commit;

begin;

alter function public.validar_pagina_scc_v2(jsonb) rename to validar_fotografia_scc_v2;

create function public.validar_pagina_scc_v2(p_pagina jsonb)
returns void
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  chaves text[] := array['versao_formato','tipo_envio','versao_scc','enviado_em','id_envio','sequencia','natureza','modo','pagina','total_registros','dados'];
  campos text[] := array['codigo_produto','produto','codigo_grupo','grupo','preco_custo_atual','ativo','alterado_em'];
  linha jsonb;
  adaptado jsonb;
  quantidade integer;
  total numeric;
  paginas numeric;
begin
  if p_pagina->>'tipo_envio' is distinct from 'cadastro_produtos' then
    perform public.validar_fotografia_scc_v2(p_pagina);
    return;
  end if;
  begin
    if jsonb_typeof(p_pagina) is distinct from 'object'
       or not (p_pagina ?& chaves) or p_pagina - chaves <> '{}'::jsonb
       or p_pagina->'modo' is distinct from '"incremental"'::jsonb
       or jsonb_typeof(p_pagina->'dados') is distinct from 'array' then raise exception 'invalido'; end if;
    quantidade := jsonb_array_length(p_pagina->'dados');
  exception when others then
    raise exception using errcode = 'PR422', message = 'pagina_scc_invalida';
  end;
  if quantidade > 500 or octet_length(convert_to(p_pagina::text,'UTF8')) > 1048576 then
    raise exception using errcode = 'PR413', message = 'limite_pagina_scc';
  end if;
  adaptado := p_pagina || '{"tipo_envio":"comissoes","modo":"fotografia","dia_movimento":"2026-01-01","fonte":"online","recursos":[],"dados":[]}'::jsonb;
  perform public.validar_envelope_comissoes_scc_v2(adaptado);
  begin
    total := (p_pagina->>'total_registros')::numeric;
    paginas := (p_pagina->'pagina'->>'total')::numeric;
    if quantidade > total or total > quantidade + (paginas - 1) * 500
       or (paginas = 1 and quantidade <> total) or (total = 0 and paginas <> 1) then raise exception 'invalido'; end if;
    for linha in select value from jsonb_array_elements(p_pagina->'dados') loop
      if jsonb_typeof(linha) is distinct from 'object' or not (linha ?& campos)
         or linha - campos <> '{}'::jsonb
         or jsonb_typeof(linha->'ativo') is distinct from 'boolean'
         or jsonb_typeof(linha->'alterado_em') is distinct from 'string'
         or linha->>'alterado_em' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]+)?(Z|[+-](0[0-9]|1[0-5]):[0-5][0-9])$'
         or left(linha->>'alterado_em',4) = '0000'
         or to_char(left(linha->>'alterado_em',10)::date,'YYYY-MM-DD') <> left(linha->>'alterado_em',10) then raise exception 'invalido'; end if;
      perform (linha->>'alterado_em')::timestamptz;
      perform public.validar_linha_relatorio('produtos', jsonb_build_object(
        'codigo_produto',linha->'codigo_produto','produto',linha->'produto',
        'codigo_grupo',linha->'codigo_grupo','grupo',linha->'grupo',
        'codigo_pdv',null,'pdv',null,'codigo_garcom',null,'garcom',null,'mesa',null,
        'quantidade','0','vendas','0','custos',linha->'preco_custo_atual'));
    end loop;
  exception when others then
    raise exception using errcode = 'PR422', message = 'pagina_scc_invalida';
  end;
end;
$$;

revoke all on function public.validar_pagina_scc_v2(jsonb) from public, anon, authenticated;
grant execute on function public.validar_pagina_scc_v2(jsonb) to service_role;

commit;

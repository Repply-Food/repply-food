begin;

alter function public.validar_pagina_scc_v2(jsonb) rename to validar_cadastro_scc_v2;

create function public.validar_pagina_scc_v2(p_pagina jsonb)
returns void
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  chaves text[] := array['versao_formato','tipo_envio','versao_scc','enviado_em','id_envio','sequencia','natureza','modo','pagina','total_registros','dados','janela'];
  campos text[] := array['codEntrada','DataEntrada','HoraEntrada','DataSaida','HoraSaida','ValorItens','ValorDescontos','ValorAcrescimos','TaxaServico','Complemento','ValorConsumido','Pago','codCartaoMesa','CodGarcon','codOperadorHab','codOperadorDesab','codCliente','NumeroOcupantes','TipoOcupacao','TipoCartao'];
  opcionais text[] := array['Reabilitado','Flyer','ConferenciaDeMesa','HabilitacaoAutomatica','DesabilitacaoAutomatica','LimiteMinimo','LimiteMaximo','ECF','CER','COO'];
  linha jsonb;
  adaptado jsonb;
  chave text;
  quantidade integer;
  total numeric;
  paginas numeric;
  valor numeric;
begin
  if p_pagina->>'tipo_envio' is distinct from 'entradas' then
    perform public.validar_cadastro_scc_v2(p_pagina);
    return;
  end if;
  begin
    if jsonb_typeof(p_pagina) is distinct from 'object' or not (p_pagina ?& chaves)
       or p_pagina - chaves <> '{}'::jsonb or p_pagina->'modo' is distinct from '"janela"'::jsonb
       or jsonb_typeof(p_pagina->'dados') is distinct from 'array'
       or jsonb_typeof(p_pagina->'janela') is distinct from 'object'
       or not (p_pagina->'janela' ?& array['desde','ate'])
       or (p_pagina->'janela') - array['desde','ate'] <> '{}'::jsonb then raise exception 'invalido'; end if;
    foreach chave in array array['desde','ate'] loop
      if jsonb_typeof(p_pagina->'janela'->chave) is distinct from 'string'
         or p_pagina->'janela'->>chave !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         or left(p_pagina->'janela'->>chave,4) = '0000'
         or to_char((p_pagina->'janela'->>chave)::date,'YYYY-MM-DD') <> p_pagina->'janela'->>chave then raise exception 'invalido'; end if;
    end loop;
    if (p_pagina->'janela'->>'desde')::date > (p_pagina->'janela'->>'ate')::date then raise exception 'invalido'; end if;
    quantidade := jsonb_array_length(p_pagina->'dados');
  exception when others then
    raise exception using errcode = 'PR422', message = 'pagina_scc_invalida';
  end;
  if quantidade > 500 or octet_length(convert_to(p_pagina::text,'UTF8')) > 1048576 then
    raise exception using errcode = 'PR413', message = 'limite_pagina_scc';
  end if;
  adaptado := (p_pagina - 'janela') || '{"tipo_envio":"comissoes","modo":"fotografia","dia_movimento":"2026-01-01","fonte":"online","recursos":[],"dados":[]}'::jsonb;
  perform public.validar_envelope_comissoes_scc_v2(adaptado);
  begin
    total := (p_pagina->>'total_registros')::numeric;
    paginas := (p_pagina->'pagina'->>'total')::numeric;
    if quantidade > total or total > quantidade + (paginas - 1) * 500
       or (paginas = 1 and quantidade <> total) or (total = 0 and paginas <> 1) then raise exception 'invalido'; end if;
    for linha in select value from jsonb_array_elements(p_pagina->'dados') loop
      if jsonb_typeof(linha) is distinct from 'object' or not (linha ?& campos)
         or linha - (campos || opcionais) <> '{}'::jsonb then raise exception 'invalido'; end if;
      foreach chave in array array['codEntrada','codCartaoMesa','CodGarcon','codOperadorHab','codOperadorDesab','codCliente','NumeroOcupantes'] loop
        if linha->chave = 'null'::jsonb and chave not in ('codEntrada','NumeroOcupantes') then continue; end if;
        if jsonb_typeof(linha->chave) is distinct from 'number' then raise exception 'invalido'; end if;
        valor := (linha->>chave)::numeric;
        if valor <> trunc(valor) or valor not between -9007199254740991 and 9007199254740991 then raise exception 'invalido'; end if;
      end loop;
      foreach chave in array array['ValorItens','ValorDescontos','ValorAcrescimos','TaxaServico','Complemento','ValorConsumido'] loop
        if jsonb_typeof(linha->chave) is distinct from 'string' or linha->>chave !~ '^-?[0-9]{1,14}([.][0-9]{1,6})?$' then raise exception 'invalido'; end if;
      end loop;
      foreach chave in array array['DataEntrada','DataSaida'] loop
        if chave = 'DataSaida' and linha->chave = 'null'::jsonb then continue; end if;
        if jsonb_typeof(linha->chave) is distinct from 'string' or linha->>chave !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
           or left(linha->>chave,4) = '0000' or to_char((linha->>chave)::date,'YYYY-MM-DD') <> linha->>chave then raise exception 'invalido'; end if;
      end loop;
      foreach chave in array array['HoraEntrada','HoraSaida'] loop
        if chave = 'HoraSaida' and linha->chave = 'null'::jsonb then continue; end if;
        if jsonb_typeof(linha->chave) is distinct from 'string' or linha->>chave !~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$' then raise exception 'invalido'; end if;
      end loop;
      if (linha->'DataSaida' = 'null'::jsonb) <> (linha->'HoraSaida' = 'null'::jsonb)
         or (jsonb_typeof(linha->'Pago') is distinct from 'boolean' and linha->'Pago' not in ('"Sim"'::jsonb,'"Não"'::jsonb))
         or jsonb_typeof(linha->'TipoOcupacao') is distinct from 'string'
         or jsonb_typeof(linha->'TipoCartao') is distinct from 'string' then raise exception 'invalido'; end if;
      foreach chave in array opcionais loop
        if linha ? chave and jsonb_typeof(linha->chave) not in ('string','number','boolean','null') then raise exception 'invalido'; end if;
      end loop;
    end loop;
  exception when others then
    raise exception using errcode = 'PR422', message = 'pagina_scc_invalida';
  end;
end;
$$;

revoke all on function public.validar_pagina_scc_v2(jsonb) from public, anon, authenticated;
grant execute on function public.validar_pagina_scc_v2(jsonb) to service_role;

commit;

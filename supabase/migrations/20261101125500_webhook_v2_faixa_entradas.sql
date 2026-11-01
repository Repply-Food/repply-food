begin;

alter function public.validar_pagina_scc_v2(jsonb) rename to validar_pagina_scc_v2_base;
revoke all on function public.validar_pagina_scc_v2_base(jsonb) from public, anon, authenticated, service_role;

create function public.validar_pagina_scc_v2(p_pagina jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  linha jsonb;
  campo text;
begin
  perform public.validar_pagina_scc_v2_base(p_pagina);
  if p_pagina->>'tipo_envio' = 'entradas' then
    for linha in select value from jsonb_array_elements(p_pagina->'dados') loop
      foreach campo in array array['codCartaoMesa','CodGarcon','codOperadorHab','codOperadorDesab','codCliente','NumeroOcupantes'] loop
        if linha->campo <> 'null'::jsonb and (linha->>campo)::numeric not between -2147483648 and 2147483647 then
          raise exception using errcode='PR422', message='pagina_scc_invalida';
        end if;
      end loop;
    end loop;
  end if;
end;
$$;

revoke all on function public.validar_pagina_scc_v2(jsonb) from public, anon, authenticated;
grant execute on function public.validar_pagina_scc_v2(jsonb) to service_role;

commit;

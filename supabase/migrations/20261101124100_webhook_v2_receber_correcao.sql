begin;

do $$
declare
  definicao text;
begin
  select pg_get_functiondef('public.receber_pagina_scc_v2(uuid,jsonb)'::regprocedure) into definicao;
  if position('coalesce(sum(quantidade),0)' in definicao) = 0 then
    raise exception 'definicao_receber_inesperada';
  end if;
  execute replace(definicao, 'coalesce(sum(quantidade),0)', 'coalesce(sum(public.paginas_scc.quantidade),0)');
end;
$$;

commit;

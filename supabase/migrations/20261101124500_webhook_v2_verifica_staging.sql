begin;

do $$
declare
  definicao text;
  anterior text := '(pagina_existente.dados is not null and pagina_existente.dados is distinct from p_pagina->''dados'')';
  corrigido text := '(pagina_existente.dados is distinct from p_pagina->''dados'' and (pagina_existente.dados is not null or carga.estado = ''recebendo''))';
begin
  select pg_get_functiondef('public.receber_pagina_scc_v2(uuid,jsonb)'::regprocedure) into definicao;
  if position(anterior in definicao) = 0 then
    raise exception 'definicao_receber_inesperada';
  end if;
  execute replace(definicao, anterior, corrigido);
end;
$$;

commit;

begin;

revoke all on function public.publicar_carga_scc_v2(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.validar_pagina_scc_v2(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.validar_cadastro_scc_v2(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.validar_fotografia_scc_v2(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.validar_envelope_comissoes_scc_v2(jsonb) from public, anon, authenticated, service_role;

commit;

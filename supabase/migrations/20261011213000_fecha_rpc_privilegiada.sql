begin;

revoke execute on function public.processar_envio(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.recalcular_dia_operacao(uuid) from public, anon, authenticated;
revoke execute on function public.atualizar_estados() from public, anon, authenticated;
revoke execute on function public.atualizar_turnos(uuid, jsonb) from public, anon;

grant execute on function public.processar_envio(uuid, jsonb) to service_role;
grant execute on function public.recalcular_dia_operacao(uuid) to service_role;
grant execute on function public.atualizar_estados() to service_role;
grant execute on function public.atualizar_turnos(uuid, jsonb) to authenticated, service_role;

commit;

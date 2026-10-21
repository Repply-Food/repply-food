begin;

create or replace function public.validar_intervalo_resultados(
  p_inicio date,
  p_fim date
)
returns void
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_inicio is null
     or p_fim is null
     or p_fim < p_inicio
     or p_fim - p_inicio + 1 > 90 then
    raise exception 'intervalo_resultados_invalido' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.validar_intervalo_resultados(date, date) from public;
grant execute on function public.validar_intervalo_resultados(date, date)
  to authenticated, service_role;

commit;

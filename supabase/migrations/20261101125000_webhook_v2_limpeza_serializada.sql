begin;

create or replace function public.limpar_cargas_scc_v2()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  casa uuid;
  expiradas integer := 0;
  paginas_limpas integer := 0;
  alteradas integer;
begin
  for casa in
    select c.restaurante_id from public.cargas_scc c
    where (c.estado = 'recebendo' and c.criada_em < now() - interval '24 hours')
       or (c.estado in ('publicada','substituida') and exists (
         select 1 from public.paginas_scc p
         where p.restaurante_id = c.restaurante_id and p.id_envio = c.id_envio and p.dados is not null
       ))
    group by c.restaurante_id order by c.restaurante_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(casa::text,0));
    update public.cargas_scc
       set estado = 'expirada', atualizada_em = now()
     where restaurante_id = casa and estado = 'recebendo'
       and criada_em < now() - interval '24 hours';
    get diagnostics alteradas = row_count;
    expiradas := expiradas + alteradas;

    update public.paginas_scc p set dados = null
      from public.cargas_scc c
     where c.restaurante_id = casa and p.restaurante_id = c.restaurante_id
       and p.id_envio = c.id_envio and c.estado in ('publicada','substituida')
       and p.dados is not null;
    get diagnostics alteradas = row_count;
    paginas_limpas := paginas_limpas + alteradas;
  end loop;
  return jsonb_build_object('expiradas', expiradas, 'paginas_limpas', paginas_limpas);
end;
$$;

revoke all on function public.limpar_cargas_scc_v2() from public, anon, authenticated;
grant execute on function public.limpar_cargas_scc_v2() to service_role;

commit;

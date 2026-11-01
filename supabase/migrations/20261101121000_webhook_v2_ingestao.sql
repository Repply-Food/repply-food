begin;

create function public.limpar_cargas_scc_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  expiradas integer;
  paginas_limpas integer;
begin
  update public.cargas_scc
     set estado = 'expirada', atualizada_em = now()
   where estado = 'recebendo' and criada_em < now() - interval '24 hours';
  get diagnostics expiradas = row_count;

  update public.paginas_scc p
     set dados = null
    from public.cargas_scc c
   where c.restaurante_id = p.restaurante_id
     and c.id_envio = p.id_envio
     and c.estado in ('publicada', 'substituida')
     and p.dados is not null;
  get diagnostics paginas_limpas = row_count;

  return jsonb_build_object('expiradas', expiradas, 'paginas_limpas', paginas_limpas);
end;
$$;

revoke all on function public.limpar_cargas_scc_v2() from public, anon, authenticated;
grant execute on function public.limpar_cargas_scc_v2() to service_role;

select cron.schedule('rf-limpa-cargas-scc-v2', '45 5 * * *', 'select public.limpar_cargas_scc_v2()');

commit;

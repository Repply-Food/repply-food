begin;

create function public.expirar_cargas_obsoletas_scc_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.restaurante_id::text,0));
  update public.cargas_scc
     set estado='expirada', atualizada_em=now()
   where restaurante_id=new.restaurante_id
     and tipo_envio=new.tipo_envio
     and chave_escopo=new.chave_escopo
     and sequencia<new.sequencia
     and estado='recebendo';
  return new;
end;
$$;

revoke all on function public.expirar_cargas_obsoletas_scc_v2() from public, anon, authenticated, service_role;

create trigger cursores_scc_expira_obsoletas
after insert or update of sequencia,id_envio on public.cursores_scc
for each row execute function public.expirar_cargas_obsoletas_scc_v2();

commit;

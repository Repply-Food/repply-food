begin;

alter function public.publicar_entradas_scc_v2(uuid,uuid) rename to publicar_entradas_scc_v2_sem_revisao;
alter function public.publicar_carga_scc_v2(uuid,uuid) rename to publicar_carga_scc_v2_sem_revisao;

do $$
declare definicao text;
begin
  select pg_get_functiondef('public.publicar_entradas_scc_v2_sem_revisao(uuid,uuid)'::regprocedure) into definicao;
  execute replace(definicao, 'publicar_entradas_scc_v2.recibo', 'publicar_entradas_scc_v2_sem_revisao.recibo');
end;
$$;

create function public.publicar_entradas_scc_v2(p_restaurante_id uuid, p_id_envio uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_recibo jsonb; v_revisao bigint;
begin
  v_recibo := public.publicar_entradas_scc_v2_sem_revisao(p_restaurante_id, p_id_envio);
  insert into public.revisoes_scc as r(restaurante_id,revisao) values(p_restaurante_id,1)
    on conflict(restaurante_id) do update set revisao=r.revisao+1 returning revisao into v_revisao;
  v_recibo := v_recibo || jsonb_build_object('revisao',v_revisao);
  update public.cargas_scc set recibo=v_recibo where restaurante_id=p_restaurante_id and id_envio=p_id_envio and estado='publicada';
  if not found then raise exception using errcode='PR422', message='carga_scc_invalida'; end if;
  return v_recibo;
end;
$$;

create function public.publicar_carga_scc_v2(p_restaurante_id uuid, p_id_envio uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_recibo jsonb; v_revisao bigint;
begin
  v_recibo := public.publicar_carga_scc_v2_sem_revisao(p_restaurante_id, p_id_envio);
  insert into public.revisoes_scc as r(restaurante_id,revisao) values(p_restaurante_id,1)
    on conflict(restaurante_id) do update set revisao=r.revisao+1 returning revisao into v_revisao;
  v_recibo := v_recibo || jsonb_build_object('revisao',v_revisao);
  update public.cargas_scc set recibo=v_recibo where restaurante_id=p_restaurante_id and id_envio=p_id_envio and estado='publicada';
  if not found then raise exception using errcode='PR422', message='carga_scc_invalida'; end if;
  return v_recibo;
end;
$$;
revoke all on function public.publicar_entradas_scc_v2_sem_revisao(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.publicar_carga_scc_v2_sem_revisao(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.publicar_entradas_scc_v2(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.publicar_carga_scc_v2(uuid,uuid) from public, anon, authenticated, service_role;
commit;

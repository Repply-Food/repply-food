begin;

create function public.publicar_carga_scc_v2(p_restaurante_id uuid, p_id_envio uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  carga public.cargas_scc%rowtype;
  linha jsonb;
  v_recibo jsonb;
  afetadas integer;
begin
  if p_restaurante_id is null or p_id_envio is null then
    raise exception using errcode='PR422', message='carga_scc_invalida';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text,0));
  select * into carga from public.cargas_scc
    where restaurante_id=p_restaurante_id and id_envio=p_id_envio for update;
  if not found or carga.tipo_envio <> 'cadastro_produtos' or carga.estado <> 'recebendo' then
    raise exception using errcode='PR422', message='carga_scc_invalida';
  end if;
  perform public.revalidar_carga_scc_v2(p_restaurante_id,p_id_envio);
  if exists(select 1 from public.cursores_scc where restaurante_id=p_restaurante_id
    and tipo_envio='cadastro_produtos' and chave_escopo='cadastro_produtos' and sequencia>=carga.sequencia) then
    raise exception using errcode='PR409', message='sequencia_obsoleta';
  end if;
  if exists(select 1 from public.paginas_scc p cross join lateral jsonb_array_elements(p.dados) item
    where p.restaurante_id=p_restaurante_id and p.id_envio=p_id_envio
    group by item->>'codigo_produto' having count(*)>1) then
    raise exception using errcode='PR422', message='carga_scc_invalida';
  end if;
  for linha in select item from public.paginas_scc p cross join lateral jsonb_array_elements(p.dados) with ordinality as linhas(item,ordem)
    where p.restaurante_id=p_restaurante_id and p.id_envio=p_id_envio order by p.numero,linhas.ordem
  loop
    insert into public.produtos_scc (restaurante_id,codigo_produto,produto,codigo_grupo,grupo,preco_custo_atual,ativo,alterado_em)
      values (p_restaurante_id,linha->>'codigo_produto',linha->>'produto',linha->>'codigo_grupo',linha->>'grupo',
        (linha->>'preco_custo_atual')::numeric,(linha->>'ativo')::boolean,(linha->>'alterado_em')::timestamptz)
    on conflict (restaurante_id,codigo_produto) do update set produto=excluded.produto,codigo_grupo=excluded.codigo_grupo,
      grupo=excluded.grupo,preco_custo_atual=excluded.preco_custo_atual,ativo=excluded.ativo,alterado_em=excluded.alterado_em;
    get diagnostics afetadas = row_count;
    if afetadas <> 1 then raise exception using errcode='PR422', message='carga_scc_invalida'; end if;
  end loop;
  insert into public.cursores_scc(restaurante_id,tipo_envio,chave_escopo,sequencia,id_envio)
    values(p_restaurante_id,'cadastro_produtos','cadastro_produtos',carga.sequencia,p_id_envio)
    on conflict (restaurante_id,tipo_envio,chave_escopo) do update set sequencia=excluded.sequencia,id_envio=excluded.id_envio;
  v_recibo := jsonb_build_object('ok',true,'estado','publicada','tipo_envio',carga.tipo_envio,'id_envio',p_id_envio,'sequencia',carga.sequencia::text);
  update public.cargas_scc set estado='publicada',publicada_em=now(),atualizada_em=now(),recibo=v_recibo
    where restaurante_id=p_restaurante_id and id_envio=p_id_envio and estado='recebendo';
  get diagnostics afetadas = row_count;
  if afetadas <> 1 then raise exception using errcode='PR422', message='carga_scc_invalida'; end if;
  return v_recibo;
end;
$$;

revoke all on function public.publicar_carga_scc_v2(uuid,uuid) from public, anon, authenticated;
grant execute on function public.publicar_carga_scc_v2(uuid,uuid) to service_role;

commit;

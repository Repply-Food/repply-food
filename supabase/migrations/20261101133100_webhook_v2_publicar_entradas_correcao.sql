begin;

create or replace function public.publicar_entradas_scc_v2(p_restaurante_id uuid, p_id_envio uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  carga public.cargas_scc%rowtype;
  entradas jsonb;
  envelope jsonb;
  v_recibo jsonb;
  alteradas integer;
begin
  if p_restaurante_id is null or p_id_envio is null then
    raise exception using errcode='PR422', message='carga_scc_invalida';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text,0));
  select * into carga from public.cargas_scc
    where restaurante_id=p_restaurante_id and id_envio=p_id_envio for update;
  if not found or carga.tipo_envio <> 'entradas' or carga.estado <> 'recebendo' then
    raise exception using errcode='PR422', message='carga_scc_invalida';
  end if;
  perform public.revalidar_carga_scc_v2(p_restaurante_id,p_id_envio);
  if exists(select 1 from public.cursores_scc c where c.restaurante_id=p_restaurante_id
    and c.tipo_envio='entradas' and c.chave_escopo='entradas' and c.sequencia>=carga.sequencia) then
    raise exception using errcode='PR409', message='sequencia_obsoleta';
  end if;
  if exists(select 1 from public.cargas_scc c where c.restaurante_id=p_restaurante_id
    and c.tipo_envio='entradas' and c.publicada_em > clock_timestamp()-interval '20 seconds') then
    raise exception using errcode='PR429', message='ritmo_entradas';
  end if;
  select coalesce(jsonb_agg(item order by p.numero, itens.ordem),'[]'::jsonb) into entradas
    from public.paginas_scc p cross join lateral jsonb_array_elements(p.dados) with ordinality itens(item,ordem)
    where p.restaurante_id=p_restaurante_id and p.id_envio=p_id_envio;
  if exists(select 1 from jsonb_array_elements(entradas) item group by item->>'codEntrada' having count(*)>1) then
    raise exception using errcode='PR422', message='carga_scc_invalida';
  end if;
  envelope := jsonb_build_object('versao_formato',2,'versao_scc',carga.versao_scc,'enviado_em',carga.manifesto->'enviado_em',
    'modo','janela','janela',carga.manifesto->'janela','lote',jsonb_build_object('numero',1,'total',1),'entradas',entradas);
  begin
    perform public.processar_envio(p_restaurante_id,envelope,array[]::text[]);
  exception when numeric_value_out_of_range or invalid_text_representation or datetime_field_overflow then
    raise exception using errcode='PR422', message='carga_scc_invalida';
  end;
  insert into public.cursores_scc(restaurante_id,tipo_envio,chave_escopo,sequencia,id_envio)
    values(p_restaurante_id,'entradas','entradas',carga.sequencia,p_id_envio)
    on conflict (restaurante_id,tipo_envio,chave_escopo) do update set sequencia=excluded.sequencia,id_envio=excluded.id_envio;
  v_recibo := jsonb_build_object('ok',true,'estado','publicada','tipo_envio','entradas','id_envio',p_id_envio,'sequencia',carga.sequencia::text);
  update public.cargas_scc set estado='publicada',publicada_em=clock_timestamp(),atualizada_em=now(),recibo=v_recibo
    where restaurante_id=p_restaurante_id and id_envio=p_id_envio and estado='recebendo';
  get diagnostics alteradas = row_count;
  if alteradas <> 1 then raise exception using errcode='PR422', message='carga_scc_invalida'; end if;
  return v_recibo;
end;
$$;

revoke all on function public.publicar_entradas_scc_v2(uuid,uuid) from public, anon, authenticated, service_role;

commit;

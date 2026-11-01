begin;

create function public.publicar_comissoes_caixa_scc_v2(p_restaurante_id uuid, p_id_envio uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  carga public.cargas_scc%rowtype;
  anterior uuid;
  linha jsonb;
  posicao integer := 0;
  v_revisao bigint;
  v_recibo jsonb;
  afetadas integer;
begin
  if p_restaurante_id is null or p_id_envio is null then
    raise exception using errcode='PR422', message='carga_scc_invalida';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text,0));
  select * into carga from public.cargas_scc where restaurante_id=p_restaurante_id and id_envio=p_id_envio for update;
  if not found or carga.tipo_envio not in ('comissoes','movimentos_caixa') or carga.estado <> 'recebendo' then
    raise exception using errcode='PR422', message='carga_scc_invalida';
  end if;
  perform public.revalidar_carga_scc_v2(p_restaurante_id,p_id_envio);
  if exists(select 1 from public.cursores_scc c where c.restaurante_id=p_restaurante_id
    and c.tipo_envio=carga.tipo_envio and c.chave_escopo=carga.chave_escopo and c.sequencia>=carga.sequencia) then
    raise exception using errcode='PR409', message='sequencia_obsoleta';
  end if;
  select id_envio into anterior from public.fotografias_scc where restaurante_id=p_restaurante_id
    and tipo_envio=carga.tipo_envio and dia_movimento=carga.dia_movimento and fonte=carga.fonte for update;
  if carga.tipo_envio='comissoes' then
    delete from public.comissoes_scc where restaurante_id=p_restaurante_id and tipo_envio=carga.tipo_envio
      and dia_movimento=carga.dia_movimento and fonte=carga.fonte;
  else
    delete from public.movimentos_caixa_scc where restaurante_id=p_restaurante_id and tipo_envio=carga.tipo_envio
      and dia_movimento=carga.dia_movimento and fonte=carga.fonte;
  end if;
  insert into public.fotografias_scc(restaurante_id,tipo_envio,dia_movimento,fonte,id_envio,sequencia,natureza,recursos,quantidade,capturado_em)
    values(p_restaurante_id,carga.tipo_envio,carga.dia_movimento,carga.fonte,p_id_envio,carga.sequencia,carga.natureza,carga.recursos,carga.total_registros,carga.enviado_em)
    on conflict(restaurante_id,tipo_envio,dia_movimento,fonte) do update set id_envio=excluded.id_envio,sequencia=excluded.sequencia,
      natureza=excluded.natureza,recursos=excluded.recursos,quantidade=excluded.quantidade,capturado_em=excluded.capturado_em,publicado_em=now();
  begin
    for linha in select item from public.paginas_scc p cross join lateral jsonb_array_elements(p.dados) with ordinality itens(item,ordem)
      where p.restaurante_id=p_restaurante_id and p.id_envio=p_id_envio order by p.numero,itens.ordem
    loop
      posicao := posicao+1;
      if carga.tipo_envio='comissoes' then
        insert into public.comissoes_scc(restaurante_id,dia_movimento,fonte,posicao,codigo_operador,operador,funcao,vendas_elegiveis,comissao_oficial)
          values(p_restaurante_id,carga.dia_movimento,carga.fonte,posicao,linha->>'codigo_operador',linha->>'operador',linha->>'funcao',
            (linha->>'vendas_elegiveis')::numeric,(linha->>'comissao_oficial')::numeric);
      else
        insert into public.movimentos_caixa_scc(restaurante_id,dia_movimento,fonte,posicao,codigo_lancamento,momento,codigo_operador,operador,tipo,codigo_categoria,categoria,valor)
          values(p_restaurante_id,carga.dia_movimento,carga.fonte,posicao,linha->>'codigo_lancamento',(linha->>'momento')::timestamptz,
            linha->>'codigo_operador',linha->>'operador',linha->>'tipo',linha->>'codigo_categoria',linha->>'categoria',(linha->>'valor')::numeric);
      end if;
    end loop;
  exception when unique_violation or numeric_value_out_of_range or invalid_text_representation or datetime_field_overflow then
    raise exception using errcode='PR422', message='carga_scc_invalida';
  end;
  if anterior is not null and anterior<>p_id_envio then
    update public.cargas_scc set estado='substituida',atualizada_em=now()
      where restaurante_id=p_restaurante_id and id_envio=anterior and estado='publicada';
    get diagnostics afetadas = row_count;
    if afetadas<>1 then raise exception using errcode='PR422', message='carga_scc_invalida'; end if;
  end if;
  insert into public.cursores_scc(restaurante_id,tipo_envio,chave_escopo,sequencia,id_envio)
    values(p_restaurante_id,carga.tipo_envio,carga.chave_escopo,carga.sequencia,p_id_envio)
    on conflict(restaurante_id,tipo_envio,chave_escopo) do update set sequencia=excluded.sequencia,id_envio=excluded.id_envio;
  insert into public.revisoes_scc as r(restaurante_id,revisao) values(p_restaurante_id,1)
    on conflict(restaurante_id) do update set revisao=r.revisao+1 returning revisao into v_revisao;
  v_recibo := jsonb_build_object('ok',true,'estado','publicada','tipo_envio',carga.tipo_envio,'id_envio',p_id_envio,
    'sequencia',carga.sequencia::text,'dia_movimento',carga.dia_movimento,'fonte',carga.fonte,'revisao',v_revisao);
  update public.cargas_scc set estado='publicada',publicada_em=clock_timestamp(),atualizada_em=now(),recibo=v_recibo
    where restaurante_id=p_restaurante_id and id_envio=p_id_envio and estado='recebendo';
  get diagnostics afetadas = row_count;
  if afetadas<>1 then raise exception using errcode='PR422', message='carga_scc_invalida'; end if;
  return v_recibo;
end;
$$;

revoke all on function public.publicar_comissoes_caixa_scc_v2(uuid,uuid) from public, anon, authenticated, service_role;

commit;

begin;

create function public.publicar_financeiro_scc_v2(p_restaurante_id uuid, p_id_envio uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  carga public.cargas_scc%rowtype;
  anterior uuid;
  linha jsonb;
  item jsonb;
  posicao integer;
  v_revisao bigint;
  v_recibo jsonb;
  afetadas integer;
begin
  if p_restaurante_id is null or p_id_envio is null then raise exception using errcode='PR422',message='carga_scc_invalida'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text,0));
  select * into carga from public.cargas_scc where restaurante_id=p_restaurante_id and id_envio=p_id_envio for update;
  if not found or carga.tipo_envio <> 'financeiro' or carga.estado <> 'recebendo' then raise exception using errcode='PR422',message='carga_scc_invalida'; end if;
  perform public.revalidar_carga_scc_v2(p_restaurante_id,p_id_envio);
  if exists(select 1 from public.cursores_scc c where c.restaurante_id=p_restaurante_id and c.tipo_envio='financeiro'
    and c.chave_escopo=carga.chave_escopo and c.sequencia>=carga.sequencia) then raise exception using errcode='PR409',message='sequencia_obsoleta'; end if;
  select id_envio into anterior from public.fotografias_scc where restaurante_id=p_restaurante_id and tipo_envio='financeiro'
    and dia_movimento=carga.dia_movimento and fonte=carga.fonte for update;
  delete from public.financeiro_meios_scc where restaurante_id=p_restaurante_id and tipo_envio='financeiro' and dia_movimento=carga.dia_movimento and fonte=carga.fonte;
  delete from public.financeiro_publico_scc where restaurante_id=p_restaurante_id and tipo_envio='financeiro' and dia_movimento=carga.dia_movimento and fonte=carga.fonte;
  delete from public.financeiro_scc where restaurante_id=p_restaurante_id and tipo_envio='financeiro' and dia_movimento=carga.dia_movimento and fonte=carga.fonte;
  insert into public.fotografias_scc(restaurante_id,tipo_envio,dia_movimento,fonte,id_envio,sequencia,natureza,recursos,quantidade,capturado_em)
    values(p_restaurante_id,'financeiro',carga.dia_movimento,carga.fonte,p_id_envio,carga.sequencia,carga.natureza,carga.recursos,carga.total_registros,carga.enviado_em)
    on conflict(restaurante_id,tipo_envio,dia_movimento,fonte) do update set id_envio=excluded.id_envio,sequencia=excluded.sequencia,
      natureza=excluded.natureza,recursos=excluded.recursos,quantidade=excluded.quantidade,capturado_em=excluded.capturado_em,publicado_em=now();
  begin
    select p.dados->0 into linha from public.paginas_scc p where p.restaurante_id=p_restaurante_id and p.id_envio=p_id_envio and p.numero=1;
    if linha is not null then
      insert into public.financeiro_scc(restaurante_id,dia_movimento,fonte,consumo,servico,complemento,taxas_entrada,produto_embutido,flyers,
        projetado,recebido,notas_assinadas,descontos,habilitados,reabilitados,encerrados,abertos)
      values(p_restaurante_id,carga.dia_movimento,carga.fonte,(linha->'componentes'->>'consumo')::numeric,(linha->'componentes'->>'servico')::numeric,
        (linha->'componentes'->>'complemento')::numeric,(linha->'componentes'->>'taxas_entrada')::numeric,(linha->'componentes'->>'produto_embutido')::numeric,
        (linha->'componentes'->>'flyers')::numeric,(linha->'totais_oficiais'->>'projetado')::numeric,(linha->'totais_oficiais'->>'recebido')::numeric,
        (linha->'totais_oficiais'->>'notas_assinadas')::numeric,(linha->'totais_oficiais'->>'descontos')::numeric,(linha->'entradas'->>'habilitados')::integer,
        (linha->'entradas'->>'reabilitados')::integer,(linha->'entradas'->>'encerrados')::integer,(linha->'entradas'->>'abertos')::integer);
      posicao := 0;
      for item in select value from jsonb_array_elements(linha->'meios') loop
        posicao := posicao+1;
        insert into public.financeiro_meios_scc(restaurante_id,dia_movimento,fonte,posicao,codigo,rotulo,classe,valor)
          values(p_restaurante_id,carga.dia_movimento,carga.fonte,posicao,item->>'codigo',item->>'rotulo',item->>'classe',(item->>'valor')::numeric);
      end loop;
      posicao := 0;
      for item in select value from jsonb_array_elements(linha->'publico') loop
        posicao := posicao+1;
        insert into public.financeiro_publico_scc(restaurante_id,dia_movimento,fonte,posicao,sexo,categoria,quantidade)
          values(p_restaurante_id,carga.dia_movimento,carga.fonte,posicao,item->>'sexo',item->>'categoria',(item->>'quantidade')::integer);
      end loop;
    end if;
  exception when unique_violation or numeric_value_out_of_range or invalid_text_representation then
    raise exception using errcode='PR422',message='carga_scc_invalida';
  end;
  if anterior is not null and anterior<>p_id_envio then
    update public.cargas_scc set estado='substituida',atualizada_em=now() where restaurante_id=p_restaurante_id and id_envio=anterior and estado='publicada';
    get diagnostics afetadas = row_count;
    if afetadas<>1 then raise exception using errcode='PR422',message='carga_scc_invalida'; end if;
  end if;
  insert into public.cursores_scc(restaurante_id,tipo_envio,chave_escopo,sequencia,id_envio)
    values(p_restaurante_id,'financeiro',carga.chave_escopo,carga.sequencia,p_id_envio)
    on conflict(restaurante_id,tipo_envio,chave_escopo) do update set sequencia=excluded.sequencia,id_envio=excluded.id_envio;
  insert into public.revisoes_scc as r(restaurante_id,revisao) values(p_restaurante_id,1)
    on conflict(restaurante_id) do update set revisao=r.revisao+1 returning revisao into v_revisao;
  v_recibo := jsonb_build_object('ok',true,'estado','publicada','tipo_envio','financeiro','id_envio',p_id_envio,
    'sequencia',carga.sequencia::text,'dia_movimento',carga.dia_movimento,'fonte',carga.fonte,'revisao',v_revisao);
  update public.cargas_scc set estado='publicada',publicada_em=clock_timestamp(),atualizada_em=now(),recibo=v_recibo
    where restaurante_id=p_restaurante_id and id_envio=p_id_envio and estado='recebendo';
  get diagnostics afetadas = row_count;
  if afetadas<>1 then raise exception using errcode='PR422',message='carga_scc_invalida'; end if;
  return v_recibo;
end;
$$;

revoke all on function public.publicar_financeiro_scc_v2(uuid,uuid) from public, anon, authenticated, service_role;

commit;

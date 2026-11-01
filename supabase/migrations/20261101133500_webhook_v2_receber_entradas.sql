begin;

create or replace function public.receber_pagina_scc_v2(p_restaurante_id uuid, p_pagina jsonb)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  carga public.cargas_scc%rowtype;
  pagina_existente public.paginas_scc%rowtype;
  manifesto_atual jsonb;
  id_atual uuid;
  numero_atual integer;
  total_paginas integer;
  total_registros integer;
  tamanho integer;
  quantidade integer;
  hash_atual text;
  escopo text;
  recebidas integer;
  soma bigint;
  repetida boolean := false;
begin
  if p_restaurante_id is null then raise exception using errcode='PR422', message='casa_invalida'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text,0));
  if not exists(select 1 from public.restaurantes where id=p_restaurante_id) then
    raise exception using errcode='PR422', message='casa_invalida';
  end if;
  perform public.validar_pagina_scc_v2(p_pagina);
  id_atual := (p_pagina->>'id_envio')::uuid;
  numero_atual := (p_pagina->'pagina'->>'numero')::numeric::integer;
  total_paginas := (p_pagina->'pagina'->>'total')::numeric::integer;
  total_registros := (p_pagina->>'total_registros')::numeric::integer;
  quantidade := jsonb_array_length(p_pagina->'dados');
  tamanho := octet_length(convert_to(p_pagina::text,'UTF8'));
  hash_atual := encode(extensions.digest(convert_to((p_pagina->'dados')::text,'UTF8'),'sha256'),'hex');
  manifesto_atual := jsonb_set(p_pagina - 'dados', '{pagina}', jsonb_build_object('total',total_paginas));
  escopo := case when p_pagina->>'tipo_envio' in ('entradas','cadastro_produtos') then p_pagina->>'tipo_envio'
    else (p_pagina->>'dia_movimento') || '|' || (p_pagina->>'fonte') end;
  select * into carga from public.cargas_scc where restaurante_id=p_restaurante_id and id_envio=id_atual;
  if found then
    if carga.manifesto is distinct from manifesto_atual then
      raise exception using errcode='PR409', message='manifesto_divergente';
    end if;
    select * into pagina_existente from public.paginas_scc
      where restaurante_id=p_restaurante_id and id_envio=id_atual and numero=numero_atual;
    if found then
      if pagina_existente.hash <> hash_atual or (pagina_existente.dados is distinct from p_pagina->'dados' and (pagina_existente.dados is not null or carga.estado = 'recebendo')) then
        raise exception using errcode='PR409', message='pagina_divergente';
      end if;
      if carga.estado='expirada' then raise exception using errcode='PR409', message='carga_expirada'; end if;
      repetida := true;
    elsif carga.estado <> 'recebendo' then
      raise exception using errcode='PR409', message='carga_encerrada';
    end if;
  else
    if exists(select 1 from public.cursores_scc c where c.restaurante_id=p_restaurante_id
      and c.tipo_envio=p_pagina->>'tipo_envio' and c.chave_escopo=escopo
      and c.sequencia >= (p_pagina->>'sequencia')::bigint)
      or exists(select 1 from public.cargas_scc c where c.restaurante_id=p_restaurante_id
        and c.tipo_envio=p_pagina->>'tipo_envio' and c.chave_escopo=escopo
        and c.sequencia=(p_pagina->>'sequencia')::bigint) then
      raise exception using errcode='PR409', message='sequencia_obsoleta';
    end if;
    if (select count(*) from public.cargas_scc where restaurante_id=p_restaurante_id and estado='recebendo') >= 10 then
      raise exception using errcode='PR429', message='limite_cargas_abertas';
    end if;
    insert into public.cargas_scc (restaurante_id,id_envio,tipo_envio,modo,sequencia,natureza,versao_scc,enviado_em,
      janela_desde,janela_ate,dia_movimento,fonte,recursos,total_paginas,total_registros,manifesto)
    values (p_restaurante_id,id_atual,p_pagina->>'tipo_envio',p_pagina->>'modo',(p_pagina->>'sequencia')::bigint,
      p_pagina->>'natureza',p_pagina->>'versao_scc',(p_pagina->>'enviado_em')::timestamptz,
      (p_pagina->'janela'->>'desde')::date,(p_pagina->'janela'->>'ate')::date,(p_pagina->>'dia_movimento')::date,
      p_pagina->>'fonte',case when p_pagina ? 'recursos' then array(select jsonb_array_elements_text(p_pagina->'recursos')) else array[]::text[] end,
      total_paginas,total_registros,manifesto_atual)
    returning * into carga;
  end if;
  if not repetida then
    if carga.bytes_recebidos + tamanho > 33554432 then raise exception using errcode='PR413', message='limite_bytes_carga'; end if;
    insert into public.paginas_scc(restaurante_id,id_envio,numero,hash,quantidade,bytes,dados)
      values(p_restaurante_id,id_atual,numero_atual,hash_atual,quantidade,tamanho,p_pagina->'dados');
    update public.cargas_scc set bytes_recebidos=bytes_recebidos+tamanho,atualizada_em=now()
      where restaurante_id=p_restaurante_id and id_envio=id_atual;
    select count(*),coalesce(sum(public.paginas_scc.quantidade),0) into recebidas,soma from public.paginas_scc
      where restaurante_id=p_restaurante_id and id_envio=id_atual;
    if recebidas=total_paginas then
      if soma <> total_registros then raise exception using errcode='PR422', message='contagem_divergente'; end if;
      if carga.tipo_envio = 'cadastro_produtos' then
        perform public.publicar_carga_scc_v2(p_restaurante_id,id_atual);
      elsif carga.tipo_envio = 'entradas' then
        perform public.publicar_entradas_scc_v2(p_restaurante_id,id_atual);
      else
        raise exception using errcode='PR503', message='publicacao_indisponivel';
      end if;
      carga.estado := 'publicada';
    end if;
  end if;
  return jsonb_strip_nulls(jsonb_build_object('ok',true,'estado',case when carga.estado in ('publicada','substituida') then 'publicada' else 'recebendo' end,
    'tipo_envio',carga.tipo_envio,'id_envio',id_atual,'pagina',numero_atual,'repetida',repetida,'sequencia',carga.sequencia::text,
    'dia_movimento',carga.dia_movimento,'fonte',carga.fonte));
end;
$$;

revoke all on function public.receber_pagina_scc_v2(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.receber_pagina_scc_v2(uuid,jsonb) to service_role;

commit;

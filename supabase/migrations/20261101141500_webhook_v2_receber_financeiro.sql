begin;

alter function public.receber_pagina_scc_v2(uuid,jsonb) rename to receber_pagina_scc_v2_base;
revoke all on function public.receber_pagina_scc_v2_base(uuid,jsonb) from public, anon, authenticated, service_role;

create function public.receber_pagina_scc_v2(p_restaurante_id uuid, p_pagina jsonb)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  carga public.cargas_scc%rowtype;
  pagina public.paginas_scc%rowtype;
  id_atual uuid;
  manifesto jsonb;
  hash_atual text;
  tamanho integer;
  escopo text;
  publicacao jsonb;
  repetida boolean := false;
begin
  if p_pagina->>'tipo_envio' is distinct from 'financeiro' then
    return public.receber_pagina_scc_v2_base(p_restaurante_id,p_pagina);
  end if;
  if p_restaurante_id is null then raise exception using errcode='PR422',message='casa_invalida'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text,0));
  if not exists(select 1 from public.restaurantes where id=p_restaurante_id) then raise exception using errcode='PR422',message='casa_invalida'; end if;
  perform public.validar_pagina_scc_v2(p_pagina);
  id_atual := (p_pagina->>'id_envio')::uuid;
  manifesto := jsonb_set(p_pagina-'dados','{pagina}',jsonb_build_object('total',1));
  hash_atual := encode(extensions.digest(convert_to((p_pagina->'dados')::text,'UTF8'),'sha256'),'hex');
  tamanho := octet_length(convert_to(p_pagina::text,'UTF8'));
  escopo := (p_pagina->>'dia_movimento') || '|' || (p_pagina->>'fonte');
  select * into carga from public.cargas_scc where restaurante_id=p_restaurante_id and id_envio=id_atual;
  if found then
    if carga.manifesto is distinct from manifesto then raise exception using errcode='PR409',message='manifesto_divergente'; end if;
    select * into pagina from public.paginas_scc where restaurante_id=p_restaurante_id and id_envio=id_atual and numero=1;
    if not found then raise exception using errcode='PR409',message='carga_encerrada'; end if;
    if pagina.hash<>hash_atual or (pagina.dados is distinct from p_pagina->'dados' and (pagina.dados is not null or carga.estado='recebendo')) then
      raise exception using errcode='PR409',message='pagina_divergente';
    end if;
    if carga.estado='expirada' then raise exception using errcode='PR409',message='carga_expirada'; end if;
    repetida := true;
  else
    if exists(select 1 from public.cursores_scc c where c.restaurante_id=p_restaurante_id and c.tipo_envio='financeiro'
      and c.chave_escopo=escopo and c.sequencia >= (p_pagina->>'sequencia')::bigint)
      or exists(select 1 from public.cargas_scc c where c.restaurante_id=p_restaurante_id and c.tipo_envio='financeiro'
        and c.chave_escopo=escopo and c.sequencia=(p_pagina->>'sequencia')::bigint) then
      raise exception using errcode='PR409',message='sequencia_obsoleta';
    end if;
    if (select count(*) from public.cargas_scc where restaurante_id=p_restaurante_id and estado='recebendo')>=10 then
      raise exception using errcode='PR429',message='limite_cargas_abertas';
    end if;
    insert into public.cargas_scc(restaurante_id,id_envio,tipo_envio,modo,sequencia,natureza,versao_scc,enviado_em,dia_movimento,fonte,recursos,total_paginas,total_registros,manifesto,bytes_recebidos)
      values(p_restaurante_id,id_atual,'financeiro','fotografia',(p_pagina->>'sequencia')::bigint,p_pagina->>'natureza',p_pagina->>'versao_scc',
        (p_pagina->>'enviado_em')::timestamptz,(p_pagina->>'dia_movimento')::date,p_pagina->>'fonte',array(select jsonb_array_elements_text(p_pagina->'recursos')),
        1,(p_pagina->>'total_registros')::numeric::integer,manifesto,tamanho) returning * into carga;
    insert into public.paginas_scc(restaurante_id,id_envio,numero,hash,quantidade,bytes,dados)
      values(p_restaurante_id,id_atual,1,hash_atual,jsonb_array_length(p_pagina->'dados'),tamanho,p_pagina->'dados');
    publicacao := public.publicar_financeiro_scc_v2(p_restaurante_id,id_atual);
    carga.estado := 'publicada';
  end if;
  return jsonb_strip_nulls(jsonb_build_object('ok',true,'estado',case when carga.estado in ('publicada','substituida') then 'publicada' else 'recebendo' end,
    'tipo_envio','financeiro','id_envio',id_atual,'pagina',1,'repetida',repetida,'sequencia',carga.sequencia::text,
    'dia_movimento',carga.dia_movimento,'fonte',carga.fonte,'revisao',coalesce(publicacao,carga.recibo)->'revisao'));
end;
$$;

revoke all on function public.receber_pagina_scc_v2(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.receber_pagina_scc_v2(uuid,jsonb) to service_role;

commit;

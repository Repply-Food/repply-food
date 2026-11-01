begin;

create function public.revalidar_carga_scc_v2(p_restaurante_id uuid, p_id_envio uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  carga public.cargas_scc%rowtype;
  pagina public.paginas_scc%rowtype;
  envelope jsonb;
  numero integer := 0;
  soma bigint := 0;
  bytes_total bigint := 0;
  recursos text[];
begin
  if p_restaurante_id is null or p_id_envio is null then
    raise exception using errcode='PR422', message='carga_scc_invalida';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text,0));
  begin
    select * into carga from public.cargas_scc
      where restaurante_id=p_restaurante_id and id_envio=p_id_envio for update;
    if not found or carga.estado <> 'recebendo' or jsonb_typeof(carga.manifesto) is distinct from 'object' then
      raise exception 'invalido';
    end if;
    recursos := case when carga.manifesto ? 'recursos'
      then array(select jsonb_array_elements_text(carga.manifesto->'recursos')) else array[]::text[] end;
    if carga.tipo_envio is distinct from carga.manifesto->>'tipo_envio'
      or carga.modo is distinct from carga.manifesto->>'modo'
      or carga.sequencia is distinct from (carga.manifesto->>'sequencia')::bigint
      or carga.id_envio is distinct from (carga.manifesto->>'id_envio')::uuid
      or carga.natureza is distinct from carga.manifesto->>'natureza'
      or carga.versao_scc is distinct from carga.manifesto->>'versao_scc'
      or carga.enviado_em is distinct from (carga.manifesto->>'enviado_em')::timestamptz
      or carga.janela_desde is distinct from (carga.manifesto->'janela'->>'desde')::date
      or carga.janela_ate is distinct from (carga.manifesto->'janela'->>'ate')::date
      or carga.dia_movimento is distinct from (carga.manifesto->>'dia_movimento')::date
      or carga.fonte is distinct from carga.manifesto->>'fonte'
      or carga.recursos is distinct from recursos
      or carga.total_paginas is distinct from (carga.manifesto->'pagina'->>'total')::numeric
      or carga.total_registros is distinct from (carga.manifesto->>'total_registros')::numeric then
      raise exception 'invalido';
    end if;
    for pagina in select * from public.paginas_scc
      where restaurante_id=p_restaurante_id and id_envio=p_id_envio order by paginas_scc.numero for update
    loop
      numero := numero + 1;
      if pagina.numero <> numero or pagina.dados is null or jsonb_typeof(pagina.dados) is distinct from 'array' then
        raise exception 'invalido';
      end if;
      envelope := jsonb_set(carga.manifesto || jsonb_build_object('dados',pagina.dados),
        '{pagina,numero}',to_jsonb(pagina.numero),true);
      perform public.validar_pagina_scc_v2(envelope);
      if pagina.quantidade <> jsonb_array_length(pagina.dados)
        or pagina.bytes <> octet_length(convert_to(envelope::text,'UTF8'))
        or pagina.hash <> encode(extensions.digest(convert_to(pagina.dados::text,'UTF8'),'sha256'),'hex') then
        raise exception 'invalido';
      end if;
      soma := soma + pagina.quantidade;
      bytes_total := bytes_total + pagina.bytes;
    end loop;
    if numero <> carga.total_paginas or soma <> carga.total_registros
      or bytes_total <> carga.bytes_recebidos or bytes_total > 33554432 then
      raise exception 'invalido';
    end if;
  exception when others then
    raise exception using errcode='PR422', message='carga_scc_invalida';
  end;
end;
$$;

revoke all on function public.revalidar_carga_scc_v2(uuid,uuid) from public, anon, authenticated, service_role;

commit;

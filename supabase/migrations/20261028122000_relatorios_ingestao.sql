-- Fotografia só fica visível quando todas as páginas foram validadas.
begin;

-- O timestamp convertido não preserva o offset/texto original do manifesto.
alter table public.relatorio_cargas add column manifesto jsonb;
alter table public.relatorio_cargas add constraint relatorio_cargas_manifesto_objeto
  check (manifesto is null or jsonb_typeof(manifesto) = 'object');

create function public.receber_pagina_relatorio(p_restaurante_id uuid,p_pedido jsonb)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  m jsonb;
  c public.relatorio_cargas%rowtype;
  p public.relatorio_paginas%rowtype;
  linha jsonb;
  chave text;
  v_numero int;
  quantidade int;
  tamanho int;
  hash_pagina text;
  carga uuid;
  dia date;
  capturado timestamptz;
  v_sequencia bigint;
  paginas int;
  total int;
  recursos text[];
  permitidos text[];
  revisao_ativa bigint;
begin
  if p_restaurante_id is null then
    raise exception using errcode='PR422',message='casa_invalida';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text,0));
  if not exists(select 1 from public.restaurantes where id=p_restaurante_id) then
    raise exception using errcode='PR422',message='casa_invalida';
  end if;
  -- Bloco de conversão fechado: nenhum erro inclui o valor recebido.
  begin
    if jsonb_typeof(p_pedido) is distinct from 'object'
       or not (p_pedido ?& array['acao','manifesto','numero','linhas'])
       or (p_pedido - array['acao','manifesto','numero','linhas']) <> '{}'::jsonb
       or p_pedido->'acao' is distinct from '"pagina"'::jsonb then
      raise exception 'invalido';
    end if;
    m := p_pedido->'manifesto';
    if jsonb_typeof(m) is distinct from 'object'
       or not (m ?& array['versao_formato','carga_id','relatorio','dia_movimento','fonte',
         'sequencia','capturado_em','natureza','recursos','total_paginas','total_linhas'])
       or (m - array['versao_formato','carga_id','relatorio','dia_movimento','fonte',
         'sequencia','capturado_em','natureza','recursos','total_paginas','total_linhas']) <> '{}'::jsonb
       or m->'versao_formato' is distinct from '1'::jsonb then
      raise exception 'invalido';
    end if;
    foreach chave in array array['carga_id','relatorio','dia_movimento','fonte','sequencia','capturado_em','natureza'] loop
      if jsonb_typeof(m->chave) is distinct from 'string' then raise exception 'invalido'; end if;
    end loop;
    if (m->>'carga_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (m->>'sequencia') !~ '^[1-9][0-9]{0,18}$'
       or (m->>'dia_movimento') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or (m->>'capturado_em') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]+)?(Z|[+-](0[0-9]|1[0-5]):[0-5][0-9])$'
       or left(m->>'capturado_em',4) = '0000'
       or m->>'fonte' not in ('online','historico')
       or m->>'natureza' not in ('scc','simulacao') then raise exception 'invalido'; end if;
    carga := (m->>'carga_id')::uuid;
    v_sequencia := (m->>'sequencia')::bigint;
    dia := (m->>'dia_movimento')::date;
    if to_char(dia,'YYYY-MM-DD') <> m->>'dia_movimento' then raise exception 'invalido'; end if;
    -- Valida a data civil sem permitir que o cast normalize uma hora/data inválida.
    if to_char(substring(m->>'capturado_em' from 1 for 10)::date,'YYYY-MM-DD')
       <> substring(m->>'capturado_em' from 1 for 10) then raise exception 'invalido'; end if;
    capturado := (m->>'capturado_em')::timestamptz;
    foreach chave in array array['total_paginas','total_linhas'] loop
      if jsonb_typeof(m->chave) is distinct from 'number'
        or (m->>chave) !~ '^[0-9]+([.]0+)?$' then raise exception 'invalido'; end if;
    end loop;
    if jsonb_typeof(p_pedido->'numero') is distinct from 'number'
       or (p_pedido->>'numero') !~ '^[0-9]+([.]0+)?$'
       or jsonb_typeof(m->'recursos') is distinct from 'array'
       or jsonb_typeof(p_pedido->'linhas') is distinct from 'array' then raise exception 'invalido'; end if;
    paginas := (m->>'total_paginas')::numeric::int;
    total := (m->>'total_linhas')::numeric::int;
    v_numero := (p_pedido->>'numero')::numeric::int;
    quantidade := jsonb_array_length(p_pedido->'linhas');
    permitidos := case m->>'relatorio'
      when 'financeiro' then array[]::text[]
      when 'produtos' then array['pdv','grupo','garcom','mesa']
      when 'comissao' then array['operador']
      when 'caixa' then array['operador','tipo','categoria']
      when 'auditoria' then array['operador','tipo']
      when 'notas-assinadas' then array['cliente'] else null end;
    if permitidos is null then raise exception 'invalido'; end if;
    if exists(select 1 from jsonb_array_elements(m->'recursos') v where jsonb_typeof(v) <> 'string') then raise exception 'invalido'; end if;
    select coalesce(array_agg(v),array[]::text[]) into recursos from jsonb_array_elements_text(m->'recursos') v;
    if not (recursos <@ permitidos) or cardinality(recursos) <> (select count(distinct v) from unnest(recursos) v)
       or paginas not between 1 and 200 or total not between 0 and 100000
       or v_numero not between 1 and paginas or quantidade > 500
       or (paginas=1 and quantidade<>total)
       or (total=0 and (paginas<>1 or v_numero<>1 or quantidade<>0))
       or (m->>'relatorio'='financeiro' and (paginas<>1 or total not between 0 and 1)) then raise exception 'invalido'; end if;
  exception when others then
    raise exception using errcode='PR422',message='pedido_relatorio_invalido';
  end;
  tamanho := octet_length(convert_to(jsonb_build_object('acao','pagina','manifesto',m,
    'numero',v_numero,'linhas',p_pedido->'linhas')::text,'UTF8'));
  if tamanho>1048576 then raise exception using errcode='PR413',message='limite_bytes_pagina'; end if;
  for linha in select value from jsonb_array_elements(p_pedido->'linhas') loop
    perform public.validar_linha_relatorio(m->>'relatorio',linha);
  end loop;
  hash_pagina := encode(extensions.digest(convert_to((p_pedido->'linhas')::text,'UTF8'),'sha256'),'hex');
  select * into c from public.relatorio_cargas where restaurante_id=p_restaurante_id and id=carga;
  if found then
    if c.manifesto is distinct from m then
      raise exception using errcode='PR409',message='manifesto_divergente';
    end if;
    select * into p from public.relatorio_paginas where restaurante_id=p_restaurante_id and carga_id=carga and relatorio_paginas.numero=v_numero;
    if found then
      if p.hash<>hash_pagina or (p.dados is not null and p.dados is distinct from p_pedido->'linhas') then
        raise exception using errcode='PR409',message='pagina_conflitante';
      end if;
      if c.estado='expirada' then raise exception using errcode='PR409',message='carga_expirada'; end if;
      return jsonb_build_object('ok',true,'estado',case when c.revisao_publicada is not null then 'publicada' else 'recebendo' end,
        'carga_id',carga,'pagina',v_numero,'repetida',true);
    end if;
    if c.estado<>'recebendo' then raise exception using errcode='PR409',message='carga_expirada'; end if;
  else
    select sequencia into revisao_ativa from public.relatorio_publicacoes
      where restaurante_id=p_restaurante_id and relatorio=m->>'relatorio' and dia_movimento=dia and fonte=m->>'fonte';
    if v_sequencia<=revisao_ativa or exists(select 1 from public.relatorio_cargas r
      where r.restaurante_id=p_restaurante_id and r.relatorio=m->>'relatorio' and r.dia_movimento=dia and r.fonte=m->>'fonte' and r.sequencia=v_sequencia) then
      raise exception using errcode='PR409',message='sequencia_obsoleta';
    end if;
    if (select count(*) from public.relatorio_cargas where restaurante_id=p_restaurante_id and estado='recebendo')>=10 then
      raise exception using errcode='PR413',message='limite_cargas_abertas';
    end if;
    insert into public.relatorio_cargas(restaurante_id,id,relatorio,dia_movimento,fonte,sequencia,capturado_em,natureza,recursos,total_paginas,total_linhas,estado,manifesto)
      values(p_restaurante_id,carga,m->>'relatorio',dia,m->>'fonte',v_sequencia,capturado,m->>'natureza',recursos,paginas,total,'recebendo',m)
      returning * into c;
  end if;
  if c.bytes_recebidos+tamanho>33554432 then raise exception using errcode='PR413',message='limite_bytes_carga'; end if;
  insert into public.relatorio_paginas(restaurante_id,carga_id,numero,dados,hash,quantidade,bytes)
    values(p_restaurante_id,carga,v_numero,p_pedido->'linhas',hash_pagina,quantidade,tamanho);
  update public.relatorio_cargas set bytes_recebidos=bytes_recebidos+tamanho where restaurante_id=p_restaurante_id and id=carga;
  return jsonb_build_object('ok',true,'estado','recebendo','carga_id',carga,'pagina',v_numero,'repetida',false);
end;
$$;

create function public.publicar_relatorio(p_restaurante_id uuid,p_carga_id uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  c public.relatorio_cargas%rowtype;
  ativa public.relatorio_publicacoes%rowtype;
  pagina public.relatorio_paginas%rowtype;
  linha jsonb;
  bytes_pagina int;
  quantidade_paginas int;
  quantidade_linhas bigint;
  bytes_total bigint;
  menor int;
  maior int;
  v_revisao bigint;
begin
  if p_restaurante_id is null then raise exception using errcode='PR422',message='casa_invalida'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text,0));
  select * into c from public.relatorio_cargas where restaurante_id=p_restaurante_id and id=p_carga_id;
  if not found then raise exception using errcode='PR422',message='carga_nao_encontrada'; end if;
  if c.revisao_publicada is not null and c.estado in ('publicada','substituida') then
    return jsonb_build_object('ok',true,'estado','publicada','carga_id',c.id,'revisao',c.revisao_publicada::text);
  end if;
  if c.estado<>'recebendo' then raise exception using errcode='PR409',message='carga_expirada'; end if;
  select * into ativa from public.relatorio_publicacoes where restaurante_id=c.restaurante_id
    and relatorio=c.relatorio and dia_movimento=c.dia_movimento and fonte=c.fonte;
  if found and c.sequencia<=ativa.sequencia then raise exception using errcode='PR409',message='sequencia_obsoleta'; end if;
  select count(*),min(numero),max(numero),coalesce(sum(quantidade),0),coalesce(sum(bytes),0)
    into quantidade_paginas,menor,maior,quantidade_linhas,bytes_total
    from public.relatorio_paginas where restaurante_id=c.restaurante_id and carga_id=c.id;
  if quantidade_paginas<>c.total_paginas or menor<>1 or maior<>c.total_paginas
     or quantidade_linhas<>c.total_linhas then raise exception using errcode='PR422',message='carga_incompleta'; end if;
  if c.total_linhas=0 and c.total_paginas<>1 then raise exception using errcode='PR422',message='pedido_relatorio_invalido'; end if;
  if bytes_total>33554432 or bytes_total<>c.bytes_recebidos then raise exception using errcode='PR413',message='limite_bytes_carga'; end if;
  if c.relatorio='financeiro' and c.total_linhas not between 0 and 1 then raise exception using errcode='PR422',message='pedido_relatorio_invalido'; end if;
  for pagina in select * from public.relatorio_paginas where restaurante_id=c.restaurante_id and carga_id=c.id loop
    if pagina.dados is null then raise exception using errcode='PR422',message='carga_incompleta'; end if;
    for linha in select value from jsonb_array_elements(pagina.dados) loop
      perform public.validar_linha_relatorio(c.relatorio,linha);
    end loop;
    bytes_pagina := octet_length(convert_to(jsonb_build_object('acao','pagina','manifesto',c.manifesto,'numero',pagina.numero,'linhas',pagina.dados)::text,'UTF8'));
    if bytes_pagina>1048576 or bytes_pagina<>pagina.bytes then
      raise exception using errcode='PR413',message='limite_bytes_pagina';
    end if;
    if pagina.hash<>encode(extensions.digest(convert_to(pagina.dados::text,'UTF8'),'sha256'),'hex') then
      raise exception using errcode='PR409',message='pagina_conflitante';
    end if;
  end loop;
  delete from public.relatorio_linhas where restaurante_id=c.restaurante_id and relatorio=c.relatorio and dia_movimento=c.dia_movimento and fonte=c.fonte;
  insert into public.relatorio_publicacoes(restaurante_id,relatorio,dia_movimento,fonte,carga_id,sequencia,capturado_em,natureza,recursos,quantidade)
    values(c.restaurante_id,c.relatorio,c.dia_movimento,c.fonte,c.id,c.sequencia,c.capturado_em,c.natureza,c.recursos,c.total_linhas)
    on conflict(restaurante_id,relatorio,dia_movimento,fonte) do update set
      carga_id=excluded.carga_id,sequencia=excluded.sequencia,capturado_em=excluded.capturado_em,
      publicada_em=now(),natureza=excluded.natureza,recursos=excluded.recursos,quantidade=excluded.quantidade;
  insert into public.relatorio_linhas(restaurante_id,relatorio,dia_movimento,fonte,posicao,dados)
    select c.restaurante_id,c.relatorio,c.dia_movimento,c.fonte,(p.numero-1)*500+x.ord::int,x.linha
      from public.relatorio_paginas p cross join lateral jsonb_array_elements(p.dados) with ordinality x(linha,ord)
      where p.restaurante_id=c.restaurante_id and p.carga_id=c.id;
  insert into public.relatorio_versoes as v(restaurante_id,revisao) values(c.restaurante_id,1)
    on conflict(restaurante_id) do update set revisao=v.revisao+1 returning v.revisao into v_revisao;
  update public.relatorio_cargas set estado='substituida' where restaurante_id=c.restaurante_id and id=ativa.carga_id;
  update public.relatorio_cargas set estado='publicada',revisao_publicada=v_revisao,publicada_em=now() where restaurante_id=c.restaurante_id and id=c.id;
  update public.relatorio_paginas set dados=null where restaurante_id=c.restaurante_id and carga_id=c.id;
  return jsonb_build_object('ok',true,'estado','publicada','carga_id',c.id,'revisao',v_revisao::text);
end;
$$;

create function public.limpar_cargas_relatorio()
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  casa uuid;
  expiradas int := 0;
  removidas int := 0;
  afetadas int;
begin
  -- Mesma ordem e mesmo lock das RPCs; a rotina pode concorrer com recepção.
  for casa in select distinct restaurante_id from public.relatorio_cargas
    where (estado='recebendo' and criada_em<now()-interval '24 hours')
      or (estado<>'recebendo' and coalesce(publicada_em,criada_em)<now()-interval '7 days')
    order by restaurante_id loop
    perform pg_advisory_xact_lock(hashtextextended(casa::text,0));
    update public.relatorio_cargas set estado='expirada'
      where restaurante_id=casa and estado='recebendo' and criada_em<now()-interval '24 hours';
    get diagnostics afetadas = row_count;
    expiradas := expiradas+afetadas;
    delete from public.relatorio_paginas p using public.relatorio_cargas c
      where p.restaurante_id=c.restaurante_id and p.carga_id=c.id and c.restaurante_id=casa and c.estado='expirada';
    delete from public.relatorio_paginas p using public.relatorio_cargas c
      where p.restaurante_id=c.restaurante_id and p.carga_id=c.id and c.restaurante_id=casa
        and c.estado in ('publicada','substituida','expirada') and coalesce(c.publicada_em,c.criada_em)<now()-interval '7 days'
        and not exists(select 1 from public.relatorio_publicacoes a where a.restaurante_id=c.restaurante_id and a.carga_id=c.id);
    delete from public.relatorio_cargas c where c.restaurante_id=casa
      and c.estado in ('publicada','substituida','expirada') and coalesce(c.publicada_em,c.criada_em)<now()-interval '7 days'
      and not exists(select 1 from public.relatorio_publicacoes a where a.restaurante_id=c.restaurante_id and a.carga_id=c.id);
    get diagnostics afetadas = row_count;
    removidas := removidas+afetadas;
  end loop;
  return jsonb_build_object('ok',true,'expiradas',expiradas,'removidas',removidas);
end;
$$;

revoke all on function public.receber_pagina_relatorio(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.publicar_relatorio(uuid,uuid) from public,anon,authenticated;
revoke all on function public.limpar_cargas_relatorio() from public,anon,authenticated;
grant execute on function public.receber_pagina_relatorio(uuid,jsonb) to service_role;
grant execute on function public.publicar_relatorio(uuid,uuid) to service_role;
grant execute on function public.limpar_cargas_relatorio() to service_role;

do $$
begin
  perform cron.schedule('rf-limpa-cargas-relatorios','30 5 * * *','select public.limpar_cargas_relatorio()');
end;
$$;
commit;

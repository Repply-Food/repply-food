-- Helpers invoker fora dos schemas da API. SQL direto também valida acesso.
begin;

create schema relatorios_privados;
revoke all on schema relatorios_privados from public, anon, authenticated, service_role;
grant usage on schema relatorios_privados to authenticated;

create function relatorios_privados.validar_consulta(
  p_casa uuid, p_relatorio text, p_filtros jsonb, p_pagina int, p_tamanho int
) returns void
language plpgsql stable security invoker
set search_path = pg_catalog, public, relatorios_privados
as $$
declare
  permitidos text[];
  chave text;
  recurso text;
  inicio date;
  fim date;
  numero numeric;
begin
  -- Antes de consultar cobertura ou validar entrada: mesma resposta para casa
  -- inexistente e casa sem permissão, inclusive para chamadas SQL dos helpers.
  if p_casa is null or not (
    coalesce(public.tem_acesso(p_casa), false)
    or coalesce(public.eh_admin_repply(), false)
  ) then
    raise exception using message = 'acesso_negado';
  end if;

  permitidos := case p_relatorio
    when 'produtos' then array['pdv','grupo','garcom','mesaDe','mesaAte']
    when 'comissao' then array['operador']
    when 'caixa' then array['operador','tipo','categoria']
    when 'auditoria' then array['operador','tipo']
    when 'notas-assinadas' then array['cliente']
    when 'financeiro' then array[]::text[]
    else null end;
  if permitidos is null or p_pagina is null or p_pagina < 1
    or p_tamanho is null or p_tamanho not between 1 and 100
    or jsonb_typeof(p_filtros) is distinct from 'object' then
    raise exception using message = 'consulta_invalida';
  end if;
  if exists (select 1 from jsonb_object_keys(p_filtros) c
    where not (c = any(permitidos || array['inicio','fim','fonte'])))
    or jsonb_typeof(p_filtros->'inicio') is distinct from 'string'
    or jsonb_typeof(p_filtros->'fim') is distinct from 'string'
    or jsonb_typeof(p_filtros->'fonte') is distinct from 'string'
    or p_filtros->>'fonte' not in ('historico','online') then
    raise exception using message = 'consulta_invalida';
  end if;

  if p_filtros->>'inicio' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or p_filtros->>'fim' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception using message = 'periodo_invalido';
  end if;
  begin
    inicio := (p_filtros->>'inicio')::date;
    fim := (p_filtros->>'fim')::date;
  exception when datetime_field_overflow or invalid_datetime_format then
    raise exception using message = 'periodo_invalido';
  end;
  if fim - inicio + 1 not between 1 and 366
    or (p_filtros->>'fonte' = 'online' and inicio <> fim) then
    raise exception using message = 'periodo_invalido';
  end if;

  -- Validar todas as entradas antes da disponibilidade, para não transformar
  -- entrada malformada em um resultado vazio ou em um erro de cast do banco.
  foreach chave in array permitidos loop
    if not (p_filtros ? chave) then continue; end if;
    if chave in ('mesaDe','mesaAte') then
      if jsonb_typeof(p_filtros->chave) is distinct from 'number' then
        raise exception using message = 'mesa_invalida';
      end if;
      numero := (p_filtros->>chave)::numeric;
      if numero < 0 or numero > 2147483647 or numero <> trunc(numero) then
        raise exception using message = 'mesa_invalida';
      end if;
    else
      if jsonb_typeof(p_filtros->chave) is distinct from 'string' then
        raise exception using message = 'consulta_invalida';
      end if;
      if chave = 'tipo' then
        if (p_relatorio = 'caixa' and p_filtros->>chave not in ('credito','debito'))
          or (p_relatorio = 'auditoria' and p_filtros->>chave not in (
            'cancelamento_produto','perda_cartao','alteracao_limites',
            'exclusao_taxa_servico','transferencia_produtos')) then
          raise exception using message = 'consulta_invalida';
        end if;
      elsif chave = 'categoria' then
        if p_filtros->>chave !~ '^(credito|debito):[A-Za-z0-9_.-]{1,80}$'
          or (p_filtros ? 'tipo' and p_filtros->>'tipo' <> split_part(p_filtros->>chave, ':', 1)) then
          raise exception using message = 'consulta_invalida';
        end if;
      elsif p_filtros->>chave !~ '^[A-Za-z0-9_.-]{1,80}$' then
        raise exception using message = 'consulta_invalida';
      end if;
    end if;
  end loop;
  if p_filtros ? 'mesaDe' and p_filtros ? 'mesaAte'
    and (p_filtros->>'mesaDe')::numeric > (p_filtros->>'mesaAte')::numeric then
    raise exception using message = 'mesa_invalida';
  end if;

  foreach chave in array permitidos loop
    if not (p_filtros ? chave) then continue; end if;
    recurso := case when chave in ('mesaDe','mesaAte') then 'mesa' else chave end;
    -- Recursos são a interseção dos dias recebidos, inclusive fotografias vazias.
    if not exists (select 1 from public.relatorio_publicacoes p
      where p.restaurante_id = p_casa and p.relatorio = p_relatorio
        and p.fonte = p_filtros->>'fonte' and p.dia_movimento between inicio and fim)
      or exists (select 1 from public.relatorio_publicacoes p
        where p.restaurante_id = p_casa and p.relatorio = p_relatorio
          and p.fonte = p_filtros->>'fonte' and p.dia_movimento between inicio and fim
          and not (recurso = any(p.recursos))) then
      raise exception using message = 'filtro_indisponivel';
    end if;
  end loop;
end;
$$;

create function relatorios_privados.cobertura(
  p_casa uuid, p_relatorio text, p_filtros jsonb
) returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, public, relatorios_privados
as $$
declare resultado jsonb;
begin
  perform relatorios_privados.validar_consulta(p_casa,p_relatorio,p_filtros,1,50);
  with publicacoes as materialized (
    select p.dia_movimento, p.capturado_em, p.natureza, p.recursos
    from public.relatorio_publicacoes p
    where p.restaurante_id = p_casa and p.relatorio = p_relatorio
      and p.fonte = p_filtros->>'fonte'
      and p.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
  ), dias as (
    -- timestamp sem fuso: o movimento é uma data civil SCC, mesmo em horário de verão.
    select d::date dia from generate_series(
      (p_filtros->>'inicio')::date::timestamp,
      (p_filtros->>'fim')::date::timestamp, interval '1 day') d
  ), recursos as (
    select r.recurso from publicacoes p cross join lateral unnest(p.recursos) r(recurso)
    group by r.recurso having count(*) = (select count(*) from publicacoes)
  )
  select jsonb_build_object(
    'esperados',count(*), 'recebidos',count(p.dia_movimento),
    'ausentes',coalesce(jsonb_agg(to_char(d.dia,'YYYY-MM-DD') order by d.dia)
      filter (where p.dia_movimento is null),'[]'::jsonb),
    'capturadoEm',to_char(min(p.capturado_em) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"'),
    'simulacao',coalesce(bool_or(p.natureza = 'simulacao'),false),
    'recursos',(select coalesce(jsonb_agg(recurso order by recurso),'[]'::jsonb) from recursos)
  ) into resultado from dias d left join publicacoes p on p.dia_movimento = d.dia;
  return resultado;
end;
$$;

create function public.opcoes_relatorio(
  p_restaurante_id uuid, p_relatorio text, p_filtros jsonb, p_dimensao text,
  p_busca text default '', p_pagina int default 1
) returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, public, relatorios_privados
as $$
declare
  dimensoes text[];
  resultado jsonb;
begin
  perform relatorios_privados.validar_consulta(p_restaurante_id,p_relatorio,p_filtros,p_pagina,25);
  if p_busca is null or char_length(p_busca) > 80 then
    raise exception using message = 'consulta_invalida';
  end if;
  dimensoes := case p_relatorio
    when 'produtos' then array['pdv','grupo','garcom']
    when 'comissao' then array['operador']
    when 'caixa' then array['operador','tipo','categoria']
    when 'auditoria' then array['operador','tipo']
    when 'notas-assinadas' then array['cliente']
    else array[]::text[] end;
  if p_dimensao is null or not (p_dimensao = any(dimensoes)) then
    raise exception using message = 'filtro_indisponivel';
  end if;
  if not ((relatorios_privados.cobertura(p_restaurante_id,p_relatorio,p_filtros)->'recursos') ? p_dimensao) then
    raise exception using message = 'filtro_indisponivel';
  end if;

  with filtradas as (
    select l.dados from public.relatorio_linhas l
    where l.restaurante_id = p_restaurante_id and l.relatorio = p_relatorio
      and l.fonte = p_filtros->>'fonte'
      and l.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
      and (not (p_filtros ? 'pdv') or l.dados->>'codigo_pdv' = p_filtros->>'pdv')
      and (not (p_filtros ? 'grupo') or l.dados->>'codigo_grupo' = p_filtros->>'grupo')
      and (not (p_filtros ? 'garcom') or l.dados->>'codigo_garcom' = p_filtros->>'garcom')
      and (not (p_filtros ? 'mesaDe') or (l.dados->>'mesa')::numeric >= (p_filtros->>'mesaDe')::numeric)
      and (not (p_filtros ? 'mesaAte') or (l.dados->>'mesa')::numeric <= (p_filtros->>'mesaAte')::numeric)
      and (not (p_filtros ? 'operador') or l.dados->>'codigo_operador' = p_filtros->>'operador')
      and (not (p_filtros ? 'tipo') or l.dados->>'tipo' = p_filtros->>'tipo')
      and (not (p_filtros ? 'categoria') or l.dados->>'tipo' || ':' || (l.dados->>'codigo_categoria') = p_filtros->>'categoria')
      and (not (p_filtros ? 'cliente') or l.dados->>'codigo_cliente' = p_filtros->>'cliente')
  ), valores as (
    select case p_dimensao
      when 'pdv' then dados->>'codigo_pdv'
      when 'grupo' then dados->>'codigo_grupo'
      when 'garcom' then dados->>'codigo_garcom'
      when 'operador' then dados->>'codigo_operador'
      when 'tipo' then dados->>'tipo'
      when 'categoria' then dados->>'tipo' || ':' || (dados->>'codigo_categoria')
      when 'cliente' then dados->>'codigo_cliente' end codigo,
    case p_dimensao
      when 'pdv' then coalesce(dados->>'pdv',dados->>'codigo_pdv')
      when 'grupo' then coalesce(dados->>'grupo',dados->>'codigo_grupo')
      when 'garcom' then coalesce(dados->>'garcom',dados->>'codigo_garcom')
      when 'operador' then coalesce(dados->>'operador',dados->>'codigo_operador')
      when 'tipo' then dados->>'tipo'
      when 'categoria' then dados->>'categoria'
      when 'cliente' then 'Cliente ' || (dados->>'codigo_cliente') end rotulo
    from filtradas
  ), pagina as materialized (
    select distinct codigo collate "C" codigo, rotulo collate "C" rotulo
    from valores where codigo is not null and rotulo is not null
      and position(lower(p_busca) in lower(rotulo)) > 0
    order by rotulo, codigo limit 26 offset (p_pagina::bigint - 1) * 25
  ), visiveis as (
    select codigo,rotulo from pagina order by rotulo,codigo limit 25
  )
  select jsonb_build_object(
    'opcoes',(select coalesce(jsonb_agg(jsonb_build_object('codigo',codigo,'rotulo',rotulo)
      order by rotulo,codigo),'[]'::jsonb) from visiveis),
    'mais',(select count(*) > 25 from pagina)
  ) into resultado;
  return resultado;
end;
$$;

revoke all on function relatorios_privados.validar_consulta(uuid,text,jsonb,int,int) from public, anon, authenticated, service_role;
revoke all on function relatorios_privados.cobertura(uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.opcoes_relatorio(uuid,text,jsonb,text,text,int) from public, anon, authenticated, service_role;
grant execute on function relatorios_privados.validar_consulta(uuid,text,jsonb,int,int) to authenticated;
grant execute on function relatorios_privados.cobertura(uuid,text,jsonb) to authenticated;
grant execute on function public.opcoes_relatorio(uuid,text,jsonb,text,text,int) to authenticated;

commit;

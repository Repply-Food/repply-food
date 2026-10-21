begin;

create or replace function public.metrica_resultados_resumo(
  p_restaurante_id uuid, p_inicio date, p_fim date, p_comparacao text
) returns table (
  faturamento text, taxa_servico text, contas int, pessoas int,
  ticket_conta text, ticket_pessoa text, descontos_total text,
  percentual_descontos numeric, referencia_faturamento text,
  variacao_faturamento numeric, referencia_contas numeric,
  variacao_contas numeric, referencia_ticket_conta numeric,
  variacao_ticket_conta numeric
) language plpgsql stable security invoker set search_path = public as $$
declare
  v_atual record;
  v_referencia_faturamento numeric;
  v_referencia_contas numeric;
begin
  perform 1 from public.restaurantes where id = p_restaurante_id;
  if not found then return; end if;

  select coalesce(sum(e.valor_consumido - e.taxa_servico), 0) as faturamento,
         coalesce(sum(e.taxa_servico), 0) as taxa_servico,
         count(*)::int as contas,
         coalesce(sum(e.numero_ocupantes), 0)::int as pessoas,
         coalesce(sum(e.valor_descontos), 0) as descontos_total
    into v_atual
    from public.entradas e
   where e.restaurante_id = p_restaurante_id
     and e.removida_em is null
     and e.pago
     and e.dia_operacao between p_inicio and p_fim;

  if p_comparacao = 'anterior' then
    select coalesce(sum(e.valor_consumido - e.taxa_servico), 0), count(*)::int
      into v_referencia_faturamento, v_referencia_contas
      from public.entradas e
     where e.restaurante_id = p_restaurante_id
       and e.removida_em is null
       and e.pago
       and e.dia_operacao between p_inicio - (p_fim - p_inicio + 1) and p_inicio - 1;
  elsif p_comparacao = 'semana' then
    with dias as (
      select d.dia::date
        from generate_series(p_inicio, p_fim, interval '1 day') as d(dia)
       where exists (
         select 1 from public.entradas e
          where e.restaurante_id = p_restaurante_id and e.removida_em is null and e.pago
            and e.dia_operacao = d.dia
       )
    ), historico as (
      select d.dia, h.faturamento, h.contas
        from dias d
        left join lateral (
          select sum(e.valor_consumido - e.taxa_servico) as faturamento,
                 count(*)::numeric as contas
            from public.entradas e
           where e.restaurante_id = p_restaurante_id
             and e.removida_em is null
             and e.pago
             and extract(dow from e.dia_operacao) = extract(dow from d.dia)
             and e.dia_operacao < d.dia
           group by e.dia_operacao
           order by e.dia_operacao desc
           limit 4
        ) h on true
    ), medias as (
      select h.dia, count(h.faturamento) as ocorrencias,
             avg(h.faturamento) as media_faturamento, avg(h.contas) as media_contas
        from historico h
       group by h.dia
    )
    select case when bool_and(m.ocorrencias >= 2) then round(sum(m.media_faturamento), 2) end,
           case when bool_and(m.ocorrencias >= 2) then round(sum(m.media_contas), 2) end
      into v_referencia_faturamento, v_referencia_contas
      from medias m;
  end if;

  return query select
    v_atual.faturamento::text,
    v_atual.taxa_servico::text,
    v_atual.contas,
    v_atual.pessoas,
    case when v_atual.contas > 0 then round(v_atual.faturamento / v_atual.contas, 2)::text end,
    case when v_atual.pessoas > 0 then round(v_atual.faturamento / v_atual.pessoas, 2)::text end,
    v_atual.descontos_total::text,
    case when v_atual.faturamento > 0 then round(v_atual.descontos_total / v_atual.faturamento, 4) end,
    v_referencia_faturamento::text,
    case when v_referencia_faturamento > 0 then round((v_atual.faturamento - v_referencia_faturamento) / v_referencia_faturamento, 4) end,
    v_referencia_contas,
    case when v_referencia_contas > 0 then round((v_atual.contas - v_referencia_contas) / v_referencia_contas, 4) end,
    case when v_referencia_contas > 0 then round(v_referencia_faturamento / v_referencia_contas, 2) end,
    case when v_referencia_faturamento > 0 and v_referencia_contas > 0 and v_atual.contas > 0
      then round(((v_atual.faturamento / v_atual.contas) - (v_referencia_faturamento / v_referencia_contas)) /
        (v_referencia_faturamento / v_referencia_contas), 4) end;
end;
$$;

create or replace function public.metrica_resultados_vendas_diarias(p_restaurante_id uuid, p_inicio date, p_fim date)
returns table (dia_operacao date, faturamento text, taxa_servico text)
language sql stable security invoker set search_path = public as $$
  with dias as (select generate_series(p_inicio, p_fim, interval '1 day')::date as dia)
  select d.dia, coalesce(sum(e.valor_consumido - e.taxa_servico), 0)::text,
         coalesce(sum(e.taxa_servico), 0)::text
    from dias d left join public.entradas e on e.restaurante_id = p_restaurante_id
      and e.removida_em is null and e.pago and e.dia_operacao = d.dia
   where exists (select 1 from public.restaurantes r where r.id = p_restaurante_id)
   group by d.dia order by d.dia;
$$;

create or replace function public.metrica_resultados_ocupacao(p_restaurante_id uuid, p_inicio date, p_fim date)
returns table (tipo text, faturamento text, participacao numeric)
language sql stable security invoker set search_path = public as $$
  with por_tipo as (
    select case when e.tipo_ocupacao in ('Mesa', 'Balcão') then e.tipo_ocupacao else 'Outros' end as tipo,
           sum(e.valor_consumido - e.taxa_servico) as faturamento
      from public.entradas e where e.restaurante_id = p_restaurante_id and e.removida_em is null and e.pago
       and e.dia_operacao between p_inicio and p_fim group by 1
  ), total as (select sum(faturamento) as valor from por_tipo)
  select p.tipo, p.faturamento::text, round(p.faturamento / t.valor, 4)
    from por_tipo p cross join total t order by p.faturamento desc, p.tipo;
$$;

create or replace function public.metrica_resultados_horas(p_restaurante_id uuid, p_inicio date, p_fim date)
returns table (hora int, faturamento text)
language sql stable security invoker set search_path = public as $$
  select extract(hour from timezone(r.fuso, e.aberta_em))::int, sum(e.valor_consumido - e.taxa_servico)::text
    from public.restaurantes r join public.entradas e on e.restaurante_id = r.id
   where r.id = p_restaurante_id and e.removida_em is null and e.pago and e.dia_operacao between p_inicio and p_fim
   group by 1 order by 1;
$$;

create or replace function public.metrica_resultados_mapa_calor(p_restaurante_id uuid, p_inicio date, p_fim date)
returns table (dia_semana int, hora int, media_contas numeric)
language sql stable security invoker set search_path = public as $$
  with r as (select fuso from public.restaurantes where id = p_restaurante_id), por_dia as (
    select extract(dow from e.dia_operacao)::int as dia_semana,
           extract(hour from timezone(r.fuso, e.aberta_em))::int as hora, e.dia_operacao, count(*) as contas
      from public.entradas e cross join r where e.restaurante_id = p_restaurante_id and e.removida_em is null and e.pago
       and e.dia_operacao between p_inicio and p_fim group by 1, 2, 3
  ) select dia_semana, hora, round(avg(contas), 2) from por_dia group by 1, 2 order by 1, 2;
$$;

create or replace function public.metrica_resultados_turnos(p_restaurante_id uuid, p_inicio date, p_fim date)
returns table (turno text, faturamento text, contas int, permanencia_media interval)
language sql stable security invoker set search_path = public as $$
  with dados as (
    select case when timezone(r.fuso, e.aberta_em)::time < coalesce((r.turnos ->> 'almoco_ate')::time, '17:00'::time)
                  then 'Almoço' else 'Jantar' end as turno,
           e.valor_consumido - e.taxa_servico as faturamento,
           case when e.fechada_em >= e.aberta_em then e.fechada_em - e.aberta_em end as permanencia
      from public.restaurantes r join public.entradas e on e.restaurante_id = r.id
     where r.id = p_restaurante_id and e.removida_em is null and e.pago and e.dia_operacao between p_inicio and p_fim
  ) select turno, sum(faturamento)::text, count(*)::int, avg(permanencia) from dados group by turno order by turno;
$$;

create or replace function public.metrica_resultados_equipe(p_restaurante_id uuid, p_inicio date, p_fim date)
returns table (cod_garcom int, faturamento text, contas int, pessoas int, ticket_conta text, ticket_pessoa text, taxa_servico text)
language sql stable security invoker set search_path = public as $$
  select e.cod_garcom, sum(e.valor_consumido - e.taxa_servico)::text, count(*)::int,
         coalesce(sum(e.numero_ocupantes), 0)::int,
         round(sum(e.valor_consumido - e.taxa_servico) / count(*), 2)::text,
         case when sum(e.numero_ocupantes) > 0 then round(sum(e.valor_consumido - e.taxa_servico) / sum(e.numero_ocupantes), 2)::text end,
         sum(e.taxa_servico)::text
    from public.entradas e where e.restaurante_id = p_restaurante_id and e.removida_em is null and e.pago
     and e.dia_operacao between p_inicio and p_fim group by e.cod_garcom order by sum(e.valor_consumido - e.taxa_servico) desc, e.cod_garcom;
$$;

create or replace function public.metrica_resultados_descontos(p_restaurante_id uuid, p_inicio date, p_fim date)
returns table (cod_operador_fechamento int, descontos text)
language sql stable security invoker set search_path = public as $$
  select e.cod_operador_fechamento, sum(e.valor_descontos)::text from public.entradas e
   where e.restaurante_id = p_restaurante_id and e.removida_em is null and e.pago and e.dia_operacao between p_inicio and p_fim
   group by e.cod_operador_fechamento order by sum(e.valor_descontos) desc, e.cod_operador_fechamento;
$$;

grant execute on function public.metrica_resultados_resumo(uuid, date, date, text) to authenticated, service_role;
grant execute on function public.metrica_resultados_vendas_diarias(uuid, date, date) to authenticated, service_role;
grant execute on function public.metrica_resultados_ocupacao(uuid, date, date) to authenticated, service_role;
grant execute on function public.metrica_resultados_horas(uuid, date, date) to authenticated, service_role;
grant execute on function public.metrica_resultados_mapa_calor(uuid, date, date) to authenticated, service_role;
grant execute on function public.metrica_resultados_turnos(uuid, date, date) to authenticated, service_role;
grant execute on function public.metrica_resultados_equipe(uuid, date, date) to authenticated, service_role;
grant execute on function public.metrica_resultados_descontos(uuid, date, date) to authenticated, service_role;

commit;

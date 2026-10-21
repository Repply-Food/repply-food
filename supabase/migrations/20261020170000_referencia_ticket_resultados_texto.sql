begin;

drop function public.metrica_resultados_resumo(uuid, date, date, text);

create or replace function public.metrica_resultados_resumo(
  p_restaurante_id uuid, p_inicio date, p_fim date, p_comparacao text
) returns table (
  faturamento text, taxa_servico text, contas int, pessoas int,
  ticket_conta text, ticket_pessoa text, descontos_total text,
  percentual_descontos numeric, referencia_faturamento text,
  variacao_faturamento numeric, referencia_contas numeric,
  variacao_contas numeric, referencia_ticket_conta text,
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
    case when v_referencia_contas > 0 then round(v_referencia_faturamento / v_referencia_contas, 2)::text end,
    case when v_referencia_faturamento > 0 and v_referencia_contas > 0 and v_atual.contas > 0
      then round(((v_atual.faturamento / v_atual.contas) - (v_referencia_faturamento / v_referencia_contas)) /
        (v_referencia_faturamento / v_referencia_contas), 4) end;
end;
$$;

grant execute on function public.metrica_resultados_resumo(uuid, date, date, text) to authenticated, service_role;

commit;

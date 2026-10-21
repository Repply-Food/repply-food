begin;

create or replace function public.metrica_resultados_ocupacao(
  p_restaurante_id uuid, p_inicio date, p_fim date
) returns table (tipo text, faturamento text, participacao numeric)
language sql stable security invoker set search_path = public as $$
  with por_tipo as (
    select case when e.tipo_ocupacao in ('Mesa', 'Balcão') then e.tipo_ocupacao else 'Outros' end as tipo,
           sum(e.valor_consumido - e.taxa_servico) as faturamento
      from public.entradas e
     where e.restaurante_id = p_restaurante_id
       and e.removida_em is null
       and e.pago
       and e.dia_operacao between p_inicio and p_fim
     group by 1
  ), total as (select sum(faturamento) as valor from por_tipo)
  select p.tipo, p.faturamento::text, round(p.faturamento / nullif(t.valor, 0), 4)
    from por_tipo p cross join total t
   order by p.faturamento desc, p.tipo;
$$;

grant execute on function public.metrica_resultados_ocupacao(uuid, date, date) to authenticated, service_role;

commit;

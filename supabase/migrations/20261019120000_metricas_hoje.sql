-- Etapa 5 · Funções de métrica da tela "Hoje" (docs/metricas.md).
-- security invoker: o isolamento é a RLS de entradas (tem_acesso/eh_admin_repply).
-- Dinheiro volta como text (string) para o TS não somar number.
begin;

-- As funções metrica_* são security invoker: rodam com o privilégio de quem
-- chama (o login do dono ou do admin). Elas usam dia_operacao_de para achar o
-- dia de operação, e a migration 20261013120000 a fechou para authenticated.
-- Sem este grant, toda métrica falha com "permission denied for function".
-- É pura (só calcula uma data, não lê tabela), no mesmo caso de cnpj_valido e
-- horario_funcionamento_valido (seguranca-e-isolamento.md §2). Entra na lista
-- de tests/isolamento/funcoes-fechadas.test.ts.
grant execute on function public.dia_operacao_de(timestamptz, text, time)
  to authenticated, service_role;

create or replace function public.metrica_faturamento_do_dia(
  p_restaurante_id uuid, p_ate timestamptz
) returns table (
  faturamento text, taxa_servico text, contas_pagas int, pessoas_pagas int
)
language sql
stable
security invoker
set search_path = public
as $$
  with r as (select fuso, hora_virada from public.restaurantes where id = p_restaurante_id)
  select
    coalesce(sum(e.valor_consumido - e.taxa_servico)
      filter (where e.pago and e.fechada_em <= p_ate), 0)::text,
    coalesce(sum(e.taxa_servico)
      filter (where e.pago and e.fechada_em <= p_ate), 0)::text,
    count(*) filter (where e.pago and e.fechada_em <= p_ate)::int,
    coalesce(sum(e.numero_ocupantes)
      filter (where e.pago and e.fechada_em <= p_ate), 0)::int
  from public.entradas e, r
  where e.restaurante_id = p_restaurante_id
    and e.removida_em is null
    and e.dia_operacao = public.dia_operacao_de(p_ate, r.fuso, r.hora_virada);
$$;

grant execute on function public.metrica_faturamento_do_dia(uuid, timestamptz)
  to authenticated, service_role;

commit;

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

-- Mesas abertas no instante p_agora: aberta_em <= p_agora e ainda não fechada
-- naquele instante (fechada_em nula ou depois de p_agora). O valor é com a
-- taxa ("em aberto" é o que o cliente vai pagar).
create or replace function public.metrica_mesas_abertas(
  p_restaurante_id uuid, p_agora timestamptz
) returns table (quantidade int, valor_em_aberto text, pessoas_na_casa int)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::int,
    coalesce(sum(valor_consumido), 0)::text,
    coalesce(sum(numero_ocupantes), 0)::int
  from public.entradas
  where restaurante_id = p_restaurante_id and removida_em is null
    and aberta_em <= p_agora and (fechada_em is null or fechada_em > p_agora);
$$;

grant execute on function public.metrica_mesas_abertas(uuid, timestamptz)
  to authenticated, service_role;

-- Contas esquecidas no instante p_agora: abertas ali (aberta_em <= p_agora e
-- ainda não fechadas naquele instante) há MAIS que p_limite (limite_conta_esquecida
-- do restaurante, padrão 4 h; quem chama passa o valor). Da mais antiga para a
-- mais nova; empate na abertura desempata pelo código, para a ordem não variar.
-- Devolve TODAS: a tela mostra 3 + "ver todas (N)" (D-33). O valor em aberto
-- leva a taxa (é o que o cliente vai pagar). Uma conta que nunca fecha segue
-- esquecida: é exatamente o alarme desta métrica.
create or replace function public.metrica_contas_esquecidas(
  p_restaurante_id uuid, p_agora timestamptz, p_limite interval
) returns table (
  cod_entrada bigint, cod_cartao_mesa int, aberta_em timestamptz,
  aberta_ha interval, valor_em_aberto text
)
language sql
stable
security invoker
set search_path = public
as $$
  select e.cod_entrada, e.cod_cartao_mesa, e.aberta_em,
         (p_agora - e.aberta_em), e.valor_consumido::text
  from public.entradas e
  where e.restaurante_id = p_restaurante_id and e.removida_em is null
    and e.aberta_em <= p_agora and (e.fechada_em is null or e.fechada_em > p_agora)
    and (p_agora - e.aberta_em) > p_limite
  order by e.aberta_em asc, e.cod_entrada asc;
$$;

grant execute on function public.metrica_contas_esquecidas(uuid, timestamptz, interval)
  to authenticated, service_role;

-- Comparação do dia (metricas.md §4): hoje contra a MÉDIA das últimas 4
-- ocorrências do MESMO dia da semana COM MOVIMENTO (>=1 conta paga), até o
-- MESMO tempo decorrido desde a virada. Reaproveita metrica_faturamento_do_dia
-- em cada ponto (por lateral) para nunca recalcular a regra do faturamento.
-- variacao = (hoje - média) / média; com menos de 2 ocorrências a média e as
-- variações saem null (a tela mostra "—"). Sem acesso (RLS de restaurantes não
-- devolve a casa) a função sai sem linha nenhuma.
create or replace function public.metrica_comparacao_do_dia(
  p_restaurante_id uuid, p_agora timestamptz
) returns table (
  faturamento_hoje text, por_pessoa_hoje text,
  media_faturamento text, media_por_pessoa text,
  variacao_faturamento numeric, variacao_por_pessoa numeric,
  ocorrencias int
)
language plpgsql stable security invoker set search_path = public
as $$
declare
  v_fuso text; v_virada time; v_dia_hoje date; v_dow int;
  v_inicio_hoje timestamptz; v_decorrido interval;
  v_hoje_fat numeric; v_hoje_pes int;
begin
  select fuso, hora_virada into v_fuso, v_virada
    from public.restaurantes where id = p_restaurante_id;
  if v_fuso is null then return; end if;   -- sem acesso (RLS) ou inexistente
  v_dia_hoje := public.dia_operacao_de(p_agora, v_fuso, v_virada);
  v_dow := extract(dow from v_dia_hoje)::int;
  v_inicio_hoje := ((v_dia_hoje::text || ' ' || v_virada::text)::timestamp) at time zone v_fuso;
  v_decorrido := p_agora - v_inicio_hoje;

  select m.faturamento::numeric, m.pessoas_pagas
    into v_hoje_fat, v_hoje_pes
    from public.metrica_faturamento_do_dia(p_restaurante_id, p_agora) m;

  return query
  with dias as (
    select e.dia_operacao as d
    from public.entradas e
    where e.restaurante_id = p_restaurante_id and e.removida_em is null
      and e.dia_operacao < v_dia_hoje
      and extract(dow from e.dia_operacao)::int = v_dow
    group by e.dia_operacao
    having count(*) filter (where e.pago) >= 1
    order by e.dia_operacao desc
    limit 4
  ),
  pontos as (
    select m.faturamento::numeric as fat,
           case when m.pessoas_pagas > 0
                then m.faturamento::numeric / m.pessoas_pagas else null end as por_pessoa
    from dias
    cross join lateral public.metrica_faturamento_do_dia(
      p_restaurante_id,
      ((dias.d::text || ' ' || v_virada::text)::timestamp at time zone v_fuso) + v_decorrido
    ) m
  ),
  ag as (
    select count(*)::int as n, avg(fat) as media_fat, avg(por_pessoa) as media_pp
    from pontos
  )
  select
    v_hoje_fat::text,
    case when v_hoje_pes > 0 then (v_hoje_fat / v_hoje_pes)::text else null end,
    case when ag.n >= 2 then round(ag.media_fat, 2)::text else null end,
    case when ag.n >= 2 then round(ag.media_pp, 2)::text else null end,
    case when ag.n >= 2 and ag.media_fat > 0
         then round((v_hoje_fat - ag.media_fat) / ag.media_fat, 4) else null end,
    case when ag.n >= 2 and ag.media_pp > 0 and v_hoje_pes > 0
         then round(((v_hoje_fat / v_hoje_pes) - ag.media_pp) / ag.media_pp, 4) else null end,
    ag.n
  from ag;
end;
$$;

grant execute on function public.metrica_comparacao_do_dia(uuid, timestamptz)
  to authenticated, service_role;

commit;

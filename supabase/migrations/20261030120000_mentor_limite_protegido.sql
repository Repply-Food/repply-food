-- Agente mentor de IA · protege o contador do limite diário.
--
-- Furo que esta migration fecha: na 20261030110000 o dono ganhou escrita direta
-- em mentor_uso (insert/update sob a RLS). Pela API pública (anon key + o JWT
-- dele) bastava um PATCH com "contagem = 0" para zerar o próprio contador e
-- furar o teto de uso do mentor, que é o controle de custo de IA.
--
-- O conserto segue o padrão do projeto (trava de login D-64, tokens_envio): a
-- ÚNICA porta de escrita vira a função mentor_registrar_uso, que passa a ser
-- security definer e confere o acesso por dentro; o dono fica só com leitura.
--
--   * mentor_registrar_uso: security definer + search_path = public +
--     row_security = off (mesmas cláusulas de eh_admin_repply/tem_acesso). Sobe
--     por cima da RLS, por isso a conferência fica DENTRO dela: só quem tem
--     acesso à casa E não é admin da Repply conta (o admin em modo leitura,
--     D-38, não gasta o limite do cliente). Casa inexistente ou sem acesso: erro
--     42501 e nada é gravado;
--   * o service_role perde o EXECUTE: ninguém chama essa função como serviço, e
--     sem login (auth.uid() nulo) ela recusaria de qualquer jeito;
--   * mentor_uso: o dono (authenticated) perde insert e update, e as duas
--     políticas de escrita saem. Fica o SELECT (um futuro "você usou X de 50
--     hoje" lê sob a RLS). O service_role segue com a escrita direta (o preparo
--     dos testes grava por ele); o gatilho freeze_restaurante_id e o
--     check (contagem >= 0) ficam como estão.
--
-- Migration só acrescenta: a 20261030110000 não é editada. Nada de FORCE ROW
-- LEVEL SECURITY. A assinatura não muda, então os tipos gerados também não.
begin;

-- ---------------------------------------------------------------------------
-- A função: security definer, com a conferência de acesso por dentro
-- ---------------------------------------------------------------------------

create or replace function public.mentor_registrar_uso(p_restaurante_id uuid)
returns int
language plpgsql
volatile
security definer
set search_path = public
set row_security = off
as $$
declare
  v_dia      date;
  v_contagem int;
begin
  -- Só o dono da casa; o admin em modo leitura (D-38) não gasta o limite do
  -- cliente. Como a função roda por cima da RLS, esta é a trava.
  if not (public.tem_acesso(p_restaurante_id) and not public.eh_admin_repply()) then
    raise exception 'sem acesso ao restaurante' using errcode = '42501';
  end if;

  select public.dia_operacao_de(now(), r.fuso, r.hora_virada)
    into v_dia
    from public.restaurantes r
   where r.id = p_restaurante_id;

  insert into public.mentor_uso (restaurante_id, dia, contagem)
  values (p_restaurante_id, v_dia, 1)
  on conflict (restaurante_id, dia)
  do update set contagem = mentor_uso.contagem + 1
  returning contagem into v_contagem;

  return v_contagem;
end;
$$;

comment on function public.mentor_registrar_uso(uuid) is
  'Soma 1 ao uso do mentor da casa no dia de operação dela e devolve a contagem do dia. Security definer: é a única porta de escrita de mentor_uso, e confere por dentro que quem chama tem acesso à casa e não é admin da Repply (erro 42501). O teto do limite não é decidido aqui.';

-- ---------------------------------------------------------------------------
-- Privilégios da função (explícitos): só o dono logado executa
-- ---------------------------------------------------------------------------

revoke all on function public.mentor_registrar_uso(uuid) from public, anon, service_role;
grant execute on function public.mentor_registrar_uso(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- mentor_uso: o dono deixa de escrever direto; fica só a leitura
-- ---------------------------------------------------------------------------

drop policy "cliente registra o uso do mentor da casa dele" on public.mentor_uso;
drop policy "cliente altera o uso do mentor da casa dele" on public.mentor_uso;

revoke insert, update on public.mentor_uso from authenticated;

commit;

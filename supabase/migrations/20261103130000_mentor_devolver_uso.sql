-- Agente mentor de IA · devolve a cota do dia quando a IA não foi alcançada.
--
-- Problema: o cérebro do mentor conta o uso ANTES de chamar o provedor
-- (mentor_registrar_uso, o incremento atômico que impede dois pedidos
-- simultâneos de furar o teto). Se o provedor está fora do ar, o dono não
-- recebe resposta mas a cota já foi gasta, e no limite ele trava o dia por uma
-- falha nossa.
--
-- Conserto: o incremento continua antes (a checagem do teto não muda) e, quando
-- a tentativa cai por falha do provedor, o cérebro DEVOLVE o uso por esta função.
--
--   * mentor_devolver_uso(uuid): tira 1 do contador do dia de operação da casa,
--     nunca abaixo de zero, e devolve a contagem que ficou (0 se a casa não tem
--     linha hoje ou não existe: nada a devolver, e nenhuma linha é criada).
--     Calcula o dia como mentor_registrar_uso (dia_operacao_de com o fuso e a
--     virada da casa);
--   * security definer + search_path vazio + row_security = off: mexe em
--     mentor_uso por cima da RLS, já que o dono não escreve ali (20261030120000);
--   * SÓ service_role executa. Se o dono pudesse chamá-la, baixaria o próprio
--     contador e furaria o teto de custo da IA. Só o servidor do painel, depois
--     de contar um uso na MESMA chamada e a IA falhar, a executa. anon e
--     authenticated não têm EXECUTE: por isso ela NÃO entra na lista de
--     tests/isolamento/funcoes-fechadas.test.ts (aquela lista é só do que anon
--     ou authenticated podem executar), igual a limpar_conversas_mentor() e
--     mentor_cartilha_ativa().
--
-- Limite conhecido: se a falha do provedor cruzar a hora de virada da casa entre
-- o uso contado e a devolução, a função tira do dia NOVO (não do que foi
-- gasto). Com o piso em zero, o efeito pior é uma tentativa a mais no dia novo,
-- uma única vez, no instante da virada.
--
-- Regras: migration só acrescenta (nada editado); nada de FORCE ROW LEVEL
-- SECURITY; função nova nasce fechada (revoke + grant explícitos abaixo).
begin;

create function public.mentor_devolver_uso(p_restaurante_id uuid)
returns int
language plpgsql
volatile
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_dia      date;
  v_contagem int;
begin
  select public.dia_operacao_de(now(), r.fuso, r.hora_virada)
    into v_dia
    from public.restaurantes r
   where r.id = p_restaurante_id;

  -- Casa que não existe: nada a devolver (e nada é criado).
  if v_dia is null then
    return 0;
  end if;

  update public.mentor_uso u
     set contagem = greatest(u.contagem - 1, 0)
   where u.restaurante_id = p_restaurante_id
     and u.dia = v_dia
  returning u.contagem into v_contagem;

  -- Sem linha hoje: nada a devolver.
  return coalesce(v_contagem, 0);
end;
$$;

comment on function public.mentor_devolver_uso(uuid) is
  'Devolve 1 uso do mentor da casa no dia de operação dela (piso em zero) e devolve a contagem que ficou. Só service_role: o cérebro chama quando a IA não foi alcançada, para a falha nossa não gastar a cota do dono. Se o dono pudesse chamá-la, baixaria o próprio contador.';

revoke all on function public.mentor_devolver_uso(uuid) from public, anon, authenticated;
grant execute on function public.mentor_devolver_uso(uuid) to service_role;

commit;

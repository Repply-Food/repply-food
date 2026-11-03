-- Agente mentor de IA · retenção de 12 meses das conversas (D-72).
--
-- O mentor guarda as conversas e as mensagens por 12 meses; passado isso, uma
-- rotina diária apaga. Mesmo padrão das outras retenções do projeto
-- (rf-retencao, rf-limpa-tentativas, rf-limpa-cargas-*): uma função fechada,
-- chamada pelo pg_cron, que roda como dono da tabela.
--
-- Cada mensagem vale pela PRÓPRIA data (criada_em), não pela da conversa: o dono
-- pode retomar uma conversa antiga, e as mensagens de ontem não podem sumir só
-- porque a conversa nasceu há mais de um ano. A conversa sai quando é antiga E
-- ficou sem nenhuma mensagem (o "on delete cascade" de mentor_mensagens leva as
-- mensagens junto, mas aqui elas já foram apagadas antes).
--
-- A rotina é global (todas as casas): não olha restaurante_id, só o prazo.
--
-- Regras: nada de FORCE ROW LEVEL SECURITY; função nova nasce fechada e só o
-- service_role executa (o pg_cron roda como postgres e não precisa de grant). Por
-- isso a função NÃO entra em tests/isolamento/funcoes-fechadas.test.ts: aquela
-- lista é só do que anon ou authenticated podem executar.
begin;

create function public.limpar_conversas_mentor()
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  c_prazo constant interval := interval '12 months';
  mensagens_apagadas integer;
  conversas_apagadas integer;
begin
  delete from public.mentor_mensagens
   where criada_em < now() - c_prazo;
  get diagnostics mensagens_apagadas = row_count;

  delete from public.mentor_conversas c
   where c.criada_em < now() - c_prazo
     and not exists (
       select 1 from public.mentor_mensagens m where m.conversa_id = c.id
     );
  get diagnostics conversas_apagadas = row_count;

  return jsonb_build_object(
    'mensagens', mensagens_apagadas,
    'conversas', conversas_apagadas
  );
end;
$$;

comment on function public.limpar_conversas_mentor() is
  'Retenção do mentor (D-72): apaga as mensagens com mais de 12 meses e as conversas antigas que ficaram sem mensagem. Só o service_role executa; o pg_cron chama todo dia (rf-limpa-mentor).';

revoke all on function public.limpar_conversas_mentor() from public, anon, authenticated;
grant execute on function public.limpar_conversas_mentor() to service_role;

-- Uma vez por dia, às 06:00 UTC (03:00 em Brasília), depois das outras limpezas
-- (05:00 a 05:45).
select cron.schedule(
  'rf-limpa-mentor',
  '0 6 * * *',
  'select public.limpar_conversas_mentor()'
);

commit;

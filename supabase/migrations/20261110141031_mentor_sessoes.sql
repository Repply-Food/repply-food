-- Agente mentor de IA · sessões: arquivar, excluir e a faxina de 60 dias
-- (Fase 2, D-75).
--
-- O dono nunca apaga a linha: arquivar e excluir são só duas marcas na
-- conversa (`arquivada_em`, `excluida_em`). Arquivar tira da lista principal e
-- pode ser desfeito; excluir esconde do dono e a faxina apaga de verdade após
-- 60 dias. O resto segue a regra dos 12 meses (D-72), arquivado ou não.
--
-- Trava de colunas: pelo banco, o dono só muda o título, o carimbo de
-- atividade (`ultima_em`, que o envio atualiza a cada resposta) e as duas
-- marcas. `id`, `restaurante_id` e `criada_em` não mudam (`restaurante_id` já
-- era travado pelo freeze; aqui a trava cobre as três de uma vez).
--
-- RLS: nenhuma política de DELETE para `authenticated` em `mentor_conversas`
-- (nem privilégio de DELETE): ninguém apaga a linha direto. Quem apaga de
-- verdade é a faxina (pg_cron, como dona da tabela) ou o admin no suporte (com
-- a chave de serviço). As políticas de SELECT/INSERT/UPDATE seguem as mesmas
-- de 20261030100000 (o dono escreve só na casa dele, o admin só lê).
--
-- Regras: nada de FORCE ROW LEVEL SECURITY; só acréscimo. A função de trava é
-- de gatilho (não entra em tests/isolamento/funcoes-fechadas.test.ts, que só
-- lista o que anon/authenticated executam) e nasce fechada. A faxina mantém o
-- formato `{mensagens, conversas}` e os mesmos privilégios (só service_role).
begin;

-- ---------------------------------------------------------------------------
-- Marcas de arquivada e excluída (nulas = visível na lista principal)
-- ---------------------------------------------------------------------------

alter table public.mentor_conversas
  add column arquivada_em timestamptz,
  add column excluida_em timestamptz;

comment on column public.mentor_conversas.arquivada_em is
  'Quando o dono arquivou a conversa; nulo = na lista principal. Arquivar só tira da principal e pode ser desfeito.';
comment on column public.mentor_conversas.excluida_em is
  'Quando o dono excluiu a conversa; nulo = visível para o dono. Excluir esconde do dono e a faxina apaga de verdade após 60 dias (D-75).';

-- ---------------------------------------------------------------------------
-- O dono só muda título, ultima_em e as marcas (mesmo gatilho das imutáveis)
-- ---------------------------------------------------------------------------

create function public.travar_colunas_conversa_mentor()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.restaurante_id is distinct from old.restaurante_id
     or new.criada_em is distinct from old.criada_em then
    raise exception 'conversa do mentor: só o título e o estado (arquivada, excluída) podem mudar'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

comment on function public.travar_colunas_conversa_mentor() is
  'Trava de colunas de mentor_conversas: o dono só muda titulo, ultima_em, arquivada_em e excluida_em. id, restaurante_id e criada_em nunca mudam.';

revoke all on function public.travar_colunas_conversa_mentor() from public, anon, authenticated;

create trigger mentor_conversas_trava_colunas
  before update on public.mentor_conversas
  for each row execute function public.travar_colunas_conversa_mentor();

-- ---------------------------------------------------------------------------
-- Faxina: 60 dias para as excluídas, 12 meses para o resto (D-72 + D-75)
-- ---------------------------------------------------------------------------

create or replace function public.limpar_conversas_mentor()
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  c_prazo constant interval := interval '12 months';
  c_prazo_excluida constant interval := interval '60 days';
  mensagens_apagadas integer := 0;
  conversas_apagadas integer := 0;
  apagadas integer;
begin
  -- Excluída há mais de 60 dias some de verdade, com as mensagens (D-75). A
  -- conversa sai pelo próprio prazo, mesmo recente: excluir é apagar, com
  -- espera de segurança, não arquivar.
  delete from public.mentor_mensagens m
   using public.mentor_conversas c
   where m.conversa_id = c.id
     and c.excluida_em < now() - c_prazo_excluida;
  get diagnostics apagadas = row_count;
  mensagens_apagadas := mensagens_apagadas + apagadas;

  delete from public.mentor_conversas c
   where c.excluida_em < now() - c_prazo_excluida;
  get diagnostics apagadas = row_count;
  conversas_apagadas := conversas_apagadas + apagadas;

  -- O resto segue a regra dos 12 meses (D-72), como antes: cada mensagem vale
  -- pela própria data, e a conversa sai quando é antiga E ficou sem mensagem.
  -- Arquivada (não excluída) entra aqui igual às outras.
  delete from public.mentor_mensagens
   where criada_em < now() - c_prazo;
  get diagnostics apagadas = row_count;
  mensagens_apagadas := mensagens_apagadas + apagadas;

  delete from public.mentor_conversas c
   where c.criada_em < now() - c_prazo
     and not exists (
       select 1 from public.mentor_mensagens m where m.conversa_id = c.id
     );
  get diagnostics apagadas = row_count;
  conversas_apagadas := conversas_apagadas + apagadas;

  return jsonb_build_object(
    'mensagens', mensagens_apagadas,
    'conversas', conversas_apagadas
  );
end;
$$;

comment on function public.limpar_conversas_mentor() is
  'Retenção do mentor (D-72 + D-75): apaga de verdade as conversas excluídas há mais de 60 dias, com as mensagens, e para o resto apaga as mensagens com mais de 12 meses e as conversas antigas que ficaram sem mensagem. Só o service_role executa; o pg_cron chama todo dia (rf-limpa-mentor).';

revoke all on function public.limpar_conversas_mentor() from public, anon, authenticated;
grant execute on function public.limpar_conversas_mentor() to service_role;

commit;

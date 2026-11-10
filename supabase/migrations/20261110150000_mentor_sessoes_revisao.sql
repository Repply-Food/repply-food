-- Agente mentor de IA · sessões: trava por allowlist e faxina ignora excluídas (D-75).
--
-- Correção da revisão da 20261110141031 (só acréscimo, nada editado):
--   * I-1: travar_colunas_conversa_mentor() vira allowlist de verdade — só
--     titulo, ultima_em, arquivada_em e excluida_em podem mudar; qualquer outra
--     coluna (id, restaurante_id, criada_em ou uma futura) barra com 55000. A
--     função também ganha `set search_path = ''`, como as outras do projeto.
--   * I-2: as duas deleções de 12 meses de limpar_conversas_mentor() passam a
--     ignorar as excluídas (`excluida_em is null`). Sem isso, uma conversa
--     criada há 13 meses e excluída há 10 dias sofria hard delete pela regra
--     dos 12 meses antes dos 60 dias da D-75. Excluída só sai pelo corte de
--     60 dias, com as mensagens dela.
--
-- Regras: nada de FORCE ROW LEVEL SECURITY; privilégios inalterados.
begin;

-- ---------------------------------------------------------------------------
-- I-1: trava de colunas por allowlist + sem search_path
-- ---------------------------------------------------------------------------

create or replace function public.travar_colunas_conversa_mentor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  permitida public.mentor_conversas;
begin
  -- Parte da linha antiga e libera só as quatro colunas que o dono pode
  -- mudar. Todo o resto (id, restaurante_id, criada_em e qualquer coluna
  -- futura) barra: o que não está na lista nunca passa.
  permitida := old;
  permitida.titulo := new.titulo;
  permitida.ultima_em := new.ultima_em;
  permitida.arquivada_em := new.arquivada_em;
  permitida.excluida_em := new.excluida_em;
  if new is distinct from permitida then
    raise exception 'conversa do mentor: só o título e o estado (arquivada, excluída) podem mudar'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

comment on function public.travar_colunas_conversa_mentor() is
  'Trava de colunas de mentor_conversas (allowlist): o dono só muda titulo, ultima_em, arquivada_em e excluida_em. Qualquer outra coluna barra com 55000.';

revoke all on function public.travar_colunas_conversa_mentor() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- I-2: a regra dos 12 meses não toca em conversa excluída
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
  -- Arquivada (não excluída) entra aqui igual às outras. Excluída NÃO entra:
  -- ela só sai pelo corte de 60 dias acima, mesmo com 13 meses e mesmo que as
  -- mensagens dela também sejam velhas.
  delete from public.mentor_mensagens m
   where m.criada_em < now() - c_prazo
     and not exists (
       select 1 from public.mentor_conversas c
        where c.id = m.conversa_id
          and c.excluida_em is not null
     );
  get diagnostics apagadas = row_count;
  mensagens_apagadas := mensagens_apagadas + apagadas;

  delete from public.mentor_conversas c
   where c.criada_em < now() - c_prazo
     and c.excluida_em is null
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
  'Retenção do mentor (D-72 + D-75): apaga de verdade as conversas excluídas há mais de 60 dias, com as mensagens, e para o resto (nunca as excluídas) apaga as mensagens com mais de 12 meses e as conversas antigas que ficaram sem mensagem. Só o service_role executa; o pg_cron chama todo dia (rf-limpa-mentor).';

revoke all on function public.limpar_conversas_mentor() from public, anon, authenticated;
grant execute on function public.limpar_conversas_mentor() to service_role;

commit;

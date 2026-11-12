-- Agente mentor de IA · anexos: as fichas dos arquivos que o dono manda (Fase 4).
--
-- Cada linha é a ficha de um arquivo (a foto do cardápio, o PDF da planilha):
-- nome original, tipo, tamanho e o caminho dentro do cofre privado
-- `mentor-anexos`. `conversa_id` diz onde o dono mandou (nulo = anexo geral
-- da casa); apagar a conversa ou a casa leva as fichas junto, em cascata.
--
-- Quem pode o quê:
--   * o dono (quem tem acesso à casa) LÊ as fichas da casa dele; o navegador
--     NUNCA escreve direto — quem grava é a função do servidor, com a chave
--     de serviço (por isso não há política de INSERT/UPDATE/DELETE nem
--     privilégio de escrita para `authenticated`);
--   * o admin da Repply LÊ qualquer casa (suporte, "ver o painel do cliente",
--     D-38) e NÃO escreve: tem_acesso() devolve verdadeiro para o admin em toda
--     casa, então a escrita barraria com "and not eh_admin_repply()" — como não
--     há escrita, só a leitura pede o admin;
--   * sem login (anon) não toca em nada.
--
-- O cofre também é fechado no navegador: sem policies em `storage.objects` de
-- propósito. O navegador nunca baixa direto; quem baixa o arquivo é a função
-- do servidor, com a chave de serviço.
--
-- A faxina ganha um passo: apaga a ficha com mais de 12 meses (D-72, pela
-- `criada_em`), somando no contador de mensagens sem mudar o formato
-- `{mensagens, conversas}`.
--
-- Regras: nada de FORCE ROW LEVEL SECURITY; só acréscimo. Nenhuma função nova
-- (nada entra em tests/isolamento/funcoes-fechadas.test.ts, que só lista o que
-- anon ou authenticated executam).
begin;

-- ---------------------------------------------------------------------------
-- Cofre privado (só a chave de serviço abre; sem policies em storage.objects)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('mentor-anexos', 'mentor-anexos', false);

-- ---------------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------------

create table public.mentor_anexos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  conversa_id uuid null references public.mentor_conversas (id) on delete cascade,
  nome_original text not null check (char_length(nome_original) between 1 and 120),
  tipo text not null check (tipo in ('imagem', 'pdf', 'planilha')),
  tamanho_bytes int not null check (tamanho_bytes > 0 and tamanho_bytes <= 10485760),
  caminho text not null unique,
  criada_em timestamptz not null default now()
);

create index mentor_anexos_restaurante_criada_idx
  on public.mentor_anexos (restaurante_id, criada_em desc);

comment on table public.mentor_anexos is
  'Fichas dos arquivos que o dono mandou ao mentor: nome, tipo, tamanho e caminho no cofre privado mentor-anexos. O dono lê; só a função do servidor escreve (com a chave de serviço).';
comment on column public.mentor_anexos.conversa_id is
  'Onde o dono mandou (nulo = anexo geral da casa). Apagar a conversa leva as fichas dela junto.';
comment on column public.mentor_anexos.caminho is
  'Caminho do arquivo dentro do cofre mentor-anexos (único). O navegador nunca baixa direto: só a função do servidor, com a chave de serviço.';
comment on column public.mentor_anexos.tamanho_bytes is
  'Tamanho do arquivo em bytes (de 1 até 10 MB).';

-- ---------------------------------------------------------------------------
-- RLS: habilitar + política de leitura, no mesmo arquivo
-- ---------------------------------------------------------------------------

alter table public.mentor_anexos enable row level security;

create policy "cliente ou admin leem os anexos do mentor" on public.mentor_anexos
  for select to authenticated
  using (public.tem_acesso(restaurante_id) or public.eh_admin_repply());

-- Sem política de INSERT/UPDATE/DELETE de propósito: o navegador nunca escreve
-- ficha direto. Quem grava é a função do servidor, com a chave de serviço.

-- ---------------------------------------------------------------------------
-- Privilégios explícitos (a RLS decide quem; aqui só o que o produto usa)
-- ---------------------------------------------------------------------------

revoke all on public.mentor_anexos from public, anon, authenticated;
grant select on public.mentor_anexos to authenticated;

-- ---------------------------------------------------------------------------
-- Faxina: apaga a ficha com mais de 12 meses (D-72)
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

  -- As lembranças valem pelo último mexer (`atualizada_em`), não pelo
  -- nascimento: confirmar a ficha renova os 12 meses. Entram no contador de
  -- mensagens para não mudar o formato `{mensagens, conversas}`.
  delete from public.mentor_memorias
   where atualizada_em < now() - c_prazo;
  get diagnostics apagadas = row_count;
  mensagens_apagadas := mensagens_apagadas + apagadas;

  -- Os anexos valem pela data de envio (`criada_em`): ficha com mais de 12
  -- meses sai. Entram no contador de mensagens para não mudar o formato
  -- `{mensagens, conversas}`.
  delete from public.mentor_anexos
   where criada_em < now() - c_prazo;
  get diagnostics apagadas = row_count;
  mensagens_apagadas := mensagens_apagadas + apagadas;

  return jsonb_build_object(
    'mensagens', mensagens_apagadas,
    'conversas', conversas_apagadas
  );
end;
$$;

comment on function public.limpar_conversas_mentor() is
  'Retenção do mentor (D-72 + D-75): apaga de verdade as conversas excluídas há mais de 60 dias, com as mensagens, e para o resto (nunca as excluídas) apaga as mensagens com mais de 12 meses e as conversas antigas que ficaram sem mensagem. Aposenta também as lembranças sem mexer há mais de 12 meses e os anexos com mais de 12 meses. Só o service_role executa; o pg_cron chama todo dia (rf-limpa-mentor).';

revoke all on function public.limpar_conversas_mentor() from public, anon, authenticated;
grant execute on function public.limpar_conversas_mentor() to service_role;

commit;

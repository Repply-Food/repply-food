-- Agente mentor de IA · conversas e mensagens salvas por restaurante.
--
-- Duas tabelas, com RLS no mesmo arquivo (seguranca-e-isolamento.md §2):
--   * mentor_conversas: uma conversa do dono com o mentor;
--   * mentor_mensagens: as mensagens de cada conversa (dono e mentor).
--
-- Quem pode o quê:
--   * o dono (quem tem acesso à casa) lê, cria e altera as conversas e as
--     mensagens da casa dele; ninguém apaga por aqui (o histórico só sai junto
--     com a casa, pelo "on delete cascade");
--   * o admin da Repply LÊ qualquer casa (suporte, "ver o painel do cliente",
--     D-38) e NÃO escreve: tem_acesso() devolve verdadeiro para o admin em toda
--     casa, então as políticas de escrita pedem "and not eh_admin_repply()", o
--     mesmo conserto que as metas ganharam (20261011201500);
--   * sem login (anon) não toca em nada.
--
-- Regras: nada de FORCE ROW LEVEL SECURITY; restaurante_id imutável pelo
-- gatilho freeze_restaurante_id; nenhuma função nova (nada entra em
-- tests/isolamento/funcoes-fechadas.test.ts).
begin;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.mentor_conversas (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  titulo         text,
  criada_em      timestamptz not null default now(),
  ultima_em      timestamptz not null default now()
);

create index mentor_conversas_restaurante_ultima_idx
  on public.mentor_conversas (restaurante_id, ultima_em desc);

comment on table public.mentor_conversas is
  'Conversas do dono com o mentor de IA, por restaurante. Dono lê, cria e altera; admin só lê.';
comment on column public.mentor_conversas.ultima_em is
  'Momento da última mensagem; ordena a lista de conversas (mais recente primeiro).';

create table public.mentor_mensagens (
  id                 uuid primary key default gen_random_uuid(),
  conversa_id        uuid not null references public.mentor_conversas (id) on delete cascade,
  restaurante_id     uuid not null references public.restaurantes (id) on delete cascade,
  papel              text not null check (papel in ('dono', 'mentor')),
  texto              text not null,
  ferramentas_usadas jsonb,
  criada_em          timestamptz not null default now()
);

create index mentor_mensagens_conversa_criada_idx
  on public.mentor_mensagens (conversa_id, criada_em);

comment on table public.mentor_mensagens is
  'Mensagens de cada conversa do mentor. restaurante_id repete o da conversa e a política de escrita confere que batem.';
comment on column public.mentor_mensagens.papel is
  'Quem falou: dono (a pergunta) ou mentor (a resposta).';
comment on column public.mentor_mensagens.ferramentas_usadas is
  'Quais métricas o mentor consultou para responder (só na mensagem do mentor); nulo quando não consultou nenhuma.';

-- ---------------------------------------------------------------------------
-- restaurante_id imutável (mesmo gatilho das outras tabelas da casa)
-- ---------------------------------------------------------------------------

create trigger mentor_conversas_freeze_restaurante
  before update on public.mentor_conversas
  for each row execute function public.freeze_restaurante_id();

create trigger mentor_mensagens_freeze_restaurante
  before update on public.mentor_mensagens
  for each row execute function public.freeze_restaurante_id();

-- ---------------------------------------------------------------------------
-- RLS: habilitar + políticas, no mesmo arquivo
-- ---------------------------------------------------------------------------

alter table public.mentor_conversas enable row level security;
alter table public.mentor_mensagens enable row level security;

-- mentor_conversas
create policy "cliente ou admin leem as conversas do mentor" on public.mentor_conversas
  for select to authenticated
  using (public.tem_acesso(restaurante_id) or public.eh_admin_repply());
create policy "cliente cria conversa do mentor na casa dele" on public.mentor_conversas
  for insert to authenticated
  with check (public.tem_acesso(restaurante_id) and not public.eh_admin_repply());
create policy "cliente altera conversa do mentor da casa dele" on public.mentor_conversas
  for update to authenticated
  using (public.tem_acesso(restaurante_id) and not public.eh_admin_repply())
  with check (public.tem_acesso(restaurante_id) and not public.eh_admin_repply());

-- mentor_mensagens
-- Além da casa, a escrita confere que a conversa citada é da MESMA casa: a chave
-- estrangeira sozinha não olha a RLS, e sem esta conferência o dono de uma casa
-- poderia pendurar uma mensagem numa conversa de outra casa. O "exists" lê
-- mentor_conversas com a RLS de quem escreve, então só enxerga as conversas
-- que ele pode ver.
create policy "cliente ou admin leem as mensagens do mentor" on public.mentor_mensagens
  for select to authenticated
  using (public.tem_acesso(restaurante_id) or public.eh_admin_repply());
create policy "cliente grava mensagem do mentor na casa dele" on public.mentor_mensagens
  for insert to authenticated
  with check (
    public.tem_acesso(restaurante_id)
    and not public.eh_admin_repply()
    and exists (
      select 1 from public.mentor_conversas c
       where c.id = mentor_mensagens.conversa_id
         and c.restaurante_id = mentor_mensagens.restaurante_id
    )
  );
create policy "cliente altera mensagem do mentor da casa dele" on public.mentor_mensagens
  for update to authenticated
  using (public.tem_acesso(restaurante_id) and not public.eh_admin_repply())
  with check (
    public.tem_acesso(restaurante_id)
    and not public.eh_admin_repply()
    and exists (
      select 1 from public.mentor_conversas c
       where c.id = mentor_mensagens.conversa_id
         and c.restaurante_id = mentor_mensagens.restaurante_id
    )
  );

-- ---------------------------------------------------------------------------
-- Privilégios explícitos (a RLS decide quem; aqui só o que o produto usa)
-- ---------------------------------------------------------------------------

revoke all on public.mentor_conversas from public, anon, authenticated;
revoke all on public.mentor_mensagens from public, anon, authenticated;
grant select, insert, update on public.mentor_conversas to authenticated;
grant select, insert, update on public.mentor_mensagens to authenticated;

commit;

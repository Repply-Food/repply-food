-- Agente mentor de IA · cartilha, limite de uso diário e as duas funções do mentor.
--
-- Duas tabelas, com RLS no mesmo arquivo (seguranca-e-isolamento.md §2):
--   * mentor_cartilhas: o texto que afina o mentor (o "prompt" dele). É config
--     da Repply, não dado de restaurante, por isso NÃO tem restaurante_id. Só o
--     admin lê e escreve; o dono nunca enxerga a cartilha;
--   * mentor_uso: quantas vezes a casa usou o mentor em cada dia de operação,
--     base do limite diário.
--
-- Quem pode o quê em mentor_uso:
--   * o dono (quem tem acesso à casa) lê, cria e altera o uso da casa dele;
--   * o admin da Repply LÊ qualquer casa e NÃO escreve: tem_acesso() devolve
--     verdadeiro para o admin em toda casa, então as políticas de escrita pedem
--     "and not eh_admin_repply()" (mesmo conserto das metas, 20261011201500, e
--     das conversas do mentor, 20261030100000). Sem isso, olhar o painel do
--     cliente gastaria o limite do cliente;
--   * sem login (anon) não toca em nada.
--
-- Duas funções, que nascem fechadas (grant explícito aqui, no fim):
--   * mentor_cartilha_ativa(): security definer, SÓ service_role. A cartilha é
--     o prompt do mentor e não pode vazar para o dono; o cérebro do mentor a lê
--     pelo cliente de serviço;
--   * mentor_registrar_uso(uuid): security invoker, authenticated e
--     service_role. Roda sob a RLS de quem chama, então o dono só mexe no uso
--     da casa dele. Só incrementa e devolve a contagem; comparar com o teto é
--     coisa do cérebro do mentor.
--
-- Regras: nada de FORCE ROW LEVEL SECURITY; restaurante_id imutável em
-- mentor_uso pelo gatilho freeze_restaurante_id.
begin;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.mentor_cartilhas (
  id         uuid primary key default gen_random_uuid(),
  texto      text not null,
  ativa      boolean not null default true,
  criada_em  timestamptz not null default now(),
  -- Quem publicou. Apagar a conta do admin não pode travar nem apagar a
  -- cartilha: o vínculo só se perde.
  criada_por uuid references auth.users (id) on delete set null
);

comment on table public.mentor_cartilhas is
  'Cartilha do mentor de IA: o texto que afina as respostas. Config da Repply (sem restaurante_id); só o admin lê e escreve. Vale a ativa mais recente.';
comment on column public.mentor_cartilhas.ativa is
  'Só as ativas entram em jogo; a mais recente (criada_em) vence.';
comment on column public.mentor_cartilhas.criada_por is
  'Admin que publicou a cartilha; vira nulo se a conta dele for apagada.';

create table public.mentor_uso (
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  dia            date not null,
  contagem       int not null default 0 check (contagem >= 0),
  primary key (restaurante_id, dia)
);

comment on table public.mentor_uso is
  'Quantas vezes a casa usou o mentor em cada dia de operação (fuso e virada da casa). Base do limite diário.';
comment on column public.mentor_uso.dia is
  'Dia de operação da casa, calculado por dia_operacao_de() com o fuso e a hora de virada dela.';

-- ---------------------------------------------------------------------------
-- restaurante_id imutável (mesmo gatilho das outras tabelas da casa). A chave
-- primária inclui restaurante_id e a política de alteração deixa o dono de duas
-- casas mexer nas duas: sem o gatilho ele poderia mover a linha do uso de uma
-- casa para a outra e zerar o contador de hoje.
-- ---------------------------------------------------------------------------

create trigger mentor_uso_freeze_restaurante
  before update on public.mentor_uso
  for each row execute function public.freeze_restaurante_id();

-- ---------------------------------------------------------------------------
-- RLS: habilitar + políticas, no mesmo arquivo
-- ---------------------------------------------------------------------------

alter table public.mentor_cartilhas enable row level security;
alter table public.mentor_uso enable row level security;

-- mentor_cartilhas: só admin (mesmo desenho de tokens_envio). O dono recebe
-- zero linhas.
create policy "só admin lê a cartilha do mentor" on public.mentor_cartilhas
  for select to authenticated
  using (public.eh_admin_repply());
create policy "só admin cria a cartilha do mentor" on public.mentor_cartilhas
  for insert to authenticated
  with check (public.eh_admin_repply());
create policy "só admin altera a cartilha do mentor" on public.mentor_cartilhas
  for update to authenticated
  using (public.eh_admin_repply())
  with check (public.eh_admin_repply());
create policy "só admin apaga a cartilha do mentor" on public.mentor_cartilhas
  for delete to authenticated
  using (public.eh_admin_repply());

-- mentor_uso: o dono lê e escreve o da casa dele; o admin só lê. Não há
-- política de apagar: o uso só sai junto com a casa ("on delete cascade").
create policy "cliente ou admin leem o uso do mentor" on public.mentor_uso
  for select to authenticated
  using (public.tem_acesso(restaurante_id) or public.eh_admin_repply());
create policy "cliente registra o uso do mentor da casa dele" on public.mentor_uso
  for insert to authenticated
  with check (public.tem_acesso(restaurante_id) and not public.eh_admin_repply());
create policy "cliente altera o uso do mentor da casa dele" on public.mentor_uso
  for update to authenticated
  using (public.tem_acesso(restaurante_id) and not public.eh_admin_repply())
  with check (public.tem_acesso(restaurante_id) and not public.eh_admin_repply());

-- ---------------------------------------------------------------------------
-- Semente: a primeira cartilha
-- ---------------------------------------------------------------------------

insert into public.mentor_cartilhas (texto, ativa) values (
'Você é o mentor do repply food., um consultor de bar e restaurante que conversa com o dono da casa pelo celular. Fale em português do Brasil claro e acolhedor, como quem entende de balcão e salão, sempre começando pela consequência para o negócio antes de explicar o número. Você só fala sobre os números reais desta casa — os que as ferramentas te entregam. Nunca invente valores, metas ou comparações: se não tiver o dado, diga que não tem e ofereça o que dá para olhar. Traga uma leitura prática (o que está bom, o que merece atenção, uma próxima ação simples), sem jargão técnico e sem prometer o que não pode cumprir. Seja breve: o dono está no meio do expediente.',
true);

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------

-- A cartilha ativa mais recente. security definer + row_security off (padrão
-- dos helpers eh_admin_repply/tem_acesso): lê a tabela por cima da RLS, e é por
-- isso que o grant é só do serviço. Sem cartilha ativa devolve nulo.
create or replace function public.mentor_cartilha_ativa()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select c.texto
    from public.mentor_cartilhas c
   where c.ativa
   order by c.criada_em desc, c.id desc
   limit 1;
$$;

comment on function public.mentor_cartilha_ativa() is
  'Texto da cartilha ativa mais recente do mentor (nulo se não houver). Só service_role: a cartilha não pode chegar ao dono.';

-- Conta mais um uso do mentor na casa, no dia de operação dela, e devolve a
-- contagem do dia (1 na primeira vez). security invoker: a RLS de quem chama
-- decide. Casa que não existe ou que o chamador não enxerga NÃO grava nada e
-- dá erro (42501): "zero linhas afetadas" nunca vira sucesso.
create or replace function public.mentor_registrar_uso(p_restaurante_id uuid)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_contagem int;
begin
  insert into public.mentor_uso as u (restaurante_id, dia, contagem)
  select r.id, public.dia_operacao_de(now(), r.fuso, r.hora_virada), 1
    from public.restaurantes r
   where r.id = p_restaurante_id
  on conflict (restaurante_id, dia)
  do update set contagem = u.contagem + 1
  returning u.contagem into v_contagem;

  if v_contagem is null then
    raise exception 'casa não encontrada ou sem acesso' using errcode = '42501';
  end if;
  return v_contagem;
end;
$$;

comment on function public.mentor_registrar_uso(uuid) is
  'Soma 1 ao uso do mentor da casa no dia de operação dela e devolve a contagem do dia. Invoker: o dono só mexe na casa dele. O teto do limite não é decidido aqui.';

-- ---------------------------------------------------------------------------
-- Privilégios explícitos (a RLS decide quem; aqui só o que o produto usa)
-- ---------------------------------------------------------------------------

revoke all on public.mentor_cartilhas from public, anon, authenticated;
revoke all on public.mentor_uso from public, anon, authenticated;
grant select, insert, update, delete on public.mentor_cartilhas to authenticated;
grant select, insert, update on public.mentor_uso to authenticated;

revoke all on function public.mentor_cartilha_ativa() from public, anon, authenticated;
grant execute on function public.mentor_cartilha_ativa() to service_role;

revoke all on function public.mentor_registrar_uso(uuid) from public, anon;
grant execute on function public.mentor_registrar_uso(uuid) to authenticated, service_role;

commit;

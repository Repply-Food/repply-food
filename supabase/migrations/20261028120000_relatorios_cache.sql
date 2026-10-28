-- Cache separado do staging; escrita somente pelas futuras RPCs privilegiadas.
begin;

create table public.relatorio_cargas (
  restaurante_id uuid not null references public.restaurantes(id),
  id uuid not null,
  relatorio text not null,
  dia_movimento date not null,
  fonte text not null check (fonte in ('historico','online')),
  sequencia bigint not null check (sequencia > 0),
  capturado_em timestamptz not null,
  natureza text not null check (natureza in ('scc','simulacao')),
  recursos text[] not null,
  total_paginas int not null check (total_paginas between 1 and 200),
  total_linhas int not null check (total_linhas between 0 and 100000),
  estado text not null check (estado in ('recebendo','publicada','substituida','expirada')),
  bytes_recebidos bigint not null default 0,
  revisao_publicada bigint,
  criada_em timestamptz not null default now(),
  publicada_em timestamptz,
  primary key(restaurante_id,id),
  unique(restaurante_id,relatorio,dia_movimento,fonte,sequencia),
  check (relatorio in ('financeiro','produtos','comissao','caixa','auditoria','notas-assinadas'))
);
create table public.relatorio_paginas (
  restaurante_id uuid not null, carga_id uuid not null,
  numero int not null check (numero between 1 and 200),
  dados jsonb, hash text not null, quantidade int not null,
  bytes int not null,
  primary key(restaurante_id,carga_id,numero),
  foreign key(restaurante_id,carga_id) references public.relatorio_cargas(restaurante_id,id)
);
create table public.relatorio_versoes (
  restaurante_id uuid primary key references public.restaurantes(id),
  revisao bigint not null default 0
);
create table public.relatorio_publicacoes (
  restaurante_id uuid not null references public.restaurantes(id),
  relatorio text not null, dia_movimento date not null, fonte text not null,
  carga_id uuid not null, sequencia bigint not null,
  capturado_em timestamptz not null, publicada_em timestamptz not null default now(),
  natureza text not null, recursos text[] not null, quantidade int not null,
  primary key(restaurante_id,relatorio,dia_movimento,fonte),
  foreign key(restaurante_id,carga_id) references public.relatorio_cargas(restaurante_id,id)
);
create table public.relatorio_linhas (
  restaurante_id uuid not null, relatorio text not null,
  dia_movimento date not null, fonte text not null,
  posicao int not null, dados jsonb not null,
  primary key(restaurante_id,relatorio,dia_movimento,fonte,posicao),
  foreign key(restaurante_id,relatorio,dia_movimento,fonte)
    references public.relatorio_publicacoes(restaurante_id,relatorio,dia_movimento,fonte)
);

alter table public.relatorio_cargas add constraint relatorio_cargas_recursos_validos check (array_position(recursos,null) is null and case relatorio
      when 'financeiro' then recursos <@ array[]::text[] and cardinality(recursos) = (0)
      when 'produtos' then recursos <@ array['pdv','grupo','garcom','mesa']::text[] and cardinality(recursos) = (case when 'pdv' = any(recursos) then 1 else 0 end + case when 'grupo' = any(recursos) then 1 else 0 end + case when 'garcom' = any(recursos) then 1 else 0 end + case when 'mesa' = any(recursos) then 1 else 0 end)
      when 'comissao' then recursos <@ array['operador']::text[] and cardinality(recursos) = (case when 'operador' = any(recursos) then 1 else 0 end)
      when 'caixa' then recursos <@ array['operador','tipo','categoria']::text[] and cardinality(recursos) = (case when 'operador' = any(recursos) then 1 else 0 end + case when 'tipo' = any(recursos) then 1 else 0 end + case when 'categoria' = any(recursos) then 1 else 0 end)
      when 'auditoria' then recursos <@ array['operador','tipo']::text[] and cardinality(recursos) = (case when 'operador' = any(recursos) then 1 else 0 end + case when 'tipo' = any(recursos) then 1 else 0 end)
      when 'notas-assinadas' then recursos <@ array['cliente']::text[] and cardinality(recursos) = (case when 'cliente' = any(recursos) then 1 else 0 end)
      else false end);

alter table public.relatorio_publicacoes add constraint relatorio_publicacoes_recursos_validos check (array_position(recursos,null) is null and case relatorio
      when 'financeiro' then recursos <@ array[]::text[] and cardinality(recursos) = (0)
      when 'produtos' then recursos <@ array['pdv','grupo','garcom','mesa']::text[] and cardinality(recursos) = (case when 'pdv' = any(recursos) then 1 else 0 end + case when 'grupo' = any(recursos) then 1 else 0 end + case when 'garcom' = any(recursos) then 1 else 0 end + case when 'mesa' = any(recursos) then 1 else 0 end)
      when 'comissao' then recursos <@ array['operador']::text[] and cardinality(recursos) = (case when 'operador' = any(recursos) then 1 else 0 end)
      when 'caixa' then recursos <@ array['operador','tipo','categoria']::text[] and cardinality(recursos) = (case when 'operador' = any(recursos) then 1 else 0 end + case when 'tipo' = any(recursos) then 1 else 0 end + case when 'categoria' = any(recursos) then 1 else 0 end)
      when 'auditoria' then recursos <@ array['operador','tipo']::text[] and cardinality(recursos) = (case when 'operador' = any(recursos) then 1 else 0 end + case when 'tipo' = any(recursos) then 1 else 0 end)
      when 'notas-assinadas' then recursos <@ array['cliente']::text[] and cardinality(recursos) = (case when 'cliente' = any(recursos) then 1 else 0 end)
      else false end);

alter table public.relatorio_cargas
  add check (bytes_recebidos between 0 and 33554432),
  add check (revisao_publicada is null or revisao_publicada > 0);
alter table public.relatorio_paginas
  add check (quantidade between 0 and 500),
  add check (bytes between 0 and 1048576),
  add check (dados is null or (jsonb_typeof(dados) = 'array'
    and jsonb_array_length(dados) = quantidade));
alter table public.relatorio_versoes add check (revisao >= 0);
alter table public.relatorio_publicacoes
  add check (relatorio in ('financeiro','produtos','comissao','caixa','auditoria','notas-assinadas')),
  add check (fonte in ('historico','online')),
  add check (natureza in ('scc','simulacao')),
  add check (sequencia > 0),
  add check (quantidade between 0 and 100000);
alter table public.relatorio_linhas
  add check (posicao between 1 and 100000);

create index relatorio_publicacoes_intervalo
  on public.relatorio_publicacoes (restaurante_id,relatorio,fonte,dia_movimento);
create index relatorio_linhas_intervalo
  on public.relatorio_linhas (restaurante_id,relatorio,fonte,dia_movimento);
create index relatorio_cargas_expiracao on public.relatorio_cargas (estado,criada_em);

alter table public.relatorio_cargas enable row level security;
revoke all on public.relatorio_cargas from public, anon, authenticated, service_role;
create trigger relatorio_cargas_freeze_restaurante
  before update on public.relatorio_cargas
  for each row execute function public.freeze_restaurante_id();

alter table public.relatorio_paginas enable row level security;
revoke all on public.relatorio_paginas from public, anon, authenticated, service_role;
create trigger relatorio_paginas_freeze_restaurante
  before update on public.relatorio_paginas
  for each row execute function public.freeze_restaurante_id();

alter table public.relatorio_versoes enable row level security;
revoke all on public.relatorio_versoes from public, anon, authenticated, service_role;
create trigger relatorio_versoes_freeze_restaurante
  before update on public.relatorio_versoes
  for each row execute function public.freeze_restaurante_id();
grant select on public.relatorio_versoes to authenticated;
create policy relatorio_versoes_leitura on public.relatorio_versoes
  for select to authenticated
  using (public.tem_acesso(restaurante_id) or public.eh_admin_repply());

alter table public.relatorio_publicacoes enable row level security;
revoke all on public.relatorio_publicacoes from public, anon, authenticated, service_role;
create trigger relatorio_publicacoes_freeze_restaurante
  before update on public.relatorio_publicacoes
  for each row execute function public.freeze_restaurante_id();
grant select on public.relatorio_publicacoes to authenticated;
create policy relatorio_publicacoes_leitura on public.relatorio_publicacoes
  for select to authenticated
  using (public.tem_acesso(restaurante_id) or public.eh_admin_repply());

alter table public.relatorio_linhas enable row level security;
revoke all on public.relatorio_linhas from public, anon, authenticated, service_role;
create trigger relatorio_linhas_freeze_restaurante
  before update on public.relatorio_linhas
  for each row execute function public.freeze_restaurante_id();
grant select on public.relatorio_linhas to authenticated;
create policy relatorio_linhas_leitura on public.relatorio_linhas
  for select to authenticated
  using (public.tem_acesso(restaurante_id) or public.eh_admin_repply());

-- SECURITY DEFINER das RPCs usa o proprietário; service_role não precisa de DML direto.
commit;

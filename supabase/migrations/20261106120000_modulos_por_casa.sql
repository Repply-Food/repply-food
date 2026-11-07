-- Módulos opcionais por casa. Vazio = nenhum: toda casa (as existentes e as
-- novas) nasce sem módulo opcional, inclusive o mentor. Sem mudança de RLS: a
-- coluna herda a política de `restaurantes` (dono lê a própria; só admin escreve).
alter table public.restaurantes
  add column modulos text[] not null default '{}';

comment on column public.restaurantes.modulos is
  'Módulos opcionais ligados na casa (ex.: mentor). Vazio = nenhum. Os módulos centrais do MVP não entram aqui.';

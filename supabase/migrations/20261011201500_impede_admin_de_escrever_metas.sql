drop policy "cliente cria a meta dele" on public.metas;
drop policy "cliente altera a meta dele" on public.metas;
drop policy "cliente exclui a meta dele" on public.metas;

create policy "cliente cria a meta dele" on public.metas
  for insert with check (public.tem_acesso(restaurante_id) and not public.eh_admin_repply());
create policy "cliente altera a meta dele" on public.metas
  for update using (public.tem_acesso(restaurante_id) and not public.eh_admin_repply())
  with check (public.tem_acesso(restaurante_id) and not public.eh_admin_repply());
create policy "cliente exclui a meta dele" on public.metas
  for delete using (public.tem_acesso(restaurante_id) and not public.eh_admin_repply());

-- Função nova nasce fechada.
--
-- No Postgres toda função nasce executável por PUBLIC, e o Supabase ainda
-- concede EXECUTE a anon e authenticated em tudo que é criado em "public".
-- Daqui em diante, quem cria função que o painel chama precisa dar o grant
-- de propósito, na própria migration, e a função precisa conferir o acesso
-- por dentro (seguranca-e-isolamento.md §2).
begin;

-- 1. Padrão para o que for criado daqui em diante. O padrão embutido (PUBLIC)
--    só sai sem "in schema"; o do Supabase (anon/authenticated) é por schema.
alter default privileges revoke execute on functions from public;
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- 2. Funções que já existem e nenhum login precisa chamar: só as funções
--    internas (security definer) as usam.
revoke execute on function public.btrim_null(text) from public, anon, authenticated;
revoke execute on function public.normaliza_numeric(text) from public, anon, authenticated;
revoke execute on function public.dia_operacao_de(timestamptz, text, time) from public, anon, authenticated;
revoke execute on function public.esta_aberto_agora(jsonb, text) from public, anon, authenticated;

-- 3. As que continuam abertas, de propósito:
--    tem_acesso e eh_admin_repply rodam dentro das políticas de RLS, inclusive
--    para quem não tem login (que assim recebe "vazio" em vez de erro);
--    atualizar_turnos confere o acesso por dentro (D-35).
revoke execute on function public.tem_acesso(uuid) from public;
revoke execute on function public.eh_admin_repply() from public;
grant execute on function public.tem_acesso(uuid) to anon, authenticated, service_role;
grant execute on function public.eh_admin_repply() to anon, authenticated, service_role;

commit;

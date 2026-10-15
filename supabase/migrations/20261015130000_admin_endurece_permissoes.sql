-- Etapa 3 · Admin da Repply: endurecimento apontado na revisão da Tarefa 1
-- (migration 20261015120000_admin_da_repply, que não se edita).
--
--   1. tokens_envio: ninguém escreve direto, nem o admin. A troca e a
--      revogação passam só por trocar_token_envio e revogar_tokens_envio
--      (D-38), que gravam o histórico na mesma transação;
--   2. registro_admin: o admin informa só autor, restaurante_id, acao e
--      detalhe. O id e a hora (criado_em) são do banco; senão o admin
--      escolheria a hora do próprio registro e driblaria o limite de "abriu o
--      painel" por hora;
--   3. a sequência do id do histórico não é de anon nem de authenticated.
--
-- Regras: nada de FORCE ROW LEVEL SECURITY; migration anterior intocada.
begin;

-- ---------------------------------------------------------------------------
-- 1. tokens_envio: sem escrita direta
-- ---------------------------------------------------------------------------

-- A RLS deixava o admin inserir, alterar e apagar tokens direto na tabela,
-- sem passar pelo histórico. As duas funções são security definer (rodam como
-- o dono da tabela) e não precisam deste privilégio. O SELECT fica: o admin lê
-- (nunca o hash, que a tela não pede) para listar os tokens da casa.
revoke insert, update, delete on public.tokens_envio from anon, authenticated;

comment on table public.tokens_envio is
  'Tokens de envio do SCC (guardados só como hash). Nenhum login escreve aqui direto, nem o admin: a troca e a revogação passam só por trocar_token_envio e revogar_tokens_envio (security definer), que gravam o histórico junto. O admin só lê.';

-- ---------------------------------------------------------------------------
-- 2. registro_admin: id e hora são do banco
-- ---------------------------------------------------------------------------

-- Troca o INSERT da tabela inteira por INSERT só nas quatro colunas que o admin
-- preenche. Quem informar id ou criado_em recebe 42501. As funções
-- trocar_token_envio e revogar_tokens_envio gravam como dono da tabela e não
-- são afetadas. A RLS continua exigindo eh_admin_repply() e autor = auth.uid().
revoke insert on public.registro_admin from authenticated;
grant insert (autor, restaurante_id, acao, detalhe) on public.registro_admin to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Sequência do histórico
-- ---------------------------------------------------------------------------

-- A coluna de identidade (generated always as identity) não confere privilégio
-- na sequência ao inserir. Sem isto, qualquer login poderia chamar nextval e
-- queimar o contador do histórico.
revoke all on sequence public.registro_admin_id_seq from anon, authenticated;

commit;

/**
 * A regra de senha num lugar só (seguranca-e-isolamento.md §5, D-46).
 * O Supabase Auth usa o mesmo número em `supabase/config.toml`
 * (`minimum_password_length`); o teste `tests/auth/regra-de-senha.test.ts`
 * reprova se os dois divergirem.
 */
export const SENHA_MINIMA = 8;

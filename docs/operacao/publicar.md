# Publicar (banco, funções e painel)

*Fase de piloto, sem cliente pagante (D-09): Supabase **Free**, numa organização própria na conta do Lucas Ferreira, e painel na **Vercel Hobby**, com deploy manual pela linha de comando, como o Repply CRM faz. No primeiro cliente pagante, siga [`migrar-para-pro.md`](migrar-para-pro.md).*

> Este roteiro é preenchido com os comandos exatos assim que o projeto tiver código. Abaixo está o que já está decidido.

## 1. Banco e Edge Functions (Supabase)

- **Migrations:** em `supabase/migrations/`, aplicadas com a CLI do Supabase. Nunca pelo painel.
- **Edge Functions:** `receber-envio` e `enviar-alerta`, publicadas pela CLI.
  - `receber-envio` tem `verify_jwt = false` no `config.toml`, com comentário.
- **Segredos das funções**, configurados na CLI ou no painel, **nunca** no git:
  - `RESEND_API_KEY`
  - `ALERTA_EMAIL_PARA`
  - `ALERTA_EMAIL_DE`
- **Vault:** a chave que o pg_net usa para chamar `enviar-alerta`.
- **pg_cron:** rotinas `vigia` (5 min) e `retencao-envios` (diária).
- **Auth:**
  - senha mínima de 8;
  - URL do site = `food.repplyhub.com.br`;
  - modelos de e-mail na marca;
  - **SMTP próprio (Resend)** antes do primeiro cliente, porque o SMTP padrão do Supabase tem limite baixo de envios.

**Atenção ao plano Free:**
- sem backup automático. O banco é cópia do SCC, então dá para pedir reenvio do zero;
- o projeto pausa depois de 7 dias sem uso. Com um restaurante enviando, não pausa. Na fase de desenvolvimento, despause pelo painel.

## 2. Painel (Vercel Hobby)

- O deploy é **manual, pela CLI**, a partir de uma cópia limpa do `main`. É o mesmo método do CRM: o plano Hobby não publica sozinho a partir de repositório privado de organização.
- **Variáveis** (lista completa no `.env.example`):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_APP_URL`
  - `RESEND_API_KEY`
- **Domínio:** `food.repplyhub.com.br` (D-31), um CNAME para a Vercel no provedor de DNS do `repplyhub.com.br`.
- **Lembrete:** o Hobby **proíbe uso comercial**. Serve para desenvolvimento, demonstração e piloto gratuito. Para cliente pagante, veja [`migrar-para-pro.md`](migrar-para-pro.md).

## 3. Antes de publicar

- [ ] Tipos, lint, testes e build passando (a verificação obrigatória do `CLAUDE.md`).
- [ ] Migrations novas testadas no ambiente local.
- [ ] O roteiro de demonstração (spec §8) roda inteiro com o gerador de dados fictícios.

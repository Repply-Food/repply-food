# Publicar (banco, funções e painel)

*Fase de piloto, sem cliente pagante (D-09): Supabase **Free**, numa organização própria na conta do Lucas Ferreira, e painel na **Vercel Hobby**, com **deploy automático pela Vercel** (o repositório é público — D-62). No primeiro cliente pagante, siga [`migrar-para-pro.md`](migrar-para-pro.md).*

> **Publicado em 16/10/2026** (etapa 4b). O projeto Supabase e as contas Vercel e Resend são **dedicados ao Food** (D-63); o repositório é **público** para a Vercel publicar sozinha de graça (D-62). Abaixo estão os passos reais. A CLI do Supabase fala com o projeto da nuvem por um acesso temporário da conta logada (`cli/login-role`), **sem pedir a senha do banco**. As edições do `config.toml` para a nuvem usam o endereço de produção **só na hora do `config push`** e são revertidas logo depois (`git checkout -- supabase/config.toml`); o arquivo versionado aponta sempre para o local.

## 1. Banco e Edge Functions (Supabase)

- **Migrations:** em `supabase/migrations/`, aplicadas com a CLI do Supabase. Nunca pelo painel.
- **Edge Functions:** `receber-envio` e `enviar-alerta`, publicadas pela CLI.
  - `receber-envio` tem `verify_jwt = false` no `config.toml`, com comentário.
- **Segredos das funções**, configurados na CLI ou no painel, **nunca** no git:
  - `RESEND_API_KEY`
  - `ALERTA_EMAIL_PARA`
  - `ALERTA_EMAIL_DE`
- **Vault:** a chave que o pg_net usa para chamar `enviar-alerta`.
- **pg_cron:** as rotinas automáticas se chamam `rf-vigia` (a cada 5 min) e `rf-retencao` (diária).
- **Auth** (os mesmos valores de `supabase/config.toml`; na nuvem se configura no painel ou por `config push`, com autorização):
  - **cadastro público desligado**: a conta é criada pelo admin (D-11);
  - o login por e-mail continua ligado;
  - senha mínima de 8 (`lib/auth/senha.ts`);
  - URL do site = `food.repplyhub.com.br`;
  - modelos de e-mail na marca;
  - **SMTP próprio (Resend)** antes do primeiro cliente, porque o SMTP padrão do Supabase tem limite baixo de envios.

**Os comandos reais (CLI do Supabase, rodados de `repositorio/`):**

```bash
# tabelas do banco (aplica as migrations na nuvem)
npx supabase db push --linked

# a função que recebe o SCC, sem Docker, com verify_jwt = false (do config.toml)
npx supabase functions deploy receber-envio --use-api

# login (Auth): edite site_url e additional_redirect_urls do config.toml para
# https://food.repplyhub.com.br SÓ nesta hora, depois reverta o arquivo
npx supabase config push --yes
git checkout -- supabase/config.toml
```

- O **modelo de e-mail com a marca** (`supabase/templates/recuperar-senha.html`) sobe no `config push`, mas o Free **só aceita modelo próprio depois do SMTP do Resend ligado** — ligue o SMTP primeiro.
- O **pg_cron** (`rf-vigia`, `rf-retencao`) é criado pelas migrations; confira no painel. O **pg_net** e o **Vault** só entram no alarme do vigia (etapa 9).
- O **primeiro admin** é criado à mão: no painel do Supabase, **Authentication → Add user** (com "Auto Confirm User"), e depois `insert into public.admins_repply (user_id) values ('<uid>');` no editor de SQL.

**Atenção ao plano Free:**
- sem backup automático. O banco é cópia do SCC, então dá para pedir reenvio do zero;
- o projeto pausa depois de 7 dias sem uso. Com um restaurante enviando, não pausa. Na fase de desenvolvimento, despause pelo painel.

## 2. Painel (Vercel Hobby)

- O deploy é **automático pela Vercel**: a conta nova do Food (dedicada, não a do CRM) está ligada ao repositório no GitHub pelo app oficial da Vercel e **publica a cada push no `main`**. Isso só é grátis no Hobby porque o repositório é **público** (D-62) — privado de organização exigiria o Pro, pago. (Projeto criado pela importação do repo no painel da Vercel.)
- **Variáveis** (postas no painel da Vercel; lista completa no `.env.example`):
  - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (a `anon` é pública por design, protegida pela RLS);
  - `SUPABASE_SERVICE_ROLE_KEY` (secreta, **nunca** `NEXT_PUBLIC_`);
  - `NEXT_PUBLIC_APP_URL = https://food.repplyhub.com.br`;
  - `RESEND_API_KEY` (entra com o alarme do vigia, etapa 9).
- **Domínio:** `food.repplyhub.com.br` (D-31), adicionado no projeto da Vercel, com o registro de DNS que ela indica (um CNAME) no provedor de DNS do `repplyhub.com.br`. A Vercel emite o certificado (HTTPS) sozinha.
- **Lembrete:** o Hobby **proíbe uso comercial**. Serve para desenvolvimento, demonstração e piloto gratuito. Para cliente pagante, veja [`migrar-para-pro.md`](migrar-para-pro.md).

## 3. Antes de publicar

- [ ] Tipos, lint, testes e build passando (a verificação obrigatória do `CLAUDE.md`).
- [ ] Migrations novas testadas no ambiente local.
- [ ] O roteiro de demonstração (spec §8) roda inteiro com o gerador de dados fictícios.

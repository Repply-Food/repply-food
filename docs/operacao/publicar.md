# Publicar (banco, funções e painel)

*Fase de piloto, sem cliente pagante (D-09): Supabase **Free**, numa organização própria na conta do Lucas Ferreira, e painel na **Vercel Hobby**, com **deploy automático pela Vercel** (o repositório é público — D-62). No primeiro cliente pagante, siga [`migrar-para-pro.md`](migrar-para-pro.md).*

> **Publicado em 16/10/2026** (etapa 4b). O projeto Supabase e as contas Vercel e Resend são **dedicados ao Food** (D-63); o repositório é **público** para a Vercel publicar sozinha de graça (D-62). Abaixo estão os passos reais. A CLI do Supabase fala com o projeto da nuvem por um acesso temporário da conta logada (`cli/login-role`), **sem pedir a senha do banco**. As edições do `config.toml` para a nuvem usam o endereço de produção **só na hora do `config push`** e são revertidas logo depois (`git checkout -- supabase/config.toml`); o arquivo versionado aponta sempre para o local.
>
> **Etapa só de frontend?** Quando a etapa não cria migration nem função SQL nova — foi o caso da **etapa 6** (Ajustes e instalar no celular) —, publicar é **só o `git push`**: a Vercel faz o deploy automático e **não há passo de Supabase** (pule a seção 1). Para referência: a etapa 5 teve só uma migration nova (um `db push --linked`, sem `config push`); a 4a teve migration + `config push`.

## 1. Banco e Edge Functions (Supabase)

- **Migrations:** em `supabase/migrations/`, aplicadas com a CLI do Supabase. Nunca pelo painel.
- **Edge Functions:** `receber-envio`, publicada pela CLI (a `enviar-alerta`, do alarme do vigia, é da etapa 9).
  - `receber-envio` tem `verify_jwt = false` no `config.toml`, com comentário.
- **Segredos das funções**, configurados na CLI ou no painel, **nunca** no git:
  - `RESEND_API_KEY` (SMTP dos e-mails de senha). O remetente e o destinatário do alarme (`ALERTA_EMAIL_DE`, `ALERTA_EMAIL_PARA`) e a chave do Vault que o pg_net usa para chamar `enviar-alerta` são da **etapa 9**.
- **pg_cron:** as rotinas automáticas se chamam `rf-vigia` (a cada 5 min), `rf-retencao` (diária) e `rf-limpa-tentativas` (diária, limpa a trava de tentativas de login).
- **Auth:** os valores vêm de `supabase/config.toml`; na nuvem se configura no painel ou por `config push`, com autorização. Ver o checklist consolidado abaixo.

**O que muda do `config.toml` local para a nuvem** (edite só na hora do `config push` e reverta o arquivo depois com `git checkout -- supabase/config.toml`):
- `site_url` = `https://food.repplyhub.com.br` (local: `http://127.0.0.1:3000`);
- `additional_redirect_urls` com `https://food.repplyhub.com.br/**`;
- cadastro público **fechado** (`[auth] enable_signup = false`): a conta é criada pelo admin (D-11);
- login por e-mail **ligado** (`[auth.email] enable_signup = true`) e sem confirmação de e-mail (`enable_confirmations = false`);
- senha mínima **8** (`minimum_password_length`, igual a `lib/auth/senha.ts`);
- **`secure_password_change = false`** (D-65): a troca por Ajustes já confere a senha atual;
- modelo `recuperar-senha.html` **com a marca** (e `senha-alterada.html`, o aviso de senha alterada);
- **SMTP próprio (Resend)** antes do primeiro cliente — e **antes** de subir o modelo próprio, porque o Free só aceita modelo próprio com o SMTP ligado.

> A trava de segurança das telas (CSP) **não** está no `config.toml`: ela é montada no porteiro (`proxy.ts`, D-67) e vale igual no local e na nuvem, sem passo extra na publicação.

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
- O **pg_cron** (`rf-vigia`, `rf-retencao`, `rf-limpa-tentativas`) é criado pelas migrations; confira no painel. O **pg_net** e o **Vault** só entram no alarme do vigia (etapa 9).
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
  - `RESEND_API_KEY` (SMTP dos e-mails de senha, configurado na 4b).
- **Domínio:** `food.repplyhub.com.br` (D-31), adicionado no projeto da Vercel, com o registro de DNS que ela indica (um CNAME) no provedor de DNS do `repplyhub.com.br`. A Vercel emite o certificado (HTTPS) sozinha.
- **Lembrete:** o Hobby **proíbe uso comercial**. Serve para desenvolvimento, demonstração e piloto gratuito. Para cliente pagante, veja [`migrar-para-pro.md`](migrar-para-pro.md).

## 3. Antes de publicar

- [ ] Tipos, lint, testes e build passando (a verificação obrigatória do `CLAUDE.md`).
- [ ] Migrations novas testadas no ambiente local.
- [ ] O roteiro de demonstração (spec §8) roda inteiro com o gerador de dados fictícios.

# Preparação da massa SCC local

Este procedimento é exclusivo do Supabase local. Não use dados reais. O comando cria a casa dedicada `smoke-scc-local` e um token novo, em uma transação. Se o slug já existir, ele interrompe sem alterar a casa nem seus tokens. Não cria ou altera contas, senhas ou permissões existentes. Se o dono local de `scripts/acesso-local.ts` existir, ele recebe acesso à nova casa; o admin local pode vê-la se já estiver cadastrado como admin. Se algum deles estiver ausente ou não tiver a permissão necessária, o comando informa e aponta para as instruções abaixo.

Configure `RF_SMOKE_DATABASE_URL` em `.env.smoke-local` (arquivo ignorado pelo Git), com a URL PostgreSQL do Supabase local. São aceitos somente `localhost`, `127.0.0.1` ou `::1`, sem query ou fragmento. Não coloque a URL ou o token em argumentos de comando.

```sh
npm run smoke:scc:preparar
```

Copie o token exibido uma única vez para `RF_SCC_TOKEN` no mesmo `.env.smoke-local` e defina `RF_SCC_URL=http://127.0.0.1:54321/functions/v1/receber-envio`. Não compartilhe nem versione o arquivo. Os valores de ambiente já exportados prevalecem sobre os do arquivo. Para gerar e validar sem rede:

```sh
npm run smoke:scc:gerar -- --saida /tmp/repply-food-smoke-v2.json
npm run smoke:scc:enviar -- --arquivo /tmp/repply-food-smoke-v2.json --dry-run
```

O gerador não sobrescreve arquivo existente. Para enviar localmente, inicie a função local com `RF_PERMITIR_SIMULACAO=1`, confira que o endereço é do Supabase local e execute o mesmo comando sem `--dry-run`. A última página precisa receber confirmação de publicação. A sequência das cargas e as verificações de tela e PDF serão detalhadas no roteiro completo do smoke.

## Acesso às telas quando faltam contas ou permissões

Use somente o Supabase Studio **local** para criar as contas fictícias `dono@casa-teste.local` e `admin@repply.local`, caso ainda não existam; não altere a senha de contas existentes. Não rode `npm run local:acesso` para resolver isso: esse comando redefine senhas e altera outras casas.

Depois, conecte-se somente ao PostgreSQL local, sem passar senha na linha de comando:

```sh
PGHOSTADDR=127.0.0.1 psql -h 127.0.0.1 -p 54322 -U postgres -d postgres
```

Confira que o prompt e a porta são da instalação local. Execute os comandos abaixo, que apenas acrescentam os vínculos ausentes para os e-mails e a casa indicados, sem mudar outros acessos nem tokens:

```sql
begin;
insert into public.acessos (user_id, restaurante_id)
select u.id, r.id from auth.users u cross join public.restaurantes r
where lower(u.email) = 'dono@casa-teste.local' and r.slug = 'smoke-scc-local'
on conflict do nothing;
insert into public.admins_repply (user_id)
select u.id from auth.users u where lower(u.email) = 'admin@repply.local'
on conflict do nothing;
commit;
select u.email, r.slug from public.acessos a
join auth.users u on u.id = a.user_id join public.restaurantes r on r.id = a.restaurante_id
where lower(u.email) = 'dono@casa-teste.local' and r.slug = 'smoke-scc-local';
select u.email from public.admins_repply a join auth.users u on u.id = a.user_id
where lower(u.email) = 'admin@repply.local';
```

Cada consulta final deve retornar uma linha. Se não retornar, confira se a conta foi criada no Supabase local; não repita o preparador nem altere tokens.

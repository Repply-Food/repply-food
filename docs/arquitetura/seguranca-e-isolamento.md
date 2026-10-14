# Segurança e isolamento entre restaurantes

*Como um restaurante nunca vê o dado de outro, e o que mais protege o sistema. Junta as lições medidas no Repply CRM (revisão de código de 09/2026) e no Repply Imob.*

## 1. As três camadas

1. **Autenticação.**
   - Clientes: Supabase Auth, e-mail e senha (D-11).
   - SCC: token do restaurante, só na recepção (D-03).
2. **Acesso ao restaurante.** A tabela `acessos` (login ↔ restaurante) e a `admins_repply`.
3. **RLS do Postgres.** **É ela que protege de verdade.** Esconder botão na tela não protege nada.

## 2. Regras absolutas

1. **Toda tabela nasce por migration, com RLS habilitada e as políticas escritas no mesmo arquivo.** Nunca crie tabela pelo painel do Supabase.
2. **Toda tabela com dado de restaurante tem `restaurante_id`**, e as políticas usam `tem_acesso(restaurante_id)`.
3. **Não use `FORCE ROW LEVEL SECURITY`.** No Imob, isso causou recursão infinita nas funções auxiliares.
4. **Funções auxiliares de RLS** (`tem_acesso`, `eh_admin_repply`) são `security definer`, `stable`, `set search_path = public` e `set row_security = off`. Sem o `row_security = off`, as funções entram em recursão ("stack depth limit exceeded").
5. **O `restaurante_id` vem do servidor, nunca do cliente.**
   - Na recepção, ele sai do token.
   - No painel, sai da sessão + `acessos`.
   - Nas ações do servidor que usam a chave de serviço, o filtro `.eq('restaurante_id', ...)` é **obrigatório**.
6. **Some no banco, não no navegador.** Filtrar na tela o que a consulta trouxe a mais é vazamento.
7. **Zero linhas não é sucesso.**
   - Escrita que deveria afetar uma linha e afetou zero significa que a RLS recusou. A tela mostra erro, nunca "salvo".
   - Use `{ count: 'exact' }` e confira.
8. **Ação do servidor nunca devolve `error.message` do Postgres para a tela.** Traduza para uma frase do produto e registre o código no log.
9. **Migrations só são acrescentadas, nunca editadas.**
10. **Credencial nunca vai para o git.**
    - `.env.local` fica fora.
    - O `.env.example` não tem valores.
    - A chave de serviço só existe no servidor e nas Edge Functions.
11. **Dado real nunca entra em teste, plano, desenho ou migration.** Use os dados fictícios do gerador.
12. **Função nova nasce fechada.** Desde a migration `20261013120000`, função criada em `public` não pode ser executada por `anon` nem por `authenticated`. A regra vale para função criada pelas migrations, que rodam com o papel `postgres`. Função criada por outro papel (por exemplo, direto no painel do Supabase) não é coberta, então crie função só por migration. Se o painel precisa chamar:
    - dê o `grant execute ... to authenticated` na mesma migration;
    - a função confere `tem_acesso(restaurante_id)` por dentro, ou é `security invoker` e deixa a RLS trabalhar;
    - acrescente-a à lista do teste `tests/isolamento/funcoes-fechadas.test.ts`.

## 3. Políticas por tabela

| Tabela | Cliente (login com acesso) | Admin Repply | Recepção (service role) |
|---|---|---|---|
| `restaurantes` | lê o dele; atualiza **só `turnos`** (via função `atualizar_turnos`, que confere o acesso) | lê e escreve todos | lê |
| `acessos` | lê os dele | lê e escreve | — |
| `admins_repply` | — | lê | — |
| `tokens_envio` | — | lê e escreve | lê e atualiza `ultimo_uso_em` |
| `envios` | — | lê | escreve |
| `sinal_de_vida` | lê o dele (para o selo "há X min") | lê | escreve |
| `entradas` | lê o dele | lê todos ("ver o painel do cliente") | escreve |
| `metas` | lê e escreve o dele | lê | — |

"Ver o painel do cliente" (D-38) **só lê**. O admin não tem política de escrita em `entradas` nem em `metas`.

Padrão de política, no estilo do Imob, com uma política por operação:

```sql
alter table public.entradas enable row level security;

create policy "quem tem acesso lê" on public.entradas
  for select using (public.tem_acesso(restaurante_id));
-- sem políticas de insert/update/delete: só a função de recepção (service role) escreve
```

## 4. Checklist de tabela nova

Copiado do CRM:

- [ ] Criada por migration nova (nunca editar migration antiga).
- [ ] `restaurante_id uuid not null references restaurantes(id) on delete cascade` + índice.
- [ ] `enable row level security` no mesmo arquivo.
- [ ] As quatro operações pensadas: o que não tem política fica fechado, de propósito.
- [ ] Trigger que impede mudar o `restaurante_id`.
- [ ] Nenhuma credencial ou dado pessoal sem necessidade.
- [ ] Teste: o login do restaurante A tenta ler e escrever no B e é recusado.
- [ ] Tipos regenerados (`npm run types`).
- [ ] Função nova: `grant` explícito só para quem precisa, e entrada na lista de `funcoes-fechadas.test.ts`.

## 5. Login e senha

- A conta é **criada pelo admin**, com senha provisória e `app_metadata.precisa_trocar_senha = true`. Esse campo só o servidor escreve.
- **Primeiro acesso:**
  - o porteiro (`proxy.ts`) manda para `/trocar-senha` enquanto o aviso estiver ativo. Só `/trocar-senha`, `/nova-senha` e `/auth/*` ficam livres;
  - a função do servidor que troca a senha lê o aviso do usuário que o Supabase validou (`getUser`), nunca do formulário, e não pede a senha atual;
  - ao terminar, ela limpa o aviso **só com a chave de serviço** e **confere que limpou**. Se o aviso continuar ligado, devolve erro: zero efeito não é sucesso (`lib/auth/nucleo.ts`).
- **Troca voluntária** (vinda de Ajustes): pede a senha atual e a confere com um cliente descartável, que não mexe na sessão do navegador.
- **Porteiro e guardas:**
  - o porteiro (`proxy.ts`) renova a sessão a cada requisição e decide por uma função pura (`decidirRota`, em `lib/auth/rotas.ts`). Sem login, vai para `/entrar?next=…`. Arquivo estático nem consulta o login (lista fechada de extensões, olhando só o último trecho do caminho);
  - **o porteiro não é a defesa.** Toda função do servidor pode ser chamada por POST direto, então a conferência da sessão e do aviso mora **dentro** de cada função;
  - as guardas por casa (`lib/auth/sessao.ts`: `exigirCasa`, `exigirAdmin`) rodam no layout e nas páginas de `/r/[slug]` (Hoje, Resultados e Ajustes). A casa do endereço precisa estar entre as que a RLS devolve para aquele login (todas, para o admin). Casa de outro volta ao destino padrão da conta; casa suspensa vai para `/acesso-pendente` (o admin ainda entra, para o suporte). Com a troca de senha pendente, as duas mandam para `/trocar-senha`.
- **Senha:** no mínimo **8 caracteres**. A regra fica num lugar só (`lib/auth/senha.ts`) e é configurada igual no Supabase Auth. *O Imob tinha 8 num lugar e 10 em outro; não repetir.*
- **Sair** desconecta **só o aparelho em uso** (`signOut({ scope: "local" })`). O login é compartilhado entre dono, sócio e gerente (D-10), e sair "de todos" derrubaria os outros celulares. **Trocar a senha** desconecta os outros aparelhos (`scope: "others"`), porque a senha velha deixou de valer para todos.
- **"Esqueci a senha":**
  - o e-mail sai pelo Supabase Auth, com o modelo da marca (`supabase/templates/recuperar-senha.html`);
  - o link leva `token_hash` (`/auth/confirmar?token_hash=…&type=recovery&next=/nova-senha`), então **vale em outro aparelho**. O link padrão do Supabase só vale no navegador que pediu;
  - `/auth/confirmar` **não troca uma sessão aberta** pela do link. Se o aparelho já tem outra conta, vai para `/entrar` com a explicação (fixação de sessão);
  - o retorno grava um **cookie assinado** (HMAC com a chave de serviço, 10 min, amarrado ao usuário, `HttpOnly`, restrito a `/nova-senha`). A função do servidor que define a senha nova o **exige por dentro**, não só a página;
  - recuperar a senha também cumpre o primeiro acesso;
  - a resposta é **a mesma exista ou não o e-mail** (e demora no mínimo 800 ms). Isso vale também quando o Supabase recusa pelo limite de envio **por usuário** (`over_email_send_rate_limit`, que só aparece para e-mail cadastrado): vira o mesmo aviso de sempre ("Se esse e-mail tiver acesso…"). O limite por endereço de internet (`over_request_rate_limit`) vale antes de procurar o usuário, não revela nada e continua visível.
- **Formulário com senha ou dado sensível:**
  - leva `method="post"` e o botão de enviar **desligado até a página carregar** (`components/forms/use-hidratado.ts`). Se o dono apertar Enter antes de o JavaScript chegar, o navegador faz o envio nativo; sem `method="post"` ele seria um GET e a senha iria para a URL (histórico, registro do servidor e Referer). Pela especificação do HTML, Enter num campo não envia o formulário quando o botão de enviar está desabilitado;
  - o `next.config.ts` mantém `allowedDevOrigins: ["127.0.0.1"]` (sem isso o Next bloqueia o `/_next/hmr` nesse endereço e a página nunca hidrata no login local) e `logging.serverFunctions: false`. **Este último não pode sair**: sem ele o `next dev` imprime no terminal os argumentos das funções do servidor, inclusive e-mail e senha;
  - a etapa 3 cria formulários com senha (D-32): seguem a mesma regra. O teste `tests/entrada/formularios-antes-de-carregar.test.tsx` cobre os quatro de hoje.
- **Mensagens:** frases do produto, escolhidas pelo `code` do erro do Supabase (`lib/auth/erros.ts`), nunca o texto cru. "E-mail ou senha incorretos." só aparece quando o login recusou a credencial; limite de tentativas e queda do serviço têm frase própria.
- **Limite de tentativas (D-52):** **não há bloqueio próprio** por senha errada. Vale o limite do próprio Supabase Auth, por endereço de internet, e a tela de entrada sempre mostra o caminho "Esqueci a senha". O limitador em memória do Imob não serve aqui: na Vercel cada requisição pode cair numa instância diferente.
  - **Risco conhecido:** o Supabase vê o endereço do servidor da Vercel, não o de quem tenta. Uma pessoa errando a senha pode bloquear o login de todos por alguns minutos. Está na dívida técnica (item 23), para decidir antes da etapa 4.

## 6. Recepção de dados

- Token por restaurante, guardado só como SHA-256. Ele é mostrado **uma vez**, na criação.
- Troca de token: o antigo para **na hora** (padrão) ou **em 24 h** (D-38).
- `verify_jwt = false` só na função `receber-envio`, com comentário no `config.toml` explicando por quê.
- Corpo limitado a 2 MB, até 2.000 entradas, e um envio por restaurante a cada 20 s.
- **Só entra o que está na lista** do contrato §5 (D-29, D-51). Nome, RG, telefone e sexo são descartados; campo desconhecido também, e dele fica só o nome. Vale para as contas e para o JSON guardado, que é remontado só com a lista.

## 7. Navegador

Copiado do Imob:
- cabeçalhos de segurança no `next.config.ts`: HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` e `Permissions-Policy`;
- CSP começando em modo "só relatar";
- cookies de sessão `secure`, `httpOnly` e `sameSite=lax` em produção;
- a build falha se `NEXT_PUBLIC_APP_URL` estiver faltando.

## 8. LGPD

- A Repply é **operadora** dos dados do restaurante. O restaurante é o **controlador**. O termo de uso precisa dizer isso.
- Os dados **não são usados** para nada além do painel do próprio restaurante, inclusive **nunca** para propostas do Repply Hub (D-29).
- Dados pessoais de clientes do restaurante não são guardados no MVP.
- Logs registram só código e mensagem curta (o `logError` do Imob), nunca o conteúdo de um envio.
- Se o restaurante sair, os dados dele são excluídos sob pedido. O `on delete cascade` em `restaurantes` apaga tudo do restaurante de uma vez.

## 9. Variáveis secretas

| Variável | Onde existe |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor do Next.js e Edge Functions. **Nunca** com prefixo `NEXT_PUBLIC_` |
| `RESEND_API_KEY` | Edge Function `enviar-alerta` e servidor (e-mails de senha) |
| Chave para o pg_net chamar funções | Supabase Vault |

O resto está no `.env.example`.

# Etapa 4 · Primeira publicação · Desenho

- **Data:** 15/10/2026
- **Estado:** aprovado pelo Lucas Ferreira em 15/10/2026
- **Plano do MVP:** etapa 4 de 11 (depois do admin; antes do Hoje)
- **Base:** D-09 (Supabase Free + Vercel Hobby no piloto), D-31 (`food.repplyhub.com.br`), D-50 (projeto em `sa-east-1`), D-47 (repositório privado), [`docs/operacao/publicar.md`](../../operacao/publicar.md), [`docs/operacao/migrar-para-pro.md`](../../operacao/migrar-para-pro.md), e os itens 10, 22, 23, 24, 25, 37, 38, 39, 40, 45, 46, 47 de [`docs/divida-tecnica.md`](../../divida-tecnica.md).

## 1. A etapa em duas partes (D-61)

A etapa 4 tem duas naturezas, e por isso vai em duas partes:

- **4a — endurecer o código para produção.** Mudanças de código e de configuração local, feitas e testadas no banco local, revisadas e enviadas ao GitHub como as etapas 1 a 3. **Nada toca a nuvem.**
- **4b — a publicação na nuvem.** Feita pelo controlador guiando o Lucas Ferreira passo a passo, cada passo com a autorização dele na hora. Logins e senhas o Lucas digita; chaves secretas ele cola no painel ou no `.env.nuvem.local`, nunca no chat. Só começa depois de a 4a estar fechada.

A 4a produz software testável e commitado; a 4b é um roteiro operacional. Este desenho cobre as duas.

## 2. Parte 4a — código e configuração (local)

### 2.1 Limitador de tentativas de senha, no banco (D-62, dívida 23)

**Problema:** o login passa pelo servidor do painel (função do servidor na Vercel), então o limite por endereço de internet do Supabase Auth vê o endereço da Vercel, não o de quem tenta. Uma pessoa errando a senha esgota o limite de todos, e pela D-52 esse é a única proteção.

**Solução:** uma trava **por e-mail**, no banco (não em memória, que não sobrevive na Vercel):
- tabela nova `tentativas_de_login` (migration, RLS, nasce fechada): `email` (texto, minúsculo), `tentativas` (int), `bloqueado_ate` (timestamptz), `atualizado_em`;
- funções `security definer`, só para a chave de serviço:
  - `registrar_tentativa_errada(p_email)`: incrementa; a partir de N erros (padrão 5), marca `bloqueado_ate = now() + janela` (padrão 15 min), com recuo que cresce;
  - `limpar_tentativas(p_email)`: zera no login certo;
  - `login_bloqueado(p_email) → timestamptz | null`: devolve até quando está bloqueado.
- `entrarAction` (`lib/auth/actions.ts`), com a chave de serviço, consulta `login_bloqueado` **antes** de tentar o login; se bloqueado, devolve uma frase do produto ("Muitas tentativas. Tente de novo em alguns minutos.") sem chamar o Supabase. No erro de credencial, chama `registrar_tentativa_errada`; no sucesso, `limpar_tentativas`.
- a latência mínima de 800 ms continua, para não dar pista por tempo de resposta.
- rotina diária no pg_cron (`rf-limpa-tentativas`) apaga linhas antigas (sem bloqueio e sem erro há mais de 24 h).
- testes: bloqueia depois de N erros; o login certo limpa; o bloqueio expira; o e-mail é normalizado; a função é fechada (só `service_role`); a entrada não vaza se o e-mail existe.

Isto não substitui o limite do Supabase (continua ligado, como segunda camada); resolve o caso de uma conta ser atacada sem travar as outras.

### 2.2 Cookie de sessão sempre seguro em produção (dívida 37)

Hoje o cookie nasce com `Secure` no `proxy.ts` (porteiro), mas sem `Secure` em `lib/supabase/server.ts` (login e `/auth/confirmar`). Conserto: uma função única de opções de cookie (`lib/supabase/cookies.ts`), que força `secure: true` em produção e `sameSite: "lax"`, usada pelos dois arquivos. Teste: em produção, as opções têm `secure`; em desenvolvimento, não (o login local é `http`).

### 2.3 Trava no código contra apontar o dev para a nuvem (dívida 10)

O `lib/supabase/service.ts` (chave de serviço) ganha uma guarda: em `NODE_ENV !== "production"`, se a URL do Supabase não for local (127.0.0.1/localhost), lança erro claro, a menos que uma variável explícita (`PERMITIR_NUVEM_NO_DEV=1`) esteja ligada. Protege contra escrever na nuvem com dado real rodando em desenvolvimento, além do `.env.local`. Teste: em dev com URL de nuvem e sem a variável, lança; com a variável, passa; em produção, nunca lança.

### 2.4 Política de conteúdo (CSP) que bloqueia de verdade (dívida 45)

Hoje o `next.config.ts` manda `Content-Security-Policy-Report-Only` (só observa). Passa a `Content-Security-Policy` que bloqueia, **depois** de conferir no navegador que as telas, as fontes locais, o JavaScript do Next e o tema carregam. Mantém `default-src 'self'`, `base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'self'`, `object-src 'none'`; acrescenta o que o Next precisar (ex.: `'unsafe-inline'`/hash para estilos, conforme a conferência). Conferência no navegador em 390 px e 1280 px, claro e escuro, em todas as telas, inclusive o admin.

### 2.5 Link de "esqueci a senha" à prova de antivírus (dívida 40)

Antivírus de e-mail corporativo abre links para checar, e o GET em `/auth/confirmar` gastaria o token antes do dono. Conserto: o link do e-mail passa a apontar para uma página intermediária (`/auth/confirmar` vira uma página com um botão "Criar minha senha nova" que faz **POST**); só o POST valida o token. O GET não gasta o token. Mantém as proteções da etapa 2 (cookie assinado, sessão aberta, tipos de link). Testes ajustados.

### 2.6 A volta do link aceita só os tipos certos (dívida 39)

`/auth/confirmar` aceita hoje seis tipos de link. Passa a aceitar só `recovery` (e `invite` se vier a ser usado), e o ramo `code` sai quando o modelo próprio do e-mail estiver em uso. Teste: tipo fora da lista é recusado.

### 2.7 Registrar quando a cota de e-mail estoura (dívida 24, parte local)

`pedirNovaSenhaAction` trata `over_email_send_rate_limit` como sucesso (para não dizer quais e-mails existem), mas isso inclui a cota geral, e hoje some em silêncio. Acrescenta `logError("cota_email_estourada")` (código novo em `lib/logger.ts`) nesse caso, mantendo a resposta de sucesso. Teste: o código é registrado; a resposta continua de sucesso.

### 2.8 E-mails com a identidade do repply food. (4a, parte local)

Os e-mails que o Supabase manda ganham a cara do repply food., como foi feito no Repply CRM:
- modelo `supabase/templates/recuperar-senha.html` reescrito com a marca: HTML próprio para e-mail (tabelas, CSS **em linha**, largura ~600 px), fundo claro, o laranja da marca `#FF5A1F` no botão com texto quase-preto (a mesma regra de contraste do app), o nome "repply food." com o ponto laranja, e a logo como **PNG hospedado** (os clientes de e-mail não renderizam SVG): referencia uma imagem servida pelo próprio site publicado (ex.: `{{ .SiteURL }}/icon-192.png`, que já está em `public/`). Sem fonte externa (os clientes de e-mail ignoram; usa a pilha de fontes do sistema). Texto: o mesmo sentido do atual (criar senha nova, link vale 1 h, ignore se não foi você).
- se for útil, um modelo de aviso "sua senha foi alterada" (`password_changed`), também com a marca — opcional, confirmar na execução.
- o modelo é testado no Mailpit local (`http://127.0.0.1:54324`): o e-mail chega, abre com a marca, o botão leva à página intermediária (§2.5), e o link funciona.
- a identidade e a estrutura espelham as dos e-mails do Repply CRM.

### 2.9 Documentação alinhada (dívida 22 e as incoerências do levantamento)

- `docs/operacao/publicar.md`: tirar `enviar-alerta`, `ALERTA_EMAIL_*` e o Vault da seção da publicação (são da etapa 9); deixar só o que a etapa 4 publica. Acrescentar um checklist consolidado "o que muda do `config.toml` local para a nuvem".
- alinhar os nomes das variáveis de e-mail entre `.env.example`, `publicar.md` e `.env.nuvem.local` (um vocabulário só: remetente, destinatário, URL do site).
- `docs/decisoes.md`: D-61 a D-64.
- `docs/divida-tecnica.md`: mover 10, 23, 37, 39, 40, 45 e 46 para "Resolvidos" (com os commits) conforme a 4a os fecha; o item 46 vira "resolvido por decisão: mantém só o aviso" (D-64).

A senha mínima continua 8 caracteres, sem exigências extras (item 41 não entra; é mais simples para o dono do bar).

### 2.10 Verificação da 4a

Tipos, lint, toda a suíte e a build; conferência no navegador das telas afetadas pela CSP e do e-mail no Mailpit. Enviar ao GitHub com o ok do Lucas Ferreira.

## 3. Parte 4b — a publicação na nuvem (roteiro guiado)

Cada passo pede a autorização do Lucas Ferreira na hora. O controlador prepara os comandos exatos; o Lucas executa os que envolvem conta, login ou chave, ou autoriza o controlador a rodá-los.

### 3.1 Antes de tudo
- Conferir que a 4a está no GitHub e que a verificação passa.
- Reunir os acessos (informados pelo Lucas na hora): conta Supabase (org Free dele), conta Vercel (Hobby), conta Resend, acesso ao DNS de `repplyhub.com.br`, e o e-mail/domínio remetente.

### 3.2 Supabase na nuvem
- Criar o projeto Free em `sa-east-1` (D-50), na org do Lucas.
- **As três conferências da dívida 47, antes das migrations:** casas antigas que as novas restrições recusariam (banco novo, não há); versão Postgres 17 (confirmar no painel); o papel `postgres` lê `auth.users` e apaga `auth.sessions`.
- Aplicar as migrations pela CLI (`supabase db push` / `migration up --linked`), nunca pelo painel.
- Publicar a função `receber-envio` pela CLI, com `verify_jwt = false`.
- Confirmar que `pg_cron`, `pg_net` e `vault` existem/estão disponíveis no projeto; conferir as rotinas `rf-vigia` e `rf-retencao` (e `rf-limpa-tentativas`, da 4a).
- Auth no painel (ou `config push`): `site_url = https://food.repplyhub.com.br`; `additional_redirect_urls` com `https://food.repplyhub.com.br/**`; cadastro público fechado, login por e-mail ligado, senha mínima 8; "troca de senha segura" **desligada** (D-63); levar o modelo `supabase/templates/recuperar-senha.html` (já com a marca).

### 3.3 E-mail pelo Resend (como no Repply CRM)
- No Resend: verificar o domínio remetente e criar os registros **DKIM/SPF** no DNS de `repplyhub.com.br` (espelhando o CRM); definir o remetente "repply food. <...@...>".
- No Supabase, preencher `[auth.email.smtp]` apontando para o Resend (host, porta, usuário `apikey`, a chave como segredo), para o e-mail de senha sair pelo Resend, com a marca.
- Conferir a cota de e-mails do Resend/Supabase.

### 3.4 Vercel
- Criar o projeto (Hobby), a partir de cópia limpa do `main`.
- Variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (sem `NEXT_PUBLIC_`), `NEXT_PUBLIC_APP_URL = https://food.repplyhub.com.br`, `RESEND_API_KEY`.
- Publicar pela CLI; apontar o domínio `food.repplyhub.com.br` (CNAME para a Vercel no DNS).

### 3.5 Conferir na nuvem
- **Medir a 4b da dívida 25:** o tempo real do e-mail pelo Resend; se for mais lento que 800 ms, ajustar o piso da latência mínima para não denunciar e-mails cadastrados.
- Rodar o roteiro de demonstração (SPEC §8) inteiro na nuvem, com o gerador de dados fictícios apontando para a função publicada (com `--confirmo-nuvem` e um token de restaurante de teste).
- Conferir: entrar, recuperar a senha (e-mail real com a marca), o admin, a recepção de um envio, o selo "em dia".
- Decidir com o Lucas **quando a SCC passa a enviar para a nuvem** (entregar endereço + token de teste ao Pedro).

### 3.6 Depois
- Registrar em `docs/decisoes.md` o que a publicação definiu (endereço do projeto, remetente, etc., sem segredos).
- Atualizar `publicar.md` e o `README.md` com os comandos reais.

## 4. Fora desta etapa
- O alarme por e-mail do vigia (`enviar-alerta`, Vault, pg_net para o alarme): etapa 9.
- A migração Free→Pro: o gatilho D-09 (primeiro cliente pagante), com `migrar-para-pro.md`.
- Exigências de senha além do tamanho (dívida 41): só se um dia a nuvem ligar.
- Backup automático: o Free não tem; o banco é cópia do SCC (dá para pedir reenvio).

## 5. Decisões novas (15/10/2026)
- **D-61:** a etapa 4 vai em duas partes: 4a (código, enviado ao GitHub) e 4b (publicação na nuvem, guiada passo a passo com a autorização do Lucas Ferreira).
- **D-62:** o limite de tentativas de senha é por e-mail, no banco (não em memória), como segunda camada além do limite do Supabase. Fecha a dívida 23.
- **D-63:** a opção "Secure password change" do Supabase fica desligada; a troca de senha por Ajustes já confere a senha atual. Fecha a dívida 38.
- **D-64:** mudar o fuso de uma casa continua só avisando para pedir reenvio; não dispara o reenvio sozinho. Fecha a dívida 46.
- Os e-mails de senha ganham a identidade do repply food. (modelo próprio) e saem pelo Resend com domínio verificado (DKIM/SPF), espelhando o Repply CRM.

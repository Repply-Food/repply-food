# Etapa 2 · Entrar e moldura do painel · Desenho

- **Data:** 14/10/2026
- **Estado:** aprovado pelo Lucas Ferreira em 14/10/2026
- **Plano do MVP:** etapa 2 de 11 (depois da fundação; antes do admin)
- **Base:** telas aprovadas em [`docs/telas/primeiro-acesso.html`](../../telas/primeiro-acesso.html), [`hoje.html`](../../telas/hoje.html) e [`ajustes.html`](../../telas/ajustes.html); login do Repply Imob na versão consertada pela auditoria de segurança dele (branch `claude/repply-imob-security-audit-6f6603`).

## 1. O que a etapa entrega

| Endereço | O que é | Quem vê |
|---|---|---|
| `/entrar` | E-mail e senha. Senha errada: "E-mail ou senha incorretos." e o link para criar uma senha nova (D-52) | Qualquer um |
| `/esqueci-a-senha` | Pede o e-mail e manda o link. A resposta é a mesma exista ou não o e-mail | Qualquer um |
| `/auth/confirmar` | Recebe o link do e-mail, abre a sessão e segue para `/nova-senha` | Quem clicou no link |
| `/nova-senha` | Define a senha nova depois do e-mail. Só abre com o cookie assinado da recuperação | Quem veio do link |
| `/trocar-senha` | Obrigatória no primeiro acesso (sem pedir a atual). Fora disso, pede a senha atual | Logado |
| `/escolher-casa` | Lista das casas, para quem tem mais de uma (D-54) | Logado com 2+ casas |
| `/acesso-pendente` | "Seu acesso ainda não foi liberado" ou "acesso suspenso", com o WhatsApp da Repply e Sair | Logado sem casa ativa |
| `/admin` | Página provisória ("o admin chega na etapa 3") | Admin da Repply |
| `/r/[slug]/hoje` e `/r/[slug]/resultados` | Moldura do painel com estado vazio (os números chegam nas etapas 5 e 7) | Quem tem acesso à casa (e o admin) |
| `/r/[slug]/ajustes` | Só a parte da conta: e-mail, trocar senha, tema claro/escuro, falar com a Repply, sair | Quem tem acesso à casa |

**Para onde vai depois de entrar** (`destinoDepoisDeEntrar`): precisa trocar a senha → `/trocar-senha`; admin → `/admin`; uma casa ativa → `/r/<slug>/hoje`; mais de uma → `/escolher-casa`; nenhuma ativa → `/acesso-pendente`. Um `?next=` válido (mesmo site) tem prioridade, exceto sobre a troca obrigatória.

## 2. A moldura

- **Celular:** faixa de cima com o símbolo, o nome da casa e o selo; menu de baixo fixo com Hoje · Resultados · Ajustes, alvos de toque de pelo menos 44 px.
- **Computador (≥ 768 px):** barra lateral escura (`scheme-ink`) com a marca, os três itens e, no rodapé, o nome da casa e o selo. Sem menu de baixo.
- **Selo (D-53):** segue o estado do vigia (`sinal_de_vida.estado`), sempre com texto:

| Estado | Cor | Texto |
|---|---|---|
| `em_dia` | verde | "atualizado há X min" |
| `atrasado` | amarelo | "atrasado · últimos dados há X min" |
| `parado` | vermelho | "sem dados há X" |
| `fechado` | cinza | "fechado agora · últimos dados às HH:MM" (hora no fuso da casa) |
| `aguardando` ou sem linha | cinza | "aguardando o 1º envio" |

- **Tema:** claro por padrão, escuro opcional em Ajustes (`next-themes`, classe `dark` no `<html>`, como no Imob).
- **Marca:** símbolo + "repply food." (texto em SVG do pacote de marca). O tomate só no símbolo (D-42).

## 3. Como funciona por trás

- **Porteiro (`proxy.ts`, nome novo do middleware no Next 16):** renova a sessão a cada requisição. Rotas públicas: `/entrar`, `/esqueci-a-senha`, `/auth/*` e arquivos estáticos (lista fechada de extensões, como no Imob consertado). Sem login → `/entrar?next=<endereço>`. Logado com `precisa_trocar_senha` → `/trocar-senha` (exceto `/trocar-senha`, `/nova-senha` e `/auth/*`). Arquivos estáticos nem consultam o login. A decisão mora numa função pura (`decidirRota`), testada à parte.
- **Primeiro acesso:** o admin (etapa 3) cria a conta com `app_metadata.precisa_trocar_senha = true`. Só o servidor escreve `app_metadata`. A ação de troca confere a sessão e o aviso **dentro dela** (lição do Imob: toda função de servidor é chamável por POST) e, ao terminar, limpa o aviso com a chave de serviço e renova a sessão.
- **Recuperação:** `resetPasswordForEmail`; o modelo do e-mail (`supabase/templates/recuperar-senha.html`) leva a `/auth/confirmar?token_hash=…&type=recovery&next=/nova-senha`, que funciona mesmo abrindo o e-mail em outro aparelho (o link padrão do Supabase só vale no navegador que pediu). O retorno grava um cookie assinado (HMAC, 10 min, amarrado ao usuário, como no Imob consertado) e a ação de nova senha o exige. Recuperar a senha também cumpre o primeiro acesso (limpa o aviso). Se o aparelho já tiver outra conta aberta, o link não troca a sessão: `/entrar` explica e oferece sair.
- **Troca voluntária:** vem de Ajustes com `?voltar=` (só caminho do próprio site); "Cancelar" e o fim da troca voltam para lá.
- **Sair:** `signOut({ scope: "local" })`, só neste aparelho. O login é compartilhado entre dono, sócio e gerente (D-10); sair "de todos" desconectaria os outros celulares. Trocar a senha desconecta os outros aparelhos (`scope: "others"`), porque a senha velha deixou de valer para todos.
- **Guarda por casa:** o layout de `/r/[slug]` busca a casa pelo `slug` com o cliente do usuário (a RLS só devolve as casas dele, e todas para o admin). Casa que não é dele → vai para o destino padrão. Casa suspensa → `/acesso-pendente` (o admin ainda entra, para o suporte).
- **Sem bloqueio próprio por senha errada (D-52).** Fica o limite do próprio Supabase Auth, por endereço de internet. A tela sempre mostra o caminho "Esqueci a senha".
- **Mensagens:** frases do produto, escolhidas pelo `code` do erro do Supabase (`same_password`, `weak_password`, `over_email_send_rate_limit`, `over_request_rate_limit`), nunca o texto cru.
- **Latência mínima de 800 ms** em entrar e em pedir senha nova (padrão do Imob), para não dar pista de quais e-mails existem.

## 4. Base visual

- As bibliotecas são alinhadas às do Imob (zod 4, `@supabase/ssr` 0.10, `@base-ui/react` 1.5, `react-hook-form`, `next-themes`, `sonner`, `recharts` 3).
- Os componentes de formulário do Imob (`button`, `input`, `input-group`, `label`, `form`, `card`, `sonner`, `separator`, `skeleton`, `textarea`, `form-field`) são copiados. Adaptações do Food: botão em retângulo de 10 px com texto em negrito, como nas telas aprovadas (a pílula é marca do Imob), mais um tamanho `toque` (44 px); campo com 44 px no celular; aviso flutuante (`sonner`) com as cores do Food.
- Os tokens do Food usam nomes próprios (`--bg`, `--fg`, `--surface`, `--muted`, `--action-*`). Uma ponte `@theme inline` em `app/globals.css` traduz os nomes que os componentes do Imob usam (`background`, `primary`, `muted-foreground`...) para os do Food. Os tokens continuam a única fonte das cores.
- Novo token `--danger-text` para texto de erro (o vermelho de dado `#D64545` mede 4,38:1 sobre branco e reprova como texto pequeno) e novo `--control-border` para o contorno dos campos (a borda comum mede 1,26:1; o contorno de campo precisa de 3:1), os dois cobertos pelo teste de contraste.
- As fontes passam a carregar os pesos usados (General Sans 400/500/600/700, Satoshi 400/500/700, JetBrains Mono variável).

## 5. Conta de teste local

Sem o admin (etapa 3), a conta de teste vem de um comando que só aceita o banco local (`npm run local:acesso`). Ele cria a "Casa de Teste Local", uma segunda casa para testar a escolha, um login com senha provisória e `precisa_trocar_senha`, e um admin. As credenciais são valores de teste fixos, registrados no próprio script. O e-mail de recuperação local cai no Mailpit (`http://127.0.0.1:54324`), que passa a subir junto com o banco.

## 6. Testes

- Funções puras: `decidirRota`, `destinoDepoisDeEntrar`, `seloDoSinal`, `safeNext`, cookie de recuperação, regras dos formulários, tradução de erros.
- Contra o Supabase local (Auth de verdade): conta criada pelo admin entra; senha atual conferida sem mexer na sessão; aviso de primeira troca limpo pelo servidor; cadastro público recusado (resolve o item 12 da dívida).
- Componentes: o menu marca a página atual e tem os três destinos; o selo mostra texto.
- Conferência no navegador em 390 px e 1280 px, claro e escuro, de todas as telas da etapa.

## 7. Fora desta etapa

Guia "coloque na tela inicial" e o resto de Ajustes (etapa 6), números do Hoje (etapa 5), Resultados (etapa 7), admin (etapa 3), modelos de e-mail na marca e SMTP próprio (etapa 4/9), termos de uso (etapa 6), "Secure password change" do Supabase na nuvem (etapa 4).

## 8. Decisões novas

- **D-52** (14/10/2026): sem bloqueio próprio por tentativas de senha. Fica o limite do Supabase Auth; a tela mostra o caminho "Esqueci a senha". Ajusta `seguranca-e-isolamento.md` §5.
- **D-53** (14/10/2026): o selo "há X min" segue o estado do vigia. Resolve o item 15 da dívida técnica.
- **D-54** (14/10/2026): login com mais de uma casa ativa vê a tela "Escolha a casa" depois de entrar. Complementa a D-10.

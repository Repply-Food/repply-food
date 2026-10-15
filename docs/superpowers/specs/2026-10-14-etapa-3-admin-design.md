# Etapa 3 · Admin da Repply · Desenho

- **Data:** 14/10/2026
- **Estado:** aprovado pelo Lucas Ferreira em 14/10/2026 (jeito A, híbrido)
- **Plano do MVP:** etapa 3 de 11 (depois de entrar e moldura; antes da primeira publicação)
- **Base:** tela aprovada em [`docs/telas/admin.html`](../../telas/admin.html); D-32, D-35, D-38, D-39, D-40, D-51, D-53; roteiro [`docs/operacao/cadastrar-restaurante.md`](../../operacao/cadastrar-restaurante.md); [`seguranca-e-isolamento.md`](../../arquitetura/seguranca-e-isolamento.md).

## 1. O que a etapa entrega

### 1.1 Telas do admin

| Endereço | O que é |
|---|---|
| `/admin` | Lista de restaurantes. No computador, lista à esquerda e, à direita, "Escolha um restaurante". No celular, só a lista |
| `/admin/restaurantes/novo` | Cadastro |
| `/admin/restaurantes/[id]` | Detalhe. No computador, a lista continua à esquerda (como na tela aprovada); no celular, tela própria com "‹ Restaurantes" |
| `/admin/restaurantes/[id]/editar` | Editar os dados |

**Topo do admin:** barra escura com a marca e a etiqueta "admin"; à direita, o e-mail de quem está dentro, "Trocar minha senha" (`/trocar-senha?voltar=/admin`) e "Sair". No celular, os dois ficam num menu (☰).

**Lista:**
- Ordem de atenção, igual no celular e no computador: parado, atrasado, aguardando, em dia, fechado e, por último, suspenso. Dentro do mesmo estado, por nome.
- Contadores por estado no topo ("5 cadastrados · 2 em dia · 1 atrasado…"), incluindo "fechado" e "suspenso" quando houver.
- Colunas no computador: Restaurante | Envio de dados (selo do vigia, D-53) | Último envio (no fuso da casa) | SCC (versão do último envio). No celular, cartões com nome, selo e último envio.
- "Aguardando" é **cinza**, como o selo do painel (a tela da descoberta usava azul; não há token azul e a D-53 vale para os dois).
- Restaurante suspenso ganha a etiqueta "suspenso" além do selo.
- Estado vazio: "Nenhum restaurante cadastrado ainda." e o botão "Cadastrar restaurante".

**Cadastro e edição (mesmo formulário):**
- **Nome** (obrigatório). O `slug` sai do nome na criação (minúsculas, sem acento, hífens; número no fim se já existir) e **não muda depois** (links e favoritos do dono continuam valendo).
- **CNPJ** opcional (D-60). Quando preenchido: 14 caracteres, no formato numérico antigo ou no alfanumérico que a Receita emite desde julho/2026 (12 caracteres de 0–9 ou A–Z e 2 dígitos verificadores, conferidos), e o banco não aceita o mesmo CNPJ duas vezes. Aceita com ou sem pontuação; grava sem pontuação, em maiúsculas.
- **Fuso:** lista dos fusos do Brasil, padrão `America/Fortaleza`.
- **O dia vira às:** hora cheia, padrão 5h.
- **Horário de funcionamento** (D-56), um bloco por dia da semana (domingo a sábado): "Fechado", "Um horário" ou "Dois horários" (ex.: almoço e jantar). Cada horário tem "abre" e "fecha"; "fecha" menor que "abre" quer dizer que passa da meia-noite. Botão "Copiar para os outros dias". No cadastro, exige pelo menos um dia aberto.
- Turnos, limite da conta esquecida e intervalo de envio ficam com o padrão do banco e não aparecem aqui (fora da etapa).
- Ao salvar uma edição que muda o fuso ou a virada, o sistema recalcula o dia de operação das contas da casa, e a tela diz isso. Se o fuso mudou, a tela também avisa que as horas das contas já recebidas só se corrigem com um reenvio ("Pedir reenvio"), porque elas foram gravadas com o fuso antigo.

**Detalhe do restaurante, em cartões (computador: coluna da direita; celular: um embaixo do outro):**
1. **Dados:** nome, CNPJ, fuso, virada, resumo do horário (ex.: "ter–dom · 11h–15h e 18h–2h"), situação. Ações: "Editar dados", "Ver o painel do cliente".
2. **Token de envio:**
   - Sem token: "Gerar token".
   - Com token: começo do token (`rf_8f3k••••`), "criado 02/10 por Lucas" e "usado há 2 min" (ou "ainda não usado"). Ações: "Gerar novo token" (pergunta: o antigo para **agora** (padrão) ou **em 24 h**), "Revogar token" (confirmação: "o SCC para de enviar até receber um token novo").
   - Durante as 24 h, mostra também o antigo com "para às HH:MM".
   - **O token aparece uma única vez**, logo depois de gerado, num quadro "Copie agora: este token não aparece de novo", com "Copiar token" e "Copiar instruções para a SCC" (endereço da função, token, intervalo de 5 min e o pedido de carga inicial, no texto do roteiro de cadastro). Sair da página apaga o quadro.
3. **Acesso do cliente:**
   - Sem login: "Criar login" (e-mail).
   - Com login: e-mail, "último acesso: ontem 22:10" (ou "ainda não entrou"), "precisa trocar a senha" quando for o caso. Ações: "Redefinir senha", "Trocar e-mail".
   - **Senha provisória (D-55):** gerada pelo sistema, mostrada **uma vez** num quadro "Copie agora", com "Copiar mensagem para o WhatsApp" (endereço do painel, e-mail e senha provisória, avisando que no primeiro acesso ele cria a própria senha). Sair da página apaga o quadro.
   - **E-mail que já tem conta** (dono com duas casas, D-10): "Criar login" liga a casa à conta existente, sem mudar a senha, e avisa "este e-mail já tinha acesso; agora vê as duas casas".
   - **Redefinir senha:** gera outra provisória, liga a troca obrigatória e desconecta os aparelhos daquele login. Avisa se o login vale para mais de uma casa.
   - **Trocar e-mail:** muda o e-mail de entrada do login, sem confirmação por e-mail (o admin é a fonte). Avisa se o login vale para mais de uma casa.
4. **Últimos envios:** os 20 mais recentes, com hora (no fuso da casa), resultado (ok ou erro curto), "recebidas · gravadas · iguais · removidas", versão do SCC e, quando houver, "campos novos: X, Y" (D-51). Sem envios: "Nenhum envio ainda."
5. **Pedir reenvio:** data "desde" (não pode ser futura nem anterior a 120 dias). Mostra "pedido de reenvio desde 01/10, aguardando o SCC" até o SCC atender (o banco limpa sozinho quando o reenvio começa).
6. **Situação:** "Suspender" (confirmação: "o dono deixa de ver o painel e vê o aviso com o WhatsApp da Repply; os dados continuam guardados e o SCC continua enviando") ou "Reativar" (D-57).
7. **Histórico (D-59):** as últimas 30 ações: "14/10 21:03 · Lucas Ferreira · gerou um token novo (o antigo parou na hora)". Sem senha nem token.

### 1.2 Painel do cliente (mudanças)

- **Admin vendo o painel (D-58):** faixa fixa no topo, em todas as telas da casa: "Você está vendo o painel de **X** · só leitura · Voltar ao admin" (o link volta para `/admin/restaurantes/[id]`). Em Ajustes, no lugar de "E-mail / Trocar senha / Sair", mostra "Login do cliente: dono@… (ver no admin)". O tema continua.
- **Abrir o painel registra no histórico** "abriu o painel do cliente", no máximo uma vez por hora por admin e por casa.
- **Trocar de casa (D-58):** quem tem duas ou mais casas ativas vê "Trocar de casa" no cabeçalho do celular (ao lado do nome) e na barra lateral do computador (sob o nome). Leva a `/escolher-casa`.

## 2. Como funciona por trás (jeito A, híbrido)

### 2.1 Quem grava o quê

| Operação | Como |
|---|---|
| Criar e editar restaurante, suspender, pedir reenvio | Cliente do servidor **com o login do admin**: a RLS de admin (`eh_admin_repply()`) barra qualquer outro. Contagem conferida (`count: 'exact'`; zero linhas é falha) |
| Ligar login a casa (`acessos`) | Login do admin, pela RLS |
| Gerar, trocar e revogar token | Funções do banco `trocar_token_envio` e `revogar_tokens_envio` (`security definer`, conferem `eh_admin_repply()`, nascem fechadas com `grant` só para `authenticated`). A troca é uma transação só: insere o novo e revoga (ou põe `expira_em = now() + 24 h`) nos anteriores válidos. Nunca fica sem token ou com dois "agora" por engano |
| Histórico (`registro_admin`) | Login do admin; a RLS só deixa inserir com `autor = auth.uid()` e para admin |
| Contas de login (criar, senha, e-mail, desconectar, ler e-mail e último acesso) | **Chave de serviço** (Auth admin), só no servidor, depois de `exigirAdmin()` dentro da ação |
| Achar conta pelo e-mail | Função `id_do_login_por_email(text)` (`security definer`, só `service_role`), chamada com a chave de serviço. Nada de listar mil contas |
| Desconectar os aparelhos de um login | Função `encerrar_sessoes_do_login(uuid)` (`security definer`, só `service_role`), que apaga as sessões em `auth.sessions` |
| Recalcular o dia de operação | `recalcular_dia_operacao` com a chave de serviço, depois de gravar a edição pelo login do admin |

Toda função do servidor do admin:
- começa com `exigirAdmin()` (a decisão mora na ação, não na página);
- devolve `{ ok, data? } | { ok: false, error }` com frase do produto;
- nunca põe senha, token ou `error.message` em log ou tela.

### 2.2 Token

- Gerado no servidor: `rf_` + 32 caracteres aleatórios (`crypto.randomBytes`, base62).
- Guardado só o SHA-256 em hex, **o mesmo cálculo** da função `receber-envio` (`sha256Hex`), com teste que compara os dois. Prefixo guardado: os 7 primeiros caracteres (`rf_` + 4).
- `trocar_token_envio(p_restaurante, p_hash, p_prefixo, p_antigo)` com `p_antigo` em `'agora' | '24h'`; `revogar_tokens_envio(p_restaurante)` revoga todos os válidos. As duas gravam `criado_por`/registro e devolvem o que mudou; zero linhas é erro.
- "Usado há…" mostra o `ultimo_uso_em` do token mais novo. (Hoje o banco marca todos os tokens válidos da casa a cada envio; saber qual token o SCC usou fica fora da etapa.)

### 2.3 Senha provisória

- 12 caracteres sem ambíguos (sem 0/O, 1/l/I), com letras e números; gerada com `crypto.randomInt`.
- Conta criada com `email_confirm: true`, `app_metadata.precisa_trocar_senha = true`. O fluxo da etapa 2 obriga a troca no primeiro acesso.
- Os formulários do admin seguem a regra da etapa 2: `method="post"` e botão desligado até a página carregar (`useHidratado`).

### 2.4 O banco valida (resolve a pendência 9)

- **Horário** (`restaurantes.horario_funcionamento`): função `horario_funcionamento_valido(jsonb)` numa restrição `check`:
  - lista de objetos `{ "dia": 0–6, "abre": "HH:MM", "fecha": "HH:MM" }`;
  - no máximo dois por dia;
  - `abre ≠ fecha`;
  - os do mesmo dia não se sobrepõem;
  - só o último do dia pode passar da meia-noite.

  Lista vazia continua aceita no banco (fixtures antigas; quer dizer "sempre aberta"), mas o formulário exige pelo menos um dia aberto.
- **Fuso:** restrição com a lista fechada dos fusos IANA do Brasil.
- **CNPJ:** `cnpj is null or cnpj_valido(cnpj)` (14 caracteres, numérico ou alfanumérico, com os dígitos verificadores da Receita); a unicidade já existe.

### 2.5 Lista e detalhe

- Visão `restaurantes_no_admin` (`security_invoker = true`, então a RLS das tabelas vale) com o restaurante, o `sinal_de_vida` (estado, último envio ok) e a versão do SCC do último envio. O selo usa o mesmo `seloDoSinal` do painel (D-53) com o fuso da casa.
- Detalhe: restaurante, tokens (sem o hash), acessos, envios (20), histórico (30), pelo login do admin; e-mail e último acesso dos logins pela chave de serviço.

### 2.6 Sessão e guardas (pendências 27 e 43)

- **43:** a sessão do admin deixa de carregar todas as casas. `exigirCasa(slug)` do admin busca só a casa pedida.
- **27:** erro de consulta na sessão deixa de virar lista vazia (que mandava para "acesso pendente"): vira erro de verdade (a tela de erro do Next), com log só do código.
- `exigirCasa` passa a devolver também `modoAdmin: boolean` (admin vendo casa de cliente), que o layout usa para a faixa e Ajustes para trocar o conteúdo.
- "Trocar de casa" aparece quando o login (não admin) tem duas ou mais casas ativas.

### 2.7 Permissões explícitas (pendência 14)

Na mesma migration:
- revoga `truncate`, `trigger` e `references` de `anon` e `authenticated` em todas as tabelas de `public`, e ajusta os privilégios padrão para tabelas novas;
- dá `grant` explícito do que o produto usa:
  - `insert/update/delete` em `restaurantes` e `acessos` para o admin;
  - o necessário em `tokens_envio` e `metas`;
  - `select/insert` em `registro_admin`.

  A RLS continua decidindo quem. `tests/isolamento/todas-as-tabelas.test.ts` passa a conferir os privilégios.

### 2.8 Histórico (`registro_admin`)

- Colunas: `id`, `criado_em`, `autor` (login do admin), `restaurante_id`, `acao` (lista fechada: `cadastrou`, `editou_dados`, `gerou_token`, `revogou_token`, `criou_login`, `ligou_login`, `redefiniu_senha`, `trocou_email`, `pediu_reenvio`, `suspendeu`, `reativou`, `abriu_painel`), `detalhe` (texto curto, sem senha, token ou e-mail completo).
- RLS:
  - admin lê;
  - admin insere só com `autor = auth.uid()`;
  - ninguém altera nem apaga;
  - dono não vê.
- "Abriu o painel": no máximo um por hora por admin e casa (índice único parcial ou `where not exists`).
- O nome mostrado vem de `auth.users.raw_user_meta_data.nome` quando houver; sem nome, o começo do e-mail.

## 3. Superfícies e estados (AGENTS §3)

- **Celular (390 px) e computador (1280 px), claro e escuro**, em todas as telas novas e na faixa do modo leitura.
- **Estados:** sem restaurantes; restaurante recém-cadastrado (sem token, sem login, aguardando); com token e sem login; token em transição de 24 h; suspenso; envio com erro; campos novos do SCC; pedido de reenvio pendente.
- **Quem usa:** os dois admins no mesmo restaurante ao mesmo tempo (a troca de token é atômica; o histórico mostra quem fez); dono com duas casas (login ligado, trocar e-mail ou senha avisa); dono vendo o painel enquanto o admin redefine a senha (é desconectado).
- **Caminhos:** tela; link direto para `/admin/...` sem ser admin (porteiro + `exigirAdmin` mandam para o destino da conta); POST direto nas funções do servidor (conferem por dentro).

## 4. Testes

- **Banco (contra o Supabase local):**
  - restrições de horário, fuso e CNPJ (aceitam o válido, recusam cada caso inválido);
  - `trocar_token_envio` e `revogar_tokens_envio` (agora, 24 h, não admin recusado, dono recusado, anônimo recusado);
  - `registro_admin` (dono não lê, admin não insere em nome de outro, ninguém altera);
  - `id_do_login_por_email` e `encerrar_sessoes_do_login` só com `service_role`;
  - funções novas em `funcoes-fechadas.test.ts`;
  - privilégios em `todas-as-tabelas.test.ts`;
  - a visão `restaurantes_no_admin` não mostra casa alheia para dono.
- **Funções puras:**
  - gerar token e hash (mesmo resultado do `sha256Hex` da recepção);
  - senha provisória (tamanho, alfabeto);
  - CNPJ;
  - `slug` (acentos, colisão);
  - horário (validação zod espelhando o banco, resumo em texto);
  - ordem da lista;
  - mensagem do WhatsApp e instruções da SCC.
- **Ações do servidor:**
  - cada uma recusa quem não é admin sem tocar no banco;
  - criar login com e-mail novo e com e-mail existente (liga, sem mudar senha), contra o Auth local;
  - redefinir senha desconecta;
  - nenhuma senha ou token em log.
- **Navegador:** roteiro do cadastro ao primeiro envio do gerador de dados fictícios (token gerado na tela → gerador envia → selo "em dia" na lista e no painel), login criado → dono entra e troca a senha, modo leitura do admin, suspender → dono vê "acesso suspenso" → reativar; 390 px e 1280 px, claro e escuro.

## 5. Fora desta etapa

- **Fica para outras etapas:**
  - e-mail de alarme (etapa 9);
  - convite por e-mail;
  - mostrar no histórico de envios as tentativas com token errado (401);
  - separar contas "novas" de "alteradas";
  - saber qual token o SCC usou;
  - editar turnos, limite de conta esquecida e intervalo de envio pelo admin;
  - métricas no admin.
- **Feito pela equipe técnica, com o ok do Lucas Ferreira:**
  - excluir restaurante;
  - criar admin pela tela;
  - exclusão a pedido (LGPD).
- **Mudanças no painel do dono além da faixa, do Ajustes do admin e do "Trocar de casa"** ficam fora.

## 6. Decisões novas (14/10/2026)

- **D-55:** a senha provisória é gerada pelo sistema, mostrada uma vez ao admin e enviada pela Repply por WhatsApp. "Redefinir senha" gera outra provisória, liga a troca obrigatória e desconecta os aparelhos. Convite por e-mail fica para depois.
- **D-56:** até dois horários de funcionamento por dia (ex.: almoço e jantar); o último pode passar da meia-noite. Fora deles o vigia não acusa atraso nem parada.
- **D-57:** o admin suspende e reativa restaurantes. Suspenso, o dono vê "acesso suspenso" com o WhatsApp da Repply; os dados ficam guardados e o SCC continua enviando. Excluir fica fora do MVP.
- **D-58:** quem tem duas ou mais casas ativas troca de casa pelo painel; o admin que abre o painel de um cliente vê a faixa "só leitura" com "Voltar ao admin", e Ajustes mostra o login do cliente no lugar das ações da conta.
- **D-59:** as ações do admin ficam num histórico por restaurante (quem, quando, o quê), sem senha nem token; "abriu o painel do cliente" entra no máximo uma vez por hora.
- **D-60:** CNPJ opcional no cadastro; quando preenchido, é conferido (formato numérico ou alfanumérico da Receita) e não pode repetir.

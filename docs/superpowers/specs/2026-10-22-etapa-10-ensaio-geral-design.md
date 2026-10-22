# Etapa 10 — Ensaio geral (pronto para demonstração) · Desenho

> Aprovado com o Lucas Ferreira em 22/10/2026. Vira um plano em
> `docs/superpowers/plans/` e é executado por `subagent-driven-development`,
> em commits pequenos no `main`. **Nada que mexa na nuvem (migration, dados de
> demonstração, envio real do gerador) acontece sem uma autorização na hora.**

## Objetivo

Deixar o repply food. **pronto para ser demonstrado** — para a SCC e para os
primeiros donos de restaurante — no site de verdade (`food.repplyhub.com.br`).
No fim desta etapa, um vendedor da Repply consegue rodar o **roteiro de aceite
do SPEC §10** de ponta a ponta, sem travar, com uma casa e dados fictícios
convincentes; as telas estão redondas no celular e no computador; e existe um
roteiro escrito para qualquer pessoa da Repply demonstrar sozinha.

Todas as funcionalidades do MVP (etapas 1–9) já estão no ar. Esta etapa **não
cria funcionalidade nova para o cliente** — ela prepara, arredonda e ensaia. A
única mudança estrutural é uma marca de "casa de demonstração" no banco
(seção 2).

## 1. Escopo

**Entra:**
- Uma **casa de demonstração** fixa na nuvem, com dados fictícios convincentes
  e um jeito repetível de deixá-los recentes antes de cada demo (seção 2).
- O **ensaio** do roteiro de aceite (SPEC §10) no site real, anotando o que
  travar ou ficar feio (seção 3).
- Os **acabamentos** que o ensaio revelar — só o que aparece na demo (seção 4).
- O **kit de demonstração**: um roteiro escrito + a configuração salva do
  gerador (seção 5).
- A **checagem final** de cada tela em celular e computador, tema claro/escuro
  e estado vazio (seção 6).

**Não entra (YAGNI):**
- Os demais itens "Baixa" da dívida técnica que não aparecem na demo (ficam
  para a Fase 2).
- Rodar a verificação de tipos no Linux (o ramo do teste de tipos só-Linux
  continua pendente; não bloqueia a demonstração no Windows/Vercel).
- Um "modo demonstração" automático, uma tela de admin para ligar/desligar a
  marca de demo, ou qualquer dado de exemplo embutido no código.
- Funcionalidade nova de produto.

## 2. A casa de demonstração

**O problema que ela resolve.** Dado fictício envelhece: o SCC real manda dados
o tempo todo, o gerador não. Uma casa de demo fixa na nuvem fica "parada" entre
as demos — e, com o alarme ligado (etapa 9), mandaria e-mail de "parado" para a
equipe Repply. Precisamos de uma casa que (a) persista (não recadastrar a cada
vez), (b) tenha como ficar "fresquinha" rápido antes de uma demo, e (c) **não
dispare alarme de verdade** entre demos.

**A marca no banco.** Uma coluna nova em `restaurantes`:
`demonstracao boolean not null default false` (migration nova, aditiva). O
vigia respeita a marca em um ponto só: em `atualizar_estados`, a linha que
registra a parada (`registrar_parada_sinal`) **não roda** para casas com
`demonstracao = true`. Tudo o mais continua igual — em especial, **o selo da
casa continua mudando** para "em dia / atrasado / parado" normalmente. Ou seja:
numa demonstração, o vendedor ainda mostra o selo ficando "parado" na tela; só
não sai e-mail para a Repply. (Que o e-mail funciona de verdade já foi provado
no teste ao vivo de 22/10.)

**Como a marca é ligada.** Via SQL/`insert` na criação da casa de demonstração
(uma operação autorizada, uma vez). Não há tela de admin para isso nesta etapa
(YAGNI). O admin **mostra** a marca: um selo discreto "demonstração" no cartão
da casa e no detalhe, para ninguém confundir com restaurante real.

**Os dados.** A casa é cadastrada pelo admin (passo 1 do roteiro), recebe um
token, e é alimentada pelo **gerador de dados fictícios** apontado para a nuvem
(`--confirmo-nuvem`, com autorização). O retoque usa uma configuração salva que
produz um bar movimentado e crível: histórico de algumas semanas, almoço e
jantar, pico de sexta e sábado, algumas mesas abertas agora, uma ou duas contas
esquecidas, descontos, garçons, e uma **meta do mês definida** (para a tela Hoje
e Resultados mostrarem o andamento). Antes de cada demo, roda-se o retoque para
os números ficarem recentes e o selo voltar a "em dia".

**Limpeza.** A casa de demonstração **fica** (é o objetivo). O que se repete é
só o retoque dos dados. Se um dia for descartada, é pelo mesmo caminho de
exclusão do admin.

## 3. O ensaio

Rodar o **roteiro de aceite (SPEC §10)** inteiro, no site real, do jeito que um
vendedor rodaria, com o Lucas Ferreira nos passos que pedem login/painel (o
assistente não digita senha nem entra no painel de produção):

1. No admin, cadastrar a casa de demonstração e gerar o token.
2. Ligar o gerador (retoque) com esse token; o estado vira "em dia".
3. Entrar como cliente e trocar a senha.
4. Ver o guia de instalação (só no celular).
5. Abrir "Hoje".
6. Abrir "Resultados", nas quatro abas.
7. Exportar o PDF.
8. Definir a meta.
9. Parar o gerador e ver o selo ir para "atrasado" e depois "parado" (o e-mail
   de alarme não sai, porque a casa é de demonstração — e isso é o esperado).

Cada tropeço (algo que trava, confunde ou fica feio) vira um item de acabamento
(seção 4). O ensaio é a fonte da lista — não se adivinha de antemão.

## 4. Os acabamentos

Só o que o ensaio revelar, e só o que o cliente vê na demo. Para cada item:
entender a causa (se for comportamento estranho, `systematic-debugging`),
consertar no ponto comum, com teste antes do conserto (`test-driven-development`),
e conferir nas duas larguras. Candidatos já conhecidos da dívida técnica
(itens "Baixa") entram **somente se** aparecerem no ensaio; o resto fica para a
Fase 2.

## 5. O kit de demonstração

Um documento curto e versionado, `docs/operacao/demonstracao.md`, escrito em
linguagem simples (é para um vendedor, não para quem programa), com:
- o passo a passo da demonstração (os 9 passos acima, com o que falar em cada
  tela e o que destacar: faturamento sem a taxa, comparação justa, o selo "há X
  min", a instalação no celular);
- como rodar o **retoque** do gerador antes da demo (o comando, o token, o
  `--confirmo-nuvem`, e o lembrete de que isso é operação autorizada);
- o que NÃO fazer (não usar o token/dados da casa de demonstração para testes;
  não demonstrar no localhost quando a ideia é impressionar).

Mais a **configuração salva do gerador** (um arquivo de exemplo, sem token
real, ignorado pelo Git quando preenchido) que produz o dataset da seção 2.

## 6. Checagem celular + computador

Uma passada final, tela por tela, confirmando o que o `CLAUDE.md §9` exige para
mudança de tela: **celular (390 px) e computador**, **tema claro e escuro**, e
**estado vazio** (casa recém-cadastrada, sem dados). Telas: entrada (entrar,
trocar senha, escolher casa), Hoje, Resultados (as 4 abas), Ajustes, Admin
(lista, cadastro, detalhe), e "ver o painel do cliente". Cada diferença vira
acabamento (seção 4).

## 7. Verificação e critério de aceite

**Pronto** quando:
- o roteiro do SPEC §10 roda inteiro, no site real, sem travar (com o Lucas nos
  passos de painel);
- os acabamentos achados no ensaio estão consertados, com teste;
- a checagem de celular + computador passou em todas as telas;
- o kit (`docs/operacao/demonstracao.md` + a config do gerador) está escrito e
  commitado;
- a verificação obrigatória passa: **tipos, lint, testes e build** (CLAUDE.md §9).

## 8. Decisões desta etapa

- **Casa de demonstração marcada no banco** (vira uma decisão numerada nova em
  `docs/decisoes.md` na execução): coluna `demonstracao` em `restaurantes`; o
  vigia não dispara o e-mail de alarme para ela, mas o selo continua mudando; o
  admin mostra um selo "demonstração".
- A casa de demonstração vive na **nuvem de produção** (piloto no Free), não num
  ambiente separado — é o que torna a demo convincente (URL real) e o kit
  reutilizável.
- O retoque dos dados é **manual e autorizado** (gerador com `--confirmo-nuvem`),
  não uma rotina automática.

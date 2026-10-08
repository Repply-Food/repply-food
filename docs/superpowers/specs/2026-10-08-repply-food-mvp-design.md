# repply food. · Desenho do MVP

- **Data:** 08/10/2026
- **Estado:** aprovado por partes com o Lucas Ferreira, durante a descoberta (05–08/10/2026)
- **Molde:** o Repply Imob (Next.js + Supabase) para a base do app; o Repply CRM para os padrões de webhook, idempotência e alarme de "sinal de vida".
- **Decisões:** todas numeradas em [`docs/decisoes.md`](../../decisoes.md). Este desenho cita a decisão (D-xx) que justifica cada escolha.

---

## 1. Por que existe

O sistema de caixa da SCC Software (Delphi + SQL Server 2008) roda dentro de ~50 bares e restaurantes, e tem que ser assim: se a internet cai, o atendimento não pode parar. O preço disso é que **os números ficam presos no computador do balcão**. Para saber quanto vendeu, o dono precisa estar na casa com a máquina ligada, usar o app da SCC na mesma rede ou pedir relatório remoto ao Emerson.

O repply food. tira esses números do balcão: o SCC envia os dados para a nuvem a cada ~5 minutos, e o dono vê um painel no celular de qualquer lugar, com todo o histórico.

## 2. Decisões que moldam o desenho

| Tema | Decisão | Ref. |
|---|---|---|
| Banco | **Um banco central para todos os restaurantes.** Chave de cada linha = (restaurante, código original do SCC), e a RLS isola cada cliente. Sem VPS por cliente. | D-01 |
| Recepção | **Código versionado** (Supabase Edge Function), sem n8n. Token por restaurante. | D-03 |
| Stack | **Next.js + Supabase**, reaproveitando peças do Repply Imob. | D-04 |
| Infra | **Piloto:** Supabase Free + Vercel Hobby (deploy por linha de comando). **No 1º cliente pagante:** Supabase vai para a org Pro e o painel sai do Hobby. | D-09 |
| Acesso | **Um login por restaurante, sem cargos.** O modelo aceita N logins e N restaurantes por login. | D-10 |
| Login | E-mail + senha criados pela Repply, com troca obrigatória no 1º acesso. | D-11 |
| Admin | **Painel da Repply no MVP**: restaurantes, estado do envio, token, acessos, "ver o painel do cliente". | D-32, D-38 |
| Interface | **Celular primeiro, computador sempre funcionando.** O guia "tela inicial" só aparece no celular, uma vez por aparelho. | D-36, D-39 |
| Dados pessoais | RG, telefone e sexo são **descartados na recepção**. O nome do cliente fica fora do MVP. Os dados nunca são usados para propostas do Hub. | D-29, Parte 3 |
| Histórico | Tudo que o SCC tiver, enviado em lotes. | D-21 |
| Taxa de serviço | Sempre **separada** do "faturamento da casa". | D-14 |

## 3. Arquitetura

```
RESTAURANTE                          NUVEM (Supabase)                         TELAS (Vercel)
┌──────────────────────────┐        ┌──────────────────────────────────┐     ┌───────────────────────┐
│ SCC (Delphi)             │ HTTPS  │ receber-envio (Edge Function)    │     │ Painel do dono        │
│ SQL Server 2008          │──POST─▶│ 1. token → restaurante           │     │ food.repplyhub.com.br │
│                          │        │ 2. valida o envelope             │     │ Hoje · Resultados ·   │
│ temporizador ~5 min      │◀─ ok ──│ 3. guarda o JSON original        │     │ Ajustes               │
│ + envio no fechamento    │ janela │ 4. grava sem duplicar + remove   │     ├───────────────────────┤
│ "janela" desde a última  │ confir-│    o que sumiu da janela         │     │ Admin Repply /admin   │
│  data confirmada         │ mada   │ 5. atualiza o sinal de vida      │     │                       │
└──────────────────────────┘        ├──────────────────────────────────┤     └───────────┬───────────┘
                                    │ Postgres + RLS                    │◀── leitura ─────┘
                                    │ métricas = funções SQL            │   (sessão do usuário)
                                    ├──────────────────────────────────┤
                                    │ pg_cron: vigia (5 min) → e-mail   │
                                    │          limpeza de JSON antigo   │
                                    └──────────────────────────────────┘
```

**Unidades e responsabilidades:**

| Unidade | Faz | Depende de | Doc |
|---|---|---|---|
| **Envio no SCC** (Pedro) | Monta o envelope, manda, guarda a última janela confirmada | contrato de dados | [`integracao-scc/contrato-de-dados.md`](../../integracao-scc/contrato-de-dados.md) |
| **`receber-envio`** | Autentica, valida, grava, reconcilia, responde | tabelas de recepção | [`arquitetura/recepcao-de-dados.md`](../../arquitetura/recepcao-de-dados.md) |
| **Banco** | Guarda e isola; calcula as métricas | — | [`arquitetura/modelo-de-dados.md`](../../arquitetura/modelo-de-dados.md), [`arquitetura/seguranca-e-isolamento.md`](../../arquitetura/seguranca-e-isolamento.md) |
| **Métricas** | Funções SQL com nome, uma por indicador | banco | [`metricas.md`](../../metricas.md) |
| **Painel** | Telas do dono, PWA, PDF | métricas, Auth | [`telas/`](../../telas/index.html) |
| **Admin** | Cadastro, token, acessos, estado do envio | banco, Auth admin | [`telas/admin.html`](../../telas/admin.html), [`operacao/cadastrar-restaurante.md`](../../operacao/cadastrar-restaurante.md) |
| **Vigia** | Calcula "em dia / atrasado / parado" e avisa por e-mail | `sinal_de_vida`, Resend | [`arquitetura/recepcao-de-dados.md`](../../arquitetura/recepcao-de-dados.md#7-vigia-do-sinal-de-vida) |
| **Gerador de dados fictícios** | Simula o SCC enviando pelo mesmo caminho | contrato de dados | §8 |

**Princípio:** a recepção de dados não depende do painel. Se a Vercel cair, os dados continuam chegando.

## 4. Envio de dados (resumo; o detalhe está no contrato)

- **Modo A, janela por data. É o ponto de partida e não exige mexer no banco do restaurante.**
  - A cada ciclo, o SCC manda todas as entradas abertas ou fechadas a partir da **data da última janela confirmada** (no mínimo desde ontem), mais **todas as entradas ainda abertas**.
  - Uma vez por dia, ele reenvia os **últimos 7 dias**.
  - A nuvem atualiza o que mudou e marca como **removida** a entrada que existia naquela janela e não veio.
- **Modo B, só o que mudou** (Change Tracking do SQL Server 2008). É otimização futura e depende do Pedro (pergunta B3).
- **Ritmo:** temporizador no SCC, com intervalo no arquivo de configuração (padrão 300 s). Há um envio extra no fechamento do caixa ou do dia. Envelope vazio é o "sinal de vida". Os ciclos nunca se sobrepõem, e o envio roda em segundo plano.
- **Falhou?** O SCC espera o próximo ciclo. Como a janela não avançou, nada se perde.
- **Endereço, token e intervalo ficam num arquivo de configuração do SCC**, nunca dentro do executável. Isso protege a troca de conta do Supabase (D-09) e a troca de token.

## 5. Modelo de dados (resumo)

São 8 tabelas. O detalhe está em [`arquitetura/modelo-de-dados.md`](../../arquitetura/modelo-de-dados.md).

| Tabela | Guarda | Cliente lê | Escreve |
|---|---|---|---|
| `restaurantes` | Nome, CNPJ, fuso, hora de virada do dia (5h), horário de funcionamento, turnos, situação | o dele | admin (turnos: o cliente) |
| `acessos` | Login ↔ restaurante (N:N) | o dele | admin |
| `admins_repply` | Quem entra no `/admin` | — | admin |
| `tokens_envio` | Impressão digital (SHA-256) do token, prefixo visível, criação, último uso, revogação, validade | — | admin |
| `envios` | Cada envio: quando, modo, versão, contagens, erro; JSON original por 48h (erro: 90 dias) | — | recepção |
| `sinal_de_vida` | Por restaurante: último envio, último sem erro, estado | — | recepção e vigia |
| `entradas` | Mesas/contas. Chave (restaurante_id, cod_entrada). Inclui `dia_operacao` calculado e uma coluna `extras` com os campos ainda sem significado | o dele | recepção |
| `metas` | Meta de faturamento por mês | o dele | o cliente |

## 6. Telas

As telas aprovadas, em celular e computador, estão em [`docs/telas/`](../../telas/index.html):

- **Hoje** (D-33):
  - faturamento da casa até agora contra o mesmo dia da semana **até o mesmo horário**;
  - taxa de serviço separada;
  - curva acumulada;
  - mesas abertas, pessoas e ticket por pessoa;
  - contas abertas há mais de 4h, mostrando até 3, com "ver todas (N)";
  - meta do mês com projeção.
- **Resultados** (D-34): período (Hoje · 7 dias · Mês · Escolher), comparação e PDF; abas **Vendas · Horários · Equipe · Descontos**.
- **Ajustes** (D-35):
  - o dono muda a meta, os turnos, a senha e o tema;
  - nome, CNPJ, horário de funcionamento e hora de virada são só leitura, mudados pelo admin.
- **Primeiro acesso** (D-11, D-36): login, troca de senha obrigatória e o guia da tela inicial. O guia aparece **só no celular**, uma vez por aparelho e nunca no app instalado.
- **Admin** (D-32, D-38):
  - lista de restaurantes com o estado do envio;
  - cadastro;
  - token mostrado uma vez, com troca "na hora" (padrão) ou "em 24h";
  - acesso do cliente;
  - últimos envios;
  - "ver o painel do cliente".
- **Computador** (D-40): o menu de baixo vira barra lateral escura, com mais colunas lado a lado.

**Rotas** (seguindo o padrão `[orgSlug]` do Imob):
- `/entrar`, `/trocar-senha`;
- `/r/[slug]/hoje`, `/r/[slug]/resultados?aba=vendas&periodo=7d`, `/r/[slug]/ajustes`;
- `/admin`, `/admin/restaurantes/[id]`.

Um login com um restaurante só cai direto em `/r/<slug>/hoje`. O admin abre `/r/<slug>/...` de qualquer cliente em modo leitura: é o "ver o painel do cliente".

**PWA:** manifesto com os ícones de `app/` do pacote de marca, `display: standalone`, e um service worker mínimo (só a página "sem conexão", **sem guardar dados**).

**PDF:** gerado no servidor, para sair igual em qualquer aparelho, com os números da tela Resultados no período escolhido.

## 7. Erros e casos de borda

| Situação | O que acontece |
|---|---|
| Internet do restaurante cai por dias | A janela não avança; quando volta, o próximo envio cobre o buraco |
| Mesma entrada chega várias vezes | Upsert pela chave (restaurante, cod_entrada); se nada mudou, não regrava |
| Entrada apagada ou cancelada no SCC | Some da janela → `removida_em` preenchido → sai dos relatórios (nunca é apagada de verdade) |
| Token inválido ou revogado | 401; o admin vê o restaurante como "parado" |
| Versão de formato desconhecida | 422 com a lista de erros; o JSON fica guardado 90 dias |
| Envio grande demais (carga inicial) | 413 "divida em janelas menores" (limite: 2 MB ou 2.000 entradas) |
| Dois envios ao mesmo tempo do mesmo restaurante | Processados um por vez (trava por restaurante) |
| Dados pessoais no envio | Descartados antes de gravar |
| Mesa aberta às 23h, fechada à 1h | Conta para o dia de operação da abertura, com virada às 5h (provisório até a pergunta B6) |
| Restaurante fechado (fora do horário) | Não gera alarme; o admin mostra "fechado agora" |
| Projeto Supabase Free pausado | Só na fase sem envio; com o restaurante enviando não pausa |
| Endereço muda na transferência Free → Pro | Edita-se o arquivo de configuração do SCC; testar a transferência antes |

## 8. Como se prova que funcionou

**Testes automáticos** (rodam a cada mudança):

- **Recepção:**
  - reenvio idêntico não duplica;
  - aberta que vira paga é atualizada;
  - entrada que some vira removida;
  - token errado recebe 401;
  - versão desconhecida recebe 422;
  - **RG e telefone nunca chegam ao banco**;
  - lote acima do limite recebe 413.
- **Isolamento:** um login do restaurante A tenta ler o B e recebe vazio. A tentativa de escrita é recusada de verdade, não basta "zero linhas" (lição do CRM).
- **Métricas:** cada definição de [`metricas.md`](../../metricas.md) tem um exemplo de conta que vira teste: virada às 5h, taxa separada, comparação no mesmo horário, projeção da meta.
- **Ponta a ponta:** o **gerador de dados fictícios** envia pelo mesmo `receber-envio`, no formato exato do JSON do Pedro (D-13). O simulador C++ do Lucas Duarte (`Repply-Food/scc-dashboard`) pode virar esse gerador.
- **Verificação antes de dizer "feito":** tipos, lint, testes e build.

**Roteiro de demonstração**, que é o critério de pronto do MVP:

1. No admin, cadastrar o restaurante e gerar o token.
2. Ligar o gerador com esse token; o estado no admin vira "em dia".
3. Entrar como cliente e trocar a senha.
4. Ver o guia de instalação (só no celular).
5. Abrir "Hoje".
6. Abrir "Resultados", nas quatro abas.
7. Exportar o PDF.
8. Definir a meta.
9. Parar o gerador e ver "atrasado", depois "parado", e o e-mail de alarme chegar.

**Critério de sucesso do piloto** (a fechar com a SCC):

1. O faturamento do painel bate **centavo a centavo** com o fechamento do SCC em todos os dias.
2. Durante o horário de funcionamento não há buraco de mais de 30 minutos sem dados, salvo queda de internet do restaurante.
3. O dono abre o painel em ≥ 4 dias por semana e para de pedir relatório ao Emerson.
4. Ao fim de 30–60 dias, o dono aceita a mensalidade.

## 9. O que NÃO faz (YAGNI)

- Cargos e permissões dentro do restaurante (D-10).
- Avisos por WhatsApp, e-mail ou notificação para o dono (D-15).
- Métricas que dependem de itens, pagamentos, caixa ou custo (grupos 2 a 5 do cardápio): esperam a SCC mandar as tabelas.
- Comparação com o ano anterior (D-22).
- Mentor IA (fase 2).
- App de loja.
- Escrever qualquer coisa de volta no SCC: o fluxo é só de ida.
- Usar os dados para marketing (D-29).

## 10. Riscos

| # | Risco | Mitigação |
|---|---|---|
| 1 | O Delphi do restaurante não faz HTTPS moderno (B9) | Testar cedo; plano B: programa pequeno separado para o envio (B19) |
| 2 | O Pedro sem tempo (B16) | Modo A enxuto, sem mudar o banco do cliente; a demonstração não depende dele |
| 3 | Regra de negócio desconhecida (cortesia, fiado, dia de operação) | Definições em `metricas.md` conferidas com a SCC; o que varia vira ajuste por restaurante |
| 4 | Supabase Free sem backup | O banco é cópia do SCC: reenvio do zero; vai para o Pro no gatilho D-09 |
| 5 | Vercel Hobby não permite uso comercial | Mesmo gatilho D-09 |
| 6 | O dono não instala ou abandona | Guia de instalação, "Hoje" legível em 10 s, piloto acompanhado |
| 7 | Atrito com o app de celular da SCC (A9) | Pauta da reunião com a SCC |

## 11. Próximo passo

Plano de implementação (`superpowers:writing-plans`) em `docs/superpowers/plans/`, começando pela fundação:

1. Repositório Next.js + Supabase com as peças do Imob.
2. Banco e RLS.
3. `receber-envio` e o gerador de dados fictícios.
4. Painel.
5. Admin.
6. Vigia.
7. PWA e PDF.

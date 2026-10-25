# Desempenho sem regressão — diagnóstico e desenho proposto

**Data:** 24/10/2026. **Base inspecionada:** `422eaef`.
**Estado em 25/10:** execução local autorizada pelo Lucas Ferreira; T0 parcial, nenhuma otimização implementada. Publicação e mudanças em produção não autorizadas por este desenho.
**Pedido:** mapear possíveis lentidões e preparar execução por outro modelo, preservando todas as funcionalidades do MVP em piloto.

## 1. Conclusão executiva

As melhores primeiras candidatas estão no SQL das métricas: curva do Hoje, comparação semanal de Resultados e meta mensal. Há trabalho repetido demonstrável nesses trechos. O efeito sobre o tempo de resposta ainda precisa ser medido.

Recomendo otimização incremental, com comparação antes/depois no mesmo conjunto fictício. Primeiro reduzir trabalho dentro das funções existentes; depois avaliar índices e comunicação com o banco. Não começar por cache de números, troca de arquitetura ou reescrita da recepção.

O objetivo é entregar o mesmo painel, os mesmos números e o mesmo PDF com menos trabalho por requisição. Não há promessa de percentual de ganho: esta sessão foi de inspeção estática, sem benchmark, acesso à produção, alteração de banco ou teste de carga.

### Abordagens avaliadas

| Abordagem | Benefício | Custo/risco | Recomendação |
|---|---|---|---|
| Otimizar SQL existente e desperdícios medidos | Mantém contratos e consumidores; reversão localizada | Exige testes de equivalência, sobretudo nas datas | Começar aqui |
| Agrupar leituras em RPCs de painel | Menos chamadas HTTP e autenticações no banco | Pode serializar SQL hoje paralelo; agrupar não elimina varreduras | Só se a rede/fila continuar dominante |
| Cache compartilhado, tabelas-resumo, materializações | Pode baratear leituras muito frequentes | Invalidação em reenvio, remoção, fuso, virada, meta e permissão; dados atrasados | Fora da primeira rodada; novo desenho se medição justificar |

## 2. Caminhos críticos atuais

### 2.1 Hoje

```text
navegador → proxy/getUser
          → sessão: eh_admin_repply + casas do login, em paralelo
          → guarda da casa
          ├─ layout: sinal de vida (+ registro da abertura se admin)
          └─ página: configuração da casa → seis RPCs em paralelo → componentes
```

Fontes: `lib/supabase/proxy.ts:55`, `lib/auth/sessao.ts:67`, `app/r/[slug]/layout.tsx:19`, `app/r/[slug]/hoje/page.tsx:37`, `lib/metricas/hoje.ts:29`.

- As seis RPCs compartilham o mesmo `agora` no leitor.
- A comparação também chama faturamento internamente, inclusive para o dia atual.
- Cada instância montada de `AtualizaHoje` agenda `router.refresh()` a cada 60 s. Não há verificação própria de visibilidade ou conectividade; o navegador pode limitar timers em segundo plano, mas o código não garante a suspensão.
- Se 20 telas efetivamente refrescarem uma vez por minuto, serão 120 chamadas de métricas/minuto, além de sessão/configuração/sinal. É estimativa de demanda, não tráfego observado.
- Layout e página têm trabalho paralelo; não se deve somar todas as durações para estimar latência. Medir o caminho mais demorado e o tempo até os números úteis aparecerem.

### 2.2 Resultados

```text
proxy → sessão/guarda → configuração → filtros canônicos
                                     → oito RPCs (+ meta no atalho Mês)
                                     → quatro painéis enviados ao cliente
                                     → troca de aba local, sem refazer leitura
```

Fontes: `app/r/[slug]/resultados/page.tsx:23`, `lib/metricas/resultados/index.ts:30`, `components/painel/resultados/abas-resultados.tsx:35`.

O custo inicial de ler as quatro análises compra a troca imediata de abas. Buscar somente a aba visível mudaria essa experiência. Não é recomendação desta rodada.

### 2.3 PDF

`app/r/[slug]/resultados/pdf/route.ts:18–49`: acesso → configuração → mesmos filtros e leitor de Resultados → `renderToBuffer` → resposta com `no-store`.

É uma requisição independente da tela. Mede-se separadamente leitura SQL, renderização, tamanho, memória e partida fria. Uma importação estática do renderizador nessa rota não demonstra que ele esteja no JavaScript do navegador.

### 2.4 SCC

`supabase/functions/receber-envio/index.ts:104–220`: lê corpo → tamanho → token → ritmo → parse/filtro/validação → `processar_envio` → resposta.

Dentro do banco: trava por restaurante → sanitização defensiva → normalização/hash/upsert por entrada → reconciliação → sinal de vida → tokens → reenvio → registro sanitizado do envio.

Fonte efetiva de `processar_envio`: `20261014120000_recepcao_barra_valor_composto.sql`, não sua versão original da fundação. A trava evita dois processamentos simultâneos para a mesma casa; não deve ser retirada como otimização.

### 2.5 Admin e Ajustes

- Lista: `lib/admin/dados.ts:56`, visão com busca lateral da versão SCC mais recente.
- Detalhe: `app/admin/restaurantes/[id]/page.tsx:40` espera a lista antes de renderizar `DetalhePane`; só então começam seis consultas paralelas e a leitura dos usuários no Auth.
- `lib/admin/dados.ts:75` deduplica IDs, mas faz uma chamada Auth por usuário único, em paralelo sem limite próprio.
- O detalhe busca a lista completa mesmo no celular, onde ela fica oculta por CSS. A lista também produz marcação móvel e desktop. Isso não justifica remover a experiência de computador.
- Ajustes já paraleliza restaurante, metas e logins do cliente (`app/r/[slug]/ajustes/page.tsx:36`). Não apareceu razão para reescrevê-lo na primeira rodada.

### 2.6 Rotinas

- Vigia a cada cinco minutos; atualiza estado apenas se mudou e isola erro por casa.
- Alarmes usam `pg_net`, confirmação real e lote de até 20 pendentes com `skip locked`.
- Retenção diária limpa apenas payloads antigos, não resumos de envios.
- A versão mais recente do vigia é `20261022120000_casa_de_demonstracao.sql`: demonstração continua mudando selo e não inicia alarme de parada.

## 3. Achados priorizados

**Classificação:** fato = estrutura encontrada no código; hipótese = impacto que depende de medição. Prioridade indica ordem de investigação, não aprovação automática de mudança.

| ID | Prioridade | Evidência e possível efeito | Direção | Risco |
|---|---|---|---|---|
| P01 | Alta | Curva combina 48 faixas com entradas de hoje e até quatro dias históricos antes de agregar (`20261019120000_metricas_hoje.sql:201–245`). Multiplicação lógica confirmada; plano físico não medido | Pré-agregar por faixa de fechamento e acumular sobre grade pequena | Médio: bordas de tempo |
| P02 | Alta | Resumo semanal usa `LATERAL` que soma histórico para cada dia selecionado (`20261021100000_limita_e_compara_pessoas_resultados.sql:54–76`) | Agregar por dia uma vez e usar janela das quatro ocorrências anteriores | Médio/alto: médias, lacunas e nulos |
| P03 | Alta, pequeno escopo | Meta lê mês e mês até ontem separadamente (`20261019120000_metricas_hoje.sql:297–310`) | Duas somas com `FILTER` numa leitura | Baixo relativo; contrato permanece crítico |
| P04 | Alta para medir | Seis e oito/nove RPCs por carga; configuração anterior às métricas | Medir rede/fila antes de consolidar | Médio: perder paralelismo |
| P05 | Média | Refresh fixo sem política de visibilidade (`atualiza-hoje.tsx:18`) | Pausar oculto/offline e atualizar ao retornar, mantendo 60 s visível | Médio: ciclo de vida e retomada |
| P06 | Média | Reconciliação aplica fuso e conversão para data nas colunas (`20261014120000_recepcao_barra_valor_composto.sql:262–272`) | Comparar intervalos de timestamp com limites locais calculados uma vez | Alto: remoção lógica errada |
| P07 | Média para medir | RLS chama `tem_acesso(restaurante_id)` e admin; helper já inclui admin (`20261009120000_fundacao_esquema.sql:249–274,389`) | Medir sob usuário real; não inferir custo só de repetição textual | Alto: isolamento |
| P08 | Média | Lista bloqueia início do detalhe no admin; Auth cresce com autores/logins | Separar início das leituras mantendo streaming; limitar concorrência Auth somente se necessário | Baixo/médio |
| P09 | Média para medir | Índice de abertas cobre `fechada_em is null`, mas RPC também inclui fechamento futuro em relação a `p_agora` | Avaliar ramos disjuntos e índices compatíveis | Médio: consultas históricas |
| P10 | Média para medir | Fontes locais: sete OTF e uma TTF no layout global; Recharts em três gráficos | Medir bytes efetivamente transferidos, parse e tarefas longas | Médio: fontes, gráficos e carregamento |
| P11 | Baixa no piloto | Lista sem paginação; versão SCC via lateral; contagem de acessos por restaurante sem índice iniciado por restaurante | Índices estreitos se planos mostrarem necessidade; paginação pede desenho de produto | Médio |
| P12 | Monitorar | Resumos de `envios` crescem sem expiração; retenção filtra payloads por idade/status | Medir tabela/TOAST, manutenção e índice parcial da retenção | Médio: escrita/WAL |
| P13 | Monitorar | PDF faz buffer completo antes de responder | Otimizar somente se render/memória dominarem após SQL | Médio: arquivo incompleto/erro tardio |
| P14 | Monitorar | `processar_envio` itera até 2.000 entradas, faz normalização, hash e busca com trava por linha | Medir repetidos/alterados; set-based só com desenho posterior | Alto: contadores/idempotência |
| P15 | Medir cedo | Região Supabase registrada como São Paulo (D-50); região efetiva da função Vercel não demonstrada pelo código | Medir distância servidor–banco e cold start; conferir configuração com autorização | Operacional |

### Índices já presentes — não duplicar

- PK de `entradas`: `(restaurante_id, cod_entrada)`.
- `entradas_dia_idx`: `(restaurante_id, dia_operacao) WHERE removida_em IS NULL`.
- `entradas_abertas_idx`: `(restaurante_id) WHERE fechada_em IS NULL AND removida_em IS NULL`.
- `envios_restaurante_recebido_idx`: `(restaurante_id, recebido_em DESC)`.
- PK de `acessos`: `(user_id, restaurante_id)`; de `metas`: `(restaurante_id, mes)`; hash de token único.
- Histórico do admin e fila de alarmes já têm índices próprios.

Um índice novo custa espaço e trabalho a cada envio. Não acrescentar vários `INCLUDE`, índice por toda coluna ou índice de dia da semana sem demonstrar vantagem sobre `entradas_dia_idx`.

## 4. O que já está otimizado e precisa ser preservado

1. `obterSessao` e `casaPeloEndereco` usam React `cache` no escopo de renderização; isso não é cache compartilhado de autorização. Route Handlers não devem depender dessa memoização para segurança ou deduplicação.
2. `getUser` valida no proxy; `getSession` na sessão evita uma segunda validação de rede no fluxo normal. Não retirar a primeira validação nem confiar em cabeçalhos enviados pelo cliente.
3. Leituras de métricas e de Ajustes já estão em paralelo.
4. Abas de Resultados alternam localmente e mantêm URL. Mudanças de período continuam buscando dados.
5. Detalhe do admin já tem `Suspense`; painel possui `loading.tsx`. Skeleton melhora percepção, não prova redução do tempo até o conteúdo.
6. `staleTimes.dynamic = 30` está configurado globalmente, embora o comentário cite admin. Não aumentar o prazo para esconder lentidão. Revalidar mutações, logout e troca de casa.
7. PWA guarda somente shell estático e página offline; não guarda métricas, PDF ou HTML autenticado.
8. SQL centraliza métricas; dinheiro chega como texto; PDF usa o mesmo leitor da tela.
9. SCC já evita regravar conteúdo idêntico por hash. As duas barreiras de sanitização são intencionais.
10. Alarme já é assíncrono; não confundir enfileiramento com e-mail confirmado.

## 5. Contrato de preservação

### Números e datas

- Taxa de serviço separada; precisão decimal; mesmo arredondamento e mesmas saídas nulas.
- Intervalo inclusivo de 1–90 dias, inclusive histórico distante; oito RPCs rejeitam datas nulas/invertidas/longas com o comportamento atual.
- Hoje: mesmo tempo decorrido desde a virada; até quatro ocorrências com movimento, mínimo de duas. Não substituir por quatro semanas fixas.
- Resultados: referência de cada dia; dias anteriores dentro do próprio período também podem ser referência de dias seguintes. Não congelar referência antes do começo do intervalo.
- Curva: 48 pontos, `fechada_em <= ponto`, futuro de hoje nulo, dias históricos com movimento tardio contribuem com zero antes do fechamento.
- Meta: divisor por dias de calendário, herança de meta, virada do mês, projeção a partir do terceiro dia.
- Mesas abertas em um instante incluem fechamento posterior a esse instante. Não reduzir à condição `fechada_em IS NULL`.
- Regras divergentes entre documento e implementação exigem relato separado; não corrigir produto silenciosamente nesta otimização.

### Superfícies e acesso

- Hoje, quatro abas, filtros/URL, PDF completo, Ajustes, admin e modo somente leitura.
- Celular e desktop; claro/escuro; navegador e PWA; dono/sócio com mesmo login; várias casas.
- RLS, autorizações, suspensão, troca obrigatória de senha, `no-store` do PDF, nonce/CSP e falhas honestas continuam existindo.
- Ações continuam invalidando os caminhos corretos. Não reutilizar contexto de um usuário em outro pedido.
- Dados fictícios exclusivamente; não usar a casa de demonstração publicada como ambiente de benchmark (D-69).

### Recepção e operação

- Janela SCC usa datas civis de abertura/fechamento, não `dia_operacao`.
- Preservar contas abertas fora da janela, remoção lógica, reaparecimento, repetição idempotente, contadores, sanitização, ordem de validação e respostas HTTP.
- Sinal depende também de passagem do tempo, vigia e horário; não se pode deixar de atualizar a tela só porque não chegou novo envio.
- Preservar retenção de 48 h/90 dias, tentativas e confirmação dos alarmes, casa de demonstração e auditoria por hora.

## 6. Desenho recomendado

### Lote A — medição e alterações localizadas

Criar baseline fictício reproduzível; construir testes diferenciais; otimizar meta, curva e comparação semanal, cada uma em migration aditiva separada. Avaliar índices depois de observar os novos planos. Preservar assinaturas existentes e `security invoker`.

### Lote B — navegador e caminho de carregamento

Tratar refresh em segundo plano e iniciar leituras independentes do admin sem espera desnecessária. Medir fontes/JavaScript antes de alterar carregamento. Melhorias de visibilidade devem manter atualização imediata ao retomar e a cadência visível.

### Lote C — condicionado ao que ainda for lento

RPC agregadora, contexto da casa, mudanças de RLS, reconciliação/ingestão e streaming PDF entram somente se o gargalo persistir e a evidência apontar para eles. O plano de execução explicita o que pode ser feito diretamente e onde retornar para análise aprofundada.

Não executar todos os itens por obrigação: hipótese descartada com medição é um resultado válido e economiza complexidade.

## 7. Lacunas da evidência atual

- Não foram medidos p50/p95, CPU/IO, buffers, locks, tamanho de RSC/JS transferido ou comportamento em conexão móvel.
- Não foi verificada região/configuração atual da Vercel nem capacidade real do Supabase em produção.
- Os tamanhos de fontes observados no disco não equivalem ao tráfego comprimido do navegador.
- Não houve validação visual ou de navegação nesta análise. `useState(abaInicial)` e History API merecem caracterização de voltar/avançar e troca de período antes de mexer no componente; isso é uma hipótese de correção, não um bug reproduzido aqui.
- A enumeração acima é análise das definições efetivas nas migrations versionadas. Estado de schema remoto não foi consultado.

## 8. Critério de conclusão

O plano está pronto para orientar a próxima sessão; a otimização só estará concluída depois de demonstrar equivalência, ganho medido e ausência de regressão nas superfícies afetadas. A aprovação do desenho não autoriza publicar nem alterar produção.

Execução detalhada: [plano por tarefas](../plans/2026-10-24-otimizacao-sem-regressao.md).

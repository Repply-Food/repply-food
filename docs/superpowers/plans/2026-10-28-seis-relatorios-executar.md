# Seis relatórios — entrada para o modelo executor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. Executar depois da troca de modelo solicitada pelo usuário.

**Goal:** implementar agora a área dos seis relatórios com banco, importação, telas, PDFs e demonstração fictícia, usando os materiais já analisados.

**Architecture:** fotografias normalizadas por relatório/dia/fonte, publicadas atomicamente e consultadas no Postgres; endpoint separado da integração atual. Valores oficiais não conhecidos continuam null e não impedem os outros blocos. Não pressupor fórmulas ou PKs internas SCC.

**Tech Stack:** stack atual Next.js/React/TypeScript, Supabase/Postgres, Zod, Vitest, React PDF e Decimal, sem dependência nova.

**Spec:** [desenho para execução agora](../specs/2026-10-28-seis-relatorios-design.md). **Contrato:** [relatórios v1](../../integracao-scc/contrato-relatorios-v1.md).

## Global Constraints

- Somente planejamento no turno que criou estes arquivos; o próximo modelo executa.
- Não modificar envelope, reconciliador, ritmo nem sinal de vida da integração existente de `entradas`.
- Sem dependência nova.
- Dados fictícios são marcados visivelmente em tela e PDF.
- Preservar dados reais, Hoje/Resultados/Ajustes e PDF atual. Não copiar os PDFs reais para testes ou repositório público.
- Trabalhar no checkout existente; não criar worktree sem pedido. Não publicar nem tocar em produção sem autorização específica.

## 1. O usuário já decidiu

O usuário quer resultado palpável e determinou que refinamentos com o Pedro sejam posteriores. Não retomar a rodada de perguntas nem exigir respostas T01–T11 para iniciar. Apresentação será Food, com relatórios atuais preservados; público por sexo/categoria somente agregado. Nomes de clientes permanecem fora da primeira versão, pois sua coleta foi apenas colocada em avaliação e os refinamentos foram adiados.

Decisões de engenharia para executar: quarta entrada Relatórios; seis rotas/painéis/PDFs; modo histórico padrão e on-line separado; 366 dias por consulta; 2.000 linhas por PDF; null não é zero; importação por contrato próprio. Banco/report-cache primeiro; interface só usa resultados tipados do mesmo leitor do PDF.

Os documentos antigos `...analise-e-proposta.md` e `...roteiro.md` são histórico da pesquisa e foram substituídos como orientação de execução. Não seguir suas travas de “aguardar respostas” ou “não há plano fechado”.

## 2. Ordem de execução: 17 tarefas em três planos

- [ ] **Plano 1 — 5 tarefas:** [integração e importador](2026-10-28-seis-relatorios-01-integracao.md). Schemas → tabelas/RLS → publicação → endpoint → gerador/importador.
- [ ] **Plano 2 — 6 tarefas:** [consultas](2026-10-28-seis-relatorios-02-consultas.md). Filtros/tipos → cobertura/opções → Produtos/Notas → Caixa/Auditoria → Comissão/Financeiro → dispatcher/leitor.
- [ ] **Plano 3 — 6 tarefas:** [interface e PDF](2026-10-28-seis-relatorios-03-interface.md). Catálogo → filtros/estados → seis painéis → seis PDFs → percurso local/docs → regressão final.

Cada tarefa tem arquivos, interfaces, exemplos de teste, ordem TDD e critérios de conclusão. Marcar checkboxes somente após executar. Fazer commits locais pequenos com arquivos explícitos conforme instruções do repositório; nunca push automático, pois main publica.

## 3. Primeira ação do executor

Ler AGENTS.md/CLAUDE.md, conferir alterações existentes e abrir o plano 1. Começar pela tarefa 1 e seus testes de schema, sem precisar dos anexos nem de uma reunião com o Pedro. Resolver infraestrutura local em paralelo ao trabalho independente quando necessário; não usar produção para simular ambiente local.

## 4. Critério objetivo de entrega

- [ ] Um comando gera as fotografias fictícias dos seis relatórios.
- [ ] Um comando valida/importa no Supabase local; reimportar não duplica.
- [ ] Seis telas abertas por usuário autorizado com filtros, cobertura e dados fictícios sinalizados.
- [ ] Seis PDFs usam todos os dados do filtro dentro do limite, mesma versão e mesmos totais da tela.
- [ ] Testes de RLS, ingestão parcial/retry/concorrência, consultas, interface/PDF e regressão executados e reportados corretamente.
- [ ] Nenhum valor de comissão/financeiro é fabricado. Quando não enviado, mostrar “Não informado pela SCC”.
- [ ] Nenhuma publicação ou coleta adicional de dado pessoal em produção foi feita.

## 5. O que será refinado depois

Fórmula oficial de comissão/financeiro, adaptação do emissor Delphi/SQL real, ciclo exato temporário/permanente e autorização delimitada de nomes/textos. Esses refinamentos melhoram o fornecimento/homologação; não impedem construir a infraestrutura e os relatórios previstos aqui.

Este planejamento não promete gerar informação real que ainda não foi enviada. A entrega agora torna o Food capaz de receber e apresentar os seis relatórios; a demonstração fictícia comprova o percurso e a homologação SCC comprovará os números do cliente em passo posterior.

## Prompt para iniciar após trocar o modelo

> Execute `docs/superpowers/plans/2026-10-28-seis-relatorios-executar.md`. Leia o desenho e o contrato vinculados e avance pelos planos 1, 2 e 3. O usuário mandou implementar com as informações atuais e deixar refinamentos com a SCC para depois. Não reabra o planejamento nem espere respostas do Pedro para começar. Implemente, teste e demonstre localmente os seis relatórios; preserve o sistema atual, não invente valores oficiais e não publique em produção.

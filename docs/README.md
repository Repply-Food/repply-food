# Documentação do repply food.

**Regra de manutenção:** documento que mente é pior que documento que não existe. Mudou o comportamento? Atualize o documento **no mesmo commit**.

| Pasta / arquivo | O que tem | Quem mais usa |
|---|---|---|
| [`decisoes.md`](decisoes.md) | As decisões numeradas (D-01…). Decisão nova vai no fim | Todos |
| [`metricas.md`](metricas.md) | Definição exata de cada métrica, com exemplo de conta que vira teste | Dev, SCC |
| [`integracao-scc/contrato-de-dados.md`](integracao-scc/contrato-de-dados.md) | Como o SCC envia os dados: envelope, regras, respostas | **Pedro (SCC)**, dev |
| [`arquitetura/modelo-de-dados.md`](arquitetura/modelo-de-dados.md) | As 8 tabelas, com o SQL de referência | Dev |
| [`arquitetura/recepcao-de-dados.md`](arquitetura/recepcao-de-dados.md) | Como `receber-envio` funciona; testes; gerador de dados fictícios; vigia | Dev |
| [`arquitetura/seguranca-e-isolamento.md`](arquitetura/seguranca-e-isolamento.md) | RLS, regras absolutas, login, LGPD, checklist de tabela nova | Dev |
| [`operacao/cadastrar-restaurante.md`](operacao/cadastrar-restaurante.md) | Roteiro para colocar um cliente no ar | Equipe Repply |
| [`operacao/publicar.md`](operacao/publicar.md) | Como publicar banco, funções e painel no piloto | Dev |
| [`operacao/migrar-para-pro.md`](operacao/migrar-para-pro.md) | O que fazer no 1º cliente pagante (D-09) | Lucas Ferreira, dev |
| [`telas/index.html`](telas/index.html) | As telas aprovadas, em celular e computador (abra no navegador) | Dev, Lucas Ferreira |
| [`divida-tecnica.md`](divida-tecnica.md) | O que ficou pendente, com gravidade | Dev |
| [`superpowers/specs/`](superpowers/specs/) | Desenhos aprovados, um por tema (`AAAA-MM-DD-<tema>-design.md`) | Dev, IA |
| [`superpowers/plans/`](superpowers/plans/) | Planos de implementação, um por tema | Dev, IA |

**Fora do repositório**, na pasta de trabalho `Projetos/Repply Food/`:
- `_descoberta/`:
  - banco de perguntas, com as **perguntas ainda abertas para a SCC** (blocos B e H);
  - cardápio de métricas completo (M01–M45);
  - JSON de exemplo da SCC;
  - pauta da reunião com a SCC.
- `.superpowers/brainstorm/`: os rascunhos de tela da descoberta, inclusive as opções descartadas.

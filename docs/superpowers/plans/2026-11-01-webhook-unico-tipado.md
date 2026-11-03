# Webhook único e tipado da SCC — plano de implementação

> **Para o modelo executor:** use a skill `subagent-driven-development` e execute uma tarefa por vez, em TDD. Não publique, não aplique migrations na nuvem e não use dados ou tokens reais. Marque os checkboxes somente com evidência local.

**Objetivo:** transformar `receber-envio` no único receptor SCC v2, publicar oito tipos de mensagem com segurança e alimentar Hoje, Resultados e os seis relatórios, com um smoke completo importável no Insomnia.

**Arquitetura:** o HTTP autentica o token antes de ler o JSON, remove apenas os quatro dados pessoais conhecidos das entradas, valida uma união discriminada estrita e chama uma RPC privada. O PostgreSQL guarda páginas em staging, publica automaticamente quando 1..N estão completas e substitui atomicamente apenas o escopo da mensagem. Entradas continuam usando a reconciliação já provada; catálogo é incremental; os seis movimentos são fotografias tipadas por dia e fonte. As assinaturas públicas de consulta dos relatórios permanecem, mas passam a ler as tabelas tipadas novas. O cache `relatorio_*` já aplicado fica como legado, sem escrita e sem `DROP`.

**Stack:** TypeScript estrito, Zod 4, Supabase Edge Functions/Deno 2, PostgreSQL 17, RLS, Vitest, `tsx`, React PDF e Decimal.js existentes. Sem dependência nova.

**Fonte de verdade:** [desenho aprovado](../specs/2026-11-01-webhook-unico-tipado-design.md), decisão D-71 e `CLAUDE.md`.

## Estratégia de modelos e revisão

- **Executor econômico recomendado:** `openai/gpt-6.1-terra`, recebendo apenas esta tarefa, o desenho e os arquivos citados nela.
- **Revisão forte obrigatória:** tarefas 3, 4, 5, 7 e 8, por envolverem RLS, transações, concorrência, dinheiro e consultas compartilhadas por tela/PDF.
- **Luna:** somente para trabalho mecânico posterior, como conferir links ou formatação documental; não usar sozinho em migrations, publicação ou isolamento.
- Nenhum executor faz `push`, migration remota, publicação de função ou alteração de conta externa.

## Restrições globais

- Trabalhar no checkout existente; conferir `git status --short --branch` e `git fetch origin main` antes de cada commit. Preservar trabalho alheio.
- Não editar migrations `202610...`; só acrescentar as cinco migrations previstas neste plano.
- Não apagar tabelas `relatorio_*`, dados, migrations ou documentos históricos.
- `restaurante_id` vem do token e entra na RPC como argumento privado; o schema HTTP recusa qualquer campo de casa.
- Dinheiro e quantidades viajam como texto decimal e viram `numeric`, nunca soma em `number`.
- Nenhuma tabela nova usa `FORCE ROW LEVEL SECURITY`; função privilegiada usa `security definer`, `search_path` fixo, `row_security = off` quando necessário e grants explícitos.
- Nome, RG, telefone, sexo individual, endereço e texto livre de cliente não chegam ao staging, ao banco nem aos logs.
- Teste local não autoriza `supabase db push`, `functions deploy`, `git push` ou acesso ao projeto `klwpfltvtaltzcjxfmxf`.
- Não usar `supabase db reset` para contornar falha; aplicar somente as migrations novas no banco local com `npx supabase migration up --local`, preservando o estado local existente.
- A função deve ser servida com `RF_PERMITIR_SIMULACAO=1` apenas no smoke local.

## Contrato exato desta execução

### Envelope

```ts
type BaseV2 = {
  versao_formato: 2;
  tipo_envio: TipoEnvio;
  versao_scc: string;
  enviado_em: string; // ISO 8601 com Z ou offset
  id_envio: string; // UUID estável em retry
  sequencia: string; // 1..9223372036854775807
  natureza: "scc" | "simulacao";
};

type Pagina = { numero: number; total: number };
```

- `entradas`: `modo: "janela"`, `janela`, `pagina`, `total_registros`, `dados`.
- `cadastro_produtos`: `modo: "incremental"`, `pagina`, `total_registros`, `dados`.
- Demais tipos: `modo: "fotografia"`, `dia_movimento`, `fonte`, `recursos`, `pagina`, `total_registros`, `dados`.
- As entradas preservam nomes SCC e inteiros já confirmados; os seis campos monetários passam a strings decimais. `Pago` continua aceitando `"Sim"`, `"Não"` e booleano.
- Campos desconhecidos são `422`. Nas entradas, `NomeCliente`, `RG`, `FoneCliente` e `Sexo` são removidos antes da validação, sem guardar nome ou valor.

### Persistência nova

As migrations criam, com esses nomes:

```text
cargas_scc                 staging/recibo por restaurante + id_envio
paginas_scc                número, hash, quantidade, bytes e dados privados
cursores_scc               maior sequência publicada por chave de escopo
fotografias_scc            cobertura publicada por tipo + dia + fonte
revisoes_scc               revisão dos seis relatórios por casa
limites_requisicao_scc     janela de 1 minuto no banco
produtos_scc               catálogo incremental atual
itens_vendidos_scc         fotografia tipada
comissoes_scc              fotografia tipada
movimentos_caixa_scc       fotografia tipada
eventos_auditoria_scc      fotografia tipada
notas_assinadas_scc        fotografia tipada
financeiro_scc             linha diária oficial
financeiro_meios_scc       meios tipados da linha financeira
financeiro_publico_scc     contagens agregadas da linha financeira
```

Staging, cursores e limitador não têm leitura de cliente/admin. Fotografias, revisão e tabelas de domínio têm somente `SELECT` para `authenticated`, protegido por `tem_acesso(restaurante_id) or eh_admin_repply()`. Ninguém do navegador escreve diretamente.

## Tarefa 1 — contrato v2 canônico e fixtures mínimas

**Arquivos:**
- criar `supabase/functions/_shared/scc/limites.ts`;
- criar `supabase/functions/_shared/scc/schemas.ts`;
- substituir as exportações de `lib/validators/recepcao.ts`;
- atualizar `lib/validators/relatorios.ts` para reexportar os seis tipos de linha do canônico v2;
- adaptar temporariamente `supabase/functions/_shared/relatorios/schemas.ts` para importar esses seis schemas de linha, mantendo apenas o envelope legado até a tarefa 11;
- criar `tests/recepcao/fixtures-v2.ts` e `tests/recepcao/contrato-v2.test.ts`.

**Interfaces produzidas:** `TIPOS_ENVIO`, `TipoEnvio`, os oito tipos de dado, `EnvioSccV2`, `envioSccV2Schema`, `validarEnvioSccV2(unknown)`, `MAX_BYTES_PAGINA=1048576`, `MAX_REGISTROS_PAGINA=500`, `MAX_PAGINAS=200`, `MAX_REGISTROS_CARGA=100000`, `MAX_BYTES_CARGA=33554432`, `MAX_CARGAS_ABERTAS=10`, `MAX_REQUISICOES_MINUTO=120`.

- [ ] Escrever primeiro testes que aceitam uma mensagem literal de cada tipo e falham porque o módulo não existe.
- [ ] Cobrir `.strict()` no envelope e em todos os objetos aninhados; data civil real; timestamp com offset; UUID; `BigInt` máximo; códigos; rótulos; decimais; limites; recursos sem repetição; financeiro 0..1 linha; meios e público únicos.
- [ ] Cobrir as correlações: tipo/modo correto, campos de fotografia proibidos em cadastro/entradas, `pagina.numero <= pagina.total`, página única com contagem exata, carga vazia como página 1/1 vazia e `total_registros` compatível.
- [ ] Cobrir entradas v2 com dinheiro textual e os 20 campos atuais; rejeitar envelope v1, dinheiro numérico, `restaurante_id`, campo desconhecido e união misturada.
- [ ] Mover os seis schemas de linha já provados para o canônico `_shared/scc/schemas.ts`; o módulo legado os importa temporariamente, sem duplicar regras. Acrescentar `codigo_entrada` e `ordinal` somente ao item vendido v2.
- [ ] Rodar `npm run test -- tests/recepcao/contrato-v2.test.ts` e `npx tsc --noEmit`.
- [ ] Commit: `Define o contrato tipado v2 da SCC`.

## Tarefa 2 — privacidade, autenticação e HTTP puro

**Arquivos:**
- criar `supabase/functions/_shared/scc/privacidade.ts`;
- criar `supabase/functions/_shared/scc/autenticacao.ts` a partir da implementação já provada em `_shared/relatorios/autenticacao.ts`;
- criar `supabase/functions/_shared/scc/http.ts` a partir de `_shared/relatorios/http.ts`;
- criar `tests/recepcao/privacidade-v2.test.ts` e `tests/recepcao/http-v2.test.ts`.

**Interfaces:**

```ts
sanitizarAntesDeValidar(bruto: unknown): unknown;
autenticarToken(req, buscarPorHash, agoraIso?): Promise<string | null>;
lerJsonLimitado(req, maxBytes): Promise<unknown>;
criarHandlerSccV2(deps): (req: Request) => Promise<Response>;
```

- [ ] Teste vermelho: quatro campos pessoais somem de `entradas.dados[*]`; seus valores e nomes não aparecem no resultado. Campos desconhecidos comuns permanecem para o Zod rejeitar.
- [ ] Testar que autenticação ocorre antes de `lerJsonLimitado`: token inválido retorna `401` sem consumir um stream-armadilha; `GET` retorna `405`.
- [ ] Testar leitura UTF-8 em chunks, cancelamento acima de 1 MiB, JSON inválido `400` e nenhum `Content-Length` confiável.
- [ ] O handler chama dependências na ordem: autenticar → consumir limite no banco → ler/sanitizar/validar → conferir simulação → receber página.
- [ ] Traduzir apenas códigos técnicos fixos: `PR409→409`, `PR413→413`, `PR422/22023→422`, quota/cargas abertas/ritmo→`429`; jamais devolver `error.message`, SQL, token ou corpo.
- [ ] Resposta de schema contém no máximo 20 caminhos seguros, sem valores Zod.
- [ ] Rodar os dois testes e `npx tsc --noEmit`.
- [ ] Commit: `Endurece a entrada HTTP do webhook v2`.

## Tarefa 3 — tabelas tipadas, RLS e privilégios

**Arquivos:**
- criar `supabase/migrations/20261101120000_webhook_v2_tabelas.sql`;
- criar `tests/isolamento/webhook-v2.test.ts`;
- ampliar `tests/isolamento/todas-as-tabelas.test.ts` e `tests/helpers/supabase-local.ts`.

- [ ] Escrever testes SQL vermelhos para as quinze tabelas listadas em “Persistência nova”. A fixture deve criar dados A/B sem depender do endpoint.
- [ ] `cargas_scc`: PK `(restaurante_id,id_envio)`, tipo/modo, sequência, natureza, metadados do escopo, totais, estado `recebendo|publicada|substituida|expirada`, bytes, recibo e timestamps. `id_envio` nunca é global entre casas.
- [ ] `paginas_scc`: FK composta, número, hash SHA-256, quantidade, bytes, `dados jsonb`; constraints 1..200, 0..500 e 1 MiB.
- [ ] `cursores_scc`: PK `(restaurante_id,tipo_envio,chave_escopo)`; chave `tipo` para entradas/cadastro e `AAAA-MM-DD|fonte` para fotografia. Sequência positiva e `id_envio` atual.
- [ ] `fotografias_scc`: PK casa+tipo+dia+fonte, FK da carga, sequência, natureza, recursos, quantidade, capturado/publicado. Restringir aos seis tipos de movimento.
- [ ] Tabelas de linhas recebem colunas tipadas, `posicao` e FK lógica para a fotografia. Índices começam por `restaurante_id,fonte,dia_movimento`; catálogo usa PK casa+código.
- [ ] Garantir unicidade de `codigo_entrada+ordinal` nos itens, operador nas comissões, lançamento no caixa, nota no escopo, e célula sexo+categoria no público. Auditoria permite ocorrências iguais em posições distintas.
- [ ] RLS e triggers `freeze_restaurante_id` no mesmo arquivo. Staging/limite sem grants; domínio somente `SELECT authenticated`; sem `PUBLIC EXECUTE` implícito.
- [ ] Atualizar a limpeza da fixture para apagar tabelas novas na ordem das FKs, somente para IDs fictícios.
- [ ] Testar dono A, dono B, login sem acesso, anônimo e admin; escrita direta de todos recusada; admin apenas lê domínio; staging não pode ser inferido.
- [ ] Rodar `npm run test -- tests/isolamento/webhook-v2.test.ts tests/isolamento/todas-as-tabelas.test.ts` contra PostgreSQL local.
- [ ] **Checkpoint de revisão forte:** conferir RLS, grants, FKs, índices, `numeric`, nulabilidade e ausência de cascata destrutiva antes do commit.
- [ ] Commit: `Cria armazenamento tipado e isolado da SCC`.

## Tarefa 4 — validação SQL, páginas, idempotência e limite

**Arquivos:**
- criar `supabase/migrations/20261101121000_webhook_v2_ingestao.sql`;
- criar `tests/recepcao/ingestao-v2-sql.test.ts` e `tests/recepcao/concorrencia-v2.test.ts`;
- ampliar `tests/isolamento/funcoes-fechadas.test.ts` e `tests/isolamento/rpc-privilegiada.test.ts`.

**Funções privadas, somente `service_role`:**

```text
validar_pagina_scc_v2(jsonb) returns void
consumir_limite_scc(uuid) returns jsonb
receber_pagina_scc_v2(uuid,jsonb) returns jsonb
publicar_carga_scc_v2(uuid,uuid) returns jsonb
limpar_cargas_scc_v2() returns jsonb
```

- [ ] Teste vermelho para página 1/2: retorna `recebendo`; fotografia anterior segue visível; página 2 publica automaticamente; não existe ação `publicar`.
- [ ] Repetir `id_envio`/página/conteúdo devolve o mesmo recibo com `repetida:true`; conteúdo ou manifesto diferente dá `409`; sequência igual/menor fora do mesmo ID dá `409`.
- [ ] Usar `pg_advisory_xact_lock(hashtextextended(restaurante_id::text,0))`; duas conexões reais provam que correções concorrentes terminam com uma única sequência ativa.
- [ ] `validar_pagina_scc_v2` repete listas fechadas de chaves e regras críticas do Zod. Erro é código curto e nunca inclui linha, cast ou dado recebido.
- [ ] Medir UTF-8 do JSON normalizado no banco, somar até 32 MiB, conferir páginas 1..N e `sum(quantidade)=total_registros` antes da publicação.
- [ ] `consumir_limite_scc` permite 120 requisições/minuto por casa no banco; repetição também conta. Cargas abertas acima de dez retornam identificador mapeado para `429`.
- [ ] Limpeza expira incompletas após 24 h, apaga somente `dados` de páginas publicadas e preserva recibos/hashes necessários à idempotência. Fotografias e domínio nunca são removidos pela limpeza.
- [ ] Agendar `rf-limpa-cargas-scc-v2` sem modificar o job legado.
- [ ] Testar página fora de ordem, vazia explícita, 500/501 linhas, 200/201 páginas, bytes, adulteração de staging, casa inexistente e tentativa de usar carga da casa A pela B.
- [ ] **Checkpoint de revisão forte:** locks, estados, retries, quota, SQLSTATE, limpeza e grants.
- [ ] Commit: `Recebe e fecha cargas v2 de forma atômica`.

## Tarefa 5 — publicação dos oito tipos

**Arquivos:**
- criar `supabase/migrations/20261101122000_webhook_v2_publicacao.sql`;
- criar `tests/recepcao/publicacao-v2-sql.test.ts`;
- adaptar casos úteis de `tests/recepcao/envio.test.ts` e `tests/relatorios/ingestao-sql.test.ts` para o protocolo novo.

- [ ] **Entradas:** ao completar a carga, montar internamente o envelope esperado por `processar_envio` e chamar a reconciliação existente na mesma transação. Essa adaptação interna não aceita v1 no HTTP. Só uma publicação nova atualiza `sinal_de_vida`, `envios`, uso do token e pedido de reenvio.
- [ ] Aplicar o intervalo de 20 s somente quando uma carga nova de `entradas` tenta publicar. Página parcial, retry do mesmo ID e qualquer outro tipo não reiniciam nem compartilham esse relógio.
- [ ] **Cadastro:** `upsert` por casa+código; sequência maior substitui nome/grupo/custo/ativo; ausente fica intacto; `ativo:false` não apaga.
- [ ] **Fotografias:** para cada um dos seis tipos, validar tudo e então `DELETE` do mesmo casa+tipo+dia+fonte seguido de inserts tipados e atualização de `fotografias_scc`, cursor e revisão na mesma transação.
- [ ] Financeiro vazio mantém metadata sem linha; uma linha cria `financeiro_scc`, meios e público. Mais de uma linha é `422`.
- [ ] Histórico nunca apaga on-line e vice-versa. Uma fotografia vazia remove apenas linhas daquele escopo e comprova cobertura vazia.
- [ ] Incrementar `revisoes_scc` uma vez por fotografia nova; entradas e catálogo não alteram a paginação dos seis relatórios.
- [ ] Testar oito tipos, correção, desativação, duplicata legítima de auditoria, dimensões históricas de produto, valores oficiais nulos, rollback integral se a última linha falhar e sinal de vida só por entradas.
- [ ] **Checkpoint de revisão forte:** casts monetários, atomicidade dos `DELETE+INSERT`, reconciliação e isolamento das fontes.
- [ ] Commit: `Publica os oito tipos do webhook v2`.

## Tarefa 6 — conectar o único endpoint real

**Arquivos:**
- substituir `supabase/functions/receber-envio/index.ts`;
- manter e ajustar `supabase/functions/receber-envio/deno.json`;
- atualizar `tests/recepcao/envio.test.ts` e `tests/recepcao/endpoint-v2-local.test.ts`;
- atualizar helpers em `tests/helpers/supabase-local.ts`.

- [ ] Teste HTTP real começa provando `GET=405`, token inválido/revogado/expirado=`401` e v1=`422`.
- [ ] `receber-envio` deve apenas montar o cliente Supabase e injetar autenticação/RPCs no handler puro; não duplicar regras de schema ou erro.
- [ ] Página única publica e responde `estado:"publicada"`; parcial responde `recebendo`; última página publica automaticamente; retry recebe recibo estável.
- [ ] Conferir `401`, `400`, `409`, `413`, `422`, `429`, erro interno controlado e simulação recusada sem variável local.
- [ ] Provar pelo banco que token B grava somente B mesmo com `restaurante_id`, slug ou nome malicioso no corpo — o corpo deve ser recusado, nunca usado.
- [ ] Provar que os quatro campos pessoais não aparecem em `entradas`, `envios`, `cargas_scc`, `paginas_scc`, erros ou resposta.
- [ ] Rodar os testes HTTP com Supabase local e função servida. Mock não substitui essa evidência.
- [ ] Commit: `Unifica a recepção da SCC no webhook v2`.

## Tarefa 7 — cobertura, opções, Produtos e Notas tipados

**Arquivos:**
- criar `supabase/migrations/20261101123000_relatorios_base_produtos_notas_tipados.sql`;
- adaptar `tests/relatorios/cobertura-sql.test.ts`, `opcoes-sql.test.ts`, `produtos-sql.test.ts`, `notas-sql.test.ts`, `dispatcher-sql.test.ts` e helpers.

- [ ] Primeiro, mudar o helper de teste para publicar envelopes v2 por `receber_pagina_scc_v2`; nenhum teste novo escreve em `relatorio_linhas`.
- [ ] Substituir, na migration nova, as implementações de `validar_consulta`, `cobertura`, `opcoes_relatorio`, `produtos`, `notas_assinadas` e `consultar_relatorio`, preservando assinaturas e JSON de saída.
- [ ] Cobertura lê `fotografias_scc`; revisão lê `revisoes_scc`; ausência continua diferente de fotografia vazia; recursos são a interseção dos dias.
- [ ] Produtos lê colunas de `itens_vendidos_scc`, preserva dimensões históricas, agrega no PostgreSQL e mantém resumos/grupos/paginação atuais.
- [ ] Notas lê `notas_assinadas_scc`, preserva ocorrências e nunca faz join que revele nome de cliente.
- [ ] Opções usam união fechada por relatório e tabelas tipadas, sem SQL dinâmico vindo do cliente.
- [ ] Provar que alterar `produtos_scc` depois da venda não muda relatório histórico.
- [ ] **Checkpoint de revisão forte:** RLS invoker, mesma forma de saída, cobertura vazia/parcial e consulta A/B.
- [ ] Commit: `Lê Produtos e Notas das tabelas tipadas`.

## Tarefa 8 — Comissão, Caixa, Auditoria e Financeiro tipados

**Arquivos:**
- criar `supabase/migrations/20261101124000_relatorios_restantes_tipados.sql`, sem alterar a migration já commitada na tarefa 7;
- adaptar `tests/relatorios/comissao-sql.test.ts`, `caixa-sql.test.ts`, `auditoria-sql.test.ts`, `financeiro-sql.test.ts`, `leitura.test.ts`, `pdf-dados.test.ts` e `pdf-route.test.ts`.

- [ ] Comissão soma vendas elegíveis e comissão oficial; se qualquer operador/dia tiver `null`, o total oficial permanece `null` e a quantidade sem comissão é correta.
- [ ] Caixa usa `numeric`, direção pelo enum, dia civil no fuso da casa e grupos completos independentes da página.
- [ ] Auditoria mantém eventos repetidos, filtros e totais oficiais sem estimar prejuízo.
- [ ] Financeiro lê linha/meios/público tipados; `null` oficial continua `null`; fotografia vazia produz zeros somente para ausência explícita de linha no dia publicado, preservando a semântica atual aprovada.
- [ ] Tela e PDF continuam chamando o mesmo `obterRelatorio`; não criar cálculo TypeScript alternativo.
- [ ] Rodar toda `tests/relatorios/` e confirmar que nenhuma consulta nova depende de `relatorio_linhas`, `relatorio_publicacoes` ou `relatorio_versoes`.
- [ ] **Checkpoint de revisão forte:** centavos, `null`, fuso, grupos, paginação/revisão e equivalência tela/PDF.
- [ ] Commit: `Lê os seis relatórios das fotografias SCC`.

## Tarefa 9 — massa fictícia coerente e transporte automático

**Arquivos:**
- criar `scripts/scc/amostra-v2.ts`, `fragmentar-v2.ts`, `enviar-v2.ts`, `gerar-smoke-v2.ts`;
- criar `scripts/preparar-smoke-scc-local.ts`;
- substituir testes em `tests/relatorios/importador.test.ts` por `tests/recepcao/smoke-v2.test.ts`;
- atualizar scripts do `package.json`.

**Comandos finais:**

```text
npm run smoke:scc:preparar
npm run smoke:scc:gerar -- --saida /tmp/repply-food-smoke-v2.json
npm run smoke:scc:enviar -- --arquivo /tmp/repply-food-smoke-v2.json
```

- [ ] O preparador recusa qualquer URL fora de loopback, reutiliza `Casa de Teste Local`, cria/troca um token exclusivamente local e o mostra uma vez para ser colocado em `.env.smoke-local`/Insomnia. Nunca aceita token em argumento.
- [ ] Fragmentação reutiliza o algoritmo já testado, mas gera apenas envelopes v2 e não acrescenta ação `publicar`. A última página deve receber `estado:publicada`.
- [ ] Validar todas as cargas e limites antes da primeira requisição; URL local sem credencial/query/fragmento; redirect recusado; timeout 30 s; token nunca impresso pelo transportador.
- [ ] Fixtures fixas usam 01/11/2026, duas entradas, três produtos, dois operadores e as mesmas chaves em todos os tipos.
- [ ] Antes da correção: faturamento sem serviço `106.00`, serviço `10.60`, 2 contas pagas, 4 ocupantes; Produtos quantidade `6`, vendas `106.00`, custos `41.00`, diferença `65.00`; Comissão `106.00`/`10.60`; Caixa créditos `106.00`, débitos `12.50`, saldo `93.50`; Auditoria 6 ocorrências (dois cancelamentos idênticos preservados); Notas 1/`20.00`; Financeiro projetado `116.60`, recebido `96.60`, notas `20.00`, descontos `3.00`.
- [ ] Detalhes Produtos: P100 `3`/`73.00`/`30.00`; P200 `2`/`16.00`/`6.00`; P300 `1`/`17.00`/`5.00`. Meios: dinheiro `50.00`, Pix `46.60`, nota `20.00`.
- [ ] Correção de sequência 2: segunda conta passa a desconto `5.00`, serviço `3.80` e consumido `41.80`; totais finais faturamento `104.00`, serviço `10.40`, produtos `104.00`, comissão `10.40`, caixa créditos `94.40`/saldo `81.90`, financeiro projetado `114.40` e recebido `94.40`. Custos e nota permanecem.
- [ ] Testar 501 linhas, retry com IDs estáveis, correção, erro interrompendo cursor e dry-run sem rede.
- [ ] Commit: `Cria a massa fictícia completa do webhook v2`.

## Tarefa 10 — coleção do Insomnia e roteiro literal

**Arquivos:**
- criar `docs/integracao-scc/insomnia-webhook-v2.json`;
- criar `docs/integracao-scc/smoke-webhook-v2-local.md`;
- criar `scripts/scc/gerar-insomnia-v2.ts` e teste `tests/recepcao/insomnia-v2.test.ts`.

- [ ] Export importável contém ambiente `base_url=http://127.0.0.1:54321/functions/v1/receber-envio` e `token=""`; nenhuma credencial real ou local versionada.
- [ ] Pastas ordenadas: `00 Preparação`, `01 Sucesso on-line`, `02 Fechamento histórico`, `03 Idempotência`, `04 Correção`, `05 Paginação incompleta`, `06 Erros 401-409-422`.
- [ ] Incluir os oito tipos, seis fotografias históricas, reenvio idêntico, mesmo ID divergente, sequência antiga, token inválido, campo desconhecido e página 1/2 sem página 2.
- [ ] Gerador e coleção usam os mesmos builders da tarefa 9. O teste lê todos os corpos, valida com `envioSccV2Schema`, confere IDs/ordem/valores e garante que `token` está vazio.
- [ ] Roteiro explica os dois terminais, variável de simulação, espera de 20 s somente entre ciclos novos de entradas, login dono/admin e como repetir sem tocar em produção.
- [ ] Tabela de conferência literal cobre Hoje, Resultados, seis relatórios e seis PDFs, on-line/histórico, antes/depois da correção.
- [ ] Commit: `Adiciona o smoke completo do Insomnia`.

## Tarefa 11 — retirar o endpoint antigo e consolidar o contrato SCC

**Arquivos:**
- remover `supabase/functions/receber-relatorios/index.ts` e `deno.json`;
- remover código agora sem uso em `supabase/functions/_shared/relatorios/` somente depois de migrar schemas/limites para `_shared/scc/`;
- remover os importadores específicos substituídos: `scripts/importar-relatorios.ts`, `scripts/gerar-relatorios-ficticios.ts` e `scripts/relatorios/`;
- editar `supabase/config.toml`;
- reescrever `docs/integracao-scc/contrato-de-dados.md` para v2;
- marcar `docs/integracao-scc/contrato-relatorios-v1.md` e `importar-relatorios-local.md` como substituídos, sem apagá-los;
- atualizar referências em `README.md`, `docs/README.md` e testes.

- [ ] Antes de remover, `grep` prova que nenhum import/URL ativo depende do endpoint antigo.
- [ ] `config.toml` mantém apenas `[functions.receber-envio] verify_jwt=false` para SCC, com comentário do token próprio.
- [ ] Teste estrutural prova ausência da pasta/configuração/URL `receber-relatorios` em código executável; migrations e documentos históricos podem citar o nome como passado.
- [ ] Contrato v2 documenta envelope, oito tipos, páginas automáticas, limites, respostas, cursor por escopo, exemplos e regra de nunca avançar sequência sem `estado:publicada`.
- [ ] Não fazer `DROP` das tabelas/funções legadas em migration. Elas ficam sem novas escritas.
- [ ] Rodar `npm run test -- tests/recepcao tests/relatorios tests/isolamento` e `npx tsc --noEmit`.
- [ ] Commit: `Aposenta o receptor separado de relatórios`.

## Tarefa 12 — smoke local, PDFs, regressão e evidência final

**Pré-condição:** Supabase local saudável; migrations novas aplicadas apenas localmente; função `receber-envio` servida com simulação; Next local aberto. Se Docker/Supabase falhar, registrar bloqueio e não substituir por produção.

- [ ] Rodar o preparador e importar a coleção. Executar manualmente, em ordem, sucesso on-line e histórico.
- [ ] Conferir no banco: páginas incompletas privadas, fotografias publicadas, tabelas tipadas, cursor, revisão, ausência total nas tabelas legadas e nenhuma casa B com linha A.
- [ ] Repetir os pedidos idempotentes e comparar revisão/contagens; executar correção e comparar os números literais da tarefa 9.
- [ ] Executar e registrar `401`, dois `409`, `422` e fotografia incompleta. Confirmar que o painel mantém a versão anterior.
- [ ] Entrar como dono e como admin em modo leitura; abrir Hoje, Resultados e os seis relatórios. Conferir 390 px e computador, claro/escuro e uma casa sem dados.
- [ ] Gerar os seis PDFs para o mesmo filtro e comparar totais/revisão com a tela. Não basta testar a rota por mock.
- [ ] Rodar, nesta ordem, e guardar as saídas reais:

```bash
npx tsc --noEmit
npm run check
npm run test
npm run build
```

- [ ] Usar `verification-before-completion`; não declarar verde se algum teste foi pulado, se o serviço local não estava ativo ou se a revisão visual/PDF não ocorreu.
- [ ] Usar `requesting-code-review` para revisão final, com foco em isolamento, dinheiro, concorrência e ausência de produção.
- [ ] Conferir `git diff --check`, `git status --short --branch` e `git log`; não fazer push.
- [ ] Commit final somente se houver ajuste de documentação/evidência: `Registra a validação local do webhook v2`.

## Critério de conclusão

- [ ] Existe uma única URL SCC no código/configuração/documentação atual.
- [ ] Envelope v1 é recusado; oito tipos v2 passam.
- [ ] Token escolhe a casa; corpo não consegue alterá-la.
- [ ] Cadastro é incremental; movimentos são fotografias atômicas; on-line/histórico independentes.
- [ ] Última página publica automaticamente; retry não duplica; correção maior substitui; sequência velha conflita.
- [ ] Entradas alimentam Hoje/Resultados e sozinhas atualizam o sinal principal.
- [ ] Seis relatórios e PDFs leem as tabelas tipadas e batem com a massa literal.
- [ ] RLS e funções fechadas impedem leitura/escrita cruzada.
- [ ] Insomnia comprova sucesso, páginas, idempotência, correção, `401`, `409`, `422` e incompleta.
- [ ] Nenhuma migration, função, dado ou configuração foi aplicada em produção.

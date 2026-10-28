# Seis relatórios — plano 3: telas, PDF e entrega local

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para executar tarefa por tarefa. Steps use checkbox (`- [ ]`) syntax for tracking. O usuário pediu execução posterior por modelo econômico, sem nova rodada de refinamento antes de começar.

**Goal:** entregar área Relatórios com seis telas, filtros e PDFs na identidade Food e demonstração local verificável.

**Architecture:** catálogo + rota com registro fechado de relatórios; componentes por assunto e controles compartilhados; leitor autorizado do plano 2 alimenta tela e PDF. Nenhum carregador busca todos os relatórios de uma vez; dados fictícios chegam pelo importador do plano 1, não por fallback na UI.

**Tech Stack:** Next.js App Router, React, TypeScript, componentes UI/tema atuais, React PDF, Testing Library/Vitest.

**Spec:** [desenho](../specs/2026-10-28-seis-relatorios-design.md). **Pré-requisito:** [plano 2](2026-10-28-seis-relatorios-02-consultas.md).

## Global Constraints

- Sem dependência nova.
- Dados fictícios são marcados visivelmente em tela e PDF.
- Dinheiro/quantidade são textos decimais exatos; cálculos no Postgres.
- Preservar Hoje, Resultados, Ajustes, PDF atual, login e modo admin em leitura.
- Celular 390 px e computador; tema claro e escuro; teclado e leitor de tela.
- Sem publicação nem dado real de cliente nos testes/demonstração.

## Tarefa 1 — navegação e catálogo

**Files:** criar `app/r/[slug]/relatorios/page.tsx`, `components/painel/relatorios/catalogo.tsx`; modificar `components/painel/menu-painel.tsx`, `tests/painel/menu-painel.test.tsx`; criar `tests/componentes/relatorios/catalogo.test.tsx`.

**Interfaces:** `CatalogoRelatorios({slug:string})`; títulos/descrições vêm de `lib/relatorios/registro.ts`, criado no plano2. Quatro destinos do menu, nessa ordem: Hoje, Resultados, Relatórios, Ajustes. O catálogo não calcula totais nem exige seis consultas de dados; o estado detalhado aparece ao abrir o relatório.

- [ ] Teste vermelho: ambas variantes do menu têm os quatro links com `aria-current` correto em `/r/casa-ficticia/relatorios/produtos`; catálogo contém seis links fechados e nenhuma chamada de banco.
- [ ] Alterar lista ITENS e `grid-cols-3` → `grid-cols-4` na variante inferior. Manter alvos de toque e padding da moldura. Catálogo em grid 1 coluna pequena/2 média/3 grande; cada cartão tem nome, finalidade e ação “Abrir relatório”.
- [ ] Página chama `exigirCasa(slug)` antes de renderizar e usa layout existente; não criar login/RLS paralelos. Catálogo não oferece edição, importação ou nomes pessoais.
- [ ] Rodar `npm run test -- tests/painel/menu-painel.test.tsx tests/componentes/relatorios/catalogo.test.tsx` e commit `Adiciona área de relatórios ao painel`.

## Tarefa 2 — filtros, estados e página genérica

**Files:** criar `app/r/[slug]/relatorios/[relatorio]/{page,loading,error}.tsx`; `components/painel/relatorios/{filtros,estado,paginacao}.tsx`; `lib/relatorios/{datas-iniciais,formatacao}.ts`; testes `tests/componentes/relatorios/{filtros,estado,paginacao}.test.tsx`, `tests/relatorios/paginas.test.tsx`.

**Interfaces:** `FiltrosRelatorioForm({relatorio,consulta,slug,recursos,fuso})`, `EstadoRelatorio({resultado})`, `PaginacaoRelatorio({consulta,paginacao,slug,relatorio})`. Usar tipos do plano2. `formatarValor(valor:string|null):string` e `formatarQuantidade(valor:string|null):string` são puras de apresentação.

- [ ] Testar nulos: o helper **existente** `formatarBRL(null)` devolve `R$ 0,00`. Portanto criar wrapper e sempre testá-lo:

```ts
export function formatarValor(valor:string|null):string {
  return valor === null ? 'Não informado pela SCC' : formatarBRL(valor);
}
expect(formatarValor(null)).toBe('Não informado pela SCC');
expect(formatarValor('0.00')).toBe('R$ 0,00');
```

Quantidade usa Decimal somente para apresentação, com 3..6 casas, sem `Number()`/`toNumber()` e sem somar. Schema decimal de **saída agregada** aceita até 28 dígitos inteiros; não reutilizar limite de 14 da linha de ingestão, pois somas podem ser maiores.
- [ ] Página valida slug do relatório pelo registro fechado e chama `notFound()` se não existir; `exigirCasa` antes de leitura. Sem query: calcular ontem no fuso da casa e redirecionar para datas/fonte explícitas. Query incompleta/inválida fornecida pelo usuário mostra erro de filtro com opção corrigir, sem consultar banco. Não substituir silenciosamente por outro período.
- [ ] Atalhos Hoje/7 dias/Mês preenchem datas; fonte on-line mantém um único movimento selecionado. Alterar filtro zera página e revisão. Todos remove parâmetro opcional. Desabilitar dimensão ausente no recurso; `filtro_indisponivel` de link direto é mensagem clara, não erro 500. Buscar opções pelo servidor autorizado, com ação `obterOpcoesAction` em `lib/relatorios/opcoes-actions.ts` que exige casa por slug, nunca recebe casaId do cliente.
- [ ] Estados: `sem_dados` → “A SCC ainda não enviou este relatório para o período”; `parcial` → aviso com contagem/datas ausentes e “Totais parciais”; `completo` com zero linhas → “Sem resultados para os filtros” (ou “Sem movimento no período” sem filtro adicional). Qualquer simulação → “Dados fictícios de demonstração”; captura mínima em horário da casa. Não usar selo global como prova de atualização do relatório.
- [ ] Paginação conserva filtros e revisão e busca página solicitada. `dados_alterados` oferece “Atualizar relatório” removendo página/revisão; não exibir partes de versões diferentes. Não guardar resultados/nome em localStorage ou service worker.
- [ ] Testar router/URL, volta/avanço, teclado, recurso indisponível, filtros tipo→categoria, datas vazias, partial/zero/null, natureza e revisão. Rodar tipos/testes focados, commit `Implementa filtros e estados de dados dos relatórios`.

## Tarefa 3 — seis apresentações concretas

**Files:** criar em `components/painel/relatorios/` os módulos `produtos.tsx`, `comissao.tsx`, `caixa.tsx`, `auditoria.tsx`, `notas-assinadas.tsx`, `financeiro.tsx`, `painel-relatorio.tsx`; testes correspondentes em `tests/componentes/relatorios/`.

**Interfaces:** `PainelProdutos({resultado:ResultadoProdutos})` e equivalentes. `PainelRelatorio` faz switch fechado pelo slug e tipagem discriminada; não espalhar casts `as any` em componentes. Não criar um renderizador universal que tente deduzir tipo por valor.

**Desenhos funcionais definidos:**

```text
Produtos: [Vendas] [Custos] [Diferença vendas−custos] [Quantidade]
          PDV > Grupo > produto | código | quantidade | vendas | custos
Comissão: [Vendas elegíveis] [Comissão oficial] [Operadores sem comissão informada]
          operador | função | vendas elegíveis | comissão
Caixa:    [Créditos] [Débitos] [Saldo dos lançamentos]
          operador > data civil > hora | categoria | crédito/débito | valor
Auditoria:[Ocorrências] [Cancelamentos: quantidade e valor]
          tipo > evento | operador | momento | cartões/produto | detalhes de limites
Notas:    [Total das notas] [Quantidade de notas]
          cliente (código) | nota | entrada | movimento | valor
Financeiro: [Componentes] [Totais oficiais] [Meios e cartões]
            [Contagens de entradas] [Público agregado por sexo/categoria]
```

- [ ] Escrever testes de renderização usando os resultados fictícios do plano2. Verificar valores e rótulos, por exemplo:

```tsx
render(<PainelComissao resultado={resultadoComissaoComNulo()} />);
expect(screen.getByText('R$ 100,00')).toBeTruthy();
expect(screen.getAllByText('Não informado pela SCC').length).toBeGreaterThan(0);
expect(screen.queryByText('R$ 0,00')).toBeNull();
```

Definir `resultadoComissaoComNulo()` no fixture de teste com duas linhas/resumo do plano2, sem depender de rede. Adicionar teste de dados reais inexistentes não acionarem fixture na página.
- [ ] Implementar componentes reutilizando Card/Table/Button atuais. Desktop mostra tabela; celular usa cards/detalhes ou tabela com overflow acessível. Não ocultar permanentemente no celular valores presentes no computador. Campos cliente/motivo/credor ainda não enviados mostram explicação curta, sem formulário de coleta.
- [ ] Produtos/caixa precisam distinguir agrupamento da **página** e totais completos: cabeçalho de grupo pode dizer “continua” quando começa no meio; nunca rotular subtotal da página como total do grupo inteiro. Para oferecer subtotais completos de grupo, adicionar `resumo.grupos` no SQL/schema de Produtos (`codigoPdv,codigoGrupo,quantidade,vendas,custos,diferenca`) e de Caixa (`codigoOperador,diaCivil,creditos,debitos,saldo`), derivados da mesma CTE completa antes de paginar. Testar grupo repartido em duas páginas. Essa extensão é parte desta tarefa, não cálculo no React.
- [ ] Auditoria apresenta cada tipo de evento e campos pertinentes; não rotular perda/transferência como valor perdido. Financeiro apresenta total oficial recebido separadamente da soma de meios; não usa “projeção da meta”. Contagens são matriz somente agregada, sem lista de pessoas.
- [ ] Renderizar o painel certo na página genérica sem importar todos os dados pelo loader atual de Resultados. Rodar seis suites e commit `Apresenta os seis relatórios na identidade Food`.

## Tarefa 4 — PDF completo e consistente por relatório

**Files:** criar `lib/relatorios/pdf-dados.ts`; `lib/pdf/relatorios/{base,produtos,comissao,caixa,auditoria,notas-assinadas,financeiro,index}.tsx`; `app/r/[slug]/relatorios/[relatorio]/pdf/route.ts`; `tests/relatorios/pdf-dados.test.ts`; `tests/pdf/seis-relatorios.test.tsx`.

**Interfaces:**

```ts
carregarDadosPdf(casaId:string,relatorio:Relatorio,
  consulta:ConsultaRelatorio):Promise<ResultadoCompletoDoRelatorio>
DocumentoRelatorio({casa,relatorio,consulta,resultado,fuso,geradoEm}):ReactElement
```

`carregarDadosPdf` chama `obterRelatorio` com tamanho100, fixa revisão e reúne até 2.000 linhas; resumo só do primeiro resultado, pois já cobre todo filtro. Não somar resumos das páginas. Erro/revisão alterada/excesso aborta tudo, sem arquivo parcial. Todos os dados vêm do mesmo leitor da tela.

- [ ] Testes vermelhos: 205 linhas exigem três chamadas com mesma revisão; resumo não triplica; 2.001 linhas recusa antes de renderizar; publicação durante paginação gera erro; ausência de acesso não chama renderer.
- [ ] Implementar rota guardada por `exigirCasa`, parsing estrito e leitura. Ignorar página de navegação para exportação, mas preservar filtros/revisão. Usar `renderToBuffer` já instalado, `runtime='nodejs'`, `Content-Type: application/pdf`, `Cache-Control: private, no-store` e filename só slug/datas. Sem nome de cliente em filename. Retornar 404 sem acesso, 422 filtro/limite inválido, 409 revisão, 500 falha interna curta. Não expor stack/SQL.
- [ ] Base do PDF reutiliza identidade e formatação existentes, título/período/fonte/fuso/captura/filtros/natureza/cobertura, rodapé “página X/Y” e cabeçalho fixo em páginas novas. Tabelas quebram por linha; cabeçalho de coluna repete, códigos não truncam. Cada um dos seis documentos reflete a apresentação da tarefa3, inclusive nulls, subtotal do grupo inteiro e campos não enviados.
- [ ] Botão PDF usa URL de filtros canonicalizada e tratamento amigável de erro (fetch+blob local temporário apenas para download; revogar URL ao terminar), sem cache persistente e sem deixar tela vazia de erro. Estado de geração impede cliques duplicados. Testar comportamento em erro422/409 e liberação do loading.
- [ ] Testar cada documento com árvore de dados esperada e buffer PDF real; amostra de 205 linhas gera >=2 páginas (`/Type /Page` nos objetos PDF). Na validação manual local, extrair texto com `pdftotext` se disponível e conferir última linha, filtros, aviso parcial e valores null. Não acrescentar dependência de ferramenta Linux à suíte que também roda em Windows.
- [ ] Rodar testes PDF e build; commit `Exporta PDFs completos dos seis relatórios`.

## Tarefa 5 — percurso local reproduzível e instrução de uso

**Files:** criar `docs/operacao/relatorios.md`; atualizar `README.md`, `docs/README.md`, `docs/metricas.md`, `SPEC.md` com capacidade implementada e distinção entre disponível localmente e homologado SCC. Acrescentar decisão aditiva em `docs/decisoes.md` resumindo o escopo solicitado, sem reescrever decisões antigas nem autorizar publicação.

- [ ] Usar casa/token exclusivos de teste criados pelo procedimento local existente; executar gerador e importador do plano1. Abrir catálogo, os seis relatórios com datas da massa, filtrar, avançar páginas e baixar seis PDFs. Repetir importação e comprovar idempotência.
- [ ] Fazer também percurso sem dados e período parcialmente recebido. Conferir em 390 px e computador, claro/escuro e admin só leitura. Usar ferramenta de navegador disponível no ambiente; se não houver, reportar a inspeção visual como não executada, sem inventar screenshot ou aprovação.
- [ ] Documentar comandos exatos para reproduzir, incluindo `RF_PERMITIR_SIMULACAO=1` só no arquivo ignorado local de functions, `RF_RELATORIOS_URL`, `RF_RELATORIOS_TOKEN` sem valores e datas da massa. Não criar link de preview localhost na resposta de onboarding.
- [ ] Escrever limites de 366 dias/2.000 linhas PDF, significado de cobertura parcial e refinamentos (nomes/campos livres/fórmulas oficiais) na documentação técnica. Não despejar detalhes de ingestão na experiência normal do dono.
- [ ] Encerrar documentação com checklist de conexão real SCC: adaptar exportador ao contrato, obter financeiro/comissão oficiais, importar fotografia autorizada e conferir filtros/centavos. Esse checklist não bloqueia a entrega local nem vira afirmação de prontidão de produção.
- [ ] Commit `Documenta uso e homologação dos seis relatórios`.

## Tarefa 6 — verificação final e entrega ao usuário

**Files:** testes novos e regressões existentes; nenhum ajuste de produto fora do escopo.

- [ ] Rodar em sequência para preservar status e facilitar diagnóstico:

```bash
npx tsc --noEmit
npm run check
npm run test
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 npm run build
git diff --check
git status --short
```

Não usar `check:fix`/formatter no repositório inteiro; não aceitar suíte zero testes. Nenhum teste de integração pode ser dado como verde por ter sido skipped. A execução do banco requer Supabase/receber-relatorios local e, para a regressão v1, `receber-envio` conforme README.
- [ ] Investigar falhas causadas pelas mudanças, corrigir e rodar somente checagens afetadas antes da verificação final. Falha de infraestrutura confirmada é reportada separadamente; não editar testes antigos para acomodar falta do banco.
- [ ] Confirmar Hoje/Resultados/Ajustes, login/admin, PDF antigo, selo e PWA sem regressão. Somente docs/migrations/arquivos novos e alterações intencionais de navegação aparecem no diff; preservar AGENTS.md se Next tentar reescrevê-lo.
- [ ] Entregar: o que funciona localmente, comando de demonstração, seis PDFs/checagens observadas, limitações reais e passo separado de integração SCC. Não fazer push/deploy/migration em produção. O usuário decide publicação em outro passo.

**Resultado esperado ao concluir:** implementação completa da infraestrutura e experiência dos seis relatórios, com dados fictícios verificáveis e contrato pronto para receber os dados reais. Colunas oficiais não fornecidas são visíveis como não informadas; não são números estimados ou comprovação de homologação.

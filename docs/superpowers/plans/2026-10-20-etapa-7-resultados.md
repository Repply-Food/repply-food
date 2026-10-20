# Etapa 7 — Resultados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (required by `AGENTS.md`) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a tela Resultados com períodos, comparação, quatro abas e PDF protegido, sempre limitado aos dados da casa autorizada.

**Architecture:** Uma migration cria RPCs `security invoker` que calculam as métricas no Postgres sob a RLS existente. `lib/metricas/resultados` valida filtros de URL, consulta as RPCs e apenas transpõe o resultado tipado; página e PDF usam exatamente esse mesmo leitor.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/Postgres, Vitest, Recharts, shadcn `ChartContainer`, `@react-pdf/renderer`.

**Spec:** `docs/superpowers/specs/2026-10-20-etapa-7-resultados-design.md`

## Global Constraints

- `restaurante_id` vem exclusivamente de `exigirCasa`; funções novas são `security invoker`, usam RLS e entram no teste de funções expostas.
- Dinheiro é `text` fora do banco. Faturamento é `valor_consumido - taxa_servico`; taxa permanece separada (D-14).
- A URL só aceita abas e filtros aprovados; intervalo livre é inclusivo e tem no máximo 90 dias. Entrada inválida recai em `7d/anterior/vendas`.
- Entram apenas contas não removidas, pagas e fechadas no intervalo por `dia_operacao`. Fuso e virada pertencem ao restaurante.
- Em `semana`, somar as médias das últimas quatro ocorrências com movimento para cada data selecionada. Sem duas ocorrências, a referência é `null`.
- Não expor PII, payload SCC, token, e-mail ou segredo. Garçons e operadores aparecem somente por código.
- Não publicar, aplicar migration remota, configurar segredo ou chamar serviço externo sem nova autorização.

---

## File structure

| Caminho | Responsabilidade |
|---|---|
| `supabase/migrations/20261020160000_metricas_resultados.sql` | RPCs, grants e comentários de métricas |
| `lib/metricas/resultados/filtros.ts` | Parse puro de URL, período e limites |
| `lib/metricas/resultados/tipos.ts` | Contrato imutável SQL → leitor → tela/PDF |
| `lib/metricas/resultados/montar-resultados.ts` | Mapeia linhas RPC sem calcular métricas |
| `lib/metricas/resultados/index.ts` | Único leitor servidor das RPCs |
| `components/painel/resultados/*` | Filtros, abas, cartões e gráficos |
| `lib/pdf/resultados.tsx` | Documento PDF sem banco ou credencial |
| `app/r/[slug]/resultados/pdf/route.ts` | Autorização e download do PDF |
| `tests/metricas/resultados-*.test.ts` | Filtro, SQL, mapper e leitor |
| `tests/componentes/resultados/*` | Comportamento e acessibilidade da interface |
| `tests/pdf/resultados.test.tsx` | Documento, headers e ausência de dados proibidos |

## Task 1: Filtros, URL e período

**Files:**
- Create: `lib/metricas/resultados/filtros.ts`
- Create: `tests/metricas/resultados-filtros.test.ts`

**Interfaces:**
- Produz `parseFiltrosResultados(entrada, agora, fuso, horaVirada): FiltrosResultados`.
- `FiltrosResultados` contém `aba`, `comparacao`, `atalho`, `inicio`, `fim`, `quantidadeDias`, `rotuloPeriodo` e `query` canônica.

- [ ] **Step 1: Escrever os testes que falham**

```ts
it("inclui hoje nos sete dias e respeita a virada", () => {
  expect(parseFiltrosResultados({ periodo: "7d" }, agora, "America/Fortaleza", "05:00:00"))
    .toMatchObject({ inicio: "2026-10-17", fim: "2026-10-23", quantidadeDias: 7 });
});

it("recusa intervalo invertido, malformado ou acima de 90 dias", () => {
  for (const entrada of [
    { periodo: "escolher", inicio: "2026-10-10", fim: "2026-10-09" },
    { periodo: "escolher", inicio: "10/10/2026", fim: "2026-10-12" },
    { periodo: "escolher", inicio: "2026-01-01", fim: "2026-04-01" },
  ]) expect(parseFiltrosResultados(entrada, agora, fuso, virada).atalho).toBe("7d");
});
```

- [ ] **Step 2: Confirmar a falha**

Run: `npm run test -- tests/metricas/resultados-filtros.test.ts`

Expected: FAIL porque o módulo ainda não existe.

- [ ] **Step 3: Implementar o parser puro**

```ts
export const ABAS_RESULTADOS = ["vendas", "horarios", "equipe", "descontos"] as const;
export const COMPARACOES_RESULTADOS = ["anterior", "semana"] as const;
export const MAXIMO_DIAS_ESCOLHIDOS = 90;

export type FiltrosResultados = {
  aba: (typeof ABAS_RESULTADOS)[number];
  comparacao: (typeof COMPARACOES_RESULTADOS)[number];
  atalho: "hoje" | "7d" | "mes" | "escolher";
  inicio: string;
  fim: string;
  quantidadeDias: number;
  rotuloPeriodo: string;
  query: URLSearchParams;
};
```

Tratar `string | string[] | undefined`; aceitar somente datas ISO reais; calcular o dia de operação para a **seleção** com `date-fns-tz`; usar diferença inclusiva; e remover qualquer parâmetro não reconhecido ao montar `query`.

- [ ] **Step 4: Verificar e commitar**

Run: `npm run test -- tests/metricas/resultados-filtros.test.ts && npm run lint && npm run types`

```bash
git add lib/metricas/resultados/filtros.ts tests/metricas/resultados-filtros.test.ts
git commit -m "Valida os filtros de resultados"
```

## Task 2: Métricas SQL, comparação e isolamento

**Files:**
- Create: `supabase/migrations/20261020160000_metricas_resultados.sql`
- Create: `tests/metricas/resultados-sql.test.ts`
- Modify: `tests/isolamento/funcoes-fechadas.test.ts`

**Interfaces:**
- Produz as RPCs `metrica_resultados_resumo`, `metrica_resultados_vendas_diarias`, `metrica_resultados_ocupacao`, `metrica_resultados_horas`, `metrica_resultados_mapa_calor`, `metrica_resultados_turnos`, `metrica_resultados_equipe` e `metrica_resultados_descontos`.
- Todas recebem `uuid, date, date`; resumo recebe um quarto `text` para a comparação.

- [ ] **Step 1: Escrever a integração que falha**

Montar fixture com duas casas, virada 05:00, contas pagas consecutivas, uma removida, uma aberta, taxas, descontos, ocupações, garçons e operadores.

```ts
it("separa taxa do faturamento e exclui removida ou não paga", async () => {
  const { rows } = await banco.query(
    "select * from public.metrica_resultados_resumo($1, $2, $3, 'anterior')",
    [fixture.restauranteA, "2026-10-17", "2026-10-23"]
  );
  expect(rows[0]).toMatchObject({ faturamento: "2400.00", taxa_servico: "240.00" });
});

it("soma a média das quatro ocorrências por dia selecionado", async () => {
  const { rows } = await banco.query(
    "select * from public.metrica_resultados_resumo($1, '2026-10-17', '2026-10-18', 'semana')",
    [fixture.restauranteA]
  );
  expect(rows[0].referencia_faturamento).toBe("3000.00");
});
```

Cobrir período anterior de mesmo tamanho, histórico insuficiente, fronteira da virada, dia sem movimento no gráfico, ocupação, hora local, mapa de calor, turnos, permanência, rankings, códigos nulos, descontos zero e casa sem dados.

Adicionar também uma sessão autenticada da casa A chamando cada RPC com o ID da
casa B: cada uma deve retornar zero linhas (ou uma linha agregada vazia somente
para o ID autorizado), sem número da casa B. Fazer a mesma prova com admin
somente depois de selecionar a casa B pelo caminho normal do painel.

- [ ] **Step 2: Confirmar a falha antes da migration**

Run: `npm run test -- tests/metricas/resultados-sql.test.ts`

Expected: FAIL com função inexistente.

- [ ] **Step 3: Criar a migration SQL**

Começar com `begin;` e terminar com `commit;`. As funções devem ser `stable security invoker set search_path = public` e filtrar sempre:

```sql
where e.restaurante_id = p_restaurante_id
  and e.removida_em is null
  and e.pago
  and e.dia_operacao between p_inicio and p_fim
```

`metrica_resultados_resumo` devolve uma linha com faturamento, taxa, contas, pessoas, tickets, cada referência e cada variação. Para `anterior`, usar intervalo imediatamente anterior de mesmo tamanho. Para `semana`, CTE por dia do intervalo → quatro ocorrências anteriores com movimento → média por dia → soma; referência/variação ficam nulas se qualquer dia necessário não tiver duas ocorrências.

As demais RPCs retornam apenas dados atuais, já ordenados:

```sql
-- vendas_diarias: dia_operacao, faturamento, taxa_servico
-- ocupacao: tipo, faturamento, participacao
-- horas: hora, faturamento
-- mapa_calor: dia_semana, hora, media_contas
-- turnos: turno, faturamento, contas, permanencia_media
-- equipe: cod_garcom, faturamento, contas, pessoas, ticket_conta, ticket_pessoa, taxa_servico
-- descontos: cod_operador_fechamento, descontos
```

Usar `timezone(fuso, aberta_em)` para horas. Turnos usam configuração da casa; se ausente, almoço antes de 17h e jantar daí em diante. Agrupar ocupações fora de Mesa/Balcão em Outros. Permanência usa somente `fechada_em >= aberta_em`.

Conceder `execute` somente a `authenticated, service_role` e adicionar todas as assinaturas exatas em `abertas`, com `anon: false`, no teste de funções fechadas.

- [ ] **Step 4: Aplicar apenas localmente e verificar**

Run: `npx supabase db reset && npm run test -- tests/metricas/resultados-sql.test.ts tests/isolamento/funcoes-fechadas.test.ts && npm run types`

Expected: PASS, sem comando contra projeto remoto.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261020160000_metricas_resultados.sql \
  tests/metricas/resultados-sql.test.ts tests/isolamento/funcoes-fechadas.test.ts \
  types/database.types.ts
git commit -m "Calcula as métricas de resultados no banco"
```

## Task 3: Contrato tipado e leitor servidor

**Files:**
- Create: `lib/metricas/resultados/tipos.ts`
- Create: `lib/metricas/resultados/montar-resultados.ts`
- Create: `lib/metricas/resultados/index.ts`
- Create: `tests/metricas/resultados-montar.test.ts`
- Create: `tests/metricas/resultados-leitura.test.ts`

**Interfaces:**
- Produz `DadosDeResultados`, `montarDadosDeResultados(linhas)` e `obterResultados(restauranteId, filtros)`.
- Tela e PDF consomem somente `DadosDeResultados`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
it("preserva dinheiro em string, taxa separada e referência nula", () => {
  const dados = montarDadosDeResultados(linhas({
    resumo: [{ faturamento: "8420.00", taxa_servico: "842.00", referencia_faturamento: null }],
  }));
  expect(dados.resumo.faturamento).toBe("8420.00");
  expect(dados.resumo.taxaServico).toBe("842.00");
  expect(dados.resumo.referencia.faturamento).toBeNull();
});

it("falha ao faltar a linha agregada", async () => {
  await expect(obterResultados(restauranteId, filtros)).rejects.toThrow("linha_ausente");
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm run test -- tests/metricas/resultados-montar.test.ts tests/metricas/resultados-leitura.test.ts`

Expected: FAIL porque os módulos não existem.

- [ ] **Step 3: Implementar tipos, mapper e leitor**

Definir `DadosDeResultados` com resumo, vendas diárias, ocupação, horas, mapa, turnos, equipe, descontos e `Meta | null`; todo valor monetário é `string`, toda razão sem denominador é `null`. Quando `filtros.atalho === "mes"`, `index.ts` chama também a RPC já existente `metrica_meta_do_mes(restauranteId, agora)` e a mapeia; nos demais atalhos, retorna `meta: null` sem chamá-la.

Seguir `montar-hoje.ts`: derivar linhas de `Database["public"]["Functions"]`, usar `umaLinha` para resumo, fazer apenas snake_case → camelCase e manter `null`. Em `index.ts`, chamar todas as RPCs com `Promise.all`, registrar somente `falha_metricas_resultados` via `logError` e lançar `falha_leitura_resultados` em qualquer erro/contrato quebrado.

- [ ] **Step 4: Executar e commitar**

Run: `npm run test -- tests/metricas/resultados-montar.test.ts tests/metricas/resultados-leitura.test.ts && npm run lint && npm run types`

```bash
git add lib/metricas/resultados tests/metricas/resultados-montar.test.ts tests/metricas/resultados-leitura.test.ts
git commit -m "Lê os dados tipados de resultados"
```

## Task 4: Página, controles e Vendas

**Files:**
- Modify: `app/r/[slug]/resultados/page.tsx`
- Create: `components/painel/resultados/controles-resultados.tsx`
- Create: `components/painel/resultados/abas-resultados.tsx`
- Create: `components/painel/resultados/aba-vendas.tsx`
- Create: `components/painel/resultados/grafico-vendas-diarias.tsx`
- Create: `components/painel/resultados/cartao-comparativo.tsx`
- Create: `tests/componentes/resultados/controles-resultados.test.tsx`
- Create: `tests/componentes/resultados/aba-vendas.test.tsx`

**Interfaces:**
- Consome `FiltrosResultados`, `DadosDeResultados` e `exigirCasa`.
- Produz URL canônica e a primeira aba responsiva.

- [ ] **Step 1: Escrever os testes que falham**

```tsx
it("troca para escolher e não navega com mais de 90 dias", async () => {
  render(<ControlesResultados filtros={filtros} slug="casa-a" />);
  await user.click(screen.getByRole("button", { name: "Escolher período" }));
  await user.type(screen.getByLabelText("Data inicial"), "2026-10-01");
  await user.type(screen.getByLabelText("Data final"), "2026-12-31");
  expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining("inicio=2026-10-01"));
});

it("mostra taxa fora do faturamento e gráfico diário acessível", () => {
  render(<AbaVendas dados={dados} filtros={filtros} />);
  expect(screen.getByText(/taxa de serviço \(fora do faturamento\)/i)).toBeVisible();
  expect(screen.getByRole("img", { name: /faturamento por dia/i })).toBeVisible();
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm run test -- tests/componentes/resultados/controles-resultados.test.tsx tests/componentes/resultados/aba-vendas.test.tsx`

Expected: FAIL porque os componentes ainda não existem.

- [ ] **Step 3: Implementar tela e aba**

A página recebe `searchParams`, chama `exigirCasa(slug)`, lê fuso/virada da casa autorizada, faz parse e chama `obterResultados`. Em erro, registra `falha_metricas_resultados` e lança `falha_leitura_resultados`.

`ControlesResultados` usa `useRouter().push` somente com a query canônica, chips com `aria-pressed`, dois inputs de data rotulados, `min`/`max` e erro acessível. `AbasResultados` usa `tablist/tab`, `aria-selected`, links e rolagem horizontal no celular.

`AbaVendas` reutiliza `Card`, `formatarBRL`, `ChipComparacao` generalizado e `ChartContainer`. Barras diárias são laranja, o gráfico tem texto alternativo, comparação sem base mostra “—”, e meta/projeção aparece apenas quando `atalho === "mes"`.

- [ ] **Step 4: Verificar, abrir no navegador e commitar**

Run: `npm run test -- tests/componentes/resultados/controles-resultados.test.tsx tests/componentes/resultados/aba-vendas.test.tsx`

Abrir com `npm run dev` em 390 px e 1440 px e conferir chips, inputs, tabulação, menu e barra lateral.

```bash
git add app/r/[slug]/resultados/page.tsx components/painel/resultados tests/componentes/resultados
git commit -m "Monta a aba de vendas em resultados"
```

## Task 5: Horários, Equipe e Descontos

**Files:**
- Create: `components/painel/resultados/aba-horarios.tsx`
- Create: `components/painel/resultados/aba-equipe.tsx`
- Create: `components/painel/resultados/aba-descontos.tsx`
- Create: `components/painel/resultados/grafico-horas.tsx`
- Create: `components/painel/resultados/mapa-calor.tsx`
- Create: `tests/componentes/resultados/abas-secundarias.test.tsx`

**Interfaces:**
- Consome `DadosDeResultados` sem calcular valores.
- Produz as três abas restantes, curtas e acessíveis no celular.

- [ ] **Step 1: Escrever testes que falham**

```tsx
it("explica o mapa sem depender apenas de cor", () => {
  render(<AbaHorarios dados={dados} />);
  expect(screen.getByText(/média de contas por ocorrência/i)).toBeVisible();
  expect(screen.getByLabelText("Sexta, 20h: média de 3,5 contas")).toBeVisible();
});

it("mantém códigos nulos separados", () => {
  render(<><AbaEquipe dados={dados} /><AbaDescontos dados={dados} /></>);
  expect(screen.getByText("Sem garçom")).toBeVisible();
  expect(screen.getByText("Sem operador")).toBeVisible();
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm run test -- tests/componentes/resultados/abas-secundarias.test.tsx`

Expected: FAIL porque as abas não existem.

- [ ] **Step 3: Implementar os conteúdos**

`AbaHorarios` mostra barras por hora, mapa dia×hora com valor/texto alternativo, e cartões de almoço/jantar (faturamento, contas e permanência), incluindo a explicação do padrão 17h. `AbaEquipe` é tabela no desktop/cartões no celular, mantendo a ordenação SQL, com “Garçom N” ou “Sem garçom”. `AbaDescontos` mostra total, percentual se há denominador e ranking por operador; R$ 0,00 com movimento é válido e se diferencia de “Sem movimento no período”.

Usar `Card` e tokens já existentes. No mapa, cada célula tem texto e `aria-label`; a intensidade não pode ser a única informação.

- [ ] **Step 4: Verificar e commitar**

Run: `npm run test -- tests/componentes/resultados/abas-secundarias.test.tsx`

Abrir as três abas em 390 px e 1440 px; conferir que não corta a tabela e que o modo leitura do admin não oferece escrita.

```bash
git add components/painel/resultados tests/componentes/resultados/abas-secundarias.test.tsx
git commit -m "Adiciona as abas analíticas de resultados"
```

## Task 6: PDF autenticado

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/pdf/resultados.tsx`
- Create: `app/r/[slug]/resultados/pdf/route.ts`
- Create: `tests/pdf/resultados.test.tsx`
- Create: `tests/isolamento/resultados.test.ts`

**Interfaces:**
- Produz `DocumentoResultadosPdf({ casa, filtros, dados, geradoEm })` e a rota `GET /r/[slug]/resultados/pdf`.

- [ ] **Step 1: Adicionar dependência e escrever testes que falham**

Run: `npm install @react-pdf/renderer`

```ts
it("recusa PDF sem acesso", async () => {
  mockExigirCasa.mockRejectedValue(new Error("sem_acesso"));
  expect((await GET(request, { params })).status).toBe(404);
});

it("baixa PDF com quatro seções", async () => {
  const resposta = await GET(requestComFiltros, { params });
  expect(resposta.headers.get("content-type")).toBe("application/pdf");
  expect(resposta.headers.get("content-disposition")).toMatch(/resultados-/);
  expect(Buffer.from(await resposta.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
});
```

Renderizar também o documento isolado e conferir títulos Vendas, Horários, Equipe e Descontos, taxa separada e ausência de qualquer texto pessoal/segredo da fixture.

- [ ] **Step 2: Confirmar falha**

Run: `npm run test -- tests/pdf/resultados.test.tsx tests/isolamento/resultados.test.ts`

Expected: FAIL por falta da rota/documento.

- [ ] **Step 3: Implementar documento e rota**

`DocumentoResultadosPdf` usa A4 e fontes internas, contém nome da casa, intervalo, comparação, momento de geração e as quatro seções; usa somente `DadosDeResultados`.

A rota faz nesta ordem: `exigirCasa(slug)`; lê fuso/virada autorizados; parseia `request.nextUrl.searchParams`; chama `obterResultados(casa.id, filtros)`; chama `renderToBuffer`; responde com `application/pdf`, attachment `resultados-AAAA-MM-DD-a-AAAA-MM-DD.pdf` e `Cache-Control: no-store`. Falta de acesso retorna 404; falha de leitura/renderização responde 500 `falha_pdf_resultados` e registra somente esse código.

O botão na tela é link para a rota montado somente por `filtros.query`; sem `service_role`, cookie manual ou serviço externo.

- [ ] **Step 4: Verificar PDF e commitar**

Run: `npm run test -- tests/pdf/resultados.test.tsx tests/isolamento/resultados.test.ts`

Baixar um PDF local e rodar `pdftotext /tmp/resultados.pdf - | grep -E 'Vendas|Horários|Equipe|Descontos'`; conferir visualmente que não há sobreposição.

```bash
git add package.json package-lock.json lib/pdf app/r/[slug]/resultados/pdf \
  app/r/[slug]/resultados/page.tsx tests/pdf tests/isolamento/resultados.test.ts
git commit -m "Exporta os resultados em PDF"
```

## Task 7: Documentação, gates e revisão

**Files:**
- Modify: `docs/metricas.md`
- Modify: `docs/arquitetura/modelo-de-dados.md` (somente se enumera as RPCs)
- Modify: `docs/operacao/publicar.md` (somente se a rota exigir passo operacional)
- Modify: `docs/divida-tecnica.md` (mover item existente, nunca apagar, se aplicável)

- [ ] **Step 1: Atualizar documentos finais**

Registrar em `docs/metricas.md` a comparação aprovada para períodos multi-dia e o limite de 90 dias. Documentar a rota PDF como leitura autenticada. Não alterar `docs/decisoes.md`.

- [ ] **Step 2: Rodar os gates completos**

```bash
npm run types
npm run lint
npm run test
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 npm run build
git diff --check
```

Expected: código 0 em todos. Subir `npx supabase functions serve` apenas se testes existentes exigirem o runtime e encerrá-lo em seguida.

- [ ] **Step 3: Provar a interface e comparar antes de integrar**

Testar em 390 px e 1440 px: todas as abas, atalhos, intervalo de 90 dias, URL, sem histórico, mês com/sem meta, vazio, admin em modo leitura e PDF. Depois:

```bash
git fetch origin
git log --oneline origin/main..HEAD
git diff --check origin/main...HEAD
git status --short --branch
```

Não fazer merge em `main`, deploy ou operação remota. Pedir revisão focada em RLS, virada, taxa separada, PDF e PII.

- [ ] **Step 4: Salvar e enviar somente a branch da etapa**

```bash
git add docs
git commit -m "Documenta os resultados por período"
git push origin etapa-7-resultados
```

## Self-review of this plan

- **Cobertura:** filtros/90 dias (T1), métricas e RLS (T2), contrato (T3), Vendas/responsividade (T4), três abas (T5), PDF (T6), documentação e gates (T7).
- **Consistência:** página e PDF usam `FiltrosResultados` e `DadosDeResultados`; as RPCs de T2 são a única fonte de T3.
- **Sem atalhos:** cada tarefa começa por teste que falha, tem implementação delimitada, verificação e commit.

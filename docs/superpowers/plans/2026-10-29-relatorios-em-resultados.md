# Relatórios dentro de Resultados — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use `subagent-driven-development` (recomendado) ou `executing-plans` para executar este plano tarefa por tarefa. Os passos usam caixas de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** Remover Relatórios como destino principal e colocar os seis atalhos dentro de Resultados sem mudar as páginas detalhadas.

**Arquitetura:** O catálogo existente permanece como componente reutilizável e será renderizado ao fim da página Resultados. O menu terá três destinos e tratará o prefixo `/relatorios` como pertencente à seção Resultados. A rota antiga do catálogo autenticará a casa e redirecionará para Resultados.

**Stack:** Next.js App Router, React, TypeScript estrito, Tailwind CSS 4, Testing Library e Vitest.

**Especificação:** `docs/superpowers/specs/2026-10-29-relatorios-em-resultados-design.md`

## Restrições globais

- Preservar as seis rotas detalhadas, seus filtros e PDFs.
- Não transformar os relatórios em seis novas abas.
- Reutilizar `CatalogoRelatorios`; não duplicar o registro dos relatórios.
- Manter a verificação de acesso antes do redirecionamento da rota antiga.
- Validar celular e computador, temas claro e escuro e estado sem dados.
- Não importar nem alterar dados de produção.

---

### Tarefa 1: Menu com três destinos

**Arquivos:**
- Modificar: `tests/painel/menu-painel.test.tsx`
- Modificar: `components/painel/menu-painel.tsx`

**Interfaces:**
- Consome: `usePathname(): string` e a propriedade `slug: string`.
- Produz: três links; `/relatorios` é reconhecido como parte de Resultados.

- [ ] **Passo 1: escrever o teste que falha**

Alterar a expectativa do teste existente para os três destinos e para Resultados ativo na rota detalhada:

```tsx
expect(links.map((link) => link.getAttribute("href"))).toEqual([
  "/r/casa-x/hoje",
  "/r/casa-x/resultados",
  "/r/casa-x/ajustes",
]);
expect(screen.getByRole("link", { name: "Resultados" })).toHaveAttribute(
  "aria-current",
  "page"
);
expect(screen.queryByRole("link", { name: "Relatórios" })).toBeNull();
```

- [ ] **Passo 2: confirmar o vermelho**

Executar: `npx vitest run tests/painel/menu-painel.test.tsx`  
Esperado: falha porque o menu ainda contém quatro links e marca Relatórios.

- [ ] **Passo 3: implementar o mínimo**

Remover `FileBarChart` e o item `relatorios`, mudar a grade inferior para três colunas e considerar a rota detalhada na seleção de Resultados:

```tsx
const atual =
  caminho === href ||
  caminho.startsWith(`${href}/`) ||
  (tela === "resultados" && caminho.startsWith(`/r/${slug}/relatorios/`));
```

- [ ] **Passo 4: confirmar o verde**

Executar: `npx vitest run tests/painel/menu-painel.test.tsx`  
Esperado: todos os testes do arquivo passam.

### Tarefa 2: Catálogo dentro de Resultados e redirecionamento legado

**Arquivos:**
- Criar: `tests/painel/resultados-page.test.tsx`
- Modificar: `tests/relatorios/catalogo-page.test.tsx`
- Modificar: `app/r/[slug]/resultados/page.tsx`
- Modificar: `app/r/[slug]/relatorios/page.tsx`

**Interfaces:**
- Consome: `CatalogoRelatorios({ slug }: { slug: string })`, `exigirCasa(slug)` e `redirect(path)`.
- Produz: seção `Relatórios da SCC` ao fim de Resultados e redirecionamento de `/relatorios` para `/resultados`.

- [ ] **Passo 1: escrever os testes que falham**

No teste da página Resultados, simular as leituras externas e verificar a integração real com o catálogo:

```tsx
expect(screen.getByRole("heading", { name: "Relatórios da SCC" })).toBeTruthy();
expect(screen.getAllByRole("link", { name: /abrir relatório/i })).toHaveLength(6);
```

No teste da rota antiga, simular `redirect` e conferir a ordem lógica de acesso e destino:

```tsx
expect(exigirCasa).toHaveBeenCalledWith("casa-x");
expect(redirect).toHaveBeenCalledWith("/r/casa-x/resultados");
```

- [ ] **Passo 2: confirmar o vermelho**

Executar: `npx vitest run tests/painel/resultados-page.test.tsx tests/relatorios/catalogo-page.test.tsx`  
Esperado: Resultados não contém o catálogo e a rota antiga ainda o renderiza.

- [ ] **Passo 3: implementar o mínimo**

Importar e renderizar o catálogo após as abas:

```tsx
<section className="flex flex-col gap-4 md:gap-5" aria-labelledby="relatorios-scc">
  <h2 id="relatorios-scc" className="text-lg font-semibold tracking-tight">
    Relatórios da SCC
  </h2>
  <CatalogoRelatorios slug={slug} />
</section>
```

Trocar o conteúdo da página legada por:

```tsx
const { slug } = await params;
await exigirCasa(slug);
redirect(`/r/${slug}/resultados`);
```

- [ ] **Passo 4: confirmar o verde focado**

Executar: `npx vitest run tests/painel/menu-painel.test.tsx tests/painel/resultados-page.test.tsx tests/relatorios/catalogo-page.test.tsx tests/componentes/relatorios/catalogo.test.tsx`  
Esperado: todos os testes focados passam.

### Tarefa 3: Verificação completa e revisão visual

**Arquivos:**
- Verificar: todos os arquivos modificados nas tarefas anteriores.

**Interfaces:**
- Consome: aplicação concluída.
- Produz: evidência de que a mudança não introduziu regressões.

- [ ] **Passo 1: executar as verificações automatizadas**

Executar separadamente:

```bash
npx tsc --noEmit
npm run check
npm run test
npm run build
```

Esperado: zero erro em todos os comandos.

- [ ] **Passo 2: revisar no navegador**

Abrir Resultados e um relatório detalhado em 390 px e em largura de computador. Conferir tema claro, tema escuro, dono, administrador em modo leitura e o estado sem dados. Em ambos os caminhos, Resultados deve ser a única seção ativa.

- [ ] **Passo 3: revisar o diff e o estado do Git**

Executar `git diff --check`, `git diff` e `git status --short` em comandos separados. Confirmar que não há credenciais, arquivos locais ou mudanças fora do escopo.

- [ ] **Passo 4: commitar sem publicar**

Adicionar somente os arquivos listados neste plano e criar um commit em PT-BR. Não enviar a branch nem publicar sem nova confirmação do Lucas Ferreira.

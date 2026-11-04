# Módulos por casa (padrão desligado + exceção) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a cada casa um conjunto de módulos opcionais; o `mentor` nasce desligado para todas e só é ligado por casa no admin (a 1ª exceção é a demo).

**Architecture:** Uma coluna `modulos text[]` em `restaurantes` (default `'{}'`) guarda os módulos opcionais ligados. A casa da sessão (`exigirCasa`) carrega `modulos`; o menu esconde a aba, a rota responde 404 e a ação recusa quando o módulo está desligado. O admin liga/desliga por casa, pelo mesmo caminho das outras mutações de casa (RLS: só admin escreve).

**Tech Stack:** Next.js (App Router, Server Actions), TypeScript estrito, Supabase (Postgres + RLS), Vitest, Biome.

## Global Constraints

- `restaurante_id`/casa vêm SEMPRE da sessão (`exigirCasa`), nunca do corpo da requisição nem da URL sem conferir.
- Toda tabela nova nasce por migration com RLS no mesmo arquivo; **migrations só se acrescentam**; proibido `FORCE ROW LEVEL SECURITY`. (Aqui só se **altera** `restaurantes`, sem mudar RLS.)
- Zero linhas afetadas numa escrita não é sucesso: conferir a contagem (`count: "exact"`, `count === 1`).
- **Nunca `any`.** Tipos do banco por `npm run types`.
- Domínio em PT-BR (tabelas, colunas, funções, tipos). Frases de erro são do produto, nunca o erro cru do banco.
- Celular **e** computador em toda tela (inclusive o admin).
- Ligar/desligar módulo **não apaga dado**: só mostra/esconde e libera/barra o uso.
- Verificação antes de "feito": `npx tsc --noEmit`, `npm run check`, `npm run test`, `npm run build`.

---

### Task 1: Registro dos módulos opcionais

**Files:**
- Create: `lib/painel/modulos.ts`
- Test: `tests/painel/modulos.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `MODULOS_OPCIONAIS` (tupla `readonly ["mentor"]`), tipo `ModuloOpcional`, `casaTemModulo(modulos: readonly string[], modulo: ModuloOpcional): boolean`.

- [ ] **Step 1: Escreva o teste (falha)**

```ts
// tests/painel/modulos.test.ts
import { describe, expect, it } from "vitest";
import { MODULOS_OPCIONAIS, casaTemModulo } from "@/lib/painel/modulos";

describe("módulos opcionais da casa", () => {
  it("o mentor é um módulo opcional conhecido", () => {
    expect(MODULOS_OPCIONAIS).toContain("mentor");
  });
  it("casa sem o módulo: falso", () => {
    expect(casaTemModulo([], "mentor")).toBe(false);
  });
  it("casa com o módulo: verdadeiro", () => {
    expect(casaTemModulo(["mentor"], "mentor")).toBe(true);
  });
  it("texto desconhecido na lista não vira módulo", () => {
    expect(casaTemModulo(["outro"], "mentor")).toBe(false);
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `node_modules/vitest/vitest.mjs run tests/painel/modulos.test.ts`
Expected: FAIL — "Failed to resolve import @/lib/painel/modulos".

- [ ] **Step 3: Implemente**

```ts
// lib/painel/modulos.ts
/**
 * Módulos OPCIONAIS da casa. Os módulos centrais do MVP (Hoje, Resultados,
 * Ajustes) estão sempre ligados e NÃO entram aqui. A lista `modulos` da casa
 * (coluna em `restaurantes`) guarda só os opcionais que o admin ligou.
 */
export const MODULOS_OPCIONAIS = ["mentor"] as const;
export type ModuloOpcional = (typeof MODULOS_OPCIONAIS)[number];

/** A casa tem o módulo opcional ligado? `modulos` vem SEMPRE da casa da sessão. */
export function casaTemModulo(
  modulos: readonly string[],
  modulo: ModuloOpcional
): boolean {
  return modulos.includes(modulo);
}
```

- [ ] **Step 4: Rode e veja passar**

Run: `node_modules/vitest/vitest.mjs run tests/painel/modulos.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/painel/modulos.ts tests/painel/modulos.test.ts
git commit -m "Cria o registro dos modulos opcionais da casa"
```

---

### Task 2: Coluna `modulos` + tipos + sessão

**Files:**
- Create: `supabase/migrations/20261104120000_modulos_por_casa.sql`
- Modify: `types/database.types.ts` (via `npm run types`, não à mão)
- Modify: `lib/auth/sessao.ts` (tipo `CasaDoLogin`, `paraCasa`, os dois `select`)
- Test: `tests/isolamento/modulos-coluna.test.ts`

**Interfaces:**
- Consumes: nada de Task 1.
- Produces: `CasaDoLogin.modulos: string[]` (vem de `exigirCasa().casa.modulos` e de `obterSessao().casas[].modulos`).

- [ ] **Step 1: Escreva a migration**

```sql
-- supabase/migrations/20261104120000_modulos_por_casa.sql
-- Módulos opcionais por casa. Vazio = nenhum: toda casa (as existentes e as
-- novas) nasce sem módulo opcional, inclusive o mentor. Sem mudança de RLS: a
-- coluna herda a política de `restaurantes` (dono lê a própria; só admin escreve).
alter table public.restaurantes
  add column modulos text[] not null default '{}';

comment on column public.restaurantes.modulos is
  'Módulos opcionais ligados na casa (ex.: mentor). Vazio = nenhum. Os módulos centrais do MVP não entram aqui.';
```

- [ ] **Step 2: Aplique no banco local e gere os tipos**

Run: `npx supabase migration up` (aplica a migration pendente no banco local)
Run: `npm run types`
Expected: a migration aplica sem erro; `types/database.types.ts` passa a ter `modulos: string[]` em `restaurantes` (Row/Insert/Update).

- [ ] **Step 3: Escreva o teste do banco (falha antes do Step 4)**

```ts
// tests/isolamento/modulos-coluna.test.ts
import { createServiceClient } from "@/lib/supabase/service";
import { afterAll, describe, expect, it } from "vitest";

// Usa o Supabase local. Prova o default da coluna: casa nova nasce sem módulo.
const db = createServiceClient();
const slug = `teste-modulos-${Date.now()}`;

afterAll(async () => {
  await db.from("restaurantes").delete().eq("slug", slug);
});

describe("coluna modulos", () => {
  it("casa nova nasce com modulos vazio (mentor desligado)", async () => {
    const criada = await db
      .from("restaurantes")
      .insert({ slug, nome: "Casa Teste Módulos" })
      .select("modulos")
      .single();
    expect(criada.error).toBeNull();
    expect(criada.data?.modulos).toEqual([]);
  });
});
```

- [ ] **Step 4: Ajuste `lib/auth/sessao.ts`**

Adicione `modulos` ao tipo e aos dois `select`, e mapeie em `paraCasa`:

```ts
// lib/auth/sessao.ts
export type CasaDoLogin = {
  id: string;
  slug: string;
  nome: string;
  situacao: "ativo" | "suspenso";
  fuso: string;
  modulos: string[]; // módulos opcionais ligados (ver lib/painel/modulos.ts)
};

function paraCasa(c: {
  id: string;
  slug: string;
  nome: string;
  situacao: string;
  fuso: string;
  modulos: string[] | null;
}): CasaDoLogin {
  return {
    id: c.id,
    slug: c.slug,
    nome: c.nome,
    fuso: c.fuso,
    situacao: c.situacao === "suspenso" ? "suspenso" : "ativo",
    modulos: c.modulos ?? [],
  };
}
```

No `obterSessao`, o select das casas do dono:
```ts
      .select("id, slug, nome, situacao, fuso, modulos, acessos!inner(user_id)")
```
No `casaPeloEndereco` (admin):
```ts
      .select("id, slug, nome, situacao, fuso, modulos")
```

- [ ] **Step 5: Rode o teste + tipos**

Run: `node_modules/vitest/vitest.mjs run tests/isolamento/modulos-coluna.test.ts`
Expected: PASS (precisa do Supabase local de pé).
Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261104120000_modulos_por_casa.sql types/database.types.ts lib/auth/sessao.ts tests/isolamento/modulos-coluna.test.ts
git commit -m "Adiciona a coluna modulos por casa e a leva na sessao"
```

---

### Task 3: O menu esconde a aba Mentor quando o módulo está desligado

**Files:**
- Modify: `components/painel/menu-painel.tsx`
- Modify: `components/painel/moldura-painel.tsx` (passa `modulos` ao `MenuPainel`)
- Modify: `app/r/[slug]/layout.tsx` se for ele quem resolve a casa e monta a moldura (confirmar na leitura; passar `casa.modulos`)
- Test: `tests/painel/menu-painel.test.tsx`

**Interfaces:**
- Consumes: `casaTemModulo` (Task 1), `casa.modulos` (Task 2).
- Produces: `MenuPainel` passa a exigir a prop `modulos: string[]`.

- [ ] **Step 1: Escreva/ajuste o teste (falha)**

```tsx
// tests/painel/menu-painel.test.tsx  (acrescente estes casos)
// @vitest-environment jsdom
import { MenuPainel } from "@/components/painel/menu-painel";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/r/bar-do-ze/hoje" }));

afterEach(cleanup);

describe("MenuPainel — módulos", () => {
  it("esconde a aba Mentor quando a casa não tem o módulo", () => {
    render(<MenuPainel slug="bar-do-ze" variante="lateral" modulos={[]} />);
    expect(screen.getByRole("link", { name: "Hoje" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Resultados" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ajustes" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Mentor" })).toBeNull();
  });
  it("mostra a aba Mentor quando a casa tem o módulo", () => {
    render(
      <MenuPainel slug="bar-do-ze" variante="lateral" modulos={["mentor"]} />
    );
    expect(screen.getByRole("link", { name: "Mentor" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `node_modules/vitest/vitest.mjs run tests/painel/menu-painel.test.tsx`
Expected: FAIL — `MenuPainel` ainda não aceita `modulos`, e a aba Mentor aparece sempre.

- [ ] **Step 3: Implemente no `MenuPainel`**

Marque o item do mentor como opcional e filtre pelos módulos da casa:

```tsx
// components/painel/menu-painel.tsx
import { type ModuloOpcional, casaTemModulo } from "@/lib/painel/modulos";
// ...
const ITENS = [
  { tela: "hoje", rotulo: "Hoje", Icone: LayoutDashboard },
  { tela: "resultados", rotulo: "Resultados", Icone: ChartColumn },
  { tela: "ajustes", rotulo: "Ajustes", Icone: Settings },
  { tela: "mentor", rotulo: "Mentor", Icone: MessageCircle, modulo: "mentor" },
] as const;

export function MenuPainel({
  slug,
  variante,
  modulos,
}: {
  slug: string;
  variante: "lateral" | "inferior";
  modulos: string[];
}) {
  const caminho = usePathname();
  const itens = ITENS.filter(
    (item) =>
      !("modulo" in item) ||
      casaTemModulo(modulos, item.modulo as ModuloOpcional)
  );
  // ...troque `ITENS.map(...)` por `itens.map(...)` no corpo abaixo.
```

- [ ] **Step 4: Passe `modulos` na moldura**

Leia `components/painel/moldura-painel.tsx` e `app/r/[slug]/layout.tsx`: onde a casa da sessão já é resolvida (`exigirCasa`), passe `casa.modulos` para cada `<MenuPainel ... />` (a variante lateral e a inferior). Se a moldura recebe a casa por prop, acrescente `modulos` à prop e repasse.

- [ ] **Step 5: Rode os testes + tipos**

Run: `node_modules/vitest/vitest.mjs run tests/painel/menu-painel.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: 0 erros (todas as chamadas de `MenuPainel` agora passam `modulos`).

- [ ] **Step 6: Commit**

```bash
git add components/painel/menu-painel.tsx components/painel/moldura-painel.tsx app/r/[slug]/layout.tsx tests/painel/menu-painel.test.tsx
git commit -m "Esconde a aba Mentor quando a casa nao tem o modulo"
```

---

### Task 4: A rota dá 404 e a ação recusa quando o módulo está desligado

**Files:**
- Modify: `app/r/[slug]/mentor/page.tsx`
- Modify: `lib/mentor/enviar-action.ts`
- Test: `tests/mentor/enviar-action.test.ts` (acrescentar), `tests/mentor/mentor-page-guarda.test.tsx` (criar)

**Interfaces:**
- Consumes: `casaTemModulo` (Task 1), `casa.modulos` (Task 2).
- Produces: a rota e a ação do mentor só respondem quando `casaTemModulo(casa.modulos, "mentor")`.

- [ ] **Step 1: Teste da ação (falha)**

```ts
// tests/mentor/enviar-action.test.ts  (acrescente)
// A casa sem o módulo mentor: a ação recusa com frase do produto, sem chamar o cérebro.
it("recusa quando a casa não tem o módulo mentor", async () => {
  exigirCasa.mockResolvedValue({
    casa: { id: "casa-1", slug: "bar-do-ze", modulos: [] },
    modoAdmin: false,
  });
  const r = await enviarMensagemAction("bar-do-ze", null, "Como foi a semana?");
  expect(r).toEqual({ ok: false, error: "o mentor não está disponível nesta casa" });
  expect(responderNoMentor).not.toHaveBeenCalled();
});
```

Observação ao implementar: siga o mock já existente neste arquivo para `@/lib/auth/sessao` (`exigirCasa`) e `./conversa` (`responderNoMentor`). Nos casos que já existem, acrescente `modulos: ["mentor"]` à `casa` mockada para continuarem passando.

- [ ] **Step 2: Rode e veja falhar**

Run: `node_modules/vitest/vitest.mjs run tests/mentor/enviar-action.test.ts`
Expected: FAIL — hoje a ação não confere o módulo.

- [ ] **Step 3: Implemente a trava na ação**

```ts
// lib/mentor/enviar-action.ts
import { casaTemModulo } from "@/lib/painel/modulos";
// ...
const FRASE_SEM_MODULO = "o mentor não está disponível nesta casa";
// ...
export async function enviarMensagemAction(
  slug: string,
  conversaId: string | null,
  texto: string
): Promise<Resultado> {
  const { casa, modoAdmin } = await exigirCasa(slug);
  if (!casaTemModulo(casa.modulos, "mentor")) {
    return { ok: false, error: FRASE_SEM_MODULO };
  }
  if (modoAdmin) return { ok: false, error: FRASE_ADMIN };
  // ...resto igual.
```

- [ ] **Step 4: Teste da rota (falha)**

```tsx
// tests/mentor/mentor-page-guarda.test.tsx
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const { exigirCasa } = vi.hoisted(() => ({ exigirCasa: vi.fn() }));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("@/lib/mentor/leitura", () => ({
  conversasDaCasa: vi.fn(async () => []),
  mensagensDaConversa: vi.fn(async () => []),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import PaginaMentor from "@/app/r/[slug]/mentor/page";

afterEach(() => vi.clearAllMocks());

const params = Promise.resolve({ slug: "bar-do-ze" });

describe("guarda da rota do mentor", () => {
  it("404 quando a casa não tem o módulo", async () => {
    exigirCasa.mockResolvedValue({
      casa: { id: "c1", slug: "bar-do-ze", modulos: [] },
      modoAdmin: false,
    });
    await expect(PaginaMentor({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("renderiza quando a casa tem o módulo", async () => {
    exigirCasa.mockResolvedValue({
      casa: { id: "c1", slug: "bar-do-ze", modulos: ["mentor"] },
      modoAdmin: false,
    });
    const elemento = await PaginaMentor({ params });
    expect(elemento).toBeTruthy();
  });
});
```

- [ ] **Step 5: Rode e veja falhar**

Run: `node_modules/vitest/vitest.mjs run tests/mentor/mentor-page-guarda.test.tsx`
Expected: FAIL — a página ainda não chama `notFound`.

- [ ] **Step 6: Implemente a trava na rota**

```tsx
// app/r/[slug]/mentor/page.tsx
import { casaTemModulo } from "@/lib/painel/modulos";
import { notFound } from "next/navigation";
// ...
  const { slug } = await params;
  const { casa, modoAdmin } = await exigirCasa(slug);
  if (!casaTemModulo(casa.modulos, "mentor")) notFound();
  // ...resto igual.
```

- [ ] **Step 7: Rode os dois testes + tipos**

Run: `node_modules/vitest/vitest.mjs run tests/mentor/enviar-action.test.ts tests/mentor/mentor-page-guarda.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 8: Commit**

```bash
git add app/r/[slug]/mentor/page.tsx lib/mentor/enviar-action.ts tests/mentor/enviar-action.test.ts tests/mentor/mentor-page-guarda.test.tsx
git commit -m "Trava a rota (404) e a acao do mentor quando o modulo esta desligado"
```

---

### Task 5: Liga/desliga o Mentor por casa no admin

**Files:**
- Modify: `lib/admin/tipos.ts` (o tipo do detalhe ganha `modulos`), `lib/admin/dados.ts` (`detalheDoRestaurante` seleciona `modulos`)
- Modify: `lib/admin/actions.ts` (nova `mudarModuloAction`)
- Create: `components/admin/cartoes/cartao-modulos.tsx`
- Modify: `app/admin/restaurantes/[id]/page.tsx` (inclui o `<CartaoModulos />`)
- Test: `tests/admin/mudar-modulo-action.test.ts`

**Interfaces:**
- Consumes: `MODULOS_OPCIONAIS`/`ModuloOpcional` (Task 1), `restaurantes.modulos` (Task 2), os ajudantes já existentes em `lib/admin/actions.ts` (`idsValidos`/`idSchema`, `recusa`, `falha`, `atualizarTelas`, `registrarNoHistorico`).
- Produces: `mudarModuloAction(restauranteId: string, modulo: ModuloOpcional, ligado: boolean): Promise<Resultado>`.

- [ ] **Step 1: Leia os ajudantes e o tipo do detalhe**

Leia em `lib/admin/actions.ts` os nomes exatos de `recusa`, `falha`, `atualizarTelas` e a validação de id usada por `mudarSituacaoAction`. Leia em `lib/admin/tipos.ts` o tipo `DetalheDoRestaurante`/`restaurante` e em `lib/admin/dados.ts` o `select` de `detalheDoRestaurante`.

- [ ] **Step 2: Teste da ação (falha)**

```ts
// tests/admin/mudar-modulo-action.test.ts
// Espelha o estilo de tests/admin das outras actions (mock de exigirAdmin,
// do cliente Supabase e de registrarNoHistorico). Verifica: só admin;
// liga adicionando "mentor" aos modulos; count !== 1 vira "não encontrado".
import { describe, expect, it, vi } from "vitest";
// ... (siga o setup de mocks de um teste de action já existente em tests/admin)

describe("mudarModuloAction", () => {
  it("liga o mentor: grava modulos com 'mentor' e confere a contagem", async () => {
    // exigirAdmin resolve; o update retorna count 1
    const r = await mudarModuloAction("11111111-1111-4111-8111-111111111111", "mentor", true);
    expect(r).toEqual({ ok: true });
  });
  it("id inválido é recusado", async () => {
    const r = await mudarModuloAction("nao-uuid", "mentor", true);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Rode e veja falhar**

Run: `node_modules/vitest/vitest.mjs run tests/admin/mudar-modulo-action.test.ts`
Expected: FAIL — `mudarModuloAction` não existe.

- [ ] **Step 4: Implemente a ação (espelhando `mudarSituacaoAction`)**

```ts
// lib/admin/actions.ts
import { MODULOS_OPCIONAIS, type ModuloOpcional } from "@/lib/painel/modulos";
// ...
export async function mudarModuloAction(
  restauranteId: string,
  modulo: ModuloOpcional,
  ligado: boolean
): Promise<Resultado> {
  await exigirAdmin();
  if (!idsValidos(restauranteId) || !MODULOS_OPCIONAIS.includes(modulo)) {
    return recusa("Pedido inválido.");
  }
  const supabase = await createClient();
  const atual = await supabase
    .from("restaurantes")
    .select("modulos")
    .eq("id", restauranteId)
    .maybeSingle();
  if (atual.error) return falha();
  if (!atual.data) return recusa(NAO_ENCONTRADO);

  const semModulo = (atual.data.modulos ?? []).filter((m) => m !== modulo);
  const modulos = ligado ? [...semModulo, modulo] : semModulo;

  const { count, error } = await supabase
    .from("restaurantes")
    .update({ modulos }, { count: "exact" })
    .eq("id", restauranteId);
  if (error) return falha();
  if (count !== 1) return recusa(NAO_ENCONTRADO);

  atualizarTelas();
  return { ok: true };
}
```

(Use os nomes exatos de `idsValidos`/`recusa`/`falha`/`atualizarTelas` que você leu no Step 1. V1 não registra no histórico — o enum de ações do histórico fica como está; anotar como melhoria futura.)

- [ ] **Step 5: Rode a ação e veja passar**

Run: `node_modules/vitest/vitest.mjs run tests/admin/mudar-modulo-action.test.ts`
Expected: PASS.

- [ ] **Step 6: Leve `modulos` ao detalhe do admin**

Em `lib/admin/dados.ts`, acrescente `modulos` ao `select` de `detalheDoRestaurante`; em `lib/admin/tipos.ts`, acrescente `modulos: string[]` ao `restaurante` do detalhe.

- [ ] **Step 7: Crie o cartão (celular e computador), espelhando `CartaoSituacao`**

```tsx
// components/admin/cartoes/cartao-modulos.tsx
"use client";

import { Cartao } from "@/components/admin/cartao";
import { Button } from "@/components/ui/button";
import { mudarModuloAction } from "@/lib/admin/actions";
import type { DetalheDoRestaurante } from "@/lib/admin/tipos";
import { useState, useTransition } from "react";
import { toast } from "sonner";

/** Cartão "Módulos": liga/desliga o Mentor de IA nesta casa. Não apaga conversa. */
export function CartaoModulos({ detalhe }: { detalhe: DetalheDoRestaurante }) {
  const { restaurante } = detalhe;
  const ligado = restaurante.modulos.includes("mentor");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function mudar() {
    setErro(null);
    iniciar(async () => {
      const r = await mudarModuloAction(restaurante.id, "mentor", !ligado);
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success(ligado ? "Mentor desligado." : "Mentor ligado.");
    });
  }

  return (
    <Cartao titulo="Módulos">
      <p className="text-sm">
        Mentor de IA:{" "}
        <strong>{ligado ? "ligado" : "desligado"}</strong>.{" "}
        {ligado
          ? "O dono vê a aba Mentor e pode conversar."
          : "O dono não vê a aba Mentor."}
      </p>
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="toque"
        className="w-full sm:w-fit md:h-9 md:text-sm"
        disabled={enviando}
        onClick={mudar}
      >
        {ligado ? "Desligar o Mentor" : "Ligar o Mentor"}
      </Button>
    </Cartao>
  );
}
```

- [ ] **Step 8: Inclua o cartão no detalhe**

Em `app/admin/restaurantes/[id]/page.tsx`, importe `CartaoModulos` e renderize `<CartaoModulos detalhe={detalhe} />` dentro do `DetalhePane` (perto do `CartaoSituacao`).

- [ ] **Step 9: Rode tudo que toca o admin + tipos + lint**

Run: `node_modules/vitest/vitest.mjs run tests/admin/mudar-modulo-action.test.ts`
Run: `npx tsc --noEmit`
Run: `node_modules/.bin/biome check components/admin/cartoes/cartao-modulos.tsx lib/admin/actions.ts`
Expected: tudo verde/limpo.

- [ ] **Step 10: Commit**

```bash
git add lib/admin/actions.ts lib/admin/dados.ts lib/admin/tipos.ts components/admin/cartoes/cartao-modulos.tsx app/admin/restaurantes/[id]/page.tsx tests/admin/mudar-modulo-action.test.ts
git commit -m "Liga e desliga o Mentor por casa no admin"
```

---

### Task 6: Decisão, docs e verificação final

**Files:**
- Modify: `docs/decisoes.md` (nova decisão), `SPEC.md` e/ou `README.md` (o mentor é módulo opcional, padrão desligado), `docs/operacao/mentor.md` (como ligar por casa)
- Test: nenhum novo (fecha com a verificação completa)

- [ ] **Step 1: Registre a decisão**

Em `docs/decisoes.md`, acrescente a próxima decisão livre (confira o último número): "Módulos por casa: o mentor é módulo **opcional**, padrão **desligado** para todas as casas; o admin liga por casa (a demo é a 1ª exceção). Protege o cliente real no nível grátis do Gemini (liga com a D-29/D-73)." Relacione com D-29 e D-73.

- [ ] **Step 2: Atualize a documentação**

- `SPEC.md`/`README.md`: onde descrevem o mentor, diga que é módulo opcional, ligado por casa no admin, padrão desligado.
- `docs/operacao/mentor.md`: uma seção curta "Ligar o mentor numa casa" (admin → casa → cartão Módulos).

- [ ] **Step 3: Verificação completa**

Run: `npx tsc --noEmit` → 0 erros
Run: `npm run check` → Biome limpo
Run: `node_modules/vitest/vitest.mjs run tests/painel/modulos.test.ts tests/painel/menu-painel.test.tsx tests/mentor/enviar-action.test.ts tests/mentor/mentor-page-guarda.test.tsx tests/admin/mudar-modulo-action.test.ts tests/isolamento/modulos-coluna.test.ts` → verde (Supabase local de pé para o de banco)
Run: `npm run build` → exit 0 (parar o dev server antes; o build conflita com o `.next` do dev)

- [ ] **Step 4: Commit**

```bash
git add docs/decisoes.md SPEC.md README.md docs/operacao/mentor.md
git commit -m "Registra a decisao dos modulos por casa e atualiza a documentacao"
```

---

## Depois do plano (fora dele): publicação

Com o gating pronto e verificado, retomamos a publicação do mentor (cada passo de produção com o ok do Lucas):
1. Merge `mentor-ia` → `main` (fast-forward) + `npm run build` final.
2. Migrações do mentor **e** a de `modulos` na nuvem: `supabase migration list --linked` (reconciliar) → `supabase db push --linked`.
3. `git push origin main` (dispara o deploy da Vercel).
4. No admin de produção, **ligar o Mentor na casa de demonstração** (exceção); o cliente real segue desligado.
5. Conferência ao vivo (o Lucas faz o login de produção).

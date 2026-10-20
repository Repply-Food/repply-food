# Etapa 6 — Ajustes e instalar no celular · Plano de execução

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `repositorio:subagent-driven-development` (recomendado) ou `repositorio:executing-plans` para implementar tarefa a tarefa. Os passos usam caixas `- [ ]`. **Responda sempre em português do Brasil.**

**Objetivo:** dar ao dono uma tela de Ajustes para mudar a meta do mês (mês a mês, inspirado no CRM), os turnos (corte almoço/jantar), a senha e o tema; e tornar o painel instalável no celular (PWA) com o guia "coloque na tela inicial".

**Arquitetura:** a meta e os turnos são gravados por **Server Actions** que usam o cliente Supabase da sessão (RLS garante o isolamento) e conferem a linha afetada; o `restaurante_id` vem sempre da sessão (`exigirCasa(slug)`), nunca do cliente. A tela de Ajustes (componente de servidor) lê os dados extras de `restaurantes` e as `metas` da casa e monta seções; as seções de meta e turnos são componentes de cliente. O PWA ganha um service worker mínimo (só a página "sem conexão") e um guia de instalação que aparece uma vez por aparelho, só no celular, fora do app instalado.

**Tech Stack:** Next.js 16.4 (App Router, RSC, Server Actions), React 19, TypeScript estrito, Tailwind 4, react-hook-form + Zod, next-themes, decimal.js, Vitest, Biome, Supabase (Postgres + RLS + RPC).

**Spec:** [`docs/superpowers/specs/2026-10-20-etapa-6-ajustes-e-instalar-design.md`](../specs/2026-10-20-etapa-6-ajustes-e-instalar-design.md) — o plano argumenta a partir do desenho; leia os dois.

## Global Constraints

- **Dinheiro:** valor da meta guardado em `numeric(12,2) > 0`; no TypeScript trafega como **string** numérica (ex.: `"30000.00"`) ou número só na borda de entrada; nunca perder precisão (usar `decimal.js`, como `lib/format/dinheiro.ts`). Divisão/ausência → a tela Hoje já trata; aqui, meta vazia = **remover** a linha do mês.
- **Isolamento (a armadilha mais cara):** o `restaurante_id` vem do servidor (`exigirCasa(slug)` → `casa.id`), **nunca** do cliente. Toda escrita passa pela RLS (cliente da sessão, não a chave de serviço). **Conferir a linha afetada:** zero linhas = erro, não sucesso. Teste de isolamento obrigatório (dono A não escreve na casa B; admin não escreve).
- **Modo admin (D-58):** quando `modoAdmin`, a tela **esconde** os botões de salvar de meta e turnos (não mostrar um botão que vai falhar), e as ações recusam o admin.
- **Guia "tela inicial" (D-36/D-39/D-40):** aparece **uma vez por aparelho** (marca no `localStorage`, com try/catch), **logo após o 1º login**, **só no celular** (`matchMedia("(min-width: 1024px)")` falso), **nunca no app já instalado** (`matchMedia("(display-mode: standalone)")` ou `navigator.standalone`) e **nunca no computador**. Sempre disponível em Ajustes (só no celular). No computador, Ajustes é em **duas colunas** e **sem** a seção "tela inicial".
- **PWA:** service worker **mínimo** — só serve a página "sem conexão" quando offline; **sem guardar dados** nem páginas do painel.
- **Turnos:** só o corte `almoco_ate` (`HH:MM`); o `atualizar_turnos` **substitui** o jsonb inteiro, então passar `{"almoco_ate":"HH:MM"}` completo. O horário de funcionamento é do admin (só leitura aqui, D-56).
- **Tema:** reaproveitar o `<SeletorTema/>` (next-themes, já existe); não criar mecanismo novo.
- **Senha:** manter o link para `/trocar-senha?voltar=...` (já funciona, D-65); não reimplementar.
- **Verificação antes de "feito":** tipos, lint, testes e build limpos; conferir no navegador em celular **e** computador, claro **e** escuro (a parte visual pode ir para a nuvem, como nas etapas 4a e 5).
- **Banco local:** as Tarefas com teste de banco (3) exigem o Supabase local de pé (Rancher/Docker). Religar antes: `rdctl start`, depois `npx supabase start` (sem `mailpit` no `-x`, ver `plano-mvp-respostas`/README) e reaplicar migrations se preciso.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/format/dinheiro.ts` *(modificar)* | acrescentar `analisarBRL(texto)`: texto pt-BR → string numérica canônica ou `null`. |
| `components/forms/campo-dinheiro.tsx` *(criar)* | entrada de dinheiro controlada (exibe formatado, devolve string numérica). |
| `lib/painel/ajustes-schemas.ts` *(criar)* | Zod `metaSchema`, `turnosSchema` + tipos. |
| `lib/painel/ajustes-actions.ts` *(criar)* | Server Actions `salvarMetaAction`, `salvarTurnosAction`. |
| `components/painel/ajustes/secao-meta.tsx` *(criar)* | navegação mês a mês, campo, "copiar do anterior", salvar, aviso de não salvo. |
| `components/painel/ajustes/secao-turnos.tsx` *(criar)* | campo "almoço até" + salvar. |
| `app/r/[slug]/ajustes/page.tsx` *(reescrever)* | lê dados extras + metas; monta as seções; duas colunas no computador; modo admin. |
| `lib/painel/guia-instalar.ts` *(criar)* | função pura `deveMostrarGuia(...)` e detecção de aparelho. |
| `components/painel/instalar/guia-instalar.tsx` *(criar)* | cartão do guia (iPhone/Android), dispensável, uma vez por aparelho. |
| `components/painel/instalar/atalho-instalar.tsx` *(criar)* | o atalho permanente em Ajustes (só celular). |
| `app/r/[slug]/hoje/page.tsx` *(modificar)* | encaixar o `<GuiaInstalar/>` no topo (celular, pós-login). |
| `public/sw.js` *(criar)* | service worker mínimo (fallback offline). |
| `app/offline/page.tsx` *(criar)* | página "sem conexão". |
| `components/pwa/registrar-sw.tsx` *(criar)* | registra o service worker no cliente. |
| `app/layout.tsx` *(modificar, se preciso)* | montar `<RegistrarSW/>` e confirmar o `<link rel="manifest">`. |

---

### Task 1: Entrada de dinheiro (parse + campo)

**Files:**
- Modify: `lib/format/dinheiro.ts`
- Create: `components/forms/campo-dinheiro.tsx`
- Test: `tests/format/dinheiro.test.ts` (criar ou acrescentar), `tests/forms/campo-dinheiro.test.tsx`

**Interfaces:**
- Produces: `analisarBRL(texto: string): string | null` — `"30.000,50"` / `"30000"` / `"R$ 30.000"` → `"30000.50"` / `"30000.00"` ... ; vazio ou inválido → `null`. `CampoDinheiro({ id?, value, onChange, disabled?, "aria-label"? })` com `value: string` (string numérica ou `""`) e `onChange(valor: string)`.

- [ ] **Passo 1: Teste de `analisarBRL`**

```ts
// tests/format/dinheiro.test.ts
import { analisarBRL, formatarBRL } from "@/lib/format/dinheiro";
import { describe, expect, it } from "vitest";

describe("analisarBRL", () => {
  it("lê número simples em reais", () => {
    expect(analisarBRL("30000")).toBe("30000.00");
  });
  it("lê com pontos de milhar e vírgula decimal", () => {
    expect(analisarBRL("30.000,50")).toBe("30000.50");
  });
  it("ignora o prefixo R$ e espaços", () => {
    expect(analisarBRL(" R$ 1.250,00 ")).toBe("1250.00");
  });
  it("aceita só vírgula decimal", () => {
    expect(analisarBRL("1250,5")).toBe("1250.50");
  });
  it("vazio vira null", () => {
    expect(analisarBRL("")).toBeNull();
    expect(analisarBRL("   ")).toBeNull();
  });
  it("texto inválido vira null", () => {
    expect(analisarBRL("abc")).toBeNull();
    expect(analisarBRL("1,2,3")).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar** — `npm run test -- tests/format/dinheiro.test.ts` → falha (`analisarBRL` não existe).

- [ ] **Passo 3: Implementar `analisarBRL`**

```ts
// lib/format/dinheiro.ts  (acrescentar ao fim, mantendo o resto)
/**
 * Texto pt-BR de dinheiro ("30.000,50", "R$ 1.250", "1250,5") para uma string
 * numérica canônica com 2 casas ("30000.50"). Vazio ou inválido → null.
 * Mantém a precisão por decimal.js (nunca Number direto no dinheiro).
 */
export function analisarBRL(texto: string): string | null {
  const limpo = texto.replace(/[R$\s.]/g, "").replace(",", ".").trim();
  if (limpo === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  try {
    return new Decimal(limpo).toFixed(2);
  } catch {
    return null;
  }
}
```

- [ ] **Passo 4: Rodar e ver passar** — `npm run test -- tests/format/dinheiro.test.ts` → PASS.

- [ ] **Passo 5: Teste do `CampoDinheiro`**

```tsx
// tests/forms/campo-dinheiro.test.tsx
import { CampoDinheiro } from "@/components/forms/campo-dinheiro";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

function Harness() {
  const [v, setV] = useState("");
  return (
    <>
      <CampoDinheiro aria-label="Meta" value={v} onChange={setV} />
      <output>{v}</output>
    </>
  );
}

describe("CampoDinheiro", () => {
  it("mostra o valor inicial formatado", () => {
    render(<CampoDinheiro aria-label="Meta" value="30000.00" onChange={() => {}} />);
    expect(screen.getByLabelText("Meta")).toHaveValue("30.000,00");
  });
  it("devolve a string numérica ao digitar", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Meta"), { target: { value: "1.250,50" } });
    expect(screen.getByText("1250.50")).toBeInTheDocument();
  });
  it("campo vazio devolve string vazia", () => {
    render(<Harness />);
    const campo = screen.getByLabelText("Meta");
    fireEvent.change(campo, { target: { value: "" } });
    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});
```

- [ ] **Passo 6: Rodar e ver falhar** — falha (componente não existe).

- [ ] **Passo 7: Implementar `CampoDinheiro`**

```tsx
// components/forms/campo-dinheiro.tsx
"use client";

import { Input } from "@/components/ui/input";
import { analisarBRL, formatarBRL } from "@/lib/format/dinheiro";
import { type ComponentProps, useEffect, useState } from "react";

type Props = Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  /** String numérica canônica ("30000.00") ou "" para vazio. */
  value: string;
  onChange: (valor: string) => void;
};

/**
 * Entrada de dinheiro em reais. Mostra "30.000,00" enquanto guarda a string
 * numérica ("30000.00"). Enquanto o campo está em foco, deixa o texto cru para
 * não brigar com quem digita; ao sair (blur) reexibe formatado.
 */
export function CampoDinheiro({ value, onChange, ...rest }: Props) {
  const [texto, setTexto] = useState(value ? formatarBRL(value).replace("R$ ", "") : "");
  const [focado, setFocado] = useState(false);

  // Quando o valor muda de fora (ex.: "copiar do mês anterior"), reexibe.
  useEffect(() => {
    if (!focado) setTexto(value ? formatarBRL(value).replace("R$ ", "") : "");
  }, [value, focado]);

  return (
    <Input
      inputMode="decimal"
      {...rest}
      value={texto}
      onFocus={() => setFocado(true)}
      onBlur={() => {
        setFocado(false);
        const n = analisarBRL(texto);
        setTexto(n ? formatarBRL(n).replace("R$ ", "") : "");
      }}
      onChange={(e) => {
        setTexto(e.target.value);
        onChange(analisarBRL(e.target.value) ?? "");
      }}
    />
  );
}
```

- [ ] **Passo 8: Rodar e ver passar.** Depois `npm run types` e `npm run lint`.

- [ ] **Passo 9: Commit** — `git add lib/format/dinheiro.ts components/forms/campo-dinheiro.tsx tests/format/dinheiro.test.ts tests/forms/campo-dinheiro.test.tsx && git commit -m "Acrescenta a entrada de dinheiro (parse + CampoDinheiro)"`

---

### Task 2: Esquemas e ações de Ajustes (meta e turnos)

**Files:**
- Create: `lib/painel/ajustes-schemas.ts`, `lib/painel/ajustes-actions.ts`
- Test: `tests/painel/ajustes-schemas.test.ts`

**Interfaces:**
- Consumes: `exigirCasa` (`lib/auth/sessao`), `createClient` (`lib/supabase/server`).
- Produces: `metaSchema`, `turnosSchema`; `salvarMetaAction(slug: string, mesISO: string, valor: string): Promise<Resultado>` (valor `""` remove o mês); `salvarTurnosAction(slug: string, almocoAte: string): Promise<Resultado>`. `type Resultado = { ok: true } | { ok: false; error: string }`.

- [ ] **Passo 1: Teste dos esquemas**

```ts
// tests/painel/ajustes-schemas.test.ts
import { metaSchema, turnosSchema } from "@/lib/painel/ajustes-schemas";
import { describe, expect, it } from "vitest";

describe("metaSchema", () => {
  it("aceita mês (dia 1) e valor > 0 ou vazio", () => {
    expect(metaSchema.safeParse({ mes: "2026-10-01", valor: "30000.00" }).success).toBe(true);
    expect(metaSchema.safeParse({ mes: "2026-10-01", valor: "" }).success).toBe(true);
  });
  it("recusa mês que não é dia 1", () => {
    expect(metaSchema.safeParse({ mes: "2026-10-15", valor: "1" }).success).toBe(false);
  });
  it("recusa valor <= 0", () => {
    expect(metaSchema.safeParse({ mes: "2026-10-01", valor: "0" }).success).toBe(false);
    expect(metaSchema.safeParse({ mes: "2026-10-01", valor: "-5" }).success).toBe(false);
  });
});

describe("turnosSchema", () => {
  it("aceita HH:MM", () => {
    expect(turnosSchema.safeParse({ almocoAte: "17:00" }).success).toBe(true);
  });
  it("recusa hora inválida", () => {
    expect(turnosSchema.safeParse({ almocoAte: "25:00" }).success).toBe(false);
    expect(turnosSchema.safeParse({ almocoAte: "17h" }).success).toBe(false);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar.**

- [ ] **Passo 3: Implementar os esquemas**

```ts
// lib/painel/ajustes-schemas.ts
import { z } from "zod";

const DIA_PRIMEIRO = /^\d{4}-\d{2}-01$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const metaSchema = z.object({
  mes: z.string().regex(DIA_PRIMEIRO, "Mês inválido."),
  // "" remove a meta do mês; qualquer valor presente é > 0.
  valor: z
    .string()
    .refine((v) => v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0), {
      message: "Informe um valor maior que zero.",
    }),
});
export type MetaInput = z.infer<typeof metaSchema>;

export const turnosSchema = z.object({
  almocoAte: z.string().regex(HORA, "Informe um horário válido (ex.: 17:00)."),
});
export type TurnosInput = z.infer<typeof turnosSchema>;
```

- [ ] **Passo 4: Rodar e ver passar.**

- [ ] **Passo 5: Implementar as ações** (sem teste unitário próprio aqui — o isolamento é testado na Task 3, contra o banco)

```ts
// lib/painel/ajustes-actions.ts
"use server";

import { exigirCasa } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { metaSchema, turnosSchema } from "./ajustes-schemas";

type Resultado = { ok: true } | { ok: false; error: string };

const ERRO_ADMIN = "Só o dono muda isto. A Repply vê em modo leitura.";
const ERRO_GENERICO = "Não deu para salvar agora. Tente de novo.";

export async function salvarMetaAction(
  slug: string,
  mesISO: string,
  valor: string
): Promise<Resultado> {
  const dados = metaSchema.safeParse({ mes: mesISO, valor });
  if (!dados.success)
    return { ok: false, error: dados.error.issues[0]?.message ?? ERRO_GENERICO };

  const { casa, modoAdmin } = await exigirCasa(slug);
  if (modoAdmin) return { ok: false, error: ERRO_ADMIN };

  const supabase = await createClient();

  if (dados.data.valor === "") {
    // Remover a meta do mês: volta a herdar o anterior na tela Hoje.
    const { error } = await supabase
      .from("metas")
      .delete()
      .eq("restaurante_id", casa.id)
      .eq("mes", dados.data.mes);
    if (error) {
      logError("falha_salvar_meta");
      return { ok: false, error: ERRO_GENERICO };
    }
    return { ok: true };
  }

  // Confere a LINHA afetada (armadilha "salvo quando a RLS recusou").
  const { data, error } = await supabase
    .from("metas")
    .upsert(
      { restaurante_id: casa.id, mes: dados.data.mes, valor: dados.data.valor },
      { onConflict: "restaurante_id,mes" }
    )
    .select("mes");
  if (error || !data || data.length === 0) {
    logError("falha_salvar_meta");
    return { ok: false, error: ERRO_GENERICO };
  }
  return { ok: true };
}

export async function salvarTurnosAction(
  slug: string,
  almocoAte: string
): Promise<Resultado> {
  const dados = turnosSchema.safeParse({ almocoAte });
  if (!dados.success)
    return { ok: false, error: dados.error.issues[0]?.message ?? ERRO_GENERICO };

  const { casa, modoAdmin } = await exigirCasa(slug);
  if (modoAdmin) return { ok: false, error: ERRO_ADMIN };

  const supabase = await createClient();
  // atualizar_turnos confere tem_acesso por dentro e SUBSTITUI o jsonb inteiro.
  const { error } = await supabase.rpc("atualizar_turnos", {
    p_restaurante_id: casa.id,
    p_turnos: { almoco_ate: dados.data.almocoAte },
  });
  if (error) {
    logError("falha_salvar_turnos");
    return { ok: false, error: ERRO_GENERICO };
  }
  return { ok: true };
}
```

- [ ] **Passo 6: tipos + lint.** (Se o `upsert`/`rpc` acusar tipo, conferir `types/database.types.ts` tem `metas` e `atualizar_turnos`; são da fundação.)

- [ ] **Passo 7: Commit** — `git add lib/painel/ajustes-schemas.ts lib/painel/ajustes-actions.ts tests/painel/ajustes-schemas.test.ts && git commit -m "Cria os esquemas e as ações de salvar meta e turnos"`

---

### Task 3: Isolamento de meta e turnos (teste de banco)

**Files:**
- Test: `tests/isolamento/metas-turnos.test.ts`

**Interfaces:**
- Consumes: o padrão dos testes de isolamento já existentes (`tests/isolamento/*.test.ts`, cliente `pg` contra o banco local; ver um arquivo vizinho para o helper de fixture — casas A e B, dono de A, admin).

> **Precisa do banco local de pé** (Rancher + `supabase start`). Este teste prova a regra mais cara: uma casa não escreve na outra, e o admin não escreve.

- [ ] **Passo 1: Escrever o teste** seguindo o helper de fixture do diretório `tests/isolamento/` (reusar o mesmo `setup`/`clientes` dos testes vizinhos; não inventar outro). Casos:

```ts
// tests/isolamento/metas-turnos.test.ts  (esqueleto — usar o helper existente do diretório)
// Pré-condição: fixture com casa A e casa B, um login dono de A, e o admin.
// Use o MESMO utilitário de conexão/role dos outros testes de isolamento.

// 1) o dono de A grava a meta de A (upsert) → 1 linha; lê de volta.
// 2) o dono de A NÃO grava a meta de B (RLS recusa: 0 linhas afetadas / erro).
// 3) o admin NÃO grava meta em nenhuma (política `and not eh_admin_repply()`).
// 4) o dono de A chama atualizar_turnos(A) → ok; atualizar_turnos(B) → "acesso negado" (42501).
// 5) remover a meta de A (delete) → 0 linhas em B permanecem intactas.
```

Escrever cada caso com asserções concretas sobre linhas afetadas/erro, no mesmo estilo dos vizinhos (ex.: `tests/isolamento/todas-as-tabelas.test.ts`).

- [ ] **Passo 2: Rodar** — `npm run test -- tests/isolamento/metas-turnos.test.ts`. Se o banco não estiver de pé, subir primeiro (ver Global Constraints). Esperado: passa (a RLS e a RPC já existem desde a fundação; este teste fixa o comportamento).

- [ ] **Passo 3: Commit** — `git add tests/isolamento/metas-turnos.test.ts && git commit -m "Testa o isolamento de meta e turnos"`

---

### Task 4: Seção de meta (mês a mês)

**Files:**
- Create: `components/painel/ajustes/secao-meta.tsx`
- Test: `tests/painel/secao-meta.test.tsx`

**Interfaces:**
- Consumes: `CampoDinheiro` (Task 1), `salvarMetaAction` (Task 2), `nomeDoMes` (`components/painel/hoje/formato.ts`).
- Produces: `SecaoMeta({ slug, fuso, mesAtualISO, metas, somenteLeitura })` onde `metas: { mes: string; valor: string }[]` (vindas do servidor, a string numérica de `valor`), `mesAtualISO: "YYYY-MM-01"`.

- [ ] **Passo 1: Teste** — navegação muda o mês; o campo mostra a meta do mês selecionado (vazio se não houver); "copiar do mês anterior" preenche com o anterior mais recente; mudar o valor e navegar sem salvar dispara o aviso; no modo `somenteLeitura` não há botão Salvar.

```tsx
// tests/painel/secao-meta.test.tsx
import { SecaoMeta } from "@/components/painel/ajustes/secao-meta";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/painel/ajustes-actions", () => ({
  salvarMetaAction: vi.fn(async () => ({ ok: true })),
}));

const base = {
  slug: "bar-do-ze",
  fuso: "America/Fortaleza",
  mesAtualISO: "2026-10-01",
  metas: [{ mes: "2026-10-01", valor: "30000.00" }, { mes: "2026-09-01", valor: "25000.00" }],
};

describe("SecaoMeta", () => {
  it("abre no mês atual com o valor do mês", () => {
    render(<SecaoMeta {...base} somenteLeitura={false} />);
    expect(screen.getByText(/outubro de 2026/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/meta de faturamento/i)).toHaveValue("30.000,00");
  });
  it("navega para novembro (sem meta) e mostra vazio", () => {
    render(<SecaoMeta {...base} somenteLeitura={false} />);
    fireEvent.click(screen.getByRole("button", { name: /próximo mês/i }));
    expect(screen.getByText(/novembro de 2026/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/meta de faturamento/i)).toHaveValue("");
  });
  it("no modo leitura não mostra salvar", () => {
    render(<SecaoMeta {...base} somenteLeitura={true} />);
    expect(screen.queryByRole("button", { name: /salvar/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar.**

- [ ] **Passo 3: Implementar `SecaoMeta`** — componente de cliente. Estado: `mesSelecionado` (ISO), `valor` (string numérica do campo), `sujo` (mudou sem salvar). Navegação `‹ ›` move um mês (recomputar ISO). Ao trocar de mês com `sujo`, `window.confirm("Você mudou a meta e não salvou. Descartar?")` — se não, não troca. "Copiar do mês anterior" acha em `metas` o mês mais recente `< mesSelecionado` e põe o valor. Salvar: `useTransition` + `salvarMetaAction(slug, mesSelecionado, valor)`, `toast` (sonner) no sucesso/erro, e marca `sujo=false`; recarrega com `router.refresh()`. Botão travado por `useHidratado()`. Rótulos: título `Meta de ${nomeDoMes(dataDoISO, fuso)} de ${ano}` (ou computar o nome do mês a partir do ISO sem fuso, já que o mês é uma data civil — usar um `MESES[n]` local, como em `formato.ts`). Botões com `aria-label` "mês anterior"/"próximo mês". Esconder Salvar e "copiar" quando `somenteLeitura`.

(Escrever o componente completo seguindo os padrões: `"use client"`, `useTransition`, `toast` de `sonner`, `Button`/`Input` do design, `useHidratado`.)

- [ ] **Passo 4: Rodar e ver passar.** tipos + lint.

- [ ] **Passo 5: Commit** — `git add components/painel/ajustes/secao-meta.tsx tests/painel/secao-meta.test.tsx && git commit -m "Cria a seção de meta mês a mês em Ajustes"`

---

### Task 5: Seção de turnos

**Files:**
- Create: `components/painel/ajustes/secao-turnos.tsx`
- Test: `tests/painel/secao-turnos.test.tsx`

**Interfaces:**
- Consumes: `salvarTurnosAction` (Task 2).
- Produces: `SecaoTurnos({ slug, almocoAteInicial, somenteLeitura })`.

- [ ] **Passo 1: Teste** — mostra o valor inicial num campo de hora; salvar chama a ação; no modo leitura não há Salvar.

```tsx
// tests/painel/secao-turnos.test.tsx
import { SecaoTurnos } from "@/components/painel/ajustes/secao-turnos";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/painel/ajustes-actions", () => ({
  salvarTurnosAction: vi.fn(async () => ({ ok: true })),
}));

describe("SecaoTurnos", () => {
  it("mostra o corte atual", () => {
    render(<SecaoTurnos slug="bar-do-ze" almocoAteInicial="17:00" somenteLeitura={false} />);
    expect(screen.getByLabelText(/almoço até/i)).toHaveValue("17:00");
  });
  it("no modo leitura não mostra salvar", () => {
    render(<SecaoTurnos slug="bar-do-ze" almocoAteInicial="17:00" somenteLeitura={true} />);
    expect(screen.queryByRole("button", { name: /salvar/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar.**

- [ ] **Passo 3: Implementar `SecaoTurnos`** — `"use client"`, um `<input type="time">` (ou `Input` com `type="time"`) controlado, texto de ajuda "antes desse horário conta como almoço; depois, como jantar. Usado na tela Resultados.", Salvar com `useTransition` + `salvarTurnosAction(slug, valor)` + `toast`, botão por `useHidratado`, escondido no modo leitura.

- [ ] **Passo 4: Rodar e ver passar.** tipos + lint.

- [ ] **Passo 5: Commit** — `git add components/painel/ajustes/secao-turnos.tsx tests/painel/secao-turnos.test.tsx && git commit -m "Cria a seção de turnos em Ajustes"`

---

### Task 6: Montar a página de Ajustes

**Files:**
- Modify: `app/r/[slug]/ajustes/page.tsx`
- Test: `tests/painel/ajustes-page.test.tsx` (ou um teste de estrutura; se a página for difícil de renderizar isolada por causa do Supabase, testar via os componentes e deixar a montagem para a conferência no navegador — decidir ao implementar, preferindo um teste leve da estrutura/ordem das seções com os dados mockados).

**Interfaces:**
- Consumes: `exigirCasa`, `createClient`, `SecaoMeta` (Task 4), `SecaoTurnos` (Task 5), `SeletorTema`, `WHATSAPP_REPPLY`, `sairAction`, `emailsDosLoginsDaCasa`, `nomeDoMes`/`MESES`. (A seção "Colocar na tela inicial" entra na Task 8.)

- [ ] **Passo 1:** Ler `restaurantes` (cnpj, hora_virada, horario_funcionamento, turnos) por `casa.id` e `metas` (mes, valor) da casa, pela sessão (RLS):

```ts
const supabase = await createClient();
const [{ data: dados }, { data: metas }] = await Promise.all([
  supabase.from("restaurantes")
    .select("cnpj, hora_virada, horario_funcionamento, turnos")
    .eq("id", casa.id).maybeSingle(),
  supabase.from("metas").select("mes, valor").eq("restaurante_id", casa.id)
    .order("mes", { ascending: false }),
]);
```

- [ ] **Passo 2:** Calcular o mês atual no fuso da casa (`mesAtualISO = "YYYY-MM-01"`), reutilizando `partesNoFuso`/`Intl` como em `formato.ts` (um helper local `mesAtualNoFuso(agora, fuso)` é aceitável). Converter `metas` para `{ mes, valor: valor.toString() }` (o `valor` vem `numeric` → string).

- [ ] **Passo 3:** Montar o JSX. No computador, **duas colunas** (`md:grid md:grid-cols-2 md:gap-6`, seguindo o Tailwind do projeto); no celular, empilhado. Ordem no celular: Meta, Turnos, Sua conta (e-mail, Trocar senha, Tema, Sair), Dados da casa (só leitura, com aviso "muda com a Repply"), Falar com a Repply. (A seção **Colocar na tela inicial** — `<AtalhoInstalar/>`, que se esconde sozinho no computador e no app instalado, D-40 — é encaixada na Task 8, entre os "Dados da casa" e o "Falar com a Repply".) Passar `somenteLeitura={modoAdmin}` às seções de meta e turnos. Manter o bloco admin (D-58) como hoje.

- [ ] **Passo 4:** Teste leve de estrutura (ordem das seções; modo admin esconde salvar — já coberto nas seções) e `npm run test`, `npm run types`, `npm run lint`.

- [ ] **Passo 5: Commit** — `git add app/r/[slug]/ajustes/page.tsx tests/painel/ajustes-page.test.tsx && git commit -m "Monta a tela de Ajustes com meta, turnos e dados da casa"`

---

### Task 7: PWA — service worker e página "sem conexão"

**Files:**
- Create: `public/sw.js`, `app/offline/page.tsx`, `components/pwa/registrar-sw.tsx`
- Modify: `app/layout.tsx` (montar `<RegistrarSW/>`; confirmar `<link rel="manifest">`)
- Test: `tests/pwa/registrar-sw.test.tsx`

**Interfaces:**
- Produces: `RegistrarSW()` (componente de cliente que registra `/sw.js`).

- [ ] **Passo 1:** `public/sw.js` — mínimo, sem cache de dados:

```js
// public/sw.js — service worker MÍNIMO (D: sem guardar dados).
// Única função: quando a navegação falhar (offline), servir /offline.
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open("rf-offline-v1").then((c) => c.add("/offline")));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return; // só navegação; nada de dados
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match("/offline").then((r) => r ?? new Response("Sem conexão", { status: 503 }))
    )
  );
});
```

- [ ] **Passo 2:** `app/offline/page.tsx` — página simples "Sem conexão · tente de novo quando a internet voltar", com a marca; `export const metadata = { title: "Sem conexão · repply food." }`.

- [ ] **Passo 3:** Teste do `RegistrarSW` (registra quando há `serviceWorker`; não quebra quando não há):

```tsx
// tests/pwa/registrar-sw.test.tsx
import { RegistrarSW } from "@/components/pwa/registrar-sw";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("RegistrarSW", () => {
  it("registra /sw.js quando há suporte", async () => {
    const register = vi.fn(async () => ({}));
    vi.stubGlobal("navigator", { serviceWorker: { register } });
    render(<RegistrarSW />);
    await Promise.resolve();
    expect(register).toHaveBeenCalledWith("/sw.js");
  });
  it("não quebra sem suporte", () => {
    vi.stubGlobal("navigator", {});
    expect(() => render(<RegistrarSW />)).not.toThrow();
  });
});
```

- [ ] **Passo 4:** Implementar `RegistrarSW` (`"use client"`, `useEffect` que confere `"serviceWorker" in navigator` e chama `navigator.serviceWorker.register("/sw.js")`, com try/catch). Montar no `app/layout.tsx`. Confirmar o `<link rel="manifest">` (a convenção `app/manifest.webmanifest` já injeta; se não, declarar `metadata.manifest`).

- [ ] **Passo 5:** Rodar testes; tipos; lint; `npm run build` (o SW é estático em `public/`; o build não deve reclamar).

- [ ] **Passo 6: Commit** — `git add public/sw.js app/offline/page.tsx components/pwa/registrar-sw.tsx app/layout.tsx tests/pwa/registrar-sw.test.tsx && git commit -m "Adiciona o PWA: service worker mínimo e página sem conexão"`

---

### Task 8: Lógica do guia e atalho de Ajustes

**Files:**
- Create: `lib/painel/guia-instalar.ts`, `components/painel/instalar/atalho-instalar.tsx`
- Modify: `app/r/[slug]/ajustes/page.tsx` (encaixar `<AtalhoInstalar/>`)
- Test: `tests/painel/guia-instalar.test.ts`

**Interfaces:**
- Produces: `deveMostrarGuia({ eCelular, appInstalado, jaViu }): boolean`; `detectar(): { eCelular: boolean; appInstalado: boolean; ehIOS: boolean }` (lê `matchMedia`/`navigator`, com guardas); `MARCA_GUIA_VISTO` (chave do localStorage); `AtalhoInstalar({ })` (o atalho permanente em Ajustes — só celular).

- [ ] **Passo 1: Teste da função pura**

```ts
// tests/painel/guia-instalar.test.ts
import { deveMostrarGuia } from "@/lib/painel/guia-instalar";
import { describe, expect, it } from "vitest";

describe("deveMostrarGuia", () => {
  it("mostra no celular, fora do app, não visto", () => {
    expect(deveMostrarGuia({ eCelular: true, appInstalado: false, jaViu: false })).toBe(true);
  });
  it("NÃO mostra no computador", () => {
    expect(deveMostrarGuia({ eCelular: false, appInstalado: false, jaViu: false })).toBe(false);
  });
  it("NÃO mostra dentro do app instalado", () => {
    expect(deveMostrarGuia({ eCelular: true, appInstalado: true, jaViu: false })).toBe(false);
  });
  it("NÃO mostra se já visto neste aparelho", () => {
    expect(deveMostrarGuia({ eCelular: true, appInstalado: false, jaViu: true })).toBe(false);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar.**

- [ ] **Passo 3: Implementar `guia-instalar.ts`**

```ts
// lib/painel/guia-instalar.ts
export const MARCA_GUIA_VISTO = "rf-guia-tela-inicial-visto";

export function deveMostrarGuia(e: {
  eCelular: boolean;
  appInstalado: boolean;
  jaViu: boolean;
}): boolean {
  return e.eCelular && !e.appInstalado && !e.jaViu;
}

/** Lê o ambiente do navegador, com guardas (SSR / aba privada). */
export function detectar(): { eCelular: boolean; appInstalado: boolean; ehIOS: boolean } {
  if (typeof window === "undefined")
    return { eCelular: false, appInstalado: false, ehIOS: false };
  const eCelular = !window.matchMedia("(min-width: 1024px)").matches;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return { eCelular, appInstalado: standalone, ehIOS };
}

export function jaViuGuia(): boolean {
  try {
    return localStorage.getItem(MARCA_GUIA_VISTO) === "1";
  } catch {
    return false;
  }
}

export function marcarGuiaVisto(): void {
  try {
    localStorage.setItem(MARCA_GUIA_VISTO, "1");
  } catch {}
}
```

- [ ] **Passo 4: Rodar e ver passar.**

- [ ] **Passo 5:** Implementar `AtalhoInstalar` — `"use client"`; usa `detectar()`; se não for celular, **não renderiza nada** (D-40: some no computador); se for celular, mostra um botão "Colocar na tela inicial" que abre o mesmo conteúdo do guia (iPhone pelo Compartilhar / Android pelo "Instalar"). Pode compartilhar o corpo com o `GuiaInstalar` da Task 9 (extrair um `ConteudoInstalar` reutilizável). Teste leve: no computador não renderiza (mock de `matchMedia`).

- [ ] **Passo 6:** Encaixar `<AtalhoInstalar/>` na página de Ajustes (`app/r/[slug]/ajustes/page.tsx`), entre os "Dados da casa" e o "Falar com a Repply". Como o `AtalhoInstalar` já se esconde sozinho no computador e no app instalado, a própria regra D-40 fica garantida por ele. Rodar testes/tipos/lint.

- [ ] **Passo 7: Commit** — `git add lib/painel/guia-instalar.ts components/painel/instalar/atalho-instalar.tsx app/r/[slug]/ajustes/page.tsx tests/painel/guia-instalar.test.ts && git commit -m "Cria a lógica do guia de instalar e o atalho de Ajustes"`

---

### Task 9: Cartão do guia pós-login (na tela Hoje)

**Files:**
- Create: `components/painel/instalar/guia-instalar.tsx`
- Modify: `app/r/[slug]/hoje/page.tsx` (encaixar `<GuiaInstalar/>` no topo)
- Test: `tests/painel/guia-instalar-cartao.test.tsx`

**Interfaces:**
- Consumes: `deveMostrarGuia`, `detectar`, `jaViuGuia`, `marcarGuiaVisto` (Task 8).
- Produces: `GuiaInstalar()` — cartão dispensável; some conforme as regras.

- [ ] **Passo 1: Teste** — monta e, com `matchMedia` de celular + sem marca, aparece o cartão; "Dispensar"/instalar grava a marca e some; com a marca já posta, não aparece. (Mockar `matchMedia`/`localStorage`.)

- [ ] **Passo 2: Rodar e ver falhar.**

- [ ] **Passo 3: Implementar `GuiaInstalar`** — `"use client"`; no `useEffect` (cliente), calcula `detectar()` + `jaViuGuia()` e decide por `deveMostrarGuia`; guarda num estado `visivel`. Renderiza `null` até decidir (evita piscar no SSR/computador). Conteúdo reconhece iPhone (passo a passo pelo Compartilhar → "Adicionar à Tela de Início") × Android (botão "Instalar" via `beforeinstallprompt`; se o evento não veio, passo manual ⋮ → "Adicionar à tela inicial"). Botões "Instalar/Entendi" e "Agora não" chamam `marcarGuiaVisto()` e escondem. Cartão dispensável com a marca do app.

- [ ] **Passo 4:** Encaixar `<GuiaInstalar/>` no topo de `app/r/[slug]/hoje/page.tsx` (ele próprio se esconde no computador/app/visto). Rodar testes; tipos; lint.

- [ ] **Passo 5: Commit** — `git add components/painel/instalar/guia-instalar.tsx app/r/[slug]/hoje/page.tsx tests/painel/guia-instalar-cartao.test.tsx && git commit -m "Mostra o guia de instalar uma vez por aparelho na tela Hoje"`

---

### Task 10: Documentação e fechamento

**Files:**
- Modify: `README.md` (roteiro: etapa 6), `SPEC.md` (checklist), `docs/decisoes.md` (se surgir decisão nova), `docs/divida-tecnica.md` (itens novos), o plano (registro da execução).

- [ ] **Passo 1:** Suíte completa (`npm run test`), `npm run types`, `npm run lint`, `npm run build` — tudo verde.
- [ ] **Passo 2:** Revisão final do conjunto (opus), via `repositorio:requesting-code-review` / o revisor final do subagent-driven. Consertar Crítico/Importante.
- [ ] **Passo 3:** Atualizar `README.md` (etapa 6 feita/no estado certo) e o checklist do `SPEC.md`; registrar dívidas novas em `docs/divida-tecnica.md`; marcar as caixas deste plano e escrever o "Registro da execução".
- [ ] **Passo 4:** Conferência no navegador (celular e computador, claro e escuro) — pode ir para a nuvem, como combinado.
- [ ] **Passo 5:** Commit da documentação + **pedir o ok do Lucas Ferreira** para enviar ao GitHub (um `git push` por vez). Nada publica na nuvem sem autorização. (Esta etapa provavelmente **não tem migration nova**; se tiver, republicar na nuvem é passo à parte, com autorização e reconciliação, como na etapa 5.)

---

## Critérios de aceite da etapa 6

- [ ] A meta é editável mês a mês (setas ‹ ›), com "copiar do mês anterior", salvar explícito e aviso de não salvo; grava pelo servidor, com isolamento por RLS e conferência da linha afetada; valor vazio remove o mês.
- [ ] Os turnos (`almoco_ate`) são editáveis pelo dono via `atualizar_turnos`; o horário de funcionamento continua só leitura (D-56).
- [ ] Senha (link que já existe) e tema (`SeletorTema`) reaproveitados; dados da casa só leitura com aviso.
- [ ] Modo admin (D-58) esconde os salvares e as ações recusam o admin.
- [ ] PWA: service worker mínimo (só "sem conexão", sem guardar dados); instalável.
- [ ] Guia "tela inicial": uma vez por aparelho, logo após o 1º login, só no celular, nunca no app instalado nem no computador (D-36/D-39/D-40); sempre disponível em Ajustes (celular); no computador, Ajustes em duas colunas e sem a seção.
- [ ] Testes de isolamento e de comportamento passam; tipos, lint, build limpos; conferência em celular e computador, claro e escuro.

---

## Registro da execução

*(preencher na execução: commits por tarefa, consertos, desvios aceitos, decisões do controlador, conferência no navegador)*

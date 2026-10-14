# Etapa 2 · Entrar e moldura do painel · Plano de implementação

> **Para agentes de execução:** É OBRIGATÓRIO usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para rastreamento.

**Objetivo:** O dono entra com e-mail e senha, troca a senha provisória no primeiro acesso, recupera a senha por e-mail e cai no painel da casa dele, com a moldura de celular e de computador e o selo do vigia. Ainda sem números.

**Arquitetura:** Login por funções do servidor (Server Actions) com o Supabase Auth; um "porteiro" (`proxy.ts`, o middleware do Next 16) renova a sessão e decide o destino por uma função pura; guardas por casa nos layouts (cache por requisição). Componentes de formulário copiados do Repply Imob (versão consertada pela auditoria de segurança dele) sobre os tokens do Food, ligados por uma ponte `@theme inline`. Moldura própria: barra lateral escura no computador e menu de baixo no celular.

**Stack:** Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript estrito, Tailwind 4, `@base-ui/react`, `react-hook-form` + `@hookform/resolvers` + zod 4, `@supabase/ssr` 0.10, `next-themes`, `sonner`, `lucide-react`, Vitest + Testing Library, Biome.

**Desenho aprovado:** [`docs/superpowers/specs/2026-10-14-etapa-2-entrar-e-moldura-design.md`](../specs/2026-10-14-etapa-2-entrar-e-moldura-design.md). Telas: [`docs/telas/primeiro-acesso.html`](../../telas/primeiro-acesso.html), [`hoje.html`](../../telas/hoje.html), [`ajustes.html`](../../telas/ajustes.html).

## Restrições Globais

- **Idioma:** tudo em português do Brasil; domínio em português. Termos técnicos genéricos podem ficar em inglês (`proxy`, `ThemeProvider`).
- **Nuvem: proibido nesta etapa.** Nada de `supabase db push`, `--linked`, `functions deploy`, `secrets set`, `config push`, Vercel ou DNS.
- **`git push`: só com o ok do Lucas Ferreira, pedido a cada envio.** Commits locais são livres.
- **Git:** `git fetch` antes de começar e antes de cada commit. Nunca `git add -A`, `--force`, `--no-verify`. Mensagens em PT-BR, no imperativo, com o trailer `Co-Authored-By` que a ferramenta indicar para o modelo que executa.
- **Banco local:** nunca `supabase db reset`, `stop` ou `start` por conta própria (só o controlador, na Tarefa 0). Esta etapa não cria migration.
- **Segurança:** a decisão de acesso mora na função do servidor, nunca só na página (toda função de `"use server"` é chamável por POST). `restaurante_id` nunca vem do navegador. Erro do Supabase nunca vai cru para a tela. Só o servidor escreve `app_metadata`.
- **Sair:** `signOut({ scope: "local" })` (o login é compartilhado entre aparelhos, D-10). Trocar a senha: `signOut({ scope: "others" })`.
- **TypeScript:** nunca `any`. Tipos do banco só por `npm run types`.
- **Interface:** celular primeiro, computador sempre funcionando (D-39). Cor nunca é o único canal. Texto sobre laranja é quase-preto. O tomate só no símbolo (D-42). Alvos de toque de pelo menos 44 px no celular.
- **Componentes copiados do Imob:** copiar da branch consertada `D:\lucas\Documents\2- REPPLY HUB\Projetos\Repply Imob\.claude\worktrees\repply-imob-security-audit-6f6603\` (chamada de `IMOB_WT` abaixo), nunca da `main` do Imob. Nunca rodar `npx shadcn add`.
- **Formatação:** depois de criar ou editar `.ts`/`.tsx`/`.mjs`/`.json`/`.css`, rode `npx biome check --write <arquivos>`.
- **Heredoc do Bash come barra invertida nesta máquina:** escreva arquivos com a ferramenta de escrita/edição.
- **Verificação antes de dizer "feito":** `npx tsc --noEmit`, `npm run check`, `npm run test`, `npm run build`.

## Ordem e paralelismo

```
Tarefa 0 (controlador) → Tarefa 1 → [Tarefa 2 ‖ Tarefa 3] → [Tarefa 4 ‖ Tarefa 5] → Tarefa 6 (controlador)
```

As tarefas entre colchetes rodam **ao mesmo tempo**, na mesma pasta, porque mexem em arquivos diferentes (a lista de cada uma é fechada). Regras para quem roda em paralelo:
- mexa **só** nos arquivos da sua tarefa; não toque em `package.json`, `package-lock.json` nem em `app/layout.tsx` (a Tarefa 1 e a 2 já cuidam deles);
- rode os testes **focados** da sua tarefa e `npx biome check` **nos seus arquivos**; `npx tsc --noEmit` pode mostrar erro em arquivo da outra frente que está pela metade: se o erro for só lá, anote no relatório e siga;
- no commit, liste só os seus arquivos; se o git disser que o índice está travado (`index.lock`), espere uns segundos e tente de novo;
- a verificação completa (tipos, lint, suíte, build) roda no fim de cada par, pelo controlador.

## Mapa de arquivos

| Arquivo | Tarefa | Responsabilidade |
|---|---|---|
| `supabase/config.toml`, `supabase/templates/recuperar-senha.html` | 0 | Endereços de retorno e modelo do e-mail de senha nova |
| `package.json`, `package-lock.json`, `supabase/functions/receber-envio/deno.json`, `lib/supabase/server.ts`, `app/layout.tsx` (fontes) | 1 | Bibliotecas alinhadas ao Imob; pesos das fontes |
| `app/globals.css`, `app/styles/tokens.css`, `tests/design-tokens.test.ts` | 2 | Ponte de tokens, variante `dark:`, `--danger-text` |
| `app/layout.tsx` (tema e avisos) | 2 | `ThemeProvider` e `Toaster` |
| `lib/utils.ts`, `components/ui/*`, `components/forms/form-field.tsx`, `components/providers/theme-provider.tsx` | 2 | Componentes copiados do Imob |
| `public/marca/*.svg`, `components/marca/logo.tsx` | 2 | Marca |
| `lib/contato.ts` | 2 | WhatsApp da Repply |
| `lib/painel/selo.ts`, `components/painel/{moldura-painel,menu-painel,selo-dados,seletor-tema,estado-vazio}.tsx` | 2 | Moldura, selo e tema |
| `tests/painel/*` | 2 | Testes do selo e do menu |
| `lib/auth/{rotas,destino,schemas,erros,cookie-recuperacao,safe-next,nucleo,sessao,actions}.ts`, `lib/supabase/proxy.ts`, `proxy.ts` | 3 | Regras do login |
| `app/auth/confirmar/route.ts` | 3 | Retorno do link do e-mail |
| `scripts/acesso-local.ts` (+ script no `package.json`, exceção combinada) | 3 | Conta de teste local |
| `lib/auth/guards.ts` | 3 | Apagado (era só um esboço) |
| `tests/auth/*`, `tests/helpers/chaves-locais.ts` | 3 | Testes do login |
| `app/page.tsx`, `app/(entrada)/**`, `app/admin/page.tsx` | 4 | Telas de entrar, senha, escolha da casa, acesso pendente, admin provisório |
| `app/r/[slug]/**` | 5 | Painel: Hoje, Resultados e Ajustes (conta) |
| `docs/**`, `README.md`, `CLAUDE.md`, `.claude/launch.json` (fora do repositório) | 6 | Decisões, documentação, conferência visual |

---

## Tarefa 0: Preparação (controlador)

**Arquivos:** `supabase/config.toml`, `supabase/templates/recuperar-senha.html`, este plano e o desenho.

- [x] **Passo 1: Conferir o repositório**

```bash
git fetch --all --prune && git status -sb && git log --oneline -3 origin/main
```

Esperado: sem `[behind]`. Commits novos de outra pessoa: ler antes de seguir.

- [x] **Passo 2: Liberar os endereços de retorno do e-mail no login local**

Em `supabase/config.toml`, seção `[auth]`, troque a linha `additional_redirect_urls = ["https://127.0.0.1:3000"]` por:

```toml
# repply food.: o link do e-mail "esqueci a senha" volta para /auth/confirmar.
# O painel pode ser aberto por 127.0.0.1 ou por localhost no desenvolvimento.
additional_redirect_urls = ["https://127.0.0.1:3000", "http://127.0.0.1:3000/**", "http://localhost:3000/**"]
```

- [x] **Passo 2b: E-mail de senha nova que funciona em qualquer aparelho**

O link padrão do Supabase usa um código que só vale no MESMO navegador que pediu (PKCE): quem pede no computador e abre o e-mail no celular cairia em "link inválido". O modelo abaixo manda o `token_hash`, que `/auth/confirmar` já aceita em qualquer aparelho (padrão do Imob consertado).

Crie `supabase/templates/recuperar-senha.html`:

```html
<h2>Crie sua senha nova</h2>
<p>Recebemos um pedido para criar uma senha nova no repply food.</p>
<p>
  <a href="{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=recovery&next=/nova-senha">Criar minha senha nova</a>
</p>
<p>O link vale por 1 hora. Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
```

Em `supabase/config.toml`, logo depois do bloco comentado `# [auth.email.template.invite]` (e antes do comentário `# Uncomment to customize notification email template`), acrescente:

```toml
# repply food.: o link usa token_hash para funcionar mesmo abrindo o e-mail em
# outro aparelho. O mesmo modelo vai para a nuvem na publicação (etapa 4).
[auth.email.template.recovery]
subject = "Crie sua senha nova · repply food."
content_path = "./supabase/templates/recuperar-senha.html"
```

(O cabeçalho de tabela precisa ficar onde a linha seguinte já é comentário ou outra tabela: no meio das chaves de `[auth.email]` ele as roubaria.)

- [x] **Passo 3: Reiniciar o banco local com a caixa de e-mail (Mailpit)**

A configuração de login só é lida na subida, e o Mailpit (caixa de e-mail de mentira) precisa subir junto agora.

```bash
npx supabase stop
SUPABASE_DB_HEALTH_TIMEOUT=10m npx supabase start -x studio,logflare,vector,storage-api,imgproxy,realtime,postgres-meta
```

Se o Docker não responder: `MSYS_NO_PATHCONV=1 wsl.exe -d rancher-desktop --exec /usr/local/bin/wsl-service docker restart` (README, caixa do HD). Depois, em segundo plano: `npx supabase functions serve receber-envio`. Confira: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:54321/functions/v1/receber-envio` dá `405` e `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:54324` dá `200` (Mailpit).

- [x] **Passo 4: Rodar a suíte para garantir o ponto de partida**

`npx vitest run` → esperado: 20 arquivos, 351 testes passando.

- [x] **Passo 5: Commits**

O desenho e este plano já foram commitados antes da aprovação. Aqui entra só a configuração:

```bash
git add supabase/config.toml supabase/templates/recuperar-senha.html
git commit -m "Libera o retorno do e-mail de senha no login local e usa link que vale em outro aparelho" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 1: Bibliotecas alinhadas ao Imob e pesos das fontes

**Por quê:** os componentes de formulário do Imob usam zod 4, `@hookform/resolvers` 5, `@base-ui/react` 1.5, `next-themes` e `sonner`; o Food está uma geração atrás (dívida item 13). E o layout carrega só o peso regular das fontes, então título e botão saem sem negrito de verdade.

**Arquivos:**
- Modificar: `package.json`, `package-lock.json`, `supabase/functions/receber-envio/deno.json`, `lib/supabase/server.ts`, `app/layout.tsx`
- Talvez modificar (só se o zod 4 exigir): `supabase/functions/_shared/recepcao.ts`

**Interfaces:** Produz as bibliotecas que as Tarefas 2 a 5 usam. Nenhuma outra tarefa mexe no `package.json` (a 3 só acrescenta uma linha de script, combinado).

- [x] **Passo 1: Instalar as versões do Imob**

```bash
npm i @supabase/ssr@^0.10.3 @supabase/supabase-js@^2.106.1 zod@^4.4.3 react-hook-form@^7.76.1 @hookform/resolvers@^5.4.0 @base-ui/react@^1.5.0 recharts@^3.8.0 lucide-react@^1.16.0 next-themes@^0.4.6 sonner@^2.0.7 class-variance-authority@^0.7.1 tailwind-merge@^3.6.0 clsx@^2.1.1 tw-animate-css@^1.4.0 shadcn@^4.8.0
```

Confira com `git diff package.json` que só mudaram essas linhas (e que `supabase` continua fixo em `2.120.0` nas devDependencies).

- [x] **Passo 2: Mesma versão de zod e do supabase-js na função de recepção**

O schema do envelope (`supabase/functions/_shared/recepcao.ts`) é o mesmo arquivo no Node e no Deno; as duas pontas precisam da mesma versão. Em `supabase/functions/receber-envio/deno.json`:

```json
{
  "imports": {
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2.106.1",
    "zod": "npm:zod@4.4.3"
  }
}
```

Se `npm ls zod @supabase/supabase-js` mostrar versões instaladas diferentes de `4.4.3` e `2.106.1`, use as instaladas nos dois lugares.

- [x] **Passo 3: Cliente do servidor com os tipos da nova `@supabase/ssr`**

Substitua `lib/supabase/server.ts` por:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "../../types/database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Chamado num Server Component (que não grava cookie): o proxy renova a sessão.
          }
        },
      },
    }
  );
}
```

- [x] **Passo 4: Carregar os pesos das fontes**

Em `app/layout.tsx`, troque as três chamadas `localFont` por:

```tsx
const generalSans = localFont({
  src: [
    { path: "../identidade-visual/fontes/general-sans/GeneralSans-Regular.otf", weight: "400" },
    { path: "../identidade-visual/fontes/general-sans/GeneralSans-Medium.otf", weight: "500" },
    { path: "../identidade-visual/fontes/general-sans/GeneralSans-Semibold.otf", weight: "600" },
    { path: "../identidade-visual/fontes/general-sans/GeneralSans-Bold.otf", weight: "700" },
  ],
  variable: "--font-local-display",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const satoshi = localFont({
  src: [
    { path: "../identidade-visual/fontes/satoshi/Satoshi-Regular.otf", weight: "400" },
    { path: "../identidade-visual/fontes/satoshi/Satoshi-Medium.otf", weight: "500" },
    { path: "../identidade-visual/fontes/satoshi/Satoshi-Bold.otf", weight: "700" },
  ],
  variable: "--font-local-sans",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const jetBrainsMono = localFont({
  src: "../identidade-visual/fontes/jetbrains-mono/JetBrainsMono-VariableFont_wght.ttf",
  weight: "100 800",
  variable: "--font-local-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});
```

- [x] **Passo 5: Verificar e, se o zod 4 reclamar, ajustar o schema do envelope**

```bash
npx tsc --noEmit
npx vitest run tests/fundacao tests/recepcao tests/gerador
```

Esperado: tipos limpos; os testes do contrato, da recepção (contra a função local) e do gerador passam. Se algum quebrar por mudança do zod 4 (por exemplo, formato de `issues`), ajuste `supabase/functions/_shared/recepcao.ts` mantendo o comportamento e as mensagens; a função servida recarrega sozinha (confira `405`). Não enfraqueça nenhum teste.

- [x] **Passo 6: Verificação completa e commit**

```bash
npx biome check --write lib/supabase/server.ts app/layout.tsx supabase/functions/receber-envio/deno.json
npm run check
npx vitest run
npm run build
git fetch && git status -sb && git status --short
git add package.json package-lock.json supabase/functions/receber-envio/deno.json lib/supabase/server.ts app/layout.tsx
git commit -m "Alinha as bibliotecas com o Repply Imob e carrega os pesos das fontes" -m "Co-Authored-By: <trailer do seu modelo>"
```

Esperado: 20 arquivos, 351 testes; build completa. (Se `recepcao.ts` mudou, inclua-o no `git add`.)

---

## Tarefa 2: Base visual, moldura e selo  *(paralela à Tarefa 3)*

**Arquivos (lista fechada):**
- Modificar: `app/globals.css`, `app/styles/tokens.css`, `tests/design-tokens.test.ts`, `app/layout.tsx`
- Criar (cópia do `IMOB_WT`): `lib/utils.ts`, `components/ui/{button,input,input-group,label,form,card,sonner,separator,skeleton,textarea}.tsx`, `components/forms/form-field.tsx`, `components/providers/theme-provider.tsx`
- Criar: `public/marca/simbolo.svg`, `public/marca/texto-claro.svg`, `public/marca/texto-escuro.svg`, `components/marca/logo.tsx`, `lib/contato.ts`, `lib/painel/selo.ts`, `components/painel/{moldura-painel,menu-painel,selo-dados,seletor-tema,estado-vazio}.tsx`, `tests/painel/selo.test.ts`, `tests/painel/menu-painel.test.tsx`

**Interfaces produzidas (as Tarefas 4 e 5 usam):**
- `cn(...classes)` em `@/lib/utils`.
- Componentes `Button` (variantes do Imob + tamanho `toque`), `Input`, `Label`, `Form*`, `Card*`, `Toaster`, `Separator`, `Skeleton`; `TextField` em `@/components/forms/form-field` (props: `name`, `control`, `label`, `description?`, `inputProps?`).
- `Logo({ variante: "claro" | "escuro"; tamanho?: "normal" | "grande"; empilhado?: boolean })` em `@/components/marca/logo`.
- `WHATSAPP_REPPLY` (`{ numeroExibido: string; link: string }`) em `@/lib/contato`.
- Em `@/lib/painel/selo`: `type EstadoSinal`, `type Selo = { tom: "ok" | "atencao" | "alerta" | "neutro"; texto: string }`, `estadoDoSinal(valor: string | null | undefined): EstadoSinal | null`, `tempoDesde(desde: Date, agora: Date): string`, `seloDoSinal(e: { estado: EstadoSinal | null; ultimoEnvioOkEm: string | null; agora: Date; fuso: string }): Selo`.
- `MolduraPainel({ casa: { nome: string; slug: string }; selo: Selo; children })` (componente de servidor), `MenuPainel({ slug: string; variante: "lateral" | "inferior" })` (cliente), `SeloDados({ selo: Selo; compacto?: boolean })`, `SeletorTema()` (cliente), `EstadoVazio({ titulo: string; texto: string })`.

- [x] **Passo 1: Testes de contraste do texto de erro e da borda dos campos (falham)**

Em `tests/design-tokens.test.ts`, dentro do `describe.each(contextos)(...)` (o callback recebe `(_, classes)`), depois do primeiro `it`, acrescente:

```ts
  it("texto de erro (--danger-text) passa 4.5 em página e superfície", () => {
    const tokens = estilos(classes);
    for (const fundo of [tokens["--bg"], tokens["--surface"]]) {
      expect(
        contraste(tokens["--danger-text"] ?? "", fundo ?? "")
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("borda de campo (--control-border) passa 3 em página e superfície (WCAG 1.4.11)", () => {
    const tokens = estilos(classes);
    for (const fundo of [tokens["--bg"], tokens["--surface"]]) {
      expect(
        contraste(tokens["--control-border"] ?? "", fundo ?? "")
      ).toBeGreaterThanOrEqual(3);
    }
  });
```

Rode `npx vitest run tests/design-tokens.test.ts` → esperado: FALHA nos 12 contextos (os dois tokens não existem).

- [x] **Passo 2: Tokens `--danger-text` e `--control-border`**

**Por quê:** o vermelho de dado `#D64545` mede 4,38:1 sobre branco e reprova como texto pequeno; e a borda comum (`--border`, `#E5E5E5`) mede 1,26:1, então o campo de formulário quase some (lição do Imob: o contorno de campo precisa de 3:1).

Em `app/styles/tokens.css`:
- nas primitivas (`:root` do bloco 1), acrescente `--palette-danger-deep: #b42318;`, `--palette-danger-soft: #f87171;` e `--palette-slate-500: #737373;` (o cinza do brandbook);
- em `:root, .theme-light` e em `.scheme-paper`, acrescente `--color-danger-text: var(--palette-danger-deep);` e `--color-control: var(--palette-slate-500);`;
- em `.dark, .theme-dark` e em `.scheme-ink`, acrescente `--color-danger-text: var(--palette-danger-soft);` e `--color-control: var(--palette-slate-400);`;
- no bloco 3 (aliases), acrescente `--danger-text: var(--color-danger-text);` e `--control-border: var(--color-control);`.

Rode o teste do Passo 1 → esperado: PASSA.

- [x] **Passo 3: Copiar os componentes do Imob**

Copie, **sem alterar**, de `IMOB_WT` para o mesmo caminho no Food: `lib/utils.ts`, `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/input-group.tsx`, `components/ui/label.tsx`, `components/ui/form.tsx`, `components/ui/card.tsx`, `components/ui/sonner.tsx`, `components/ui/separator.tsx`, `components/ui/skeleton.tsx`, `components/ui/textarea.tsx`, `components/forms/form-field.tsx`, `components/providers/theme-provider.tsx`.

Depois, só estas adaptações do Food (celular primeiro e telas aprovadas em `docs/telas/estilo.css`, classe `.rf-btn`: retângulo de 10 px, texto em negrito):
- `components/ui/button.tsx`:
  - na classe base do `cva`, troque `rounded-full` por `rounded-lg` e `font-medium` por `font-bold` (a pílula é marca do Imob, não do Food);
  - na variante `default`, apague `hover:shadow-[var(--shadow-glow-btn)]` (brilho do Imob);
  - no objeto `size`, acrescente `toque: "h-11 gap-2 px-6 text-base has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",` (44 px);
  - atualize o comentário do topo para dizer que o Food usa retângulo de 10 px, como nas telas aprovadas.
- `components/ui/input.tsx` e a raiz do `InputGroup` em `components/ui/input-group.tsx`: troque a altura `h-8` por `h-11 md:h-9` (o texto `text-base md:text-sm` continua, para o iPhone não dar zoom).
- `components/ui/sonner.tsx`: os tokens do Imob (`--popover`, `--status-*-soft`, `--radius-card`, `--shadow-glow-btn`) não existem no Food e o aviso sairia sem fundo. Troque o objeto `style` e o `toastOptions` por:

```tsx
      style={
        {
          "--normal-bg": "var(--bg)",
          "--normal-text": "var(--fg)",
          "--normal-border": "var(--control-border)",
          "--border-radius": "14px",
          // Fundo neutro e texto principal (contraste medido nos tokens);
          // o tipo do aviso aparece na borda colorida e no ícone, não só na cor.
          "--success-bg": "var(--surface)",
          "--success-border": "var(--success)",
          "--success-text": "var(--fg)",
          "--error-bg": "var(--surface)",
          "--error-border": "var(--danger)",
          "--error-text": "var(--fg)",
          "--warning-bg": "var(--surface)",
          "--warning-border": "var(--warning)",
          "--warning-text": "var(--fg)",
          "--info-bg": "var(--bg)",
          "--info-border": "var(--control-border)",
          "--info-text": "var(--fg)",
        } as React.CSSProperties
      }
```

  e apague o `toastOptions` inteiro (o brilho e a classe `cn-toast` são do Imob). Ajuste os comentários do arquivo ao que ficou. Como o arquivo usa `React.CSSProperties`, confira que há `import type * as React from "react";` (se não houver, acrescente).

Se algum componente copiado importar algo que não está na lista (por exemplo, outro arquivo de `components/ui/`), copie também esse arquivo e registre no relatório.

- [x] **Passo 4: Ponte de tokens e base do CSS**

Substitua `app/globals.css` por:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "./styles/tokens.css";
@import "./styles/brand.css";

/* `dark:` vale no tema escuro E dentro da ilha escura (barra lateral), e
   desliga dentro da ilha clara. Mesma regra do Repply Imob. */
@custom-variant dark (&:where(.dark *, .scheme-ink *):not(:where(.scheme-paper *)));

/* Ponte: os componentes copiados do Imob falam em `background`, `primary`,
   `muted-foreground`...; aqui esses nomes apontam para os tokens do Food.
   Os tokens (app/styles/tokens.css) continuam a única fonte das cores, e o
   teste de contraste continua medindo os tokens. */
@theme inline {
  --color-background: var(--bg);
  --color-foreground: var(--fg);
  --color-card: var(--bg);
  --color-card-foreground: var(--fg);
  --color-popover: var(--bg);
  --color-popover-foreground: var(--fg);
  --color-primary: var(--action-bg);
  --color-primary-foreground: var(--action-fg);
  --color-primary-hover: var(--action-hover);
  --color-secondary: var(--surface);
  --color-secondary-foreground: var(--fg);
  --color-muted: var(--surface);
  --color-muted-foreground: var(--muted);
  --color-accent: var(--surface);
  --color-accent-foreground: var(--fg);
  --color-surface-subtle: var(--surface);
  --color-destructive: var(--danger-text);
  --color-border: var(--border);
  --color-input: var(--control-border);
  --color-ring: var(--focus-ring);
  --font-sans: var(--font-family-sans);
  --font-heading: var(--font-family-display);
  --font-mono: var(--font-family-mono);
  /* Cantos das telas aprovadas (docs/telas/estilo.css): campo e botão 10 px,
     cartão 14 px. */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius-xl: 14px;
  --radius-card: 14px;
  /* O brilho dos botões é do Imob; aqui fica neutro. */
  --shadow-glow-btn: 0 0 #0000;
}

@layer base {
  * {
    @apply border-border outline-ring;
  }
  html {
    @apply font-sans;
  }
  body {
    @apply bg-background text-foreground;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  h1,
  h2 {
    font-family: var(--font-display);
  }
}
```

- [x] **Passo 5: Tema e avisos no layout raiz**

Em `app/layout.tsx` (a Tarefa 1 já mexeu nas fontes; mexa só no que segue):
- importe `import type { Viewport } from "next";`, `import { ThemeProvider } from "@/components/providers/theme-provider";` e `import { Toaster } from "@/components/ui/sonner";`;
- acrescente:

```tsx
export const viewport: Viewport = {
  themeColor: "#ff5a1f",
};
```

- troque o `return` por:

```tsx
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${generalSans.variable} ${satoshi.variable} ${jetBrainsMono.variable}`}
    >
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
```

- [x] **Passo 6: Marca**

Copie, de `identidade-visual/logos/svg/`, para `public/marca/`: `repply-food-simbolo-principal.svg` → `simbolo.svg`; `repply-food-texto-fundo-claro.svg` → `texto-claro.svg`; `repply-food-texto-fundo-escuro.svg` → `texto-escuro.svg`.

Crie `components/marca/logo.tsx`:

```tsx
import { cn } from "@/lib/utils";

type Props = {
  /** "claro" para fundo claro, "escuro" para fundo escuro (barra lateral). */
  variante: "claro" | "escuro";
  tamanho?: "normal" | "grande";
  /** Símbolo em cima do nome (tela de entrar no celular). */
  empilhado?: boolean;
  className?: string;
};

/** Símbolo + "repply food.". O tomate só aparece no símbolo (D-42). */
export function Logo({ variante, tamanho = "normal", empilhado = false, className }: Props) {
  const altura = tamanho === "grande" ? 40 : 28;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2",
        empilhado && "flex-col gap-3",
        className
      )}
    >
      {/* SVG estático da marca: <img> simples, sem ganho com next/image. */}
      <img src="/marca/simbolo.svg" alt="" width={altura} height={altura} />
      <img
        src={variante === "claro" ? "/marca/texto-claro.svg" : "/marca/texto-escuro.svg"}
        alt="repply food."
        height={Math.round(altura * 0.6)}
        style={{ height: Math.round(altura * 0.6), width: "auto" }}
      />
    </span>
  );
}
```

- [x] **Passo 7: Contato da Repply**

Crie `lib/contato.ts` (mesmos dados do site `crm.repplyhub.com.br`):

```ts
/** WhatsApp da Repply, o mesmo do site do Repply CRM (D-30: a Repply atende o painel). */
export const WHATSAPP_REPPLY = {
  numeroExibido: "(84) 99670-4294",
  link: `https://wa.me/5584996704294?text=${encodeURIComponent("Olá! Sou cliente do repply food. e preciso de ajuda.")}`,
} as const;
```

- [x] **Passo 8: Teste do selo (falha)**

Crie `tests/painel/selo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  estadoDoSinal,
  seloDoSinal,
  tempoDesde,
} from "../../lib/painel/selo";

const fuso = "America/Fortaleza";
const agora = new Date("2026-10-10T00:40:00Z"); // sexta 21:40 em Fortaleza

describe("selo do painel (D-53: segue o estado do vigia)", () => {
  it.each([
    ["em_dia", "2026-10-10T00:38:00Z", "ok", "atualizado há 2 min"],
    ["atrasado", "2026-10-10T00:20:00Z", "atencao", "atrasado · últimos dados há 20 min"],
    ["parado", "2026-10-09T22:40:00Z", "alerta", "sem dados há 2 h"],
    ["fechado", "2026-10-09T05:14:00Z", "neutro", "fechado agora · últimos dados às 02:14"],
    ["aguardando", null, "neutro", "aguardando o 1º envio"],
  ] as const)("%s", (estado, ultimo, tom, texto) => {
    expect(
      seloDoSinal({ estado, ultimoEnvioOkEm: ultimo, agora, fuso })
    ).toEqual({ tom, texto });
  });

  it("sem linha de sinal de vida é 'aguardando o 1º envio'", () => {
    expect(
      seloDoSinal({ estado: null, ultimoEnvioOkEm: null, agora, fuso })
    ).toEqual({ tom: "neutro", texto: "aguardando o 1º envio" });
  });

  it("fechado sem nenhum envio diz só 'fechado agora'", () => {
    expect(
      seloDoSinal({ estado: "fechado", ultimoEnvioOkEm: null, agora, fuso })
    ).toEqual({ tom: "neutro", texto: "fechado agora" });
  });

  it("aceita só os estados que o banco conhece", () => {
    expect(estadoDoSinal("em_dia")).toBe("em_dia");
    expect(estadoDoSinal("qualquer")).toBeNull();
    expect(estadoDoSinal(null)).toBeNull();
  });

  it.each([
    [30, "há menos de 1 min"],
    [60, "há 1 min"],
    [59 * 60, "há 59 min"],
    [60 * 60, "há 1 h"],
    [23 * 3600, "há 23 h"],
    [24 * 3600, "há 1 dia"],
    [3 * 86400, "há 3 dias"],
  ])("%i segundos viram '%s'", (segundos, texto) => {
    const desde = new Date(agora.getTime() - segundos * 1000);
    expect(tempoDesde(desde, agora)).toBe(texto);
  });
});
```

Rode `npx vitest run tests/painel/selo.test.ts` → esperado: FALHA (módulo não existe).

- [x] **Passo 9: O selo**

Crie `lib/painel/selo.ts`:

```ts
/**
 * Selo "atualizado há X min" do painel. Segue o ESTADO calculado pelo vigia
 * (D-53): na hora em que a casa abre, ele não fica vermelho por causa da
 * madrugada em que o computador do caixa estava desligado.
 */

const ESTADOS = ["aguardando", "em_dia", "atrasado", "parado", "fechado"] as const;
export type EstadoSinal = (typeof ESTADOS)[number];

export type Selo = {
  tom: "ok" | "atencao" | "alerta" | "neutro";
  texto: string;
};

export function estadoDoSinal(valor: string | null | undefined): EstadoSinal | null {
  return ESTADOS.find((estado) => estado === valor) ?? null;
}

export function tempoDesde(desde: Date, agora: Date): string {
  const minutos = Math.floor((agora.getTime() - desde.getTime()) / 60_000);
  if (minutos < 1) return "há menos de 1 min";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

function horaNoFuso(momento: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: fuso,
  }).format(momento);
}

export function seloDoSinal(e: {
  estado: EstadoSinal | null;
  ultimoEnvioOkEm: string | null;
  agora: Date;
  fuso: string;
}): Selo {
  const ultimo = e.ultimoEnvioOkEm ? new Date(e.ultimoEnvioOkEm) : null;
  switch (e.estado) {
    case "em_dia":
      return { tom: "ok", texto: ultimo ? `atualizado ${tempoDesde(ultimo, e.agora)}` : "atualizado" };
    case "atrasado":
      return {
        tom: "atencao",
        texto: ultimo ? `atrasado · últimos dados ${tempoDesde(ultimo, e.agora)}` : "atrasado",
      };
    case "parado":
      return { tom: "alerta", texto: ultimo ? `sem dados ${tempoDesde(ultimo, e.agora)}` : "sem dados" };
    case "fechado":
      return {
        tom: "neutro",
        texto: ultimo ? `fechado agora · últimos dados às ${horaNoFuso(ultimo, e.fuso)}` : "fechado agora",
      };
    default:
      return { tom: "neutro", texto: "aguardando o 1º envio" };
  }
}
```

Rode o teste do Passo 8 → esperado: PASSA.

- [x] **Passo 10: Teste do menu (falha)**

Crie `tests/painel/menu-painel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/r/casa-x/resultados",
}));

import { MenuPainel } from "../../components/painel/menu-painel";
import { SeloDados } from "../../components/painel/selo-dados";

afterEach(cleanup);

describe("moldura do painel", () => {
  it.each(["lateral", "inferior"] as const)(
    "o menu %s leva às três telas da casa e marca a atual",
    (variante) => {
      render(<MenuPainel slug="casa-x" variante={variante} />);
      const links = screen.getAllByRole("link");
      expect(links.map((link) => link.getAttribute("href"))).toEqual([
        "/r/casa-x/hoje",
        "/r/casa-x/resultados",
        "/r/casa-x/ajustes",
      ]);
      expect(
        screen.getByRole("link", { name: /resultados/i }).getAttribute("aria-current")
      ).toBe("page");
      expect(
        screen.getByRole("link", { name: /hoje/i }).getAttribute("aria-current")
      ).toBeNull();
    }
  );

  it("o selo sempre mostra o texto, não só a cor", () => {
    render(<SeloDados selo={{ tom: "alerta", texto: "sem dados há 2 h" }} />);
    expect(screen.getByText("sem dados há 2 h")).toBeTruthy();
  });
});
```

Rode `npx vitest run tests/painel/menu-painel.test.tsx` → esperado: FALHA (componentes não existem). Se o erro for `React is not defined`, acrescente em `vitest.config.ts`, no nível de cima do `defineConfig`, `esbuild: { jsx: "automatic" },` e registre no relatório.

- [x] **Passo 11: Componentes da moldura**

Crie `components/painel/selo-dados.tsx`:

```tsx
import type { Selo } from "@/lib/painel/selo";
import { cn } from "@/lib/utils";

const CLASSES_DO_TOM: Record<Selo["tom"], string> = {
  ok: "status-success",
  atencao: "status-warning",
  alerta: "status-danger",
  neutro: "brand-surface text-quiet",
};

/** Selo do vigia: cor + texto, nunca só a cor (CLAUDE.md §8). */
export function SeloDados({ selo, compacto = false }: { selo: Selo; compacto?: boolean }) {
  return (
    <span
      className={cn(
        "number-mono inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
        compacto && "px-2 py-0.5",
        CLASSES_DO_TOM[selo.tom]
      )}
    >
      <span aria-hidden="true">●</span>
      {selo.texto}
    </span>
  );
}
```

Crie `components/painel/menu-painel.tsx`:

```tsx
"use client";

import { ChartColumn, LayoutDashboard, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITENS = [
  { tela: "hoje", rotulo: "Hoje", Icone: LayoutDashboard },
  { tela: "resultados", rotulo: "Resultados", Icone: ChartColumn },
  { tela: "ajustes", rotulo: "Ajustes", Icone: Settings },
] as const;

/**
 * Hoje · Resultados · Ajustes. "lateral" é a barra escura do computador;
 * "inferior" é o menu fixo do celular (alvos de 56 px). A tela atual vai em
 * negrito, com o traço laranja e `aria-current`: não só a cor.
 */
export function MenuPainel({ slug, variante }: { slug: string; variante: "lateral" | "inferior" }) {
  const caminho = usePathname();
  return (
    <nav aria-label="Telas da casa" className={variante === "inferior" ? "w-full" : undefined}>
      <ul className={variante === "inferior" ? "grid grid-cols-3" : "flex flex-col gap-1"}>
        {ITENS.map(({ tela, rotulo, Icone }) => {
          const href = `/r/${slug}/${tela}`;
          const atual = caminho === href || caminho.startsWith(`${href}/`);
          return (
            <li key={tela}>
              <Link
                href={href}
                aria-current={atual ? "page" : undefined}
                className={cn(
                  variante === "inferior"
                    ? "flex h-14 flex-col items-center justify-center gap-1 border-t-2 border-transparent text-xs"
                    : "flex h-10 items-center gap-3 rounded-md border-l-2 border-transparent px-3 text-sm",
                  atual ? "border-primary font-bold text-foreground" : "text-muted-foreground"
                )}
              >
                <Icone aria-hidden="true" className="size-5" />
                {rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

(Se algum ícone não existir na versão instalada do `lucide-react`, escolha um equivalente e registre.)

Crie `components/painel/moldura-painel.tsx`:

```tsx
import type { ReactNode } from "react";
import { Logo } from "@/components/marca/logo";
import type { Selo } from "@/lib/painel/selo";
import { MenuPainel } from "./menu-painel";
import { SeloDados } from "./selo-dados";

type Props = {
  casa: { nome: string; slug: string };
  selo: Selo;
  children: ReactNode;
};

/**
 * Moldura do painel do dono (D-40): no computador, barra lateral escura com a
 * marca, o menu e, no rodapé, a casa e o selo; no celular, faixa de cima com a
 * casa e o selo e menu fixo embaixo.
 */
export function MolduraPainel({ casa, selo, children }: Props) {
  return (
    <div className="min-h-dvh">
      <aside className="scheme-ink fixed inset-y-0 left-0 hidden w-60 flex-col gap-6 p-4 md:flex">
        <Logo variante="escuro" className="px-1 pt-2" />
        <MenuPainel slug={casa.slug} variante="lateral" />
        <div className="mt-auto flex flex-col gap-2 px-1 pb-2">
          <strong className="text-sm">{casa.nome}</strong>
          <SeloDados selo={selo} compacto />
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col md:pl-60">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-4 py-3 md:hidden">
          <span className="flex min-w-0 items-center gap-2">
            <img src="/marca/simbolo.svg" alt="repply food." width={28} height={28} />
            <strong className="truncate text-base">{casa.nome}</strong>
          </span>
          <SeloDados selo={selo} compacto />
        </header>

        <main className="flex-1 px-4 pt-4 pb-24 md:px-8 md:pt-8 md:pb-8">{children}</main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <MenuPainel slug={casa.slug} variante="inferior" />
      </div>
    </div>
  );
}
```

Crie `components/painel/estado-vazio.tsx`:

```tsx
/** Tela ainda sem números: diz o que vem, sem inventar dado. */
export function EstadoVazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      <div className="brand-surface rounded-lg p-6">
        <p className="text-quiet">{texto}</p>
      </div>
    </section>
  );
}
```

Crie `components/painel/seletor-tema.tsx`:

```tsx
"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const OPCOES = [
  { valor: "light", rotulo: "Claro" },
  { valor: "dark", rotulo: "Escuro" },
] as const;

/**
 * Claro (padrão) ou escuro (D-12). O tema escolhido só é lido depois de
 * montar no navegador: no servidor ele é desconhecido, e desenhar o botão
 * marcado antes disso faria o servidor e o navegador discordarem.
 */
export function SeletorTema() {
  const { theme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  return (
    <div role="group" aria-label="Tema" className="inline-flex rounded-md border p-1">
      {OPCOES.map(({ valor, rotulo }) => {
        const ativo = montado && (theme ?? "light") === valor;
        return (
          <button
            key={valor}
            type="button"
            aria-pressed={ativo}
            onClick={() => setTheme(valor)}
            className={cn(
              "h-11 min-w-20 rounded px-3 text-sm md:h-9",
              ativo ? "brand-action font-bold" : "text-muted-foreground"
            )}
          >
            {rotulo}
          </button>
        );
      })}
    </div>
  );
}
```

Rode `npx vitest run tests/painel` → esperado: PASSA.

- [x] **Passo 12: Verificar e commitar**

```bash
npx biome check --write app/globals.css app/styles/tokens.css app/layout.tsx tests/design-tokens.test.ts lib/utils.ts lib/contato.ts lib/painel components/ui components/forms components/providers components/marca components/painel tests/painel
npx vitest run tests/design-tokens.test.ts tests/painel tests/brand-assets.test.ts
npx tsc --noEmit
```

(Erros de `tsc` só em `lib/auth/`, `proxy.ts`, `app/auth/` ou `scripts/acesso-local.ts` são da Tarefa 3, em paralelo: anote e siga.)

```bash
git fetch && git status -sb
git add app/globals.css app/styles/tokens.css app/layout.tsx tests/design-tokens.test.ts lib/utils.ts lib/contato.ts lib/painel/selo.ts components/ui components/forms/form-field.tsx components/providers/theme-provider.tsx components/marca/logo.tsx components/painel public/marca tests/painel
git commit -m "Traz os componentes do Imob, a moldura do painel e o selo do vigia" -m "Co-Authored-By: <trailer do seu modelo>"
```

(Se precisou mexer em `vitest.config.ts` no Passo 10, inclua-o.)

---

## Tarefa 3: Regras do login  *(paralela à Tarefa 2)*

**Arquivos (lista fechada):**
- Criar: `lib/auth/rotas.ts`, `lib/auth/destino.ts`, `lib/auth/schemas.ts`, `lib/auth/erros.ts`, `lib/auth/cookie-recuperacao.ts`, `lib/auth/safe-next.ts` (cópia do `IMOB_WT`), `lib/auth/nucleo.ts`, `lib/auth/sessao.ts`, `lib/auth/actions.ts`, `lib/supabase/proxy.ts`, `proxy.ts`, `app/auth/confirmar/route.ts`, `scripts/acesso-local.ts`, `tests/helpers/chaves-locais.ts`, `tests/auth/{rotas,destino,safe-next,cookie-recuperacao,schemas,erros,nucleo,actions}.test.ts`
- Modificar: `package.json` (só acrescentar o script `local:acesso`)
- Apagar: `lib/auth/guards.ts` (esboço sem uso; confira com `grep -rn "auth/guards" app lib components tests` antes)

**Interfaces produzidas (as Tarefas 4 e 5 usam):**
- `@/lib/auth/actions` (`"use server"`): `entrarAction(EntrarInput) → Resultado<{ destino: string }>`, `sairAction() → never`, `pedirNovaSenhaAction(EsqueciInput) → Resultado`, `definirNovaSenhaAction(NovaSenhaInput) → Resultado<{ destino: string }>`, `trocarSenhaAction(TrocarSenhaInput) → Resultado<{ destino: string }>`. `Resultado<T> = { ok: true; data?: T } | { ok: false; error: string }`.
- `@/lib/auth/schemas`: `entrarSchema`/`EntrarInput` (`email`, `senha`), `esqueciSchema`/`EsqueciInput` (`email`), `novaSenhaSchema`/`NovaSenhaInput` (`senha`, `confirmacao`), `trocarSenhaSchema`/`TrocarSenhaInput` (`senhaAtual`, `senha`, `confirmacao`).
- `@/lib/auth/sessao` (só servidor): `type CasaDoLogin = { id; slug; nome; situacao: "ativo" | "suspenso"; fuso }`, `type Sessao = { userId; email; ehAdmin; precisaTrocarSenha; casas: CasaDoLogin[] }`, `obterSessao(): Promise<Sessao | null>` (cache por requisição), `exigirSessao()`, `destinoDaSessao(Sessao): string`, `exigirCasa(slug) → { sessao, casa }`, `exigirAdmin()`.
- `@/lib/auth/cookie-recuperacao`: `COOKIE_RECUPERACAO`, `CAMINHO_COOKIE_RECUPERACAO` (`"/nova-senha"`), `criarCookieRecuperacao(userId)`, `conferirCookieRecuperacao(valor, userId)`.
- `@/lib/auth/safe-next`: `safeNext`, `safeNextOr` (iguais ao Imob).
- `ACESSO_LOCAL` em `scripts/acesso-local.ts` (credenciais de teste do banco local).

- [x] **Passo 1: Testes das funções puras (falham)**

Crie `tests/auth/rotas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decidirRota, ehArquivoEstatico } from "../../lib/auth/rotas";

const semUsuario = { temUsuario: false, precisaTrocarSenha: false };
const logado = { temUsuario: true, precisaTrocarSenha: false };
const primeiroAcesso = { temUsuario: true, precisaTrocarSenha: true };

describe("porteiro: para onde cada endereço leva", () => {
  it.each(["/entrar", "/esqueci-a-senha", "/auth/confirmar"])(
    "%s é público",
    (pathname) => {
      expect(decidirRota({ pathname, search: "", ...semUsuario })).toEqual({ tipo: "segue" });
    }
  );

  it("sem login, endereço protegido vai para /entrar guardando o destino", () => {
    expect(
      decidirRota({ pathname: "/r/bar-do-ze/resultados", search: "?aba=vendas", ...semUsuario })
    ).toEqual({
      tipo: "redireciona",
      para: `/entrar?next=${encodeURIComponent("/r/bar-do-ze/resultados?aba=vendas")}`,
    });
  });

  it("sem login, a raiz vai para /entrar sem destino", () => {
    expect(decidirRota({ pathname: "/", search: "", ...semUsuario })).toEqual({
      tipo: "redireciona",
      para: "/entrar",
    });
  });

  it("logado segue", () => {
    expect(decidirRota({ pathname: "/r/bar-do-ze/hoje", search: "", ...logado })).toEqual({
      tipo: "segue",
    });
  });

  it.each(["/r/bar-do-ze/hoje", "/entrar", "/admin", "/escolher-casa"])(
    "com troca de senha pendente, %s vai para /trocar-senha",
    (pathname) => {
      expect(decidirRota({ pathname, search: "", ...primeiroAcesso })).toEqual({
        tipo: "redireciona",
        para: "/trocar-senha",
      });
    }
  );

  it.each(["/trocar-senha", "/nova-senha", "/auth/confirmar"])(
    "com troca de senha pendente, %s segue",
    (pathname) => {
      expect(decidirRota({ pathname, search: "", ...primeiroAcesso })).toEqual({ tipo: "segue" });
    }
  );

  it.each([
    ["/favicon.ico", true],
    ["/manifest.webmanifest", true],
    ["/marca/simbolo.svg", true],
    ["/_next/static/x.js", true],
    ["/entrar/truque.png", false],
    ["/r/bar-do-ze/hoje", false],
    ["/r/x.json", false],
  ])("%s é arquivo estático? %s", (pathname, esperado) => {
    expect(ehArquivoEstatico(pathname)).toBe(esperado);
  });

  it("arquivo estático segue mesmo sem login", () => {
    expect(decidirRota({ pathname: "/icon-192.png", search: "", ...semUsuario })).toEqual({
      tipo: "segue",
    });
  });
});
```

Crie `tests/auth/destino.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { destinoDepoisDeEntrar } from "../../lib/auth/destino";

const casa = (slug: string, situacao: "ativo" | "suspenso" = "ativo") => ({ slug, situacao });

describe("para onde vai depois de entrar", () => {
  it("troca de senha pendente vem antes de tudo", () => {
    expect(
      destinoDepoisDeEntrar({ precisaTrocarSenha: true, ehAdmin: true, restaurantes: [casa("a")] })
    ).toBe("/trocar-senha");
  });
  it("admin vai para o admin", () => {
    expect(destinoDepoisDeEntrar({ precisaTrocarSenha: false, ehAdmin: true, restaurantes: [] })).toBe("/admin");
  });
  it("uma casa ativa vai direto para o Hoje dela", () => {
    expect(
      destinoDepoisDeEntrar({ precisaTrocarSenha: false, ehAdmin: false, restaurantes: [casa("bar-do-ze"), casa("velha", "suspenso")] })
    ).toBe("/r/bar-do-ze/hoje");
  });
  it("mais de uma casa ativa escolhe a casa (D-54)", () => {
    expect(
      destinoDepoisDeEntrar({ precisaTrocarSenha: false, ehAdmin: false, restaurantes: [casa("a"), casa("b")] })
    ).toBe("/escolher-casa");
  });
  it.each([[[]], [[casa("x", "suspenso")]]])("sem casa ativa vai para o acesso pendente", (restaurantes) => {
    expect(destinoDepoisDeEntrar({ precisaTrocarSenha: false, ehAdmin: false, restaurantes })).toBe("/acesso-pendente");
  });
});
```

Copie `tests/auth-safe-next.test.ts` do `IMOB_WT` para `tests/auth/safe-next.test.ts`, sem alterar (o import `@/lib/auth/safe-next` já resolve no Food).

Crie `tests/auth/cookie-recuperacao.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  conferirCookieRecuperacao,
  criarCookieRecuperacao,
} from "../../lib/auth/cookie-recuperacao";

beforeEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "segredo-de-teste-para-o-hmac");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("cookie assinado da recuperação de senha", () => {
  it("vale para o mesmo usuário", () => {
    expect(conferirCookieRecuperacao(criarCookieRecuperacao("u1"), "u1")).toBe(true);
  });
  it("não vale para outro usuário", () => {
    expect(conferirCookieRecuperacao(criarCookieRecuperacao("u1"), "u2")).toBe(false);
  });
  it("não vale depois de 10 minutos", () => {
    vi.useFakeTimers();
    const valor = criarCookieRecuperacao("u1");
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(conferirCookieRecuperacao(valor, "u1")).toBe(false);
  });
  it.each(["", "u1.123", "u1.9999999999999.abc", "u1.9999999999999.zz"])(
    "valor adulterado (%s) não vale",
    (valor) => {
      expect(conferirCookieRecuperacao(valor, "u1")).toBe(false);
    }
  );
  it("sem a chave de serviço, falha alto", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => criarCookieRecuperacao("u1")).toThrow();
  });
});
```

Crie `tests/auth/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  entrarSchema,
  esqueciSchema,
  novaSenhaSchema,
  trocarSenhaSchema,
} from "../../lib/auth/schemas";

describe("regras dos formulários", () => {
  it("e-mail é limpo e minúsculo", () => {
    expect(entrarSchema.parse({ email: "  Dono@Bar.COM ", senha: "x" }).email).toBe("dono@bar.com");
  });
  it("e-mail inválido é recusado", () => {
    expect(esqueciSchema.safeParse({ email: "dono" }).success).toBe(false);
  });
  it("senha nova precisa de 8 caracteres", () => {
    expect(novaSenhaSchema.safeParse({ senha: "1234567", confirmacao: "1234567" }).success).toBe(false);
    expect(novaSenhaSchema.safeParse({ senha: "12345678", confirmacao: "12345678" }).success).toBe(true);
  });
  it("as duas senhas precisam ser iguais", () => {
    const r = novaSenhaSchema.safeParse({ senha: "12345678", confirmacao: "12345679" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["confirmacao"]);
  });
  it("na troca, a senha atual pode vir vazia (primeiro acesso)", () => {
    expect(
      trocarSenhaSchema.safeParse({ senhaAtual: "", senha: "senha-nova-1", confirmacao: "senha-nova-1" }).success
    ).toBe(true);
  });
});
```

Crie `tests/auth/erros.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mensagemDoErroDeAuth } from "../../lib/auth/erros";

describe("mensagens de erro do login", () => {
  it.each([
    ["same_password", "A nova senha precisa ser diferente da atual."],
    ["weak_password", "A senha precisa ter pelo menos 8 caracteres."],
    ["over_email_send_rate_limit", "Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo."],
    ["over_request_rate_limit", "Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo."],
    ["qualquer_outro", "Não foi possível concluir agora. Tente de novo em instantes."],
  ])("%s", (code, mensagem) => {
    expect(mensagemDoErroDeAuth({ code })).toBe(mensagem);
  });
  it("sem erro conhecido, frase genérica do produto", () => {
    expect(mensagemDoErroDeAuth(null)).toBe("Não foi possível concluir agora. Tente de novo em instantes.");
  });
});
```

Rode `npx vitest run tests/auth` → esperado: FALHA (módulos não existem).

- [x] **Passo 2: Funções puras e pequenas**

Crie `lib/auth/rotas.ts`:

```ts
/**
 * O "porteiro" decide, para cada endereço, se a pessoa segue, vai para
 * /entrar ou é obrigada a trocar a senha. Função pura: `proxy.ts` só aplica.
 */

export const ROTA_ENTRAR = "/entrar";
export const ROTA_TROCAR_SENHA = "/trocar-senha";

const PUBLICAS = new Set(["/entrar", "/esqueci-a-senha"]);
const PREFIXOS_PUBLICOS = ["/auth/"];
/** Abertas mesmo com a troca de senha pendente. */
const LIVRES_NA_TROCA = new Set([ROTA_TROCAR_SENHA, "/nova-senha"]);

const EXTENSOES_ESTATICAS = new Set([
  "svg", "png", "jpg", "jpeg", "webp", "gif", "ico", "css", "js", "map",
  "woff", "woff2", "ttf", "otf", "txt", "xml", "json", "webmanifest",
]);
const PREFIXOS_ESTATICOS = ["/_next/", "/marca/"];

/**
 * Olha só o ÚLTIMO segmento e exige arquivo na raiz ou num prefixo estático
 * (lição do Imob: `/entrar/truque.png` não pode virar "arquivo" e escapar).
 */
export function ehArquivoEstatico(pathname: string): boolean {
  const barra = pathname.lastIndexOf("/");
  const ultimo = pathname.slice(barra + 1);
  const ponto = ultimo.lastIndexOf(".");
  if (ponto <= 0) return false;
  if (!EXTENSOES_ESTATICAS.has(ultimo.slice(ponto + 1).toLowerCase())) return false;
  return barra === 0 || PREFIXOS_ESTATICOS.some((prefixo) => pathname.startsWith(prefixo));
}

function ehPublica(pathname: string): boolean {
  return PUBLICAS.has(pathname) || PREFIXOS_PUBLICOS.some((prefixo) => pathname.startsWith(prefixo));
}

export type Decisao = { tipo: "segue" } | { tipo: "redireciona"; para: string };

export function decidirRota(e: {
  pathname: string;
  search: string;
  temUsuario: boolean;
  precisaTrocarSenha: boolean;
}): Decisao {
  if (ehArquivoEstatico(e.pathname)) return { tipo: "segue" };

  if (!e.temUsuario) {
    if (ehPublica(e.pathname)) return { tipo: "segue" };
    if (e.pathname === "/") return { tipo: "redireciona", para: ROTA_ENTRAR };
    return {
      tipo: "redireciona",
      para: `${ROTA_ENTRAR}?next=${encodeURIComponent(`${e.pathname}${e.search}`)}`,
    };
  }

  if (
    e.precisaTrocarSenha &&
    !LIVRES_NA_TROCA.has(e.pathname) &&
    !e.pathname.startsWith("/auth/")
  ) {
    return { tipo: "redireciona", para: ROTA_TROCAR_SENHA };
  }

  return { tipo: "segue" };
}
```

Crie `lib/auth/destino.ts`:

```ts
export type RestauranteDoLogin = { slug: string; situacao: "ativo" | "suspenso" };

/** Para onde a pessoa vai depois de entrar (desenho da etapa 2, §1). */
export function destinoDepoisDeEntrar(e: {
  precisaTrocarSenha: boolean;
  ehAdmin: boolean;
  restaurantes: RestauranteDoLogin[];
}): string {
  if (e.precisaTrocarSenha) return "/trocar-senha";
  if (e.ehAdmin) return "/admin";
  const ativos = e.restaurantes.filter((r) => r.situacao === "ativo");
  const [unica] = ativos;
  if (ativos.length === 1 && unica) return `/r/${unica.slug}/hoje`;
  if (ativos.length > 1) return "/escolher-casa";
  return "/acesso-pendente";
}
```

Crie `lib/auth/schemas.ts`:

```ts
import { z } from "zod";
import { SENHA_MINIMA } from "./senha";

const email = z.string().trim().toLowerCase().pipe(z.email("Digite um e-mail válido"));

const senhaNova = z
  .string()
  .min(SENHA_MINIMA, `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres`)
  .max(128, "Senha longa demais");

const iguais = (d: { senha: string; confirmacao: string }) => d.senha === d.confirmacao;
const avisoIguais = { message: "As duas senhas não são iguais", path: ["confirmacao"] };

export const entrarSchema = z.object({ email, senha: z.string().min(1, "Digite a senha") });
export type EntrarInput = z.infer<typeof entrarSchema>;

export const esqueciSchema = z.object({ email });
export type EsqueciInput = z.infer<typeof esqueciSchema>;

export const novaSenhaSchema = z
  .object({ senha: senhaNova, confirmacao: z.string() })
  .refine(iguais, avisoIguais);
export type NovaSenhaInput = z.infer<typeof novaSenhaSchema>;

/** `senhaAtual` vem vazia no primeiro acesso (a ação decide se ela é exigida). */
export const trocarSenhaSchema = z
  .object({ senhaAtual: z.string(), senha: senhaNova, confirmacao: z.string() })
  .refine(iguais, avisoIguais);
export type TrocarSenhaInput = z.infer<typeof trocarSenhaSchema>;
```

Crie `lib/auth/erros.ts`:

```ts
import { SENHA_MINIMA } from "./senha";

export const MENSAGEM_LOGIN_RECUSADO = "E-mail ou senha incorretos.";

/** Frase do produto pelo `code` do Supabase; nunca o texto cru do erro. */
export function mensagemDoErroDeAuth(erro: { code?: string | null } | null | undefined): string {
  switch (erro?.code) {
    case "same_password":
      return "A nova senha precisa ser diferente da atual.";
    case "weak_password":
      return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.";
    default:
      return "Não foi possível concluir agora. Tente de novo em instantes.";
  }
}
```

Crie `lib/auth/cookie-recuperacao.ts` (do Imob consertado, com nomes do Food):

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cookie que prova que a troca de senha nasceu de um link de e-mail de
 * verdade: `usuario.validade.hmac`, assinado com a chave de serviço, válido por
 * 10 minutos e amarrado ao usuário. Sem a chave, ninguém forja.
 */
export const COOKIE_RECUPERACAO = "recuperacao_senha";
export const CAMINHO_COOKIE_RECUPERACAO = "/nova-senha";
const VALIDADE_MS = 10 * 60 * 1000;

function segredo(): string {
  const valor = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!valor) throw new Error("SUPABASE_SERVICE_ROLE_KEY é obrigatória para o cookie de recuperação");
  return valor;
}

function assinar(conteudo: string): string {
  return createHmac("sha256", segredo()).update(conteudo).digest("hex");
}

export function criarCookieRecuperacao(userId: string): string {
  const conteudo = `${userId}.${Date.now() + VALIDADE_MS}`;
  return `${conteudo}.${assinar(conteudo)}`;
}

export function conferirCookieRecuperacao(valor: string | undefined, userId: string): boolean {
  if (!valor) return false;
  const partes = valor.split(".");
  if (partes.length !== 3) return false;
  const [usuario, validade, hmac] = partes;
  if (!usuario || !validade || !hmac || usuario !== userId) return false;
  const expira = Number.parseInt(validade, 10);
  if (!Number.isFinite(expira) || expira < Date.now()) return false;
  try {
    const recebido = Buffer.from(hmac, "hex");
    const esperado = Buffer.from(assinar(`${usuario}.${validade}`), "hex");
    return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
  } catch {
    return false;
  }
}
```

Copie `lib/auth/safe-next.ts` do `IMOB_WT` sem alterar.

Rode `npx vitest run tests/auth/rotas.test.ts tests/auth/destino.test.ts tests/auth/safe-next.test.ts tests/auth/cookie-recuperacao.test.ts tests/auth/schemas.test.ts tests/auth/erros.test.ts` → esperado: PASSA.

- [x] **Passo 3: Teste do núcleo contra o login local (falha)**

Crie `tests/helpers/chaves-locais.ts`:

```ts
import { createHmac } from "node:crypto";

/**
 * Chaves do Supabase LOCAL, assinadas com o segredo padrão de desenvolvimento
 * da CLI (o mesmo para qualquer máquina). Nunca servem para a nuvem.
 */
const SEGREDO_LOCAL = "super-secret-jwt-token-with-at-least-32-characters-long";
export const URL_LOCAL = "http://127.0.0.1:54321";

export function chaveLocal(papel: "anon" | "service_role"): string {
  const base64 = (objeto: object) => Buffer.from(JSON.stringify(objeto)).toString("base64url");
  const cabecalho = base64({ alg: "HS256", typ: "JWT" });
  const corpo = base64({ iss: "supabase-demo", role: papel, exp: 1983812996 });
  const assinatura = createHmac("sha256", SEGREDO_LOCAL).update(`${cabecalho}.${corpo}`).digest("base64url");
  return `${cabecalho}.${corpo}.${assinatura}`;
}
```

Crie `tests/auth/nucleo.test.ts`:

```ts
// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import {
  liberarPrimeiroAcesso,
  precisaTrocarSenha,
  senhaConfere,
} from "../../lib/auth/nucleo";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";

const servico = createClient(URL_LOCAL, chaveLocal("service_role"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const criados: string[] = [];

afterEach(async () => {
  for (const id of criados.splice(0)) await servico.auth.admin.deleteUser(id);
});

async function contaDeTeste(precisa: boolean) {
  const email = `teste-${randomUUID()}@teste.repply.local`;
  const senha = `provisoria-${randomUUID().slice(0, 8)}`;
  const { data, error } = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    app_metadata: { precisa_trocar_senha: precisa },
  });
  if (error || !data.user) throw new Error("não criou a conta de teste");
  criados.push(data.user.id);
  return { id: data.user.id, email, senha, usuario: data.user };
}

describe("núcleo do login, contra o Supabase local", () => {
  it("conta criada pelo admin com o aviso de troca é reconhecida", async () => {
    const conta = await contaDeTeste(true);
    expect(precisaTrocarSenha(conta.usuario)).toBe(true);
  });

  it("confere a senha sem abrir sessão nova no navegador", async () => {
    const conta = await contaDeTeste(false);
    expect(await senhaConfere(URL_LOCAL, chaveLocal("anon"), conta.email, conta.senha)).toBe(true);
    expect(await senhaConfere(URL_LOCAL, chaveLocal("anon"), conta.email, "senha-errada-123")).toBe(false);
  });

  it("só o servidor tira o aviso de troca, e confere que tirou", async () => {
    const conta = await contaDeTeste(true);
    expect(await liberarPrimeiroAcesso(servico, conta.id)).toBe(true);
    const { data } = await servico.auth.admin.getUserById(conta.id);
    expect(precisaTrocarSenha(data.user)).toBe(false);
  });

  it("ninguém se cadastra sozinho (cadastro público fechado, D-11)", async () => {
    const anonimo = createClient(URL_LOCAL, chaveLocal("anon"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anonimo.auth.signUp({
      email: `invasor-${randomUUID()}@teste.repply.local`,
      password: "senha-de-teste-123",
    });
    if (data.user) criados.push(data.user.id);
    expect(error?.code).toBe("signup_disabled");
  });
});
```

Rode `npx vitest run tests/auth/nucleo.test.ts` → esperado: FALHA (módulo não existe). Se o teste do cadastro falhar com outro `code`, confira o texto do erro e registre; o que importa é a conta NÃO ser criada.

- [x] **Passo 4: O núcleo**

Crie `lib/auth/nucleo.ts`:

```ts
import { type SupabaseClient, createClient } from "@supabase/supabase-js";

/**
 * Peças do login que não dependem do Next (testáveis contra o Supabase local).
 * As ações em `actions.ts` só juntam estas peças com os cookies.
 */
export const AVISO_TROCA = "precisa_trocar_senha";

export function precisaTrocarSenha(
  usuario: { app_metadata?: Record<string, unknown> } | null | undefined
): boolean {
  return usuario?.app_metadata?.[AVISO_TROCA] === true;
}

/** Confere a senha com um cliente descartável: não mexe na sessão do navegador. */
export async function senhaConfere(
  url: string,
  chavePublica: string,
  email: string,
  senha: string
): Promise<boolean> {
  const descartavel = createClient(url, chavePublica, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await descartavel.auth.signInWithPassword({ email, password: senha });
  if (error) return false;
  await descartavel.auth.signOut({ scope: "local" });
  return true;
}

/**
 * Tira o aviso de troca obrigatória. Só a chave de serviço escreve
 * `app_metadata`. Zero efeito não é sucesso: confere o que voltou.
 */
export async function liberarPrimeiroAcesso(
  servico: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await servico.auth.admin.updateUserById(userId, {
    app_metadata: { [AVISO_TROCA]: false },
  });
  return !error && data.user?.app_metadata?.[AVISO_TROCA] === false;
}
```

Rode o teste do Passo 3 → esperado: PASSA (4 de 4).

- [x] **Passo 5: Sessão, guardas e porteiro**

Crie `lib/auth/sessao.ts`:

```ts
import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { destinoDepoisDeEntrar } from "./destino";
import { precisaTrocarSenha } from "./nucleo";

export type CasaDoLogin = {
  id: string;
  slug: string;
  nome: string;
  situacao: "ativo" | "suspenso";
  fuso: string;
};

export type Sessao = {
  userId: string;
  email: string;
  ehAdmin: boolean;
  precisaTrocarSenha: boolean;
  /** Casas que a RLS deixa ver: as do login (todas, para o admin). */
  casas: CasaDoLogin[];
};

/** Uma ida ao Supabase por requisição, mesmo com layout e página pedindo. */
export const obterSessao = cache(async (): Promise<Sessao | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [admin, casas] = await Promise.all([
    supabase.rpc("eh_admin_repply"),
    supabase.from("restaurantes").select("id, slug, nome, situacao, fuso").order("nome"),
  ]);

  return {
    userId: user.id,
    email: user.email ?? "",
    ehAdmin: admin.data === true,
    precisaTrocarSenha: precisaTrocarSenha(user),
    casas: (casas.data ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      nome: c.nome,
      fuso: c.fuso,
      situacao: c.situacao === "suspenso" ? "suspenso" : "ativo",
    })),
  };
});

export function destinoDaSessao(sessao: Sessao): string {
  return destinoDepoisDeEntrar({
    precisaTrocarSenha: sessao.precisaTrocarSenha,
    ehAdmin: sessao.ehAdmin,
    restaurantes: sessao.casas,
  });
}

export async function exigirSessao(): Promise<Sessao> {
  const sessao = await obterSessao();
  if (!sessao) redirect("/entrar");
  return sessao;
}

/** Guarda das telas da casa: a casa precisa estar entre as do login. */
export async function exigirCasa(slug: string): Promise<{ sessao: Sessao; casa: CasaDoLogin }> {
  const sessao = await exigirSessao();
  if (sessao.precisaTrocarSenha) redirect("/trocar-senha");
  const casa = sessao.casas.find((c) => c.slug === slug);
  if (!casa) redirect(destinoDaSessao(sessao));
  if (casa.situacao === "suspenso" && !sessao.ehAdmin) redirect("/acesso-pendente");
  return { sessao, casa };
}

export async function exigirAdmin(): Promise<Sessao> {
  const sessao = await exigirSessao();
  if (!sessao.ehAdmin) redirect(destinoDaSessao(sessao));
  return sessao;
}
```

Crie `lib/supabase/proxy.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "../../types/database.types";

const EM_PRODUCAO = process.env.NODE_ENV === "production";

/** Renova a sessão do Supabase a cada requisição (padrão do @supabase/ssr). */
export async function atualizarSessao(
  request: NextRequest
): Promise<{ resposta: NextResponse; usuario: User | null }> {
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          resposta = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            resposta.cookies.set(
              name,
              value,
              EM_PRODUCAO ? { ...options, secure: true, sameSite: options?.sameSite ?? "lax" } : options
            );
          }
        },
      },
    }
  );

  // getUser() valida no servidor do Supabase (não confia só no cookie) e já
  // traz o app_metadata atualizado (o aviso de troca de senha).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { resposta, usuario: user };
}
```

Se a `@supabase/ssr` instalada declarar um segundo parâmetro em `setAll` (cabeçalhos de cache), acrescente-o e aplique os cabeçalhos em `resposta`, como a documentação dela mostra; registre no relatório.

Crie `proxy.ts` (na raiz, ao lado de `app/`):

```ts
import { type NextRequest, NextResponse } from "next/server";
import { decidirRota, ehArquivoEstatico } from "@/lib/auth/rotas";
import { atualizarSessao } from "@/lib/supabase/proxy";

/** O porteiro (Next 16 chama o antigo middleware de proxy). */
export async function proxy(request: NextRequest) {
  // Ícone, manifesto e marca não precisam de sessão: não consulta o login.
  if (ehArquivoEstatico(request.nextUrl.pathname)) return NextResponse.next();

  const { resposta, usuario } = await atualizarSessao(request);
  const decisao = decidirRota({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    temUsuario: usuario !== null,
    precisaTrocarSenha: usuario?.app_metadata?.precisa_trocar_senha === true,
  });
  if (decisao.tipo === "segue") return resposta;

  const redirecionamento = NextResponse.redirect(new URL(decisao.para, request.url));
  // A sessão renovada vai junto; sem isso o navegador perde o login no caminho.
  for (const cookie of resposta.cookies.getAll()) redirecionamento.cookies.set(cookie);
  return redirecionamento;
}

/**
 * Pula só os arquivos internos do Next e os .svg da RAIZ (âncora `$`, ponto
 * como `[.]`: as duas lições do Imob consertado).
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon[.]ico|[^/]+[.]svg$).*)"],
};
```

- [x] **Passo 6: Teste das ações (falha)**

Crie `tests/auth/actions.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: os dublês precisam existir antes de o vi.mock (içado ao topo) rodar.
const { getUser, updateUser, cookieGet, updateUserById, senhaConfere } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    updateUser: vi.fn(),
    cookieGet: vi.fn(),
    updateUserById: vi.fn(),
    senhaConfere: vi.fn(),
  }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet, delete: vi.fn(), set: vi.fn() }),
  headers: async () => new Headers({ origin: "http://127.0.0.1:3000" }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser, updateUser, refreshSession: vi.fn(), signOut: vi.fn() },
    rpc: async () => ({ data: false }),
    from: () => ({ select: () => ({ order: async () => ({ data: [{ slug: "casa-x", situacao: "ativo" }] }) }) }),
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ auth: { admin: { updateUserById } } }),
}));
vi.mock("@/lib/auth/nucleo", async (original) => ({
  ...(await original<typeof import("@/lib/auth/nucleo")>()),
  senhaConfere,
}));

import { definirNovaSenhaAction, trocarSenhaAction } from "@/lib/auth/actions";

const novaSenha = { senha: "senha-nova-123", confirmacao: "senha-nova-123" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "segredo-de-teste");
  updateUser.mockResolvedValue({ error: null });
  updateUserById.mockResolvedValue({
    data: { user: { app_metadata: { precisa_trocar_senha: false } } },
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("as ações conferem o acesso por dentro, não só a página", () => {
  it("nova senha sem o cookie do e-mail não troca a senha", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "d@x.com", app_metadata: {} } } });
    cookieGet.mockReturnValue(undefined);
    const resultado = await definirNovaSenhaAction(novaSenha);
    expect(resultado.ok).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("troca voluntária com a senha atual errada não troca a senha", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "d@x.com", app_metadata: {} } } });
    senhaConfere.mockResolvedValue(false);
    const resultado = await trocarSenhaAction({ senhaAtual: "errada-123", ...novaSenha });
    expect(resultado).toEqual({ ok: false, error: "A senha atual não confere." });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("primeiro acesso não pede a senha atual e o servidor tira o aviso", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "d@x.com", app_metadata: { precisa_trocar_senha: true } } },
    });
    const resultado = await trocarSenhaAction({ senhaAtual: "", ...novaSenha });
    expect(resultado).toEqual({ ok: true, data: { destino: "/r/casa-x/hoje" } });
    expect(senhaConfere).not.toHaveBeenCalled();
    expect(updateUserById).toHaveBeenCalledWith("u1", { app_metadata: { precisa_trocar_senha: false } });
  });

  it("sem sessão, nada acontece", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const resultado = await trocarSenhaAction({ senhaAtual: "", ...novaSenha });
    expect(resultado.ok).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });
});
```

Rode `npx vitest run tests/auth/actions.test.ts` → esperado: FALHA (`actions` não existe).

- [x] **Passo 7: As ações**

Crie `lib/auth/actions.ts`:

```ts
"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  CAMINHO_COOKIE_RECUPERACAO,
  COOKIE_RECUPERACAO,
  conferirCookieRecuperacao,
} from "./cookie-recuperacao";
import { destinoDepoisDeEntrar } from "./destino";
import { MENSAGEM_LOGIN_RECUSADO, mensagemDoErroDeAuth } from "./erros";
import { liberarPrimeiroAcesso, precisaTrocarSenha, senhaConfere } from "./nucleo";
import {
  type EntrarInput,
  type EsqueciInput,
  entrarSchema,
  esqueciSchema,
  type NovaSenhaInput,
  novaSenhaSchema,
  type TrocarSenhaInput,
  trocarSenhaSchema,
} from "./schemas";

type Resultado<T = void> = { ok: true; data?: T } | { ok: false; error: string };
type ClienteServidor = Awaited<ReturnType<typeof createClient>>;

/** Mesmo tempo de resposta para e-mail que existe ou não (padrão do Imob). */
const LATENCIA_MINIMA_MS = 800;
async function segurarLatencia(inicio: number): Promise<void> {
  const falta = LATENCIA_MINIMA_MS - (Date.now() - inicio);
  if (falta > 0) await new Promise((resolve) => setTimeout(resolve, falta));
}

function primeiroErro(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Confira os dados";
}

/** Para onde vai, lendo pela RLS as casas que este login enxerga. */
async function destinoDe(supabase: ClienteServidor, trocaPendente: boolean): Promise<string> {
  const [admin, casas] = await Promise.all([
    supabase.rpc("eh_admin_repply"),
    supabase.from("restaurantes").select("slug, situacao").order("nome"),
  ]);
  return destinoDepoisDeEntrar({
    precisaTrocarSenha: trocaPendente,
    ehAdmin: admin.data === true,
    restaurantes: (casas.data ?? []).map((c) => ({
      slug: c.slug,
      situacao: c.situacao === "suspenso" ? "suspenso" : "ativo",
    })),
  });
}

/** Depois de trocar a senha: renova a sessão (novo app_metadata) e tira os outros aparelhos. */
async function fecharTroca(supabase: ClienteServidor): Promise<void> {
  await supabase.auth.refreshSession();
  await supabase.auth.signOut({ scope: "others" });
}

export async function entrarAction(input: EntrarInput): Promise<Resultado<{ destino: string }>> {
  const inicio = Date.now();
  const dados = entrarSchema.safeParse(input);
  if (!dados.success) {
    await segurarLatencia(inicio);
    return { ok: false, error: primeiroErro(dados.error.issues) };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: dados.data.email,
    password: dados.data.senha,
  });
  if (error || !data.user) {
    await segurarLatencia(inicio);
    const limite = error?.code === "over_request_rate_limit";
    return { ok: false, error: limite ? mensagemDoErroDeAuth(error) : MENSAGEM_LOGIN_RECUSADO };
  }
  const destino = await destinoDe(supabase, precisaTrocarSenha(data.user));
  await segurarLatencia(inicio);
  return { ok: true, data: { destino } };
}

/** Sai SÓ deste aparelho: o login é compartilhado (D-10). */
export async function sairAction(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/entrar");
}

export async function pedirNovaSenhaAction(input: EsqueciInput): Promise<Resultado> {
  const inicio = Date.now();
  const dados = esqueciSchema.safeParse(input);
  if (!dados.success) {
    await segurarLatencia(inicio);
    return { ok: false, error: primeiroErro(dados.error.issues) };
  }
  // A volta do e-mail usa o MESMO endereço em que a pessoa está (127.0.0.1,
  // localhost ou o domínio): o cookie do PKCE só existe nele.
  const origem = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(dados.data.email, {
    redirectTo: `${origem}/auth/confirmar?next=${CAMINHO_COOKIE_RECUPERACAO}`,
  });
  await segurarLatencia(inicio);
  // O Supabase responde igual para e-mail que existe ou não: erro aqui é de
  // infraestrutura ou de limite, nunca uma pista de quem é cliente.
  if (error) return { ok: false, error: mensagemDoErroDeAuth(error) };
  return { ok: true };
}

/** Senha nova depois do e-mail. Exige o cookie assinado AQUI, não só na página. */
export async function definirNovaSenhaAction(input: NovaSenhaInput): Promise<Resultado<{ destino: string }>> {
  const dados = novaSenhaSchema.safeParse(input);
  if (!dados.success) return { ok: false, error: primeiroErro(dados.error.issues) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sua sessão expirou. Peça um link novo em “Esqueci a senha”." };

  const loja = await cookies();
  if (!conferirCookieRecuperacao(loja.get(COOKIE_RECUPERACAO)?.value, user.id)) {
    return { ok: false, error: "Este link de senha nova não vale mais. Peça outro em “Esqueci a senha”." };
  }

  const { error } = await supabase.auth.updateUser({ password: dados.data.senha });
  if (error) return { ok: false, error: mensagemDoErroDeAuth(error) };

  // Recuperar a senha também cumpre o primeiro acesso.
  if (precisaTrocarSenha(user) && !(await liberarPrimeiroAcesso(createServiceClient(), user.id))) {
    return { ok: false, error: mensagemDoErroDeAuth(null) };
  }
  await fecharTroca(supabase);
  loja.delete({ name: COOKIE_RECUPERACAO, path: CAMINHO_COOKIE_RECUPERACAO });
  return { ok: true, data: { destino: await destinoDe(supabase, false) } };
}

/** Primeiro acesso (sem a senha atual) ou troca voluntária (com a senha atual). */
export async function trocarSenhaAction(input: TrocarSenhaInput): Promise<Resultado<{ destino: string }>> {
  const dados = trocarSenhaSchema.safeParse(input);
  if (!dados.success) return { ok: false, error: primeiroErro(dados.error.issues) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Sua sessão expirou. Entre de novo." };

  const primeiroAcesso = precisaTrocarSenha(user);
  if (!primeiroAcesso) {
    const confere = await senhaConfere(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      user.email,
      dados.data.senhaAtual
    );
    if (!confere) return { ok: false, error: "A senha atual não confere." };
  }

  const { error } = await supabase.auth.updateUser({ password: dados.data.senha });
  if (error) return { ok: false, error: mensagemDoErroDeAuth(error) };

  if (primeiroAcesso && !(await liberarPrimeiroAcesso(createServiceClient(), user.id))) {
    return { ok: false, error: mensagemDoErroDeAuth(null) };
  }
  await fecharTroca(supabase);
  return { ok: true, data: { destino: await destinoDe(supabase, false) } };
}
```

Rode `npx vitest run tests/auth` → esperado: PASSA (todos os arquivos de `tests/auth`).

- [x] **Passo 8: Volta do link do e-mail**

Crie `app/auth/confirmar/route.ts`:

```ts
import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import {
  CAMINHO_COOKIE_RECUPERACAO,
  COOKIE_RECUPERACAO,
  criarCookieRecuperacao,
} from "@/lib/auth/cookie-recuperacao";
import { safeNextOr } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

const TIPOS = ["recovery", "email", "magiclink", "invite", "email_change", "signup"] as const satisfies readonly EmailOtpType[];

function tipoDoLink(bruto: string | null): EmailOtpType | null {
  return TIPOS.find((tipo) => tipo === bruto) ?? null;
}

/** Recebe o link do e-mail, abre a sessão e segue para `next` (padrão do Imob consertado). */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origem = url.origin;
  const destino = safeNextOr(url.searchParams.get("next"), "/", origem);
  const falhou = NextResponse.redirect(`${origem}/entrar?erro=link_invalido`);

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  if (!code && !tokenHash) return falhou;

  const supabase = await createClient();
  const {
    data: { user: jaLogado },
  } = await supabase.auth.getUser();
  // Não troca uma sessão aberta pela do link (fixação de sessão).
  if (jaLogado) return NextResponse.redirect(`${origem}/entrar?erro=sessao_aberta`);

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return falhou;
  } else {
    const tipo = tipoDoLink(url.searchParams.get("type"));
    if (!tipo || !tokenHash) return falhou;
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (error) return falhou;
  }

  const resposta = NextResponse.redirect(`${origem}${destino}`);
  if (destino.startsWith(CAMINHO_COOKIE_RECUPERACAO)) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      resposta.cookies.set(COOKIE_RECUPERACAO, criarCookieRecuperacao(user.id), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 10,
        path: CAMINHO_COOKIE_RECUPERACAO,
      });
    }
  }
  return resposta;
}
```

- [x] **Passo 9: Conta de teste local**

Crie `scripts/acesso-local.ts`:

```ts
/**
 * Cria, no banco LOCAL, contas de teste para abrir as telas antes do admin
 * existir (etapa 3). Recusa qualquer endereço que não seja desta máquina.
 *
 * Uso: npm run local:acesso
 * Pode rodar quantas vezes quiser: repõe a senha provisória e o aviso de troca.
 */
import { createClient } from "@supabase/supabase-js";
import { enderecoLocal } from "./gerador-dados-ficticios";

/** Valores de TESTE. Só existem no banco local. */
export const ACESSO_LOCAL = {
  dono: { email: "dono@casa-teste.local", senhaProvisoria: "provisoria-123" },
  admin: { email: "admin@repply.local", senha: "admin-local-123" },
  casas: [
    { slug: "casa-teste-local", nome: "Casa de Teste Local" },
    { slug: "segunda-casa-local", nome: "Segunda Casa Local" },
  ],
} as const;

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!enderecoLocal(url)) throw new Error("Este comando só roda contra o banco local (127.0.0.1).");
  if (!chave) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY no .env.local");

  const db = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: casas, error: erroCasas } = await db
    .from("restaurantes")
    .upsert(ACESSO_LOCAL.casas.map((c) => ({ ...c })), { onConflict: "slug" })
    .select("id, slug");
  if (erroCasas || !casas || casas.length !== ACESSO_LOCAL.casas.length) throw new Error("não criou as casas");

  async function garantirConta(email: string, senha: string, aviso: boolean): Promise<string> {
    const { data: lista } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existente = lista?.users.find((u) => u.email === email);
    const atributos = { password: senha, email_confirm: true, app_metadata: { precisa_trocar_senha: aviso } };
    const { data, error } = existente
      ? await db.auth.admin.updateUserById(existente.id, atributos)
      : await db.auth.admin.createUser({ email, ...atributos });
    if (error || !data.user) throw new Error(`não criou a conta ${email}`);
    return data.user.id;
  }

  const dono = await garantirConta(ACESSO_LOCAL.dono.email, ACESSO_LOCAL.dono.senhaProvisoria, true);
  const admin = await garantirConta(ACESSO_LOCAL.admin.email, ACESSO_LOCAL.admin.senha, false);

  const { error: erroAcessos } = await db
    .from("acessos")
    .upsert(casas.map((c) => ({ user_id: dono, restaurante_id: c.id })), { onConflict: "user_id,restaurante_id" });
  if (erroAcessos) throw new Error("não deu acesso às casas");

  const { error: erroAdmin } = await db
    .from("admins_repply")
    .upsert({ user_id: admin }, { onConflict: "user_id" });
  if (erroAdmin) throw new Error("não marcou o admin");

  console.log("Pronto. Contas de teste em scripts/acesso-local.ts (ACESSO_LOCAL). Entre em /entrar.");
}

if (process.argv[1]?.endsWith("acesso-local.ts")) {
  main().catch((erro) => {
    console.error("[acesso-local]", erro instanceof Error ? erro.message : "falhou");
    process.exit(1);
  });
}
```

No `package.json`, em `scripts`, acrescente depois de `"gerador"`: `"local:acesso": "node --env-file=.env.local --import tsx scripts/acesso-local.ts"`.

Rode `npm run local:acesso` duas vezes → esperado: "Pronto." nas duas (é idempotente).

- [x] **Passo 10: Apagar o esboço antigo, verificar e commitar**

```bash
grep -rn "auth/guards" app lib components tests scripts || echo "sem uso"
git rm lib/auth/guards.ts
npx biome check --write lib/auth lib/supabase/proxy.ts proxy.ts app/auth scripts/acesso-local.ts tests/auth tests/helpers/chaves-locais.ts package.json
npx vitest run tests/auth
npx tsc --noEmit
```

(Erros de `tsc` só em `components/`, `app/globals.css` ou `lib/painel/` são da Tarefa 2, em paralelo: anote e siga.)

```bash
git fetch && git status -sb
git add lib/auth/rotas.ts lib/auth/destino.ts lib/auth/schemas.ts lib/auth/erros.ts lib/auth/cookie-recuperacao.ts lib/auth/safe-next.ts lib/auth/nucleo.ts lib/auth/sessao.ts lib/auth/actions.ts lib/supabase/proxy.ts proxy.ts app/auth/confirmar/route.ts scripts/acesso-local.ts tests/auth tests/helpers/chaves-locais.ts package.json
git commit -m "Cria as regras do login: porteiro, troca obrigatória, recuperação e sessão por casa" -m "Co-Authored-By: <trailer do seu modelo>"
```

---

## Verificação do par 2 ‖ 3 (controlador)

- [x] Com as Tarefas 2 e 3 commitadas: `npx tsc --noEmit`, `npm run check`, `npx vitest run`, `npm run build`. Esperado: tudo limpo. Erro de integração (por exemplo, um tipo que uma tarefa supôs e a outra fez diferente) vai para um agente de conserto com a lista completa, antes do par seguinte.

---

## Tarefa 4: Telas de entrar, senha e escolha  *(paralela à Tarefa 5)*

**Arquivos (lista fechada):** criar `app/page.tsx`, `app/(entrada)/layout.tsx`, `app/(entrada)/entrar/{page,formulario-entrar}.tsx`, `app/(entrada)/esqueci-a-senha/{page,formulario-esqueci}.tsx`, `app/(entrada)/nova-senha/{page,formulario-nova-senha}.tsx`, `app/(entrada)/trocar-senha/{page,formulario-trocar-senha}.tsx`, `app/(entrada)/escolher-casa/page.tsx`, `app/(entrada)/acesso-pendente/page.tsx`, `app/admin/page.tsx`, `components/entrada/botao-sair.tsx`.

**Interfaces consumidas:** Tarefa 2 (`Logo`, `Button` tamanho `toque`, `TextField`, `toast` do `sonner`, `WHATSAPP_REPPLY`) e Tarefa 3 (ações, schemas, `obterSessao`, `exigirSessao`, `exigirAdmin`, `destinoDaSessao`, `conferirCookieRecuperacao`, `COOKIE_RECUPERACAO`, `safeNextOr`).

- [x] **Passo 1: Raiz e casca das telas de entrada**

Crie `app/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { destinoDaSessao, obterSessao } from "@/lib/auth/sessao";

/** A raiz só encaminha: logado vai para o destino, sem login vai entrar. */
export default async function Inicio() {
  const sessao = await obterSessao();
  redirect(sessao ? destinoDaSessao(sessao) : "/entrar");
}
```

Crie `app/(entrada)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { Logo } from "@/components/marca/logo";

/**
 * Telas de entrada (D-40): no computador, marca e frase à esquerda (ilha
 * escura) e formulário à direita (ilha clara); no celular, só a coluna clara.
 */
export default function LayoutEntrada({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-2">
      <aside className="scheme-ink hidden flex-col justify-between p-12 md:flex">
        <Logo variante="escuro" tamanho="grande" />
        <p className="font-heading text-4xl leading-tight">
          sua casa,
          <br />
          <span className="text-quiet">de onde você estiver.</span>
        </p>
      </aside>
      <main className="scheme-paper flex min-h-dvh flex-col justify-center px-6 py-10 md:px-16">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
          <div className="flex justify-center md:hidden">
            <Logo variante="claro" tamanho="grande" empilhado />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
```

Crie `components/entrada/botao-sair.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { sairAction } from "@/lib/auth/actions";

/** Sai só deste aparelho (o login é compartilhado, D-10). */
export function BotaoSair({ variante = "ghost" }: { variante?: "ghost" | "outline" }) {
  return (
    <form action={sairAction}>
      <Button type="submit" variant={variante} size="toque" className="w-full">
        Sair
      </Button>
    </form>
  );
}
```

(Se o `Button` copiado não tiver a variante `outline` ou `ghost`, use as que existirem e registre.)

- [x] **Passo 2: Entrar**

Crie `app/(entrada)/entrar/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { BotaoSair } from "@/components/entrada/botao-sair";
import { destinoDaSessao, obterSessao } from "@/lib/auth/sessao";
import { FormularioEntrar } from "./formulario-entrar";

export const metadata = { title: "Entrar · repply food." };

const AVISOS: Record<string, string> = {
  link_invalido: "Este link não vale mais. Peça um novo em “Esqueci a senha”.",
};

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  const { next, erro } = await searchParams;
  const sessao = await obterSessao();

  if (sessao) {
    // Clicou no link do e-mail com outra conta aberta neste aparelho: o link
    // não troca a sessão (fixação de sessão). Explica e oferece sair.
    if (erro !== "sessao_aberta") redirect(destinoDaSessao(sessao));
    return (
      <section className="flex flex-col gap-6">
        <h1 className="text-3xl font-semibold">Já existe uma conta aberta</h1>
        <p className="text-sm text-muted-foreground">
          Este aparelho já está dentro com {sessao.email}. Para usar o link do e-mail, saia primeiro e
          clique no link de novo.
        </p>
        <Link
          href={destinoDaSessao(sessao)}
          className="text-center text-sm underline underline-offset-4"
        >
          Continuar com esta conta
        </Link>
        <BotaoSair variante="outline" />
      </section>
    );
  }

  const aviso = erro ? AVISOS[erro] : undefined;

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Entrar</h1>
      {aviso ? (
        <p role="alert" className="brand-surface rounded-md p-3 text-sm">
          {aviso}
        </p>
      ) : null}
      <FormularioEntrar next={next ?? null} />
    </section>
  );
}
```

Crie `app/(entrada)/entrar/formulario-entrar.tsx`:

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { TextField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { entrarAction } from "@/lib/auth/actions";
import { safeNextOr } from "@/lib/auth/safe-next";
import { type EntrarInput, entrarSchema } from "@/lib/auth/schemas";

export function FormularioEntrar({ next }: { next: string | null }) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<EntrarInput>({
    resolver: zodResolver(entrarSchema),
    defaultValues: { email: "", senha: "" },
  });

  function enviar(valores: EntrarInput) {
    setErro(null);
    iniciar(async () => {
      const resultado = await entrarAction(valores);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      const destino = resultado.data?.destino ?? "/";
      // Troca de senha pendente vem antes de qualquer `next` (o porteiro também força).
      router.push(destino === "/trocar-senha" ? destino : safeNextOr(next, destino));
    });
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(enviar)} className="flex flex-col gap-4" noValidate>
        <TextField
          name="email"
          control={form.control}
          label="E-mail"
          inputProps={{ type: "email", autoComplete: "email", inputMode: "email" }}
        />
        <TextField
          name="senha"
          control={form.control}
          label="Senha"
          inputProps={{ type: "password", autoComplete: "current-password" }}
        />
        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}{" "}
            <Link href="/esqueci-a-senha" className="font-bold underline underline-offset-4">
              Criar uma senha nova
            </Link>
          </p>
        ) : null}
        <Button type="submit" size="toque" className="w-full" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </Button>
        <Link
          href="/esqueci-a-senha"
          className="text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Esqueci a senha
        </Link>
      </form>
    </FormProvider>
  );
}
```

- [x] **Passo 3: Esqueci a senha**

Crie `app/(entrada)/esqueci-a-senha/page.tsx`:

```tsx
import { FormularioEsqueci } from "./formulario-esqueci";

export const metadata = { title: "Esqueci a senha · repply food." };

export default function PaginaEsqueci() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Esqueci a senha</h1>
        <p className="text-sm text-muted-foreground">
          Digite o e-mail de acesso. Vamos mandar um link para você criar uma senha nova.
        </p>
      </div>
      <FormularioEsqueci />
    </section>
  );
}
```

Crie `app/(entrada)/esqueci-a-senha/formulario-esqueci.tsx`:

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { TextField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { pedirNovaSenhaAction } from "@/lib/auth/actions";
import { type EsqueciInput, esqueciSchema } from "@/lib/auth/schemas";

export function FormularioEsqueci() {
  const [enviando, iniciar] = useTransition();
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<EsqueciInput>({ resolver: zodResolver(esqueciSchema), defaultValues: { email: "" } });

  function enviar(valores: EsqueciInput) {
    setErro(null);
    iniciar(async () => {
      const resultado = await pedirNovaSenhaAction(valores);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      setEnviado(true);
    });
  }

  if (enviado) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="brand-surface rounded-md p-4 text-sm">
          Se esse e-mail tiver acesso ao repply food., você vai receber um link para criar a senha nova.
          Confira também a caixa de spam.
        </p>
        <Link href="/entrar" className="text-center text-sm underline underline-offset-4">
          Voltar para entrar
        </Link>
      </div>
    );
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(enviar)} className="flex flex-col gap-4" noValidate>
        <TextField
          name="email"
          control={form.control}
          label="E-mail"
          inputProps={{ type: "email", autoComplete: "email", inputMode: "email" }}
        />
        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}
        <Button type="submit" size="toque" className="w-full" disabled={enviando}>
          {enviando ? "Enviando…" : "Mandar o link"}
        </Button>
        <Link href="/entrar" className="text-center text-sm text-muted-foreground underline underline-offset-4">
          Voltar para entrar
        </Link>
      </form>
    </FormProvider>
  );
}
```

- [x] **Passo 4: Senha nova (depois do e-mail) e troca de senha**

Crie `app/(entrada)/nova-senha/page.tsx`:

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_RECUPERACAO, conferirCookieRecuperacao } from "@/lib/auth/cookie-recuperacao";
import { destinoDaSessao, obterSessao } from "@/lib/auth/sessao";
import { FormularioNovaSenha } from "./formulario-nova-senha";

export const metadata = { title: "Senha nova · repply food." };

/** Só abre vindo do link do e-mail (a ação confere de novo, por dentro). */
export default async function PaginaNovaSenha() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/entrar?erro=link_invalido");
  const valido = conferirCookieRecuperacao((await cookies()).get(COOKIE_RECUPERACAO)?.value, sessao.userId);
  if (!valido) redirect(destinoDaSessao(sessao));

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Crie sua senha nova</h1>
        <p className="text-sm text-muted-foreground">Mínimo de 8 caracteres.</p>
      </div>
      <FormularioNovaSenha />
    </section>
  );
}
```

Crie `app/(entrada)/nova-senha/formulario-nova-senha.tsx`:

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { TextField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { definirNovaSenhaAction } from "@/lib/auth/actions";
import { type NovaSenhaInput, novaSenhaSchema } from "@/lib/auth/schemas";

export function FormularioNovaSenha() {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<NovaSenhaInput>({
    resolver: zodResolver(novaSenhaSchema),
    defaultValues: { senha: "", confirmacao: "" },
  });

  function enviar(valores: NovaSenhaInput) {
    setErro(null);
    iniciar(async () => {
      const resultado = await definirNovaSenhaAction(valores);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      toast.success("Senha nova salva.");
      router.push(resultado.data?.destino ?? "/");
    });
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(enviar)} className="flex flex-col gap-4" noValidate>
        <TextField name="senha" control={form.control} label="Senha nova" inputProps={{ type: "password", autoComplete: "new-password" }} />
        <TextField name="confirmacao" control={form.control} label="Repita a senha nova" inputProps={{ type: "password", autoComplete: "new-password" }} />
        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}
        <Button type="submit" size="toque" className="w-full" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar e continuar"}
        </Button>
      </form>
    </FormProvider>
  );
}
```

Crie `app/(entrada)/trocar-senha/page.tsx`:

```tsx
import Link from "next/link";
import { BotaoSair } from "@/components/entrada/botao-sair";
import { safeNext } from "@/lib/auth/safe-next";
import { destinoDaSessao, exigirSessao } from "@/lib/auth/sessao";
import { FormularioTrocarSenha } from "./formulario-trocar-senha";

export const metadata = { title: "Trocar a senha · repply food." };

export default async function PaginaTrocarSenha({
  searchParams,
}: {
  searchParams: Promise<{ voltar?: string }>;
}) {
  const sessao = await exigirSessao();
  const primeiroAcesso = sessao.precisaTrocarSenha;
  // Troca voluntária vinda de Ajustes: "Cancelar" e o fim da troca voltam para
  // lá (`?voltar=`, só caminho do próprio site). Sem ele, o destino da conta.
  // A origem fixa existe só para a validação resolver o endereço como o
  // navegador resolveria (pega truques como "/<tab>/outro-site.com").
  const voltar = primeiroAcesso
    ? null
    : safeNext((await searchParams).voltar, "https://painel.invalid");
  const voltarPara = voltar ?? destinoDaSessao(sessao);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{primeiroAcesso ? "Crie sua senha" : "Trocar a senha"}</h1>
        <p className="text-sm text-muted-foreground">
          {primeiroAcesso
            ? "Por segurança, troque a senha provisória que você recebeu. Só você vai saber a nova."
            : "Os outros aparelhos que usam este acesso vão precisar da senha nova."}
        </p>
      </div>
      <FormularioTrocarSenha pedirSenhaAtual={!primeiroAcesso} depois={voltar} />
      {primeiroAcesso ? (
        <BotaoSair />
      ) : (
        <Link
          href={voltarPara}
          className="text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Cancelar
        </Link>
      )}
    </section>
  );
}
```

Crie `app/(entrada)/trocar-senha/formulario-trocar-senha.tsx`:

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { TextField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { trocarSenhaAction } from "@/lib/auth/actions";
import { type TrocarSenhaInput, trocarSenhaSchema } from "@/lib/auth/schemas";

export function FormularioTrocarSenha({
  pedirSenhaAtual,
  depois,
}: {
  pedirSenhaAtual: boolean;
  /** Para onde ir depois de salvar (já validado pela página); sem ele, o destino da conta. */
  depois: string | null;
}) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<TrocarSenhaInput>({
    resolver: zodResolver(trocarSenhaSchema),
    defaultValues: { senhaAtual: "", senha: "", confirmacao: "" },
  });

  function enviar(valores: TrocarSenhaInput) {
    setErro(null);
    iniciar(async () => {
      const resultado = await trocarSenhaAction(valores);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      toast.success("Senha salva.");
      router.push(depois ?? resultado.data?.destino ?? "/");
    });
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(enviar)} className="flex flex-col gap-4" noValidate>
        {pedirSenhaAtual ? (
          <TextField name="senhaAtual" control={form.control} label="Senha atual" inputProps={{ type: "password", autoComplete: "current-password" }} />
        ) : null}
        <TextField name="senha" control={form.control} label="Nova senha" description="Mínimo de 8 caracteres." inputProps={{ type: "password", autoComplete: "new-password" }} />
        <TextField name="confirmacao" control={form.control} label="Repita a nova senha" inputProps={{ type: "password", autoComplete: "new-password" }} />
        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}
        <Button type="submit" size="toque" className="w-full" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar e continuar"}
        </Button>
      </form>
    </FormProvider>
  );
}
```

- [x] **Passo 5: Escolha da casa, acesso pendente e admin provisório**

Crie `app/(entrada)/escolher-casa/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { BotaoSair } from "@/components/entrada/botao-sair";
import { destinoDaSessao, exigirSessao } from "@/lib/auth/sessao";

export const metadata = { title: "Escolha a casa · repply food." };

/** Para quem tem mais de uma casa ativa (D-54). */
export default async function PaginaEscolherCasa() {
  const sessao = await exigirSessao();
  const ativas = sessao.casas.filter((c) => c.situacao === "ativo");
  if (sessao.ehAdmin || ativas.length < 2) redirect(destinoDaSessao(sessao));

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Escolha a casa</h1>
      <ul className="flex flex-col gap-3">
        {ativas.map((casa) => (
          <li key={casa.id}>
            <Link
              href={`/r/${casa.slug}/hoje`}
              className="brand-surface flex min-h-14 items-center rounded-lg px-4 text-base font-bold"
            >
              {casa.nome}
            </Link>
          </li>
        ))}
      </ul>
      <BotaoSair />
    </section>
  );
}
```

Crie `app/(entrada)/acesso-pendente/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { BotaoSair } from "@/components/entrada/botao-sair";
import { Button } from "@/components/ui/button";
import { destinoDaSessao, exigirSessao } from "@/lib/auth/sessao";
import { WHATSAPP_REPPLY } from "@/lib/contato";

export const metadata = { title: "Acesso · repply food." };

/** Login sem casa ativa: ainda não liberado, ou casa suspensa. */
export default async function PaginaAcessoPendente() {
  const sessao = await exigirSessao();
  const destino = destinoDaSessao(sessao);
  if (destino !== "/acesso-pendente") redirect(destino);
  const suspensa = sessao.casas.find((c) => c.situacao === "suspenso");

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">
          {suspensa ? "Acesso suspenso" : "Seu acesso ainda não foi liberado"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {suspensa
            ? `O acesso a ${suspensa.nome} está suspenso. Fale com a Repply para resolver.`
            : "Fale com a Repply para liberar o painel da sua casa."}
        </p>
      </div>
      <Button size="toque" className="w-full" render={<a href={WHATSAPP_REPPLY.link} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
        Falar com a Repply no WhatsApp
      </Button>
      <BotaoSair />
    </section>
  );
}
```

Crie `app/admin/page.tsx`:

```tsx
import { BotaoSair } from "@/components/entrada/botao-sair";
import { Logo } from "@/components/marca/logo";
import { exigirAdmin } from "@/lib/auth/sessao";

export const metadata = { title: "Admin · repply food." };

/** Provisório: o admin de verdade é a etapa 3. */
export default async function PaginaAdmin() {
  const sessao = await exigirAdmin();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6">
      <Logo variante="claro" tamanho="grande" />
      <h1 className="text-3xl font-semibold">Admin da Repply</h1>
      <p className="text-muted-foreground">
        Entrou como {sessao.email}. O cadastro de restaurantes, tokens e acessos chega na próxima etapa.
      </p>
      <BotaoSair variante="outline" />
    </main>
  );
}
```

- [x] **Passo 6: Verificar e commitar**

```bash
npx biome check --write app/page.tsx "app/(entrada)" app/admin components/entrada
npx tsc --noEmit
```

(Erros só em `app/r/` são da Tarefa 5, em paralelo: anote e siga.) Confira que nenhum texto de erro do Supabase vai cru para a tela (`grep -rn "error.message" "app/(entrada)" app/admin` deve voltar vazio).

```bash
git fetch && git status -sb
git add app/page.tsx "app/(entrada)" app/admin components/entrada
git commit -m "Cria as telas de entrar, senha, escolha da casa e acesso pendente" -m "Co-Authored-By: <trailer do seu modelo>"
```

---

## Tarefa 5: Painel da casa com a moldura  *(paralela à Tarefa 4)*

**Arquivos (lista fechada):** criar `app/r/[slug]/layout.tsx`, `app/r/[slug]/page.tsx`, `app/r/[slug]/hoje/page.tsx`, `app/r/[slug]/resultados/page.tsx`, `app/r/[slug]/ajustes/page.tsx`.

**Interfaces consumidas:** Tarefa 2 (`MolduraPainel`, `EstadoVazio`, `SeletorTema`, `seloDoSinal`, `estadoDoSinal`, `WHATSAPP_REPPLY`, `Button`) e Tarefa 3 (`exigirCasa`, `sairAction`).

- [x] **Passo 1: Layout da casa (guarda + moldura + selo)**

Crie `app/r/[slug]/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { MolduraPainel } from "@/components/painel/moldura-painel";
import { exigirCasa } from "@/lib/auth/sessao";
import { estadoDoSinal, seloDoSinal } from "@/lib/painel/selo";
import { createClient } from "@/lib/supabase/server";

export default async function LayoutCasa({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { casa } = await exigirCasa(slug);

  // A RLS só devolve o sinal de vida de quem tem acesso à casa.
  const supabase = await createClient();
  const { data: sinal } = await supabase
    .from("sinal_de_vida")
    .select("estado, ultimo_envio_ok_em")
    .eq("restaurante_id", casa.id)
    .maybeSingle();

  const selo = seloDoSinal({
    estado: estadoDoSinal(sinal?.estado),
    ultimoEnvioOkEm: sinal?.ultimo_envio_ok_em ?? null,
    agora: new Date(),
    fuso: casa.fuso,
  });

  return (
    <MolduraPainel casa={{ nome: casa.nome, slug: casa.slug }} selo={selo}>
      {children}
    </MolduraPainel>
  );
}
```

Crie `app/r/[slug]/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default async function RaizDaCasa({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/r/${slug}/hoje`);
}
```

- [x] **Passo 2: Hoje e Resultados (estado vazio)**

Crie `app/r/[slug]/hoje/page.tsx`:

```tsx
import { EstadoVazio } from "@/components/painel/estado-vazio";

export const metadata = { title: "Hoje · repply food." };

export default function PaginaHoje() {
  return (
    <EstadoVazio
      titulo="Hoje"
      texto="Em breve: o faturamento de hoje comparado com o mesmo dia da semana, as mesas abertas, as contas esquecidas e a meta do mês."
    />
  );
}
```

Crie `app/r/[slug]/resultados/page.tsx`:

```tsx
import { EstadoVazio } from "@/components/painel/estado-vazio";

export const metadata = { title: "Resultados · repply food." };

export default function PaginaResultados() {
  return (
    <EstadoVazio
      titulo="Resultados"
      texto="Em breve: os números por período, em quatro abas: Vendas, Horários, Equipe e Descontos."
    />
  );
}
```

- [x] **Passo 3: Ajustes (só a conta)**

Crie `app/r/[slug]/ajustes/page.tsx`:

```tsx
import Link from "next/link";
import { SeletorTema } from "@/components/painel/seletor-tema";
import { Button } from "@/components/ui/button";
import { sairAction } from "@/lib/auth/actions";
import { exigirCasa } from "@/lib/auth/sessao";
import { WHATSAPP_REPPLY } from "@/lib/contato";

export const metadata = { title: "Ajustes · repply food." };

/** Etapa 2: só a parte da conta. Meta, turnos e o resto chegam na etapa 6. */
export default async function PaginaAjustes({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sessao } = await exigirCasa(slug);

  return (
    <section className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Ajustes</h1>
      <div className="brand-surface flex flex-col divide-y rounded-lg">
        <div className="flex min-h-14 items-center justify-between gap-4 px-4">
          <span>E-mail</span>
          <span className="truncate text-quiet">{sessao.email}</span>
        </div>
        <Link
          href={`/trocar-senha?voltar=${encodeURIComponent(`/r/${slug}/ajustes`)}`}
          className="flex min-h-14 items-center justify-between px-4"
        >
          <span>Trocar senha</span>
          <span aria-hidden="true">›</span>
        </Link>
        <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2">
          <span>Tema</span>
          <SeletorTema />
        </div>
        <a
          href={WHATSAPP_REPPLY.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-14 items-center justify-between px-4"
        >
          <span>Falar com a Repply</span>
          <span className="text-quiet">WhatsApp ›</span>
        </a>
      </div>
      <form action={sairAction}>
        <Button type="submit" variant="outline" size="toque" className="w-full md:w-auto">
          Sair
        </Button>
      </form>
    </section>
  );
}
```

- [x] **Passo 4: Verificar e commitar**

```bash
npx biome check --write "app/r"
npx tsc --noEmit
```

(Erros só em `app/(entrada)/`, `app/admin/` ou `components/entrada/` são da Tarefa 4: anote e siga.)

```bash
git fetch && git status -sb
git add "app/r"
git commit -m "Cria o painel da casa com a moldura, o selo e a parte da conta em Ajustes" -m "Co-Authored-By: <trailer do seu modelo>"
```

---

## Tarefa 6: Conferência, documentação e fechamento (controlador)

**Arquivos:** `docs/decisoes.md`, `docs/arquitetura/seguranca-e-isolamento.md`, `docs/arquitetura/recepcao-de-dados.md`, `docs/metricas.md`, `docs/divida-tecnica.md`, `README.md`, `CLAUDE.md`, este plano; fora do repositório, `.claude/launch.json` da pasta de trabalho.

- [x] **Passo 1: Verificação completa do par 4 ‖ 5**

`npx tsc --noEmit`, `npm run check`, `npx vitest run`, `npm run build`. Erro de integração: um agente de conserto com a lista completa.

- [x] **Passo 2: Servidor de desenvolvimento no painel do navegador**

Em `.claude/launch.json` da pasta de trabalho (fora do repositório), acrescente:

```json
{
  "name": "food-dev",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["--prefix", "D:/lucas/Documents/2- REPPLY HUB/Projetos/Repply Food/repositorio", "run", "dev"],
  "port": 3000,
  "url": "http://127.0.0.1:3000"
}
```

(Use sempre `127.0.0.1`: é o `site_url` do login local, para onde o link do e-mail volta; o login em `localhost` seria outra sessão.)

Rode `npm run local:acesso` e abra o `food-dev`.

- [x] **Passo 3: Conferir no navegador, em 390 px e 1280 px, claro e escuro**

Roteiro (conta de teste em `scripts/acesso-local.ts`):
1. `/` sem login → `/entrar`. Senha errada → "E-mail ou senha incorretos." com o link "Criar uma senha nova".
2. Dono com senha provisória → `/trocar-senha` ("Crie sua senha", sem "senha atual"). Tentar abrir `/r/casa-teste-local/hoje` à força → volta para `/trocar-senha`.
3. Trocar a senha → `/escolher-casa` (duas casas) → `/r/casa-teste-local/hoje`: moldura (barra lateral no computador, menu de baixo no celular), selo "aguardando o 1º envio".
4. Ajustes: e-mail, trocar senha (pede a atual), tema claro/escuro, WhatsApp, sair. Sair → `/entrar`.
5. Esqueci a senha → e-mail no Mailpit (`http://127.0.0.1:54324`) → link → `/nova-senha` → salvar → painel.
6. Admin (`admin@repply.local`) → `/admin` provisório; abrir `/r/casa-teste-local/hoje` também funciona (leitura).
7. Rodar o gerador por um ciclo no restaurante de teste (opcional) e ver o selo virar "atualizado há …".

Tirar as capturas de tela para mostrar ao Lucas Ferreira. Qualquer problema: agente de conserto, e conferir de novo.

- [x] **Passo 4: Documentação**

- `docs/decisoes.md`: D-52, D-53 e D-54 (texto do desenho §8).
- `docs/arquitetura/seguranca-e-isolamento.md` §5: trocar "mais um limitador nas rotas de login…" pela D-52; acrescentar "sair só deste aparelho (login compartilhado); trocar a senha desconecta os outros"; o aviso de troca fica em `app_metadata.precisa_trocar_senha` (já está), limpo pela ação com a chave de serviço; recuperação com cookie assinado.
- `docs/arquitetura/recepcao-de-dados.md` §7 e `docs/metricas.md` (M05): o selo segue o estado do vigia (D-53).
- `docs/divida-tecnica.md`: itens 12 (teste de comportamento do cadastro fechado, `tests/auth/nucleo.test.ts`), 13 (bibliotecas alinhadas) e 15 (selo, D-53) para "Resolvidos" com os commits. Item novo, para a etapa 4: no Supabase da nuvem, liberar `https://food.repplyhub.com.br/**` nos endereços de retorno do login, pôr `site_url` no domínio e levar o modelo `supabase/templates/recuperar-senha.html` (link com `token_hash`), com o envio pelo Resend.
- `README.md`: subir o banco agora inclui o Mailpit (tirar `mailpit` da lista `-x`); `npm run local:acesso`; endereço do Mailpit; telas que já abrem.
- `CLAUDE.md` §13: estrutura real (`app/(entrada)`, `app/r/[slug]`, `app/admin`, `components/{ui,forms,painel,marca,entrada}`, `lib/{auth,painel}`, `proxy.ts`).
- Este plano: checkboxes e "Registro da execução".

- [x] **Passo 5: Revisão final, commit e pedido de envio**

Revisão do conjunto (modelo mais capaz) sobre o intervalo da etapa; consertos num agente só; verificação completa de novo; commit da documentação; mostrar a lista de commits ao Lucas Ferreira e pedir o ok para enviar ao GitHub.

---

## Critérios de aceite da etapa 2

- [x] Sem login, qualquer tela da casa vai para `/entrar`; senha errada mostra o caminho para criar uma senha nova (D-52).
- [x] Conta com senha provisória não consegue abrir nada além de `/trocar-senha` até trocar; a troca não pede a senha atual; depois disso, a conta segue para o destino certo.
- [x] "Esqueci a senha" manda o e-mail (Mailpit local), o link abre `/nova-senha`, e a ação recusa a troca sem o cookie assinado.
- [x] Login com duas casas vê "Escolha a casa" (D-54); com uma, cai no Hoje; sem casa ativa, vê o acesso pendente com o WhatsApp.
- [x] Ninguém abre a casa de outro: o layout manda para o destino da própria conta.
- [x] Moldura nas duas larguras: barra lateral escura no computador, menu de baixo no celular (alvos ≥ 44 px); selo com texto (D-53); claro e escuro.
- [x] Sair desconecta só aquele aparelho.
- [x] Tipos, lint, testes e build limpos; capturas de tela mostradas ao Lucas Ferreira.
- [x] Nada publicado na nuvem; nenhum `git push` sem o ok dele.

---

## Registro da execução

*Executado em 14/10/2026 por tarefas, com revisão depois de cada uma. A base é o commit do plano (`7f85d2f`). Nada foi enviado ao GitHub nem publicado na nuvem.*

**Commits**

| Tarefa | Entrega | Consertos da revisão |
|---|---|---|
| 0 | `a92abe5` | — |
| 1 | `09a24ae` | `8c467e4` |
| 2 | `0a9554a` | `d743ac3` |
| 3 | `7319e40` | `3c4c377` e `5166c96` |
| 4 | `9ebbf60` | `0e717ef` |
| 5 | `44fc2b8` | `3122535` |
| 6 | `10946c1` (documentação) | `da8a572`, `76fc6ff` e `c39795b` (achados da conferência no navegador); consertos da revisão final: `e64aedb` (código e teste) e o commit de documentação que o segue |

**Consertos da revisão (o que mudou de verdade)**
- **Tarefa 1:** o `react-is` 17 da raiz quebrava o Recharts com o React 19, então entrou o `react-is` 19. Teste novo trava Node e Deno na mesma versão do zod e do supabase-js.
- **Tarefa 2:** o olho da senha tinha alvo de 24 px; o selo ganhou tratamento para data e fuso inválidos, e "fechado" há mais de 24 h passou a dizer "há N dias".
- **Tarefa 3** (revisão de segurança): "esqueci a senha" não revela quem é cliente; "E-mail ou senha incorretos." só quando o login recusou a credencial; `senhaConfere` ganhou três respostas (confere, não confere, falhou); `exigirAdmin` respeita a troca pendente; a regra do aviso de troca ficou num lugar só.
- **Tarefa 4:** o WhatsApp virou link comum (sem `role="button"`); `?erro=__proto__` e parâmetro repetido na URL (`?next=a&next=b`) davam erro 500; o link "criar senha" só aparece para senha errada; o aviso recebe o foco; "Escolha a casa" respeita a troca pendente; o admin provisório usa `scheme-paper`.
- **Tarefa 5:** falha na leitura do sinal de vida virava "aguardando o 1º envio", o que é falso para quem envia há meses. Agora o selo diz "sem leitura agora" e o erro vai para o log. `exigirCasa` também em Hoje e Resultados.

**Desvios aceitos**
- `/auth/confirmar` redireciona com **endereço relativo**: o Next 16.4 troca `127.0.0.1` por `localhost` em `request.url`, e os cookies do login local são de `127.0.0.1`.
- O `proxy.ts` mantém o **endereço absoluto**, ao contrário do que a revisão pediu: o `Location` relativo vindo do proxy dá erro 500 no Next 16.4 (medido num `next dev` real). O próprio Next entrega o endereço ao navegador como relativo.
- O alvo de toque do olho da senha é um **pseudo-elemento de 44 px** (`after:-inset-[11px]`), e não um botão maior: vale a restrição global de 44 px.
- `react-is` 19 como dependência direta e `shadcn` em `devDependencies`, que o plano não previa. Com isso o `npm audit --omit=dev` fica sem achados.
- O **item 6 da revisão da Tarefa 3 foi desfeito** (`5166c96`): aceitar `same_password` no primeiro acesso deixava a pessoa ficar com a senha provisória.

**Decisões do controlador**
- Resposta de "esqueci a senha" igual para e-mail que existe ou não, inclusive no limite de envio por usuário. Isso contraria a §3 do desenho, que listava `over_email_send_rate_limit` entre as mensagens mostradas.
- O que a revisão apontou e não coube nesta etapa foi para `docs/divida-tecnica.md` (itens 23 a 36, e 37 a 45 depois da revisão final).

**Conferência no navegador (Tarefa 6, Passo 3)**

Feita no `food-dev` (`next dev`), sempre em `127.0.0.1`, com o banco local e o Mailpit. Larguras de 390 px (celular), 320 px (a tela mais apertada, o WhatsApp do acesso pendente) e 1280 px (computador), nos temas claro e escuro. O que passou:
- porteiro: sem login vai para `/entrar` com o `next`; senha errada mostra o link "Criar uma senha nova";
- primeiro acesso: força `/trocar-senha`, o endereço direto da casa volta para lá, e repetir a senha provisória é recusado;
- depois da troca: `/escolher-casa` (duas casas) e o Hoje, com moldura e selo;
- Ajustes: claro e escuro, celular e computador; a troca voluntária pede a senha atual e "Cancelar" volta; Sair volta para `/entrar`;
- "esqueci a senha": aviso com o foco no resultado, e-mail no Mailpit com `token_hash`, `/nova-senha`, `/escolher-casa`;
- admin: entra em `/admin` e abre a casa de outro (leitura);
- conta sem casa: `/acesso-pendente`, com o WhatsApp como link de 66 px de altura em 320 px, sem rolagem lateral, e sem conseguir abrir uma casa pelo endereço.

O item 7 do roteiro (opcional: rodar o gerador por um ciclo para o selo virar "atualizado há …") não tem registro de execução. A conta `sem-casa@teste.repply.local` ficou no banco local, sem efeito fora dele.

**Consertos que saíram da conferência**
- `da8a572`: formulário enviado antes de a página carregar fazia o envio nativo por GET e punha a senha na URL (histórico, registro do servidor e Referer). No desenvolvimento, a página nem carregava em `127.0.0.1`, porque o Next 16 bloqueava o `/_next/hmr` para essa origem. Conserto: `method="post"` nos quatro formulários de entrada, botão de enviar desligado até hidratar (`useHidratado`, em `components/forms/use-hidratado.ts`) e `allowedDevOrigins: ["127.0.0.1"]` no `next.config.ts`.
- `76fc6ff`: no cabeçalho do celular o selo quebrava em duas linhas e cortava o nome da casa. Agora usa o texto curto (`textoCurto`, em `lib/painel/selo.ts`), de uma linha, como na tela aprovada. O leitor de tela continua ouvindo a frase completa, e a barra lateral do computador mostra o texto completo.
- `c39795b`: o `next dev` imprimia no terminal os argumentos das funções do servidor, ou seja, o e-mail e a senha do login. `logging.serverFunctions: false` no `next.config.ts` desliga isso; o terminal passou a mostrar só `POST /entrar`.

**Revisão final (8222523..c39795b)**

Resultado: "com consertos", sem brecha de segurança. Saíram desta revisão:
- documentação: esta conferência e a regra do formulário com senha (`CLAUDE.md` §10 e `docs/arquitetura/seguranca-e-isolamento.md` §5);
- teste das guardas por casa em `tests/auth/sessao.test.ts` (`exigirCasa`: casa fora do login, casa suspensa para dono e para admin, troca pendente);
- comentário do `redirectTo` em `pedirNovaSenhaAction`, que falava do cookie do PKCE: o modelo do e-mail ignora o `redirectTo`;
- texto do selo curto na D-53 e em `recepcao-de-dados.md` §7;
- `docs/divida-tecnica.md`: itens 23 e 35 ampliados, itens novos (37 a 45) e o que bloqueia a etapa 4.

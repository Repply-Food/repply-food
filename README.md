# repply food.

**Sua casa, de onde você estiver.** O painel do dono de bar e restaurante: os números da casa no celular, quase em tempo real, vindos do sistema de caixa da SCC Software que o restaurante já usa.

> **Estado em 09/10/2026:** documentação e desenho prontos; **fundação em andamento**.

## Ordem de leitura

1. [`SPEC.md`](SPEC.md): o produto, quem usa, o escopo do MVP e os critérios de aceite.
2. [`docs/decisoes.md`](docs/decisoes.md): as decisões tomadas, com o porquê.
3. [`docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md`](docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md): o desenho técnico.
4. [`docs/telas/index.html`](docs/telas/index.html): as telas aprovadas (abra no navegador).
5. [`CLAUDE.md`](CLAUDE.md) e [`AGENTS.md`](AGENTS.md): as regras para quem programa, pessoa ou IA.

## Rodar localmente (fundação)

**Pré-requisitos:**
- **Node.js 22 ou mais novo.**
- **Rancher Desktop** (modo `dockerd`, Kubernetes desligado) para rodar o banco local do Supabase.
- **Supabase CLI** (via `npx supabase ...`).

**Passo a passo:**
```bash
# 1) Instalar dependências
npm i

# 2) Configurar variáveis
cp .env.example .env.local

# 3) Iniciar banco local
npx supabase start

# 4) Rodar em desenvolvimento
npm run dev
```

**Verificação obrigatória:**
```bash
npx tsc --noEmit  # tipos
npm run check     # Biome
npm run test      # Vitest
npm run build     # build
```

## Stack

| Camada | Escolha |
|---|---|
| Painel | Next.js + React + TypeScript, Tailwind 4, shadcn, Recharts |
| Banco, login, funções | Supabase: Postgres com RLS, Auth, Edge Functions, pg_cron |
| E-mail | Resend |
| Hospedagem (piloto) | Supabase Free + Vercel Hobby |

## Como os dados chegam

O sistema SCC envia as contas para a função `receber-envio` a cada ~5 minutos, com um token por restaurante. Um **gerador de dados fictícios** simula o envio pelo mesmo caminho enquanto a integração não existe.

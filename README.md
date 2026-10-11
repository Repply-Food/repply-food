# repply food.

**Sua casa, de onde você estiver.** O painel do dono de bar e restaurante: os números da casa no celular, quase em tempo real, vindos do sistema de caixa da SCC Software que o restaurante já usa.

> **Estado em 11/10/2026:** a fundação foi verificada localmente (banco, recepção, isolamento e build). As telas e o MVP ainda não foram implementados; o push desta verificação continua pendente.

## Ordem de leitura

1. [`SPEC.md`](SPEC.md): o produto, quem usa, o escopo do MVP e os critérios de aceite.
2. [`docs/decisoes.md`](docs/decisoes.md): as decisões tomadas, com o porquê.
3. [`docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md`](docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md): o desenho técnico.
4. [`docs/telas/index.html`](docs/telas/index.html): as telas aprovadas (abra no navegador).
5. [`CLAUDE.md`](CLAUDE.md) e [`AGENTS.md`](AGENTS.md): as regras para quem programa, pessoa ou IA.

## Rodar localmente (fundação)

**Pré-requisitos:**
- **Node.js 22 ou mais novo.**
- **Docker Engine** para rodar o banco local do Supabase (validado nesta máquina). O Rancher Desktop, em modo `dockerd` e com Kubernetes desligado, continua sendo alternativa.
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

### Testes reais locais

Os testes de recepção, isolamento e métricas usam o PostgreSQL local em `127.0.0.1:54322` e a API em `127.0.0.1:54321`; a suíte recusa outros endereços. Inicie o Supabase e mantenha a função em outro terminal:

```bash
npx supabase start
npx supabase functions serve receber-envio
```

Então rode `npm run test`. As fixtures criam IDs próprios e removem somente esses IDs ao final; não use `supabase db reset` nem apague a Casa de Demonstração para executar a suíte.

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

## Gerador de dados fictícios

Simula o SCC: gera meses de entradas realistas (almoço e jantar, pico de sexta e sábado, mesas abertas agora, contas esquecidas, descontos e garçons) e envia pelo **mesmo** `receber-envio` que o sistema real usa. Detalhes em `docs/arquitetura/recepcao-de-dados.md` §5 e no topo de `scripts/gerador-dados-ficticios.ts`.

**Pré-requisito:** um token próprio de restaurante de teste e o Supabase local rodando (`npx supabase start`). As telas de admin e login ainda não existem: o token da demonstração foi preparado diretamente no banco local e não deve ser reutilizado por outra pessoa ou ambiente.

```bash
node --env-file=.env.gerador.local --import tsx scripts/gerador-dados-ficticios.ts
```

O arquivo `.env.gerador.local` é ignorado pelo Git e guarda a URL local e o token do seu ambiente; crie-o localmente, sem colocar token real em exemplos ou no repositório. Para conferir apenas o envelope e o schema sem token nem envio HTTP, use `npm run gerador -- --dry-run`.

| Opção | O que faz |
|---|---|
| `SCC_URL` (env) | Endereço da função. Padrão: `http://127.0.0.1:54321/functions/v1/receber-envio` |
| `SCC_TOKEN` (env) | Token do restaurante de teste (obrigatório para enviar) |
| `--historico-dias <n>` | Dias de histórico simulados na carga inicial (padrão 75) |
| `--intervalo <s>` | Segundos entre ciclos (padrão 300; o servidor responde 429 abaixo de 20 s) |
| `--parar-apos <n>` | Para de enviar depois de n ciclos com 200 — demonstra o alarme de "parado" |
| `--dry-run` | Monta e valida os envelopes com o mesmo schema da função, sem enviar nada |

A carga inicial vai da data mais antiga até hoje em **janelas de 7 dias** (contrato §8); depois entram os ciclos de ~5 min. Se a resposta pedir `reenviar_desde`, o gerador refaz a carga a partir da data pedida.

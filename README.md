# repply food.

**Sua casa, de onde você estiver.** O painel do dono de bar e restaurante: os números da casa no celular, quase em tempo real, vindos do sistema de caixa da SCC Software que o restaurante já usa.

> **Estado em 08/10/2026:** documentação e desenho prontos; **ainda sem código**. O próximo passo é o plano de implementação da fundação (veja [`PROMPTS.md`](PROMPTS.md)).

## Ordem de leitura

1. [`SPEC.md`](SPEC.md): o produto, quem usa, o escopo do MVP e os critérios de aceite.
2. [`docs/decisoes.md`](docs/decisoes.md): as decisões tomadas, com o porquê.
3. [`docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md`](docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md): o desenho técnico.
4. [`docs/telas/index.html`](docs/telas/index.html): as telas aprovadas (abra no navegador).
5. [`CLAUDE.md`](CLAUDE.md) e [`AGENTS.md`](AGENTS.md): as regras para quem programa, pessoa ou IA.

O índice completo da documentação está em [`docs/README.md`](docs/README.md).

## Stack

| Camada | Escolha |
|---|---|
| Painel | Next.js + React + TypeScript, Tailwind 4, shadcn, Recharts (base do Repply Imob) |
| Banco, login, funções | Supabase: Postgres com RLS, Auth, Edge Functions, pg_cron |
| E-mail | Resend |
| Hospedagem (piloto) | Supabase Free + Vercel Hobby. Infra paga no 1º cliente pagante ([`docs/operacao/migrar-para-pro.md`](docs/operacao/migrar-para-pro.md)) |
| Endereço | `food.repplyhub.com.br` |

## Como os dados chegam

O sistema SCC, no computador do restaurante, envia as contas para a função `receber-envio` a cada ~5 minutos, com um token por restaurante. Quem implementa o lado do SCC segue o [contrato de dados](docs/integracao-scc/contrato-de-dados.md). Enquanto o SCC não envia de verdade, um **gerador de dados fictícios** faz o papel dele pelo mesmo caminho.

## Rodar localmente

*Os comandos completos entram aqui quando o projeto tiver código.* Vai precisar de:
- **Node.js 22 ou mais novo.** Este computador usa o 24, que é LTS.
- **CLI do Supabase.** Por enquanto via `npx supabase …`. Quando houver `package.json`, ela entra como dependência de desenvolvimento e todos usam a mesma versão.
- **Docker Desktop**, para o banco local (`npx supabase start`), usado nos testes.
- Um `.env.local` a partir do [`.env.example`](.env.example).

**Ligar a pasta ao projeto do Supabase** (uma vez por computador):

```bash
npx supabase login                               # abre o navegador para autorizar
npx supabase link --project-ref <id-do-projeto>  # pede a senha do banco
```

## Quem é quem

| Pessoa | Papel |
|---|---|
| Lucas Ferreira | Dono do produto (Repply). Decide o escopo. Pede via IA, não programa |
| Lucas Duarte | Desenvolvedor (Repply) |
| Emerson (SCC) | Comercial da SCC Software |
| Pedro (SCC) | Desenvolvimento da SCC. Implementa o envio no sistema dos restaurantes |

## Marca

Tudo da identidade visual está em [`identidade-visual/`](identidade-visual/README.md): brandbook, logos, ícones do app, fontes e o gerador que recria tudo. Os ícones que o app usa são copiados para `public/` na implementação.

---

*repply food. · Repply · Grupo MD*

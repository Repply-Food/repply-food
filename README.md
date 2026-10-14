# repply food.

**Sua casa, de onde você estiver.** O painel do dono de bar e restaurante: os números da casa no celular, quase em tempo real, vindos do sistema de caixa da SCC Software que o restaurante já usa.

> **Estado em 13/10/2026:** fundação/recepção **aprovada LOCALMENTE**, com revisão final concluída e verificação independente de tipos, lint, build e **198 testes em 13 arquivos**. Base visual verificada em **390 e 1280 px**, nos temas claro/escuro, ilhas paper/ink e estado vazio. Telas, login completo, PDF e alarme por e-mail não estão implementados. Não é aprovação do MVP, de produção ou de publicação.

> **Pendências externas:** auditoria de dependências de desenvolvimento e histórico de migrations locais aplicadas via `psql`, sem reparo silencioso. Push e publicação permanecem pendentes de autorização.

## Ordem de leitura

1. [`SPEC.md`](SPEC.md): o produto, quem usa, o escopo do MVP e os critérios de aceite.
2. [`docs/decisoes.md`](docs/decisoes.md): as decisões tomadas, com o porquê.
3. [`docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md`](docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md): o desenho técnico.
4. [`docs/telas/index.html`](docs/telas/index.html): as telas aprovadas (abra no navegador).
5. [`CLAUDE.md`](CLAUDE.md) e [`AGENTS.md`](AGENTS.md): as regras para quem programa, pessoa ou IA.

## Rodar localmente (fundação)

**Pré-requisitos:**
- **Node.js 22 ou mais novo.**
- **Contêineres:** Docker Engine (Linux) ou **Rancher Desktop** em modo `dockerd (moby)` com o Kubernetes desligado (Windows, D-49).
- **Supabase CLI** (via `npx supabase ...`).

**Passo a passo:**
```bash
# 1) Instalar dependências
npm i

# 2) Iniciar o banco local (a primeira vez aplica todas as migrations num banco vazio)
npx supabase start

# 3) Configurar variáveis: copie o exemplo e preencha com os valores de `npx supabase status`
cp .env.example .env.local

# 4) Rodar em desenvolvimento
npm run dev
```

O `.env.local` aponta **sempre** para o banco local. As chaves da nuvem ficam em `.env.nuvem.local`, que o git ignora e o Next.js não lê.

**Windows com o Rancher num HD (disco mecânico).** O banco funciona, mas o disco lento pede três cuidados:
- suba só o que os testes usam e dê mais tempo para o Postgres ficar pronto:
  `SUPABASE_DB_HEALTH_TIMEOUT=10m npx supabase start -x studio,logflare,vector,storage-api,imgproxy,realtime,mailpit,postgres-meta`;
- se o Docker não responder depois de abrir o Rancher (no registro `docker.log` aparece `timeout waiting for containerd to start`), religue só o serviço dele:
  `MSYS_NO_PATHCONV=1 wsl.exe -d rancher-desktop --exec /usr/local/bin/wsl-service docker restart`;
- download interrompido pode deixar imagem corrompida (erro `unable to find user` ou `exec format error`): apague a imagem com `docker image rm` e suba de novo.

### Testes reais locais

Os testes de recepção, isolamento, dia de operação e rotinas usam o PostgreSQL local em `127.0.0.1:54322` e a API em `127.0.0.1:54321`; não apontam para produção. Inicie o Supabase e mantenha a função em outro terminal (se já estiverem ativos, reutilize-os, sem reiniciar):

```bash
npx supabase start
npx supabase functions serve receber-envio
```

Antes da suíte, `curl --max-time 5 -o /dev/null -s -w '%{http_code}\n' http://127.0.0.1:54321/functions/v1/receber-envio` deve devolver **405** (GET não é permitido). Se devolver 503 durante uma recarga automática, espere e confira novamente com prazo limitado antes de iniciar cenários; não pule testes nem reinicie um runtime de outro operador.

Então rode `npm run test`. Os arquivos executam **em sequência**, com limites finitos por teste/hook; não rode duas suítes contra o mesmo banco simultaneamente. As fixtures usam IDs próprios, criação/limpeza transacionais e rollback quando há transação externa. Vigia/retenção globais ficam em rollback, sem persistir efeitos: a comparação de sinais usa uma trava curta com espera/execução limitadas, sem desligar o cron. Não use `supabase db reset`, limpeza por prefixo ou a Casa de Demonstração para executar a suíte.

Testes focados reproduzíveis:

```bash
npm run test -- tests/design-tokens.test.ts tests/brand-assets.test.ts
npm run test -- tests/gerar-tipos.test.ts
npm run test -- tests/rotinas/estados-retencao.test.ts
npm run test -- tests/gerador/algoritmo.test.ts
```

Os testes de tipos usam destinos temporários próprios e CLI controlada; os do gerador usam relógio/transporte controlados com piso de 20 s. Esses doubles não comprovam RLS: essa garantia vem das suítes HTTP/SQL reais separadas.

**Verificação obrigatória:**
```bash
npx tsc --noEmit  # tipos
npm run check     # Biome
npm run test      # Vitest
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 npm run build  # build de produção local
```

`NEXT_PUBLIC_APP_URL` é **obrigatória em produção, inclusive durante a build**. Na publicação futura, configure o endereço público correto; não use a URL local. A configuração recusa produção sem a variável, mesmo que o desenvolvimento local funcione.

### Tipos do banco

```bash
# Banco já ativo: leitura do esquema local, sem iniciar/parar Docker
npm run types -- --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
# Alternativa quando a CLI local está configurada
npm run types
```

O script Node gera em diretório temporário exclusivo junto ao destino, valida TypeScript/exportações `Database` e `Json`, compara a saída e só então substitui `types/database.types.ts` por rename atômico. Falha da CLI/saída vazia ou inválida preserva o destino; sucesso/falha limpa apenas o temporário próprio. Não edite tipos à mão, não aplique migrations para gerar tipos e não coloque credenciais remotas em comandos, logs ou exemplos.

### Base visual

`app/styles/tokens.css` separa primitivas aprovadas, semântica (`theme-light`/`theme-dark`, alias `dark`, ilhas `scheme-paper`/`scheme-ink`) e aliases de consumo (`--bg`, `--fg`, fontes/ações). Ilhas recalculam os aliases, independentemente do tema pai. `brand.css` contém consumidores reutilizáveis, não telas. Texto normal exige contraste 4.5:1, grande 3:1; ponto/logotipo decorativo não é texto. Botão laranja usa quase-preto também no hover, legenda usa cinzas aprovados com contraste e cor de dado acompanha texto/seta. Ícones em `public/` são cópias byte a byte de `identidade-visual/logos/app/`; fontes locais vêm de `identidade-visual/fontes/`.

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

**Envio real local:** exige token exclusivo de restaurante de teste, Supabase local ativo e o **fuso IANA do restaurante**, via `--fuso` ou `SCC_FUSO`. As telas de admin/login ainda não existem. Não use o token, o arquivo de configuração ou dados da Casa de Demonstração para testes/cargas.

```bash
# Só após autorização de carga, com arquivo próprio de configuração de teste
node --env-file=.env.gerador.teste.local --import tsx scripts/gerador-dados-ficticios.ts --fuso America/Fortaleza
```

O arquivo de configuração de teste deve ficar ignorado pelo Git, com `SCC_URL`, `SCC_TOKEN` e, se não usar a opção CLI, `SCC_FUSO`. Nunca copie o arquivo de outro operador nem coloque token real em exemplos/repositório. O fuso do host/navegador não substitui o fuso explícito do restaurante.

Sem token e **sem HTTP**, o dry-run declara o fuso fictício `America/Fortaleza` (ou usa o fuso informado), monta/valida os envelopes pelo schema canônico e limita abertura/saída à referência civil atual:

```bash
npm run gerador -- --dry-run --historico-dias 7
npm run gerador -- --dry-run --historico-dias 75
```

| Opção | O que faz |
|---|---|
| `SCC_URL` (env) | Endereço da função. Padrão: `http://127.0.0.1:54321/functions/v1/receber-envio` |
| `SCC_TOKEN` (env) | Token do restaurante de teste (obrigatório para enviar) |
| `--fuso <IANA>` / `SCC_FUSO` (env) | Fuso do restaurante, obrigatório em envio real; opção CLI tem precedência. Ex.: `America/Fortaleza` |
| `--historico-dias <n>` | Dias de histórico simulados na carga inicial (padrão 75) |
| `--intervalo <s>` | Segundos entre ciclos (padrão 300); toda tentativa HTTP respeita no mínimo 20 s, inclusive 413/retry/reenvio |
| `--parar-apos <n>` | Para de enviar depois de n ciclos com 200 — demonstra o alarme de "parado" |
| `--dry-run` | Monta e valida os envelopes com o mesmo schema da função, sem enviar nada |
| `--confirmo-nuvem` | Obrigatória quando `SCC_URL` não é desta máquina. Só com a autorização do Lucas Ferreira |

A carga inicial vai da data mais antiga até hoje em **janelas de 7 dias** (contrato §8); depois entram os ciclos de ~5 min. Se a resposta pedir `reenviar_desde`, o gerador refaz a carga a partir da data pedida.

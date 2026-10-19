# repply food.

**Sua casa, de onde você estiver.** O painel do dono de bar e restaurante: os números da casa no celular, quase em tempo real, vindos do sistema de caixa da SCC Software que o restaurante já usa.

> **Estado em 19/10/2026 — no ar.** O repply food. está **publicado e funcionando** em **[https://food.repplyhub.com.br](https://food.repplyhub.com.br)**: as **etapas 1 a 4a**. Até a 3 (fundação; entrar e moldura; admin da Repply) mais a **4a** (endurecimento: trava de tentativas de senha no banco, CSP que bloqueia com nonce, link de senha à prova de antivírus, e-mails com teste). Banco, login e a função que recebe os dados do SCC no **Supabase** (nuvem), o site na **Vercel** e os e-mails com a marca pela **Resend**. No admin: lista das casas com o estado do envio, cadastro e edição (horário com até dois turnos, fuso, CNPJ), token de envio, login do cliente com senha provisória, redefinir senha, pedir reenvio, suspender/reativar, histórico, e "ver o painel do cliente" em só leitura.
>
> **A etapa 5 (tela Hoje) está feita no código e testada** — os números do dia do restaurante: faturamento da casa comparado à média do mesmo dia da semana (com a curva "dia típico"), mesas abertas, pessoas na casa, contas abertas há mais de 4h, e a meta do mês com projeção, tudo com atualização automática a cada minuto. **Falta a conferência visual no navegador, enviar ao GitHub e republicar** na nuvem (a etapa 5 tem uma mudança no banco — as funções `metrica_*`). Depois vêm Ajustes (6), Resultados (7), PDF (8) e o alarme (9). A verificação (tipos, lint, testes e build) passa no Windows; ainda falta rodá-la numa máquina Linux (o ramo do teste de tipos que só vale no Linux nunca foi executado).

## Roteiro das etapas (plano do MVP)

| # | Etapa | Estado |
|---|---|---|
| 1 | Fundação (projeto, banco com RLS, recepção do SCC) | ✅ feito |
| 2 | Entrar e moldura do painel | ✅ feito |
| 3 | Admin da Repply (casas, token, login, situação, histórico) | ✅ feito |
| **4b** | **Primeira publicação na nuvem** (Supabase + Vercel + domínio + e-mails) | ✅ **no ar (16/10/2026)** |
| 4a | Endurecer o código para produção (trava de tentativas, CSP com nonce, link à prova de antivírus) | ✅ **no ar (19/10/2026)** |
| 5 | Hoje (os números do dia: faturamento × dia típico, mesas, contas esquecidas, meta) | 🟡 código feito e testado — **a conferir no navegador, enviar e republicar** |
| 6 | Ajustes e instalar no celular | ⬜ |
| 7 | Resultados (vendas, horários, equipe, descontos) | ⬜ |
| 8 | PDF | ⬜ |
| 9 | Alarme por e-mail (vigia) | ⬜ |
| 10 | Ensaio geral (pronto para demonstração) | ⬜ |
| 11 | Piloto com a SCC | ⬜ |

> **O que falta, em detalhe:** [`docs/divida-tecnica.md`](docs/divida-tecnica.md) e os planos em [`docs/superpowers/plans/`](docs/superpowers/plans/). **Como foi publicado:** [`docs/operacao/publicar.md`](docs/operacao/publicar.md).

## Ordem de leitura

1. [`SPEC.md`](SPEC.md): o produto, quem usa, o escopo do MVP e os critérios de aceite.
2. [`docs/decisoes.md`](docs/decisoes.md): as decisões tomadas, com o porquê.
3. [`docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md`](docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md): o desenho técnico.
4. [`docs/telas/index.html`](docs/telas/index.html): as telas aprovadas (abra no navegador).
5. [`CLAUDE.md`](CLAUDE.md) e [`AGENTS.md`](AGENTS.md): as regras para quem programa, pessoa ou IA.

## Rodar localmente

**Pré-requisitos:**
- **Node.js 22 ou mais novo.**
- **Contêineres:** Docker Engine (Linux) ou **Rancher Desktop** em modo `dockerd (moby)` com o Kubernetes desligado (Windows, D-49).
- **Supabase CLI:** já vem fixada no `package.json` (versão 2.120.0), então não há nada para instalar à parte. Chame-a com `npx supabase ...`.

**Passo a passo:**
```bash
# 1) Instalar dependências
npm i

# 2) Iniciar o banco local (a primeira vez aplica todas as migrations num banco vazio;
#    no Windows com HD, veja os cuidados abaixo)
npx supabase start

# 3) Configurar variáveis: copie o exemplo, sem sobrescrever um .env.local que já exista,
#    e preencha com os valores de `npx supabase status -o env` (tabela abaixo)
cp -n .env.example .env.local

# 4) Rodar em desenvolvimento (para entrar no painel, veja "Entrar no painel local" abaixo)
npm run dev
```

Valores do `npx supabase status -o env` e a variável do `.env.local` que recebe cada um:

| Valor do `status -o env` | Variável do `.env.local` |
|---|---|
| `API_URL` | `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_URL` (o mesmo valor nas duas) |
| `ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` (nunca com `NEXT_PUBLIC_`) |

O `.env.local` aponta **sempre** para o banco local. As chaves da nuvem ficam em `.env.nuvem.local`, que o git ignora e o Next.js não lê. O `cp -n` não sobrescreve: se o seu `.env.local` atual tiver chaves da nuvem (endereço com `supabase.co`), renomeie-o para `.env.nuvem.local` **antes** do passo 3.

> **A chave de serviço não fala com a nuvem no desenvolvimento.** `createServiceClient` recusa uma URL de nuvem fora de produção; a **única porta** para liberá-la é `PERMITIR_NUVEM_NO_DEV=1`, e só quando for mesmo necessário — nunca no `.env.local` do dia a dia.

**Windows, com ou sem HD.** Se a subida falhar nos contêineres `vector` ou `logflare`, rode `npx supabase stop` e depois `npx supabase start -x vector,logflare`.

**Windows com o Rancher num HD (disco mecânico).** O banco funciona, mas o disco lento pede três cuidados. Os comandos abaixo são do Git Bash:
- suba só o que os testes e o login usam (o Mailpit, a caixa de e-mail local, **fica de fora da lista `-x`**: o "esqueci a senha" precisa dele) e dê mais tempo para o Postgres ficar pronto:
  `SUPABASE_DB_HEALTH_TIMEOUT=10m npx supabase start -x studio,logflare,vector,storage-api,imgproxy,realtime,postgres-meta`;
- se o Docker não responder depois de abrir o Rancher (no registro `docker.log`, na pasta `%LOCALAPPDATA%\rancher-desktop\logs\`, aparece `timeout waiting for containerd to start`), religue só o serviço dele:
  `MSYS_NO_PATHCONV=1 wsl.exe -d rancher-desktop --exec /usr/local/bin/wsl-service docker restart`;
- download interrompido pode deixar imagem corrompida (erro `unable to find user` ou `exec format error`): apague a imagem com `docker image rm` e suba de novo.

### Entrar no painel local

Com o banco no ar (agora ele sobe junto com a caixa de e-mail, o Mailpit) e o `.env.local` preenchido:

```bash
# Cria as contas e as duas casas de teste no banco local (só aceita o banco local)
npm run local:acesso

# Painel em desenvolvimento
npm run dev
```

- Abra **`http://127.0.0.1:3000`**. É o `site_url` do login local, para onde o link do e-mail volta. `localhost` é **outra sessão**: o login de um endereço não vale no outro.
- `npm run local:acesso` cria a "Casa de Teste Local", uma segunda casa (para testar a escolha da casa), um login de dono com senha provisória e troca obrigatória, e um admin. As credenciais são valores de teste fixos, em `scripts/acesso-local.ts` (`ACESSO_LOCAL`). Rodar de novo não duplica nada.
- O e-mail de "esqueci a senha" não sai para a internet: cai na caixa de e-mail local, o Mailpit, em **`http://127.0.0.1:54324`**.
- **A trava de tentativas de senha vive no banco local** (tabela `tentativas_de_login`): 5 erros bloqueiam por um tempo que cresce, e o acerto zera. A rotina `rf-limpa-tentativas` limpa as linhas antigas à noite. Se um teste manual travar o login, espere o tempo passar ou apague a linha da tabela no banco local.
- **Cuidado ao commitar:** o `next dev` do Next 16.4 reescreve `AGENTS.md` e `next-env.d.ts`. Não commite essas mudanças: rode `git checkout -- AGENTS.md next-env.d.ts` antes do `git add`.

**O caminho pelo admin** (cadastrar uma casa nova e fazê-la receber dados, como a equipe Repply fará). O `npm run local:acesso` continua criando as contas de teste; este caminho cria uma casa a mais, só no banco local. Os comandos são do Git Bash.

1. Entre em `http://127.0.0.1:3000/entrar` com `admin@repply.local` (a senha está em `ACESSO_LOCAL`, em `scripts/acesso-local.ts`). O admin abre em `/admin`.
2. "+ Cadastrar restaurante": nome, fuso e um horário em que a casa esteja **aberta agora** (o vigia só acusa atraso dentro do horário). O CNPJ é opcional: deixe em branco, porque um CNPJ igual ao de algum teste faria a suíte falhar por duplicado.
3. No detalhe da casa, "Gerar token" e copie o token (ele aparece uma vez).
4. Com a função `receber-envio` no ar (`npx supabase functions serve receber-envio`, em outro terminal), mande dados fictícios com esse token:

   ```bash
   SCC_TOKEN=<token> npm run gerador -- --fuso America/Fortaleza --historico-dias 3 --parar-apos 1
   ```

5. O vigia roda a cada 5 minutos. Para não esperar, rode-o na hora e recarregue o admin:

   ```bash
   node --input-type=module -e "import pg from 'pg'; const c = new pg.Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres'); await c.connect(); await c.query('select public.atualizar_estados()'); await c.end();"
   ```

   A casa sai de "aguardando 1º envio" para "em dia", e "Últimos envios" mostra as contagens.
6. Para ver o que o dono vê, use "Ver o painel do cliente" (só leitura). Para entrar como dono, use "Criar login" no cartão "Acesso do cliente": a senha provisória aparece uma vez.

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

**Envio real local:** exige token exclusivo de restaurante de teste, Supabase local ativo e o **fuso IANA do restaurante**, via `--fuso` ou `SCC_FUSO`. O token sai do admin (veja "O caminho pelo admin", em "Entrar no painel local"). Não use o token, o arquivo de configuração ou dados da Casa de Demonstração para testes/cargas.

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

# Seis relatórios — plano 1: integração, banco e importador

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para executar tarefa por tarefa. Não iniciar execução durante o turno de planejamento; o usuário trocará o modelo. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** receber fotografias normalizadas dos seis relatórios, publicar só dados completos e carregar demonstração local sem aguardar novas respostas da SCC.

**Architecture:** endpoint independente `receber-relatorios`; staging privado por carga/página; publicação transacional por casa/relatório/dia/fonte; cache consultável com RLS e versão. A identidade de linha é a posição na fotografia, dispensando pressupor chaves do banco SCC.

**Tech Stack:** TypeScript, Zod, Supabase Edge Functions/Deno, PostgreSQL 17, Vitest e `tsx` existentes. Node >=22.

**Spec:** [desenho fechado para esta execução](../specs/2026-10-28-seis-relatorios-design.md); [contrato normativo](../../integracao-scc/contrato-relatorios-v1.md).

## Global Constraints

- Não modificar envelope, reconciliador, ritmo nem sinal de vida da integração existente de `entradas`.
- Sem dependência nova.
- Dados fictícios são marcados visivelmente em tela e PDF.
- Não coletar nome de cliente, RG, telefone, sexo individual, endereço, credor/devedor ou motivo/descrição livres nesta versão.
- Usar checkout existente; sem worktree sem pedido explícito. Sem publicação, acesso a produção ou execução dos anexos.
- Dinheiro/quantidade são textos decimais exatos; cálculos de relatório no Postgres, nunca `number`.
- Consultas locais e mocks não comprovam comportamento de um emissor SCC real; homologação posterior é separada.

## Preparação operacional

Ler `AGENTS.md`/`CLAUDE.md`; `git status --short` e HEAD. Preservar alterações existentes. Verificar Node/npm e dependências; `npm ci` apenas se necessário. Banco local: comandos README com Docker gerenciado. A indisponibilidade do download Supabase não bloqueia schemas/importador/UI, mas impede declarar testes SQL/HTTP passados. Nunca usar `supabase db reset` nem credenciais de produção para contornar isso.

Não pedir ao usuário outra decisão de arquitetura. As perguntas ao Pedro são backlog de homologação; não constituem tarefa 0 bloqueante. Executar a tarefa 1 agora e avançar.

## Tarefa 1 — contrato canônico e limites testados

**Files:** criar `supabase/functions/_shared/relatorios/{schemas,limites}.ts`, `lib/validators/relatorios.ts`; testar em `tests/relatorios/contrato.test.ts`, `tests/relatorios/fixtures.ts`.

**Interfaces produzidas:** `RELATORIOS`, `Relatorio`, `Manifesto`, `PedidoRelatorios`, seis tipos de linha exportados, `pedidoRelatoriosSchema`, `fotografiaSchema` (manifesto sem paginação + linhas para importador), `validarPedidoRelatorios(entrada:unknown)` como safeParse. Reexportar tipos do canônico para Node, sem duplicar schemas. `limites.ts` exporta `MAX_BYTES_PAGINA=1048576`, `MAX_LINHAS_PAGINA=500`, `MAX_PAGINAS=200`, `MAX_LINHAS_CARGA=100000`, `MAX_BYTES_CARGA=33554432`, `MAX_CARGAS_ABERTAS=10`.

- [ ] Criar fixture `paginaProdutos()` com o JSON fictício completo do contrato e teste vermelho:

```ts
import { expect, it } from 'vitest';
import { pedidoRelatoriosSchema } from '../../lib/validators/relatorios';
import { paginaProdutos } from './fixtures';
it('aceita fotografia fictícia e recusa dados pessoais inesperados', () => {
  const pedido = paginaProdutos();
  expect(pedidoRelatoriosSchema.safeParse(pedido).success).toBe(true);
  expect(pedidoRelatoriosSchema.safeParse({ ...pedido,
    linhas: [{ ...pedido.linhas[0], NomeCliente: 'Pessoa fictícia' }]
  }).success).toBe(false);
});
```

- [ ] Rodar `npm run test -- tests/relatorios/contrato.test.ts`; confirmar falha por módulo inexistente.
- [ ] Implementar union por ação e relatório. `.strict()` em todos os objetos aninhados; datas reais; timestamp com offset; enum de recursos permitido por relatório; contagens e células únicas; decimais preservados. Base de validação:

```ts
const decimal = z.string().regex(/^-?\d{1,14}(\.\d{1,6})?$/);
const codigo = z.string().min(1).max(80).regex(/^[A-Za-z0-9_.-]+$/);
const sequencia = z.string().regex(/^[1-9]\d{0,18}$/)
  .refine(v => BigInt(v) <= 9223372036854775807n);
```

`recursos` sem duplicatas e restritos: produtos pdv/grupo/garcom/mesa; comissão operador; caixa operador/tipo/categoria; auditoria operador/tipo; notas cliente; financeiro nenhum. Valor de caixa não negativo, nota não negativa; produtos/auditoria preservam sinal informado, sem estorno inferido. Rótulos recusam controles, não HTML executável.
- [ ] Acrescentar testes de todos os seis formatos, dia inexistente, lote fora do limite, dinheiro com expoente/sete casas, sequência grande como string, financeiro com público individual, célula duplicada e schema antigo de entradas. O antigo continua passando pela validação antiga.
- [ ] Rodar testes focados e `npx tsc --noEmit`; registrar resultado. Commit local explícito dos quatro grupos de arquivos, mensagem `Define contrato normalizado dos seis relatórios`.

## Tarefa 2 — tabelas isoladas e validação defensiva SQL

**Files:** criar migrations novas `*_relatorios_cache.sql`, `*_relatorios_validacao.sql`; `tests/isolamento/relatorios.test.ts`, `tests/relatorios/sql-helpers.ts`. Ampliar `tests/isolamento/todas-as-tabelas.test.ts`, `funcoes-fechadas.test.ts`, `rpc-privilegada.test.ts`.

**Consome:** schemas da tarefa 1. **Produz:** cinco tabelas abaixo e função privada `validar_linha_relatorio(p_relatorio text,p_linha jsonb) returns void`.

- [ ] Criar teste vermelho SQL com fixture A/B do helper existente. `sql-helpers.ts` exporta `publicarDireto(banco:Client, casa:string, pedido:PedidoRelatorios):Promise<unknown>` chamando as RPCs técnicas que a tarefa 3 criará; para esta tarefa testar inserts mínimos e SELECT como cada usuário. Não usar fixture real.
- [ ] Aplicar esquema da nova migration no banco local (sem reset). Definir exatamente as colunas abaixo; adaptar somente timestamps de migration ao HEAD atual:

```sql
create table public.relatorio_cargas (
  restaurante_id uuid not null references public.restaurantes(id),
  id uuid not null,
  relatorio text not null,
  dia_movimento date not null,
  fonte text not null check (fonte in ('historico','online')),
  sequencia bigint not null check (sequencia > 0),
  capturado_em timestamptz not null,
  natureza text not null check (natureza in ('scc','simulacao')),
  recursos text[] not null,
  total_paginas int not null check (total_paginas between 1 and 200),
  total_linhas int not null check (total_linhas between 0 and 100000),
  estado text not null check (estado in ('recebendo','publicada','substituida','expirada')),
  bytes_recebidos bigint not null default 0,
  revisao_publicada bigint,
  criada_em timestamptz not null default now(),
  publicada_em timestamptz,
  primary key(restaurante_id,id),
  unique(restaurante_id,relatorio,dia_movimento,fonte,sequencia),
  check (relatorio in ('financeiro','produtos','comissao','caixa','auditoria','notas-assinadas'))
);
create table public.relatorio_paginas (
  restaurante_id uuid not null, carga_id uuid not null,
  numero int not null check (numero between 1 and 200),
  dados jsonb, hash text not null, quantidade int not null,
  bytes int not null,
  primary key(restaurante_id,carga_id,numero),
  foreign key(restaurante_id,carga_id) references public.relatorio_cargas(restaurante_id,id)
);
create table public.relatorio_versoes (
  restaurante_id uuid primary key references public.restaurantes(id),
  revisao bigint not null default 0
);
create table public.relatorio_publicacoes (
  restaurante_id uuid not null references public.restaurantes(id),
  relatorio text not null, dia_movimento date not null, fonte text not null,
  carga_id uuid not null, sequencia bigint not null,
  capturado_em timestamptz not null, publicada_em timestamptz not null default now(),
  natureza text not null, recursos text[] not null, quantidade int not null,
  primary key(restaurante_id,relatorio,dia_movimento,fonte),
  foreign key(restaurante_id,carga_id) references public.relatorio_cargas(restaurante_id,id)
);
create table public.relatorio_linhas (
  restaurante_id uuid not null, relatorio text not null,
  dia_movimento date not null, fonte text not null,
  posicao int not null, dados jsonb not null,
  primary key(restaurante_id,relatorio,dia_movimento,fonte,posicao),
  foreign key(restaurante_id,relatorio,dia_movimento,fonte)
    references public.relatorio_publicacoes(restaurante_id,relatorio,dia_movimento,fonte)
);
```

Acrescentar constraints correspondentes do contrato também em publicações/páginas (relatório/fonte/natureza válidos, quantidade não negativa, bytes até limites e recursos aceitos). Índices: publicações/linhas já têm prefixo casa+relatório+dia+fonte; acrescentar `(restaurante_id,relatorio,fonte,dia_movimento)` nas duas para consulta de intervalo; cargas por estado/criada_em para expiração. Não indexar todo JSON indiscriminadamente.
- [ ] RLS nas cinco; nenhum SELECT/INSERT/UPDATE/DELETE para cliente nas duas técnicas. Nas outras três, SELECT com `tem_acesso(restaurante_id) or eh_admin_repply()` e nenhum write direto de `authenticated`/`anon`. Reutilizar trigger `freeze_restaurante_id` onde aplicável. Revogar privilégios padrão excessivos; service_role tem o mínimo para RPCs técnicas. Não usar `FORCE ROW LEVEL SECURITY`.
- [ ] `validar_linha_relatorio`: listas fechadas de chaves por relatório, inclusive subobjetos financeiros; checar tipos/campos obrigatórios e expressão decimal antes de cast, limites e enums. Rejeitar dado pessoal desconhecido mesmo se RPC técnica for chamada diretamente. Não salvar erro com linha bruta. Regras canônicas iguais às da tarefa 1, cobertas por casos compartilhados.
- [ ] Testar A não lê B, anônimo não lê nada, admin lê o cache, nenhum deles lê staging/escreve cache; cliente não muda `restaurante_id`; `relatorio_publicacoes` vazia confirmada existe mesmo com zero linhas. Executar testes focados e os testes de grants atualizados. Commit `Cria cache isolado dos relatórios`.

## Tarefa 3 — receber páginas e publicar de forma atômica

**Files:** nova migration `*_relatorios_ingestao.sql`; `tests/relatorios/ingestao-sql.test.ts`, `tests/relatorios/concorrencia.test.ts`.

**Interfaces técnicas:** somente `service_role`, funções `security definer` com search_path fixo, verificações de casa, lock e sem dados retornados de outra casa:

```text
receber_pagina_relatorio(p_restaurante_id uuid,p_pedido jsonb) returns jsonb
publicar_relatorio(p_restaurante_id uuid,p_carga_id uuid) returns jsonb
limpar_cargas_relatorio() returns jsonb
```

- [ ] Escrever teste vermelho: duas páginas, publicação antes da segunda falha; o cache anterior permanece; depois publicar contém ambas; repetir não incrementa versão.
- [ ] Implementar recebimento: lock `pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text,0))`; validar manifesto e cada linha; limitar dez cargas abertas. Reusar ID só com manifesto idêntico. Hash SHA256 via extensão pgcrypto disponível, e igualdade de `jsonb` em retry enquanto conteúdo existir. Para recibo já limpo, comparar hash. Recomputar tamanho UTF-8 do JSON normalizado no banco e limitar bytes acumulados. Mesmo número/conteúdo não incrementa contagens; divergência gera SQLSTATE customizado e código curto `pagina_conflitante`.
- [ ] Implementar publicação sob o mesmo lock. Conferir `count(paginas)=N`, números 1..N, `sum(quantidade)=total_linhas`, limite acumulado e sequência. Caso financeira, número total de linhas deve ser 0 ou 1. Revalidar linhas antes de publicar. Esqueleto da substituição, com escopo da carga selecionado em `c`:

```sql
delete from public.relatorio_linhas
where restaurante_id=c.restaurante_id and relatorio=c.relatorio
  and dia_movimento=c.dia_movimento and fonte=c.fonte;
-- upsert da publicação do escopo com manifesto da carga
insert into public.relatorio_linhas
  (restaurante_id,relatorio,dia_movimento,fonte,posicao,dados)
select c.restaurante_id,c.relatorio,c.dia_movimento,c.fonte,
       (p.numero-1)*500 + x.ord::int, x.linha
from public.relatorio_paginas p
cross join lateral jsonb_array_elements(p.dados) with ordinality x(linha,ord)
where p.restaurante_id=c.restaurante_id and p.carga_id=c.id;
```

O upsert da publicação precisa ocorrer antes do INSERT das linhas pela FK; DELETE/metadata/INSERT/revisão/status são a mesma transação. Guardar recibo com revisão convertida para texto na resposta. Carga substituída nunca volta a ser ativa num retry. Fotografia vazia publica metadata e remove só linhas derivadas daquele escopo; não apaga contas ou fonte oposta.
- [ ] Incrementar `relatorio_versoes` uma vez por publicação nova. Zerar `dados` de páginas publicadas ao fim, mantendo hashes e contagens; não zerar antes do INSERT. `limpar_cargas_relatorio` expira páginas/cargas incompletas após 24 h e remove só recibos sem referência ativa após sete dias; preservar metadata referenciada por `relatorio_publicacoes`. Criar cron com padrão já usado no projeto, sem alterar jobs atuais. Função deve ser segura para rodar duas vezes.
- [ ] Testar retry, duas cargas concorrentes, sequência antiga, manifesto alterado, escopo B, vazio explícito, páginas fora de ordem, duplicatas legítimas de auditoria, expiração sem remover cache e separação online/histórico. Usar duas conexões pg para concorrência verdadeira. Rodar suite SQL e commit `Publica fotografias completas dos relatórios`.

## Tarefa 4 — endpoint limitado e autenticação

**Files:** criar `supabase/functions/receber-relatorios/{index.ts,deno.json}`; `supabase/functions/_shared/relatorios/{http,autenticacao}.ts`; modificar `supabase/config.toml`; testes `tests/relatorios/http.test.ts`, `endpoint-local.test.ts`.

**Consome:** tarefa 1 e RPCs técnicas. **Produz:** POST do contrato, sem afetar endpoint antigo.

- [ ] Testar helper puro `lerJsonLimitado(req:Request,maxBytes:number):Promise<unknown>`: aceita JSON pequeno, recusa stream em dois chunks acima do limite sem consumir resto; JSON inválido retorna erro curto. Implementar com `req.body.getReader()`, soma `byteLength`, `reader.cancel()` ao exceder e `TextDecoder` com flush; não confiar só em Content-Length.
- [ ] Verificar método POST, limitar corpo, extrair Bearer e consultar SHA256 em `tokens_envio` usando regras atuais de expiração/revogação. Não atualizar `sinal_de_vida`. Schema estrito antes da RPC. Simulação só com env local explícita. RPC recebe casa derivada do token.
- [ ] Traduzir erros para respostas do contrato, sem imprimir request/SQL/token/nome. Limite de requisições: não reutilizar contador v1; página repetida válida permitida, quotas de carga controladas no banco. `GET`=405. `verify_jwt=false` intencional com comentário, pois o token é validado no handler. `deno.json` fixa as mesmas versões de Supabase/Zod dos handlers existentes.
- [ ] Testar HTTP real local: token errado=401; página=200; publicação incompleta=422; conflito=409; corpo grande=413; simulação não liberada=422; status original das contas preservado. Não classificar testes HTTP sem função local servida como passados. Commit `Recebe páginas de relatórios pela função dedicada`.

## Tarefa 5 — importador e massa fictícia de ponta a ponta

**Files:** criar `scripts/importar-relatorios.ts`, `scripts/gerar-relatorios-ficticios.ts`, `scripts/relatorios/{fragmentar,enviar,amostra}.ts`; `tests/relatorios/importador.test.ts`; `docs/integracao-scc/importar-relatorios-local.md`. Nenhum arquivo real do cliente é copiado.

**Interfaces:** `fragmentarFotografia(fotografia:Fotografia):PedidoRelatorios[]`; `enviarFotografia(fotografia:Fotografia,transporte:(p:PedidoRelatorios)=>Promise<Response>):Promise<void>`; `criarAmostras():Fotografia[]` produz dois dias fixos fictícios e seis relatórios.

- [ ] Teste vermelho com 501 linhas: fragmentação gera 500+1 e publicação final, quantidade total intacta. Testar limite de bytes sem cortar JSON; linha grande isolada falha; transporte 409 não avança; retry mantém UUID/ordem/conteúdo.
- [ ] Implementar algoritmo guloso: acrescentar linha, medir `TextEncoder(JSON.stringify(pagina))`, fechar antes de exceder byte/500; recalcular manifesto total_paginas final e revalidar bytes. Se crescimento do manifesto estourar uma página, recompor com margem e conferir todas as páginas antes do envio. Não criar carga parcialmente enviada só para depois descobrir excesso de 32 MiB.
- [ ] CLI `node --import tsx scripts/gerar-relatorios-ficticios.ts --saida /tmp/food-relatorios.json`; saída local contém somente fantasia. CLI de validação `node --import tsx scripts/importar-relatorios.ts --arquivo /tmp/food-relatorios.json --dry-run` não acessa rede nem exige token; imprime só contagem de relatórios/linhas/páginas.
- [ ] Envio com `RF_RELATORIOS_URL=http://127.0.0.1:54321/functions/v1/receber-relatorios` e `RF_RELATORIOS_TOKEN` em arquivo ignorado. CLI recusa URL não loopback e nunca imprime token. Não passar token como argumento de shell, não usar token da casa de demonstração.
- [ ] Massa traz Produtos `16.25`/`4.00` e outra linha `5.00`/custo null; Comissão operador A `80.00`/`6.40`, B `20.00`/null; Caixa crédito `50.00`, débito `12.50`; Notas `12.25` e `7.75` na mesma entrada; Auditoria cinco tipos, incluindo duas ocorrências iguais; Financeiro números fictícios e campos null. Criar dia vazio explícito e período parcial como arquivos/cenários separados, sem misturar na mesma amostra o objetivo de cobertura completa.
- [ ] Documentar importação, serving local com `RF_PERMITIR_SIMULACAO=1`, casa/token próprios e repetição idempotente. Rodar importador duas vezes no local: segunda não altera versão/contagens. Commit `Adiciona importação e demonstração fictícia dos relatórios`.

## Conclusão do plano 1

- [ ] Regenerar tipos do banco local com o script do projeto após aplicar migrations; revisar diff. Não usar tipos inventados para esconder erro RPC.
- [ ] Executar schemas, SQL, RLS, HTTP e importador. Registrar passes/falhas reais.
- [ ] Seguir automaticamente para o [plano 2](2026-10-28-seis-relatorios-02-consultas.md). Respostas ao Pedro não bloqueiam o início do plano 2 sobre a massa normalizada.

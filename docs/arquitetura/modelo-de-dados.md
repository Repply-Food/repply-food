# Modelo de dados

*Desenho aprovado na descoberta (Parte 3, D-01, D-10, D-21, D-29). O SQL abaixo é a **referência** para escrever as migrations. Ele ainda não é migration: tabelas novas nascem por migration, com RLS no mesmo arquivo (ver [`seguranca-e-isolamento.md`](seguranca-e-isolamento.md)).*

## Princípios

- **Um banco para todos os restaurantes.** Toda tabela de dado de restaurante tem `restaurante_id`.
- **Chave do que vem do SCC = (restaurante_id, código original).** O código do SCC é guardado intacto, sem renumerar nada (D-01).
- **Nomes do domínio em português**, como no SCC e na tela: `restaurantes`, `entradas`, `faturamento_da_casa`.
- **Nada do SCC é apagado de verdade.** Entrada que some vira `removida_em`.
- **Dinheiro em `numeric(12,2)`. Momentos em `timestamptz`**, convertidos do horário local do restaurante na recepção.

## Tabelas

### `restaurantes`

```sql
create table public.restaurantes (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text not null unique,                 -- usado na URL: /r/bar-do-ze/hoje
  nome                     text not null,
  cnpj                     text unique,                          -- cadastro, NÃO é login (D-11)
  fuso                     text not null default 'America/Fortaleza',
  hora_virada              time not null default '05:00',        -- início do dia de operação (B6)
  horario_funcionamento    jsonb not null default '[]',          -- [{ "dia": 5, "abre": "11:00", "fecha": "02:00" }, ...] (0 = domingo)
  turnos                   jsonb not null default '{"almoco_ate": "17:00"}',
  limite_conta_esquecida   interval not null default '4 hours',  -- M04
  intervalo_envio_segundos int not null default 300,             -- devolvido ao SCC em proximo_envio_em_segundos
  pedido_reenvio_desde     date,                                 -- "recomeçar do zero" (contrato §8)
  situacao                 text not null default 'ativo' check (situacao in ('ativo','suspenso')),
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now()
);
```

- Escreve: só o admin. A exceção são os `turnos`, que o cliente edita em Ajustes (D-35).
- `situacao = 'suspenso'` bloqueia o **painel**, mas **não** a recepção: os dados continuam chegando para não haver buraco se o cliente voltar.
- Se `hora_virada` ou `fuso` mudar, o `dia_operacao` das entradas precisa ser recalculado. Isso é uma ação do admin, que chama `recalcular_dia_operacao(restaurante_id)`.

### `acessos`

```sql
create table public.acessos (
  user_id        uuid not null references auth.users(id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  criado_em      timestamptz not null default now(),
  primary key (user_id, restaurante_id)
);
```

- Na prática é um login por restaurante (D-10), mas o modelo aceita N:N: o dono com duas casas usa um login só.
- O aviso de "precisa trocar a senha" **não fica aqui**. Ele fica em `auth.users.raw_app_meta_data.precisa_trocar_senha`, que só o servidor escreve (D-11).

### `admins_repply`

```sql
create table public.admins_repply (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);
```

Quem está aqui entra no `/admin`. "Admin Repply" é um tipo de usuário da plataforma, não um cargo dentro do restaurante (D-32).

### `tokens_envio`

```sql
create table public.tokens_envio (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  hash           text not null unique,        -- SHA-256 do token; o token em si nunca é guardado
  prefixo        text not null,               -- ex.: 'rf_8f3k', para reconhecer no admin
  criado_em      timestamptz not null default now(),
  criado_por     uuid references auth.users(id),
  ultimo_uso_em  timestamptz,
  expira_em      timestamptz,                 -- usado na troca "em 24h" (D-38)
  revogado_em    timestamptz
);
```

- Token: `rf_` + 32 caracteres aleatórios. Ele é mostrado **uma única vez**, na criação.
- **Token válido** = `revogado_em is null and (expira_em is null or expira_em > now())`.
- Na troca de token, o antigo recebe `revogado_em = now()` (padrão) ou `expira_em = now() + 24h`.

### `envios`

```sql
create table public.envios (
  id             bigint generated always as identity primary key,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  recebido_em    timestamptz not null default now(),
  http_status    int not null,
  modo           text,
  versao_formato int,
  versao_scc     text,
  janela_desde   date,
  janela_ate     date,
  recebidas      int, gravadas int, inalteradas int, removidas int,
  erro           text,                        -- mensagem curta, sem dado pessoal
  payload        jsonb,                       -- JSON original já sem os campos pessoais
  campos_desconhecidos text[] not null default '{}', -- nomes (nunca valores) de campos fora da lista (D-51)
  duracao_ms     int
);
create index envios_restaurante_recebido_idx on public.envios (restaurante_id, recebido_em desc);
```

- **Retenção** (rotina diária no pg_cron):
  - `payload = null` em envios `200` com mais de **48 h**;
  - `payload = null` em envios com erro com mais de **90 dias**.
- O resumo de cada envio fica guardado. Revisar quando a tabela passar de 1 GB.

### `sinal_de_vida`

```sql
create table public.sinal_de_vida (
  restaurante_id     uuid primary key references public.restaurantes(id) on delete cascade,
  primeiro_envio_em  timestamptz,
  ultimo_envio_em    timestamptz,
  ultimo_envio_ok_em timestamptz,
  ultimo_erro_em     timestamptz,
  estado             text not null default 'aguardando'
                     check (estado in ('aguardando','em_dia','atrasado','parado','fechado')),
  estado_desde       timestamptz not null default now(),
  alarme_enviado_em  timestamptz                 -- um e-mail por incidente
);
```

### `entradas`

```sql
create table public.entradas (
  restaurante_id           uuid not null references public.restaurantes(id) on delete cascade,
  cod_entrada              bigint not null,                -- codEntrada do SCC
  cod_cartao_mesa          int,
  cod_garcom               int,
  cod_cliente              int,
  cod_operador_abertura    int,
  cod_operador_fechamento  int,
  aberta_em                timestamptz not null,
  fechada_em               timestamptz,                    -- null = aberta
  dia_operacao             date not null,                  -- data(aberta_em local − hora_virada)
  valor_itens              numeric(12,2) not null default 0,
  valor_descontos          numeric(12,2) not null default 0,
  valor_acrescimos         numeric(12,2) not null default 0,
  taxa_servico             numeric(12,2) not null default 0,
  complemento              numeric(12,2) not null default 0,
  valor_consumido          numeric(12,2) not null,
  pago                     boolean not null,
  numero_ocupantes         int,
  tipo_ocupacao            text,
  tipo_cartao              text,
  extras                   jsonb not null default '{}',    -- Flyer, ECF, CER, COO, Reabilitado... (H3, B17)
  hash_origem              text not null,                  -- se o envio repetir igual, não regrava
  removida_em              timestamptz,                    -- sumiu da janela do SCC
  recebida_em              timestamptz not null default now(),
  atualizada_em            timestamptz not null default now(),
  primary key (restaurante_id, cod_entrada)
);
create index entradas_dia_idx     on public.entradas (restaurante_id, dia_operacao) where removida_em is null;
create index entradas_abertas_idx on public.entradas (restaurante_id) where fechada_em is null and removida_em is null;
```

- **Nunca guardados:** nome, RG, telefone e sexo do cliente do restaurante (D-29). A recepção descarta esses campos antes de gravar.
- **Volume esperado:**
  - piloto: ~55 mil linhas por ano por restaurante;
  - escala: 50 restaurantes dão ~1–2 GB por ano.

### `metas`

```sql
create table public.metas (
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  mes            date not null check (extract(day from mes) = 1),  -- primeiro dia do mês
  valor          numeric(12,2) not null check (valor > 0),
  atualizado_em  timestamptz not null default now(),
  primary key (restaurante_id, mes)
);
```

- O cliente escreve em Ajustes (D-35).
- Quando o mês vira sem meta nova, vale a do mês anterior. A tela já mostra o valor herdado, mas só grava quando o dono confirma.

## Gatilhos obrigatórios (padrão do Imob)

- `set_updated_at`, em toda tabela com `atualizado_em` ou `atualizada_em`.
- `restaurante_id` imutável. Um trigger recusa `update` que mude o restaurante de uma linha. É a mesma proteção do `freeze_org_and_creator` do Imob.

## Funções

| Função | Para quê |
|---|---|
| `tem_acesso(restaurante_id)` | O login atual vê este restaurante? (está em `acessos` ou em `admins_repply`) |
| `eh_admin_repply()` | O login atual é admin da Repply? |
| `processar_envio(restaurante_id, envelope, campos_desconhecidos)` | Toda a gravação de um envio numa transação só; grava apenas os campos da lista do contrato (ver [`recepcao-de-dados.md`](recepcao-de-dados.md)) |
| `so_valor_simples(valor)` | Devolve o valor só se for texto, número, booleano ou null |
| `atualizar_estados()` | O vigia: calcula o estado de cada restaurante (pg_cron a cada 5 min). Não envia alarme |
| `aberto_desde(horario, fuso, agora)` | Desde quando a casa está aberta sem interrupção; `null` se fechada |
| `abertura_do_intervalo(horario, fuso, momento)` | Abertura do intervalo de funcionamento que contém o momento |
| `recalcular_dia_operacao(restaurante_id)` | Quando a virada ou o fuso mudarem |
| `atualizar_turnos(restaurante_id, turnos)` | A única escrita do cliente em `restaurantes`: confere o acesso e muda só os turnos (D-35) |
| `metrica_*` | Uma função por métrica de [`../metricas.md`](../metricas.md), sempre recebendo `restaurante_id` e o período |

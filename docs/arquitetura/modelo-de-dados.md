# Modelo de dados

*Desenho aprovado na descoberta (Parte 3, D-01, D-10, D-21, D-29). O SQL abaixo é a **referência** para escrever as migrations. Ele ainda não é migration: tabelas novas nascem por migration, com RLS no mesmo arquivo (ver [`seguranca-e-isolamento.md`](seguranca-e-isolamento.md)).*

## Princípios

- **Um banco para todos os restaurantes.** Toda tabela de dado de restaurante tem `restaurante_id`.
- **Chave do que vem do SCC = (restaurante_id, código original).** O código do SCC é guardado intacto, sem renumerar nada (D-01).
- **Nomes do domínio em português**, como no SCC e na tela: `restaurantes`, `entradas`, `faturamento_da_casa`.
- **Nada do SCC é apagado de verdade.** Entrada que some vira `removida_em`.
- **Dinheiro em `numeric(12,2)`. Momentos em `timestamptz`**, convertidos do horário local do restaurante na recepção.

## Tabelas

São **10 tabelas** e uma visão (`restaurantes_no_admin`, a lista do admin).

### `restaurantes`

```sql
create table public.restaurantes (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text not null unique,                 -- usado na URL: /r/bar-do-ze/hoje
  nome                     text not null,
  cnpj                     text unique,                          -- opcional, conferido (D-60); cadastro, NÃO é login (D-11)
  fuso                     text not null default 'America/Fortaleza',
  hora_virada              time not null default '05:00',        -- início do dia de operação (B6)
  horario_funcionamento    jsonb not null default '[]',          -- [{ "dia": 5, "abre": "11:00", "fecha": "02:00" }, ...] (0 = domingo); até dois por dia (D-56)
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
- Se `hora_virada` ou `fuso` mudar, o `dia_operacao` das entradas precisa ser recalculado. Isso é uma ação do admin, que chama `recalcular_dia_operacao(restaurante_id)` (a edição do restaurante faz isso sozinha).
- Mudar o `fuso` **não corrige as horas** das contas já recebidas: elas foram convertidas com o fuso antigo. A tela de edição avisa para pedir um reenvio (dívida técnica, item 46).
- **O banco confere o cadastro** (migration `20261015120000`; o formulário do admin confere antes, com a mesma regra, e os testes comparam as duas):
  - `restaurantes_horario_funcionamento_valido`, pela função `horario_funcionamento_valido`:
    - lista de `{ dia, abre, fecha }`, com `dia` de 0 a 6 e horas no formato `HH:MM`;
    - `abre` diferente de `fecha`, no máximo **dois por dia** (D-56) e sem sobreposição no mesmo dia;
    - só o último do dia passa da meia-noite (`fecha` menor que `abre`);
    - **a lista vazia continua aceita**: existe em cadastros antigos e conta como "sempre aberta" (ver [`recepcao-de-dados.md`](recepcao-de-dados.md) §7). O formulário do admin exige pelo menos um dia aberto;
  - `restaurantes_fuso_do_brasil`: o `fuso` é um dos 16 fusos IANA do Brasil (a lista está em `lib/admin/fusos.ts`);
  - `restaurantes_cnpj_valido`, pela função `cnpj_valido`: o `cnpj` é nulo ou tem 14 caracteres, sem pontuação e em maiúsculas. Os 12 primeiros podem ter letras (CNPJ alfanumérico da Receita) e os 2 últimos são os dígitos verificadores. Todos os caracteres iguais não vale. Além disso, o CNPJ é único (D-60).

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
- **Ninguém escreve direto na tabela, nem o admin.** A troca e a revogação passam só por `trocar_token_envio` e `revogar_tokens_envio`, que rodam numa transação, travam a linha do restaurante e gravam o histórico (`registro_admin`) junto. Trocar com "24 h" nunca estica o prazo de um token que já está saindo. O admin só lê a tabela (a tela nunca pede o `hash`).

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
  payload        jsonb,                       -- remontado só com os campos da lista do contrato (D-51), nunca o JSON original
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
  alarme_enviado_em  timestamptz                 -- parada confirmada; limpa após a volta confirmada
);
```

### `incidentes_sinal` e `alertas_sinal`

O alarme é uma caixa de saída interna: clientes e admin não têm política nem
privilégio para ler ou escrever essas tabelas. `incidentes_sinal` representa
um ciclo de parada de uma casa e há, pelo índice parcial, no máximo um aberto
por restaurante. `alertas_sinal` guarda uma linha para `parado` e outra para
`voltou` (`unique (incidente_id, tipo)`), com os estados `pendente`,
`em_transito`, `enviado` ou `cancelado`.

O alerta só fica `enviado` depois de a rotina ler a resposta HTTP real do
pg_net. A tabela guarda somente IDs, instantes, tentativas e código curto de
erro — nunca conteúdo do SCC, destinatário, token, senha, segredo ou resposta
do provedor.

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

### `registro_admin`

O histórico das ações do admin em cada restaurante (D-59). Migration `20261015120000`, com o endurecimento de `20261015130000`.

```sql
create table public.registro_admin (
  id             bigint generated always as identity primary key,
  criado_em      timestamptz not null default now(),
  autor          uuid references auth.users (id) on delete set null,  -- o admin; se a conta sair, o histórico fica
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  acao           text not null check (acao in (
                   'cadastrou', 'editou_dados', 'gerou_token', 'revogou_token',
                   'criou_login', 'ligou_login', 'redefiniu_senha', 'trocou_email',
                   'pediu_reenvio', 'suspendeu', 'reativou', 'abriu_painel')),
  detalhe        text check (detalhe is null or char_length(detalhe) <= 200)
);
create index registro_admin_restaurante_idx on public.registro_admin (restaurante_id, criado_em desc);

-- "abriu o painel do cliente": no máximo uma vez por hora, por admin e casa
create unique index registro_admin_abriu_painel_por_hora
  on public.registro_admin (autor, restaurante_id, date_trunc('hour', criado_em, 'UTC'))
  where acao = 'abriu_painel';
```

- **Sem senha, sem token e sem e-mail completo** no `detalhe` (texto curto, até 200 caracteres). Os e-mails entram mascarados.
- **RLS:** só o admin lê (`eh_admin_repply()`) e só registra em nome próprio (`autor = auth.uid()`). **Não há política de `update` nem de `delete`:** ninguém altera nem apaga, nem o admin. O dono não vê o histórico.
- **Privilégios:** o admin insere só `autor`, `restaurante_id`, `acao` e `detalhe`. O `id` e a hora (`criado_em`) são do banco, para o admin não escolher a hora do próprio registro e driblar o limite de "abriu o painel" por hora. A chave de serviço também não altera nem apaga (sem `UPDATE`, `DELETE` e `TRUNCATE`). Apagar o restaurante leva o histórico junto (`on delete cascade`).
- Quem grava: as funções do servidor do admin (`lib/admin/registro.ts`) e, no banco, `trocar_token_envio` e `revogar_tokens_envio`, na mesma transação da troca.
- O gatilho `freeze_restaurante_id` impede mudar a casa de uma linha.

### `tentativas_de_login`

A trava de tentativas de senha por e-mail (D-64, dívida 23). Migration `20261015140000`. **Segunda camada** além do limite do Supabase Auth (D-52), que na Vercel vê o endereço do servidor, não o de quem tenta.

```sql
create table public.tentativas_de_login (
  email         text primary key,          -- normalizado (lower(btrim))
  tentativas    int not null default 0,
  bloqueado_ate timestamptz,
  atualizado_em timestamptz not null default now()
);
```

- **Só a chave de serviço** lê e escreve, pelas funções `registrar_tentativa_errada`, `limpar_tentativas` e `login_bloqueado` (`security definer`, `set row_security = off`). A RLS está ligada e `anon`/`authenticated` ficam sem nenhum privilégio: a tabela é fechada de vez, não é da RLS.
- Opera sobre a **string do e-mail, exista ele ou não**, para não revelar quem é cliente. Bloqueia a partir do 5º erro, com recuo que cresce (15 min, 30, 60, …, teto de 24 h); o acerto zera.
- A rotina `rf-limpa-tentativas` (pg_cron, diária) apaga as linhas antigas.
- *(A migration comenta "D-62" pela numeração do plano; a decisão virou **D-64** — ver [`../decisoes.md`](../decisoes.md).)*

### Visão `restaurantes_no_admin`

A lista do admin: restaurante, estado do vigia e a versão do SCC do último envio. É uma visão com **`security_invoker`**: a RLS das tabelas vale para quem consulta, então o admin lê todas as casas e o dono lê só a dele (sem a versão do SCC, porque `envios` é só do admin).

```sql
create view public.restaurantes_no_admin with (security_invoker = true) as
select r.id, r.slug, r.nome, r.situacao, r.fuso,
       s.estado, s.ultimo_envio_ok_em,
       ultimo.versao_scc            -- versão do SCC do último envio que a informou
  from public.restaurantes r
  left join public.sinal_de_vida s on s.restaurante_id = r.id
  left join lateral (
    select e.versao_scc from public.envios e
     where e.restaurante_id = r.id and e.versao_scc is not null
     order by e.recebido_em desc limit 1
  ) as ultimo on true;
```

Só `authenticated` lê (`SELECT`); `anon` não tem nada nela.

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
| `horario_funcionamento_valido(horario)` | Confere o horário de funcionamento (até dois por dia, D-56). Roda dentro da restrição de `restaurantes`, por isso o `authenticated` pode executá-la. Pura: não lê tabela |
| `cnpj_valido(cnpj)` | Confere o CNPJ, numérico ou alfanumérico, com os dígitos verificadores (D-60). Mesma situação da anterior |
| `trocar_token_envio(restaurante, hash, prefixo, antigo)` | Admin. Troca o token numa transação: o antigo para agora (`'agora'`) ou em 24 h (`'24h'`), o novo entra e o histórico é gravado. Devolve o id do token novo e quantos antigos saíram |
| `revogar_tokens_envio(restaurante)` | Admin. Revoga todos os tokens válidos da casa e grava o histórico. Zero tokens é erro, não sucesso |
| `id_do_login_por_email(email)` | **Só a chave de serviço.** Acha a conta no Auth pelo e-mail, sem listar todas; devolve nulo se não houver |
| `encerrar_sessoes_do_login(user_id)` | **Só a chave de serviço.** Apaga as sessões do login (desconecta os aparelhos, em "Redefinir senha"). Zero é normal |
| `metrica_*` | Uma função por métrica de [`../metricas.md`](../metricas.md), sempre recebendo `restaurante_id` e o período |
